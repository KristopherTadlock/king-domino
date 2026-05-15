# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
# cython: initializedcheck=False

cdef int TERRAIN_CASTLE = 0


cpdef int score_board_flat(object terrains, object crowns, int span):
    """Score a fixed-size flat board representation.

    `terrains` and `crowns` are flat row-major sequences. Empty cells are -1,
    castles are 0, and normal terrains are positive ints.
    """
    cdef int n = span * span
    cdef list visited = [0] * n
    cdef int total = 0
    cdef int idx
    cdef int terrain

    for idx in range(n):
        terrain = <int>terrains[idx]
        if terrain <= TERRAIN_CASTLE or visited[idx]:
            continue
        total += _score_region(terrains, crowns, visited, span, idx, terrain)

    return total


cdef int _score_region(object terrains, object crowns, list visited, int span, int start, int terrain):
    cdef list stack = [start]
    cdef int count = 0
    cdef int crown_count = 0
    cdef int idx
    cdef int x
    cdef int y
    cdef int neighbor

    visited[start] = 1
    while stack:
        idx = <int>stack.pop()
        count += 1
        crown_count += <int>crowns[idx]
        x = idx % span
        y = idx // span

        if y > 0:
            neighbor = idx - span
            _push_if_match(terrains, visited, stack, neighbor, terrain)
        if y < span - 1:
            neighbor = idx + span
            _push_if_match(terrains, visited, stack, neighbor, terrain)
        if x > 0:
            neighbor = idx - 1
            _push_if_match(terrains, visited, stack, neighbor, terrain)
        if x < span - 1:
            neighbor = idx + 1
            _push_if_match(terrains, visited, stack, neighbor, terrain)

    return count * crown_count


cdef void _push_if_match(object terrains, list visited, list stack, int idx, int terrain):
    if not visited[idx] and <int>terrains[idx] == terrain:
        visited[idx] = 1
        stack.append(idx)


cdef int PHASE_DRAFT = 0
cdef int PHASE_PLACE = 1
cdef int PHASE_DONE = 2
cdef int TERRAIN_EMPTY = -1
cdef int TERRAIN_WHEAT = 1
cdef int TERRAIN_PASTURE = 2
cdef int TERRAIN_WATER = 3
cdef int TERRAIN_BOG = 4
cdef int TERRAIN_FOREST = 5
cdef int TERRAIN_MINE = 6
cdef int ANCHOR_LEFT = 0
cdef int ANCHOR_RIGHT = 1
cdef int BOARD_LIMIT = 7
cdef int COORD_MIN = -6
cdef int COORD_MAX = 6
cdef int COORD_SPAN = 13
DEF BOARD_CELLS_CONST = 169
cdef int BOARD_CELLS = BOARD_CELLS_CONST
cdef int N_DRAFT_ACTIONS = 4
cdef int N_PLACEMENT_ACTIONS = 4 * 4 * COORD_SPAN * COORD_SPAN * 2
cdef int N_SKIP_ACTION = N_DRAFT_ACTIONS + N_PLACEMENT_ACTIONS
cdef int N_ACTION_COUNT = N_SKIP_ACTION + 1


DECK_LEFT_TERRAIN = (
    0,
    TERRAIN_WHEAT, TERRAIN_WHEAT, TERRAIN_FOREST, TERRAIN_FOREST,
    TERRAIN_FOREST, TERRAIN_FOREST, TERRAIN_WATER, TERRAIN_WATER,
    TERRAIN_WATER, TERRAIN_PASTURE, TERRAIN_PASTURE, TERRAIN_BOG,
    TERRAIN_WHEAT, TERRAIN_WHEAT, TERRAIN_WHEAT, TERRAIN_WHEAT,
    TERRAIN_FOREST, TERRAIN_FOREST, TERRAIN_WHEAT, TERRAIN_WHEAT,
    TERRAIN_WHEAT, TERRAIN_WHEAT, TERRAIN_WHEAT, TERRAIN_FOREST,
    TERRAIN_FOREST, TERRAIN_FOREST, TERRAIN_FOREST, TERRAIN_FOREST,
    TERRAIN_FOREST, TERRAIN_WATER, TERRAIN_WATER, TERRAIN_WATER,
    TERRAIN_WATER, TERRAIN_WATER, TERRAIN_WATER, TERRAIN_WHEAT,
    TERRAIN_WATER, TERRAIN_WHEAT, TERRAIN_PASTURE, TERRAIN_MINE,
    TERRAIN_WHEAT, TERRAIN_WATER, TERRAIN_WHEAT, TERRAIN_PASTURE,
    TERRAIN_MINE, TERRAIN_BOG, TERRAIN_BOG, TERRAIN_WHEAT,
)

