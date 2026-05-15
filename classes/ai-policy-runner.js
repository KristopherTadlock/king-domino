import { GameState } from './enums/game-state.js';
import { DominoEnd } from './enums/domino-end.js';
import { GameAdvisor } from './game-advisor.js';

const COORD_MIN = -6;
const COORD_MAX = 6;
const COORD_SPAN = COORD_MAX - COORD_MIN + 1;
const DRAFT_ACTIONS = 4;
const SKIP_ACTION = DRAFT_ACTIONS + 4 * 4 * COORD_SPAN * COORD_SPAN * 2;
const TERRAIN = Object.freeze({
  castle: 0,
  wheat: 1,
  pasture: 2,
  water: 3,
  bog: 4,
  forest: 5,
  mine: 6,
});

function terrainId(landscape) {
  return TERRAIN[landscape?.description ?? String(landscape)] ?? 0;
}

function terrainKey(landscape) {
  return landscape?.description ?? String(landscape);
}

export class AIPolicyRunner {
  #advisor = new GameAdvisor();
  #artifact = null;

  get ready() {
    return Boolean(this.#artifact);
  }

  get backend() {
    return this.#artifact?.metadata?.backend ?? this.#artifact?.backend ?? 'unloaded';
  }

  async load(url = 'ai/artifacts/heuristic_policy.json') {
    let response = await fetch(url, { cache: 'no-store' });
    if (!response.ok && url !== 'ai/artifacts/browser_policy.json') {
      response = await fetch('ai/artifacts/browser_policy.json', { cache: 'no-store' });
    }
    if (!response.ok && url !== 'ai/artifacts/latest.pt') {
      response = await fetch('ai/artifacts/latest.pt', { cache: 'no-store' });
    }
    if (!response.ok) {
      throw new Error(`Failed to load AI policy: ${response.status}`);
    }
    this.#artifact = await response.json();
    return this.#artifact;
  }

  chooseAction(game, playerIndex) {
    if (!this.ready || !game || game.isGameOver || playerIndex == null) return null;
    if (this.#artifact?.format === 'kingdomino-weighted-heuristic-v0') {
      return this.#chooseHeuristicAction(game, playerIndex);
    }
    if (this.#artifact?.policy?.type === 'masked_mlp_v0') {
      const action = this.#chooseModelAction(game, playerIndex);
      if (action) return action;
    }
    if (game.state === GameState.DRAFT) return this.#chooseDraftAction(game, playerIndex);
    if (game.state === GameState.PLACE) return this.#choosePlacementAction(game, playerIndex);
    return null;
  }

  #chooseModelAction(game, playerIndex) {
    const policy = this.#artifact?.policy;
    const { legalActions, mask } = this.#legalActionsAndMask(game, playerIndex, policy.actionCount);
    if (!legalActions.length) return null;
    const obs = this.#observationVector(game, playerIndex, policy.obsScale || 50);
    if (!obs || obs.length !== policy.obsSize) return null;
    let bestAction = legalActions[0];
    let bestScore = -Infinity;
    const hidden = this.#hidden(policy, obs);
    for (const action of legalActions) {
      if (!mask[action]) continue;
      const score = this.#outputScore(policy, hidden, action);
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }
    return this.#toGameAction(game, bestAction);
  }

