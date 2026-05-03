import { DominoPoolManager } from './domino-pool-manager.js';
import { DraftedTile } from './drafted-tile.js';
import { GameBoardManager } from './game-board-manager.js';
import { GameConfiguration } from './game-configuration.js';
import { GameState } from './enums/game-state.js';
import { DominoEnd } from './enums/domino-end.js';
import { Edges, EdgeOffset } from './enums/edges.js';
import { Player } from './player.js';
import { mulberry32 } from './utils/rng.js';

const ALL_EDGES = [Edges.TOP, Edges.BOTTOM, Edges.LEFT, Edges.RIGHT];

function oppositeEdge(edge) {
  switch (edge) {
    case Edges.TOP:
      return Edges.BOTTOM;
    case Edges.BOTTOM:
      return Edges.TOP;
    case Edges.LEFT:
      return Edges.RIGHT;
    case Edges.RIGHT:
      return Edges.LEFT;
  }
}

function keyOf(x, y) {
  return `${x},${y}`;
}

/**
 * Web-facing orchestration for a local (hot-seat) Kingdomino game.
 *
 * Reuses existing legality + scoring logic via GameBoardManager.
 */
export class WebGameManager {
  /** @type {GameConfiguration} */
  config;

  /** @type {DominoPoolManager} */
  #pool;

  /** @type {() => number} */
  #rng;

  /** @type {number} */
  seed;

  /** @type {Player[]} */
  players = [];

  /** @type {DraftedTile[]} */
  currentDraft = [];

  /** @type {GameState} */
  state = GameState.DRAFT;

  /** @type {number[]} */
  #pickOrder = [];

  /** @type {number} */
  #pickCursor = 0;

  /** @type {number[]} */
  #placeOrder = [];

  /** @type {number} */
  #placeCursor = 0;

  /** @type {number} */
  round = 0;

  /** @type {boolean} */
  isGameOver = false;

  /** @type {Map<number, number>} playerIndex -> preferred domino number */
  #preferredPlacementDominoByPlayer = new Map();

  /**
   * @param {GameConfiguration} config
   * @param {number} seed deterministic seed for shuffles
   */
  constructor(config, seed = 1) {
    this.config = config;
    this.seed = seed >>> 0;
    this.#rng = mulberry32(this.seed);
    this.#pool = new DominoPoolManager(this.#rng);
  }

  /** @param {number} seed */
  setSeed(seed) {
    this.seed = (seed >>> 0) || 1;
    this.#rng = mulberry32(this.seed);
    this.#pool = new DominoPoolManager(this.#rng);
  }

