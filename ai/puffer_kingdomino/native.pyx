# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
# cython: initializedcheck=False

import numpy as np

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
DEF ACTION_COUNT_CONST = 5413
DEF PLACEMENT_SEEN_CONST = BOARD_CELLS_CONST * BOARD_CELLS_CONST * 2
DEF FEATURE_BOARD_OFFSET_CONST = 19
DEF FEATURE_BOARD_VALUES_CONST = BOARD_CELLS_CONST * 2
DEF FEATURE_ACTION_SIZE_CONST = 40
DEF FEATURE_RICH_SIZE_CONST = 96
DEF FEATURE_MAX_SEEN_CONST = 512
cdef int BOARD_CELLS = BOARD_CELLS_CONST
cdef int N_DRAFT_ACTIONS = 4
cdef int N_PLACEMENT_ACTIONS = 4 * 4 * COORD_SPAN * COORD_SPAN * 2
cdef int N_SKIP_ACTION = N_DRAFT_ACTIONS + N_PLACEMENT_ACTIONS
cdef int N_ACTION_COUNT = N_SKIP_ACTION + 1
cdef int N_OBSERVATION_COUNT = 695


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


cdef struct FeatureMetrics:
    double width_after
    double height_after
    double width_growth
    double height_growth
    double distance
    double score_delta
    double same_touch_count
    double castle_touch_count
    double occupied_touch_count
    double empty_touch_count
    double region_size_sum
    double region_crowns_sum
    double left_region_size
    double right_region_size
    double left_region_crowns
    double right_region_crowns
    double left_same_touches
    double right_same_touches
    double left_castle_touches
    double right_castle_touches
    double left_neighbor_crowns
    double right_neighbor_crowns
    double count
    double best_score_delta
    double best_touch_count


cdef struct NeighborStats:
    double same
    double castle
    double occupied
    double empty
    double neighbor_crowns
    double region_size
    double region_crowns


def write_rich_candidate_features_from_observations(
    object observations,
    object actions,
    object out,
    object legal_mask,
    float scale=50.0,
):
    """Fill rich candidate features for a batch of observations/actions.

    This mirrors candidate_policy.py's Python reference path but keeps the
    board scans, draft mobility pass, and placement metrics in Cython so PPO
    can spend time learning instead of rebuilding Python dicts and sets.
    """

    cdef float[:, ::1] obs_view = observations
    cdef long long[:, ::1] action_view = actions
    cdef float[:, :, ::1] out_view = out
    cdef unsigned char[:, ::1] mask_view = legal_mask

    if obs_view.shape[0] != action_view.shape[0]:
        raise ValueError("observations and actions must have the same batch dimension")
    if out_view.shape[0] != action_view.shape[0] or out_view.shape[1] != action_view.shape[1]:
        raise ValueError("output must match action batch dimensions")
    if out_view.shape[2] < FEATURE_RICH_SIZE_CONST:
        raise ValueError("output feature width is too small")
    if mask_view.shape[0] != action_view.shape[0] or mask_view.shape[1] != action_view.shape[1]:
        raise ValueError("legal_mask must match action batch dimensions")

    cdef Py_ssize_t row
    for row in range(action_view.shape[0]):
        _write_rich_candidate_feature_row(obs_view, action_view, out_view, mask_view, row, scale)
    return out


cdef inline int _feature_abs(int value):
    return -value if value < 0 else value


cdef inline int _feature_scaled_int(float value, float scale):
    cdef float scaled = value * scale
    if scaled >= 0:
        return <int>(scaled + 0.5)
    return <int>(scaled - 0.5)


cdef inline int _feature_terrain_plus(int terrain):
    return terrain + 1


cdef inline bint _feature_coord_in_bounds(int x, int y):
    return x >= COORD_MIN and x <= COORD_MAX and y >= COORD_MIN and y <= COORD_MAX


cdef inline bint _feature_decode_placement_action(
    int action,
    int* draft_index,
    int* orientation,
    int* x,
    int* y,
    int* anchor_end,
):
    cdef int value
    cdef int coord_x
    cdef int coord_y
    cdef int orientation_steps
    if action < N_DRAFT_ACTIONS or action == N_SKIP_ACTION or action < 0 or action >= N_ACTION_COUNT:
        return False
    value = action - N_DRAFT_ACTIONS
    anchor_end[0] = value % 2
    value //= 2
    coord_y = value % COORD_SPAN
    value //= COORD_SPAN
    coord_x = value % COORD_SPAN
    value //= COORD_SPAN
    orientation_steps = value % 4
    draft_index[0] = value // 4
    orientation[0] = orientation_steps * 90
    x[0] = coord_x + COORD_MIN
    y[0] = coord_y + COORD_MIN
    return draft_index[0] >= 0 and draft_index[0] < N_DRAFT_ACTIONS


cdef inline void _feature_cells_for(
    int orientation,
    int x,
    int y,
    int anchor_end,
    int* lx,
    int* ly,
    int* rx,
    int* ry,
):
    cdef int dx = 0
    cdef int dy = 0
    if orientation == 0:
        dx = 1
    elif orientation == 90:
        dy = -1
    elif orientation == 180:
        dx = -1
    else:
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


cdef void _write_rich_candidate_feature_row(
    float[:, ::1] observations,
    long long[:, ::1] actions,
    float[:, :, ::1] out,
    unsigned char[:, ::1] legal_mask,
    Py_ssize_t row,
    float scale,
):
    cdef int terrain[BOARD_CELLS_CONST]
    cdef int crowns[BOARD_CELLS_CONST]
    cdef int draft_num[4]
    cdef int left_terrain_plus[4]
    cdef int right_terrain_plus[4]
    cdef int left_crowns[4]
    cdef int right_crowns[4]
    cdef int phase = _feature_scaled_int(observations[row, 0], scale)
    cdef int current_player = _feature_scaled_int(observations[row, 1], scale)
    cdef int player = current_player if current_player == 0 or current_player == 1 else 0
    cdef double self_score = <double>_feature_scaled_int(observations[row, 5 + player], scale)
    cdef double opp_score = <double>_feature_scaled_int(observations[row, 5 + (1 - player)], scale)
    cdef int round_value = _feature_scaled_int(observations[row, 4], scale)
    cdef int min_x
    cdef int max_x
    cdef int min_y
    cdef int max_y
    cdef int i
    cdef int action
    cdef int draft_index
    cdef int orientation
    cdef int x
    cdef int y
    cdef int anchor_end
    cdef int lx
    cdef int ly
    cdef int rx
    cdef int ry
    cdef Py_ssize_t col
    cdef FeatureMetrics metrics

    _feature_parse_board(observations, row, player, scale, terrain, crowns)
    _feature_existing_bounds(terrain, &min_x, &max_x, &min_y, &max_y)
    for i in range(4):
        draft_num[i] = _feature_scaled_int(observations[row, 7 + i * 3], scale)
        if draft_num[i] >= 1 and draft_num[i] <= 48:
            left_terrain_plus[i] = _feature_terrain_plus(<int>DECK_LEFT_TERRAIN[draft_num[i]])
            right_terrain_plus[i] = _feature_terrain_plus(<int>DECK_RIGHT_TERRAIN[draft_num[i]])
            left_crowns[i] = <int>DECK_LEFT_CROWNS[draft_num[i]]
            right_crowns[i] = <int>DECK_RIGHT_CROWNS[draft_num[i]]
        else:
            left_terrain_plus[i] = 0
            right_terrain_plus[i] = 0
            left_crowns[i] = 0
            right_crowns[i] = 0

    for col in range(actions.shape[1]):
        if not legal_mask[row, col]:
            continue
        action = <int>actions[row, col]
        if action < 0 or action >= N_ACTION_COUNT:
            continue

        _feature_write_static_action(out, row, col, action)
        out[row, col, 40] = 1.0 if phase == PHASE_DRAFT else 0.0
        out[row, col, 41] = 1.0 if phase == PHASE_PLACE else 0.0
        out[row, col, 42 + player] = 1.0
        out[row, col, 44] = round_value / 12.0
        out[row, col, 45] = self_score / 100.0
        out[row, col, 46] = opp_score / 100.0
        out[row, col, 47] = (self_score - opp_score) / 100.0

        if action == N_SKIP_ACTION:
            out[row, col, 95] = 1.0
            continue

        if action < N_DRAFT_ACTIONS:
            draft_index = action
        else:
            if not _feature_decode_placement_action(action, &draft_index, &orientation, &x, &y, &anchor_end):
                continue
        if draft_index < 0 or draft_index >= N_DRAFT_ACTIONS or draft_num[draft_index] <= 0:
            continue

        _feature_write_domino_features(
            out,
            row,
            col,
            draft_num[draft_index],
            left_terrain_plus[draft_index],
            left_crowns[draft_index],
            right_terrain_plus[draft_index],
            right_crowns[draft_index],
            draft_index,
        )

        if action < N_DRAFT_ACTIONS:
            _feature_best_mobility_metrics(
                terrain,
                crowns,
                draft_num[draft_index],
                left_terrain_plus[draft_index],
                left_crowns[draft_index],
                right_terrain_plus[draft_index],
                right_crowns[draft_index],
                min_x,
                max_x,
                min_y,
                max_y,
                &metrics,
            )
            _feature_write_metric_features(out, row, col, &metrics)
            out[row, col, 54] = 1.0 if metrics.count > 64.0 else metrics.count / 64.0
            out[row, col, 55] = metrics.best_score_delta / 50.0
            out[row, col, 56] = 1.0 if metrics.best_touch_count > 8.0 else metrics.best_touch_count / 8.0
            continue

        _feature_cells_for(orientation, x, y, anchor_end, &lx, &ly, &rx, &ry)
        _feature_placement_metrics_for_cells(
            terrain,
            crowns,
            left_terrain_plus[draft_index],
            left_crowns[draft_index],
            right_terrain_plus[draft_index],
            right_crowns[draft_index],
            lx,
            ly,
            rx,
            ry,
            min_x,
            max_x,
            min_y,
            max_y,
            &metrics,
        )
        _feature_write_metric_features(out, row, col, &metrics)
        out[row, col, 69 + anchor_end] = 1.0
        out[row, col, 71] = x / <double>6.0
        out[row, col, 72] = y / <double>6.0