DECK_LEFT_CROWNS = (
    0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0,
    1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1,
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 2, 0, 0, 0,
)

DECK_RIGHT_TERRAIN = (
    0,
    TERRAIN_WHEAT, TERRAIN_WHEAT, TERRAIN_FOREST, TERRAIN_FOREST,
    TERRAIN_FOREST, TERRAIN_FOREST, TERRAIN_WATER, TERRAIN_WATER,
    TERRAIN_WATER, TERRAIN_PASTURE, TERRAIN_PASTURE, TERRAIN_BOG,
    TERRAIN_FOREST, TERRAIN_WATER, TERRAIN_PASTURE, TERRAIN_BOG,
    TERRAIN_WATER, TERRAIN_PASTURE, TERRAIN_FOREST, TERRAIN_WATER,
    TERRAIN_PASTURE, TERRAIN_BOG, TERRAIN_MINE, TERRAIN_WHEAT,
    TERRAIN_WHEAT, TERRAIN_WHEAT, TERRAIN_WHEAT, TERRAIN_WATER,
    TERRAIN_PASTURE, TERRAIN_WHEAT, TERRAIN_WHEAT, TERRAIN_FOREST,
    TERRAIN_FOREST, TERRAIN_FOREST, TERRAIN_FOREST, TERRAIN_PASTURE,
    TERRAIN_PASTURE, TERRAIN_BOG, TERRAIN_BOG, TERRAIN_WHEAT,
    TERRAIN_PASTURE, TERRAIN_PASTURE, TERRAIN_BOG, TERRAIN_BOG,
    TERRAIN_WHEAT, TERRAIN_MINE, TERRAIN_MINE, TERRAIN_MINE,
)

DECK_RIGHT_CROWNS = (
    0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0,
    1, 1, 1, 1, 0,
    2, 2, 2, 2, 2, 2, 2, 3,
)


cdef inline int _coord_to_idx(int x, int y):
    if x < COORD_MIN or x > COORD_MAX or y < COORD_MIN or y > COORD_MAX:
        return -1
    return (y - COORD_MIN) * COORD_SPAN + (x - COORD_MIN)


cdef inline int _idx_to_x(int idx):
    return (idx % COORD_SPAN) + COORD_MIN


