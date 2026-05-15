"""PufferLib adapter for the current native-backed Kingdomino core."""

from __future__ import annotations

import random
from typing import Optional

import numpy as np
import pufferlib
from gymnasium import spaces

from .core import ACTION_COUNT, KingdominoEnv, random_legal_action

try:
    from .native import NativeKingdominoEnv
except ImportError:  # pragma: no cover - exercised when extension is not built
    NativeKingdominoEnv = None


class PufferKingdominoEnv(pufferlib.PufferEnv):
    """Single-agent PufferLib env: player 0 learns against random player 1."""

    def __init__(self, seed: int = 1, buf=None, native: bool = True):
        self.seed = seed
        self.rng = random.Random(seed)
        self.native = bool(native and NativeKingdominoEnv is not None)
        self.env = NativeKingdominoEnv(seed=seed) if self.native else KingdominoEnv(seed=seed)
        initial = self.env.observe()
        self._obs_len = len(initial["observation"]) + len(initial["action_mask"])
        self.num_agents = 1
        self.single_observation_space = spaces.Box(
            low=-10_000,
            high=10_000,
            shape=(self._obs_len,),
            dtype=np.float32,
        )
        self.single_action_space = spaces.Discrete(ACTION_COUNT)
        super().__init__(buf)
        self._write_observation()

    def reset(self, seed: Optional[int] = None):
        if seed is not None:
            self.seed = int(seed)
            self.rng = random.Random(self.seed)
        self.env.reset(self.seed)
        self._play_until_learning_turn()
        self.rewards[0] = 0.0
        self.terminals[0] = False
        self.truncations[0] = False
        self._write_observation()
        return self.observations, [{}]

    def step(self, actions):
        action = int(actions[0])
        _obs, reward, done, info = self.env.step(action, observe=False)
        if "error" not in info and not done:
            self._play_until_learning_turn()
        self.rewards[0] = float(reward)
        self.terminals[0] = bool(self.env.done)
        self.truncations[0] = False
        self._write_observation()
        return self.observations, self.rewards, self.terminals, self.truncations, [info]

    def close(self):
        return None

    def _play_until_learning_turn(self):
        guard = 0
        while not self.env.done and self.env.current_player == 1 and guard < 128:
            if hasattr(self.env, "step_random_legal"):
                self.env.step_random_legal(self.rng, observe=False)
            else:
                action = random_legal_action(self.env, self.rng)
                self.env.step(action, observe=False)
            guard += 1
        if guard >= 128:
            raise RuntimeError("opponent rollout exceeded guard")

    def _write_observation(self):
        obs = self.env.observe()
        values = obs["observation"] + obs["action_mask"]
        self.observations[0, :] = np.asarray(values, dtype=np.float32)


def make(seed: int = 1, buf=None):
    return PufferKingdominoEnv(seed=seed, buf=buf)
