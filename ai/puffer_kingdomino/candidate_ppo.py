"""Candidate-action PPO trainer for Kingdomino.

This is the first PPO path that optimizes over the current legal candidates
instead of the full flat action space. It can initialize from a distilled
candidate checkpoint and saves a normal candidate policy checkpoint for
`fair_eval`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import time
from typing import Sequence

import numpy as np
import torch
from torch import nn

from .agents import load_agent, make_env, step_legal
from .candidate_policy import (
    FEATURE_MODES,
    STATIC_FEATURE_MODE,
    CandidateScoringPolicy,
    InteractionCandidatePolicy,
    action_feature_table,
    candidate_feature_size,
    candidate_features_from_observations,
)
from .candidate_train import DEFAULT_MAX_CANDIDATES, _write_legal_actions
from .fair_eval import fair_evaluate
from .policy import DEFAULT_HIDDEN_SIZE, OBSERVATION_SIZE, OBS_SCALE, OBSERVATION_VERSION


class CandidateActorCritic(nn.Module):
    def __init__(
        self,
        hidden_size: int = DEFAULT_HIDDEN_SIZE,
        model_type: str = "dot",
        feature_mode: str = STATIC_FEATURE_MODE,
    ):
        super().__init__()
        self.hidden_size = hidden_size
        self.model_type = model_type
        self.feature_mode = feature_mode
        self.action_feature_size = candidate_feature_size(feature_mode)
        self.actor = (
            InteractionCandidatePolicy(hidden_size=hidden_size, action_feature_size=self.action_feature_size)
            if model_type == "interaction"
            else CandidateScoringPolicy(hidden_size=hidden_size, action_feature_size=self.action_feature_size)
        )
        self.value_input = nn.Linear(OBSERVATION_SIZE, hidden_size)
        self.value_output = nn.Linear(hidden_size, 1)

    def value(self, observations: torch.Tensor) -> torch.Tensor:
        hidden = torch.tanh(self.value_input(observations))
        return self.value_output(hidden).squeeze(-1)

    def forward(self, observations: torch.Tensor, candidate_features: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        return self.actor(observations, candidate_features), self.value(observations)


def _write_observation(env, out: np.ndarray) -> None:
    if hasattr(env, "write_observation_vector"):
        env.write_observation_vector(out, OBS_SCALE)
    else:
        out[:] = np.asarray(env.observe()["observation"], dtype=np.float32) / OBS_SCALE


def _candidate_feature_tensor(
    observations: np.ndarray,
    actions: np.ndarray,
    feature_mode: str,
    legal_mask: np.ndarray | None = None,
) -> torch.Tensor:
    return torch.from_numpy(candidate_features_from_observations(
        observations,
        actions,
        feature_mode=feature_mode,
        legal_mask=legal_mask,
    ))


def _score_margin(env, learner_player: int) -> float:
    scores = env.scores()
    return float(scores[learner_player] - scores[1 - learner_player])


def _terminal_reward(env, learner_player: int) -> float:
    if not env.done:
        return 0.0
    margin = _score_margin(env, learner_player)
    if margin > 0:
        return 1.0
    if margin < 0:
        return -1.0
    return 0.0


def _advance_to_learner(env, opponent, learner_player: int, max_steps: int = 128) -> int:
    steps = 0
    while not env.done and env.current_player is not None and env.current_player != learner_player:
        current = int(env.current_player)
        action = opponent.choose(env, current)
        _obs, _reward, _done, info = step_legal(env, action, observe=False)
        if "error" in info:
            raise RuntimeError(f"opponent produced illegal action: {info['error']}")
        steps += 1
        if steps > max_steps:
            raise RuntimeError("opponent rollout exceeded guard")
    return steps


def _infer_model_type(path: Path | None, requested: str) -> str:
    if requested != "auto":
        return requested
    if path is None:
        return "dot"
    try:
        payload = torch.load(path, map_location="cpu")
    except Exception:  # noqa: BLE001 - fallback to the historical candidate architecture.
        return "dot"
    return str(payload.get("model_type") or payload.get("metadata", {}).get("model_type", "dot"))


def _load_actor_init(model: CandidateActorCritic, path: Path | None) -> str | None:
    if path is None:
        return None
    try:
        payload = torch.load(path, map_location="cpu")
        if payload.get("format") != "kingdomino-candidate-policy-v0":
            return f"ignored unsupported init policy {path}: {payload.get('format')}"
        hidden_size = int(payload.get("metadata", {}).get("hidden_size", model.hidden_size))
        if hidden_size != model.hidden_size:
            return f"ignored init policy {path}: hidden size {hidden_size} != {model.hidden_size}"
        observation_version = int(payload.get("metadata", {}).get("observation_version", 1))
        if observation_version != OBSERVATION_VERSION:
            return f"ignored init policy {path}: observation version {observation_version} != {OBSERVATION_VERSION}"
        payload_model_type = str(payload.get("model_type") or payload.get("metadata", {}).get("model_type", "dot"))
        if payload_model_type != model.model_type:
            return f"ignored init policy {path}: model type {payload_model_type} != {model.model_type}"
        payload_feature_mode = str(payload.get("feature_mode") or payload.get("metadata", {}).get("feature_mode", STATIC_FEATURE_MODE))
        if payload_feature_mode != model.feature_mode:
            return f"ignored init policy {path}: feature mode {payload_feature_mode} != {model.feature_mode}"
        model.actor.load_state_dict(payload["state_dict"])
    except Exception as exc:  # noqa: BLE001 - smoke/training CLI should report and continue.
        return f"ignored init policy {path}: {exc}"
    return f"initialized actor from {path}"


def _load_anchor_model(
    *,
    path: Path | None,
    hidden_size: int,
    model_type: str,
    feature_mode: str,
) -> tuple[CandidateActorCritic | None, str | None]:
    if path is None:
        return None, None
    anchor = CandidateActorCritic(
        hidden_size=hidden_size,
        model_type=model_type,
        feature_mode=feature_mode,
    )
    status = _load_actor_init(anchor, path)
    if not status or not status.startswith("initialized actor from "):
        raise ValueError(f"anchor policy could not be loaded: {status}")
    anchor.eval()
    for parameter in anchor.parameters():
        parameter.requires_grad_(False)
    return anchor, status


def _save_candidate_checkpoint(model: CandidateActorCritic, output: Path, metadata: dict) -> None:
    checkpoint_metadata = {
        **metadata,
        "hidden_size": model.hidden_size,
        "model_type": model.model_type,
        "feature_mode": model.feature_mode,
        "action_feature_size": model.action_feature_size,
        "observation_version": OBSERVATION_VERSION,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "format": "kingdomino-candidate-policy-v0",
            "hidden_size": model.hidden_size,
            "model_type": model.model_type,
            "feature_mode": model.feature_mode,
            "action_feature_size": model.action_feature_size,
            "state_dict": model.actor.state_dict(),
            "metadata": checkpoint_metadata,
        },
        output,
    )


def _select_opponent(opponents: Sequence[object], sample_index: int, total_steps: int):
    if len(opponents) == 1:
        return opponents[0]
    stage = int((sample_index / max(1, total_steps)) * len(opponents))
    return opponents[min(len(opponents) - 1, max(0, stage))]


def _bootstrap_value(
    model: CandidateActorCritic,
    env,
    learner_player: int,
    obs_buffer: np.ndarray,
) -> float:
    if env.done or env.current_player is None or int(env.current_player) != learner_player:
        return 0.0
    _write_observation(env, obs_buffer)
    with torch.no_grad():
        return float(model.value(torch.from_numpy(obs_buffer.copy()).unsqueeze(0)).item())


def _gae_returns(
    samples: list[dict],
    *,
    bootstrap_value: float,
    gamma: float,
    gae_lambda: float,
) -> tuple[np.ndarray, np.ndarray]:
    rewards = [sample["reward"] for sample in samples]
    dones = [sample["done"] for sample in samples]
    values = np.asarray([sample["value"] for sample in samples], dtype=np.float32)
    advantages = np.zeros((len(samples),), dtype=np.float32)
    last_gae = 0.0
    next_value = bootstrap_value
    for index in range(len(samples) - 1, -1, -1):
        nonterminal = 0.0 if dones[index] else 1.0
        delta = rewards[index] + gamma * next_value * nonterminal - values[index]
        last_gae = delta + gamma * gae_lambda * nonterminal * last_gae
        advantages[index] = last_gae
        next_value = float(values[index])
    returns = advantages + values
    if len(advantages) > 1:
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)
    return returns.astype(np.float32), advantages.astype(np.float32)


def _evaluate_checkpoint(
    policy_path: Path,
    *,
    eval_games: int,
    eval_seed: int,
    eval_opponents: Sequence[str],
    opponent_policy: Path | None,
) -> dict:
    evaluations = {}
    for opponent in eval_opponents:
        evaluations[opponent] = fair_evaluate(
            policy_kind="candidate",
            policy=policy_path,
            opponent_kind=opponent,
            opponent_policy=opponent_policy if opponent in ("heuristic", "search") else None,
            pairs=max(0, eval_games // 2),
            seed=eval_seed,
        )
    return evaluations


def run_candidate_ppo(
    *,
    steps: int,
    seed: int,
    output: Path,
    init_policy: Path | None = None,
    opponent_kind: str = "heuristic",
    opponent_curriculum: Sequence[str] | None = None,
    opponent_policy: Path | None = Path("ai/artifacts/heuristic_policy.json"),
    hidden_size: int = DEFAULT_HIDDEN_SIZE,
    model_type: str = "dot",
    feature_mode: str = STATIC_FEATURE_MODE,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
    rollout_size: int = 1024,
    batch_size: int = 256,
    epochs: int = 2,
    lr: float = 1.0e-4,
    gamma: float = 0.99,
    gae_lambda: float = 0.95,
    clip_range: float = 0.2,
    entropy_coef: float = 0.005,
    value_coef: float = 0.5,
    anchor_policy: Path | None = None,
    anchor_kl_coef: float = 0.0,
    value_warmup_steps: int = 0,
    eval_every: int = 0,
    eval_games: int = 200,
    eval_seed: int = 456,
    eval_opponents: Sequence[str] = ("random", "greedy"),
    best_output: Path | None = None,
    report: Path | None = None,
    native: bool = True,
) -> dict:
    started = time.perf_counter()
    torch.manual_seed(seed)
    resolved_model_type = _infer_model_type(init_policy, model_type)
    model = CandidateActorCritic(hidden_size=hidden_size, model_type=resolved_model_type, feature_mode=feature_mode)
    init_status = _load_actor_init(model, init_policy)
    resolved_anchor_policy = anchor_policy if anchor_policy is not None else init_policy
    anchor_model, anchor_status = _load_anchor_model(
        path=resolved_anchor_policy if anchor_kl_coef > 0 else None,
        hidden_size=hidden_size,
        model_type=resolved_model_type,
        feature_mode=feature_mode,
    )
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    curriculum = list(opponent_curriculum) if opponent_curriculum else [opponent_kind]
    opponents = [
        load_agent(kind, policy=opponent_policy if kind in ("heuristic", "search") else None, seed=seed + 10_003 + index)
        for index, kind in enumerate(curriculum)
    ]
    action_features = torch.from_numpy(action_feature_table()) if feature_mode == STATIC_FEATURE_MODE else None
    env = make_env(seed, native=native)

    obs_buffer = np.empty((OBSERVATION_SIZE,), dtype=np.float32)
    legal_buffer = np.empty((max_candidates,), dtype=np.int32)
    samples = []
    collected_samples = 0
    completed_games = 0
    updates = 0
    illegal_actions = 0
    opponent_steps = 0
    learner_player = 0
    next_eval = eval_every if eval_every > 0 else None
    eval_history = []
    best_metric = -1_000_000_000.0
    best_result = None
    if best_output is None:
        best_output = output.with_name(f"{output.stem}_best{output.suffix}")

    while collected_samples < max(0, steps):
        if env.done:
            completed_games += 1
            env = make_env((seed + completed_games) & 0xFFFFFFFF, native=native)

        opponent = _select_opponent(opponents, collected_samples, steps)
        opponent_steps += _advance_to_learner(env, opponent, learner_player)
        if env.done or env.current_player is None:
            continue

        legal_count = _write_legal_actions(env, legal_buffer)
        if legal_count <= 0:
            raise RuntimeError("no legal actions available")
        if legal_count > max_candidates:
            raise RuntimeError(f"legal action count {legal_count} exceeds max_candidates {max_candidates}")
        _write_observation(env, obs_buffer)
        margin_before = _score_margin(env, learner_player)

        obs_tensor = torch.from_numpy(obs_buffer.copy()).unsqueeze(0)
        action_ids_np = legal_buffer[:legal_count].astype(np.int64, copy=False)
        action_ids = torch.from_numpy(action_ids_np).unsqueeze(0)
        candidate_features = (
            action_features[action_ids]
            if action_features is not None
            else _candidate_feature_tensor(obs_buffer, action_ids_np, feature_mode).unsqueeze(0)
        )
        logits, value = model(obs_tensor, candidate_features)
        distribution = torch.distributions.Categorical(logits=logits)
        action_index_tensor = distribution.sample()
        action_index = int(action_index_tensor.item())
        action = int(legal_buffer[action_index])
        old_logprob = float(distribution.log_prob(action_index_tensor).item())
        old_value = float(value.item())

        _obs, _reward, _done, info = step_legal(env, action, observe=False)
        if "error" in info:
            illegal_actions += 1
            raise RuntimeError(f"learner produced illegal action {action}: {info['error']}")
        if not env.done:
            opponent_steps += _advance_to_learner(env, opponent, learner_player)
        done = bool(env.done)
        margin_after = _score_margin(env, learner_player)
        reward = (margin_after - margin_before) / 100.0 + _terminal_reward(env, learner_player)

        sample_actions = np.zeros((max_candidates,), dtype=np.int32)
        sample_mask = np.zeros((max_candidates,), dtype=np.bool_)
        sample_actions[:legal_count] = legal_buffer[:legal_count]
        sample_mask[:legal_count] = True
        samples.append({
            "obs": obs_buffer.copy(),
            "legal_actions": sample_actions,
            "legal_mask": sample_mask,
            "action_index": action_index,
            "old_logprob": old_logprob,
            "value": old_value,
            "reward": float(reward),
            "done": done,
        })
        collected_samples += 1

        if done:
            completed_games += 1
            env = make_env((seed + completed_games) & 0xFFFFFFFF, native=native)

        if len(samples) >= rollout_size or collected_samples >= steps:
            bootstrap = _bootstrap_value(model, env, learner_player, obs_buffer)
            returns, advantages = _gae_returns(
                samples,
                bootstrap_value=bootstrap,
                gamma=gamma,
                gae_lambda=gae_lambda,
            )

            observations = torch.from_numpy(np.stack([sample["obs"] for sample in samples]).astype(np.float32))
            legal_actions = torch.from_numpy(np.stack([sample["legal_actions"] for sample in samples]).astype(np.int64))
            legal_mask = torch.from_numpy(np.stack([sample["legal_mask"] for sample in samples]).astype(np.bool_))
            action_indices = torch.tensor([sample["action_index"] for sample in samples], dtype=torch.int64)
            old_logprobs = torch.tensor([sample["old_logprob"] for sample in samples], dtype=torch.float32)
            returns_tensor = torch.from_numpy(returns)
            advantages_tensor = torch.from_numpy(advantages.astype(np.float32))
            value_only = collected_samples <= value_warmup_steps

            indices = np.arange(len(samples))
            for epoch in range(max(1, epochs)):
                shuffled = indices.copy()
                np.random.default_rng(seed + updates + epoch).shuffle(shuffled)
                for start in range(0, len(shuffled), batch_size):
                    batch = shuffled[start:start + batch_size]
                    batch_width = int(torch.sum(legal_mask[batch], dim=1).max().item())
                    batch_actions = legal_actions[batch, :batch_width]
                    batch_mask = legal_mask[batch, :batch_width]
                    batch_features = (
                        action_features[batch_actions]
                        if action_features is not None
                        else _candidate_feature_tensor(
                            observations[batch].numpy(),
                            batch_actions.numpy(),
                            feature_mode,
                            batch_mask.numpy(),
                        )
                    )
                    batch_logits, batch_values = model(observations[batch], batch_features)
                    batch_logits = batch_logits.masked_fill(~batch_mask, -1e9)
                    distribution = torch.distributions.Categorical(logits=batch_logits)
                    logprobs = distribution.log_prob(action_indices[batch])
                    entropy = distribution.entropy().mean()
                    ratio = torch.exp(logprobs - old_logprobs[batch])
                    unclipped = ratio * advantages_tensor[batch]
                    clipped = torch.clamp(ratio, 1.0 - clip_range, 1.0 + clip_range) * advantages_tensor[batch]
                    policy_loss = -torch.min(unclipped, clipped).mean()
                    value_loss = torch.nn.functional.mse_loss(batch_values, returns_tensor[batch])
                    anchor_kl = torch.tensor(0.0)
                    if anchor_model is not None and anchor_kl_coef > 0:
                        with torch.no_grad():
                            anchor_logits, _anchor_values = anchor_model(observations[batch], batch_features)
                            anchor_logits = anchor_logits.masked_fill(~batch_mask, -1e9)
                            anchor_distribution = torch.distributions.Categorical(logits=anchor_logits)
                        anchor_kl = torch.distributions.kl_divergence(distribution, anchor_distribution).mean()
                    loss = value_loss if value_only else policy_loss + value_coef * value_loss - entropy_coef * entropy
                    if not value_only and anchor_kl_coef > 0:
                        loss = loss + anchor_kl_coef * anchor_kl
                    optimizer.zero_grad(set_to_none=True)
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                    optimizer.step()
                    updates += 1
            samples.clear()

            if next_eval is not None and collected_samples >= next_eval:
                eval_metadata = {
                    "sampled_steps": collected_samples,
                    "updates": updates,
                    "completed_games": completed_games,
                    "opponent_curriculum": curriculum,
                }
                _save_candidate_checkpoint(model, output, eval_metadata)
                evaluations = _evaluate_checkpoint(
                    output,
                    eval_games=eval_games,
                    eval_seed=eval_seed,
                    eval_opponents=eval_opponents,
                    opponent_policy=opponent_policy,
                )
                greedy = evaluations.get("greedy")
                if greedy is not None:
                    metric = float(greedy["win_rate"]) * 1000.0 + float(greedy["score_margin"]["mean"])
                else:
                    first = next(iter(evaluations.values()))
                    metric = float(first["win_rate"]) * 1000.0 + float(first["score_margin"]["mean"])
                entry = {
                    "sampled_steps": collected_samples,
                    "updates": updates,
                    "completed_games": completed_games,
                    "metric": metric,
                    "evaluations": evaluations,
                }
                eval_history.append(entry)
                if metric > best_metric:
                    best_metric = metric
                    best_result = entry
                    shutil.copyfile(output, best_output)
                while next_eval is not None and next_eval <= collected_samples:
                    next_eval += eval_every

    elapsed = max(time.perf_counter() - started, 1e-9)
    metadata = {
        "backend": "torch-candidate-ppo-v0",
        "seed": seed,
        "requested_steps": steps,
        "sampled_steps": collected_samples,
        "completed_games": completed_games,
        "updates": updates,
        "opponent_steps": opponent_steps,
        "opponent_kind": opponent_kind,
        "opponent_curriculum": curriculum,
        "opponent_policy": str(opponent_policy) if opponent_policy else None,
        "init_policy": str(init_policy) if init_policy else None,
        "init_status": init_status,
        "anchor_policy": str(resolved_anchor_policy) if anchor_kl_coef > 0 and resolved_anchor_policy else None,
        "anchor_status": anchor_status,
        "anchor_kl_coef": anchor_kl_coef,
        "hidden_size": hidden_size,
        "model_type": resolved_model_type,
        "feature_mode": feature_mode,
        "action_feature_size": model.action_feature_size,
        "observation_version": OBSERVATION_VERSION,
        "max_candidates": max_candidates,
        "rollout_size": rollout_size,
        "batch_size": batch_size,
        "epochs": epochs,
        "lr": lr,
        "gamma": gamma,
        "gae_lambda": gae_lambda,
        "clip_range": clip_range,
        "entropy_coef": entropy_coef,
        "value_coef": value_coef,
        "value_warmup_steps": value_warmup_steps,
        "eval_every": eval_every,
        "eval_games": eval_games,
        "eval_seed": eval_seed,
        "eval_opponents": list(eval_opponents),
        "best_output": str(best_output),
        "best_result": best_result,
        "native": bool(native),
        "illegal_actions": illegal_actions,
        "seconds": elapsed,
        "steps_per_second": steps / elapsed if steps else 0.0,
        "created_at": int(time.time()),
    }
    _save_candidate_checkpoint(model, output, metadata)
    if best_result is None:
        shutil.copyfile(output, best_output)
    result = {"policy": str(output), "eval_history": eval_history, **metadata}
    if report is not None:
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--output", default="ai/artifacts/ppo_candidate.pt")
    parser.add_argument("--init-policy")
    parser.add_argument("--opponent-kind", default="heuristic", choices=["random", "greedy", "delta", "heuristic", "search"])
    parser.add_argument("--opponent-curriculum", nargs="+", choices=["random", "greedy", "delta", "heuristic", "search"])
    parser.add_argument("--opponent-policy", default="ai/artifacts/heuristic_policy.json")
    parser.add_argument("--hidden-size", type=int, default=DEFAULT_HIDDEN_SIZE)
    parser.add_argument("--model-type", choices=["dot", "interaction", "auto"], default="dot")
    parser.add_argument("--feature-mode", choices=FEATURE_MODES, default=STATIC_FEATURE_MODE)
    parser.add_argument("--max-candidates", type=int, default=DEFAULT_MAX_CANDIDATES)
    parser.add_argument("--rollout-size", type=int, default=1024)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--lr", type=float, default=1.0e-4)
    parser.add_argument("--gamma", type=float, default=0.99)
    parser.add_argument("--gae-lambda", type=float, default=0.95)
    parser.add_argument("--clip-range", type=float, default=0.2)
    parser.add_argument("--entropy-coef", type=float, default=0.005)
    parser.add_argument("--value-coef", type=float, default=0.5)
    parser.add_argument("--anchor-policy")
    parser.add_argument("--anchor-kl-coef", type=float, default=0.0)
    parser.add_argument("--value-warmup-steps", type=int, default=0)
    parser.add_argument("--eval-every", type=int, default=0)
    parser.add_argument("--eval-games", type=int, default=200)
    parser.add_argument("--eval-seed", type=int, default=456)
    parser.add_argument("--eval-opponents", nargs="+", choices=["random", "greedy", "delta", "heuristic"], default=["random", "greedy"])
    parser.add_argument("--best-output")
    parser.add_argument("--report")
    parser.add_argument("--python-env", action="store_true")
    args = parser.parse_args()
    print(json.dumps(run_candidate_ppo(
        steps=args.steps,
        seed=args.seed,
        output=Path(args.output),
        init_policy=Path(args.init_policy) if args.init_policy else None,
        opponent_kind=args.opponent_kind,
        opponent_curriculum=args.opponent_curriculum,
        opponent_policy=Path(args.opponent_policy) if args.opponent_policy else None,
        hidden_size=args.hidden_size,
        model_type=args.model_type,
        feature_mode=args.feature_mode,
        max_candidates=args.max_candidates,
        rollout_size=args.rollout_size,
        batch_size=args.batch_size,
        epochs=args.epochs,
        lr=args.lr,
        gamma=args.gamma,
        gae_lambda=args.gae_lambda,
        clip_range=args.clip_range,
        entropy_coef=args.entropy_coef,
        value_coef=args.value_coef,
        anchor_policy=Path(args.anchor_policy) if args.anchor_policy else None,
        anchor_kl_coef=args.anchor_kl_coef,
        value_warmup_steps=args.value_warmup_steps,
        eval_every=args.eval_every,
        eval_games=args.eval_games,
        eval_seed=args.eval_seed,
        eval_opponents=args.eval_opponents,
        best_output=Path(args.best_output) if args.best_output else None,
        report=Path(args.report) if args.report else None,
        native=not args.python_env,
    ), indent=2))


if __name__ == "__main__":
    main()
