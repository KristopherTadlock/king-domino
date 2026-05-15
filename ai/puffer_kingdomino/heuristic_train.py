"""Train a lightweight weighted heuristic policy by black-box search."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import random
import time

from .heuristic_eval import evaluate
from .heuristic_policy import DEFAULT_WEIGHTS, save_policy


DEFAULT_SIGMA = [
    4.0,
    0.12,
    0.75,
    35.0,
    2.0,
    6.0,
    0.35,
    0.05,
    0.9,
    2.5,
]


def _objective(result: dict) -> float:
    score_margin = result["avg_scores"][0] - result["avg_scores"][1]
    return result["win_rate"] + 0.002 * score_margin


def _mutate(rng: random.Random, weights: list[float], sigma: list[float], scale: float) -> list[float]:
    values = [
        weight + rng.gauss(0.0, sigma[index] * scale)
        for index, weight in enumerate(weights)
    ]
    # Keep the immediate score-delta term pointed in the right direction.
    values[3] = max(1.0, values[3])
    return values


def train(
    output: Path,
    seed: int = 123,
    generations: int = 6,
    population: int = 24,
    games_per_candidate: int = 50,
    verify_games: int = 200,
    opponent: str = "greedy",
) -> dict:
    rng = random.Random(seed)
    started = time.perf_counter()
    sigma = list(DEFAULT_SIGMA)
    best_weights = list(DEFAULT_WEIGHTS)
    best_result = evaluate(best_weights, games_per_candidate, seed, opponent=opponent)
    best_objective = _objective(best_result)
    history = [
        {
            "generation": 0,
            "candidate": "seed",
            "objective": best_objective,
            "result": best_result,
            "weights": best_weights,
        }
    ]

    for generation in range(1, generations + 1):
        scale = max(0.15, 1.0 - (generation - 1) / max(generations, 1))
        candidates = [best_weights]
        for _index in range(max(0, population - 1)):
            candidates.append(_mutate(rng, best_weights, sigma, scale))

        generation_best = None
        generation_seed = (seed + generation * 10_000) & 0xFFFFFFFF
        for candidate_index, weights in enumerate(candidates):
            result = evaluate(weights, games_per_candidate, generation_seed + candidate_index, opponent=opponent)
            objective = _objective(result)
            item = {
                "generation": generation,
                "candidate": candidate_index,
                "objective": objective,
                "result": result,
                "weights": weights,
            }
            if generation_best is None or objective > generation_best["objective"]:
                generation_best = item
            if objective > best_objective:
                best_objective = objective
                best_result = result
                best_weights = weights
        if generation_best is not None:
            history.append(generation_best)

    verification = evaluate(best_weights, verify_games, 456, opponent=opponent)
    default_verification = evaluate(DEFAULT_WEIGHTS, verify_games, 456, opponent=opponent)
    selected = "search"
    if _objective(default_verification) > _objective(verification):
        selected = "seed"
        best_weights = list(DEFAULT_WEIGHTS)
        verification = default_verification
    elapsed = max(time.perf_counter() - started, 1e-9)
    metadata = {
        "backend": "weighted-heuristic-random-search-v0",
        "seed": seed,
        "generations": generations,
        "population": population,
        "games_per_candidate": games_per_candidate,
        "verify_games": verify_games,
        "opponent": opponent,
        "seconds": elapsed,
        "best_training_result": best_result,
        "best_training_objective": best_objective,
        "default_verification": default_verification,
        "selected": selected,
        "verification": verification,
        "history": history,
    }
    save_policy(output, best_weights, metadata)
    return {
        "policy": str(output),
        "weights": best_weights,
        "metadata": metadata,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="ai/artifacts/heuristic_policy.json")
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--generations", type=int, default=6)
    parser.add_argument("--population", type=int, default=24)
    parser.add_argument("--games-per-candidate", type=int, default=50)
    parser.add_argument("--verify-games", type=int, default=200)
    parser.add_argument("--opponent", choices=["greedy", "random", "delta"], default="greedy")
    args = parser.parse_args()
    print(json.dumps(train(
        output=Path(args.output),
        seed=args.seed,
        generations=args.generations,
        population=args.population,
        games_per_candidate=args.games_per_candidate,
        verify_games=args.verify_games,
        opponent=args.opponent,
    ), indent=2))


if __name__ == "__main__":
    main()