  /** @param {string[]} playerNames */
  start(playerNames) {
    const names = [];
    for (let i = 0; i < this.config.numPlayers; i++) {
      const provided = typeof playerNames?.[i] === 'string' ? playerNames[i].trim() : '';
      names.push(provided || `Player ${i + 1}`);
    }

    this.players = names.map((name, idx) => {
      const player = new Player(name, idx);
      player.setId(idx);
      player.setBoard(new GameBoardManager(this.config));
      return player;
    });

    this.#pool.reset();
    this.isGameOver = false;
    this.#preferredPlacementDominoByPlayer.clear();

    // Initial pick order: random player order (2p repeats 0,1,0,1)
    const baseOrder = [...Array(this.players.length).keys()];
    // Deterministic shuffle using seeded RNG.
    for (let i = baseOrder.length - 1; i > 0; i--) {
      const j = Math.floor(this.#rng() * (i + 1));
      [baseOrder[i], baseOrder[j]] = [baseOrder[j], baseOrder[i]];
    }
    this.#pickOrder = this.players.length === 2
      ? [baseOrder[0], baseOrder[1], baseOrder[0], baseOrder[1]]
      : baseOrder;

    this.#startNewRound();
  }

  get pickOrder() {
    return [...this.#pickOrder];
  }

  get pickCursor() {
    return this.#pickCursor;
  }

  get remainingDominoNumbers() {
    return this.#pool.remainingDominoNumbers();
  }

  get currentPickingPlayerIndex() {
    return this.#pickOrder[this.#pickCursor];
  }

  get forcedDraftIndex() {
    if (this.isGameOver || this.state !== GameState.DRAFT) return null;

    const currentPlayerIndex = this.currentPickingPlayerIndex;
    if (currentPlayerIndex == null) return null;

    const available = this.currentDraft
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.player == null);

    if (available.length === 1) return available[0].index;
    if (available.length !== 2 || this.players.length !== 2) return null;

    const picksByPlayer = new Map(this.players.map((_, index) => [index, 0]));
    for (const slot of this.currentDraft) {
      if (slot.player != null) {
        picksByPlayer.set(slot.player, (picksByPlayer.get(slot.player) ?? 0) + 1);
      }
    }

    const picksPerPlayer = this.currentDraft.length / this.players.length;
    const otherPlayerIndex = this.players.findIndex((_, index) => index !== currentPlayerIndex);
    const otherPlayerIsDone = otherPlayerIndex >= 0
      && (picksByPlayer.get(otherPlayerIndex) ?? 0) >= picksPerPlayer;
    const remainingPickers = this.#pickOrder.slice(this.#pickCursor, this.#pickCursor + available.length);
    const remainingPicksBelongToCurrentPlayer = remainingPickers.length === available.length
      && remainingPickers.every((playerIndex) => playerIndex === currentPlayerIndex);

    if (otherPlayerIsDone && remainingPicksBelongToCurrentPlayer) {
      return available[0].index;
    }

    return null;
  }

  get placeOrder() {
    return [...this.#placeOrder];
  }

  get currentPlacingPlayerIndex() {
    return this.#placeOrder[this.#placeCursor];
  }

  /** @returns {DraftedTile | null} */
  get currentPlacingDraftedTile() {
    return this.currentPlacingDraftedTileForPlayer(this.currentPlacingPlayerIndex);
  }

  /** @returns {DraftedTile | null} */
  currentPlacingDraftedTileForPlayer(playerIndex) {
    if (this.state !== GameState.PLACE) return null;
    if (playerIndex == null || !this.players[playerIndex]) return null;
    const choices = this.#draftedTilesForPlayer(playerIndex);
    if (!choices.length) return null;

    const preferredNumber = this.#preferredPlacementDominoByPlayer.get(playerIndex);
    if (preferredNumber != null) {
      const preferred = choices.find((d) => d.domino.number === preferredNumber);
      if (preferred) return preferred;
    }

    // Deterministic default when no preferred tile is selected.
    return choices[0];
  }

  #draftedTileForPlayer(playerIndex) {
    return this.currentDraft.find((d) => d.player === playerIndex && !d.placed) ?? null;
  }

  #draftedTilesForPlayer(playerIndex) {
    return this.currentDraft
      .filter((d) => d.player === playerIndex && !d.placed)
      .sort((a, b) => a.domino.number - b.domino.number);
  }

  getCurrentPlacingChoices() {
    return this.getCurrentPlacingChoicesForPlayer(this.currentPlacingPlayerIndex);
  }

  getCurrentPlacingChoicesForPlayer(playerIndex) {
    if (this.state !== GameState.PLACE) return [];
    if (playerIndex == null || !this.players[playerIndex]) return [];
    return this.#draftedTilesForPlayer(playerIndex);
  }

  #placementCandidateAnchors(board, boardSize) {
    const centerX = Math.round((boardSize.xMin + boardSize.xMax) / 2);
    const centerY = Math.round((boardSize.yMin + boardSize.yMax) / 2);

    const candidates = new Set();
    for (const k of Object.keys(board)) {
      const t = board[k];
      for (const edge of ALL_EDGES) {
        const off = EdgeOffset.MAP_EDGE_TO_OFFSET(edge);
        const cx = t.x + off.x;
        const cy = t.y + off.y;
        if (!board[keyOf(cx, cy)]) candidates.add(keyOf(cx, cy));
      }
    }

