"""Executable checks for the AI observation/action encoding contract."""

from __future__ import annotations

import json
import random
from pathlib import Path
import tempfile

import numpy as np

from .candidate_policy import (
    ACTION_FEATURE_SIZE,
    FACTOR_LOGIT_SIZE,
    FACTOR_UNUSED,
    RICH_ACTION_FEATURE_SIZE,
    action_feature_table,
    action_part_table,
    candidate_feature_size,
    candidate_features_from_observations,
)
from .core import (
    ACTION_COUNT,
    ANCHOR_LEFT,
    ANCHOR_RIGHT,
    COORD_MAX,
    COORD_MIN,
    COORD_SPAN,
    DRAFT_ACTIONS,
    PLACEMENT_ACTIONS,
    SKIP_ACTION,
    PHASE_PLACE,
    TERRAIN_CASTLE,
    TERRAIN_MINE,
    KingdominoEnv,
    decode_placement_action,
    encode_placement_action,
)
from .policy import OBSERVATION_SIZE, OBSERVATION_VERSION, OBS_SCALE, observation_vector
from .teacher_dataset import generate_dataset

try:
    from .native import NativeKingdominoEnv, native_action_count
except ImportError:  # pragma: no cover - extension intentionally optional
    NativeKingdominoEnv = None
    native_action_count = None


OBS_META_SIZE = 7
DRAFT_SLOT_COUNT = 4
DRAFT_SLOT_FEATURES = 3
BOARD_OBSERVATION_OFFSET = OBS_META_SIZE + DRAFT_SLOT_COUNT * DRAFT_SLOT_FEATURES
BOARD_CELLS = COORD_SPAN * COORD_SPAN
BOARD_FEATURE_SIZE = BOARD_CELLS * 2
CASTLE_CELL_INDEX = (0 - COORD_MIN) * COORD_SPAN + (0 - COORD_MIN)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _assert_equal(label: str, actual, expected) -> None:
    if actual != expected:
        raise AssertionError(f"{label} mismatch:\nactual={actual}\nexpected={expected}")


def _assert_close(label: str, actual, expected) -> None:
    if not np.allclose(actual, expected):
        raise AssertionError(f"{label} mismatch")


def _board_values(observation: list[int] | np.ndarray, player: int) -> np.ndarray:
    start = BOARD_OBSERVATION_OFFSET + player * BOARD_FEATURE_SIZE
    return np.asarray(observation[start:start + BOARD_FEATURE_SIZE], dtype=np.float32).reshape(BOARD_CELLS, 2)


def _assert_observation_values(observation: list[int] | np.ndarray) -> None:
    _assert_equal("observation size", len(observation), OBSERVATION_SIZE)
    values = np.asarray(observation, dtype=np.float32)
    _assert(np.isfinite(values).all(), "observation contains non-finite values")
    _assert_equal("board feature offset", BOARD_OBSERVATION_OFFSET, 19)
    _assert_equal("expected observation size", BOARD_OBSERVATION_OFFSET + BOARD_FEATURE_SIZE * 2, OBSERVATION_SIZE)

    for player in range(2):
        board = _board_values(observation, player)
        terrain = board[:, 0]
        crowns = board[:, 1]
        _assert(np.all(crowns[terrain == 0] == 0), f"player {player} empty cells must not carry crowns")
        _assert(np.all((terrain >= 0) & (terrain <= TERRAIN_MINE + 1)), f"player {player} terrain out of range")
        _assert(np.all((crowns >= 0) & (crowns <= 3)), f"player {player} crowns out of range")
        _assert_equal(f"player {player} castle count", int(np.sum(terrain == TERRAIN_CASTLE + 1)), 1)
        _assert_equal(f"player {player} castle crowns", float(crowns[CASTLE_CELL_INDEX]), 0.0)
        _assert_equal(
            f"player {player} castle coordinate encoding",
            float(terrain[CASTLE_CELL_INDEX]),
            float(TERRAIN_CASTLE + 1),
        )


