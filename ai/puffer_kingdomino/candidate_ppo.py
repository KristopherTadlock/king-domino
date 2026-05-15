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
import time

import numpy as np
import torch
from torch import nn

from .agents import load_agent, make_env, step_legal
from .candidate_policy import CandidateScoringPolicy, action_feature_table
from .candidate_train import DEFAULT_MAX_CANDIDATES, _write_legal_actions
from .policy import DEFAULT_HIDDEN_SIZE, OBSERVATION_SIZE, OBS_SCALE


class CandidateActorCritic(nn.Module):
    def __init__(self, hidden_size: int = DEFAULT_HIDDEN_SIZE):
        super().__init__()
        self.hidden_size = hidden_size
        self.actor = CandidateScoringPolicy(hidden_size=hidden_size)
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
        model.actor.load_state_dict(payload["state_dict"])
    except Exception as exc:  # noqa: BLE001 - smoke/training CLI should report and continue.
        return f"ignored init policy {path}: {exc}"
    return f"initialized actor from {path}"


def _save_candidate_checkpoint(model: CandidateActorCritic, output: Path, metadata: dict) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "format": "kingdomino-candidate-policy-v0",
            "model_type": "dot",
            "state_dict": model.actor.state_dict(),
            "metadata": metadata,
        },
        output,
    )


def run_candidate_ppo(
    *,
    steps: int,
    seed: int,
    output: Path,
    init_policy: Path | None = None,
    opponent_kind: str = "heuristic",
    opponent_policy: Path | None = Path("ai/artifacts/heuristic_policy.json"),
    hidden_size: int = DEFAULT_HIDDEN_SIZE,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
    rollout_size: int = 1024,
    batch_size: int = 256,
    epochs: int = 2,
    lr: float = 1.0e-4,
    gamma: float = 0.99,
    clip_range: float = 0.2,
    entropy_coef: float = 0.005,
    value_coef: float = 0.5,
    native: bool = True,
) -> dict:
    started = time.perf_counter()
    torch.manual_seed(seed)
    model = CandidateActorCritic(hidden_size=hidden_size)
    init_status = _load_actor_init(model, init_policy)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    opponent = load_agent(opponent_kind, policy=opponent_policy, seed=seed + 10_003)
    action_features = torch.from_numpy(action_feature_table())
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

    while collected_samples < max(0, steps):
        if env.done:
            completed_games += 1
            env = make_env((seed + completed_games) & 0xFFFFFFFF, native=native)

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
        action_ids = torch.from_numpy(legal_buffer[:legal_count].astype(np.int64, copy=False)).unsqueeze(0)
        logits, value = model(obs_tensor, action_features[action_ids])
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
            rewards = [sample["reward"] for sample in samples]
            dones = [sample["done"] for sample in samples]
            returns = np.zeros((len(samples),), dtype=np.float32)
            running = 0.0
            for index in range(len(samples) - 1, -1, -1):
                if dones[index]:
                    running = 0.0
                running = rewards[index] + gamma * running
                returns[index] = running
            values = np.asarray([sample["value"] for sample in samples], dtype=np.float32)
            advantages = returns - values
            if len(advantages) > 1:
                advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

            observations = torch.from_numpy(np.stack([sample["obs"] for sample in samples]).astype(np.float32))
            legal_actions = torch.from_numpy(np.stack([sample["legal_actions"] for sample in samples]).astype(np.int64))
            legal_mask = torch.from_numpy(np.stack([sample["legal_mask"] for sample in samples]).astype(np.bool_))
            action_indices = torch.tensor([sample["action_index"] for sample in samples], dtype=torch.int64)
            old_logprobs = torch.tensor([sample["old_logprob"] for sample in samples], dtype=torch.float32)
            returns_tensor = torch.from_numpy(returns)
            advantages_tensor = torch.from_numpy(advantages.astype(np.float32))

            indices = np.arange(len(samples))
            for epoch in range(max(1, epochs)):
                shuffled = indices.copy()
                np.random.default_rng(seed + updates + epoch).shuffle(shuffled)
                for start in range(0, len(shuffled), batch_size):
                    batch = shuffled[start:start + batch_size]
                    batch_logits, batch_values = model(observations[batch], action_features[legal_actions[batch]])
                    batch_logits = batch_logits.masked_fill(~legal_mask[batch], -1e9)
                    distribution = torch.distributions.Categorical(logits=batch_logits)
                    logprobs = distribution.log_prob(action_indices[batch])
                    entropy = distribution.entropy().mean()
                    ratio = torch.exp(logprobs - old_logprobs[batch])
                    unclipped = ratio * advantages_tensor[batch]
                    clipped = torch.clamp(ratio, 1.0 - clip_range, 1.0 + clip_range) * advantages_tensor[batch]
                    policy_loss = -torch.min(unclipped, clipped).mean()
                    value_loss = torch.nn.functional.mse_loss(batch_values, returns_tensor[batch])
                    loss = policy_loss + value_coef * value_loss - entropy_coef * entropy
                    optimizer.zero_grad(set_to_none=True)
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                    optimizer.step()
                    updates += 1
            samples.clear()

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
        "opponent_policy": str(opponent_policy) if opponent_policy else None,
        "init_policy": str(init_policy) if init_policy else None,
        "init_status": init_status,
        "hidden_size": hidden_size,
        "max_candidates": max_candidates,
        "rollout_size": rollout_size,
        "batch_size": batch_size,
        "epochs": epochs,
        "lr": lr,
        "gamma": gamma,
        "clip_range": clip_range,
        "entropy_coef": entropy_coef,
        "value_coef": value_coef,
        "native": bool(native),
        "illegal_actions": illegal_actions,
        "seconds": elapsed,
        "steps_per_second": steps / elapsed if steps else 0.0,
        "created_at": int(time.time()),
    }
    _save_candidate_checkpoint(model, output, metadata)
    return {"policy": str(output), **metadata}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--output", default="ai/artifacts/ppo_candidate.pt")
    parser.add_argument("--init-policy")
    parser.add_argument("--opponent-kind", default="heuristic", choices=["random", "greedy", "delta", "heuristic", "search"])
    parser.add_argument("--opponent-policy", default="ai/artifacts/heuristic_policy.json")
    parser.add_argument("--hidden-size", type=int, default=DEFAULT_HIDDEN_SIZE)
    parser.add_argument("--max-candidates", type=int, default=DEFAULT_MAX_CANDIDATES)
    parser.add_argument("--rollout-size", type=int, default=1024)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--lr", type=float, default=1.0e-4)
    parser.add_argument("--gamma", type=float, default=0.99)
    parser.add_argument("--clip-range", type=float, default=0.2)
    parser.add_argument("--entropy-coef", type=float, default=0.005)
    parser.add_argument("--value-coef", type=float, default=0.5)
    parser.add_argument("--python-env", action="store_true")
    args = parser.parse_args()
    print(json.dumps(run_candidate_ppo(
        steps=args.steps,
        seed=args.seed,
        output=Path(args.output),
        init_policy=Path(args.init_policy) if args.init_policy else None,
        opponent_kind=args.opponent_kind,
        opponent_policy=Path(args.opponent_policy) if args.opponent_policy else None,
        hidden_size=args.hidden_size,
        max_candidates=args.max_candidates,
        rollout_size=args.rollout_size,
        batch_size=args.batch_size,
        epochs=args.epochs,
        lr=args.lr,
        gamma=args.gamma,
        clip_range=args.clip_range,
        entropy_coef=args.entropy_coef,
        value_coef=args.value_coef,
        native=not args.python_env,
    ), indent=2))


if __name__ == "__main__":
    main()
