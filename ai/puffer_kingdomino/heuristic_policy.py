"""Saveable weighted heuristic policy for native Kingdomino rollouts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Sequence


FORMAT = "kingdomino-weighted-heuristic-v0"

# Seeded from the score-delta expert that beats the older greedy baseline.
DEFAULT_WEIGHTS = [
    12.0,   # draft crowns
    0.25,   # draft domino number
    0.5,    # draft terrain diversity
    100.0,  # immediate placement score delta
    1.0,    # existing placement heuristic
    0.0,    # placement crowns
    0.0,    # compactness penalty
    0.0,    # domino number penalty
    0.0,    # board expansion penalty
    0.0,    # matching touch bonus
]


def normalize_weights(weights: Sequence[float]) -> list[float]:
    values = [float(value) for value in weights]
    if len(values) != len(DEFAULT_WEIGHTS):
        raise ValueError(f"expected {len(DEFAULT_WEIGHTS)} weights, got {len(values)}")
    return values


def save_policy(path: Path, weights: Sequence[float], metadata: dict | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "format": FORMAT,
                "weights": normalize_weights(weights),
                "metadata": metadata or {},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def load_policy(path: Path) -> tuple[list[float], dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("format") != FORMAT:
        raise ValueError(f"unsupported heuristic policy format: {payload.get('format')}")
    return normalize_weights(payload["weights"]), dict(payload.get("metadata", {}))


def choose_action(env, player: int, weights: Sequence[float]) -> int:
    if hasattr(env, "weighted_action"):
        return int(env.weighted_action(player, weights))
    if hasattr(env, "delta_greedy_action"):
        return int(env.delta_greedy_action(player))
    if hasattr(env, "greedy_action"):
        return int(env.greedy_action(player))

    from .core import greedy_policy_action

    return greedy_policy_action(env, player=player)