def _assert_mask_contract(env, label: str) -> None:
    legal = [int(action) for action in env.legal_actions()]
    mask = [int(value) for value in env.action_mask()]
    _assert_equal(f"{label} mask size", len(mask), ACTION_COUNT)
    _assert_equal(f"{label} mask count", sum(mask), len(legal))
    _assert_equal(f"{label} mask legal actions", [index for index, value in enumerate(mask) if value], sorted(legal))
    if hasattr(env, "write_action_mask_vector"):
        vector = np.empty((ACTION_COUNT,), dtype=np.float32)
        env.write_action_mask_vector(vector)
        _assert_close(f"{label} native mask vector", vector, np.asarray(mask, dtype=np.float32))
    if hasattr(env, "write_legal_actions"):
        buffer = np.full((ACTION_COUNT,), -999, dtype=np.int32)
        count = int(env.write_legal_actions(buffer))
        _assert_equal(f"{label} native legal count", count, len(legal))
        _assert_equal(f"{label} native legal buffer", sorted(int(action) for action in buffer[:count]), sorted(legal))
        _assert_equal(f"{label} native legal buffer uniqueness", len(set(int(action) for action in buffer[:count])), count)


def _assert_observation_contract(seed: int, max_steps: int = 160) -> None:
    rng = random.Random(seed)
    py_env = KingdominoEnv(seed=seed)
    native_env = NativeKingdominoEnv(seed=seed) if NativeKingdominoEnv is not None else None

    for step in range(max_steps):
        py_obs = py_env.observe()
        _assert_observation_values(py_obs["observation"])
        _assert_mask_contract(py_env, f"python seed {seed} step {step}")
        _assert_close(
            f"python normalized observation seed {seed} step {step}",
            observation_vector(py_env),
            np.asarray(py_obs["observation"], dtype=np.float32) / OBS_SCALE,
        )

        if native_env is not None:
            native_obs = native_env.observe()
            _assert_equal(f"native raw observation seed {seed} step {step}", native_obs["observation"], py_obs["observation"])
            _assert_equal(f"native action mask seed {seed} step {step}", native_obs["action_mask"], py_obs["action_mask"])
            _assert_equal(f"native legal actions seed {seed} step {step}", native_env.legal_actions(), py_env.legal_actions())
            _assert_mask_contract(native_env, f"native seed {seed} step {step}")
            scaled = np.empty((OBSERVATION_SIZE,), dtype=np.float32)
            native_env.write_observation_vector(scaled, OBS_SCALE)
            _assert_close(
                f"native scaled observation seed {seed} step {step}",
                scaled,
                np.asarray(py_obs["observation"], dtype=np.float32) / OBS_SCALE,
            )
            raw = np.empty((OBSERVATION_SIZE,), dtype=np.float32)
            native_env.write_observation_vector(raw, 1.0)
            _assert_close(f"native raw vector seed {seed} step {step}", raw, np.asarray(py_obs["observation"], dtype=np.float32))

        legal = py_env.legal_actions()
        if not legal:
            _assert(py_env.done, f"seed {seed} step {step} has no legal actions before done")
            break

        action = int(rng.choice(legal))
        py_step = py_env.step(action, observe=False)
        if native_env is not None:
            native_step = native_env.step(action, observe=False)
            _assert_close(f"native reward seed {seed} step {step}", np.asarray([native_step[1]]), np.asarray([py_step[1]]))
            _assert_equal(f"native done seed {seed} step {step}", native_step[2], py_step[2])
            _assert_equal(f"native info player seed {seed} step {step}", native_step[3]["player"], py_step[3]["player"])
            _assert_equal(f"native info scores seed {seed} step {step}", native_step[3]["scores"], py_step[3]["scores"])

    _assert(py_env.done, f"seed {seed} did not finish within {max_steps} steps")
    if native_env is not None:
        _assert(native_env.done, f"native seed {seed} did not finish within {max_steps} steps")