cdef inline int _idx_to_y(int idx):
    return (idx // COORD_SPAN) + COORD_MIN


cdef inline int _encode_placement_action(int draft_index, int orientation, int x, int y, int anchor_end):
    cdef int orientation_steps = orientation // 90
    cdef int coord_x = x - COORD_MIN
    cdef int coord_y = y - COORD_MIN
    cdef int encoded = (((draft_index * 4 + orientation_steps) * COORD_SPAN + coord_x) * COORD_SPAN + coord_y) * 2 + anchor_end
    return N_DRAFT_ACTIONS + encoded


def native_action_count():
    return N_ACTION_COUNT


cdef class NativeKingdominoEnv:
    cdef public int phase
    cdef public int pick_cursor
    cdef public int place_cursor
    cdef public int round
    cdef int done_flag
    cdef unsigned int seed
    cdef unsigned int rng_t
    cdef int deck[48]
    cdef int deck_pos
    cdef int terrain[2][BOARD_CELLS_CONST]
    cdef int crowns[2][BOARD_CELLS_CONST]
    cdef int domino_num[2][BOARD_CELLS_CONST]
    cdef int domino_end[2][BOARD_CELLS_CONST]
    cdef int current_draft_num[4]
    cdef int draft_player[4]
    cdef int draft_placed[4]
    cdef int pick_order_values[4]
    cdef int place_order_values[4]
    cdef int place_count

    def __init__(self, int seed=1):
        self.reset(seed)

    @property
    def done(self):
        return bool(self.done_flag)

    @property
    def current_player(self):
        cdef int player = self._current_player()
        return None if player < 0 else player

    @property
    def pick_order(self):
        return [self.pick_order_values[i] for i in range(4)]

    @property
    def place_order(self):
        return [self.place_order_values[i] for i in range(self.place_count)]

    @property
    def current_draft(self):
        return [
            {
                "domino": self.current_draft_num[i],
                "player": None if self.draft_player[i] < 0 else self.draft_player[i],
                "placed": bool(self.draft_placed[i]),
            }
            for i in range(4)
        ]

    def reset(self, seed=None):
        cdef int i
        cdef int base0
        cdef int base1
        if seed is not None:
            self.seed = (<unsigned int>seed) & 0xFFFFFFFF
        self.rng_t = self.seed

        for i in range(48):
            self.deck[i] = i + 1
        self._shuffle_deck()
        for i in range(48):
            self.deck[i] = i + 1
        self._shuffle_deck()

        for i in range(BOARD_CELLS):
            self.terrain[0][i] = TERRAIN_EMPTY
            self.terrain[1][i] = TERRAIN_EMPTY
            self.crowns[0][i] = 0
            self.crowns[1][i] = 0
            self.domino_num[0][i] = 0
            self.domino_num[1][i] = 0
            self.domino_end[0][i] = 0
            self.domino_end[1][i] = 0

        i = _coord_to_idx(0, 0)
        self.terrain[0][i] = TERRAIN_CASTLE
        self.terrain[1][i] = TERRAIN_CASTLE

        base0 = 0
        base1 = 1
        if <int>(self._rand() * 2.0) == 0:
            base0 = 1
            base1 = 0
        self.pick_order_values[0] = base0
        self.pick_order_values[1] = base1
        self.pick_order_values[2] = base0
        self.pick_order_values[3] = base1
        for i in range(4):
            self.place_order_values[i] = -1
            self.current_draft_num[i] = 0
            self.draft_player[i] = -1
            self.draft_placed[i] = 0

        self.deck_pos = 0
        self.phase = PHASE_DRAFT
        self.pick_cursor = 0
        self.place_cursor = 0
        self.place_count = 0
        self.round = 0
        self.done_flag = 0
        self._start_round()
        return self.observe()

    def legal_actions(self):
        cdef int i
        cdef int player
        cdef list rows
        if self.done_flag:
            return []
        if self.phase == PHASE_DRAFT:
            return [
                i
                for i in range(4)
                if self.draft_player[i] < 0 and not self.draft_placed[i]
            ]
        if self.phase == PHASE_PLACE:
            player = self._current_player()
            rows = self._placement_rows(player)
            if rows:
                return [row[5] for row in rows]
            return [N_SKIP_ACTION]
        return []

    def action_mask(self):
        cdef list mask = [0] * N_ACTION_COUNT
        cdef int action
        for action in self.legal_actions():
            mask[action] = 1
        return mask

    def observe(self):
        cdef tuple scores = self.scores()
        cdef list flat = [
            self.phase,
            self._current_player(),
            self.pick_cursor,
            self.place_cursor,
            self.round,
            scores[0],
            scores[1],
        ]
        cdef int i
        cdef int player
        for i in range(4):
            flat.extend([
                self.current_draft_num[i],
                self.draft_player[i],
                self.draft_placed[i],
            ])
        for player in range(2):
            flat.extend(self._board_features(player))
        return {
            "observation": flat,
            "action_mask": self.action_mask(),
            "phase": self.phase,
            "current_player": None if self._current_player() < 0 else self._current_player(),
            "scores": scores,
            "round": self.round,
        }

    def step(self, int action, bint observe=True):
        cdef int player_before
        cdef tuple scores_before
        cdef tuple scores_after
        cdef double reward
        cdef dict info
        cdef list legal

        if self.done_flag:
            return self._step_observation(observe), 0.0, True, {"error": "game already done"}

        player_before = self._current_player()
        scores_before = self.scores()
        legal = self.legal_actions()
        if action not in legal:
            self.done_flag = 1
            self.phase = PHASE_DONE
            return self._step_observation(observe), -1.0, True, {"error": f"illegal action {action}"}

        if self.phase == PHASE_DRAFT:
            self._pick_draft(action)
        elif self.phase == PHASE_PLACE:
            if action == N_SKIP_ACTION:
                self._skip_current_placement()
            else:
                self._place_action(action)

        scores_after = self.scores()
        reward = (scores_after[0] - scores_before[0]) / 100.0
        if self.done_flag:
            if scores_after[0] > scores_after[1]:
                reward += 1.0
            elif scores_after[0] < scores_after[1]:
                reward -= 1.0

        info = {"player": player_before, "scores": scores_after}
        return self._step_observation(observe), reward, bool(self.done_flag), info

    def scores(self):
        return self.score_board(0), self.score_board(1)

    def score_board(self, int player):
        cdef int visited[BOARD_CELLS_CONST]
        cdef int stack[BOARD_CELLS_CONST]
        cdef int i
        cdef int terrain
        cdef int total = 0
        for i in range(BOARD_CELLS):
            visited[i] = 0
        for i in range(BOARD_CELLS):
            terrain = self.terrain[player][i]
            if terrain <= TERRAIN_CASTLE or visited[i]:
                continue
            total += self._score_region(player, i, terrain, visited, stack)
        return total

    def placement_actions_for_player(self, int player):
        return [row[5] for row in self._placement_rows(player)]

    def greedy_action(self, int player=0):
        cdef list legal = self.legal_actions()
        cdef int action
        cdef int best = -1
        cdef double score
        cdef double best_score = -1000000000.0
        if not legal:
            raise RuntimeError("no legal actions available")
        if self._current_player() != player:
            return legal[0]
        if self.phase == PHASE_DRAFT:
            for action in legal:
                score = self._draft_score(self.current_draft_num[action])
                if score > best_score:
                    best_score = score
                    best = action
            return best
        if self.phase == PHASE_PLACE:
            if len(legal) == 1 and legal[0] == N_SKIP_ACTION:
                return N_SKIP_ACTION
            for action in legal:
                score = self._placement_heuristic(player, action)
                if score > best_score:
                    best_score = score
                    best = action
            return best
        return legal[0]

    cdef object _step_observation(self, bint observe):
        if observe:
            return self.observe()
        return None

    cdef int _current_player(self):
        if self.done_flag:
            return -1
        if self.phase == PHASE_DRAFT:
            if self.pick_cursor >= 4:
                return -1
            return self.pick_order_values[self.pick_cursor]
        if self.phase == PHASE_PLACE:
            if self.place_cursor >= self.place_count:
                return -1
            return self.place_order_values[self.place_cursor]
        return -1

    cdef double _rand(self):
        cdef unsigned int r
        self.rng_t = self.rng_t + <unsigned int>0x6D2B79F5
        r = (self.rng_t ^ (self.rng_t >> 15)) * (1 | self.rng_t)
        r = r ^ (r + ((r ^ (r >> 7)) * (61 | r)))
        return ((r ^ (r >> 14)) & <unsigned int>0xFFFFFFFF) / 4294967296.0

    cdef void _shuffle_deck(self):
        cdef int i
        cdef int j
        cdef int tmp
        for i in range(47, 0, -1):
            j = <int>(self._rand() * (i + 1))
            tmp = self.deck[i]
            self.deck[i] = self.deck[j]
            self.deck[j] = tmp

    cdef void _start_round(self):
        cdef int i
        if self.deck_pos >= 48:
            self.done_flag = 1
            self.phase = PHASE_DONE
            return
        self.round += 1
        self.phase = PHASE_DRAFT
        self.pick_cursor = 0
        self.place_cursor = 0
        self.place_count = 0
        for i in range(4):
            self.current_draft_num[i] = self.deck[self.deck_pos + i]
            self.draft_player[i] = -1
            self.draft_placed[i] = 0
            self.place_order_values[i] = -1
        self.deck_pos += 4
        self._sort_current_draft()

    cdef void _sort_current_draft(self):
        cdef int i
        cdef int j
        cdef int value
        for i in range(1, 4):
            value = self.current_draft_num[i]
            j = i - 1
            while j >= 0 and self.current_draft_num[j] > value:
                self.current_draft_num[j + 1] = self.current_draft_num[j]
                j -= 1
            self.current_draft_num[j + 1] = value

    cdef void _pick_draft(self, int draft_index):
        cdef int i
        self.draft_player[draft_index] = self._current_player()
        self.pick_cursor += 1
        if self.pick_cursor < 4:
            for i in range(4):
                if self.draft_player[i] < 0 and not self.draft_placed[i]:
                    return
        for i in range(4):
            if self.draft_player[i] < 0:
                self.draft_placed[i] = 1
        self.place_count = 0
        for i in range(4):
            if self.draft_player[i] >= 0:
                self.place_order_values[self.place_count] = self.draft_player[i]
                self.pick_order_values[self.place_count] = self.draft_player[i]
                self.place_count += 1
        self.place_cursor = 0
        self.phase = PHASE_PLACE
        self._advance_past_empty_placers()

    cdef void _skip_current_placement(self):
        cdef int player = self._current_player()
        cdef int i
        if player < 0:
            return
        for i in range(4):
            if self.draft_player[i] == player and not self.draft_placed[i]:
                self.draft_placed[i] = 1
                break
        self._advance_placement()

    cdef void _place_action(self, int action):
        cdef int value = action - N_DRAFT_ACTIONS
        cdef int anchor_end = value % 2
        cdef int coord_y
        cdef int coord_x
        cdef int orientation_steps
        cdef int draft_index
        cdef int x
        cdef int y
        value //= 2
        coord_y = value % COORD_SPAN
        value //= COORD_SPAN
        coord_x = value % COORD_SPAN
        value //= COORD_SPAN
        orientation_steps = value % 4
        draft_index = value // 4
        x = coord_x + COORD_MIN
        y = coord_y + COORD_MIN
        self._place_decoded(draft_index, orientation_steps * 90, x, y, anchor_end)

    cdef void _place_decoded(self, int draft_index, int orientation, int x, int y, int anchor_end):
        cdef int player = self._current_player()
        cdef int number = self.current_draft_num[draft_index]
        cdef int lx
        cdef int ly
        cdef int rx
        cdef int ry
        cdef int lidx
        cdef int ridx
        self._cells_for(orientation, x, y, anchor_end, &lx, &ly, &rx, &ry)
        lidx = _coord_to_idx(lx, ly)
        ridx = _coord_to_idx(rx, ry)
        self.terrain[player][lidx] = <int>DECK_LEFT_TERRAIN[number]
        self.crowns[player][lidx] = <int>DECK_LEFT_CROWNS[number]
        self.domino_num[player][lidx] = number
        self.domino_end[player][lidx] = ANCHOR_LEFT
        self.terrain[player][ridx] = <int>DECK_RIGHT_TERRAIN[number]
        self.crowns[player][ridx] = <int>DECK_RIGHT_CROWNS[number]
        self.domino_num[player][ridx] = number
        self.domino_end[player][ridx] = ANCHOR_RIGHT
        self.draft_placed[draft_index] = 1
        self._advance_placement()

    cdef void _advance_placement(self):
        cdef int i
        self.place_cursor += 1
        self._advance_past_empty_placers()
        for i in range(4):
            if not self.draft_placed[i]:
                return
        self._start_round()

    cdef void _advance_past_empty_placers(self):
        cdef int player
        cdef int i
        cdef bint has_tile
        while self.phase == PHASE_PLACE and self.place_cursor < self.place_count:
            player = self.place_order_values[self.place_cursor]
            has_tile = False
            for i in range(4):
                if self.draft_player[i] == player and not self.draft_placed[i]:
                    has_tile = True
                    break
            if has_tile:
                return
            self.place_cursor += 1

    cdef list _placement_rows(self, int player):
        cdef list rows = []
        cdef object seen = set()
        cdef list candidates
        cdef int draft_index
        cdef int orientation
        cdef int x
        cdef int y
        cdef int anchor_end
        cdef int number
        cdef object candidate
        cdef object key
        if self.phase != PHASE_PLACE or player < 0:
            return rows
        candidates = self._candidate_anchors(player)
        for draft_index in range(4):
            if self.draft_player[draft_index] != player or self.draft_placed[draft_index]:
                continue
            number = self.current_draft_num[draft_index]
            for orientation in (0, 90, 180, 270):
                for candidate in candidates:
                    x = <int>candidate[0]
                    y = <int>candidate[1]
                    anchor_end = self._feedback_anchor_end(player, number, orientation, x, y)
                    if anchor_end < 0:
                        continue
                    key = self._placement_key(number, orientation, x, y, anchor_end)
                    if key in seen:
                        continue
                    seen.add(key)
                    rows.append((
                        number,
                        orientation,
                        y,
                        x,
                        anchor_end,
                        _encode_placement_action(draft_index, orientation, x, y, anchor_end),
                    ))
        rows.sort()
        return rows

    cdef list _candidate_anchors(self, int player):
        cdef object seen = set()
        cdef list candidates = []
        cdef int idx
        cdef int x
        cdef int y
        for idx in range(BOARD_CELLS):
            if self.terrain[player][idx] == TERRAIN_EMPTY:
                continue
            x = _idx_to_x(idx)
            y = _idx_to_y(idx)
            self._add_candidate(player, x + 1, y, seen, candidates)
            self._add_candidate(player, x - 1, y, seen, candidates)
            self._add_candidate(player, x, y + 1, seen, candidates)
            self._add_candidate(player, x, y - 1, seen, candidates)
        if not candidates:
            candidates.append((0, 0))
        candidates.sort(key=lambda coord: (abs(coord[0]) + abs(coord[1]), coord[1], coord[0]))
        return candidates

    cdef void _add_candidate(self, int player, int x, int y, object seen, list candidates):
        cdef int idx = _coord_to_idx(x, y)
        cdef object key
        if idx < 0 or self.terrain[player][idx] != TERRAIN_EMPTY:
            return
        key = (x, y)
        if key in seen:
            return
        seen.add(key)
        candidates.append(key)

    cdef int _feedback_anchor_end(self, int player, int number, int orientation, int x, int y):
        if self._is_valid_placement(player, number, orientation, x, y, ANCHOR_LEFT):
            return ANCHOR_LEFT
        if self._is_valid_placement(player, number, orientation, x, y, ANCHOR_RIGHT):
            return ANCHOR_RIGHT
        return -1

    cdef bint _is_valid_placement(self, int player, int number, int orientation, int x, int y, int anchor_end):
        cdef int lx
        cdef int ly
        cdef int rx
        cdef int ry
        cdef int lidx
        cdef int ridx
        cdef int anchor_x
        cdef int anchor_y
        self._cells_for(orientation, x, y, anchor_end, &lx, &ly, &rx, &ry)
        if lx == rx and ly == ry:
            return False
        lidx = _coord_to_idx(lx, ly)
        ridx = _coord_to_idx(rx, ry)
        if lidx < 0 or ridx < 0:
            return False
        if self.terrain[player][lidx] != TERRAIN_EMPTY or self.terrain[player][ridx] != TERRAIN_EMPTY:
            return False
        if not self._within_board_limit(player, lx, ly, rx, ry):
            return False
        if anchor_end == ANCHOR_LEFT:
            anchor_x = lx
            anchor_y = ly
        else:
            anchor_x = rx
            anchor_y = ry
        if not self._has_any_neighbor(player, anchor_x, anchor_y):
            return False
        return (
            self._has_valid_touch(player, lx, ly, <int>DECK_LEFT_TERRAIN[number])
            or self._has_valid_touch(player, rx, ry, <int>DECK_RIGHT_TERRAIN[number])
        )

    cdef void _cells_for(self, int orientation, int x, int y, int anchor_end, int* lx, int* ly, int* rx, int* ry):
        cdef int dx = 0
        cdef int dy = 0
        if orientation == 0:
            dx = 1
            dy = 0
        elif orientation == 90:
            dx = 0
            dy = -1
        elif orientation == 180:
            dx = -1
            dy = 0
        else:
            dx = 0
            dy = 1
        if anchor_end == ANCHOR_LEFT:
            lx[0] = x
            ly[0] = y
            rx[0] = x + dx
            ry[0] = y + dy
        else:
            rx[0] = x
            ry[0] = y
            lx[0] = x - dx
            ly[0] = y - dy

    cdef object _placement_key(self, int number, int orientation, int x, int y, int anchor_end):
        cdef int lx
        cdef int ly
        cdef int rx
        cdef int ry
        cdef int lt = <int>DECK_LEFT_TERRAIN[number]
        cdef int lc = <int>DECK_LEFT_CROWNS[number]
        cdef int rt = <int>DECK_RIGHT_TERRAIN[number]
        cdef int rc = <int>DECK_RIGHT_CROWNS[number]
        self._cells_for(orientation, x, y, anchor_end, &lx, &ly, &rx, &ry)
        if lx < rx or (lx == rx and ly <= ry):
            return (number, lx, ly, lt, lc, rx, ry, rt, rc)
        return (number, rx, ry, rt, rc, lx, ly, lt, lc)

    cdef bint _within_board_limit(self, int player, int lx, int ly, int rx, int ry):
        cdef int idx
        cdef int x
        cdef int y
        cdef int x_min = lx if lx < rx else rx
        cdef int x_max = lx if lx > rx else rx
        cdef int y_min = ly if ly < ry else ry
        cdef int y_max = ly if ly > ry else ry
        for idx in range(BOARD_CELLS):
            if self.terrain[player][idx] == TERRAIN_EMPTY:
                continue
            x = _idx_to_x(idx)
            y = _idx_to_y(idx)
            if x < x_min:
                x_min = x
            if x > x_max:
                x_max = x
            if y < y_min:
                y_min = y
            if y > y_max:
                y_max = y
        return (x_max - x_min + 1) <= BOARD_LIMIT and (y_max - y_min + 1) <= BOARD_LIMIT

    cdef bint _has_any_neighbor(self, int player, int x, int y):
        return (
            self._occupied(player, x + 1, y)
            or self._occupied(player, x - 1, y)
            or self._occupied(player, x, y + 1)
            or self._occupied(player, x, y - 1)
        )

    cdef bint _occupied(self, int player, int x, int y):
        cdef int idx = _coord_to_idx(x, y)
        return idx >= 0 and self.terrain[player][idx] != TERRAIN_EMPTY

    cdef bint _has_valid_touch(self, int player, int x, int y, int terrain):
        return (
            self._touch_matches(player, x + 1, y, terrain)
            or self._touch_matches(player, x - 1, y, terrain)
            or self._touch_matches(player, x, y + 1, terrain)
            or self._touch_matches(player, x, y - 1, terrain)
        )

    cdef bint _touch_matches(self, int player, int x, int y, int terrain):
        cdef int idx = _coord_to_idx(x, y)
        cdef int other
        if idx < 0:
            return False
        other = self.terrain[player][idx]
        return other == TERRAIN_CASTLE or other == terrain

    cdef int _score_region(self, int player, int start, int terrain, int* visited, int* stack):
        cdef int top = 0
        cdef int idx
        cdef int nidx
        cdef int x
        cdef int y
        cdef int count = 0
        cdef int crown_count = 0
        stack[top] = start
        top += 1
        visited[start] = 1
        while top > 0:
            top -= 1
            idx = stack[top]
            count += 1
            crown_count += self.crowns[player][idx]
            x = _idx_to_x(idx)
            y = _idx_to_y(idx)

            nidx = _coord_to_idx(x + 1, y)
            if nidx >= 0 and not visited[nidx] and self.terrain[player][nidx] == terrain:
                visited[nidx] = 1
                stack[top] = nidx
                top += 1
            nidx = _coord_to_idx(x - 1, y)
            if nidx >= 0 and not visited[nidx] and self.terrain[player][nidx] == terrain:
                visited[nidx] = 1
                stack[top] = nidx
                top += 1
            nidx = _coord_to_idx(x, y + 1)
            if nidx >= 0 and not visited[nidx] and self.terrain[player][nidx] == terrain:
                visited[nidx] = 1
                stack[top] = nidx
                top += 1
            nidx = _coord_to_idx(x, y - 1)
            if nidx >= 0 and not visited[nidx] and self.terrain[player][nidx] == terrain:
                visited[nidx] = 1
                stack[top] = nidx
                top += 1
        return count * crown_count

    cdef double _draft_score(self, int number):
        cdef int crowns = <int>DECK_LEFT_CROWNS[number] + <int>DECK_RIGHT_CROWNS[number]
        cdef double terrain_diversity = 0.5 if DECK_LEFT_TERRAIN[number] != DECK_RIGHT_TERRAIN[number] else 0.0
        return crowns * 12.0 + number * 0.25 + terrain_diversity

    cdef double _placement_heuristic(self, int player, int action):
        cdef int value = action - N_DRAFT_ACTIONS
        cdef int anchor_end = value % 2
        cdef int coord_y
        cdef int coord_x
        cdef int orientation_steps
        cdef int draft_index
        cdef int x
        cdef int y
        cdef int number
        cdef int lx
        cdef int ly
        cdef int rx
        cdef int ry
        value //= 2
        coord_y = value % COORD_SPAN
        value //= COORD_SPAN
        coord_x = value % COORD_SPAN
        value //= COORD_SPAN
        orientation_steps = value % 4
        draft_index = value // 4
        x = coord_x + COORD_MIN
        y = coord_y + COORD_MIN
        number = self.current_draft_num[draft_index]
        self._cells_for(orientation_steps * 90, x, y, anchor_end, &lx, &ly, &rx, &ry)
        return (
            self._touch_score(player, lx, ly, <int>DECK_LEFT_TERRAIN[number], <int>DECK_LEFT_CROWNS[number])
            + self._touch_score(player, rx, ry, <int>DECK_RIGHT_TERRAIN[number], <int>DECK_RIGHT_CROWNS[number])
            - 0.1 * (abs(lx) + abs(ly) + abs(rx) + abs(ry))
            - number * 0.005
        )

    cdef double _touch_score(self, int player, int x, int y, int terrain, int crowns):
        cdef double score = crowns * 10.0
        score += self._touch_score_one(player, x + 1, y, terrain, crowns)
        score += self._touch_score_one(player, x - 1, y, terrain, crowns)
        score += self._touch_score_one(player, x, y + 1, terrain, crowns)
        score += self._touch_score_one(player, x, y - 1, terrain, crowns)
        return score

    cdef double _touch_score_one(self, int player, int x, int y, int terrain, int crowns):
        cdef int idx = _coord_to_idx(x, y)
        cdef int other
        if idx < 0:
            return 0.0
        other = self.terrain[player][idx]
        if other == terrain:
            return 3.0 + crowns
        if other == TERRAIN_CASTLE:
            return 1.5
        return 0.0

    cdef list _board_features(self, int player):
        cdef list values = []
        cdef int idx
        for idx in range(BOARD_CELLS):
            if self.terrain[player][idx] == TERRAIN_EMPTY:
                values.append(0)
                values.append(0)
            else:
                values.append(self.terrain[player][idx])
                values.append(self.crowns[player][idx])
        return values