cdef void _feature_parse_board(
    float[:, ::1] observations,
    Py_ssize_t row,
    int player,
    float scale,
    int* terrain,
    int* crowns,
):
    cdef int start = FEATURE_BOARD_OFFSET_CONST + player * FEATURE_BOARD_VALUES_CONST
    cdef int idx
    cdef int offset
    for idx in range(BOARD_CELLS_CONST):
        offset = start + idx * 2
        terrain[idx] = _feature_scaled_int(observations[row, offset], scale)
        crowns[idx] = _feature_scaled_int(observations[row, offset + 1], scale)


cdef void _feature_existing_bounds(int* terrain, int* min_x, int* max_x, int* min_y, int* max_y):
    cdef int idx
    cdef int x
    cdef int y
    cdef bint found = False
    min_x[0] = 0
    max_x[0] = 0
    min_y[0] = 0
    max_y[0] = 0
    for idx in range(BOARD_CELLS_CONST):
        if terrain[idx] <= 0:
            continue
        x = _idx_to_x(idx)
        y = _idx_to_y(idx)
        if not found:
            min_x[0] = x
            max_x[0] = x
            min_y[0] = y
            max_y[0] = y
            found = True
            continue
        if x < min_x[0]:
            min_x[0] = x
        if x > max_x[0]:
            max_x[0] = x
        if y < min_y[0]:
            min_y[0] = y
        if y > max_y[0]:
            max_y[0] = y


cdef inline void _feature_clear_metrics(FeatureMetrics* metrics):
    metrics.width_after = 0.0
    metrics.height_after = 0.0
    metrics.width_growth = 0.0
    metrics.height_growth = 0.0
    metrics.distance = 0.0
    metrics.score_delta = 0.0
    metrics.same_touch_count = 0.0
    metrics.castle_touch_count = 0.0
    metrics.occupied_touch_count = 0.0
    metrics.empty_touch_count = 0.0
    metrics.region_size_sum = 0.0
    metrics.region_crowns_sum = 0.0
    metrics.left_region_size = 0.0
    metrics.right_region_size = 0.0
    metrics.left_region_crowns = 0.0
    metrics.right_region_crowns = 0.0
    metrics.left_same_touches = 0.0
    metrics.right_same_touches = 0.0
    metrics.left_castle_touches = 0.0
    metrics.right_castle_touches = 0.0
    metrics.left_neighbor_crowns = 0.0
    metrics.right_neighbor_crowns = 0.0
    metrics.count = 0.0
    metrics.best_score_delta = 0.0
    metrics.best_touch_count = 0.0


cdef inline void _feature_write_static_action(float[:, :, ::1] out, Py_ssize_t row, Py_ssize_t col, int action):
    cdef int value
    cdef int coord_x
    cdef int coord_y
    cdef int orientation_steps
    cdef int draft_index
    cdef int anchor_end
    cdef int x
    cdef int y
    if action < N_DRAFT_ACTIONS:
        out[row, col, 0] = 1.0
        out[row, col, 3 + action] = 1.0
        return
    if action == N_SKIP_ACTION:
        out[row, col, 2] = 1.0
        return
    value = action - N_DRAFT_ACTIONS
    anchor_end = value % 2
    value //= 2
    coord_y = value % COORD_SPAN
    value //= COORD_SPAN
    coord_x = value % COORD_SPAN
    value //= COORD_SPAN
    orientation_steps = value % 4
    draft_index = value // 4
    x = coord_x + COORD_MIN
    y = coord_y + COORD_MIN
    out[row, col, 1] = 1.0
    out[row, col, 3 + draft_index] = 1.0
    out[row, col, 7 + orientation_steps] = 1.0
    out[row, col, 11 + coord_x] = 1.0
    out[row, col, 24 + coord_y] = 1.0
    out[row, col, 37 + anchor_end] = 1.0
    out[row, col, 39] = (_feature_abs(x) + _feature_abs(y)) / 12.0


cdef inline void _feature_write_domino_features(
    float[:, :, ::1] out,
    Py_ssize_t row,
    Py_ssize_t col,
    int number,
    int left_terrain_plus,
    int left_crowns,
    int right_terrain_plus,
    int right_crowns,
    int draft_index,
):
    cdef int left_terrain = left_terrain_plus - 1
    cdef int right_terrain = right_terrain_plus - 1
    out[row, col, 48] = number / 48.0
    out[row, col, 49] = (left_crowns + right_crowns) / 6.0
    out[row, col, 50] = left_crowns / 3.0
    out[row, col, 51] = right_crowns / 3.0
    out[row, col, 52] = 1.0 if left_terrain == right_terrain else 0.0
    out[row, col, 53] = draft_index / 3.0
    if left_terrain >= TERRAIN_WHEAT and left_terrain <= TERRAIN_MINE:
        out[row, col, 57 + (left_terrain - TERRAIN_WHEAT)] = 1.0
    if right_terrain >= TERRAIN_WHEAT and right_terrain <= TERRAIN_MINE:
        out[row, col, 63 + (right_terrain - TERRAIN_WHEAT)] = 1.0


