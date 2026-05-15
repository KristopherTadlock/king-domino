"""Run random legal self-play games through the minimal environment."""

from __future__ import annotations

import argparse
import random

from .core import KingdominoEnv, random_legal_action


def run_games(games: int, seed: int) -> dict:
    rng = random.Random(seed)
    wins = [0, 0]
    ties = 0
    total_steps = 0

    for game_index in range(games):
        env = KingdominoEnv(seed=(seed + game_index) & 0xFFFFFFFF)
        steps = 0
        while not env.done:
            action = random_legal_action(env, rng)
            _obs, _reward, done, info = env.step(action, observe=False)
            steps += 1
            if "error" in info:
                raise RuntimeError(f"illegal rollout state in game {game_index}: {info['error']}")
            if steps > 512:
                raise RuntimeError(f"rollout exceeded step budget in game {game_index}")
            if done:
                break
        score0, score1 = env.scores()
        if score0 > score1:
            wins[0] += 1
        elif score1 > score0:
            wins[1] += 1
        else:
            ties += 1
        total_steps += steps

    return {
        "games": games,
        "seed": seed,
        "wins": wins,
        "ties": ties,
        "avg_steps": total_steps / games if games else 0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--games", type=int, default=100)
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()
    result = run_games(args.games, args.seed)
    print(result)


if __name__ == "__main__":
    main()
