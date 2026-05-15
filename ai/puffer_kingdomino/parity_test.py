"""Parity checks between the Python RL environment and the JS game engine."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from .core import ANCHOR_RIGHT, KingdominoEnv

try:
    from .native import NativeKingdominoEnv
except ImportError:  # pragma: no cover - extension intentionally optional
    NativeKingdominoEnv = None


ROOT = Path(__file__).resolve().parents[2]


def _js_probe(seed: int) -> dict:
    result = subprocess.run(
        ["node", "ai/puffer_kingdomino/js_parity_probe.mjs", str(seed)],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(result.stdout)


def _py_probe(seed: int) -> dict:
    env = KingdominoEnv(seed=seed)
    initial = {
        "pickOrder": env.pick_order,
        "currentDraft": [slot.domino.number for slot in env.current_draft],
    }
    for index in range(4):
        env.step(index)
    player = env.current_player
    options = [
        {
            "dominoNumber": option.domino_number,
            "orientation": option.orientation,
            "x": option.x,
            "y": option.y,
            "anchorEnd": ANCHOR_RIGHT if option.anchor_end == ANCHOR_RIGHT else 0,
        }
        for option in env.placement_options(player)
    ]
    options.sort(key=lambda option: (
        option["dominoNumber"],
        option["orientation"],
        option["y"],
        option["x"],
        option["anchorEnd"],
    ))
    return {
        "seed": seed,
        "initial": initial,
        "placeOrder": env.place_order,
        "currentPlacingPlayerIndex": player,
        "options": options,
        "actions": env.legal_actions(),
    }


def _native_probe(seed: int) -> dict | None:
    if NativeKingdominoEnv is None:
        return None

    env = NativeKingdominoEnv(seed=seed)
    initial = {
        "pickOrder": env.pick_order,
        "currentDraft": [slot["domino"] for slot in env.current_draft],
    }
    for index in range(4):
        env.step(index)
    player = env.current_player
    return {
        "seed": seed,
        "initial": initial,
        "placeOrder": env.place_order,
        "currentPlacingPlayerIndex": player,
        "actions": env.legal_actions(),
    }


def _assert_equal(label: str, actual, expected):
    if actual != expected:
        raise AssertionError(f"{label} mismatch:\nactual={actual}\nexpected={expected}")


def run():
    for seed in (1, 123, 456, 98765):
        js = _js_probe(seed)
        py = _py_probe(seed)
        _assert_equal(f"seed {seed} initial", py["initial"], js["initial"])
        _assert_equal(f"seed {seed} placeOrder", py["placeOrder"], js["placeOrder"])
        _assert_equal(
            f"seed {seed} currentPlacingPlayerIndex",
            py["currentPlacingPlayerIndex"],
            js["currentPlacingPlayerIndex"],
        )
        _assert_equal(f"seed {seed} placement options", py["options"], js["options"])
        native = _native_probe(seed)
        if native is not None:
            _assert_equal(f"seed {seed} native initial", native["initial"], py["initial"])
            _assert_equal(f"seed {seed} native placeOrder", native["placeOrder"], py["placeOrder"])
            _assert_equal(
                f"seed {seed} native currentPlacingPlayerIndex",
                native["currentPlacingPlayerIndex"],
                py["currentPlacingPlayerIndex"],
            )
            _assert_equal(
                f"seed {seed} native legal placement actions",
                native["actions"],
                py["actions"],
            )

    print("parity ok")


def main():
    run()


if __name__ == "__main__":
    main()
