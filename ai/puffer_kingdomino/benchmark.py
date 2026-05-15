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


RECORDED_BASELINE_NATIVE_SPS = 31_088.902804516718


def _rollout_steps(env_factory: Callable[[int], object], steps: int, seed: int, optimized: bool = False) -> dict:
    rng = random.Random(seed)
    env = env_factory(seed)
    completed_games = 0
    started = time.perf_counter()

    for step_index in range(steps):
        if env.done:
            completed_games += 1
            env = env_factory((seed + completed_games) & 0xFFFFFFFF)
        if optimized and hasattr(env, "step_random_legal"):
            _obs, _reward, _done, info = env.step_random_legal(rng, observe=False)
        else:
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


def _vectorized_native_steps(steps: int, seed: int, env_count: int) -> dict | None:
    if NativeKingdominoEnv is None:
        return None
    rng = random.Random(seed)
    envs = [NativeKingdominoEnv(seed=(seed + index) & 0xFFFFFFFF) for index in range(env_count)]
    completed_games = 0
    started = time.perf_counter()
    for step_index in range(steps):
        env = envs[step_index % env_count]
        if env.done:
            completed_games += 1
            env = NativeKingdominoEnv(seed=(seed + completed_games + env_count) & 0xFFFFFFFF)
            envs[step_index % env_count] = env
        _obs, _reward, _done, info = env.step_random_legal(rng, observe=False)
        if "error" in info:
            raise RuntimeError(f"illegal vectorized rollout state at step {step_index}: {info['error']}")
    elapsed = max(time.perf_counter() - started, 1e-9)
    return {
        "steps": steps,
        "envs": env_count,
        "completed_games": completed_games,
        "seconds": elapsed,
        "steps_per_second": steps / elapsed,
    }


def _time_repeated(label: str, reps: int, fn) -> dict:
    started = time.perf_counter()
    for _ in range(reps):
        fn()
    elapsed = max(time.perf_counter() - started, 1e-9)
    return {
        "label": label,
        "calls": reps,
        "seconds": elapsed,
        "calls_per_second": reps / elapsed,
    }


def _profile_native(seed: int, reps: int = 10_000) -> dict | None:
    if NativeKingdominoEnv is None:
        return None
    rng = random.Random(seed)
    env = NativeKingdominoEnv(seed=seed)
    for _ in range(60):
        if env.done:
            break
        _obs, _reward, _done, info = env.step_random_legal(rng, observe=False)
        if "error" in info:
            raise RuntimeError(info["error"])

    profile = {
        "midgame_probe_after_steps": 60,
        "legal_action_count": _time_repeated("legal_action_count", reps, env.legal_action_count),
        "legal_actions_compat": _time_repeated("legal_actions", reps, env.legal_actions),
        "action_mask": _time_repeated("action_mask", reps, env.action_mask),
        "observe": _time_repeated("observe", reps, env.observe),
        "scores": _time_repeated("scores", reps, env.scores),
    }

    try:
        import torch

        from .policy import MaskedMLPPolicy, observation_vector

        model = MaskedMLPPolicy()
        obs = torch.from_numpy(observation_vector(env)).unsqueeze(0)
        profile["policy_forward"] = _time_repeated("policy_forward", min(reps, 2_000), lambda: model(obs))
    except Exception as exc:  # pragma: no cover - diagnostic only
        profile["policy_forward"] = {"error": str(exc)}

    return profile


def run(steps: int, seed: int, python_steps: int | None = None, envs: int = 64, profile: bool = True) -> dict:
    measured_python_steps = min(steps, python_steps if python_steps is not None else 10_000)
    python_result = _rollout_steps(lambda s: KingdominoEnv(seed=s), measured_python_steps, seed)
    if NativeKingdominoEnv is None:
        return {
            "steps": steps,
            "seed": seed,
            "python": python_result,
            "native": None,
            "native_compatibility": None,
            "native_vectorized": None,
            "profile": None,
            "speedup": None,
            "native_available": False,
        }

    native_compatibility = _rollout_steps(lambda s: NativeKingdominoEnv(seed=s), steps, seed, optimized=False)
    native_result = _rollout_steps(lambda s: NativeKingdominoEnv(seed=s), steps, seed, optimized=True)
    native_vectorized = _vectorized_native_steps(steps, seed, envs)
    return {
        "steps": steps,
        "seed": seed,
        "recorded_baseline_native_steps_per_second": RECORDED_BASELINE_NATIVE_SPS,
        "python": python_result,
        "native_compatibility": native_compatibility,
        "native": native_result,
        "native_vectorized": native_vectorized,
        "profile": _profile_native(seed) if profile else None,
        "speedup": native_result["steps_per_second"] / python_result["steps_per_second"],
        "optimized_vs_compatibility_speedup": (
            native_result["steps_per_second"] / native_compatibility["steps_per_second"]
        ),
        "optimized_vs_recorded_baseline_speedup": (
            native_result["steps_per_second"] / RECORDED_BASELINE_NATIVE_SPS
        ),
        "native_available": True,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--python-steps", type=int, default=10_000)
    parser.add_argument("--envs", type=int, default=64)
    parser.add_argument("--no-profile", action="store_true")
    args = parser.parse_args()
    print(json.dumps(run(
        args.steps,
        args.seed,
        python_steps=args.python_steps,
        envs=args.envs,
        profile=not args.no_profile,
    ), indent=2))


if __name__ == "__main__":
    main()
