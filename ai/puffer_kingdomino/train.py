"""Train a small masked policy network for 2-player Kingdomino.

This is the first real Torch checkpoint path. It uses the native env when
available and trains by imitating the native greedy expert. That is deliberately
less ambitious than full PPO, but it gives us a train/eval/export loop with the
same observation and legal-mask contract that PPO will use next.
"""

from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

from .core import KingdominoEnv, random_legal_action
from .policy import DEFAULT_HIDDEN_SIZE, MaskedMLPPolicy, observation_vector, save_checkpoint

try:
    from .native import NativeKingdominoEnv
except ImportError:  # pragma: no cover - extension intentionally optional
    NativeKingdominoEnv = None


def _make_env(seed: int, native: bool = True):
    if native and NativeKingdominoEnv is not None:
        return NativeKingdominoEnv(seed=seed)
    return KingdominoEnv(seed=seed)


def _expert_action(env, player: int = 0) -> int:
    if hasattr(env, "greedy_action"):
        return int(env.greedy_action(player))
    from .core import greedy_policy_action

    return greedy_policy_action(env, player=player)


def _advance_opponent(env, rng: random.Random, opponent: str) -> None:
    guard = 0
    while not env.done and env.current_player == 1 and guard < 128:
        if opponent == "greedy":
            action = _expert_action(env, player=1)
            if hasattr(env, "step_known_legal"):
                _obs, _reward, _done, info = env.step_known_legal(action, observe=False)
            else:
                _obs, _reward, _done, info = env.step(action, observe=False)
        elif hasattr(env, "step_random_legal"):
            _obs, _reward, _done, info = env.step_random_legal(rng, observe=False)
        else:
            action = random_legal_action(env, rng)
            _obs, _reward, _done, info = env.step(action, observe=False)
        if "error" in info:
            raise RuntimeError(info["error"])
        guard += 1
    if guard >= 128:
        raise RuntimeError("opponent rollout exceeded guard")


def train(
    steps: int,
    seed: int,
    output: Path,
    hidden_size: int = DEFAULT_HIDDEN_SIZE,
    batch_size: int = 256,
    lr: float = 2.5e-4,
    opponent: str = "random",
    native: bool = True,
) -> dict:
    torch.manual_seed(seed)
    rng = random.Random(seed)
    env = _make_env(seed, native=native)
    model = MaskedMLPPolicy(hidden_size=hidden_size)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss()
    batch_obs = []
    batch_targets = []
    completed_games = 0
    updates = 0
    started = time.perf_counter()

    for step_index in range(max(0, steps)):
        if env.done:
            completed_games += 1
            env = _make_env((seed + completed_games) & 0xFFFFFFFF, native=native)

        _advance_opponent(env, rng, opponent)
        if env.done:
            continue

        target = _expert_action(env, player=0)
        batch_obs.append(observation_vector(env))
        batch_targets.append(target)

        if hasattr(env, "step_known_legal"):
            _obs, _reward, _done, info = env.step_known_legal(target, observe=False)
        else:
            _obs, _reward, _done, info = env.step(target, observe=False)
        if "error" in info:
            raise RuntimeError(info["error"])

        if len(batch_obs) >= batch_size:
            obs_tensor = torch.from_numpy(np.asarray(batch_obs, dtype=np.float32))
            target_tensor = torch.tensor(batch_targets, dtype=torch.long)
            logits = model(obs_tensor)
            loss = loss_fn(logits, target_tensor)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            batch_obs.clear()
            batch_targets.clear()
            updates += 1

    if batch_obs:
        obs_tensor = torch.from_numpy(np.asarray(batch_obs, dtype=np.float32))
        target_tensor = torch.tensor(batch_targets, dtype=torch.long)
        logits = model(obs_tensor)
        loss = loss_fn(logits, target_tensor)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        updates += 1

    elapsed = max(time.perf_counter() - started, 1e-9)
    metadata = {
        "backend": "torch-imitation-v0",
        "seed": seed,
        "requested_steps": steps,
        "sampled_steps": steps,
        "completed_games": completed_games,
        "updates": updates,
        "opponent": opponent,
        "native": bool(native and NativeKingdominoEnv is not None),
        "seconds": elapsed,
        "steps_per_second": steps / elapsed if steps else 0.0,
        "created_at": int(time.time()),
    }
    save_checkpoint(model, output, metadata)
    return {"policy": str(output), **metadata}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=1_000_000)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--output", default="ai/artifacts/latest.pt")
    parser.add_argument("--hidden-size", type=int, default=DEFAULT_HIDDEN_SIZE)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=2.5e-4)
    parser.add_argument("--opponent", choices=["random", "greedy"], default="random")
    parser.add_argument("--python-env", action="store_true", help="Use the Python env instead of the native extension")
    args = parser.parse_args()
    result = train(
        steps=args.steps,
        seed=args.seed,
        output=Path(args.output),
        hidden_size=args.hidden_size,
        batch_size=args.batch_size,
        lr=args.lr,
        opponent=args.opponent,
        native=not args.python_env,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
