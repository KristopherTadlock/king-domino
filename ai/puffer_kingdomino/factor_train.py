"""Train a prototype factorized action-head policy."""

from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

from .candidate_policy import FactorizedActionPolicy, action_part_table, factorized_candidate_logits
from .candidate_train import DEFAULT_MAX_CANDIDATES, _write_legal_actions
from .policy import OBSERVATION_SIZE, OBS_SCALE, OBSERVATION_VERSION
from .train import _advance_opponent, _expert_action, _make_env


@torch.no_grad()
def _choose_factorized_rollin_action(
    model,
    obs_row: np.ndarray,
    legal_actions: np.ndarray,
    legal_count: int,
    action_parts: torch.Tensor,
) -> int:
    obs_tensor = torch.from_numpy(obs_row).unsqueeze(0)
    action_tensor = torch.from_numpy(legal_actions[:legal_count].astype(np.int64, copy=False)).unsqueeze(0)
    logits = factorized_candidate_logits(model(obs_tensor), action_parts[action_tensor])
    index = int(torch.argmax(logits, dim=-1).item())
    return int(legal_actions[index])


def train_factorized(
    steps: int,
    seed: int,
    output: Path | None = None,
    hidden_size: int = 64,
    batch_size: int = 256,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
    lr: float = 2.5e-4,
    opponent: str = "random",
    expert: str = "greedy",
    native: bool = True,
    roll_in: str = "expert",
    expert_roll_in_prob: float = 0.25,
) -> dict:
    torch.manual_seed(seed)
    rng = random.Random(seed)
    env = _make_env(seed, native=native)
    model = FactorizedActionPolicy(hidden_size=hidden_size)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss()
    action_parts = torch.from_numpy(action_part_table())

    batch_obs = np.empty((batch_size, OBSERVATION_SIZE), dtype=np.float32)
    batch_actions = np.zeros((batch_size, max_candidates), dtype=np.int64)
    batch_mask = np.zeros((batch_size, max_candidates), dtype=np.bool_)
    batch_targets = np.zeros((batch_size,), dtype=np.int64)
    legal_buffer = np.empty((max_candidates,), dtype=np.int32)
    batch_count = 0
    batch_max_count = 0
    completed_games = 0
    updates = 0
    max_seen_candidates = 0
    started = time.perf_counter()

    for _step_index in range(max(0, steps)):
        if env.done:
            completed_games += 1
            env = _make_env((seed + completed_games) & 0xFFFFFFFF, native=native)

        _advance_opponent(env, rng, opponent)
        if env.done:
            continue

        target = _expert_action(env, player=0, expert=expert)
        legal_count = _write_legal_actions(env, legal_buffer)
        if legal_count > max_candidates:
            raise ValueError(f"legal action count {legal_count} exceeds max_candidates {max_candidates}")
        max_seen_candidates = max(max_seen_candidates, legal_count)

        target_indices = np.nonzero(legal_buffer[:legal_count] == target)[0]
        if len(target_indices) != 1:
            raise RuntimeError(f"expert target {target} not found in legal action list")

        if hasattr(env, "write_observation_vector"):
            env.write_observation_vector(batch_obs[batch_count], OBS_SCALE)
        else:
            from .policy import observation_vector

            batch_obs[batch_count, :] = observation_vector(env)

        batch_actions[batch_count, :legal_count] = legal_buffer[:legal_count]
        batch_mask[batch_count, :legal_count] = True
        batch_targets[batch_count] = int(target_indices[0])
        batch_count += 1
        batch_max_count = max(batch_max_count, legal_count)

        action = target
        if roll_in == "student" or (roll_in == "mixed" and rng.random() >= expert_roll_in_prob):
            action = _choose_factorized_rollin_action(
                model,
                batch_obs[batch_count - 1],
                legal_buffer,
                legal_count,
                action_parts,
            )

        if hasattr(env, "step_known_legal"):
            _obs, _reward, _done, info = env.step_known_legal(action, observe=False)
        else:
            _obs, _reward, _done, info = env.step(action, observe=False)
        if "error" in info:
            raise RuntimeError(info["error"])

        if batch_count >= batch_size:
            obs_tensor = torch.from_numpy(batch_obs)
            action_tensor = torch.from_numpy(batch_actions[:, :batch_max_count])
            mask_tensor = torch.from_numpy(batch_mask[:, :batch_max_count])
            target_tensor = torch.from_numpy(batch_targets)
            candidate_parts = action_parts[action_tensor]
            logits = factorized_candidate_logits(model(obs_tensor), candidate_parts).masked_fill(~mask_tensor, -1e9)
            loss = loss_fn(logits, target_tensor)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            batch_mask[:, :batch_max_count] = False
            batch_count = 0
            batch_max_count = 0
            updates += 1

    if batch_count:
        obs_tensor = torch.from_numpy(batch_obs[:batch_count])
        action_tensor = torch.from_numpy(batch_actions[:batch_count, :batch_max_count])
        mask_tensor = torch.from_numpy(batch_mask[:batch_count, :batch_max_count])
        target_tensor = torch.from_numpy(batch_targets[:batch_count])
        candidate_parts = action_parts[action_tensor]
        logits = factorized_candidate_logits(model(obs_tensor), candidate_parts).masked_fill(~mask_tensor, -1e9)
        loss = loss_fn(logits, target_tensor)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        updates += 1

    elapsed = max(time.perf_counter() - started, 1e-9)
    result = {
        "backend": "torch-factorized-imitation-v0",
        "seed": seed,
        "requested_steps": steps,
        "sampled_steps": steps,
        "completed_games": completed_games,
        "updates": updates,
        "opponent": opponent,
        "expert": expert,
        "native": bool(native),
        "hidden_size": hidden_size,
        "observation_version": OBSERVATION_VERSION,
        "roll_in": roll_in,
        "expert_roll_in_prob": expert_roll_in_prob,
        "seconds": elapsed,
        "steps_per_second": steps / elapsed if steps else 0.0,
        "max_seen_candidates": max_seen_candidates,
        "max_candidates": max_candidates,
        "output": str(output) if output else None,
    }

    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        torch.save(
            {
                "format": "kingdomino-factorized-policy-v0",
                "state_dict": model.state_dict(),
                "metadata": result,
            },
            output,
        )

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--output")
    parser.add_argument("--hidden-size", type=int, default=64)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--max-candidates", type=int, default=DEFAULT_MAX_CANDIDATES)
    parser.add_argument("--lr", type=float, default=2.5e-4)
    parser.add_argument("--opponent", choices=["random", "greedy", "delta"], default="random")
    parser.add_argument("--expert", choices=["greedy", "delta"], default="greedy")
    parser.add_argument("--python-env", action="store_true")
    parser.add_argument("--roll-in", choices=["expert", "student", "mixed"], default="expert")
    parser.add_argument("--expert-roll-in-prob", type=float, default=0.25)
    args = parser.parse_args()
    print(json.dumps(train_factorized(
        steps=args.steps,
        seed=args.seed,
        output=Path(args.output) if args.output else None,
        hidden_size=args.hidden_size,
        batch_size=args.batch_size,
        max_candidates=args.max_candidates,
        lr=args.lr,
        opponent=args.opponent,
        expert=args.expert,
        native=not args.python_env,
        roll_in=args.roll_in,
        expert_roll_in_prob=args.expert_roll_in_prob,
    ), indent=2))


if __name__ == "__main__":
    main()
