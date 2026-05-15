"""Smoke test for the PufferLib adapter."""

from __future__ import annotations

import argparse
import random

from .puffer_env import PufferKingdominoEnv


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=200)
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    env = PufferKingdominoEnv(seed=args.seed)
    env.reset(args.seed)
    episodes = 0
    for _ in range(args.steps):
        legal = env.env.legal_actions()
        action = rng.choice(legal)
        env.step([action])
        if env.terminals[0]:
            episodes += 1
            env.reset(args.seed + episodes)
    print({
        "steps": args.steps,
        "episodes": episodes,
        "obs_shape": tuple(env.observations.shape),
        "action_count": env.single_action_space.n,
    })


if __name__ == "__main__":
    main()

