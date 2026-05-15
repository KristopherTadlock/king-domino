"""Shallow lookahead teacher built on top of the weighted heuristic policy."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .agents import Agent, HeuristicAgent, legal_actions, score_margin, step_legal


@dataclass
class SearchAgent(Agent):
    """Search legal actions, using weighted heuristic play for rollouts.

    Depth is counted in future decisions by the searched player. Opponent turns
    between those decisions are played by the weighted heuristic rollout policy.
    """

    weights: list[float]
    depth: int = 1
    breadth: int = 12
    name: str = "search"

    def __post_init__(self):
        self.rollout = HeuristicAgent(weights=self.weights)

    def choose(self, env, player: int) -> int:
        actions = legal_actions(env)
        if not actions:
            raise RuntimeError("no legal actions available")
        if len(actions) == 1:
            return actions[0]
        scores = self.score_actions(env, player, actions)
        if scores is None:
            return self.rollout.choose(env, player)
        return actions[max(range(len(actions)), key=lambda index: (scores[index], -actions[index]))]

    def score_actions(self, env, player: int, actions: Sequence[int]) -> list[float] | None:
        if not actions:
            return []
        base_scores = self.rollout.score_actions(env, player, actions)
        if base_scores is None:
            base_scores = [0.0 for _action in actions]
        searched = [-1_000_000_000.0 + score * 0.001 for score in base_scores]
        top_indices = sorted(range(len(actions)), key=lambda index: base_scores[index], reverse=True)[: max(1, self.breadth)]
        for index in top_indices:
            searched[index] = self._action_value(env, player, int(actions[index]), max(1, self.depth)) + base_scores[index] * 0.01
        return searched

    def _action_value(self, env, player: int, action: int, depth_remaining: int) -> float:
        trial = env.clone() if hasattr(env, "clone") else env.clone()
        _obs, _reward, _done, info = step_legal(trial, action, observe=False)
        if "error" in info:
            return -1_000_000_000.0
        return self._roll_forward_value(trial, player, max(0, depth_remaining - 1))

    def _roll_forward_value(self, env, player: int, depth_remaining: int) -> float:
        guard = 0
        while not env.done and env.current_player != player and guard < 128:
            current = env.current_player
            if current is None:
                break
            action = self.rollout.choose(env, int(current))
            _obs, _reward, _done, info = step_legal(env, action, observe=False)
            if "error" in info:
                return 1_000_000_000.0
            guard += 1
        if guard >= 128:
            return score_margin(env, player)
        if env.done or depth_remaining <= 0 or env.current_player != player:
            return score_margin(env, player)

        actions = legal_actions(env)
        if not actions:
            return score_margin(env, player)
        base_scores = self.rollout.score_actions(env, player, actions)
        if base_scores is None:
            base_scores = [0.0 for _action in actions]
        top_actions = [
            actions[index]
            for index in sorted(range(len(actions)), key=lambda index: base_scores[index], reverse=True)[: max(1, self.breadth)]
        ]
        return max(self._action_value(env, player, int(action), depth_remaining) for action in top_actions)