  #hidden(policy, obs) {
    const { inputWeight, inputBias } = policy.weights;
    const hidden = new Array(policy.hiddenSize).fill(0);
    for (let h = 0; h < policy.hiddenSize; h += 1) {
      const weights = inputWeight[h];
      let sum = inputBias[h] ?? 0;
      for (let i = 0; i < obs.length; i += 1) {
        sum += weights[i] * obs[i];
      }
      hidden[h] = Math.tanh(sum);
    }
    return hidden;
  }

  #outputScore(policy, hidden, action) {
    const weights = policy.weights.outputWeight[action];
    if (!weights) return -Infinity;
    let sum = policy.weights.outputBias[action] ?? 0;
    for (let h = 0; h < hidden.length; h += 1) {
      sum += weights[h] * hidden[h];
    }
    return sum;
  }

  #legalActionsAndMask(game, playerIndex, actionCount = SKIP_ACTION + 1) {
    const mask = new Array(actionCount).fill(false);
    const legalActions = [];
    const add = (action) => {
      if (action == null || action < 0 || action >= actionCount || mask[action]) return;
      mask[action] = true;
      legalActions.push(action);
    };

    if (game.state === GameState.DRAFT && game.currentPickingPlayerIndex === playerIndex) {
      (game.currentDraft ?? []).forEach((slot, index) => {
        if (slot?.player == null && !slot?.placed) add(index);
      });
      return { legalActions, mask };
    }

    if (game.state !== GameState.PLACE) return { legalActions, mask };
    const options = game.getCurrentPlacementOptionsForPlayer?.(playerIndex) ?? [];
    for (const option of options) {
      const draftIndex = (game.currentDraft ?? []).findIndex((slot) =>
        slot?.player === playerIndex
        && !slot?.placed
        && slot?.domino?.number === option.dominoNumber
      );
      add(this.#encodePlacementAction(draftIndex, option.orientation, option.x, option.y, option.anchorEnd));
    }
    if (!legalActions.length && game.canSkipPlacementForPlayer?.(playerIndex)) {
      add(SKIP_ACTION);
    }
    return { legalActions, mask };
  }

  #encodePlacementAction(draftIndex, orientation, x, y, anchorEnd) {
    if (draftIndex < 0 || draftIndex >= 4) return null;
    const normalized = ((Number(orientation) % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(normalized)) return null;
    if (x < COORD_MIN || x > COORD_MAX || y < COORD_MIN || y > COORD_MAX) return null;
    const anchor = anchorEnd === DominoEnd.RIGHT || anchorEnd?.description === 'right' || anchorEnd === 'RIGHT' ? 1 : 0;
    const orientationSteps = normalized / 90;
    const coordX = x - COORD_MIN;
    const coordY = y - COORD_MIN;
    const encoded = (((draftIndex * 4 + orientationSteps) * COORD_SPAN + coordX) * COORD_SPAN + coordY) * 2 + anchor;
    return DRAFT_ACTIONS + encoded;
  }

  #toGameAction(game, action) {
    if (action < DRAFT_ACTIONS) {
      return { type: 'pickDraft', payload: { index: action, ai: true } };
    }
    if (action === SKIP_ACTION) {
      return { type: 'skip', payload: { ai: true } };
    }
    const decoded = this.#decodePlacementAction(action);
    if (!decoded) return null;
    const slot = game.currentDraft?.[decoded.draftIndex];
    if (!slot?.domino) return null;
    return {
      type: 'place',
      payload: {
        ai: true,
        dominoNumber: slot.domino.number,
        orientation: decoded.orientation,
        x: decoded.x,
        y: decoded.y,
        anchorEnd: decoded.anchorEnd ? 'RIGHT' : 'LEFT',
        placeId: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    };
  }

  #decodePlacementAction(action) {
    if (action < DRAFT_ACTIONS || action >= SKIP_ACTION) return null;
    let value = action - DRAFT_ACTIONS;
    const anchorEnd = value % 2;
    value = Math.floor(value / 2);
    const coordY = value % COORD_SPAN;
    value = Math.floor(value / COORD_SPAN);
    const coordX = value % COORD_SPAN;
    value = Math.floor(value / COORD_SPAN);
    const orientationSteps = value % 4;
    const draftIndex = Math.floor(value / 4);
    return {
      draftIndex,
      orientation: orientationSteps * 90,
      x: coordX + COORD_MIN,
      y: coordY + COORD_MIN,
      anchorEnd,
    };
  }

  #observationVector(game, playerIndex, scale) {
    const phase = game.state === GameState.DRAFT ? 0 : 1;
    const currentPlayer = game.state === GameState.DRAFT
      ? game.currentPickingPlayerIndex
      : playerIndex;
    const scores = (game.players ?? []).map((player) => player?.board?.score ?? 0);
    const values = [
      phase,
      currentPlayer ?? -1,
      game.pickCursor ?? 0,
      game.placeCursor ?? 0,
      game.round ?? 0,
      scores[0] ?? 0,
      scores[1] ?? 0,
    ];

    for (let i = 0; i < 4; i += 1) {
      const slot = game.currentDraft?.[i];
      values.push(
        slot?.domino?.number ?? 0,
        slot?.player == null ? -1 : slot.player,
        slot?.placed ? 1 : 0,
      );
    }

    for (let player = 0; player < 2; player += 1) {
      const board = game.players?.[player]?.board?.board ?? {};
      for (let y = COORD_MIN; y <= COORD_MAX; y += 1) {
        for (let x = COORD_MIN; x <= COORD_MAX; x += 1) {
          const tile = board[`${x},${y}`];
          values.push(tile ? terrainId(tile.landscape) : 0);
          values.push(tile?.crowns ?? 0);
        }
      }
    }

    return values.map((value) => value / scale);
  }

  #chooseDraftAction(game, playerIndex) {
    if (game.currentPickingPlayerIndex !== playerIndex) return null;
    const suggested = this.#advisor.suggestDraftMove(game, playerIndex);
    const index = suggested?.index ?? game.currentDraft.findIndex((slot) => slot.player == null && !slot.placed);
    if (index == null || index < 0) return null;
    return { type: 'pickDraft', payload: { index, ai: true } };
  }

  #choosePlacementAction(game, playerIndex) {
    const choices = game.getCurrentPlacingChoicesForPlayer?.(playerIndex) ?? [];
    if (!choices.length) return null;

    const suggested = this.#advisor.suggestPlacementMove(game, playerIndex);
    if (suggested) {
      return {
        type: 'place',
        payload: {
          ai: true,
          dominoNumber: suggested.dominoNumber,
          orientation: suggested.orientation,
          x: suggested.x,
          y: suggested.y,
          anchorEnd: suggested.anchorEnd === DominoEnd.RIGHT ? 'RIGHT' : 'LEFT',
          placeId: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
      };
    }

    if (game.canSkipPlacementForPlayer?.(playerIndex)) {
      return { type: 'skip', payload: { ai: true } };
    }

    return null;
  }

  #chooseHeuristicAction(game, playerIndex) {
    const weights = this.#artifact?.weights;
    if (!Array.isArray(weights) || weights.length < 10) return null;
    if (game.state === GameState.DRAFT) return this.#chooseHeuristicDraftAction(game, playerIndex, weights);
    if (game.state === GameState.PLACE) return this.#chooseHeuristicPlacementAction(game, playerIndex, weights);
    return null;
  }

  #chooseHeuristicDraftAction(game, playerIndex, weights) {
    if (game.currentPickingPlayerIndex !== playerIndex) return null;
    let bestIndex = -1;
    let bestScore = -Infinity;
    (game.currentDraft ?? []).forEach((slot, index) => {
      if (slot?.player != null || slot?.placed || !slot?.domino) return;
      const domino = slot.domino;
      const crowns = (domino.leftEnd?.crowns ?? 0) + (domino.rightEnd?.crowns ?? 0);
      const diversity = terrainKey(domino.leftEnd?.landscape) === terrainKey(domino.rightEnd?.landscape) ? 0 : 1;
      const score = crowns * weights[0] + domino.number * weights[1] + diversity * weights[2];
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) return null;
    return { type: 'pickDraft', payload: { index: bestIndex, ai: true } };
  }

  #chooseHeuristicPlacementAction(game, playerIndex, weights) {
    const options = game.getCurrentPlacementOptionsForPlayer?.(playerIndex) ?? [];
    if (!options.length) {
      if (game.canSkipPlacementForPlayer?.(playerIndex)) return { type: 'skip', payload: { ai: true } };
      return null;
    }

    let best = null;
    let bestScore = -Infinity;
    for (const option of options) {
      const score = this.#weightedPlacementScore(game, playerIndex, option, weights);
      if (score > bestScore) {
        bestScore = score;
        best = option;
      }
    }
    if (!best) return null;
    return {
      type: 'place',
      payload: {
        ai: true,
        dominoNumber: best.dominoNumber,
        orientation: best.orientation,
        x: best.x,
        y: best.y,
        anchorEnd: best.anchorEnd === DominoEnd.RIGHT ? 'RIGHT' : 'LEFT',
        placeId: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    };
  }

  #weightedPlacementScore(game, playerIndex, option, weights) {
    const domino = this.#dominoForOption(game, playerIndex, option);
    if (!domino) return -Infinity;
    const cells = this.#cellsForOption(option, domino);
    const boardManager = game.players?.[playerIndex]?.board;
    const board = boardManager?.board ?? {};
    const boardSize = boardManager?.boardSize;
    const before = this.#scoreBoard(board);
    const after = this.#scoreBoard(board, cells);
    const scoreDelta = after - before;
    const placementHeuristic = this.#placementHeuristic(board, option, domino, cells);
    const crowns = (domino.leftEnd?.crowns ?? 0) + (domino.rightEnd?.crowns ?? 0);
    const compactness = Math.abs(cells[0].x) + Math.abs(cells[0].y) + Math.abs(cells[1].x) + Math.abs(cells[1].y);
    const oldArea = boardSize
      ? (boardSize.xMax - boardSize.xMin + 1) * (boardSize.yMax - boardSize.yMin + 1)
      : 1;
    const xs = [
      boardSize?.xMin ?? 0,
      boardSize?.xMax ?? 0,
      cells[0].x,
      cells[1].x,
    ];
    const ys = [
      boardSize?.yMin ?? 0,
      boardSize?.yMax ?? 0,
      cells[0].y,
      cells[1].y,
    ];
    const newArea = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    const touches = this.#matchingTouchCount(board, cells[0]) + this.#matchingTouchCount(board, cells[1]);
    return scoreDelta * weights[3]
      + placementHeuristic * weights[4]
      + crowns * weights[5]
      - compactness * weights[6]
      - option.dominoNumber * weights[7]
      - (newArea - oldArea) * weights[8]
      + touches * weights[9];
  }

  #dominoForOption(game, playerIndex, option) {
    return (game.getCurrentPlacingChoicesForPlayer?.(playerIndex) ?? [])
      .find((choice) => choice?.domino?.number === option.dominoNumber)
      ?.domino ?? null;
  }

  #cellsForOption(option, domino) {
    const anchor = { x: option.x, y: option.y };
    const offsets = {
      0: { x: 1, y: 0 },
      90: { x: 0, y: -1 },
      180: { x: -1, y: 0 },
      270: { x: 0, y: 1 },
    };
    const offset = offsets[((Number(option.orientation) % 360) + 360) % 360] ?? offsets[0];
    const other = { x: option.x + offset.x, y: option.y + offset.y };
    return option.anchorEnd === DominoEnd.LEFT
      ? [
        { ...anchor, landscape: domino.leftEnd.landscape, crowns: domino.leftEnd.crowns },
        { ...other, landscape: domino.rightEnd.landscape, crowns: domino.rightEnd.crowns },
      ]
      : [
        { ...other, landscape: domino.leftEnd.landscape, crowns: domino.leftEnd.crowns },
        { ...anchor, landscape: domino.rightEnd.landscape, crowns: domino.rightEnd.crowns },
      ];
  }

  #scoreBoard(board, extraCells = []) {
    const tiles = new Map();
    for (const [key, tile] of Object.entries(board ?? {})) {
      tiles.set(key, {
        terrain: terrainId(tile.landscape),
        crowns: tile.crowns ?? 0,
      });
    }
    for (const cell of extraCells) {
      tiles.set(`${cell.x},${cell.y}`, {
        terrain: terrainId(cell.landscape),
        crowns: cell.crowns ?? 0,
      });
    }

    const visited = new Set();
    let total = 0;
    for (const [key, tile] of tiles.entries()) {
      if (visited.has(key) || tile.terrain <= TERRAIN.castle) continue;
      const stack = [key];
      visited.add(key);
      let count = 0;
      let crowns = 0;
      while (stack.length) {
        const currentKey = stack.pop();
        const current = tiles.get(currentKey);
        count += 1;
        crowns += current.crowns ?? 0;
        const [x, y] = currentKey.split(',').map((value) => Number.parseInt(value, 10));
        for (const neighborKey of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
          if (visited.has(neighborKey)) continue;
          const neighbor = tiles.get(neighborKey);
          if (!neighbor || neighbor.terrain !== tile.terrain) continue;
          visited.add(neighborKey);
          stack.push(neighborKey);
        }
      }
      total += count * crowns;
    }
    return total;
  }

  #placementHeuristic(board, option, domino, cells) {
    const touchScore = (cell) => {
      let score = (cell.crowns ?? 0) * 10;
      for (const neighbor of this.#neighborTiles(board, cell.x, cell.y)) {
        if (terrainId(neighbor.landscape) === terrainId(cell.landscape)) {
          score += 3 + (cell.crowns ?? 0);
        } else if (terrainId(neighbor.landscape) === TERRAIN.castle) {
          score += 1.5;
        }
      }
      return score;
    };
    const compactness = -0.1 * (
      Math.abs(cells[0].x) + Math.abs(cells[0].y) + Math.abs(cells[1].x) + Math.abs(cells[1].y)
    );
    return touchScore(cells[0]) + touchScore(cells[1]) + compactness - option.dominoNumber * 0.005;
  }

  #matchingTouchCount(board, cell) {
    return this.#neighborTiles(board, cell.x, cell.y)
      .filter((tile) => {
        const terrain = terrainId(tile.landscape);
        return terrain === TERRAIN.castle || terrain === terrainId(cell.landscape);
      })
      .length;
  }

  #neighborTiles(board, x, y) {
    return [
      board?.[`${x + 1},${y}`],
      board?.[`${x - 1},${y}`],
      board?.[`${x},${y + 1}`],
      board?.[`${x},${y - 1}`],
    ].filter(Boolean);
  }
}
