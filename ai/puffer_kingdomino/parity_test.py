"""Parity checks between the Python RL environment and the JS game engine."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np

from .core import ANCHOR_RIGHT, COORD_MIN, COORD_SPAN, KingdominoEnv
from .policy import OBS_SCALE

try:
    from .native import NativeKingdominoEnv
except ImportError:  # pragma: no cover - extension intentionally optional
    NativeKingdominoEnv = None


ROOT = Path(__file__).resolve().parents[2]
BOARD_OBSERVATION_OFFSET = 7 + 4 * 3
BOARD_FEATURE_SIZE = COORD_SPAN * COORD_SPAN * 2
CASTLE_CELL_INDEX = (0 - COORD_MIN) * COORD_SPAN + (0 - COORD_MIN)


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


def _assert_observation_contract(seed: int):
    py = KingdominoEnv(seed=seed)
    native = NativeKingdominoEnv(seed=seed) if NativeKingdominoEnv is not None else None

    for step in range(12):
        py_observation = py.observe()["observation"]
        for player in range(2):
            terrain_index = BOARD_OBSERVATION_OFFSET + player * BOARD_FEATURE_SIZE + CASTLE_CELL_INDEX * 2
            _assert_equal(
                f"seed {seed} step {step} player {player} castle observation",
                py_observation[terrain_index],
                1,
            )

        if native is not None:
            native_observation = native.observe()["observation"]
            _assert_equal(f"seed {seed} step {step} native observation", native_observation, py_observation)
            vector = np.empty(len(native_observation), dtype=np.float32)
            native.write_observation_vector(vector, OBS_SCALE)
            expected = np.asarray(native_observation, dtype=np.float32) / OBS_SCALE
            if not np.allclose(vector, expected):
                raise AssertionError(f"seed {seed} step {step} native observation vector mismatch")
            _assert_equal(f"seed {seed} step {step} native legal actions", native.legal_actions(), py.legal_actions())

        legal = py.legal_actions()
        if not legal:
            break
        action = legal[0]
        py.step(action, observe=False)
        if native is not None:
            native.step(action, observe=False)


def run():
    for seed in (1, 123, 456, 98765):
        _assert_observation_contract(seed)
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
