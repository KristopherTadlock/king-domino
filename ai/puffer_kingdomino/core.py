"""Dependency-free 2-player Kingdomino rules core for RL experiments.

This is the correctness-first core behind the PufferLib milestone. It mirrors
the browser rules closely enough to run deterministic rollouts and parity
checks before the hot loop is moved into C/Cython.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
import copy
import random

try:
    from . import native as _native
except ImportError:
    _native = None

PHASE_DRAFT = 0
PHASE_PLACE = 1
PHASE_DONE = 2

TERRAIN_CASTLE = 0
TERRAIN_WHEAT = 1
TERRAIN_PASTURE = 2
TERRAIN_WATER = 3
TERRAIN_BOG = 4
TERRAIN_FOREST = 5
TERRAIN_MINE = 6

TERRAIN_NAMES = {
    TERRAIN_CASTLE: "castle",
    TERRAIN_WHEAT: "wheat",
    TERRAIN_PASTURE: "pasture",
    TERRAIN_WATER: "water",
    TERRAIN_BOG: "bog",
    TERRAIN_FOREST: "forest",
    TERRAIN_MINE: "mine",
}

TERRAIN_BY_NAME = {value: key for key, value in TERRAIN_NAMES.items()}

ANCHOR_LEFT = 0
ANCHOR_RIGHT = 1
BOARD_LIMIT = 7
COORD_MIN = -6
COORD_MAX = 6
COORD_SPAN = COORD_MAX - COORD_MIN + 1
DRAFT_ACTIONS = 4
PLACEMENT_ACTIONS = 4 * 4 * COORD_SPAN * COORD_SPAN * 2
SKIP_ACTION = DRAFT_ACTIONS + PLACEMENT_ACTIONS
ACTION_COUNT = SKIP_ACTION + 1

NEIGHBORS: Tuple[Tuple[int, int], ...] = (
    (0, 1),
    (0, -1),
    (-1, 0),
    (1, 0),
)

LEFT_TO_RIGHT_OFFSETS = {
    0: (1, 0),
    90: (0, -1),
    180: (-1, 0),
    270: (0, 1),
}


@dataclass(frozen=True)
class DominoSpec:
    number: int
    left_terrain: int
    left_crowns: int
    right_terrain: int
    right_crowns: int


@dataclass
class DraftSlot:
    domino: DominoSpec
    player: Optional[int] = None
    placed: bool = False


@dataclass(frozen=True)
class Tile:
    terrain: int
    crowns: int
    domino: int = 0
    end: int = 0


@dataclass(frozen=True)
class PlacementOption:
    draft_index: int
    domino_number: int
    orientation: int
    x: int
    y: int
    anchor_end: int

    @property
    def action(self) -> int:
        return encode_placement_action(self.draft_index, self.orientation, self.x, self.y, self.anchor_end)


DECK: Tuple[DominoSpec, ...] = (
    DominoSpec(1, TERRAIN_WHEAT, 0, TERRAIN_WHEAT, 0),
    DominoSpec(2, TERRAIN_WHEAT, 0, TERRAIN_WHEAT, 0),
    DominoSpec(3, TERRAIN_FOREST, 0, TERRAIN_FOREST, 0),
    DominoSpec(4, TERRAIN_FOREST, 0, TERRAIN_FOREST, 0),
    DominoSpec(5, TERRAIN_FOREST, 0, TERRAIN_FOREST, 0),
    DominoSpec(6, TERRAIN_FOREST, 0, TERRAIN_FOREST, 0),
    DominoSpec(7, TERRAIN_WATER, 0, TERRAIN_WATER, 0),
    DominoSpec(8, TERRAIN_WATER, 0, TERRAIN_WATER, 0),
    DominoSpec(9, TERRAIN_WATER, 0, TERRAIN_WATER, 0),
    DominoSpec(10, TERRAIN_PASTURE, 0, TERRAIN_PASTURE, 0),
    DominoSpec(11, TERRAIN_PASTURE, 0, TERRAIN_PASTURE, 0),
    DominoSpec(12, TERRAIN_BOG, 0, TERRAIN_BOG, 0),
    DominoSpec(13, TERRAIN_WHEAT, 0, TERRAIN_FOREST, 0),
    DominoSpec(14, TERRAIN_WHEAT, 0, TERRAIN_WATER, 0),
    DominoSpec(15, TERRAIN_WHEAT, 0, TERRAIN_PASTURE, 0),
    DominoSpec(16, TERRAIN_WHEAT, 0, TERRAIN_BOG, 0),
    DominoSpec(17, TERRAIN_FOREST, 0, TERRAIN_WATER, 0),
    DominoSpec(18, TERRAIN_FOREST, 0, TERRAIN_PASTURE, 0),
    DominoSpec(19, TERRAIN_WHEAT, 1, TERRAIN_FOREST, 0),
    DominoSpec(20, TERRAIN_WHEAT, 1, TERRAIN_WATER, 0),
    DominoSpec(21, TERRAIN_WHEAT, 1, TERRAIN_PASTURE, 0),
    DominoSpec(22, TERRAIN_WHEAT, 1, TERRAIN_BOG, 0),
    DominoSpec(23, TERRAIN_WHEAT, 1, TERRAIN_MINE, 0),
    DominoSpec(24, TERRAIN_FOREST, 1, TERRAIN_WHEAT, 0),
    DominoSpec(25, TERRAIN_FOREST, 1, TERRAIN_WHEAT, 0),
    DominoSpec(26, TERRAIN_FOREST, 1, TERRAIN_WHEAT, 0),
    DominoSpec(27, TERRAIN_FOREST, 1, TERRAIN_WHEAT, 0),
    DominoSpec(28, TERRAIN_FOREST, 1, TERRAIN_WATER, 0),
    DominoSpec(29, TERRAIN_FOREST, 1, TERRAIN_PASTURE, 0),
    DominoSpec(30, TERRAIN_WATER, 1, TERRAIN_WHEAT, 0),
    DominoSpec(31, TERRAIN_WATER, 1, TERRAIN_WHEAT, 0),
    DominoSpec(32, TERRAIN_WATER, 1, TERRAIN_FOREST, 0),
    DominoSpec(33, TERRAIN_WATER, 1, TERRAIN_FOREST, 0),
    DominoSpec(34, TERRAIN_WATER, 1, TERRAIN_FOREST, 0),
    DominoSpec(35, TERRAIN_WATER, 1, TERRAIN_FOREST, 0),
    DominoSpec(36, TERRAIN_WHEAT, 0, TERRAIN_PASTURE, 1),
    DominoSpec(37, TERRAIN_WATER, 0, TERRAIN_PASTURE, 1),
    DominoSpec(38, TERRAIN_WHEAT, 0, TERRAIN_BOG, 1),
    DominoSpec(39, TERRAIN_PASTURE, 0, TERRAIN_BOG, 1),
    DominoSpec(40, TERRAIN_MINE, 1, TERRAIN_WHEAT, 0),
    DominoSpec(41, TERRAIN_WHEAT, 0, TERRAIN_PASTURE, 2),
    DominoSpec(42, TERRAIN_WATER, 0, TERRAIN_PASTURE, 2),
    DominoSpec(43, TERRAIN_WHEAT, 0, TERRAIN_BOG, 2),
    DominoSpec(44, TERRAIN_PASTURE, 0, TERRAIN_BOG, 2),
    DominoSpec(45, TERRAIN_MINE, 2, TERRAIN_WHEAT, 2),
    DominoSpec(46, TERRAIN_BOG, 0, TERRAIN_MINE, 2),
    DominoSpec(47, TERRAIN_BOG, 0, TERRAIN_MINE, 2),
    DominoSpec(48, TERRAIN_WHEAT, 0, TERRAIN_MINE, 3),
)

DECK_BY_NUMBER = {domino.number: domino for domino in DECK}


class Mulberry32:
    def __init__(self, seed: int):
        self.t = seed & 0xFFFFFFFF

    def random(self) -> float:
        self.t = (self.t + 0x6D2B79F5) & 0xFFFFFFFF
        r = ((self.t ^ (self.t >> 15)) * (1 | self.t)) & 0xFFFFFFFF
        r = (r ^ (r + (((r ^ (r >> 7)) * (61 | r)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((r ^ (r >> 14)) & 0xFFFFFFFF) / 4294967296


def encode_placement_action(draft_index: int, orientation: int, x: int, y: int, anchor_end: int) -> int:
    if not (0 <= draft_index < 4):
        raise ValueError("draft_index out of range")
    if orientation not in LEFT_TO_RIGHT_OFFSETS:
        raise ValueError("orientation must be one of 0, 90, 180, 270")
    if not (COORD_MIN <= x <= COORD_MAX and COORD_MIN <= y <= COORD_MAX):
        raise ValueError("placement coordinate out of range")
    if anchor_end not in (ANCHOR_LEFT, ANCHOR_RIGHT):
        raise ValueError("anchor_end out of range")
    orientation_steps = orientation // 90
    coord_x = x - COORD_MIN
    coord_y = y - COORD_MIN
    encoded = (((draft_index * 4 + orientation_steps) * COORD_SPAN + coord_x) * COORD_SPAN + coord_y) * 2 + anchor_end
    return DRAFT_ACTIONS + encoded


def decode_placement_action(action: int) -> Optional[Tuple[int, int, int, int, int]]:
    if action < DRAFT_ACTIONS or action >= SKIP_ACTION:
        return None
    value = action - DRAFT_ACTIONS
    anchor_end = value % 2
    value //= 2
    coord_y = value % COORD_SPAN
    value //= COORD_SPAN
    coord_x = value % COORD_SPAN
    value //= COORD_SPAN
    orientation_steps = value % 4
    draft_index = value // 4
    return draft_index, orientation_steps * 90, coord_x + COORD_MIN, coord_y + COORD_MIN, anchor_end


class KingdominoEnv:
    """Sequential 2-player Kingdomino environment.

    The API is Gym-like but dependency-free:
    `reset() -> observation`, `step(action) -> (observation, reward, done, info)`.
    """

    num_players = 2
    board_limit = BOARD_LIMIT
    action_count = ACTION_COUNT

    def __init__(self, seed: int = 1):
        self.seed = seed & 0xFFFFFFFF
        self.rng = Mulberry32(self.seed)
        self.deck: List[DominoSpec] = []
        self.boards: List[Dict[Tuple[int, int], Tile]] = []
        self.current_draft: List[DraftSlot] = []
        self.phase = PHASE_DRAFT
        self.pick_order: List[int] = []
        self.pick_cursor = 0
        self.place_order: List[int] = []
        self.place_cursor = 0
        self.round = 0
        self.done = False
        self.reset(seed)

    def clone(self) -> "KingdominoEnv":
        return copy.deepcopy(self)

    def reset(self, seed: Optional[int] = None):
        if seed is not None:
            self.seed = seed & 0xFFFFFFFF
        self.rng = Mulberry32(self.seed)
        # Match WebGameManager construction. The JS constructor creates a
        # DominoPoolManager, which shuffles once, and game.start() shuffles the
        # pool again for the actual game.
        warmup_deck = list(DECK)
        self._shuffle(warmup_deck)
        self.deck = list(DECK)
        self._shuffle(self.deck)
        self.boards = [{(0, 0): Tile(TERRAIN_CASTLE, 0)} for _ in range(self.num_players)]
        base_order = [0, 1]
        self._shuffle(base_order)
        self.pick_order = [base_order[0], base_order[1], base_order[0], base_order[1]]
        self.place_order = []
        self.pick_cursor = 0
        self.place_cursor = 0
        self.round = 0
        self.done = False
        self._start_round()
        return self.observe()

    @property
    def current_player(self) -> Optional[int]:
        if self.done:
            return None
        if self.phase == PHASE_DRAFT:
            if self.pick_cursor >= len(self.pick_order):
                return None
            return self.pick_order[self.pick_cursor]
        if self.phase == PHASE_PLACE:
            if self.place_cursor >= len(self.place_order):
                return None
            return self.place_order[self.place_cursor]
        return None

    def legal_actions(self) -> List[int]:
        if self.done:
            return []
        if self.phase == PHASE_DRAFT:
            return [
                index
                for index, slot in enumerate(self.current_draft)
                if slot.player is None and not slot.placed
            ]
        if self.phase == PHASE_PLACE:
            options = self.placement_options(self.current_player)
            if options:
                return [option.action for option in options]
            return [SKIP_ACTION]
        return []

    def action_mask(self) -> List[int]:
        mask = [0] * ACTION_COUNT
        for action in self.legal_actions():
            mask[action] = 1
        return mask

    def observe(self) -> dict:
        scores = self.scores()
        flat = [
            self.phase,
            -1 if self.current_player is None else self.current_player,
            self.pick_cursor,
            self.place_cursor,
            self.round,
            scores[0],
            scores[1],
        ]
        for slot in self.current_draft:
            flat.extend([
                slot.domino.number,
                -1 if slot.player is None else slot.player,
                1 if slot.placed else 0,
            ])
        for player in range(self.num_players):
            flat.extend(self._board_features(player))
        return {
            "observation": flat,
            "action_mask": self.action_mask(),
            "phase": self.phase,
            "current_player": self.current_player,
            "scores": scores,
            "round": self.round,
        }

    def step(self, action: int, observe: bool = True):
        if self.done:
            return self._step_observation(observe), 0.0, True, {"error": "game already done"}

        player_before = self.current_player
        scores_before = self.scores()
        legal = set(self.legal_actions())
        if action not in legal:
            self.done = True
            self.phase = PHASE_DONE
            return self._step_observation(observe), -1.0, True, {"error": f"illegal action {action}"}

        info = {}
        if self.phase == PHASE_DRAFT:
            self._pick_draft(action)
        elif self.phase == PHASE_PLACE:
            if action == SKIP_ACTION:
                self._skip_current_placement()
            else:
                decoded = decode_placement_action(action)
                if decoded is None:
                    raise AssertionError("legal placement action failed to decode")
                self._place_decoded_action(*decoded)

        scores_after = self.scores()
        reward = (scores_after[0] - scores_before[0]) / 100.0
        if self.done:
            if scores_after[0] > scores_after[1]:
                reward += 1.0
            elif scores_after[0] < scores_after[1]:
                reward -= 1.0

        info["player"] = player_before
        info["scores"] = scores_after
        return self._step_observation(observe), reward, self.done, info

    def _step_observation(self, observe: bool):
        return self.observe() if observe else None

    def placement_options(self, player: Optional[int]) -> List[PlacementOption]:
        if self.phase != PHASE_PLACE or player is None:
            return []

        options: List[PlacementOption] = []
        seen = set()
        for draft_index, slot in enumerate(self.current_draft):
            if slot.player != player or slot.placed:
                continue
            for orientation in (0, 90, 180, 270):
                for x, y in self._candidate_anchors(player):
                    anchor_end = self._feedback_anchor_end(player, slot.domino, orientation, x, y)
                    if anchor_end is None:
                        continue
                    key = self._placement_key(slot.domino, orientation, x, y, anchor_end)
                    if key in seen:
                        continue
                    seen.add(key)
                    options.append(PlacementOption(
                        draft_index=draft_index,
                        domino_number=slot.domino.number,
                        orientation=orientation,
                        x=x,
                        y=y,
                        anchor_end=anchor_end,
                    ))

        options.sort(key=lambda option: (
            option.domino_number,
            option.orientation,
            option.y,
            option.x,
            option.anchor_end,
        ))
        return options

    def scores(self) -> Tuple[int, int]:
        return tuple(self.score_board(index) for index in range(self.num_players))  # type: ignore[return-value]

    def score_board(self, player: int) -> int:
        native_score = self._score_board_native(player)
        if native_score is not None:
            return native_score

        board = self.boards[player]
        visited = set()
        total = 0
        for coord, tile in board.items():
            if coord in visited or tile.terrain == TERRAIN_CASTLE:
                continue
            stack = [coord]
            visited.add(coord)
            count = 0
            crowns = 0
            while stack:
                current = stack.pop()
                current_tile = board[current]
                count += 1
                crowns += current_tile.crowns
                for neighbor in self._neighbors(current):
                    if neighbor in visited:
                        continue
                    neighbor_tile = board.get(neighbor)
                    if not neighbor_tile or neighbor_tile.terrain != current_tile.terrain:
                        continue
                    visited.add(neighbor)
                    stack.append(neighbor)
            total += count * crowns
        return total

    def _score_board_native(self, player: int) -> Optional[int]:
        if _native is None:
            return None
        terrains = [-1] * (COORD_SPAN * COORD_SPAN)
        crowns = [0] * (COORD_SPAN * COORD_SPAN)
        for (x, y), tile in self.boards[player].items():
            if not (COORD_MIN <= x <= COORD_MAX and COORD_MIN <= y <= COORD_MAX):
                return None
            idx = (y - COORD_MIN) * COORD_SPAN + (x - COORD_MIN)
            terrains[idx] = tile.terrain
            crowns[idx] = tile.crowns
        return int(_native.score_board_flat(terrains, crowns, COORD_SPAN))

    def board_bounds(self, player: int, extra: Sequence[Tuple[int, int]] = ()) -> Tuple[int, int, int, int]:
        coords = list(self.boards[player].keys()) + list(extra)
        xs = [coord[0] for coord in coords]
        ys = [coord[1] for coord in coords]
        return min(xs), max(xs), min(ys), max(ys)

    def _shuffle(self, values: List):
        for i in range(len(values) - 1, 0, -1):
            j = int(self.rng.random() * (i + 1))
            values[i], values[j] = values[j], values[i]

    def _start_round(self):
        if not self.deck:
            self.done = True
            self.phase = PHASE_DONE
            return
        self.round += 1
        self.phase = PHASE_DRAFT
        self.pick_cursor = 0
        drawn = self.deck[:4]
        self.deck = self.deck[4:]
        drawn.sort(key=lambda domino: domino.number)
        self.current_draft = [DraftSlot(domino=domino) for domino in drawn]
        self.place_order = []
        self.place_cursor = 0

    def _pick_draft(self, draft_index: int):
        slot = self.current_draft[draft_index]
        if slot.player is not None:
            raise AssertionError("attempted to draft occupied slot")
        slot.player = self.current_player
        self.pick_cursor += 1
        if self.pick_cursor < len(self.pick_order) and any(slot.player is None for slot in self.current_draft):
            return
        for slot in self.current_draft:
            if slot.player is None:
                slot.placed = True
        self.place_order = [
            slot.player
            for slot in sorted(self.current_draft, key=lambda item: item.domino.number)
            if slot.player is not None
        ]
        self.pick_order = list(self.place_order)
        self.place_cursor = 0
        self.phase = PHASE_PLACE
        self._advance_past_empty_placers()

    def _skip_current_placement(self):
        player = self.current_player
        if player is None:
            return
        for slot in sorted(self.current_draft, key=lambda item: item.domino.number):
            if slot.player == player and not slot.placed:
                slot.placed = True
                break
        self._advance_placement()

    def _place_decoded_action(self, draft_index: int, orientation: int, x: int, y: int, anchor_end: int):
        player = self.current_player
        if player is None:
            return
        slot = self.current_draft[draft_index]
        if slot.player != player or slot.placed:
            raise AssertionError("placement action does not belong to current player")
        left, right = self._cells_for(slot.domino, orientation, x, y, anchor_end)
        self.boards[player][left] = Tile(slot.domino.left_terrain, slot.domino.left_crowns, slot.domino.number, ANCHOR_LEFT)
        self.boards[player][right] = Tile(slot.domino.right_terrain, slot.domino.right_crowns, slot.domino.number, ANCHOR_RIGHT)
        slot.placed = True
        self._advance_placement()

    def _advance_placement(self):
        self.place_cursor += 1
        self._advance_past_empty_placers()
        if all(slot.placed for slot in self.current_draft):
            self._start_round()

    def _advance_past_empty_placers(self):
        while self.phase == PHASE_PLACE and self.place_cursor < len(self.place_order):
            player = self.place_order[self.place_cursor]
            if any(slot.player == player and not slot.placed for slot in self.current_draft):
                return
            self.place_cursor += 1

    def _candidate_anchors(self, player: int) -> List[Tuple[int, int]]:
        board = self.boards[player]
        candidates = set()
        for coord in board:
            for neighbor in self._neighbors(coord):
                if neighbor not in board:
                    candidates.add(neighbor)
        if not candidates:
            candidates.add((0, 0))
        return sorted(candidates, key=lambda coord: (abs(coord[0]) + abs(coord[1]), coord[1], coord[0]))

    def _is_valid_placement(
        self,
        player: int,
        domino: DominoSpec,
        orientation: int,
        x: int,
        y: int,
        anchor_end: int,
    ) -> bool:
        left, right = self._cells_for(domino, orientation, x, y, anchor_end)
        board = self.boards[player]
        if left in board or right in board:
            return False
        if left == right:
            return False
        if not self._within_board_limit(player, (left, right)):
            return False

        anchor_coord = left if anchor_end == ANCHOR_LEFT else right
        if not any(neighbor in board for neighbor in self._neighbors(anchor_coord)):
            return False

        return self._has_valid_touch(board, left, domino.left_terrain) or self._has_valid_touch(board, right, domino.right_terrain)

    def _feedback_anchor_end(
        self,
        player: int,
        domino: DominoSpec,
        orientation: int,
        x: int,
        y: int,
    ) -> Optional[int]:
        if self._is_valid_placement(player, domino, orientation, x, y, ANCHOR_LEFT):
            return ANCHOR_LEFT
        if self._is_valid_placement(player, domino, orientation, x, y, ANCHOR_RIGHT):
            return ANCHOR_RIGHT
        return None

    def _within_board_limit(self, player: int, cells: Sequence[Tuple[int, int]]) -> bool:
        x_min, x_max, y_min, y_max = self.board_bounds(player, cells)
        return (x_max - x_min + 1) <= self.board_limit and (y_max - y_min + 1) <= self.board_limit

    def _has_valid_touch(self, board: Dict[Tuple[int, int], Tile], coord: Tuple[int, int], terrain: int) -> bool:
        for neighbor in self._neighbors(coord):
            tile = board.get(neighbor)
            if not tile:
                continue
            if tile.terrain == TERRAIN_CASTLE or tile.terrain == terrain:
                return True
        return False

    def _cells_for(
        self,
        domino: DominoSpec,
        orientation: int,
        x: int,
        y: int,
        anchor_end: int,
    ) -> Tuple[Tuple[int, int], Tuple[int, int]]:
        dx, dy = LEFT_TO_RIGHT_OFFSETS[orientation]
        if anchor_end == ANCHOR_LEFT:
            left = (x, y)
            right = (x + dx, y + dy)
        else:
            right = (x, y)
            left = (x - dx, y - dy)
        return left, right

    def _placement_key(self, domino: DominoSpec, orientation: int, x: int, y: int, anchor_end: int) -> Tuple:
        left, right = self._cells_for(domino, orientation, x, y, anchor_end)
        cells = sorted((
            (left[0], left[1], domino.left_terrain, domino.left_crowns),
            (right[0], right[1], domino.right_terrain, domino.right_crowns),
        ))
        return (domino.number, tuple(cells))

    def _board_features(self, player: int) -> List[int]:
        board = self.boards[player]
        values: List[int] = []
        for y in range(COORD_MIN, COORD_MAX + 1):
            for x in range(COORD_MIN, COORD_MAX + 1):
                tile = board.get((x, y))
                values.append(0 if tile is None else tile.terrain)
                values.append(0 if tile is None else tile.crowns)
        return values

    @staticmethod
    def _neighbors(coord: Tuple[int, int]) -> Iterable[Tuple[int, int]]:
        x, y = coord
        for dx, dy in NEIGHBORS:
            yield x + dx, y + dy


def random_legal_action(env: KingdominoEnv, rng: random.Random) -> int:
    legal = env.legal_actions()
    if not legal:
        raise RuntimeError("no legal actions available")
    return rng.choice(legal)


def greedy_policy_action(env: KingdominoEnv, player: int = 0) -> int:
    legal = env.legal_actions()
    if not legal:
        raise RuntimeError("no legal actions available")
    if env.current_player != player:
        return legal[0]
    if env.phase == PHASE_DRAFT:
        return max(legal, key=lambda action: _draft_score(env.current_draft[action].domino))
    if env.phase == PHASE_PLACE:
        if legal == [SKIP_ACTION]:
            return SKIP_ACTION
        return max(legal, key=lambda action: _placement_heuristic(env, player, action))
    return legal[0]


def _draft_score(domino: DominoSpec) -> float:
    crowns = domino.left_crowns + domino.right_crowns
    terrain_diversity = 0.5 if domino.left_terrain != domino.right_terrain else 0.0
    return crowns * 12.0 + domino.number * 0.25 + terrain_diversity


def _placement_heuristic(env: KingdominoEnv, player: int, action: int) -> float:
    decoded = decode_placement_action(action)
    if decoded is None:
        return -10**9
    draft_index, orientation, x, y, anchor_end = decoded
    slot = env.current_draft[draft_index]
    left, right = env._cells_for(slot.domino, orientation, x, y, anchor_end)
    board = env.boards[player]

    def touch_score(coord: Tuple[int, int], terrain: int, crowns: int) -> float:
        score = crowns * 10.0
        for neighbor in env._neighbors(coord):
            tile = board.get(neighbor)
            if not tile:
                continue
            if tile.terrain == terrain:
                score += 3.0 + crowns
            elif tile.terrain == TERRAIN_CASTLE:
                score += 1.5
        return score

    compactness = -0.1 * (abs(left[0]) + abs(left[1]) + abs(right[0]) + abs(right[1]))
    return (
        touch_score(left, slot.domino.left_terrain, slot.domino.left_crowns)
        + touch_score(right, slot.domino.right_terrain, slot.domino.right_crowns)
        + compactness
        - slot.domino.number * 0.005
    )
