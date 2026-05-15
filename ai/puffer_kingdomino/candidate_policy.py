"""Candidate-scoring policy prototype for compact legal-action training."""

from __future__ import annotations

import math

import numpy as np
import torch
from torch import nn

from .core import (
    ACTION_COUNT,
    ANCHOR_LEFT,
    BOARD_LIMIT,
    COORD_MAX,
    COORD_MIN,
    DRAFT_ACTIONS,
    DECK_BY_NUMBER,
    DominoSpec,
    LEFT_TO_RIGHT_OFFSETS,
    NEIGHBORS,
    PHASE_DRAFT,
    PHASE_PLACE,
    SKIP_ACTION,
    TERRAIN_CASTLE,
    TERRAIN_MINE,
    TERRAIN_WHEAT,
    decode_placement_action,
)
from .policy import DEFAULT_HIDDEN_SIZE, OBSERVATION_SIZE, OBS_SCALE


ACTION_FEATURE_SIZE = 40
RICH_ACTION_FEATURE_SIZE = 96
ACTION_PART_SIZE = 6
FACTOR_LOGIT_SIZE = 37
FACTOR_DRAFT_OFFSET = 0
FACTOR_ORIENTATION_OFFSET = FACTOR_DRAFT_OFFSET + 4
FACTOR_X_OFFSET = FACTOR_ORIENTATION_OFFSET + 4
FACTOR_Y_OFFSET = FACTOR_X_OFFSET + 13
FACTOR_ANCHOR_OFFSET = FACTOR_Y_OFFSET + 13
FACTOR_SKIP_OFFSET = FACTOR_ANCHOR_OFFSET + 2
FACTOR_UNUSED = -1
STATIC_FEATURE_MODE = "static"
RICH_FEATURE_MODE = "rich"
FEATURE_MODES = (STATIC_FEATURE_MODE, RICH_FEATURE_MODE)

_DRAFT_OBS_OFFSET = 7
_BOARD_OBS_OFFSET = _DRAFT_OBS_OFFSET + 4 * 3
_BOARD_VALUES = (COORD_MAX - COORD_MIN + 1) * (COORD_MAX - COORD_MIN + 1) * 2
_SPAN = COORD_MAX - COORD_MIN + 1