cdef inline void _feature_write_metric_features(
    float[:, :, ::1] out,
    Py_ssize_t row,
    Py_ssize_t col,
    FeatureMetrics* metrics,
):
    out[row, col, 73] = metrics.width_after / BOARD_LIMIT
    out[row, col, 74] = metrics.height_after / BOARD_LIMIT
    out[row, col, 75] = metrics.width_growth / BOARD_LIMIT
    out[row, col, 76] = metrics.height_growth / BOARD_LIMIT
    out[row, col, 77] = metrics.distance / 12.0
    out[row, col, 78] = metrics.score_delta / 50.0
    out[row, col, 79] = metrics.same_touch_count / 8.0
    out[row, col, 80] = metrics.castle_touch_count / 8.0
    out[row, col, 81] = metrics.occupied_touch_count / 8.0
    out[row, col, 82] = metrics.empty_touch_count / 8.0
    out[row, col, 83] = metrics.region_size_sum / 20.0
    out[row, col, 84] = metrics.region_crowns_sum / 8.0
    out[row, col, 85] = metrics.left_region_size / 20.0
    out[row, col, 86] = metrics.right_region_size / 20.0
    out[row, col, 87] = metrics.left_region_crowns / 8.0
    out[row, col, 88] = metrics.right_region_crowns / 8.0
    out[row, col, 89] = metrics.left_same_touches / 4.0
    out[row, col, 90] = metrics.right_same_touches / 4.0
    out[row, col, 91] = metrics.left_castle_touches / 4.0
    out[row, col, 92] = metrics.right_castle_touches / 4.0
    out[row, col, 93] = metrics.left_neighbor_crowns / 6.0
    out[row, col, 94] = metrics.right_neighbor_crowns / 6.0


cdef void _feature_best_mobility_metrics(
    int* terrain,
    int* crowns,
    int number,
    int left_terrain_plus,
    int left_crowns,
    int right_terrain_plus,
    int right_crowns,
    int min_x,
    int max_x,
    int min_y,
    int max_y,
    FeatureMetrics* metrics,
):
    cdef int candidates_x[BOARD_CELLS_CONST]
    cdef int candidates_y[BOARD_CELLS_CONST]
    cdef int candidate_count
    cdef int seen_low[FEATURE_MAX_SEEN_CONST]
    cdef int seen_high[FEATURE_MAX_SEEN_CONST]
    cdef int seen_assignment[FEATURE_MAX_SEEN_CONST]
    cdef int seen_count = 0
    cdef int orientation
    cdef int candidate_index
    cdef int anchor_end
    cdef int x
    cdef int y
    cdef int lx
    cdef int ly
    cdef int rx
    cdef int ry
    cdef int lidx
    cdef int ridx
    cdef int low_idx
    cdef int high_idx
    cdef int assignment
    cdef int i
    cdef bint duplicate
    cdef int score_delta
    cdef double touch_count
    cdef int best_lx = 0
    cdef int best_ly = 0
    cdef int best_rx = 0
    cdef int best_ry = 0
    cdef double best_score_delta = -1000000000.0
    cdef double best_touch_count = -1.0
    cdef double move_count
    cdef bint has_best = False

    _feature_clear_metrics(metrics)
    candidate_count = _feature_candidate_anchors(terrain, candidates_x, candidates_y)
    for orientation in (0, 90, 180, 270):
        for candidate_index in range(candidate_count):
            x = candidates_x[candidate_index]
            y = candidates_y[candidate_index]
            for anchor_end in (ANCHOR_LEFT, ANCHOR_RIGHT):
                _feature_cells_for(orientation, x, y, anchor_end, &lx, &ly, &rx, &ry)
                if not _feature_is_valid_placement(
                    terrain,
                    left_terrain_plus,
                    right_terrain_plus,
                    lx,
                    ly,
                    rx,
                    ry,
                    min_x,
                    max_x,
                    min_y,
                    max_y,
                ):
                    continue
                lidx = _coord_to_idx(lx, ly)
                ridx = _coord_to_idx(rx, ry)
                if lidx <= ridx:
                    low_idx = lidx
                    high_idx = ridx
                    assignment = 0
                else:
                    low_idx = ridx
                    high_idx = lidx
                    assignment = 1
                if left_terrain_plus == right_terrain_plus and left_crowns == right_crowns:
                    assignment = 0
                duplicate = False
                for i in range(seen_count):
                    if seen_low[i] == low_idx and seen_high[i] == high_idx and seen_assignment[i] == assignment:
                        duplicate = True
                        break
                if duplicate:
                    continue
                if seen_count < FEATURE_MAX_SEEN_CONST:
                    seen_low[seen_count] = low_idx
                    seen_high[seen_count] = high_idx
                    seen_assignment[seen_count] = assignment
                    seen_count += 1
                metrics.count += 1.0
                score_delta = _feature_score_delta_local(
                    terrain,
                    crowns,
                    left_terrain_plus,
                    left_crowns,
                    right_terrain_plus,
                    right_crowns,
                    lx,
                    ly,
                    rx,
                    ry,
                )
                touch_count = _feature_same_touch_count(terrain, left_terrain_plus, right_terrain_plus, lx, ly, rx, ry)
                if score_delta > best_score_delta or (score_delta == best_score_delta and touch_count > best_touch_count):
                    best_score_delta = score_delta
                    best_touch_count = touch_count
                    best_lx = lx
                    best_ly = ly
                    best_rx = rx
                    best_ry = ry
                    has_best = True

    if has_best:
        move_count = metrics.count
        _feature_placement_metrics_for_cells(
            terrain,
            crowns,
            left_terrain_plus,
            left_crowns,
            right_terrain_plus,
            right_crowns,
            best_lx,
            best_ly,
            best_rx,
            best_ry,
            min_x,
            max_x,
            min_y,
            max_y,
            metrics,
        )
        metrics.count = move_count
        metrics.best_score_delta = best_score_delta if best_score_delta > 0.0 else 0.0
        metrics.best_touch_count = best_touch_count if best_touch_count > 0.0 else 0.0


cdef int _feature_candidate_anchors(int* terrain, int* candidates_x, int* candidates_y):
    cdef int seen[BOARD_CELLS_CONST]
    cdef int idx
    cdef int count = 0
    cdef int x
    cdef int y
    cdef int nidx
    for idx in range(BOARD_CELLS_CONST):
        seen[idx] = 0
    for idx in range(BOARD_CELLS_CONST):
        if terrain[idx] <= 0:
            continue
        x = _idx_to_x(idx)
        y = _idx_to_y(idx)
        nidx = _coord_to_idx(x + 1, y)
        if nidx >= 0 and terrain[nidx] <= 0 and not seen[nidx]:
            seen[nidx] = 1
            candidates_x[count] = x + 1
            candidates_y[count] = y
            count += 1
        nidx = _coord_to_idx(x - 1, y)
        if nidx >= 0 and terrain[nidx] <= 0 and not seen[nidx]:
            seen[nidx] = 1
            candidates_x[count] = x - 1
            candidates_y[count] = y
            count += 1
        nidx = _coord_to_idx(x, y + 1)
        if nidx >= 0 and terrain[nidx] <= 0 and not seen[nidx]:
            seen[nidx] = 1
            candidates_x[count] = x
            candidates_y[count] = y + 1
            count += 1
        nidx = _coord_to_idx(x, y - 1)
        if nidx >= 0 and terrain[nidx] <= 0 and not seen[nidx]:
            seen[nidx] = 1
            candidates_x[count] = x
            candidates_y[count] = y - 1
            count += 1
    if count == 0:
        candidates_x[0] = 0
        candidates_y[0] = 0
        count = 1
    _feature_sort_candidates(candidates_x, candidates_y, count)
    return count


cdef void _feature_sort_candidates(int* candidates_x, int* candidates_y, int count):
    cdef int i
    cdef int j
    cdef int x
    cdef int y
    for i in range(1, count):
        x = candidates_x[i]
        y = candidates_y[i]
        j = i - 1
        while j >= 0 and _feature_candidate_sort_after(candidates_x[j], candidates_y[j], x, y):
            candidates_x[j + 1] = candidates_x[j]
            candidates_y[j + 1] = candidates_y[j]
            j -= 1
        candidates_x[j + 1] = x
        candidates_y[j + 1] = y


