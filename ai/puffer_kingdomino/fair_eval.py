"""Seat-swapped fair evaluation for Kingdomino AI policies."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import statistics

from .agents import agent_kinds, load_agent, make_env, step_legal


def _confidence(win_rate: float, games: int) -> dict:
    if games <= 0:
        return {"standard_error": 0.0, "ci95": [0.0, 0.0]}
    se = math.sqrt(max(0.0, win_rate * (1.0 - win_rate)) / games)
    return {
        "standard_error": se,
        "ci95": [max(0.0, win_rate - 1.96 * se), min(1.0, win_rate + 1.96 * se)],
    }


def _margin_stats(margins: list[float]) -> dict:
    if not margins:
        return {"mean": 0.0, "standard_error": 0.0}
    mean = statistics.fmean(margins)
    if len(margins) == 1:
        return {"mean": mean, "standard_error": 0.0}
    return {"mean": mean, "standard_error": statistics.stdev(margins) / math.sqrt(len(margins))}


def _play_game(policy_agent, opponent_agent, *, policy_player: int, seed: int, native: bool) -> dict:
    env = make_env(seed, native=native)
    steps = 0
    while not env.done:
        current = env.current_player
        if current is None:
            break
        action = policy_agent.choose(env, policy_player) if current == policy_player else opponent_agent.choose(env, current)
        _obs, _reward, done, info = step_legal(env, action, observe=False)
        if "error" in info:
            actor = "policy" if current == policy_player else "opponent"
            raise RuntimeError(f"{actor} produced illegal action at seed {seed}: {info['error']}")
        steps += 1
        if steps > 512:
            raise RuntimeError(f"eval exceeded step budget at seed {seed}")
        if done:
            break

    scores = env.scores()
    policy_score = scores[policy_player]
    opponent_score = scores[1 - policy_player]
    if policy_score > opponent_score:
        outcome = "win"
    elif policy_score < opponent_score:
        outcome = "loss"
    else:
        outcome = "tie"
    return {
        "seed": seed,
        "policy_player": policy_player,
        "scores": [int(scores[0]), int(scores[1])],
        "policy_score": int(policy_score),
        "opponent_score": int(opponent_score),
        "score_margin": int(policy_score - opponent_score),
        "outcome": outcome,
        "steps": steps,
    }


def fair_evaluate(
    *,
    policy_kind: str,
    opponent_kind: str,
    pairs: int,
    seed: int,
    policy: Path | None = None,
    opponent_policy: Path | None = None,
    native: bool = True,
    max_candidates: int = 128,
    search_depth: int = 1,
    search_breadth: int = 12,
) -> dict:
    policy_agent = load_agent(
        policy_kind,
        policy=policy,
        seed=seed,
        max_candidates=max_candidates,
        search_depth=search_depth,
        search_breadth=search_breadth,
    )
    opponent_agent = load_agent(
        opponent_kind,
        policy=opponent_policy,
        seed=seed + 10_007,
        max_candidates=max_candidates,
        search_depth=search_depth,
        search_breadth=search_breadth,
    )
    games = []
    for pair_index in range(max(0, pairs)):
        game_seed = (seed + pair_index) & 0xFFFFFFFF
        games.append(_play_game(policy_agent, opponent_agent, policy_player=0, seed=game_seed, native=native))
        games.append(_play_game(policy_agent, opponent_agent, policy_player=1, seed=game_seed, native=native))

    wins = sum(1 for game in games if game["outcome"] == "win")
    losses = sum(1 for game in games if game["outcome"] == "loss")
    ties = sum(1 for game in games if game["outcome"] == "tie")
    total = len(games)
    win_rate = wins / total if total else 0.0
    tie_rate = ties / total if total else 0.0
    margins = [float(game["score_margin"]) for game in games]
    policy_scores = [float(game["policy_score"]) for game in games]
    opponent_scores = [float(game["opponent_score"]) for game in games]

    return {
        "policy_kind": policy_kind,
        "policy": str(policy) if policy else None,
        "opponent_kind": opponent_kind,
        "opponent_policy": str(opponent_policy) if opponent_policy else None,
        "pairs": pairs,
        "games": total,
        "seed": seed,
        "native": bool(native),
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "win_rate": win_rate,
        "tie_rate": tie_rate,
        "win_rate_error": _confidence(win_rate, total),
        "avg_policy_score": statistics.fmean(policy_scores) if policy_scores else 0.0,
        "avg_opponent_score": statistics.fmean(opponent_scores) if opponent_scores else 0.0,
        "score_margin": _margin_stats(margins),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy-kind", choices=tuple(agent_kinds()), default="heuristic")
    parser.add_argument("--policy")
    parser.add_argument("--opponent-kind", choices=tuple(agent_kinds()), default="greedy")
    parser.add_argument("--opponent-policy")
    parser.add_argument("--pairs", type=int, default=500, help="Number of seeds; each seed is played once from each seat.")
    parser.add_argument("--games", type=int, help="Total seat-swapped games. Rounded down to an even number.")
    parser.add_argument("--seed", type=int, default=456)
    parser.add_argument("--python-env", action="store_true")
    parser.add_argument("--max-candidates", type=int, default=128)
    parser.add_argument("--search-depth", type=int, default=1)
    parser.add_argument("--search-breadth", type=int, default=12)
    args = parser.parse_args()
    pairs = args.pairs
    if args.games is not None:
        pairs = max(0, args.games // 2)
    print(json.dumps(fair_evaluate(
        policy_kind=args.policy_kind,
        policy=Path(args.policy) if args.policy else None,
        opponent_kind=args.opponent_kind,
        opponent_policy=Path(args.opponent_policy) if args.opponent_policy else None,
        pairs=pairs,
        seed=args.seed,
        native=not args.python_env,
        max_candidates=args.max_candidates,
        search_depth=args.search_depth,
        search_breadth=args.search_breadth,
    ), indent=2))


if __name__ == "__main__":
    main()
