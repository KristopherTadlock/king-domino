"""Generate supervised decision datasets from a stronger teacher policy."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import random
import time

import numpy as np

from .agents import agent_kinds, legal_actions, load_agent, make_env, step_legal
from .candidate_train import DEFAULT_MAX_CANDIDATES
from .policy import OBSERVATION_SIZE, OBS_SCALE, observation_vector


def generate_dataset(
    *,
    output: Path,
    samples: int,
    seed: int,
    teacher_kind: str,
    teacher_policy: Path | None = None,
    rollout: str = "teacher",
    native: bool = True,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
    search_depth: int = 2,
    search_breadth: int = 6,
) -> dict:
    started = time.perf_counter()
    rng = random.Random(seed)
    teacher = load_agent(
        teacher_kind,
        policy=teacher_policy,
        seed=seed,
        max_candidates=max_candidates,
        search_depth=search_depth,
        search_breadth=search_breadth,
    )
    env = make_env(seed, native=native)
    obs = np.empty((samples, OBSERVATION_SIZE), dtype=np.float32)
    legal = np.zeros((samples, max_candidates), dtype=np.int32)
    legal_mask = np.zeros((samples, max_candidates), dtype=np.bool_)
    target_actions = np.zeros((samples,), dtype=np.int32)
    target_indices = np.zeros((samples,), dtype=np.int16)
    target_scores = np.zeros((samples,), dtype=np.float32)
    target_ranks = np.full((samples,), -1, dtype=np.int16)
    players = np.zeros((samples,), dtype=np.int8)
    phases = np.zeros((samples,), dtype=np.int8)
    game_seeds = np.zeros((samples,), dtype=np.uint32)
    completed_games = 0
    sample_index = 0

    while sample_index < samples:
        if env.done:
            completed_games += 1
            env = make_env((seed + completed_games) & 0xFFFFFFFF, native=native)

        current = env.current_player
        if current is None:
            completed_games += 1
            env = make_env((seed + completed_games) & 0xFFFFFFFF, native=native)
            continue

        actions = legal_actions(env)
        if len(actions) > max_candidates:
            raise ValueError(f"legal action count {len(actions)} exceeds max_candidates {max_candidates}")
        if hasattr(env, "write_observation_vector"):
            env.write_observation_vector(obs[sample_index], OBS_SCALE)
        else:
            obs[sample_index, :] = observation_vector(env)
        legal[sample_index, : len(actions)] = actions
        legal_mask[sample_index, : len(actions)] = True

        target = int(teacher.choose(env, int(current)))
        if target not in actions:
            raise RuntimeError(f"teacher selected illegal action {target}")
        target_index = actions.index(target)
        scores = teacher.score_actions(env, int(current), actions)
        if scores is not None:
            ranked = sorted(range(len(actions)), key=lambda index: scores[index], reverse=True)
            target_ranks[sample_index] = ranked.index(target_index)
            target_scores[sample_index] = float(scores[target_index])

        target_actions[sample_index] = target
        target_indices[sample_index] = target_index
        players[sample_index] = int(current)
        phases[sample_index] = int(env.phase)
        game_seeds[sample_index] = (seed + completed_games) & 0xFFFFFFFF
        sample_index += 1

        if rollout == "random" and rng.random() < 0.75:
            action = rng.choice(actions)
        elif rollout == "mixed" and rng.random() < 0.25:
            action = rng.choice(actions)
        else:
            action = target
        _obs, _reward, _done, info = step_legal(env, action, observe=False)
        if "error" in info:
            raise RuntimeError(info["error"])

    elapsed = max(time.perf_counter() - started, 1e-9)
    metadata = {
        "format": "kingdomino-teacher-dataset-v0",
        "samples": samples,
        "seed": seed,
        "teacher_kind": teacher_kind,
        "teacher_policy": str(teacher_policy) if teacher_policy else None,
        "rollout": rollout,
        "native": bool(native),
        "max_candidates": max_candidates,
        "search_depth": search_depth,
        "search_breadth": search_breadth,
        "completed_games": completed_games,
        "seconds": elapsed,
        "samples_per_second": samples / elapsed if samples else 0.0,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output,
        observations=obs,
        legal_actions=legal,
        legal_mask=legal_mask,
        target_actions=target_actions,
        target_indices=target_indices,
        target_scores=target_scores,
        target_ranks=target_ranks,
        players=players,
        phases=phases,
        game_seeds=game_seeds,
        metadata=json.dumps(metadata),
    )
    return {"output": str(output), **metadata}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="ai/artifacts/datasets/search_teacher.npz")
    parser.add_argument("--samples", type=int, default=20_000)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--teacher-kind", choices=tuple(agent_kinds()), default="search")
    parser.add_argument("--teacher-policy", default="ai/artifacts/heuristic_policy.json")
    parser.add_argument("--rollout", choices=["teacher", "mixed", "random"], default="teacher")
    parser.add_argument("--python-env", action="store_true")
    parser.add_argument("--max-candidates", type=int, default=DEFAULT_MAX_CANDIDATES)
    parser.add_argument("--search-depth", type=int, default=2)
    parser.add_argument("--search-breadth", type=int, default=6)
    args = parser.parse_args()
    print(json.dumps(generate_dataset(
        output=Path(args.output),
        samples=args.samples,
        seed=args.seed,
        teacher_kind=args.teacher_kind,
        teacher_policy=Path(args.teacher_policy) if args.teacher_policy else None,
        rollout=args.rollout,
        native=not args.python_env,
        max_candidates=args.max_candidates,
        search_depth=args.search_depth,
        search_breadth=args.search_breadth,
    ), indent=2))


if __name__ == "__main__":
    main()