cdef inline bint _feature_candidate_sort_after(int ax, int ay, int bx, int by):
    cdef int ad = _feature_abs(ax) + _feature_abs(ay)
    cdef int bd = _feature_abs(bx) + _feature_abs(by)
    if ad != bd:
        return ad > bd
    if ay != by:
        return ay > by
    return ax > bx


cdef inline bint _feature_is_valid_placement(
    int* terrain,
    int left_terrain_plus,
    int right_terrain_plus,
    int lx,
    int ly,
    int rx,
    int ry,
    int min_x,
    int max_x,
    int min_y,
    int max_y,
):
    cdef int lidx
    cdef int ridx
    cdef int width
    cdef int height
    cdef int after_min_x
    cdef int after_max_x
    cdef int after_min_y
    cdef int after_max_y
    if lx == rx and ly == ry:
        return False
    if not _feature_coord_in_bounds(lx, ly) or not _feature_coord_in_bounds(rx, ry):
        return False
    lidx = _coord_to_idx(lx, ly)
    ridx = _coord_to_idx(rx, ry)
    if terrain[lidx] > 0 or terrain[ridx] > 0:
        return False
    after_min_x = min_x
    after_max_x = max_x
    after_min_y = min_y
    after_max_y = max_y
    if lx < after_min_x:
        after_min_x = lx
    if rx < after_min_x:
        after_min_x = rx
    if lx > after_max_x:
        after_max_x = lx
    if rx > after_max_x:
        after_max_x = rx
    if ly < after_min_y:
        after_min_y = ly
    if ry < after_min_y:
        after_min_y = ry
    if ly > after_max_y:
        after_max_y = ly
    if ry > after_max_y:
        after_max_y = ry
    width = after_max_x - after_min_x + 1
    height = after_max_y - after_min_y + 1
    if width > BOARD_LIMIT or height > BOARD_LIMIT:
        return False
    return (
        _feature_has_valid_touch(terrain, lx, ly, left_terrain_plus)
        or _feature_has_valid_touch(terrain, rx, ry, right_terrain_plus)
    )


cdef inline bint _feature_has_valid_touch(int* terrain, int x, int y, int terrain_plus):
    cdef int nidx
    nidx = _coord_to_idx(x + 1, y)
    if nidx >= 0 and (terrain[nidx] == TERRAIN_CASTLE + 1 or terrain[nidx] == terrain_plus):
        return True
    nidx = _coord_to_idx(x - 1, y)
    if nidx >= 0 and (terrain[nidx] == TERRAIN_CASTLE + 1 or terrain[nidx] == terrain_plus):
        return True
    nidx = _coord_to_idx(x, y + 1)
    if nidx >= 0 and (terrain[nidx] == TERRAIN_CASTLE + 1 or terrain[nidx] == terrain_plus):
        return True
    nidx = _coord_to_idx(x, y - 1)
    if nidx >= 0 and (terrain[nidx] == TERRAIN_CASTLE + 1 or terrain[nidx] == terrain_plus):
        return True
    return False


cdef void _feature_placement_metrics_for_cells(
    int* terrain,
    int* crowns,
    int left_terrain_plus,
    int left_crowns,
    int right_terrain_plus,
    int right_crowns,
    int lx,
    int ly,
    int rx,
    int ry,
    int min_x,
    int max_x,
    int min_y,
    int max_y,
    FeatureMetrics* metrics,
):
    cdef NeighborStats left_stats
    cdef NeighborStats right_stats
    cdef int after_min_x
    cdef int after_max_x
    cdef int after_min_y
    cdef int after_max_y
    cdef int width_before
    cdef int height_before
    _feature_clear_metrics(metrics)
    if not _feature_coord_in_bounds(lx, ly) or not _feature_coord_in_bounds(rx, ry):
        return
    metrics.score_delta = _feature_score_delta_local(
        terrain,
        crowns,
        left_terrain_plus,
        left_crowns,
        right_terrain_plus,
        right_crowns,
        lx,
        ly,
        rx,
        ry,
    )
    after_min_x = min_x
    after_max_x = max_x
    after_min_y = min_y
    after_max_y = max_y
    if lx < after_min_x:
        after_min_x = lx
    if rx < after_min_x:
        after_min_x = rx
    if lx > after_max_x:
        after_max_x = lx
    if rx > after_max_x:
        after_max_x = rx
    if ly < after_min_y:
        after_min_y = ly
    if ry < after_min_y:
        after_min_y = ry
    if ly > after_max_y:
        after_max_y = ly
    if ry > after_max_y:
        after_max_y = ry
    metrics.width_after = after_max_x - after_min_x + 1
    metrics.height_after = after_max_y - after_min_y + 1
    width_before = max_x - min_x + 1
    height_before = max_y - min_y + 1
    metrics.width_growth = metrics.width_after - width_before
    if metrics.width_growth < 0.0:
        metrics.width_growth = 0.0
    metrics.height_growth = metrics.height_after - height_before
    if metrics.height_growth < 0.0:
        metrics.height_growth = 0.0
    metrics.distance = (_feature_abs(lx) + _feature_abs(ly) + _feature_abs(rx) + _feature_abs(ry)) / 2.0

    _feature_neighbor_stats(terrain, crowns, lx, ly, left_terrain_plus, &left_stats)
    _feature_neighbor_stats(terrain, crowns, rx, ry, right_terrain_plus, &right_stats)
    metrics.same_touch_count = left_stats.same + right_stats.same
    metrics.castle_touch_count = left_stats.castle + right_stats.castle
    metrics.occupied_touch_count = left_stats.occupied + right_stats.occupied
    metrics.empty_touch_count = left_stats.empty + right_stats.empty
    metrics.region_size_sum = left_stats.region_size + right_stats.region_size
    metrics.region_crowns_sum = left_stats.region_crowns + right_stats.region_crowns
    metrics.left_region_size = left_stats.region_size
    metrics.right_region_size = right_stats.region_size
    metrics.left_region_crowns = left_stats.region_crowns
    metrics.right_region_crowns = right_stats.region_crowns
    metrics.left_same_touches = left_stats.same
    metrics.right_same_touches = right_stats.same
    metrics.left_castle_touches = left_stats.castle
    metrics.right_castle_touches = right_stats.castle
    metrics.left_neighbor_crowns = left_stats.neighbor_crowns
    metrics.right_neighbor_crowns = right_stats.neighbor_crowns