    if (!candidates.size) candidates.add(keyOf(centerX, centerY));

    return [...candidates]
      .map((k) => {
        const [sx, sy] = k.split(',');
        return { x: Number.parseInt(sx, 10), y: Number.parseInt(sy, 10) };
      })
      .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y))
      .sort((a, b) => {
        const ad = Math.abs(a.x - centerX) + Math.abs(a.y - centerY);
        const bd = Math.abs(b.x - centerX) + Math.abs(b.y - centerY);
        if (ad !== bd) return ad - bd;
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });
  }

  static #placementOptionKey(domino, x, y, anchorEnd) {
    const connectedEdge = domino.getConnectedEdge(anchorEnd);
    const offset = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
    const anchorCoord = { x, y };
    const otherCoord = { x: x + offset.x, y: y + offset.y };
    const leftCoord = anchorEnd === DominoEnd.LEFT ? anchorCoord : otherCoord;
    const rightCoord = anchorEnd === DominoEnd.RIGHT ? anchorCoord : otherCoord;

    const cells = [
      {
        x: leftCoord.x,
        y: leftCoord.y,
        landscape: domino.leftEnd.landscape.description,
        crowns: domino.leftEnd.crowns,
      },
      {
        x: rightCoord.x,
        y: rightCoord.y,
        landscape: domino.rightEnd.landscape.description,
        crowns: domino.rightEnd.crowns,
      },
    ].sort((a, b) => a.x - b.x || a.y - b.y);

    return [
      domino.number,
      ...cells.map((cell) => `${cell.x},${cell.y}:${cell.landscape}:${cell.crowns}`),
    ].join('|');
  }

  getCurrentPlacementOptions() {
    return this.getCurrentPlacementOptionsForPlayer(this.currentPlacingPlayerIndex);
  }

  getCurrentPlacementOptionsForPlayer(playerIndex) {
    if (this.state !== GameState.PLACE) return [];
    if (playerIndex == null || !this.players[playerIndex]) return [];

    const boardManager = this.players[playerIndex].board;
    const candidates = this.#placementCandidateAnchors(boardManager.board, boardManager.boardSize);
    const choices = this.#draftedTilesForPlayer(playerIndex);
    const originalPreferred = this.#preferredPlacementDominoByPlayer.get(playerIndex);
    const options = [];
    const seen = new Set();

    try {
      for (const choice of choices) {
        this.#preferredPlacementDominoByPlayer.set(playerIndex, choice.domino.number);
        const originalOrientation = choice.domino.orientation;

        try {
          for (let rotationSteps = 0; rotationSteps < 4; rotationSteps++) {
            for (const c of candidates) {
              const feedback = this.getPlacementFeedbackAtForPlayer(playerIndex, c.x, c.y);
              if (!feedback.ok) continue;
              const key = WebGameManager.#placementOptionKey(choice.domino, c.x, c.y, feedback.anchorEnd);
              if (seen.has(key)) continue;
              seen.add(key);
              options.push({
                dominoNumber: choice.domino.number,
                rotationSteps,
                orientation: choice.domino.orientation,
                x: c.x,
                y: c.y,
                anchorEnd: feedback.anchorEnd,
              });
            }
            choice.domino.rotate();
          }
        } finally {
          while (choice.domino.orientation !== originalOrientation) {
            choice.domino.rotate();
          }
        }
      }
    } finally {
      if (originalPreferred == null) {
        this.#preferredPlacementDominoByPlayer.delete(playerIndex);
      } else {
        this.#preferredPlacementDominoByPlayer.set(playerIndex, originalPreferred);
      }
    }

    return options;
  }

  selectCurrentPlacementDomino(dominoNumber) {
    return this.selectPlacementDominoForPlayer(this.currentPlacingPlayerIndex, dominoNumber);
  }

  selectPlacementDominoForPlayer(playerIndex, dominoNumber) {
    if (this.state !== GameState.PLACE) return { ok: false, reason: 'Not in placement phase.' };
    if (playerIndex == null || !this.players[playerIndex]) return { ok: false, reason: 'No active placing player.' };

    const selected = this.#draftedTilesForPlayer(playerIndex)
      .find((d) => d.domino.number === dominoNumber);
    if (!selected) return { ok: false, reason: 'That tile is not available to place.' };

    this.#preferredPlacementDominoByPlayer.set(playerIndex, dominoNumber);
    return { ok: true, reason: '' };
  }

  setCurrentPlacementSelection(dominoNumber, orientation) {
    return this.setPlacementSelectionForPlayer(this.currentPlacingPlayerIndex, dominoNumber, orientation);
  }

  setPlacementSelectionForPlayer(playerIndex, dominoNumber, orientation) {
    const selection = this.selectPlacementDominoForPlayer(playerIndex, dominoNumber);
    if (!selection.ok) return selection;

    const drafted = this.currentPlacingDraftedTileForPlayer(playerIndex);
    if (!drafted) return { ok: false, reason: 'Not in placement phase.' };

    const normalized = ((Number(orientation) % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(normalized)) {
      return { ok: false, reason: 'Invalid orientation.' };
    }

    let guard = 0;
    while (drafted.domino.orientation !== normalized && guard < 4) {
      drafted.domino.rotate();
      guard += 1;
    }

    if (drafted.domino.orientation !== normalized) {
      return { ok: false, reason: 'Invalid orientation.' };
    }

    return { ok: true, reason: '' };
  }

  #startNewRound() {
    if (this.#pool.isEmpty()) {
      this.isGameOver = true;
      return;
    }

    this.round += 1;
    this.state = GameState.DRAFT;
    this.#pickCursor = 0;

    const drawn = this.#pool.draw4();
    drawn.sort((a, b) => a.number - b.number);
    this.currentDraft = drawn.map((domino) => new DraftedTile(null, domino));

    this.#placeOrder = [];
    this.#placeCursor = 0;
    this.#preferredPlacementDominoByPlayer.clear();
  }

  /**
   * Pick one of the 4 draft dominos for the current picking player.
   * @param {number} draftIndex 0..3
   */
  pickDraft(draftIndex) {
    if (this.isGameOver) return;
    if (this.state !== GameState.DRAFT) return;
    const pickingPlayer = this.currentPickingPlayerIndex;
    if (pickingPlayer == null) return;
    if (draftIndex < 0 || draftIndex >= this.currentDraft.length) return;
    const slot = this.currentDraft[draftIndex];
    if (slot.player != null) return;

    slot.player = pickingPlayer;
    this.#pickCursor += 1;
    if (this.#pickCursor < this.#pickOrder.length && !this.currentDraft.every((d) => d.player != null)) return;

    // In 3-player games, one domino remains unclaimed each draft. Treat it as
    // already resolved so placement can advance after the three claimed tiles.
    for (const draft of this.currentDraft) {
      if (draft.player == null) draft.placed = true;
    }

    // Placement order is by increasing domino number of what players picked.
    this.#placeOrder = [...this.currentDraft]
      .filter((d) => d.player != null)
      .sort((a, b) => a.domino.number - b.domino.number)
      .map((d) => d.player);

    // Next round pick order is the same as placement order.
    // For 2-player, keep the full 4-king ordering from placement.
    // Repeating only the first two entries can incorrectly produce
    // [P1,P1,P1,P1] when placement order is [P1,P1,P2,P2].
    this.#pickOrder = [...this.#placeOrder];

    this.state = GameState.PLACE;
    this.#placeCursor = 0;
  }

  rotateCurrentDomino() {
    const drafted = this.currentPlacingDraftedTile;
    if (!drafted) return;
    drafted.domino.rotate();
  }

  rotatePlacementDominoForPlayer(playerIndex) {
    const drafted = this.currentPlacingDraftedTileForPlayer(playerIndex);
    if (!drafted) return;
    drafted.domino.rotate();
  }

  skipCurrentPlacement() {
    const drafted = this.currentPlacingDraftedTile;
    if (!drafted) return { ok: false, reason: 'Not in placement phase.' };
    if (!this.canSkipCurrentPlacement()) {
      return { ok: false, reason: 'A valid placement exists. You cannot skip this tile.' };
    }
    drafted.placed = true;
    this.#clearConsumedPlacementPreference(this.currentPlacingPlayerIndex, drafted.domino.number);
    this.#advancePlacement();
    return { ok: true, reason: '' };
  }

  skipPlacementForPlayer(playerIndex) {
    const drafted = this.currentPlacingDraftedTileForPlayer(playerIndex);
    if (!drafted) return { ok: false, reason: 'Not in placement phase.' };
    if (!this.canSkipPlacementForPlayer(playerIndex)) {
      return { ok: false, reason: 'A valid placement exists. You cannot skip this tile.' };
    }
    drafted.placed = true;
    this.#clearConsumedPlacementPreference(playerIndex, drafted.domino.number);
    this.#advancePlacementAfterPlayerAction();
    return { ok: true, reason: '' };
  }

  #clearConsumedPlacementPreference(playerIndex, dominoNumber) {
    const preferred = this.#preferredPlacementDominoByPlayer.get(playerIndex);
    if (preferred === dominoNumber) {
      this.#preferredPlacementDominoByPlayer.delete(playerIndex);
    }
  }

  /**
   * Skip is allowed only if no legal placement exists for any remaining tile choice.
   */
  canSkipCurrentPlacement() {
    return this.state === GameState.PLACE && this.getCurrentPlacementOptions().length === 0;
  }

  canSkipPlacementForPlayer(playerIndex) {
    return this.state === GameState.PLACE && this.getCurrentPlacementOptionsForPlayer(playerIndex).length === 0;
  }

  /**
   * Check whether the current domino could be placed at (x,y) with a chosen anchor end,
   * without mutating game state.
   */
  canPlaceCurrentDominoAt(x, y, anchorEnd = DominoEnd.LEFT) {
    const feedback = this.explainCurrentPlacementAt(x, y, anchorEnd);
    return feedback.ok;
  }

  canPlaceDominoAtForPlayer(playerIndex, x, y, anchorEnd = DominoEnd.LEFT) {
    const feedback = this.explainPlacementAtForPlayer(playerIndex, x, y, anchorEnd);
    return feedback.ok;
  }

  /**
   * Explain whether a current placement is legal, with a reason when invalid.
   */
  explainCurrentPlacementAt(x, y, anchorEnd = DominoEnd.LEFT) {
    return this.explainPlacementAtForPlayer(this.currentPlacingPlayerIndex, x, y, anchorEnd);
  }

  explainPlacementAtForPlayer(playerIndex, x, y, anchorEnd = DominoEnd.LEFT) {
    const drafted = this.currentPlacingDraftedTileForPlayer(playerIndex);
    if (!drafted) return { ok: false, reason: 'Not in placement phase.' };

    const boardManager = this.players[playerIndex].board;
    const board = boardManager.board;

    const anchorCoord = { x, y };
    const connectedEdge = drafted.domino.getConnectedEdge(anchorEnd);
    const offset = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
    const otherCoord = { x: x + offset.x, y: y + offset.y };

    const leftCoord = anchorEnd === DominoEnd.LEFT ? anchorCoord : otherCoord;
    const rightCoord = anchorEnd === DominoEnd.RIGHT ? anchorCoord : otherCoord;

    if (board[keyOf(leftCoord.x, leftCoord.y)] || board[keyOf(rightCoord.x, rightCoord.y)]) {
      return { ok: false, reason: 'Space occupied.' };
    }

    const option = WebGameManager.#findPlacementOption(boardManager, drafted.domino, leftCoord, rightCoord);
    if (option) return { ok: true, reason: '' };

    // Derive more explicit feedback for UI.
    let sawNeighbor = false;
    let sawFreeSpaceFailure = false;
    let sawEdgeFailure = false;

    const ends = [
      { end: DominoEnd.LEFT, coord: leftCoord },
      { end: DominoEnd.RIGHT, coord: rightCoord },
    ];

    for (const { end, coord } of ends) {
      for (const neighborDirection of ALL_EDGES) {
        const dirOffset = EdgeOffset.MAP_EDGE_TO_OFFSET(neighborDirection);
        const neighbor = board[keyOf(coord.x + dirOffset.x, coord.y + dirOffset.y)];
        if (!neighbor) continue;
        sawNeighbor = true;

        const tileEdge = oppositeEdge(neighborDirection);
        const cords = GameBoardManager.getDominoCoordinates(drafted.domino, neighbor, tileEdge, end);
        const expectedConnected = end === DominoEnd.LEFT ? leftCoord : rightCoord;
        const expectedAttached = end === DominoEnd.LEFT ? rightCoord : leftCoord;

        if (
          cords.connectedEnd.x !== expectedConnected.x ||
          cords.connectedEnd.y !== expectedConnected.y ||
          cords.attachedEnd.x !== expectedAttached.x ||
          cords.attachedEnd.y !== expectedAttached.y
        ) {
          continue;
        }

        const hasFreeSpace = GameBoardManager.hasFreeSpace(
          drafted.domino,
          neighbor,
          tileEdge,
          end,
          board,
          boardManager.maxBoardSize,
          boardManager.boardSize
        );
        const hasValidEdges = GameBoardManager.hasValidEdges(
          drafted.domino,
          neighbor,
          tileEdge,
          end,
          board
        );

        if (!hasFreeSpace) sawFreeSpaceFailure = true;
        if (!hasValidEdges) sawEdgeFailure = true;
      }
    }

    if (!sawNeighbor) {
      return { ok: false, reason: 'Must connect to castle or matching landscape.' };
    }
    if (sawFreeSpaceFailure && !sawEdgeFailure) {
      return { ok: false, reason: 'Would overlap or exceed board size.' };
    }
    if (!sawFreeSpaceFailure && sawEdgeFailure) {
      return { ok: false, reason: 'At least one touching edge must match (or castle).' };
    }
    return { ok: false, reason: 'Placement violates board size and edge-matching rules.' };
  }

  /**
   * Try both anchor ends and return the best placement feedback.
   */
  getPlacementFeedbackAt(x, y) {
    return this.getPlacementFeedbackAtForPlayer(this.currentPlacingPlayerIndex, x, y);
  }

  getPlacementFeedbackAtForPlayer(playerIndex, x, y) {
    const left = this.explainPlacementAtForPlayer(playerIndex, x, y, DominoEnd.LEFT);
    if (left.ok) return { ok: true, anchorEnd: DominoEnd.LEFT, reason: '' };

    const right = this.explainPlacementAtForPlayer(playerIndex, x, y, DominoEnd.RIGHT);
    if (right.ok) return { ok: true, anchorEnd: DominoEnd.RIGHT, reason: '' };

    // Prefer concrete reason from left, fallback to right.
    return {
      ok: false,
      anchorEnd: DominoEnd.LEFT,
      reason: left.reason || right.reason || 'Invalid placement.',
    };
  }

  /**
   * Attempt to place the current player's domino by anchoring one end at (x,y).
   * The opposite end coordinate is derived from the domino's current orientation.
   */
  tryPlaceCurrentDominoAt(x, y, anchorEnd = DominoEnd.LEFT) {
    return this.#tryPlaceDominoForPlayer(this.currentPlacingPlayerIndex, x, y, anchorEnd, true);
  }

  tryPlaceDominoAtForPlayer(playerIndex, x, y, anchorEnd = DominoEnd.LEFT) {
    return this.#tryPlaceDominoForPlayer(playerIndex, x, y, anchorEnd, false);
  }

  #tryPlaceDominoForPlayer(playerIndex, x, y, anchorEnd, blocking) {
    const drafted = this.currentPlacingDraftedTileForPlayer(playerIndex);
    if (!drafted) return { ok: false, reason: 'Not in placement phase.' };

    const feedback = this.explainPlacementAtForPlayer(playerIndex, x, y, anchorEnd);
    if (!feedback.ok) return feedback;

    const boardManager = this.players[playerIndex].board;

    const anchorCoord = { x, y };
    const connectedEdge = drafted.domino.getConnectedEdge(anchorEnd);
    const offset = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
    const otherCoord = { x: x + offset.x, y: y + offset.y };

    const leftCoord = anchorEnd === DominoEnd.LEFT ? anchorCoord : otherCoord;
    const rightCoord = anchorEnd === DominoEnd.RIGHT ? anchorCoord : otherCoord;

    const option = WebGameManager.#findPlacementOption(boardManager, drafted.domino, leftCoord, rightCoord);
    if (!option) {
      return { ok: false, reason: 'Invalid placement.' };
    }

    const placed = boardManager.placeDomino(drafted.domino, option.tile, option.tileEdge, option.dominoEnd);
    if (!placed) {
      return { ok: false, reason: 'Engine rejected placement.' };
    }

    drafted.placed = true;
    this.#clearConsumedPlacementPreference(playerIndex, drafted.domino.number);
    if (blocking) this.#advancePlacement();
    else this.#advancePlacementAfterPlayerAction();
    return { ok: true, reason: '' };
  }

  #advancePlacement() {
    this.#placeCursor += 1;
    while (this.#placeCursor < this.#placeOrder.length) {
      const playerIndex = this.#placeOrder[this.#placeCursor];
      if (playerIndex == null) {
        this.#placeCursor += 1;
        continue;
      }
      if (this.#draftedTileForPlayer(playerIndex)) break;
      this.#placeCursor += 1;
    }

    if (!this.currentDraft.every((d) => d.placed)) return;
    this.#startNewRound();
  }

  #advancePlacementAfterPlayerAction() {
    while (this.#placeCursor < this.#placeOrder.length) {
      const playerIndex = this.#placeOrder[this.#placeCursor];
      if (playerIndex == null || !this.#draftedTileForPlayer(playerIndex)) {
        this.#placeCursor += 1;
        continue;
      }
      break;
    }

    if (!this.currentDraft.every((d) => d.placed)) return;
    this.#startNewRound();
  }

  static #findPlacementOption(boardManager, domino, leftCoord, rightCoord) {
    const board = boardManager.board;
    const ends = [
      { end: DominoEnd.LEFT, coord: leftCoord },
      { end: DominoEnd.RIGHT, coord: rightCoord },
    ];

    for (const { end, coord } of ends) {
      for (const neighborDirection of ALL_EDGES) {
        const dirOffset = EdgeOffset.MAP_EDGE_TO_OFFSET(neighborDirection);
        const neighbor = board[keyOf(coord.x + dirOffset.x, coord.y + dirOffset.y)];
        if (!neighbor) continue;

        const tileEdge = oppositeEdge(neighborDirection);

        const cords = GameBoardManager.getDominoCoordinates(domino, neighbor, tileEdge, end);
        const expectedConnected = end === DominoEnd.LEFT ? leftCoord : rightCoord;
        const expectedAttached = end === DominoEnd.LEFT ? rightCoord : leftCoord;
        if (
          cords.connectedEnd.x !== expectedConnected.x ||
          cords.connectedEnd.y !== expectedConnected.y ||
          cords.attachedEnd.x !== expectedAttached.x ||
          cords.attachedEnd.y !== expectedAttached.y
        ) {
          continue;
        }

        const isValid = GameBoardManager.isValidPlacement(
          domino,
          neighbor,
          tileEdge,
          end,
          board,
          boardManager.maxBoardSize,
          boardManager.boardSize
        );
        if (!isValid) continue;
        return { tile: neighbor, tileEdge, dominoEnd: end };
      }
    }
    return null;
  }
}
