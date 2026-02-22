import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GameConfiguration } from '../classes/game-configuration.js';
import { GameState } from '../classes/enums/game-state.js';
import { Landscapes } from '../classes/enums/landscapes.js';
import { DominoEnd } from '../classes/enums/domino-end.js';
import { EdgeOffset } from '../classes/enums/edges.js';
import { WebGameManager } from '../classes/web-game-manager.js';
import { MultiplayerClient } from '../classes/multiplayer-client.js';
import { randomSeed } from '../classes/utils/rng.js';

const LANDSCAPE_COLORS = Object.freeze({
  [Landscapes.CASTLE]: 0x888888,
  [Landscapes.WHEAT]: 0xfcb13b,
  [Landscapes.FOREST]: 0x145a32,
  [Landscapes.MINE]: 0x5f6a6a,
  [Landscapes.PASTURE]: 0x52be80,
  [Landscapes.BOG]: 0x655780,
  [Landscapes.WATER]: 0x03a9f4,
});

function landscapeLabel(landscape) {
  switch (landscape) {
    case Landscapes.CASTLE:
      return 'Castle';
    case Landscapes.WHEAT:
      return 'Wheat';
    case Landscapes.FOREST:
      return 'Forest';
    case Landscapes.WATER:
      return 'Water';
    case Landscapes.PASTURE:
      return 'Pasture';
    case Landscapes.BOG:
      return 'Bog';
    case Landscapes.MINE:
      return 'Mine';
    default:
      return String(landscape);
  }
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function crownsText(crowns) {
  if (!crowns || crowns <= 0) return '';
  return '★'.repeat(Math.max(1, Math.min(3, crowns)));
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function createTextSprite(text, options = {}) {
  const {
    font = '700 48px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    fillStyle = '#111',
    background = 'rgba(255,255,255,0.9)',
    size = 128,
    border = 'rgba(255,255,255,0.35)',
    shadow = 'rgba(0,0,0,0.35)',
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = background;
  roundedRect(ctx, 8, 8, size - 16, size - 16, 18);
  ctx.fill();

  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  roundedRect(ctx, 8, 8, size - 16, size - 16, 18);
  ctx.stroke();

  ctx.shadowColor = shadow;
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = fillStyle;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.35, 0.35, 1);
  return sprite;
}

export class GameLayout extends HTMLElement {
  #shadow;
  #root;
  #canvasHost;
  #hud;
  #hudHeader;
  #hudTitle;
  #hudHint;
  #hudBody;
  #btnRotate;
  #btnSkip;
  #btnCenter;
  #btnRestart;
  #btnCollapse;
  #miniMapRow;
  /** @type {HTMLCanvasElement[]} */
  #miniMapCanvases = [];

  /** @type {WebGameManager} */
  #game;

  /** @type {MultiplayerClient | null} */
  #mp = null;

  /** @type {number | null} */
  #myPlayerIndex = null;

  /** @type {number} */
  #focusedPlayerIndex = 0;

  /** @type {string[]} */
  #playerNames = ['Player 1', 'Player 2'];

  /** @type {string} */
  #myName = 'Player';

  /** @type {{state:string, attempt?:number, delay?:number} | null} */
  #connStatus = null;

  /** @type {boolean} */
  #hudCollapsed = false;

  /** @type {THREE.WebGLRenderer} */
  #renderer;
  /** @type {THREE.Scene} */
  #scene;
  /** @type {THREE.OrthographicCamera} */
  #camera;
  /** @type {OrbitControls} */
  #controls;

  /** @type {ResizeObserver | null} */
  #resizeObserver = null;

  /** @type {boolean} */
  #threeOk = false;

  /** @type {string | null} */
  #threeError = null;

  /** @type {THREE.Object3D | null} */
  #debugMarker = null;
  /** @type {THREE.Raycaster} */
  #raycaster;
  /** @type {THREE.Vector2} */
  #pointer = new THREE.Vector2();
  /** @type {THREE.Mesh} */
  #boardPlane;

  /** @type {THREE.Group} */
  #tilesGroup;
  /** @type {THREE.Group} */
  #ghostGroup;

  /** @type {{x:number,y:number} | null} */
  #hoverAnchor = null;

  /** @type {{x:number,y:number,t:number} | null} */
  #pointerDown = null;

  // Controls how wide the view is in world units (before aspect).
  static #VIEW_SIZE = 7.5;

  /** @type {number} */
  #viewSize = GameLayout.#VIEW_SIZE;

  #isFiniteNumber(n) {
    return typeof n === 'number' && Number.isFinite(n);
  }

  #hasNaNMatrix(mat) {
    const e = mat.elements;
    for (let i = 0; i < e.length; i++) {
      if (!this.#isFiniteNumber(e[i])) return true;
    }
    return false;
  }

  #frameToBoardSize(boardSize, pad = 2) {
    if (!this.#camera || !this.#controls) return;
    if (!boardSize) return;

    const minX = boardSize.xMin - pad;
    const maxX = boardSize.xMax + pad;
    const minZ = boardSize.yMin - pad;
    const maxZ = boardSize.yMax + pad;

    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const rect = this.#canvasHost.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const aspect = w / h;

    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);

    // Fit both X and Z extents for an orthographic camera (size is vertical half-extent).
    const neededVertical = Math.max(spanZ / 2, (spanX / 2) / aspect);
    this.#viewSize = Math.max(GameLayout.#VIEW_SIZE, neededVertical);

    this.#controls.target.set(centerX, 0, centerZ);

    // Keep a small tilt to avoid the straight-down singularity.
    const span = Math.max(spanX, spanZ);
    const height = Math.max(10, 8 + span * 0.9);
    const tilt = Math.max(6, 5 + span * 0.45);
    this.#camera.position.set(centerX + tilt, height, centerZ + tilt);
    this.#camera.lookAt(centerX, 0, centerZ);
    this.#camera.updateMatrixWorld();

    // Shift framing to the right so content appears centered in the visible
    // area that remains after the left HUD panel.
    const hudRect = this.#hud?.getBoundingClientRect();
    if (hudRect && w > 0) {
      const hostRect = this.#canvasHost.getBoundingClientRect();
      const hudRightPx = Math.max(0, Math.min(w, hudRect.right - hostRect.left));
      const shiftPx = hudRightPx / 2;
      if (shiftPx > 0) {
        const worldPerPxX = (this.#camera.right - this.#camera.left) / w;
        const shiftWorld = shiftPx * worldPerPxX;
        const right = new THREE.Vector3().setFromMatrixColumn(this.#camera.matrixWorld, 0).normalize();
        this.#camera.position.addScaledVector(right, -shiftWorld);
        this.#controls.target.addScaledVector(right, -shiftWorld);
      }
    }

    this.#controls.update();
    this.#onResize();
  }

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.#buildDom();
    this.#safeInitThree();
    if (this.#threeOk) this.#wireEvents();
    this.#initMultiplayer();
    this.#refreshHud();
    if (this.#threeOk) {
      this.#renderBoard();
      this.#centerOnFocusedBoard();
      this.#ensureSizing();
      this.#tick();
    }
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this.#onResize);
    window.removeEventListener('keydown', this.#onKeyDown);
    globalThis.visualViewport?.removeEventListener('resize', this.#onResize);
    this.#resizeObserver?.disconnect();
    this.#mp?.disconnect();
  }

  #safeInitThree() {
    try {
      this.#initThree();
      this.#threeOk = true;
      this.#threeError = null;
    } catch (e) {
      this.#threeOk = false;
      this.#threeError = e instanceof Error ? e.message : String(e);
      // Render something useful in the HUD instead of failing silently.
      this.#flashError(`3D renderer failed to start: ${this.#threeError}`);
    }
  }

  #buildDom() {
    this.#root = document.createElement('div');
    this.#root.className = 'root';

    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; height: 100vh; height: 100dvh; width: 100vw; }
      .root { position: relative; height: 100%; width: 100%; overflow: hidden; background: #0f1115; }
      .canvasHost { position: absolute; inset: 0; touch-action: none; overscroll-behavior: none; }
      .canvasHost canvas { width: 100%; height: 100%; display: block; touch-action: none; }
      .hud {
        position: absolute;
        top: 12px;
        left: 12px;
        width: min(420px, calc(100vw - 24px));
        background: rgba(20, 22, 28, 0.85);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 10px;
        padding: 10px;
        color: #e9eef5;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        backdrop-filter: blur(8px);
      }
      .hud h2 { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.2px; }
      .hudHeader { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
      .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
      .muted { color: rgba(233,238,245,0.7); }
      button {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.15);
        background: rgba(255,255,255,0.08);
        color: #e9eef5;
        border-radius: 8px;
        padding: 6px 9px;
        cursor: pointer;
        font-weight: 600;
      }
      .btnCollapse { min-width: 34px; padding: 6px 8px; }
      button:hover { background: rgba(255,255,255,0.12); }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      .turnBanner {
        margin-top: 6px;
        padding: 7px 9px;
        border-radius: 9px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.2px;
        border: 1px solid rgba(255,255,255,0.14);
      }
      .turnMine {
        background: rgba(38, 136, 87, 0.28);
        color: #c6ffe4;
        border-color: rgba(118, 255, 181, 0.55);
      }
      .turnOther {
        background: rgba(41, 68, 116, 0.24);
        color: #cfe4ff;
        border-color: rgba(136, 186, 255, 0.45);
      }
      .draftList { margin-top: 8px; display: grid; gap: 6px; }
      .draftItem {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 6px;
        align-items: center;
        padding: 7px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.15);
      }
      .draftMeta { display: grid; gap: 4px; }
      .dominoPreview {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px;
      }
      .dominoHalf {
        min-height: 34px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.30);
        display: grid;
        align-content: center;
        justify-items: center;
        color: rgba(12,14,18,0.90);
        text-shadow: 0 1px 0 rgba(255,255,255,0.45);
        font-size: 10px;
        font-weight: 700;
      }
      .dominoName { line-height: 1; }
      .dominoCrowns {
        margin-top: 2px;
        color: #f0c94f;
        text-shadow: 0 1px 2px rgba(0,0,0,0.55);
        letter-spacing: 0.5px;
      }
      .tag { font-size: 12px; padding: 2px 6px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); }
      .error { color: #ffb4b4; margin-top: 6px; }

      .miniRow { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
      .miniCard {
        display: grid;
        gap: 5px;
        padding: 7px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.15);
      }
      .miniTitle { font-size: 12px; font-weight: 700; color: rgba(233,238,245,0.85); }
      canvas.mini { width: 140px; height: 140px; border-radius: 8px; background: rgba(0,0,0,0.35); }
      .miniActive {
        outline: 2px solid rgba(102, 191, 255, 0.95);
        box-shadow: 0 0 0 3px rgba(102, 191, 255, 0.25);
        outline-offset: 2px;
      }
      .miniTurn {
        border-color: rgba(146, 255, 166, 0.60);
      }
      .focusInfo {
        margin-top: 4px;
        color: #9fd7ff;
        font-weight: 700;
        font-size: 12px;
      }

      .collapsed .hudHint,
      .collapsed #hudBody,
      .collapsed .miniRow,
      .collapsed .row {
        display: none;
      }

      @media (max-width: 760px) {
        .hud {
          width: min(360px, calc(100vw - 16px));
          top: 8px;
          left: 8px;
          padding: 8px;
        }
        .miniRow { gap: 6px; }
      }
    `;

    this.#canvasHost = document.createElement('div');
    this.#canvasHost.className = 'canvasHost';

    this.#hud = document.createElement('div');
    this.#hud.className = 'hud';
    this.#hudHeader = document.createElement('div');
    this.#hudHeader.className = 'hudHeader';
    this.#hudTitle = document.createElement('h2');
    this.#btnCollapse = document.createElement('button');
    this.#btnCollapse.className = 'btnCollapse';
    this.#btnCollapse.textContent = '▾';
    this.#btnCollapse.title = 'Collapse panel';

    this.#hudHeader.append(this.#hudTitle, this.#btnCollapse);
    this.#hudBody = document.createElement('div');
    this.#hudBody.id = 'hudBody';

    const controlsRow = document.createElement('div');
    controlsRow.className = 'row';
    this.#btnRotate = document.createElement('button');
    this.#btnRotate.textContent = 'Rotate (R)';
    this.#btnSkip = document.createElement('button');
    this.#btnSkip.textContent = 'Skip';
    this.#btnCenter = document.createElement('button');
    this.#btnCenter.textContent = 'Center';
    this.#btnRestart = document.createElement('button');
    this.#btnRestart.textContent = 'Restart';
    controlsRow.append(this.#btnRotate, this.#btnSkip, this.#btnCenter, this.#btnRestart);

    this.#hudHint = document.createElement('div');
    this.#hudHint.className = 'muted hudHint';
    this.#hudHint.textContent = 'Pan: drag on the board. Zoom: scroll/pinch. Use Center if you get lost.';

    this.#miniMapRow = document.createElement('div');
    this.#miniMapRow.className = 'miniRow';

    this.#hud.append(this.#hudHeader, controlsRow, this.#hudHint, this.#hudBody, this.#miniMapRow);
    this.#root.append(this.#canvasHost, this.#hud);
    this.#shadow.append(style, this.#root);

    if ((window.innerWidth || 0) <= 760) {
      this.#setHudCollapsed(true);
    }
  }

  #initGame(seed, playerNames) {
    const config = new GameConfiguration(2, false, false);
    this.#game = new WebGameManager(config, seed);
    this.#playerNames = playerNames?.length ? playerNames : ['Player 1', 'Player 2'];
    this.#game.start(this.#playerNames);
  }

  #initMultiplayer() {
    const url = new URL(location.href);
    let room = url.searchParams.get('room');
    if (!room) {
      room = Math.random().toString(36).slice(2, 8);
      url.searchParams.set('room', room);
      history.replaceState(null, '', url.toString());
    }

    const name = url.searchParams.get('name') || prompt('Your name?', 'Player') || 'Player';
    this.#myName = name;
    url.searchParams.set('name', name);
    history.replaceState(null, '', url.toString());

    this.#mp = new MultiplayerClient({
      roomId: room,
      name,
      onStatus: (s) => {
        this.#connStatus = s;
        this.#refreshHud();
      },
      onJoined: ({ playerIndex, seed, actions, players }) => {
        this.#myPlayerIndex = playerIndex;
        this.#focusedPlayerIndex = playerIndex ?? 0;
        this.#initGame(seed, players);
        // Replay history
        for (const a of actions) this.#applyNetworkAction(a);
        this.#syncFocusedBoardToPhase();
        this.#refreshHud();
        this.#renderBoard();
        this.#centerOnFocusedBoard();
        this.#renderGhost();
      },
      onPlayers: (players) => {
        this.#playerNames = players?.length ? players : this.#playerNames;
        this.#refreshHud();
        this.#ensureMiniMaps();
        this.#renderMiniMaps();
      },
      onAction: (action) => {
        this.#applyNetworkAction(action);
        const focusChanged = this.#syncFocusedBoardToPhase();
        this.#refreshHud();
        this.#renderBoard();
        if (focusChanged) this.#centerOnFocusedBoard();
        this.#renderGhost();
      },
      onError: (message) => {
        this.#flashError(message);
      },
    });

    // Provisional local state until join response.
    this.#initGame(randomSeed(), ['Player 1', 'Player 2']);
    this.#mp.connect();
  }

  #applyNetworkAction(action) {
    switch (action.type) {
      case 'pickDraft':
        this.#game.pickDraft(action.payload.index);
        return;
      case 'rotate':
        this.#game.rotateCurrentDomino();
        return;
      case 'skip':
        this.#game.skipCurrentPlacement();
        return;
      case 'place':
        // Network-safe payloads use string anchor ends.
        // Default to LEFT for backwards/defensive compatibility.
        this.#game.tryPlaceCurrentDominoAt(
          action.payload.x,
          action.payload.y,
          action.payload.anchorEnd === 'RIGHT' ? DominoEnd.RIGHT : DominoEnd.LEFT
        );
        return;
      case 'restart': {
        // Restart uses a new seed to avoid repeating the same shuffle.
        const seed = action.payload.seed ?? randomSeed();
        this.#initGame(seed, this.#playerNames);
        return;
      }
    }
  }

  #isMyTurnToPick() {
    return this.#myPlayerIndex != null && this.#game.state === GameState.DRAFT && this.#myPlayerIndex === this.#game.currentPickingPlayerIndex;
  }

  #isMyTurnToPlace() {
    return this.#myPlayerIndex != null && this.#game.state === GameState.PLACE && this.#myPlayerIndex === this.#game.currentPlacingPlayerIndex;
  }

  #activePlayerIndex() {
    return this.#game.state === GameState.PLACE
      ? this.#game.currentPlacingPlayerIndex
      : this.#game.currentPickingPlayerIndex;
  }

  #syncFocusedBoardToPhase() {
    if (!this.#game?.players?.length) return false;
    if (this.#game.state !== GameState.PLACE) return false;
    const active = this.#activePlayerIndex();
    if (this.#focusedPlayerIndex === active) return false;
    this.#focusedPlayerIndex = active;
    return true;
  }

  #setHudCollapsed(collapsed) {
    this.#hudCollapsed = !!collapsed;
    this.#hud?.classList.toggle('collapsed', this.#hudCollapsed);
    if (this.#btnCollapse) {
      this.#btnCollapse.textContent = this.#hudCollapsed ? '▸' : '▾';
      this.#btnCollapse.title = this.#hudCollapsed ? 'Expand panel' : 'Collapse panel';
    }
  }

  #initThree() {
    const debugParam = new URL(location.href).searchParams.get('debug');
    const debugLevel = debugParam == null ? 0 : Number.parseInt(debugParam, 10);
    const debug = debugLevel >= 1;

    this.#scene = new THREE.Scene();
    // Use a slightly distinct background from the page so rendering failures are obvious.
    this.#scene.background = new THREE.Color(debug ? 0x1a2a3a : 0x12151b);

    // Top-down-ish orthographic camera feels like a board game and makes panning intuitive.
    const aspect = 1;
    const size = this.#viewSize;
    this.#camera = new THREE.OrthographicCamera(
      -size * aspect,
      size * aspect,
      size,
      -size,
      0.1,
      100
    );
    // NOTE: Using a non-standard up vector confused OrbitControls in some browsers.
    // Keep a standard up vector and use a slight tilt to guarantee visible depth cues.
    this.#camera.up.set(0, 1, 0);
    this.#camera.position.set(6, 12, 6);
    this.#camera.lookAt(0, 0, 0);

    // Safari can be finicky with WebGL context creation; set a preference and fail fast.
    this.#renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.#renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.#renderer.domElement.style.width = '100%';
    this.#renderer.domElement.style.height = '100%';
    this.#renderer.domElement.style.touchAction = 'none';
    this.#canvasHost.appendChild(this.#renderer.domElement);

    // Context lost happens frequently on iOS Safari under memory pressure.
    this.#renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.#flashError('WebGL context lost. Trying to recover…');
    });
    this.#renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.#flashError('WebGL restored.');
      this.#ensureSizing();
    });

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.25);
    this.#scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.#scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(5, 10, 6);
    this.#scene.add(dir);

    // Slightly brighter grid so it's visible on most displays.
    const grid = new THREE.GridHelper(30, 30, debug ? 0x6b8bb3 : 0x3a4353, debug ? 0x3f5a74 : 0x222a35);
    grid.position.y = 0;
    this.#scene.add(grid);

    if (debug) {
      const axes = new THREE.AxesHelper(5);
      axes.position.y = 0.02;
      this.#scene.add(axes);

      // Keep the marker away from the origin so it doesn't hide the castle tile.
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.6, 1.2),
        new THREE.MeshNormalMaterial({ wireframe: true })
      );
      marker.position.set(3, 0.35, 3);
      this.#scene.add(marker);
      this.#debugMarker = marker;

      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshBasicMaterial({ color: 0x223245, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = 0.001;
      this.#scene.add(plane);
    }

    const planeGeo = new THREE.PlaneGeometry(30, 30);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false });
    this.#boardPlane = new THREE.Mesh(planeGeo, planeMat);
    this.#boardPlane.rotateX(-Math.PI / 2);
    this.#scene.add(this.#boardPlane);

    this.#tilesGroup = new THREE.Group();
    this.#scene.add(this.#tilesGroup);
    this.#ghostGroup = new THREE.Group();
    this.#scene.add(this.#ghostGroup);

    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = true;
    this.#controls.enableRotate = false;
    this.#controls.enablePan = true;
    this.#controls.enableZoom = true;
    this.#controls.screenSpacePanning = true;
    // Make panning the primary interaction.
    this.#controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    // Touch support: one-finger drag pans, two-finger pinch/drag zooms/pans.
    this.#controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    this.#controls.enableKeys = true;
    this.#controls.keyPanSpeed = 22;
    this.#controls.target.set(0, 0, 0);
    this.#controls.update();

    // Some browsers end up with OrbitControls overriding camera orientation in odd ways;
    // make sure the camera is actually looking at the target.
    this.#camera.lookAt(this.#controls.target);
    this.#camera.updateMatrixWorld();

    if (debugLevel >= 2) {
      // Optional: disable controls to rule out controls-related camera issues.
      this.#controls.enabled = false;
    }

    this.#raycaster = new THREE.Raycaster();
    this.#ensureSizing();
  }

  #ensureSizing() {
    // Some Safari builds report 0x0 rect at construction time; keep retrying until non-zero.
    this.#onResize();

    if (!this.#resizeObserver) {
      this.#resizeObserver = new ResizeObserver(() => this.#onResize());
      this.#resizeObserver.observe(this.#canvasHost);
    }

    // iOS Safari dynamic address bar changes viewport without window resize.
    globalThis.visualViewport?.addEventListener('resize', this.#onResize);

    requestAnimationFrame(() => this.#onResize());
    setTimeout(() => this.#onResize(), 0);
    setTimeout(() => this.#onResize(), 50);
  }

  #wireEvents() {
    this.#btnRotate.addEventListener('click', () => {
      if (!this.#isMyTurnToPlace()) return;
      this.#mp?.sendAction('rotate');
    });
    this.#btnSkip.addEventListener('click', () => {
      if (!this.#isMyTurnToPlace()) return;
      this.#mp?.sendAction('skip');
    });
    this.#btnRestart.addEventListener('click', () => {
      const seed = randomSeed();
      this.#mp?.sendAction('restart', { seed });
    });

    this.#btnCenter.addEventListener('click', () => {
      this.#centerOnFocusedBoard();
    });

    this.#btnCollapse.addEventListener('click', () => {
      this.#setHudCollapsed(!this.#hudCollapsed);
    });

    this.#renderer.domElement.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    this.#renderer.domElement.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    this.#renderer.domElement.addEventListener('pointerup', (e) => this.#onPointerUp(e));
    this.#renderer.domElement.addEventListener('pointercancel', () => this.#onPointerCancel());

    window.addEventListener('resize', this.#onResize);
    window.addEventListener('keydown', this.#onKeyDown);
  }

  #onResize = () => {
    if (!this.#renderer || !this.#camera) return;

    const rect = this.#canvasHost.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.#renderer.setSize(w, h, false);
    const aspect = w / h;
    const size = this.#viewSize;
    this.#camera.left = -size * aspect;
    this.#camera.right = size * aspect;
    this.#camera.top = size;
    this.#camera.bottom = -size;
    this.#camera.updateProjectionMatrix();
  };

  #onKeyDown = (e) => {
    if (e.key.toLowerCase() === 'r') {
      if (!this.#isMyTurnToPlace()) return;
      this.#mp?.sendAction('rotate');
    }
  };

  #onPointerMove(e) {
    const grid = this.#gridFromClient(e.clientX, e.clientY);
    if (!grid) return;
    this.#hoverAnchor = grid;
    this.#renderGhost();
  }

  #onPointerDown(e) {
    // Prevent browser panning/zooming the page when interacting with the board.
    if (e.pointerType === 'touch') e.preventDefault();
    try {
      this.#renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const grid = this.#gridFromClient(e.clientX, e.clientY);
    if (grid) {
      this.#hoverAnchor = grid;
      this.#renderGhost();
    }

    this.#pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  #onPointerUp(e) {
    if (e.pointerType === 'touch') e.preventDefault();

    const start = this.#pointerDown;
    this.#pointerDown = null;
    if (!start) return;

    // Treat as a tap if the pointer didn’t move much.
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist2 = dx * dx + dy * dy;
    const dt = performance.now() - start.t;
    const TAP_DIST2 = 9 * 9;
    const TAP_MS = 350;
    if (dist2 > TAP_DIST2 || dt > TAP_MS) return;

    const grid = this.#gridFromClient(e.clientX, e.clientY);
    if (!grid) return;
    this.#hoverAnchor = grid;
    this.#renderGhost();
    this.#tryPlaceAtHover();
  }

  #onPointerCancel() {
    this.#pointerDown = null;
  }

  #gridFromClient(clientX, clientY) {
    const rect = this.#renderer.domElement.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    this.#pointer.x = ((clientX - rect.left) / w) * 2 - 1;
    this.#pointer.y = -(((clientY - rect.top) / h) * 2 - 1);
    this.#raycaster.setFromCamera(this.#pointer, this.#camera);
    const hits = this.#raycaster.intersectObject(this.#boardPlane);
    if (!hits.length) return null;
    const p = hits[0].point;
    return { x: Math.round(p.x), y: Math.round(p.z) };
  }

  #tryPlaceAtHover() {
    if (!this.#hoverAnchor) return;
    if (!this.#isMyTurnToPlace()) return;

    const x = this.#hoverAnchor.x;
    const y = this.#hoverAnchor.y;

    // Network-safe payloads use 'LEFT'|'RIGHT'.
    let anchorEnd = null;
    if (this.#game.canPlaceCurrentDominoAt(x, y, DominoEnd.LEFT)) anchorEnd = 'LEFT';
    else if (this.#game.canPlaceCurrentDominoAt(x, y, DominoEnd.RIGHT)) anchorEnd = 'RIGHT';
    else {
      this.#flashError('Invalid placement.');
      return;
    }

    this.#mp?.sendAction('place', { x, y, anchorEnd });
  }

  #flashError(message) {
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent = message;
    this.#hudBody.prepend(err);
    setTimeout(() => err.remove(), 1200);
  }

  #refreshHud() {
    const g = this.#game;
    const playerScores = g.players
      .map((p, i) => `P${i + 1} ${this.#playerNames[i] ?? p.name}: ${p.board.score}`)
      .join(' · ');

    this.#hudTitle.textContent = g.isGameOver
      ? `Game Over — ${playerScores}`
      : `Round ${g.round} — ${playerScores}`;

    this.#btnRotate.disabled = !this.#isMyTurnToPlace() || g.isGameOver;
    this.#btnSkip.disabled = !this.#isMyTurnToPlace() || g.isGameOver;

    this.#hudBody.innerHTML = '';

    const you = document.createElement('div');
    you.className = 'muted';
    if (this.#myPlayerIndex == null) you.textContent = `You: ${this.#myName} (Spectator)`;
    else you.textContent = `You: P${this.#myPlayerIndex + 1} ${this.#myName}`;
    this.#hudBody.append(you);

    if (!this.#threeOk) {
      const warn = document.createElement('div');
      warn.className = 'error';
      warn.textContent = `Board renderer unavailable. ${this.#threeError ? `(${this.#threeError})` : ''}`;
      this.#hudBody.append(warn);
    } else {
      const dbg = new URL(location.href).searchParams.get('debug');
      if (dbg === '1') {
        const rect = this.#canvasHost.getBoundingClientRect();
        const debugLine = document.createElement('div');
        debugLine.className = 'muted';
        debugLine.textContent = `CanvasHost: ${Math.round(rect.width)}×${Math.round(rect.height)} | DPR: ${window.devicePixelRatio || 1}`;
        this.#hudBody.append(debugLine);

        const board = this.#game?.players?.[this.#focusedPlayerIndex]?.board?.board;
        const keys = board ? Object.keys(board).length : 0;
        const dbg2 = document.createElement('div');
        dbg2.className = 'muted';
        dbg2.textContent = `Board tiles: ${keys} | Scene children: ${this.#scene?.children?.length ?? 0} | TilesGroup children: ${this.#tilesGroup?.children?.length ?? 0}`;
        this.#hudBody.append(dbg2);

        if (this.#camera) {
          const p = this.#camera.position;
          const t = this.#controls?.target;

          const dbg3 = document.createElement('div');
          dbg3.className = 'muted';
          dbg3.textContent = `Cam pos: ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} | Target: ${t ? `${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}` : 'n/a'}`;
          this.#hudBody.append(dbg3);

          const dbg4 = document.createElement('div');
          dbg4.className = 'muted';
          dbg4.textContent = `Frustum: L${this.#camera.left.toFixed(2)} R${this.#camera.right.toFixed(2)} T${this.#camera.top.toFixed(2)} B${this.#camera.bottom.toFixed(2)} | Near ${this.#camera.near} Far ${this.#camera.far} | viewSize ${this.#viewSize.toFixed(2)}`;
          this.#hudBody.append(dbg4);

          const dbg5 = document.createElement('div');
          dbg5.className = 'muted';
          dbg5.textContent = `Matrices: projNaN=${this.#hasNaNMatrix(this.#camera.projectionMatrix)} viewNaN=${this.#hasNaNMatrix(this.#camera.matrixWorldInverse)}`;
          this.#hudBody.append(dbg5);
        }
      }
    }

    const viewing = document.createElement('div');
    viewing.className = 'focusInfo';
    const focusedName = this.#playerNames[this.#focusedPlayerIndex] ?? this.#game.players[this.#focusedPlayerIndex]?.name ?? `Player ${this.#focusedPlayerIndex + 1}`;
    viewing.textContent = `Viewing board: P${this.#focusedPlayerIndex + 1} ${focusedName}`;
    this.#hudBody.append(viewing);

    const activeIdx = this.#activePlayerIndex();
    const activeName = this.#playerNames[activeIdx] ?? g.players[activeIdx]?.name ?? `P${activeIdx + 1}`;
    const isMine = this.#myPlayerIndex != null && this.#myPlayerIndex === activeIdx;
    const mode = g.state === GameState.DRAFT ? 'pick' : 'place';
    const turn = document.createElement('div');
    turn.className = `turnBanner ${isMine ? 'turnMine' : 'turnOther'}`;
    turn.textContent = isMine
      ? `Your turn — ${mode}`
      : `Their turn — ${activeName} is choosing ${mode}`;
    this.#hudBody.append(turn);

    if (this.#connStatus) {
      const conn = document.createElement('div');
      conn.className = 'muted';
      const s = this.#connStatus;
      if (s.state === 'reconnecting') conn.textContent = `Connection: reconnecting (attempt ${s.attempt}, ${Math.ceil((s.delay ?? 0) / 100) / 10}s)`;
      else conn.textContent = `Connection: ${s.state}`;
      this.#hudBody.append(conn);
    }

    const status = document.createElement('div');
    status.className = 'muted';
    if (g.isGameOver) {
      status.textContent = 'No more dominos in the pool.';
      this.#hudBody.append(status);
      return;
    }

    if (g.state === GameState.DRAFT) {
      status.textContent = `Draft phase — picking: ${this.#playerNames[g.currentPickingPlayerIndex] ?? g.players[g.currentPickingPlayerIndex].name}`;
      this.#hudBody.append(status);

      const list = document.createElement('div');
      list.className = 'draftList';
      g.currentDraft.forEach((slot, idx) => {
        const item = document.createElement('div');
        item.className = 'draftItem';

        const left = `${landscapeLabel(slot.domino.leftEnd.landscape)}(${slot.domino.leftEnd.crowns})`;
        const right = `${landscapeLabel(slot.domino.rightEnd.landscape)}(${slot.domino.rightEnd.crowns})`;
        const pickedBy = slot.player == null ? 'Available' : `Picked by ${this.#playerNames[slot.player] ?? g.players[slot.player].name}`;

        const label = document.createElement('div');
        label.className = 'draftMeta';

        const top = document.createElement('div');
        top.innerHTML = `<span class="tag">#${slot.domino.number}</span> ${left} | ${right}`;

        const preview = document.createElement('div');
        preview.className = 'dominoPreview';

        const mkHalf = (landscape, crowns) => {
          const el = document.createElement('div');
          el.className = 'dominoHalf';
          const color = LANDSCAPE_COLORS[landscape] ?? 0xeeeeee;
          el.style.background = `#${color.toString(16).padStart(6, '0')}`;

          const nameEl = document.createElement('div');
          nameEl.className = 'dominoName';
          nameEl.textContent = landscapeLabel(landscape);
          el.append(nameEl);

          if (crowns > 0) {
            const crownsEl = document.createElement('div');
            crownsEl.className = 'dominoCrowns';
            crownsEl.textContent = crownsText(crowns);
            el.append(crownsEl);
          }
          return el;
        };

        preview.append(
          mkHalf(slot.domino.leftEnd.landscape, slot.domino.leftEnd.crowns),
          mkHalf(slot.domino.rightEnd.landscape, slot.domino.rightEnd.crowns),
        );

        const picked = document.createElement('div');
        picked.className = 'muted';
        picked.textContent = pickedBy;

        label.append(top, preview, picked);

        const btn = document.createElement('button');
        btn.textContent = 'Pick';
        btn.disabled = slot.player != null || !this.#isMyTurnToPick();
        btn.addEventListener('click', () => {
          if (!this.#isMyTurnToPick()) return;
          this.#mp?.sendAction('pickDraft', { index: idx });
        });

        item.append(label, btn);
        list.append(item);
      });
      this.#hudBody.append(list);
    } else {
      const drafted = g.currentPlacingDraftedTile;
      const playerName = this.#playerNames[g.currentPlacingPlayerIndex] ?? g.players[g.currentPlacingPlayerIndex].name;
      status.textContent = `Place phase — placing: ${playerName}`;
      this.#hudBody.append(status);
      if (drafted) {
        const info = document.createElement('div');
        info.className = 'muted';
        info.textContent = `Domino #${drafted.domino.number} — click to place; Rotate (R) changes orientation; click chooses which end anchors.`;
        this.#hudBody.append(info);
      }
    }

    this.#renderMiniMaps();
  }

  #renderBoard() {
    while (this.#tilesGroup.children.length) this.#tilesGroup.remove(this.#tilesGroup.children[0]);

    const board = this.#game.players[this.#focusedPlayerIndex]?.board?.board || this.#game.players[0].board.board;
    for (const k of Object.keys(board)) {
      const tile = board[k];
      const color = LANDSCAPE_COLORS[tile.landscape] ?? 0xeeeeee;

      const tileMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.22, 0.98),
        new THREE.MeshStandardMaterial({ color })
      );
      tileMesh.position.set(tile.x, 0.11, tile.y);
      this.#tilesGroup.add(tileMesh);

      if (tile.crowns > 0 || tile.landscape === Landscapes.CASTLE) {
        const isCastle = tile.landscape === Landscapes.CASTLE;
        const text = isCastle ? '♜' : crownsText(tile.crowns);
        const sprite = createTextSprite(text, {
          font: text.length >= 2
            ? '700 42px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
            : '700 56px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
          fillStyle: isCastle ? '#1f232b' : '#f5cc51',
          background: isCastle ? 'rgba(240,240,240,0.92)' : 'rgba(28,31,38,0.88)',
          border: isCastle ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.32)',
        });
        sprite.position.set(tile.x, 0.38, tile.y);
        this.#tilesGroup.add(sprite);
      }
    }
  }

  #centerOnActiveBoard() {
    if (!this.#controls || !this.#camera) return;

    const activeIdx = this.#game.state === GameState.PLACE
      ? this.#game.currentPlacingPlayerIndex
      : this.#game.currentPickingPlayerIndex;

    const bm = this.#game.players[activeIdx].board;
    const bs = bm.boardSize;

    this.#frameToBoardSize(bs, 2);
  }

  #centerOnFocusedBoard() {
    if (!this.#game?.players?.length) return;
    const idx = Math.max(0, Math.min(this.#focusedPlayerIndex, this.#game.players.length - 1));
    const bs = this.#game.players[idx].board.boardSize;
    this.#frameToBoardSize(bs, 2);
  }

  #ensureMiniMaps() {
    const needed = this.#game.players.length;
    if (this.#miniMapCanvases.length === needed) return;

    this.#miniMapRow.innerHTML = '';
    this.#miniMapCanvases = [];

    this.#game.players.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'miniCard';

      const title = document.createElement('div');
      title.className = 'miniTitle';
      title.textContent = `P${idx + 1}: ${this.#playerNames[idx] ?? p.name}`;

      const canvas = document.createElement('canvas');
      canvas.width = 140;
      canvas.height = 140;
      canvas.className = 'mini';

      card.append(title, canvas);
      this.#miniMapRow.append(card);
      card.addEventListener('click', () => {
        this.#focusedPlayerIndex = idx;
        this.#renderBoard();
        this.#centerOnFocusedBoard();
        this.#refreshHud();
      });
      this.#miniMapCanvases.push(canvas);
    });
  }

  #renderMiniMaps() {
    this.#ensureMiniMaps();

    const activeIdx = this.#game.state === GameState.PLACE
      ? this.#game.currentPlacingPlayerIndex
      : this.#game.currentPickingPlayerIndex;

    this.#miniMapCanvases.forEach((canvas, idx) => {
      canvas.classList.toggle('miniActive', idx === this.#focusedPlayerIndex);
      canvas.parentElement?.classList.toggle('miniTurn', idx === activeIdx);
      const t = canvas.parentElement?.querySelector('.miniTitle');
      if (t) t.textContent = `P${idx + 1}: ${this.#playerNames[idx] ?? this.#game.players[idx].name}`;
      this.#drawMiniBoard(canvas, this.#game.players[idx].board);
    });
  }

  #drawMiniBoard(canvas, boardManager) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const board = boardManager.board;
    const bs = boardManager.boardSize;

    // Pad the view a bit so the board doesn't touch edges.
    const minX = Math.min(bs.xMin - 2, -3);
    const maxX = Math.max(bs.xMax + 2, 3);
    const minY = Math.min(bs.yMin - 2, -3);
    const maxY = Math.max(bs.yMax + 2, 3);

    const gridW = maxX - minX + 1;
    const gridH = maxY - minY + 1;

    const tilePx = Math.max(6, Math.floor((Math.min(canvas.width, canvas.height) - 6) / Math.max(gridW, gridH)));
    const drawW = gridW * tilePx;
    const drawH = gridH * tilePx;
    const ox = Math.floor((canvas.width - drawW) / 2);
    const oy = Math.floor((canvas.height - drawH) / 2);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= gridW; gx++) {
      ctx.beginPath();
      ctx.moveTo(ox + gx * tilePx, oy);
      ctx.lineTo(ox + gx * tilePx, oy + drawH);
      ctx.stroke();
    }
    for (let gy = 0; gy <= gridH; gy++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + gy * tilePx);
      ctx.lineTo(ox + drawW, oy + gy * tilePx);
      ctx.stroke();
    }

    // Tiles
    for (const k of Object.keys(board)) {
      const tile = board[k];
      const x = tile.x;
      const y = tile.y;
      const px = ox + (x - minX) * tilePx;
      const py = oy + (maxY - y) * tilePx;
      const color = LANDSCAPE_COLORS[tile.landscape] ?? 0xeeeeee;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(px + 1, py + 1, tilePx - 2, tilePx - 2);

      if (tile.crowns > 0 || tile.landscape === Landscapes.CASTLE) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.font = `${Math.max(8, Math.floor(tilePx * 0.55))}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = tile.landscape === Landscapes.CASTLE ? 'C' : String(tile.crowns);
        ctx.fillText(label, px + tilePx / 2, py + tilePx / 2);
      }
    }
  }

  #renderGhost() {
    while (this.#ghostGroup.children.length) this.#ghostGroup.remove(this.#ghostGroup.children[0]);

    const g = this.#game;
    if (g.isGameOver) return;
    if (g.state !== GameState.PLACE) return;
    if (!this.#hoverAnchor) return;

    const drafted = g.currentPlacingDraftedTile;
    if (!drafted) return;

    const anchor = this.#hoverAnchor;
    const connectedEdge = drafted.domino.getConnectedEdge(DominoEnd.LEFT);
    const off = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
    const other = { x: anchor.x + off.x, y: anchor.y + off.y };

    const activeIdx = g.currentPlacingPlayerIndex;
    const board = g.players[activeIdx].board.board;
    const occupied = board[keyOf(anchor.x, anchor.y)] || board[keyOf(other.x, other.y)];

    const leftColor = LANDSCAPE_COLORS[drafted.domino.leftEnd.landscape] ?? 0xffffff;
    const rightColor = LANDSCAPE_COLORS[drafted.domino.rightEnd.landscape] ?? 0xffffff;

    const matA = new THREE.MeshStandardMaterial({
      color: leftColor,
      transparent: true,
      opacity: occupied ? 0.25 : 0.55,
    });
    const matB = new THREE.MeshStandardMaterial({
      color: rightColor,
      transparent: true,
      opacity: occupied ? 0.25 : 0.55,
    });

    const meshA = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.18, 0.98), matA);
    meshA.position.set(anchor.x, 0.09, anchor.y);
    this.#ghostGroup.add(meshA);

    const meshB = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.18, 0.98), matB);
    meshB.position.set(other.x, 0.09, other.y);
    this.#ghostGroup.add(meshB);
  }

  #tick = () => {
    // Defensive: if camera/controls ever become NaN, rendering can silently disappear.
    // Self-heal to a valid framing.
    if (this.#camera && this.#controls) {
      const p = this.#camera.position;
      const t = this.#controls.target;
      const bad =
        !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) ||
        !Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z) ||
        !Number.isFinite(this.#camera.left) || !Number.isFinite(this.#camera.right) ||
        !Number.isFinite(this.#camera.top) || !Number.isFinite(this.#camera.bottom) ||
        this.#hasNaNMatrix(this.#camera.projectionMatrix) ||
        this.#hasNaNMatrix(this.#camera.matrixWorldInverse);

      if (bad) {
        this.#viewSize = GameLayout.#VIEW_SIZE;
        this.#controls.target.set(0, 0, 0);
        this.#camera.position.set(6, 12, 6);
        this.#camera.lookAt(0, 0, 0);
        this.#camera.updateMatrixWorld();
        this.#controls.update();
        this.#onResize();

        // If a game exists, re-frame to board bounds immediately.
        try {
          this.#centerOnFocusedBoard();
        } catch {
          // ignore
        }
      }
    }

    if (this.#debugMarker) {
      this.#debugMarker.rotation.y += 0.01;
      this.#debugMarker.rotation.x += 0.005;
    }
    if (this.#controls) this.#controls.update();
    if (this.#renderer && this.#scene && this.#camera) this.#renderer.render(this.#scene, this.#camera);
    requestAnimationFrame(this.#tick);
  };
}