def _assert_action_encoding_contract() -> None:
    _assert_equal("skip action", SKIP_ACTION, ACTION_COUNT - 1)
    _assert_equal("placement action count", PLACEMENT_ACTIONS, ACTION_COUNT - DRAFT_ACTIONS - 1)
    if native_action_count is not None:
        _assert_equal("native action count", native_action_count(), ACTION_COUNT)

    seen = set()
    for draft_index in range(DRAFT_ACTIONS):
        for orientation in (0, 90, 180, 270):
            for x in range(COORD_MIN, COORD_MAX + 1):
                for y in range(COORD_MIN, COORD_MAX + 1):
                    for anchor_end in (ANCHOR_LEFT, ANCHOR_RIGHT):
                        action = encode_placement_action(draft_index, orientation, x, y, anchor_end)
                        _assert(DRAFT_ACTIONS <= action < SKIP_ACTION, f"encoded action out of placement range: {action}")
                        _assert_equal(
                            f"decode placement action {action}",
                            decode_placement_action(action),
                            (draft_index, orientation, x, y, anchor_end),
                        )
                        seen.add(action)
    _assert_equal("unique placement encodings", len(seen), PLACEMENT_ACTIONS)
    _assert_equal("draft decode", [decode_placement_action(action) for action in range(DRAFT_ACTIONS)], [None] * DRAFT_ACTIONS)
    _assert_equal("skip decode", decode_placement_action(SKIP_ACTION), None)


