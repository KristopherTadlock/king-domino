"""Evaluate a saved weighted heuristic policy."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import random
from typing import Sequence

from .core import KingdominoEnv, random_legal_action
from .heuristic_policy import DEFAULT_WEIGHTS, choose_action, load_policy
from .train import _expert_action, _make_env


def _opponent_action(env, rng: random.Random, opponent: str) -> int:
    if opponent in ("greedy", "delta"):
        return _expert_action(env, player=1, expert=opponent)
    return random_legal_action(env, rng)


def evaluate(
    weights: Sequence[float],
    games: int,
    seed: int,
    opponent: str = "greedy",
    native: bool = True,
) -> dict:
    rng = random.Random(seed)
    wins = [0, 0]
    ties = 0
    total_scores = [0, 0]
    total_steps = 0

    for game_index in range(games):
        env = _make_env((seed + game_index) & 0xFFFFFFFF, native=native)
        steps = 0
        while not env.done:
            if env.current_player == 0:
                action = choose_action(env, player=0, weights=weights)
            else:
                action = _opponent_action(env, rng, opponent)
            if hasattr(env, "step_known_legal"):
                _obs, _reward, done, info = env.step_known_legal(action, observe=False)
            else:
                _obs, _reward, done, info = env.step(action, observe=False)
            if "error" in info:
                raise RuntimeError(f"policy produced illegal action in game {game_index}: {info['error']}")
            steps += 1
            total_steps += 1
            if steps > 512:
                raise RuntimeError(f"eval exceeded step budget in game {game_index}")
            if done:
                break

        score0, score1 = env.scores()
        total_scores[0] += score0
        total_scores[1] += score1
        if score0 > score1:
            wins[0] += 1
        elif score1 > score0:
            wins[1] += 1
        else:
            ties += 1

    return {
        "games": games,
        "seed": seed,
        "opponent": opponent,
        "wins": wins,
        "ties": ties,
        "win_rate": wins[0] / games if games else 0.0,
        "avg_scores": [score / games if games else 0.0 for score in total_scores],
        "steps": total_steps,
        "native": bool(native),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy")
    parser.add_argument("--games", type=int, default=200)
    parser.add_argument("--seed", type=int, default=456)
    parser.add_argument("--opponent", choices=["random", "greedy", "delta"], default="greedy")
    parser.add_argument("--python-env", action="store_true")
    args = parser.parse_args()
    weights = DEFAULT_WEIGHTS
    metadata = {}
    if args.policy:
        weights, metadata = load_policy(Path(args.policy))
    result = evaluate(weights, args.games, args.seed, opponent=args.opponent, native=not args.python_env)
    result["policy"] = args.policy or "default"
    result["metadata"] = metadata
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
