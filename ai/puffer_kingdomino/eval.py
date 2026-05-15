"""Evaluate a saved policy artifact against legal opponents."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import random

from .core import KingdominoEnv, random_legal_action
from .policy import choose_model_action, load_checkpoint

try:
    from .native import NativeKingdominoEnv
except ImportError:  # pragma: no cover - extension intentionally optional
    NativeKingdominoEnv = None


def _make_env(seed: int, native: bool = True):
    if native and NativeKingdominoEnv is not None:
        return NativeKingdominoEnv(seed=seed)
    return KingdominoEnv(seed=seed)


def _greedy_action(env, player: int) -> int:
    if hasattr(env, "greedy_action"):
        return int(env.greedy_action(player))
    from .core import greedy_policy_action

    return greedy_policy_action(env, player=player)


def _opponent_action(env, rng: random.Random, opponent: str) -> int:
    if opponent == "greedy":
        return _greedy_action(env, player=1)
    return random_legal_action(env, rng)


def evaluate(policy_path: Path, games: int, seed: int, opponent: str = "random", native: bool = True) -> dict:
    model, checkpoint = load_checkpoint(policy_path)
    rng = random.Random(seed)
    wins = [0, 0]
    ties = 0
    total_scores = [0, 0]

    for game_index in range(games):
        env = _make_env((seed + game_index) & 0xFFFFFFFF, native=native)
        steps = 0
        while not env.done:
            if env.current_player == 0:
                action = choose_model_action(model, env, deterministic=True)
            else:
                action = _opponent_action(env, rng, opponent)
            _obs, _reward, done, info = env.step(action, observe=False)
            if "error" in info:
                raise RuntimeError(f"policy produced illegal action in game {game_index}: {info['error']}")
            steps += 1
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
        "policy": str(policy_path),
        "backend": checkpoint.get("backend"),
        "opponent": opponent,
        "wins": wins,
        "ties": ties,
        "win_rate": wins[0] / games if games else 0,
        "avg_scores": [score / games if games else 0 for score in total_scores],
        "native": bool(native and NativeKingdominoEnv is not None),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", default="ai/artifacts/latest.pt")
    parser.add_argument("--games", type=int, default=200)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--opponent", choices=["random", "greedy"], default="random")
    parser.add_argument("--python-env", action="store_true")
    args = parser.parse_args()
    print(json.dumps(evaluate(
        Path(args.policy),
        args.games,
        args.seed,
        opponent=args.opponent,
        native=not args.python_env,
    ), indent=2))


if __name__ == "__main__":
    main()
