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
    const names = playerNames?.length ? playerNames : ['Player 1', 'Player 2'];
    this.players = names.slice(0, this.config.numPlayers).map((name, idx) => {
      const player = new Player(name, idx);
      player.setId(idx);
      player.setBoard(new GameBoardManager(this.config));
      return player;
    });

    this.#pool.reset();
    this.isGameOver = false;

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

  get currentPickingPlayerIndex() {
    return this.#pickOrder[this.#pickCursor];
  }

  get placeOrder() {
    return [...this.#placeOrder];
  }

  get currentPlacingPlayerIndex() {
    return this.#placeOrder[this.#placeCursor];
  }

  /** @returns {DraftedTile | null} */
  get currentPlacingDraftedTile() {
    if (this.state !== GameState.PLACE) return null;
    const playerIndex = this.currentPlacingPlayerIndex;
    return this.currentDraft.find((d) => d.player === playerIndex && !d.placed) ?? null;
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
  }

  /**
   * Pick one of the 4 draft dominos for the current picking player.
   * @param {number} draftIndex 0..3
   */
  pickDraft(draftIndex) {
    if (this.isGameOver) return;
    if (this.state !== GameState.DRAFT) return;
    if (draftIndex < 0 || draftIndex >= this.currentDraft.length) return;
    const slot = this.currentDraft[draftIndex];
    if (slot.player != null) return;

    slot.player = this.currentPickingPlayerIndex;
    this.#pickCursor += 1;
    if (!this.currentDraft.every((d) => d.player != null)) return;

    // Placement order is by increasing domino number of what you picked.
    this.#placeOrder = [...this.currentDraft]
      .sort((a, b) => a.domino.number - b.domino.number)
      .map((d) => d.player);

    // Next round pick order is the same as placement order.
    this.#pickOrder = this.players.length === 2
      ? [this.#placeOrder[0], this.#placeOrder[1], this.#placeOrder[0], this.#placeOrder[1]]
      : [...this.#placeOrder];

    this.state = GameState.PLACE;
    this.#placeCursor = 0;
  }

  rotateCurrentDomino() {
    const drafted = this.currentPlacingDraftedTile;
    if (!drafted) return;
    drafted.domino.rotate();
  }

  skipCurrentPlacement() {
    const drafted = this.currentPlacingDraftedTile;
    if (!drafted) return;
    drafted.placed = true;
    this.#advancePlacement();
  }

  /**
   * Check whether the current domino could be placed at (x,y) with a chosen anchor end,
   * without mutating game state.
   */
  canPlaceCurrentDominoAt(x, y, anchorEnd = DominoEnd.LEFT) {
    const drafted = this.currentPlacingDraftedTile;
    if (!drafted) return false;

    const playerIndex = this.currentPlacingPlayerIndex;
    const boardManager = this.players[playerIndex].board;
    const board = boardManager.board;

    const anchorCoord = { x, y };
    const connectedEdge = drafted.domino.getConnectedEdge(anchorEnd);
    const offset = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
    const otherCoord = { x: x + offset.x, y: y + offset.y };

    const leftCoord = anchorEnd === DominoEnd.LEFT ? anchorCoord : otherCoord;
    const rightCoord = anchorEnd === DominoEnd.RIGHT ? anchorCoord : otherCoord;

    if (board[keyOf(leftCoord.x, leftCoord.y)] || board[keyOf(rightCoord.x, rightCoord.y)]) {
      return false;
    }

    const option = WebGameManager.#findPlacementOption(boardManager, drafted.domino, leftCoord, rightCoord);
    return !!option;
  }

  /**
   * Attempt to place the current player's domino by anchoring one end at (x,y).
   * The opposite end coordinate is derived from the domino's current orientation.
   */
  tryPlaceCurrentDominoAt(x, y, anchorEnd = DominoEnd.LEFT) {
    const drafted = this.currentPlacingDraftedTile;
    if (!drafted) return { ok: false, reason: 'Not in placement phase.' };

    const playerIndex = this.currentPlacingPlayerIndex;
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
    if (!option) {
      return { ok: false, reason: 'Invalid placement.' };
    }

    const placed = boardManager.placeDomino(drafted.domino, option.tile, option.tileEdge, option.dominoEnd);
    if (!placed) {
      return { ok: false, reason: 'Engine rejected placement.' };
    }

    drafted.placed = true;
    this.#advancePlacement();
    return { ok: true, reason: '' };
  }

  #advancePlacement() {
    this.#placeCursor += 1;
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