cdef int _feature_score_delta_local(
    int* terrain,
    int* crowns,
    int left_terrain_plus,
    int left_crowns,
    int right_terrain_plus,
    int right_crowns,
    int lx,
    int ly,
    int rx,
    int ry,
):
    cdef int group_size[8]
    cdef int group_crowns[8]
    cdef int seen_regions[BOARD_CELLS_CONST]
    cdef int region_cells[BOARD_CELLS_CONST]
    cdef int terrain_values[2]
    cdef int crown_values[2]
    cdef int xs[2]
    cdef int ys[2]
    cdef int i
    cdef int j
    cdef int nidx
    cdef int terrain_plus
    cdef int region_size
    cdef int region_crowns
    cdef int region_count
    cdef int before_score = 0
    cdef int after_score = 0
    for i in range(8):
        group_size[i] = 0
        group_crowns[i] = 0
    for i in range(BOARD_CELLS_CONST):
        seen_regions[i] = 0
    terrain_values[0] = left_terrain_plus
    terrain_values[1] = right_terrain_plus
    crown_values[0] = left_crowns
    crown_values[1] = right_crowns
    xs[0] = lx
    xs[1] = rx
    ys[0] = ly
    ys[1] = ry
    for i in range(2):
        terrain_plus = terrain_values[i]
        if terrain_plus <= 0 or terrain_plus >= 8:
            continue
        group_size[terrain_plus] += 1
        group_crowns[terrain_plus] += crown_values[i]
        nidx = _coord_to_idx(xs[i] + 1, ys[i])
        if nidx >= 0 and not seen_regions[nidx] and terrain[nidx] == terrain_plus:
            _feature_region_collect(terrain, crowns, nidx, terrain_plus, region_cells, &region_count, &region_size, &region_crowns)
            for j in range(region_count):
                seen_regions[region_cells[j]] = 1
            before_score += region_size * region_crowns
            group_size[terrain_plus] += region_size
            group_crowns[terrain_plus] += region_crowns
        nidx = _coord_to_idx(xs[i] - 1, ys[i])
        if nidx >= 0 and not seen_regions[nidx] and terrain[nidx] == terrain_plus:
            _feature_region_collect(terrain, crowns, nidx, terrain_plus, region_cells, &region_count, &region_size, &region_crowns)
            for j in range(region_count):
                seen_regions[region_cells[j]] = 1
            before_score += region_size * region_crowns
            group_size[terrain_plus] += region_size
            group_crowns[terrain_plus] += region_crowns
        nidx = _coord_to_idx(xs[i], ys[i] + 1)
        if nidx >= 0 and not seen_regions[nidx] and terrain[nidx] == terrain_plus:
            _feature_region_collect(terrain, crowns, nidx, terrain_plus, region_cells, &region_count, &region_size, &region_crowns)
            for j in range(region_count):
                seen_regions[region_cells[j]] = 1
            before_score += region_size * region_crowns
            group_size[terrain_plus] += region_size
            group_crowns[terrain_plus] += region_crowns
        nidx = _coord_to_idx(xs[i], ys[i] - 1)
        if nidx >= 0 and not seen_regions[nidx] and terrain[nidx] == terrain_plus:
            _feature_region_collect(terrain, crowns, nidx, terrain_plus, region_cells, &region_count, &region_size, &region_crowns)
            for j in range(region_count):
                seen_regions[region_cells[j]] = 1
            before_score += region_size * region_crowns
            group_size[terrain_plus] += region_size
            group_crowns[terrain_plus] += region_crowns
    for i in range(8):
        after_score += group_size[i] * group_crowns[i]
    return after_score - before_score


cdef void _feature_region_collect(
    int* terrain,
    int* crowns,
    int start_idx,
    int terrain_plus,
    int* region_cells,
    int* region_count,
    int* size,
    int* crown_count,
):
    cdef int stack[BOARD_CELLS_CONST]
    cdef int seen[BOARD_CELLS_CONST]
    cdef int stack_count = 1
    cdef int idx
    cdef int next_idx
    cdef int x
    cdef int y
    cdef int i
    for i in range(BOARD_CELLS_CONST):
        seen[i] = 0
    stack[0] = start_idx
    seen[start_idx] = 1
    size[0] = 0
    crown_count[0] = 0
    region_count[0] = 0
    while stack_count > 0:
        stack_count -= 1
        idx = stack[stack_count]
        if terrain[idx] != terrain_plus:
            continue
        region_cells[region_count[0]] = idx
        region_count[0] += 1
        size[0] += 1
        crown_count[0] += crowns[idx]
        x = _idx_to_x(idx)
        y = _idx_to_y(idx)
        next_idx = _coord_to_idx(x + 1, y)
        if next_idx >= 0 and not seen[next_idx] and terrain[next_idx] == terrain_plus:
            seen[next_idx] = 1
            stack[stack_count] = next_idx
            stack_count += 1
        next_idx = _coord_to_idx(x - 1, y)
        if next_idx >= 0 and not seen[next_idx] and terrain[next_idx] == terrain_plus:
            seen[next_idx] = 1
            stack[stack_count] = next_idx
            stack_count += 1
        next_idx = _coord_to_idx(x, y + 1)
        if next_idx >= 0 and not seen[next_idx] and terrain[next_idx] == terrain_plus:
            seen[next_idx] = 1
            stack[stack_count] = next_idx
            stack_count += 1
        next_idx = _coord_to_idx(x, y - 1)
        if next_idx >= 0 and not seen[next_idx] and terrain[next_idx] == terrain_plus:
            seen[next_idx] = 1
            stack[stack_count] = next_idx
            stack_count += 1


cdef double _feature_same_touch_count(
    int* terrain,
    int left_terrain_plus,
    int right_terrain_plus,
    int lx,
    int ly,
    int rx,
    int ry,
):
    cdef double count = 0.0
    cdef int nidx
    nidx = _coord_to_idx(lx + 1, ly)
    if nidx >= 0 and terrain[nidx] == left_terrain_plus:
        count += 1.0
    nidx = _coord_to_idx(lx - 1, ly)
    if nidx >= 0 and terrain[nidx] == left_terrain_plus:
        count += 1.0
    nidx = _coord_to_idx(lx, ly + 1)
    if nidx >= 0 and terrain[nidx] == left_terrain_plus:
        count += 1.0
    nidx = _coord_to_idx(lx, ly - 1)
    if nidx >= 0 and terrain[nidx] == left_terrain_plus:
        count += 1.0
    nidx = _coord_to_idx(rx + 1, ry)
    if nidx >= 0 and terrain[nidx] == right_terrain_plus:
        count += 1.0
    nidx = _coord_to_idx(rx - 1, ry)
    if nidx >= 0 and terrain[nidx] == right_terrain_plus:
        count += 1.0
    nidx = _coord_to_idx(rx, ry + 1)
    if nidx >= 0 and terrain[nidx] == right_terrain_plus:
        count += 1.0
    nidx = _coord_to_idx(rx, ry - 1)
    if nidx >= 0 and terrain[nidx] == right_terrain_plus:
        count += 1.0
    return count


cdef void _feature_neighbor_stats(
    int* terrain,
    int* crowns,
    int x,
    int y,
    int terrain_plus,
    NeighborStats* stats,
):
    cdef int visited_regions[BOARD_CELLS_CONST]
    cdef int region_cells[BOARD_CELLS_CONST]
    cdef int region_count
    cdef int region_size
    cdef int region_crowns
    cdef int i
    stats.same = 0.0
    stats.castle = 0.0
    stats.occupied = 0.0
    stats.empty = 0.0
    stats.neighbor_crowns = 0.0
    stats.region_size = 0.0
    stats.region_crowns = 0.0
    for i in range(BOARD_CELLS_CONST):
        visited_regions[i] = 0
    _feature_neighbor_stats_one(terrain, crowns, x + 1, y, terrain_plus, stats, visited_regions, region_cells, &region_count, &region_size, &region_crowns)
    _feature_neighbor_stats_one(terrain, crowns, x - 1, y, terrain_plus, stats, visited_regions, region_cells, &region_count, &region_size, &region_crowns)
    _feature_neighbor_stats_one(terrain, crowns, x, y + 1, terrain_plus, stats, visited_regions, region_cells, &region_count, &region_size, &region_crowns)
    _feature_neighbor_stats_one(terrain, crowns, x, y - 1, terrain_plus, stats, visited_regions, region_cells, &region_count, &region_size, &region_crowns)


