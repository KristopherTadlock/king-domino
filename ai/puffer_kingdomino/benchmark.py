"""Compare Python and native Kingdomino rollout throughput."""

from __future__ import annotations

import argparse
import json
import random
import time
from typing import Callable

from .core import KingdominoEnv, random_legal_action

try:
    from .native import NativeKingdominoEnv
except ImportError:  # pragma: no cover - extension intentionally optional
    NativeKingdominoEnv = None


def _rollout_steps(env_factory: Callable[[int], object], steps: int, seed: int) -> dict:
    rng = random.Random(seed)
    env = env_factory(seed)
    completed_games = 0
    started = time.perf_counter()

    for step_index in range(steps):
        if env.done:
            completed_games += 1
            env = env_factory((seed + completed_games) & 0xFFFFFFFF)
        action = random_legal_action(env, rng)
        _obs, _reward, _done, info = env.step(action, observe=False)
        if "error" in info:
            raise RuntimeError(f"illegal rollout state at step {step_index}: {info['error']}")

    elapsed = max(time.perf_counter() - started, 1e-9)
    return {
        "steps": steps,
        "completed_games": completed_games,
        "seconds": elapsed,
        "steps_per_second": steps / elapsed,
    }


def run(steps: int, seed: int) -> dict:
    python_result = _rollout_steps(lambda s: KingdominoEnv(seed=s), steps, seed)
    if NativeKingdominoEnv is None:
        return {
            "steps": steps,
            "seed": seed,
            "python": python_result,
            "native": None,
            "speedup": None,
            "native_available": False,
        }

    native_result = _rollout_steps(lambda s: NativeKingdominoEnv(seed=s), steps, seed)
    return {
        "steps": steps,
        "seed": seed,
        "python": python_result,
        "native": native_result,
        "speedup": native_result["steps_per_second"] / python_result["steps_per_second"],
        "native_available": True,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()
    print(json.dumps(run(args.steps, args.seed), indent=2))


if __name__ == "__main__":
    main()