def _assert_candidate_table_contract() -> None:
    features = action_feature_table()
    parts = action_part_table()
    _assert_equal("action feature table shape", features.shape, (ACTION_COUNT, ACTION_FEATURE_SIZE))
    _assert_equal("static feature size helper", candidate_feature_size("static"), ACTION_FEATURE_SIZE)
    _assert_equal("rich feature size helper", candidate_feature_size("rich"), RICH_ACTION_FEATURE_SIZE)
    _assert_equal("action part table shape", parts.shape[0], ACTION_COUNT)
    _assert(np.isfinite(features).all(), "action feature table contains non-finite values")
    _assert(np.all((parts == FACTOR_UNUSED) | ((parts >= 0) & (parts < FACTOR_LOGIT_SIZE))), "factorized part index out of range")

    for action in range(DRAFT_ACTIONS):
        _assert_equal(f"draft {action} feature type", float(features[action, 0]), 1.0)
        _assert_equal(f"draft {action} feature slot", float(features[action, 3 + action]), 1.0)
    _assert_equal("skip feature type", float(features[SKIP_ACTION, 2]), 1.0)

    for action in (DRAFT_ACTIONS, DRAFT_ACTIONS + 1, SKIP_ACTION - 1):
        decoded = decode_placement_action(action)
        if decoded is None:
            continue
        draft_index, orientation, x, y, anchor_end = decoded
        _assert_equal(f"placement {action} feature type", float(features[action, 1]), 1.0)
        _assert_equal(f"placement {action} draft slot feature", float(features[action, 3 + draft_index]), 1.0)
        _assert_equal(f"placement {action} orientation feature", float(features[action, 7 + orientation // 90]), 1.0)
        _assert_equal(f"placement {action} x feature", float(features[action, 11 + (x - COORD_MIN)]), 1.0)
        _assert_equal(f"placement {action} y feature", float(features[action, 24 + (y - COORD_MIN)]), 1.0)
        _assert_equal(f"placement {action} anchor feature", float(features[action, 37 + anchor_end]), 1.0)


def _assert_rich_candidate_feature_contract() -> None:
    env = KingdominoEnv(seed=123)
    draft_actions = np.asarray(env.legal_actions(), dtype=np.int64)
    draft_features = candidate_features_from_observations(
        observation_vector(env),
        draft_actions,
        feature_mode="rich",
    )
    draft_reference = candidate_features_from_observations(
        observation_vector(env),
        draft_actions,
        feature_mode="rich",
        use_native=False,
    )
    _assert_equal("rich draft feature shape", draft_features.shape, (len(draft_actions), RICH_ACTION_FEATURE_SIZE))
    _assert(np.isfinite(draft_features).all(), "rich draft features contain non-finite values")
    _assert_close("native rich draft feature parity", draft_features, draft_reference)
    _assert(np.any(draft_features[:, 54] > 0), "rich draft mobility count should be exposed")

    while env.phase != PHASE_PLACE:
        env.step(env.legal_actions()[0], observe=False)
    placement_actions = np.asarray(env.legal_actions(), dtype=np.int64)
    placement_features = candidate_features_from_observations(
        observation_vector(env),
        placement_actions,
        feature_mode="rich",
    )
    placement_reference = candidate_features_from_observations(
        observation_vector(env),
        placement_actions,
        feature_mode="rich",
        use_native=False,
    )
    _assert_equal(
        "rich placement feature shape",
        placement_features.shape,
        (len(placement_actions), RICH_ACTION_FEATURE_SIZE),
    )
    _assert(np.isfinite(placement_features).all(), "rich placement features contain non-finite values")
    _assert_close("native rich placement feature parity", placement_features, placement_reference)
    _assert(np.all(placement_features[:, 41] == 1.0), "rich placement phase bit should be set")
    _assert(np.any(placement_features[:, 80] > 0), "rich placement castle contact should be exposed")


def _assert_dataset_contract() -> None:
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "dataset.npz"
        result = generate_dataset(
            output=output,
            samples=256,
            seed=321,
            teacher_kind="heuristic",
            teacher_policy=None,
            rollout="mixed",
            native=True,
            search_depth=1,
            search_breadth=4,
        )
        _assert_equal("dataset result observation version", result["observation_version"], OBSERVATION_VERSION)
        data = np.load(output)
        metadata = json.loads(str(data["metadata"]))
        _assert_equal("dataset metadata observation version", int(metadata["observation_version"]), OBSERVATION_VERSION)
        _assert_equal("dataset observation shape", data["observations"].shape, (256, OBSERVATION_SIZE))
        _assert_equal("dataset legal rows", data["legal_actions"].shape[0], 256)
        _assert_equal("dataset legal mask rows", data["legal_mask"].shape[0], 256)

        observations = data["observations"]
        legal_actions = data["legal_actions"]
        legal_mask = data["legal_mask"]
        target_actions = data["target_actions"]
        target_indices = data["target_indices"]
        candidate_scores = data["candidate_scores"]
        target_scores = data["target_scores"]

        for row in range(256):
            _assert_observation_values(observations[row] * OBS_SCALE)
            candidates = [int(action) for action in legal_actions[row][legal_mask[row]]]
            _assert(candidates, f"dataset row {row} has no legal candidates")
            target_index = int(target_indices[row])
            _assert(0 <= target_index < len(candidates), f"dataset row {row} target index out of range")
            _assert_equal(f"dataset row {row} target action", int(target_actions[row]), candidates[target_index])
            finite_scores = np.isfinite(candidate_scores[row][legal_mask[row]])
            _assert(np.all(finite_scores), f"dataset row {row} legal candidate score missing")
            _assert_close(
                f"dataset row {row} target score",
                np.asarray([target_scores[row]], dtype=np.float32),
                np.asarray([candidate_scores[row, target_index]], dtype=np.float32),
            )


def run() -> None:
    _assert_action_encoding_contract()
    _assert_candidate_table_contract()
    _assert_rich_candidate_feature_contract()
    for seed in (1, 123, 456, 98765):
        _assert_observation_contract(seed)
    _assert_dataset_contract()
    print("encoding contract ok")


def main() -> None:
    run()


if __name__ == "__main__":
    main()