cdef void _feature_neighbor_stats_one(
    int* terrain,
    int* crowns,
    int x,
    int y,
    int terrain_plus,
    NeighborStats* stats,
    int* visited_regions,
    int* region_cells,
    int* region_count,
    int* region_size,
    int* region_crowns,
):
    cdef int idx
    cdef int i
    if not _feature_coord_in_bounds(x, y):
        stats.empty += 1.0
        return
    idx = _coord_to_idx(x, y)
    if terrain[idx] <= 0:
        stats.empty += 1.0
        return
    stats.occupied += 1.0
    stats.neighbor_crowns += crowns[idx]
    if terrain[idx] == TERRAIN_CASTLE + 1:
        stats.castle += 1.0
    if terrain[idx] == terrain_plus:
        stats.same += 1.0
        if not visited_regions[idx]:
            _feature_region_collect(terrain, crowns, idx, terrain_plus, region_cells, region_count, region_size, region_crowns)
            for i in range(region_count[0]):
                visited_regions[region_cells[i]] = 1
            stats.region_size += region_size[0]
            stats.region_crowns += region_crowns[0]


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
    cdef int board_x_min[2]
    cdef int board_x_max[2]
    cdef int board_y_min[2]
    cdef int board_y_max[2]
    cdef int current_draft_num[4]
    cdef int draft_player[4]
    cdef int draft_placed[4]
    cdef int pick_order_values[4]
    cdef int place_order_values[4]
    cdef int place_count
    cdef unsigned int placement_seen[PLACEMENT_SEEN_CONST]
    cdef unsigned int placement_seen_stamp

    def __init__(self, int seed=1):
        self.reset(seed)

    def clone(self):
        cdef NativeKingdominoEnv other = NativeKingdominoEnv(seed=1)
        cdef int i
        cdef int player
        cdef int idx
        other.phase = self.phase
        other.pick_cursor = self.pick_cursor
        other.place_cursor = self.place_cursor
        other.round = self.round
        other.done_flag = self.done_flag
        other.seed = self.seed
        other.rng_t = self.rng_t
        other.deck_pos = self.deck_pos
        other.place_count = self.place_count
        other.placement_seen_stamp = 1
        for i in range(48):
            other.deck[i] = self.deck[i]
        for player in range(2):
            other.board_x_min[player] = self.board_x_min[player]
            other.board_x_max[player] = self.board_x_max[player]
            other.board_y_min[player] = self.board_y_min[player]
            other.board_y_max[player] = self.board_y_max[player]
            for idx in range(BOARD_CELLS):
                other.terrain[player][idx] = self.terrain[player][idx]
                other.crowns[player][idx] = self.crowns[player][idx]
                other.domino_num[player][idx] = self.domino_num[player][idx]
                other.domino_end[player][idx] = self.domino_end[player][idx]
        for i in range(4):
            other.current_draft_num[i] = self.current_draft_num[i]
            other.draft_player[i] = self.draft_player[i]
            other.draft_placed[i] = self.draft_placed[i]
            other.pick_order_values[i] = self.pick_order_values[i]
            other.place_order_values[i] = self.place_order_values[i]
        for i in range(PLACEMENT_SEEN_CONST):
            other.placement_seen[i] = 0
        return other

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
        for i in range(2):
            self.board_x_min[i] = 0
            self.board_x_max[i] = 0
            self.board_y_min[i] = 0
            self.board_y_max[i] = 0

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
        cdef int actions[ACTION_COUNT_CONST]
        cdef int count
        cdef int i
        cdef int action
        count = self._fill_legal_actions_fast(actions)
        for i in range(count):
            action = actions[i]
            mask[action] = 1
        return mask

    def legal_action_count(self):
        cdef int actions[ACTION_COUNT_CONST]
        return self._fill_legal_actions_fast(actions)

    def sample_legal_action(self, object rng):
        cdef int actions[ACTION_COUNT_CONST]
        cdef int count = self._fill_legal_actions_fast(actions)
        cdef int index
        if count <= 0:
            raise RuntimeError("no legal actions available")
        index = <int>rng.randrange(count)
        return actions[index]

    def write_legal_actions(self, object out):
        cdef int[::1] values = out
        cdef int actions[ACTION_COUNT_CONST]
        cdef int count
        cdef int i
        count = self._fill_legal_actions_fast(actions)
        if values.shape[0] < count:
            raise ValueError("legal action buffer is too small")
        for i in range(count):
            values[i] = actions[i]
        return count

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

    def write_observation_vector(self, object out, float scale=50.0):
        cdef float[::1] values = out
        if values.shape[0] < N_OBSERVATION_COUNT:
            raise ValueError("observation buffer is too small")
        self._write_observation_vector(&values[0], scale)
        return N_OBSERVATION_COUNT

    def write_action_mask_vector(self, object out):
        cdef float[::1] values = out
        cdef int actions[ACTION_COUNT_CONST]
        cdef int count
        cdef int i
        if values.shape[0] < N_ACTION_COUNT:
            raise ValueError("action mask buffer is too small")
        for i in range(N_ACTION_COUNT):
            values[i] = 0.0
        count = self._fill_legal_actions_fast(actions)
        for i in range(count):
            values[actions[i]] = 1.0
        return N_ACTION_COUNT

    def step(self, int action, bint observe=True):
        if self.done_flag:
            return self._step_observation(observe), 0.0, True, {"error": "game already done"}

        if not self._is_legal_action_fast(action):
            self.done_flag = 1
            self.phase = PHASE_DONE
            return self._step_observation(observe), -1.0, True, {"error": f"illegal action {action}"}

        return self._step_after_legal(action, observe)

    def step_known_legal(self, int action, bint observe=False):
        if self.done_flag:
            return self._step_observation(observe), 0.0, True, {"error": "game already done"}
        return self._step_after_legal(action, observe)

    def step_random_legal(self, object rng, bint observe=False):
        cdef int actions[ACTION_COUNT_CONST]
        cdef int count
        cdef int action
        if self.done_flag:
            return self._step_observation(observe), 0.0, True, {"error": "game already done"}
        count = self._fill_legal_actions_fast(actions)
        if count <= 0:
            self.done_flag = 1
            self.phase = PHASE_DONE
            return self._step_observation(observe), -1.0, True, {"error": "no legal actions available"}
        action = actions[<int>rng.randrange(count)]
        return self._step_after_legal(action, observe)

    cdef object _step_after_legal(self, int action, bint observe):
        cdef int player_before
        cdef tuple scores_before
        cdef tuple scores_after
        cdef double reward
        cdef dict info

        player_before = self._current_player()
        scores_before = self.scores()

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
        cdef int actions[ACTION_COUNT_CONST]
        cdef int count
        cdef int i
        cdef int action
        cdef int best = -1
        cdef double score
        cdef double best_score = -1000000000.0
        count = self._fill_legal_actions_fast(actions)
        if count <= 0:
            raise RuntimeError("no legal actions available")
        if self._current_player() != player:
            return actions[0]
        if self.phase == PHASE_DRAFT:
            for i in range(count):
                action = actions[i]
                score = self._draft_score(self.current_draft_num[action])
                if score > best_score:
                    best_score = score
                    best = action
            return best
        if self.phase == PHASE_PLACE:
            if count == 1 and actions[0] == N_SKIP_ACTION:
                return N_SKIP_ACTION
            for i in range(count):
                action = actions[i]
                score = self._placement_heuristic(player, action)
                if score > best_score:
                    best_score = score
                    best = action
            return best
        return actions[0]

    def delta_greedy_action(self, int player=0):
        cdef int actions[ACTION_COUNT_CONST]
        cdef int count
        cdef int i
        cdef int action
        cdef int best = -1
        cdef double score
        cdef double best_score = -1000000000.0
        count = self._fill_legal_actions_fast(actions)
        if count <= 0:
            raise RuntimeError("no legal actions available")
        if self._current_player() != player:
            return actions[0]
        if self.phase == PHASE_DRAFT:
            for i in range(count):
                action = actions[i]
                score = self._draft_score(self.current_draft_num[action])
                if score > best_score:
                    best_score = score
                    best = action
            return best
        if self.phase == PHASE_PLACE:
            if count == 1 and actions[0] == N_SKIP_ACTION:
                return N_SKIP_ACTION
            for i in range(count):
                action = actions[i]
                score = (
                    self._placement_score_delta(player, action) * 100.0
                    + self._placement_heuristic(player, action)
                )
                if score > best_score:
                    best_score = score
                    best = action
            return best
        return actions[0]

    def weighted_action(self, int player, object weights):
        cdef int actions[ACTION_COUNT_CONST]
        cdef int count
        cdef int i
        cdef int action
        cdef int best = -1
        cdef double score
        cdef double best_score = -1000000000.0
        cdef double w0 = <double>weights[0]
        cdef double w1 = <double>weights[1]
        cdef double w2 = <double>weights[2]
        cdef double w3 = <double>weights[3]
        cdef double w4 = <double>weights[4]
        cdef double w5 = <double>weights[5]
        cdef double w6 = <double>weights[6]
        cdef double w7 = <double>weights[7]
        cdef double w8 = <double>weights[8]
        cdef double w9 = <double>weights[9]
        count = self._fill_legal_actions_fast(actions)
        if count <= 0:
            raise RuntimeError("no legal actions available")
        if self._current_player() != player:
            return actions[0]
        if self.phase == PHASE_DRAFT:
            for i in range(count):
                action = actions[i]
                score = self._weighted_draft_score(self.current_draft_num[action], w0, w1, w2)
                if score > best_score:
                    best_score = score
                    best = action
            return best
        if self.phase == PHASE_PLACE:
            if count == 1 and actions[0] == N_SKIP_ACTION:
                return N_SKIP_ACTION
            for i in range(count):
                action = actions[i]
                score = self._weighted_placement_score(player, action, w3, w4, w5, w6, w7, w8, w9)
                if score > best_score:
                    best_score = score
                    best = action
            return best
        return actions[0]

    def weighted_score(self, int player, int action, object weights):
        cdef double w0 = <double>weights[0]
        cdef double w1 = <double>weights[1]
        cdef double w2 = <double>weights[2]
        cdef double w3 = <double>weights[3]
        cdef double w4 = <double>weights[4]
        cdef double w5 = <double>weights[5]
        cdef double w6 = <double>weights[6]
        cdef double w7 = <double>weights[7]
        cdef double w8 = <double>weights[8]
        cdef double w9 = <double>weights[9]
        if action < N_DRAFT_ACTIONS:
            return self._weighted_draft_score(self.current_draft_num[action], w0, w1, w2)
        if action == N_SKIP_ACTION:
            return -1000000.0
        return self._weighted_placement_score(player, action, w3, w4, w5, w6, w7, w8, w9)

    def heuristic_score(self, int player, int action):
        if action < N_DRAFT_ACTIONS:
            return self._draft_score(self.current_draft_num[action])
        if action == N_SKIP_ACTION:
            return -1000000.0
        return self._placement_heuristic(player, action)

    def placement_score_delta(self, int player, int action):
        if action < N_DRAFT_ACTIONS or action == N_SKIP_ACTION:
            return 0
        return self._placement_score_delta(player, action)

    cdef object _step_observation(self, bint observe):
        if observe:
            return self.observe()
        return None

    cdef void _write_observation_vector(self, float* out, float scale):
        cdef int pos = 0
        cdef int score0
        cdef int score1
        cdef int i
        cdef int player
        cdef int idx
        score0 = self.score_board(0)
        score1 = self.score_board(1)
        out[pos] = self.phase / scale
        pos += 1
        out[pos] = self._current_player() / scale
        pos += 1
        out[pos] = self.pick_cursor / scale
        pos += 1
        out[pos] = self.place_cursor / scale
        pos += 1
        out[pos] = self.round / scale
        pos += 1
        out[pos] = score0 / scale
        pos += 1
        out[pos] = score1 / scale
        pos += 1

        for i in range(4):
            out[pos] = self.current_draft_num[i] / scale
            pos += 1
            out[pos] = self.draft_player[i] / scale
            pos += 1
            out[pos] = self.draft_placed[i] / scale
            pos += 1

        for player in range(2):
            for idx in range(BOARD_CELLS):
                if self.terrain[player][idx] == TERRAIN_EMPTY:
                    out[pos] = 0.0
                    pos += 1
                    out[pos] = 0.0
                    pos += 1
                else:
                    out[pos] = (self.terrain[player][idx] + 1) / scale
                    pos += 1
                    out[pos] = self.crowns[player][idx] / scale
                    pos += 1

    cdef int _fill_legal_actions_fast(self, int* actions):
        cdef int i
        cdef int count = 0
        cdef int player
        if self.done_flag:
            return 0
        if self.phase == PHASE_DRAFT:
            for i in range(4):
                if self.draft_player[i] < 0 and not self.draft_placed[i]:
                    actions[count] = i
                    count += 1
            return count
        if self.phase == PHASE_PLACE:
            player = self._current_player()
            count = self._fill_placement_actions_fast(player, actions)
            if count == 0:
                actions[0] = N_SKIP_ACTION
                return 1
            return count
        return 0

    cdef bint _is_legal_action_fast(self, int action):
        cdef int actions[ACTION_COUNT_CONST]
        cdef int count
        cdef int i
        count = self._fill_legal_actions_fast(actions)
        for i in range(count):
            if actions[i] == action:
                return True
        return False

    cdef int _fill_placement_actions_fast(self, int player, int* actions):
        cdef int candidates_x[BOARD_CELLS_CONST]
        cdef int candidates_y[BOARD_CELLS_CONST]
        cdef int candidate_seen[BOARD_CELLS_CONST]
        cdef int candidate_count = 0
        cdef int action_count = 0
        cdef int idx
        cdef int seen_index
        cdef unsigned int stamp
        cdef int draft_index
        cdef int orientation_steps
        cdef int orientation
        cdef int candidate_index
        cdef int x
        cdef int y
        cdef int anchor_end
        cdef int number
        cdef int lx
        cdef int ly
        cdef int rx
        cdef int ry
        cdef int lidx
        cdef int ridx
        cdef int low_idx
        cdef int high_idx
        cdef int assignment
        cdef int lt
        cdef int lc
        cdef int rt
        cdef int rc

        if self.phase != PHASE_PLACE or player < 0:
            return 0

        for idx in range(BOARD_CELLS):
            candidate_seen[idx] = 0

        for idx in range(BOARD_CELLS):
            if self.terrain[player][idx] == TERRAIN_EMPTY:
                continue
            x = _idx_to_x(idx)
            y = _idx_to_y(idx)
            self._add_candidate_fast(player, x + 1, y, candidate_seen, candidates_x, candidates_y, &candidate_count)
            self._add_candidate_fast(player, x - 1, y, candidate_seen, candidates_x, candidates_y, &candidate_count)
            self._add_candidate_fast(player, x, y + 1, candidate_seen, candidates_x, candidates_y, &candidate_count)
            self._add_candidate_fast(player, x, y - 1, candidate_seen, candidates_x, candidates_y, &candidate_count)

        if candidate_count == 0:
            candidates_x[0] = 0
            candidates_y[0] = 0
            candidate_count = 1
        self._sort_candidates_fast(candidates_x, candidates_y, candidate_count)

        for draft_index in range(4):
            if self.draft_player[draft_index] != player or self.draft_placed[draft_index]:
                continue
            self.placement_seen_stamp += 1
            if self.placement_seen_stamp == 0:
                for seen_index in range(PLACEMENT_SEEN_CONST):
                    self.placement_seen[seen_index] = 0
                self.placement_seen_stamp = 1
            stamp = self.placement_seen_stamp
            number = self.current_draft_num[draft_index]
            lt = <int>DECK_LEFT_TERRAIN[number]
            lc = <int>DECK_LEFT_CROWNS[number]
            rt = <int>DECK_RIGHT_TERRAIN[number]
            rc = <int>DECK_RIGHT_CROWNS[number]
            for orientation_steps in range(4):
                orientation = orientation_steps * 90
                for candidate_index in range(candidate_count):
                    x = candidates_x[candidate_index]
                    y = candidates_y[candidate_index]
                    anchor_end = self._feedback_anchor_end(player, number, orientation, x, y)
                    if anchor_end < 0:
                        continue

                    self._cells_for(orientation, x, y, anchor_end, &lx, &ly, &rx, &ry)
                    lidx = _coord_to_idx(lx, ly)
                    ridx = _coord_to_idx(rx, ry)
                    if lidx <= ridx:
                        low_idx = lidx
                        high_idx = ridx
                        assignment = 0
                    else:
                        low_idx = ridx
                        high_idx = lidx
                        assignment = 1
                    if lt == rt and lc == rc:
                        assignment = 0
                    seen_index = ((low_idx * BOARD_CELLS + high_idx) * 2) + assignment
                    if self.placement_seen[seen_index] == stamp:
                        continue
                    self.placement_seen[seen_index] = stamp
                    actions[action_count] = _encode_placement_action(draft_index, orientation, x, y, anchor_end)
                    action_count += 1

        return action_count

    cdef void _add_candidate_fast(
        self,
        int player,
        int x,
        int y,
        int* candidate_seen,
        int* candidates_x,
        int* candidates_y,
        int* candidate_count,
    ):
        cdef int idx = _coord_to_idx(x, y)
        if idx < 0 or self.terrain[player][idx] != TERRAIN_EMPTY or candidate_seen[idx]:
            return
        candidate_seen[idx] = 1
        candidates_x[candidate_count[0]] = x
        candidates_y[candidate_count[0]] = y
        candidate_count[0] += 1

    cdef void _sort_candidates_fast(self, int* candidates_x, int* candidates_y, int count):
        cdef int i
        cdef int j
        cdef int x
        cdef int y
        for i in range(1, count):
            x = candidates_x[i]
            y = candidates_y[i]
            j = i - 1
            while j >= 0 and self._candidate_sort_after(candidates_x[j], candidates_y[j], x, y):
                candidates_x[j + 1] = candidates_x[j]
                candidates_y[j + 1] = candidates_y[j]
                j -= 1
            candidates_x[j + 1] = x
            candidates_y[j + 1] = y

    cdef bint _candidate_sort_after(self, int ax, int ay, int bx, int by):
        cdef int ad = (ax if ax >= 0 else -ax) + (ay if ay >= 0 else -ay)
        cdef int bd = (bx if bx >= 0 else -bx) + (by if by >= 0 else -by)
        if ad != bd:
            return ad > bd
        if ay != by:
            return ay > by
        return ax > bx

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
        self._expand_board_bounds(player, lx, ly)
        self._expand_board_bounds(player, rx, ry)
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
        cdef int x_min = self.board_x_min[player]
        cdef int x_max = self.board_x_max[player]
        cdef int y_min = self.board_y_min[player]
        cdef int y_max = self.board_y_max[player]
        if lx < x_min:
            x_min = lx
        if rx < x_min:
            x_min = rx
        if lx > x_max:
            x_max = lx
        if rx > x_max:
            x_max = rx
        if ly < y_min:
            y_min = ly
        if ry < y_min:
            y_min = ry
        if ly > y_max:
            y_max = ly
        if ry > y_max:
            y_max = ry
        return (x_max - x_min + 1) <= BOARD_LIMIT and (y_max - y_min + 1) <= BOARD_LIMIT

    cdef void _expand_board_bounds(self, int player, int x, int y):
        if x < self.board_x_min[player]:
            self.board_x_min[player] = x
        if x > self.board_x_max[player]:
            self.board_x_max[player] = x
        if y < self.board_y_min[player]:
            self.board_y_min[player] = y
        if y > self.board_y_max[player]:
            self.board_y_max[player] = y

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

    cdef double _weighted_draft_score(self, int number, double crown_weight, double number_weight, double diversity_weight):
        cdef int crowns = <int>DECK_LEFT_CROWNS[number] + <int>DECK_RIGHT_CROWNS[number]
        cdef int diversity = 1 if DECK_LEFT_TERRAIN[number] != DECK_RIGHT_TERRAIN[number] else 0
        return crowns * crown_weight + number * number_weight + diversity * diversity_weight

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

    cdef double _weighted_placement_score(
        self,
        int player,
        int action,
        double delta_weight,
        double heuristic_weight,
        double crown_weight,
        double compact_weight,
        double number_weight,
        double expansion_weight,
        double touch_weight,
    ):
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
        cdef int crowns
        cdef int x_min
        cdef int x_max
        cdef int y_min
        cdef int y_max
        cdef int old_area
        cdef int new_area
        cdef int compactness
        cdef int touches
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
        crowns = <int>DECK_LEFT_CROWNS[number] + <int>DECK_RIGHT_CROWNS[number]
        compactness = abs(lx) + abs(ly) + abs(rx) + abs(ry)

        x_min = self.board_x_min[player]
        x_max = self.board_x_max[player]
        y_min = self.board_y_min[player]
        y_max = self.board_y_max[player]
        old_area = (x_max - x_min + 1) * (y_max - y_min + 1)
        if lx < x_min:
            x_min = lx
        if rx < x_min:
            x_min = rx
        if lx > x_max:
            x_max = lx
        if rx > x_max:
            x_max = rx
        if ly < y_min:
            y_min = ly
        if ry < y_min:
            y_min = ry
        if ly > y_max:
            y_max = ly
        if ry > y_max:
            y_max = ry
        new_area = (x_max - x_min + 1) * (y_max - y_min + 1)

        touches = self._matching_touch_count(player, lx, ly, <int>DECK_LEFT_TERRAIN[number])
        touches += self._matching_touch_count(player, rx, ry, <int>DECK_RIGHT_TERRAIN[number])
        return (
            self._placement_score_delta(player, action) * delta_weight
            + self._placement_heuristic(player, action) * heuristic_weight
            + crowns * crown_weight
            - compactness * compact_weight
            - number * number_weight
            - (new_area - old_area) * expansion_weight
            + touches * touch_weight
        )

    cdef int _placement_score_delta(self, int player, int action):
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
        cdef int lidx
        cdef int ridx
        cdef int before
        cdef int after
        cdef int old_x_min
        cdef int old_x_max
        cdef int old_y_min
        cdef int old_y_max
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
        lidx = _coord_to_idx(lx, ly)
        ridx = _coord_to_idx(rx, ry)
        if lidx < 0 or ridx < 0:
            return -1000000

        before = self.score_board(player)
        old_x_min = self.board_x_min[player]
        old_x_max = self.board_x_max[player]
        old_y_min = self.board_y_min[player]
        old_y_max = self.board_y_max[player]

        self.terrain[player][lidx] = <int>DECK_LEFT_TERRAIN[number]
        self.crowns[player][lidx] = <int>DECK_LEFT_CROWNS[number]
        self.terrain[player][ridx] = <int>DECK_RIGHT_TERRAIN[number]
        self.crowns[player][ridx] = <int>DECK_RIGHT_CROWNS[number]
        self._expand_board_bounds(player, lx, ly)
        self._expand_board_bounds(player, rx, ry)
        after = self.score_board(player)

        self.terrain[player][lidx] = TERRAIN_EMPTY
        self.crowns[player][lidx] = 0
        self.terrain[player][ridx] = TERRAIN_EMPTY
        self.crowns[player][ridx] = 0
        self.board_x_min[player] = old_x_min
        self.board_x_max[player] = old_x_max
        self.board_y_min[player] = old_y_min
        self.board_y_max[player] = old_y_max

        return after - before

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

    cdef int _matching_touch_count(self, int player, int x, int y, int terrain):
        cdef int count = 0
        if self._touch_matches(player, x + 1, y, terrain):
            count += 1
        if self._touch_matches(player, x - 1, y, terrain):
            count += 1
        if self._touch_matches(player, x, y + 1, terrain):
            count += 1
        if self._touch_matches(player, x, y - 1, terrain):
            count += 1
        return count

    cdef list _board_features(self, int player):
        cdef list values = []
        cdef int idx
        for idx in range(BOARD_CELLS):
            if self.terrain[player][idx] == TERRAIN_EMPTY:
                values.append(0)
                values.append(0)
            else:
                values.append(self.terrain[player][idx] + 1)
                values.append(self.crowns[player][idx])
        return values