def action_feature_table() -> np.ndarray:
    """Return normalized action features for every flat action id."""

    features = np.zeros((ACTION_COUNT, ACTION_FEATURE_SIZE), dtype=np.float32)
    coord_scale = max(abs(COORD_MIN), abs(COORD_MAX))

    for action in range(ACTION_COUNT):
        if action < DRAFT_ACTIONS:
            features[action, 0] = 1.0
            features[action, 3 + action] = 1.0
            continue

        if action == SKIP_ACTION:
            features[action, 2] = 1.0
            continue

        decoded = decode_placement_action(action)
        if decoded is None:
            continue
        draft_index, orientation, x, y, anchor_end = decoded
        radians = math.radians(orientation)
        features[action, 1] = 1.0
        features[action, 3 + draft_index] = 1.0
        features[action, 7 + (orientation // 90)] = 1.0
        features[action, 11 + (x - COORD_MIN)] = 1.0
        features[action, 24 + (y - COORD_MIN)] = 1.0
        features[action, 37 + anchor_end] = 1.0
        features[action, 39] = (abs(x) + abs(y)) / (coord_scale * 2.0)

    return features


def candidate_feature_size(feature_mode: str = STATIC_FEATURE_MODE) -> int:
    """Return the per-candidate feature width for a feature mode."""

    if feature_mode == STATIC_FEATURE_MODE:
        return ACTION_FEATURE_SIZE
    if feature_mode == RICH_FEATURE_MODE:
        return RICH_ACTION_FEATURE_SIZE
    raise ValueError(f"unknown candidate feature mode: {feature_mode}")


def candidate_features_from_observations(
    observations: np.ndarray,
    actions: np.ndarray,
    *,
    feature_mode: str = STATIC_FEATURE_MODE,
    legal_mask: np.ndarray | None = None,
) -> np.ndarray:
    """Build candidate features from scaled observations and action ids.

    The historical candidate policy only saw static action-id features. Rich
    features add consequences of the action in the current state: placed
    terrain/crowns, local contacts, score delta, board expansion, region shape,
    and draft-time placement mobility.
    """

    action_array = np.asarray(actions, dtype=np.int64)
    if feature_mode == STATIC_FEATURE_MODE:
        return action_feature_table()[np.clip(action_array, 0, ACTION_COUNT - 1)]
    if feature_mode != RICH_FEATURE_MODE:
        raise ValueError(f"unknown candidate feature mode: {feature_mode}")

    obs_array = np.asarray(observations, dtype=np.float32)
    squeeze_obs = obs_array.ndim == 1
    squeeze_actions = action_array.ndim == 1
    if squeeze_obs:
        obs_array = obs_array[None, :]
    if squeeze_actions:
        action_array = action_array[None, :]

    if obs_array.shape[0] != action_array.shape[0]:
        raise ValueError("observations and actions must have the same batch dimension")
    mask_array = None
    if legal_mask is not None:
        mask_array = np.asarray(legal_mask, dtype=np.bool_)
        if mask_array.ndim == 1:
            mask_array = mask_array[None, :]
        if mask_array.shape != action_array.shape:
            raise ValueError("legal_mask must have the same shape as actions")

    features = np.zeros(action_array.shape + (RICH_ACTION_FEATURE_SIZE,), dtype=np.float32)
    static = action_feature_table()
    features[..., :ACTION_FEATURE_SIZE] = static[np.clip(action_array, 0, ACTION_COUNT - 1)]
    raw_observations = np.rint(obs_array * OBS_SCALE).astype(np.int16, copy=False)

    for row in range(action_array.shape[0]):
        row_mask = None if mask_array is None else mask_array[row]
        _write_rich_row_features(raw_observations[row], action_array[row], features[row], row_mask)

    if squeeze_obs and squeeze_actions:
        return features[0]
    return features


def _write_rich_row_features(raw_obs: np.ndarray, actions: np.ndarray, out: np.ndarray, legal_mask: np.ndarray | None) -> None:
    phase = int(raw_obs[0])
    current_player = int(raw_obs[1])
    player = current_player if current_player in (0, 1) else 0
    self_score = float(raw_obs[5 + player])
    opp_score = float(raw_obs[5 + (1 - player)])
    terrain, crowns = _board_arrays(raw_obs, player)
    bounds = _existing_bounds(terrain)

    for index, action_value in enumerate(actions):
        if legal_mask is not None and not bool(legal_mask[index]):
            continue
        action = int(action_value)
        row = out[index]
        row[40] = 1.0 if phase == PHASE_DRAFT else 0.0
        row[41] = 1.0 if phase == PHASE_PLACE else 0.0
        row[42 + player] = 1.0
        row[44] = float(raw_obs[4]) / 12.0
        row[45] = self_score / 100.0
        row[46] = opp_score / 100.0
        row[47] = (self_score - opp_score) / 100.0

        if action == SKIP_ACTION:
            row[95] = 1.0
            continue

        draft_index = action if action < DRAFT_ACTIONS else -1
        decoded = decode_placement_action(action)
        if decoded is not None:
            draft_index = decoded[0]
        if not (0 <= draft_index < DRAFT_ACTIONS):
            continue

        domino = _domino_from_observation(raw_obs, draft_index)
        if domino is None:
            continue
        _write_domino_features(row, domino, draft_index)

        if action < DRAFT_ACTIONS:
            mobility = _best_mobility_metrics(terrain, crowns, domino, bounds)
            _write_metric_features(row, mobility)
            row[54] = min(1.0, mobility["count"] / 64.0)
            row[55] = mobility["best_score_delta"] / 50.0
            row[56] = min(1.0, mobility["best_touch_count"] / 8.0)
            continue

        if decoded is None:
            continue
        _draft_index, orientation, x, y, anchor_end = decoded
        metrics = _placement_metrics(terrain, crowns, domino, orientation, x, y, anchor_end, bounds)
        _write_metric_features(row, metrics)
        row[69 + anchor_end] = 1.0
        row[71] = x / float(max(abs(COORD_MIN), abs(COORD_MAX)))
        row[72] = y / float(max(abs(COORD_MIN), abs(COORD_MAX)))


def _write_domino_features(row: np.ndarray, domino: DominoSpec, draft_index: int) -> None:
    row[48] = domino.number / 48.0
    row[49] = (domino.left_crowns + domino.right_crowns) / 6.0
    row[50] = domino.left_crowns / 3.0
    row[51] = domino.right_crowns / 3.0
    row[52] = 1.0 if domino.left_terrain == domino.right_terrain else 0.0
    row[53] = draft_index / 3.0
    if TERRAIN_WHEAT <= domino.left_terrain <= TERRAIN_MINE:
        row[57 + (domino.left_terrain - TERRAIN_WHEAT)] = 1.0
    if TERRAIN_WHEAT <= domino.right_terrain <= TERRAIN_MINE:
        row[63 + (domino.right_terrain - TERRAIN_WHEAT)] = 1.0


def _write_metric_features(row: np.ndarray, metrics: dict[str, float]) -> None:
    row[73] = metrics["width_after"] / BOARD_LIMIT
    row[74] = metrics["height_after"] / BOARD_LIMIT
    row[75] = metrics["width_growth"] / BOARD_LIMIT
    row[76] = metrics["height_growth"] / BOARD_LIMIT
    row[77] = metrics["distance"] / (abs(COORD_MIN) + abs(COORD_MAX))
    row[78] = metrics["score_delta"] / 50.0
    row[79] = metrics["same_touch_count"] / 8.0
    row[80] = metrics["castle_touch_count"] / 8.0
    row[81] = metrics["occupied_touch_count"] / 8.0
    row[82] = metrics["empty_touch_count"] / 8.0
    row[83] = metrics["region_size_sum"] / 20.0
    row[84] = metrics["region_crowns_sum"] / 8.0
    row[85] = metrics["left_region_size"] / 20.0
    row[86] = metrics["right_region_size"] / 20.0
    row[87] = metrics["left_region_crowns"] / 8.0
    row[88] = metrics["right_region_crowns"] / 8.0
    row[89] = metrics["left_same_touches"] / 4.0
    row[90] = metrics["right_same_touches"] / 4.0
    row[91] = metrics["left_castle_touches"] / 4.0
    row[92] = metrics["right_castle_touches"] / 4.0
    row[93] = metrics["left_neighbor_crowns"] / 6.0
    row[94] = metrics["right_neighbor_crowns"] / 6.0


def _domino_from_observation(raw_obs: np.ndarray, draft_index: int) -> DominoSpec | None:
    number = int(raw_obs[_DRAFT_OBS_OFFSET + draft_index * 3])
    return DECK_BY_NUMBER.get(number)


def _board_arrays(raw_obs: np.ndarray, player: int) -> tuple[np.ndarray, np.ndarray]:
    start = _BOARD_OBS_OFFSET + player * _BOARD_VALUES
    values = raw_obs[start:start + _BOARD_VALUES]
    terrain = values[0::2].reshape((_SPAN, _SPAN))
    crowns = values[1::2].reshape((_SPAN, _SPAN))
    return terrain, crowns


def _best_mobility_metrics(
    terrain: np.ndarray,
    crowns: np.ndarray,
    domino: DominoSpec,
    bounds: tuple[int, int, int, int],
) -> dict[str, float]:
    anchors = _candidate_anchors(terrain)
    seen: set[tuple] = set()
    best = _empty_metrics()
    count = 0
    for orientation in LEFT_TO_RIGHT_OFFSETS:
        for x, y in anchors:
            for anchor_end in (ANCHOR_LEFT, 1):
                left, right = _cells_for(domino, orientation, x, y, anchor_end)
                if not _is_valid_placement(terrain, domino, left, right, bounds):
                    continue
                key = _placement_key(domino, left, right)
                if key in seen:
                    continue
                seen.add(key)
                count += 1
                metrics = _placement_metrics_for_cells(terrain, crowns, domino, left, right, bounds)
                if metrics["score_delta"] > best["score_delta"]:
                    best = metrics
                elif metrics["score_delta"] == best["score_delta"] and metrics["same_touch_count"] > best["same_touch_count"]:
                    best = metrics
    best = dict(best)
    best["count"] = float(count)
    best["best_score_delta"] = best["score_delta"]
    best["best_touch_count"] = best["same_touch_count"] + best["castle_touch_count"]
    return best


def _placement_metrics(
    terrain: np.ndarray,
    crowns: np.ndarray,
    domino: DominoSpec,
    orientation: int,
    x: int,
    y: int,
    anchor_end: int,
    bounds: tuple[int, int, int, int],
) -> dict[str, float]:
    left, right = _cells_for(domino, orientation, x, y, anchor_end)
    return _placement_metrics_for_cells(terrain, crowns, domino, left, right, bounds)


def _placement_metrics_for_cells(
    terrain: np.ndarray,
    crowns: np.ndarray,
    domino: DominoSpec,
    left: tuple[int, int],
    right: tuple[int, int],
    bounds: tuple[int, int, int, int],
) -> dict[str, float]:
    metrics = _empty_metrics()
    metrics["score_delta"] = float(_score_delta_local(terrain, crowns, domino, left, right))
    metrics["width_after"], metrics["height_after"], metrics["width_growth"], metrics["height_growth"] = _bounds_metrics_from_existing(bounds, left, right)
    metrics["distance"] = float(abs(left[0]) + abs(left[1]) + abs(right[0]) + abs(right[1])) / 2.0

    left_stats = _neighbor_stats(terrain, crowns, left, domino.left_terrain + 1)
    right_stats = _neighbor_stats(terrain, crowns, right, domino.right_terrain + 1)
    metrics["same_touch_count"] = left_stats["same"] + right_stats["same"]
    metrics["castle_touch_count"] = left_stats["castle"] + right_stats["castle"]
    metrics["occupied_touch_count"] = left_stats["occupied"] + right_stats["occupied"]
    metrics["empty_touch_count"] = left_stats["empty"] + right_stats["empty"]
    metrics["region_size_sum"] = left_stats["region_size"] + right_stats["region_size"]
    metrics["region_crowns_sum"] = left_stats["region_crowns"] + right_stats["region_crowns"]
    metrics["left_region_size"] = left_stats["region_size"]
    metrics["right_region_size"] = right_stats["region_size"]
    metrics["left_region_crowns"] = left_stats["region_crowns"]
    metrics["right_region_crowns"] = right_stats["region_crowns"]
    metrics["left_same_touches"] = left_stats["same"]
    metrics["right_same_touches"] = right_stats["same"]
    metrics["left_castle_touches"] = left_stats["castle"]
    metrics["right_castle_touches"] = right_stats["castle"]
    metrics["left_neighbor_crowns"] = left_stats["neighbor_crowns"]
    metrics["right_neighbor_crowns"] = right_stats["neighbor_crowns"]
    return metrics


def _score_delta_local(
    terrain: np.ndarray,
    crowns: np.ndarray,
    domino: DominoSpec,
    left: tuple[int, int],
    right: tuple[int, int],
) -> int:
    groups: dict[int, list[int]] = {}
    seen_regions: set[tuple[int, int]] = set()
    before_score = 0
    for coord, terrain_plus, crown_count in (
        (left, domino.left_terrain + 1, domino.left_crowns),
        (right, domino.right_terrain + 1, domino.right_crowns),
    ):
        group = groups.setdefault(terrain_plus, [0, 0])
        group[0] += 1
        group[1] += int(crown_count)
        for neighbor in _neighbors(coord):
            if not _coord_in_bounds(neighbor) or neighbor in seen_regions:
                continue
            ny, nx = _array_coord(neighbor)
            if int(terrain[ny, nx]) != terrain_plus:
                continue
            size, region_crowns, seen = _region_stats(terrain, crowns, neighbor, terrain_plus)
            seen_regions.update(seen)
            before_score += size * region_crowns
            group[0] += size
            group[1] += region_crowns
    after_score = sum(size * crown_count for size, crown_count in groups.values())
    return after_score - before_score


def _empty_metrics() -> dict[str, float]:
    return {
        "count": 0.0,
        "best_score_delta": 0.0,
        "best_touch_count": 0.0,
        "width_after": 0.0,
        "height_after": 0.0,
        "width_growth": 0.0,
        "height_growth": 0.0,
        "distance": 0.0,
        "score_delta": 0.0,
        "same_touch_count": 0.0,
        "castle_touch_count": 0.0,
        "occupied_touch_count": 0.0,
        "empty_touch_count": 0.0,
        "region_size_sum": 0.0,
        "region_crowns_sum": 0.0,
        "left_region_size": 0.0,
        "right_region_size": 0.0,
        "left_region_crowns": 0.0,
        "right_region_crowns": 0.0,
        "left_same_touches": 0.0,
        "right_same_touches": 0.0,
        "left_castle_touches": 0.0,
        "right_castle_touches": 0.0,
        "left_neighbor_crowns": 0.0,
        "right_neighbor_crowns": 0.0,
    }


def _cells_for(
    domino: DominoSpec,
    orientation: int,
    x: int,
    y: int,
    anchor_end: int,
) -> tuple[tuple[int, int], tuple[int, int]]:
    dx, dy = LEFT_TO_RIGHT_OFFSETS[orientation]
    if anchor_end == ANCHOR_LEFT:
        return (x, y), (x + dx, y + dy)
    return (x - dx, y - dy), (x, y)


def _candidate_anchors(terrain: np.ndarray) -> list[tuple[int, int]]:
    candidates = set()
    for y_index in range(_SPAN):
        for x_index in range(_SPAN):
            if terrain[y_index, x_index] <= 0:
                continue
            x = x_index + COORD_MIN
            y = y_index + COORD_MIN
            for dx, dy in NEIGHBORS:
                neighbor = (x + dx, y + dy)
                if _coord_in_bounds(neighbor):
                    ny, nx = _array_coord(neighbor)
                    if terrain[ny, nx] <= 0:
                        candidates.add(neighbor)
    if not candidates:
        candidates.add((0, 0))
    return sorted(candidates, key=lambda coord: (abs(coord[0]) + abs(coord[1]), coord[1], coord[0]))


def _is_valid_placement(
    terrain: np.ndarray,
    domino: DominoSpec,
    left: tuple[int, int],
    right: tuple[int, int],
    bounds: tuple[int, int, int, int],
) -> bool:
    if left == right or not _coord_in_bounds(left) or not _coord_in_bounds(right):
        return False
    ly, lx = _array_coord(left)
    ry, rx = _array_coord(right)
    if terrain[ly, lx] > 0 or terrain[ry, rx] > 0:
        return False
    width, height, _width_growth, _height_growth = _bounds_metrics_from_existing(bounds, left, right)
    if width > BOARD_LIMIT or height > BOARD_LIMIT:
        return False
    return (
        _has_valid_touch(terrain, left, domino.left_terrain + 1)
        or _has_valid_touch(terrain, right, domino.right_terrain + 1)
    )


def _has_valid_touch(terrain: np.ndarray, coord: tuple[int, int], terrain_plus: int) -> bool:
    for neighbor in _neighbors(coord):
        if not _coord_in_bounds(neighbor):
            continue
        ny, nx = _array_coord(neighbor)
        neighbor_terrain = int(terrain[ny, nx])
        if neighbor_terrain == TERRAIN_CASTLE + 1 or neighbor_terrain == terrain_plus:
            return True
    return False


def _neighbor_stats(
    terrain: np.ndarray,
    crowns: np.ndarray,
    coord: tuple[int, int],
    terrain_plus: int,
) -> dict[str, float]:
    stats = {
        "same": 0.0,
        "castle": 0.0,
        "occupied": 0.0,
        "empty": 0.0,
        "neighbor_crowns": 0.0,
        "region_size": 0.0,
        "region_crowns": 0.0,
    }
    visited_regions: set[tuple[int, int]] = set()
    for neighbor in _neighbors(coord):
        if not _coord_in_bounds(neighbor):
            stats["empty"] += 1.0
            continue
        ny, nx = _array_coord(neighbor)
        neighbor_terrain = int(terrain[ny, nx])
        if neighbor_terrain <= 0:
            stats["empty"] += 1.0
            continue
        stats["occupied"] += 1.0
        stats["neighbor_crowns"] += float(crowns[ny, nx])
        if neighbor_terrain == TERRAIN_CASTLE + 1:
            stats["castle"] += 1.0
        if neighbor_terrain == terrain_plus:
            stats["same"] += 1.0
            if neighbor not in visited_regions:
                size, crown_count, seen = _region_stats(terrain, crowns, neighbor, terrain_plus)
                visited_regions.update(seen)
                stats["region_size"] += float(size)
                stats["region_crowns"] += float(crown_count)
    return stats


def _region_stats(
    terrain: np.ndarray,
    crowns: np.ndarray,
    start: tuple[int, int],
    terrain_plus: int,
) -> tuple[int, int, set[tuple[int, int]]]:
    stack = [start]
    seen = {start}
    size = 0
    crown_count = 0
    while stack:
        coord = stack.pop()
        y_index, x_index = _array_coord(coord)
        if int(terrain[y_index, x_index]) != terrain_plus:
            continue
        size += 1
        crown_count += int(crowns[y_index, x_index])
        for neighbor in _neighbors(coord):
            if neighbor in seen or not _coord_in_bounds(neighbor):
                continue
            ny, nx = _array_coord(neighbor)
            if int(terrain[ny, nx]) != terrain_plus:
                continue
            seen.add(neighbor)
            stack.append(neighbor)
    return size, crown_count, seen


def _existing_bounds(terrain: np.ndarray) -> tuple[int, int, int, int]:
    xs = []
    ys = []
    for y_index in range(_SPAN):
        for x_index in range(_SPAN):
            if terrain[y_index, x_index] > 0:
                xs.append(x_index + COORD_MIN)
                ys.append(y_index + COORD_MIN)
    if not xs:
        return 0, 0, 0, 0
    return min(xs), max(xs), min(ys), max(ys)


def _bounds_metrics_from_existing(
    bounds: tuple[int, int, int, int],
    left: tuple[int, int],
    right: tuple[int, int],
) -> tuple[float, float, float, float]:
    min_x, max_x, min_y, max_y = bounds
    coords = [left, right, (min_x, min_y), (max_x, max_y)]
    xs = [coord[0] for coord in coords]
    ys = [coord[1] for coord in coords]
    width_after = max(xs) - min(xs) + 1
    height_after = max(ys) - min(ys) + 1
    width_before = max_x - min_x + 1
    height_before = max_y - min_y + 1
    return (
        float(width_after),
        float(height_after),
        float(max(0, width_after - width_before)),
        float(max(0, height_after - height_before)),
    )


def _placement_key(domino: DominoSpec, left: tuple[int, int], right: tuple[int, int]) -> tuple:
    cells = sorted((
        (left[0], left[1], domino.left_terrain, domino.left_crowns),
        (right[0], right[1], domino.right_terrain, domino.right_crowns),
    ))
    return domino.number, tuple(cells)


def _array_coord(coord: tuple[int, int]) -> tuple[int, int]:
    return coord[1] - COORD_MIN, coord[0] - COORD_MIN


def _coord_in_bounds(coord: tuple[int, int]) -> bool:
    return COORD_MIN <= coord[0] <= COORD_MAX and COORD_MIN <= coord[1] <= COORD_MAX


def _neighbors(coord: tuple[int, int]):
    x, y = coord
    for dx, dy in NEIGHBORS:
        yield x + dx, y + dy


def action_part_table() -> np.ndarray:
    """Return factor-logit indices used by each flat action id.

    Each row contains up to ACTION_PART_SIZE logit indices. Unused entries are
    FACTOR_UNUSED and are ignored by `factorized_candidate_logits`.
    """

    parts = np.full((ACTION_COUNT, ACTION_PART_SIZE), FACTOR_UNUSED, dtype=np.int64)
    for action in range(ACTION_COUNT):
        if action < DRAFT_ACTIONS:
            parts[action, 0] = FACTOR_DRAFT_OFFSET + action
            continue

        if action == SKIP_ACTION:
            parts[action, 0] = FACTOR_SKIP_OFFSET
            continue

        decoded = decode_placement_action(action)
        if decoded is None:
            continue
        draft_index, orientation, x, y, anchor_end = decoded
        parts[action, 0] = FACTOR_DRAFT_OFFSET + draft_index
        parts[action, 1] = FACTOR_ORIENTATION_OFFSET + (orientation // 90)
        parts[action, 2] = FACTOR_X_OFFSET + (x - COORD_MIN)
        parts[action, 3] = FACTOR_Y_OFFSET + (y - COORD_MIN)
        parts[action, 4] = FACTOR_ANCHOR_OFFSET + anchor_end
    return parts


class CandidateScoringPolicy(nn.Module):
    """Scores a variable-size set of legal actions instead of all 5413 ids."""

    def __init__(
        self,
        obs_size: int = OBSERVATION_SIZE,
        action_feature_size: int = ACTION_FEATURE_SIZE,
        hidden_size: int = DEFAULT_HIDDEN_SIZE,
    ):
        super().__init__()
        self.obs_size = obs_size
        self.action_feature_size = action_feature_size
        self.hidden_size = hidden_size
        self.obs = nn.Linear(obs_size, hidden_size)
        self.action = nn.Linear(action_feature_size, hidden_size)
        self.action_bias = nn.Linear(action_feature_size, 1)

    def forward(self, observations: torch.Tensor, candidate_features: torch.Tensor) -> torch.Tensor:
        state = torch.tanh(self.obs(observations))
        action = torch.tanh(self.action(candidate_features))
        score = (state[:, None, :] * action).sum(dim=-1) / math.sqrt(self.hidden_size)
        return score + self.action_bias(candidate_features).squeeze(-1)


class InteractionCandidatePolicy(nn.Module):
    """Richer legal-candidate scorer with explicit state/action interaction."""

    def __init__(
        self,
        obs_size: int = OBSERVATION_SIZE,
        action_feature_size: int = ACTION_FEATURE_SIZE,
        hidden_size: int = DEFAULT_HIDDEN_SIZE,
    ):
        super().__init__()
        self.obs_size = obs_size
        self.action_feature_size = action_feature_size
        self.hidden_size = hidden_size
        self.obs = nn.Linear(obs_size, hidden_size)
        self.action = nn.Linear(action_feature_size, hidden_size)
        self.joint = nn.Linear(hidden_size * 3, hidden_size)
        self.output = nn.Linear(hidden_size, 1)

    def forward(self, observations: torch.Tensor, candidate_features: torch.Tensor) -> torch.Tensor:
        state = torch.tanh(self.obs(observations))[:, None, :]
        action = torch.tanh(self.action(candidate_features))
        state = state.expand(-1, action.shape[1], -1)
        joint = torch.cat([state, action, state * action], dim=-1)
        return self.output(torch.tanh(self.joint(joint))).squeeze(-1)


class FactorizedActionPolicy(nn.Module):
    """Tiny policy head whose component logits score legal flat actions."""

    def __init__(self, obs_size: int = OBSERVATION_SIZE, hidden_size: int = DEFAULT_HIDDEN_SIZE):
        super().__init__()
        self.obs_size = obs_size
        self.hidden_size = hidden_size
        self.action_count = ACTION_COUNT
        self.input = nn.Linear(obs_size, hidden_size)
        self.output = nn.Linear(hidden_size, FACTOR_LOGIT_SIZE)

    def forward(self, observations: torch.Tensor) -> torch.Tensor:
        hidden = torch.tanh(self.input(observations))
        return self.output(hidden)


def factorized_candidate_logits(
    factor_logits: torch.Tensor,
    candidate_parts: torch.Tensor,
) -> torch.Tensor:
    safe_parts = candidate_parts.clamp_min(0)
    gathered = factor_logits.gather(1, safe_parts.reshape(factor_logits.shape[0], -1))
    gathered = gathered.reshape(candidate_parts.shape)
    return gathered.masked_fill(candidate_parts < 0, 0.0).sum(dim=-1)
