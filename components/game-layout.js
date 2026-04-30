import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GameConfiguration } from '../classes/game-configuration.js';
import { GameState } from '../classes/enums/game-state.js';
import { Landscapes } from '../classes/enums/landscapes.js';
import { DominoEnd } from '../classes/enums/domino-end.js';
import { Edges, EdgeOffset } from '../classes/enums/edges.js';
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

const ALL_EDGES = [Edges.TOP, Edges.BOTTOM, Edges.LEFT, Edges.RIGHT];

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

function landscapeKey(landscape) {
  if (typeof landscape === 'symbol') {
    return landscape.description || String(landscape);
  }
  return String(landscape);
}

function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function drawCrownGlyph(ctx, x, y, size, fill = '#ffd86a', stroke = 'rgba(72,46,8,0.70)') {
  const w = size;
  const h = size * 0.72;
  const left = x - w / 2;
  const top = y - h / 2;

  ctx.beginPath();
  ctx.moveTo(left, top + h);
  ctx.lineTo(left + w * 0.16, top + h * 0.32);
  ctx.lineTo(left + w * 0.36, top + h * 0.58);
  ctx.lineTo(left + w * 0.50, top + h * 0.16);
  ctx.lineTo(left + w * 0.64, top + h * 0.58);
  ctx.lineTo(left + w * 0.84, top + h * 0.32);
  ctx.lineTo(left + w, top + h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.stroke();
}

function createSceneBackgroundTexture(debug = false, size = 1024, layer = 'front') {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base woven-mat tone
  const isBack = layer === 'back';
  const top = isBack
    ? (debug ? '#8f734d' : '#7b623f')
    : (debug ? '#b69563' : '#9c7a4d');
  const bottom = isBack
    ? (debug ? '#755c3d' : '#665031')
    : (debug ? '#8f6f45' : '#7a5d38');
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const rand = mulberry32(hash32(`bamboo|${debug ? '1' : '0'}|${layer}`));

  // Vertical bamboo slats
  const slatW = Math.max(24, Math.floor(size / 30));
  for (let x = -slatW; x < size + slatW; x += slatW) {
    const jitter = (rand() - 0.5) * 4;
    const lx = x + jitter;
    const w = slatW - 1 + rand() * 2;
    const slat = ctx.createLinearGradient(lx, 0, lx + w, 0);
    slat.addColorStop(0, isBack ? 'rgba(45,28,12,0.22)' : 'rgba(60,38,16,0.18)');
    slat.addColorStop(0.45, isBack ? 'rgba(230,205,160,0.07)' : 'rgba(255,232,188,0.10)');
    slat.addColorStop(1, isBack ? 'rgba(40,24,10,0.25)' : 'rgba(48,30,12,0.20)');
    ctx.fillStyle = slat;
    ctx.fillRect(lx, 0, w, size);
  }

  // Horizontal weave bands
  const bandH = Math.max(18, Math.floor(size / 42));
  for (let y = 0; y < size; y += bandH) {
    const a = (isBack ? 0.03 : 0.05) + rand() * (isBack ? 0.05 : 0.07);
    ctx.fillStyle = `rgba(255,236,200,${a})`;
    ctx.fillRect(0, y, size, 1 + Math.floor(rand() * 2));
    ctx.fillStyle = `rgba(50,31,13,${0.07 + rand() * 0.08})`;
    ctx.fillRect(0, y + Math.floor(bandH * 0.55), size, 1);
  }

  // Subtle fiber speckles
  const specks = isBack ? 3000 : 2500;
  for (let i = 0; i < specks; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const alpha = 0.015 + rand() * 0.05;
    ctx.fillStyle = `rgba(35,22,9,${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createGalaxyBackgroundTexture(debug = false, size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, debug ? '#132747' : '#080f22');
  g.addColorStop(0.55, debug ? '#1a2240' : '#101632');
  g.addColorStop(1, debug ? '#241935' : '#170f24');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const rand = mulberry32(hash32(`galaxy|${debug ? '1' : '0'}`));

  // Nebula clouds
  for (let i = 0; i < 5; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = size * (0.12 + rand() * 0.20);
    const n = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    const hue = i % 2 === 0 ? '120,180,255' : '195,115,255';
    n.addColorStop(0, `rgba(${hue},${debug ? 0.12 : 0.09})`);
    n.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = n;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  const stars = debug ? 260 : 340;
  for (let i = 0; i < stars; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.4 + rand() * 1.5;
    const a = 0.18 + rand() * 0.62;
    ctx.fillStyle = `rgba(240,248,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function landscapeCssBackground(landscape, crowns = 0) {
  let base;
  switch (landscape) {
    case Landscapes.WHEAT:
      base = 'linear-gradient(145deg, #ffd980 0%, #f3bf58 58%, #d69a35 100%), repeating-linear-gradient(110deg, rgba(255,255,255,0.16) 0 3px, rgba(0,0,0,0) 3px 8px)';
      break;
    case Landscapes.FOREST:
      base = 'linear-gradient(145deg, #3f8f5f 0%, #1f6f43 58%, #155431 100%), radial-gradient(circle at 28% 68%, rgba(172,235,192,0.28) 0 18%, rgba(0,0,0,0) 20%)';
      break;
    case Landscapes.WATER:
      base = 'linear-gradient(150deg, #5fc9df 0%, #2aa0c0 46%, #186f96 100%), repeating-linear-gradient(8deg, rgba(144,230,255,0.14) 0 2px, rgba(0,0,0,0) 2px 9px), radial-gradient(circle at 24% 74%, rgba(20,116,146,0.34) 0 18%, rgba(0,0,0,0) 22%)';
      break;
    case Landscapes.PASTURE:
      base = 'linear-gradient(145deg, #a6e89a 0%, #6fce6a 58%, #46a84a 100%), radial-gradient(circle at 72% 34%, rgba(255,255,255,0.26) 0 17%, rgba(0,0,0,0) 19%)';
      break;
    case Landscapes.BOG:
      base = 'linear-gradient(145deg, #9b83b5 0%, #7a629b 58%, #584478 100%), radial-gradient(circle at 62% 66%, rgba(235,210,255,0.20) 0 20%, rgba(0,0,0,0) 22%)';
      break;
    case Landscapes.MINE:
      base = 'linear-gradient(145deg, #9ca7ad 0%, #7f8a91 56%, #5c676f 100%), repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0 3px, rgba(0,0,0,0) 3px 8px)';
      break;
    case Landscapes.CASTLE:
      base = 'linear-gradient(145deg, #d8dadd 0%, #b8bec4 56%, #939ca4 100%), repeating-linear-gradient(0deg, rgba(40,44,50,0.28) 0 2px, rgba(0,0,0,0) 2px 12px)';
      break;
    default:
      base = '#cccccc';
      break;
  }

  const tier = Math.max(0, Math.min(3, crowns || 0));
  if (tier <= 0) return base;

  const layers = [base];
  layers.unshift('radial-gradient(circle at 84% 20%, rgba(255,219,120,0.38) 0 14%, rgba(255,219,120,0) 16%)');
  if (tier >= 2) {
    layers.unshift('repeating-linear-gradient(35deg, rgba(255,236,170,0.22) 0 2px, rgba(0,0,0,0) 2px 7px)');
  }
  if (tier >= 3) {
    layers.unshift('conic-gradient(from 210deg at 84% 20%, rgba(255,240,190,0.34), rgba(255,200,90,0.18), rgba(255,240,190,0.34))');
  }
  return layers.join(', ');
}

function createLandscapeTileTexture(landscape, crowns, seedKey, size = 256) {
  const seed = hash32(`${landscapeKey(landscape)}|${crowns}|${seedKey}`);
  const rand = mulberry32(seed);
  const base = LANDSCAPE_COLORS[landscape] ?? 0xeeeeee;
  const c = new THREE.Color(base);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const c1 = c.clone().offsetHSL(0, -0.04, 0.12).getStyle();
  const c2 = c.clone().offsetHSL(0, 0.01, -0.10).getStyle();
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const featureCount = 24 + Math.floor(rand() * 18);
  for (let i = 0; i < featureCount; i++) {
    const x = rand() * size;
    const y = rand() * size;

    if (landscape === Landscapes.WATER) {
      const w = 20 + rand() * 56;
      const h = 3 + rand() * 7;
      ctx.fillStyle = `rgba(99,199,226,${0.10 + rand() * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();

      if (rand() > 0.55) {
        ctx.strokeStyle = `rgba(187,241,255,${0.06 + rand() * 0.10})`;
        ctx.lineWidth = 1 + rand() * 1.2;
        ctx.beginPath();
        ctx.arc(x, y, 6 + rand() * 16, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (landscape === Landscapes.FOREST) {
      const r = 8 + rand() * 18;
      ctx.fillStyle = `rgba(14,54,27,${0.12 + rand() * 0.22})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (landscape === Landscapes.WHEAT) {
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + rand() * 0.2})`;
      ctx.lineWidth = 1 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(x - 12, y + 12);
      ctx.quadraticCurveTo(x, y, x + 10, y - 12);
      ctx.stroke();
    } else if (landscape === Landscapes.PASTURE) {
      const r = 4 + rand() * 10;
      ctx.fillStyle = `rgba(255,255,255,${0.10 + rand() * 0.18})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (landscape === Landscapes.MINE) {
      const w = 10 + rand() * 20;
      const h = 8 + rand() * 16;
      ctx.fillStyle = `rgba(35,42,48,${0.13 + rand() * 0.2})`;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
    } else if (landscape === Landscapes.BOG) {
      const rx = 9 + rand() * 20;
      const ry = 6 + rand() * 14;
      ctx.fillStyle = `rgba(61,36,86,${0.12 + rand() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    } else if (landscape === Landscapes.CASTLE) {
      ctx.strokeStyle = `rgba(70,74,82,${0.14 + rand() * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y + 8);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = Math.max(4, Math.floor(size * 0.03));
  ctx.strokeRect(1, 1, size - 2, size - 2);

  // subtle vignette
  const vignette = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.2, size * 0.5, size * 0.5, size * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  const crownTier = Math.max(0, Math.min(3, crowns || 0));
  if (crownTier > 0 && landscape !== Landscapes.CASTLE) {
    const cx = size - 32;
    const cy = 30;
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 24 + crownTier * 4);
    glow.addColorStop(0, `rgba(255,246,196,${0.52 + crownTier * 0.08})`);
    glow.addColorStop(1, 'rgba(255,224,130,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 24 + crownTier * 4, 0, Math.PI * 2);
    ctx.fill();

    drawCrownGlyph(ctx, cx, cy, 20 + crownTier * 4, '#ffd96e', 'rgba(78, 50, 10, 0.72)');

    const sparkleCount = 2 + crownTier * 2;
    for (let i = 0; i < sparkleCount; i++) {
      const a = (i / sparkleCount) * Math.PI * 2 + rand() * 0.8;
      const r = 17 + rand() * (6 + crownTier * 4);
      const sx = cx + Math.cos(a) * r;
      const sy = cy + Math.sin(a) * r;
      const s = 1.6 + rand() * (0.8 + crownTier * 0.8);
      ctx.strokeStyle = `rgba(255,245,200,${0.34 + rand() * 0.36})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - s, sy);
      ctx.lineTo(sx + s, sy);
      ctx.moveTo(sx, sy - s);
      ctx.lineTo(sx, sy + s);
      ctx.stroke();
    }

    if (crownTier >= 2) {
      ctx.strokeStyle = 'rgba(255, 222, 130, 0.60)';
      ctx.lineWidth = 2;
      ctx.strokeRect(5.5, 5.5, size - 11, size - 11);
    }

    if (crownTier >= 3) {
      drawCrownGlyph(ctx, 26, size - 24, 12, 'rgba(255,225,135,0.78)', 'rgba(80,52,10,0.62)');
      drawCrownGlyph(ctx, size - 64, size - 18, 10, 'rgba(255,225,135,0.72)', 'rgba(80,52,10,0.56)');
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export class GameLayout extends HTMLElement {
  #shadow;
  #root;
  #canvasHost;
  #canvasTurn;
  #hud;
  #canvasNotice;
  #hudHeader;
  #hudTitle;
  #hudHint;
  #hudBody;
  #btnRotate;
  #btnSkip;
  #btnUndoRequest;
  #btnNextValid;
  #btnResetTile;
  #btnPlace;
  #btnCenter;
  #btnRestart;
  #btnCollapse;
  #mobileActions;
  #btnMobileRotate;
  #btnMobileSkip;
  #btnMobileUndo;
  #btnMobileNext;
  #btnMobilePlace;
  #miniMapRow;
  /** @type {HTMLCanvasElement[]} */
  #miniMapCanvases = [];

  /** @type {WebGameManager} */
  #game;

  /** @type {MultiplayerClient | null} */
  #mp = null;

  /** @type {boolean} */
  #hotseat = false;

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

  /** @type {{type:string,payload:any}[]} */
  #actionHistory = [];

  /** @type {{requestId:string, requesterIndex:number, targetPlaceId:string | null} | null} */
  #pendingUndoRequest = null;

  /** @type {string} */
  #placementHint = '';

  /** @type {number | null} */
  #canvasNoticeTimer = null;

  /** @type {boolean} */
  #hudCollapsed = false;

  /** @type {GameState | null} */
  #lastAutoHudPhase = null;

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
  /** @type {THREE.Mesh | null} */
  #bambooMatFront = null;
  /** @type {THREE.GridHelper | null} */
  #gridHelper = null;
  /** @type {THREE.Raycaster} */
  #raycaster;
  /** @type {THREE.Vector2} */
  #pointer = new THREE.Vector2();
  /** @type {THREE.Mesh} */
  #boardPlane;

  /** @type {THREE.Group} */
  #tilesGroup;
  /** @type {THREE.Group} */
  #regionOverlayGroup;
  /** @type {THREE.Group} */
  #ghostGroup;

  /** @type {Map<string, THREE.Texture>} */
  #tileTextureCache = new Map();

  /** @type {Map<string, THREE.MeshStandardMaterial>} */
  #tileMaterialCache = new Map();

  /** @type {{x:number,y:number} | null} */
  #hoverAnchor = null;

  /** @type {boolean} */
  #hoverAnchorAuto = false;

  /** @type {{x:number,y:number,t:number} | null} */
  #pointerDown = null;

  /** @type {number | null} */
  #activeTouchPointerId = null;

  /** @type {'pan' | 'movePlacement' | null} */
  #touchInteractionMode = null;

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
    // If the panel is collapsed, center against the full viewport instead.
    const hudRect = this.#hud?.getBoundingClientRect();
    if (hudRect && w > 0 && !this.#hudCollapsed && !this.#isMobileViewport()) {
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
      .canvasTurn {
        position: absolute;
        top: 12px;
        left: 12px;
        padding: 7px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.20);
        background: rgba(20, 22, 28, 0.90);
        color: #e9eef5;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.2px;
        pointer-events: none;
        z-index: 6;
        display: none;
      }
      .canvasTurn.show { display: block; }
      .canvasTurn.turnMine {
        background: rgba(27, 76, 49, 0.92);
        color: #ccffe6;
        border-color: rgba(118, 255, 181, 0.60);
      }
      .canvasTurn.turnOther {
        background: rgba(30, 52, 94, 0.92);
        color: #d6e8ff;
        border-color: rgba(136, 186, 255, 0.55);
      }
      .mobileActions {
        position: absolute;
        right: 10px;
        bottom: 56px;
        display: none;
        gap: 8px;
        z-index: 6;
      }
      .mobileActions.show { display: flex; }
      .mobileBtn {
        border-radius: 999px;
        padding: 9px 12px;
        font-size: 13px;
        font-weight: 800;
        border: 1px solid rgba(255,255,255,0.28);
        background: rgba(20,22,28,0.94);
        color: #e9eef5;
      }
      .mobileBtn.primary {
        border-color: rgba(115, 232, 150, 0.75);
        background: rgba(27, 64, 45, 0.92);
        color: #d7ffe6;
      }
      .mobileBtn.warn {
        border-color: rgba(255, 201, 120, 0.70);
        background: rgba(73, 53, 24, 0.92);
        color: #ffe7bc;
      }
      .canvasNotice {
        position: absolute;
        left: 50%;
        bottom: 12px;
        transform: translateX(-50%);
        max-width: min(70vw, 720px);
        padding: 7px 10px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(20, 22, 28, 0.92);
        color: #e9eef5;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.2px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 120ms ease;
      }
      .canvasNotice.show { opacity: 1; }
      .canvasNotice.error {
        border-color: rgba(255, 120, 120, 0.7);
        color: #ffd2d2;
        background: rgba(48, 20, 20, 0.92);
      }
      .canvasNotice.info {
        border-color: rgba(126, 192, 255, 0.6);
        color: #d8ecff;
      }
      .hud {
        position: absolute;
        top: 12px;
        left: 12px;
        width: min(420px, calc(100vw - 24px));
        max-height: calc(100dvh - 24px);
        background: rgba(20, 22, 28, 0.85);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 10px;
        padding: 10px;
        color: #e9eef5;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        backdrop-filter: blur(8px);
        touch-action: manipulation;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
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
      .draftTop {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .draftTopMain {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .draftTopStatus {
        font-size: 12px;
        color: rgba(233,238,245,0.75);
        white-space: nowrap;
      }
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
          max-height: calc(100dvh - 16px);
          top: 8px;
          left: 8px;
          padding: 8px;
        }
        .miniRow { gap: 6px; }
      }
    `;

    this.#canvasHost = document.createElement('div');
    this.#canvasHost.className = 'canvasHost';

    this.#canvasTurn = document.createElement('div');
    this.#canvasTurn.className = 'canvasTurn';
    this.#canvasTurn.textContent = 'Waiting for game…';

    this.#canvasNotice = document.createElement('div');
    this.#canvasNotice.className = 'canvasNotice';

    this.#mobileActions = document.createElement('div');
    this.#mobileActions.className = 'mobileActions';
    this.#btnMobileRotate = document.createElement('button');
    this.#btnMobileRotate.className = 'mobileBtn';
    this.#btnMobileRotate.textContent = 'Rotate';
    this.#btnMobileSkip = document.createElement('button');
    this.#btnMobileSkip.className = 'mobileBtn warn';
    this.#btnMobileSkip.textContent = 'Skip';
    this.#btnMobileUndo = document.createElement('button');
    this.#btnMobileUndo.className = 'mobileBtn';
    this.#btnMobileUndo.textContent = 'Undo';
    this.#btnMobileNext = document.createElement('button');
    this.#btnMobileNext.className = 'mobileBtn';
    this.#btnMobileNext.textContent = 'Next';
    this.#btnMobilePlace = document.createElement('button');
    this.#btnMobilePlace.className = 'mobileBtn primary';
    this.#btnMobilePlace.textContent = 'Place';
    this.#mobileActions.append(this.#btnMobileRotate, this.#btnMobileSkip, this.#btnMobileUndo, this.#btnMobileNext, this.#btnMobilePlace);

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
    this.#btnUndoRequest = document.createElement('button');
    this.#btnUndoRequest.textContent = 'Request Undo';
    this.#btnNextValid = document.createElement('button');
    this.#btnNextValid.textContent = 'Next Valid';
    this.#btnResetTile = document.createElement('button');
    this.#btnResetTile.textContent = 'Reset Tile';
    this.#btnPlace = document.createElement('button');
    this.#btnPlace.textContent = 'Place';
    this.#btnCenter = document.createElement('button');
    this.#btnCenter.textContent = 'Center';
    this.#btnRestart = document.createElement('button');
    this.#btnRestart.textContent = 'Restart';
    controlsRow.append(this.#btnRotate, this.#btnSkip, this.#btnUndoRequest, this.#btnNextValid, this.#btnResetTile, this.#btnPlace, this.#btnCenter, this.#btnRestart);

    this.#hudHint = document.createElement('div');
    this.#hudHint.className = 'muted hudHint';
    this.#hudHint.textContent = 'Pan: drag on the board. Zoom: scroll/pinch. Use Center if you get lost.';

    this.#miniMapRow = document.createElement('div');
    this.#miniMapRow.className = 'miniRow';

    this.#hud.append(this.#hudHeader, controlsRow, this.#hudHint, this.#hudBody, this.#miniMapRow);
    this.#root.append(this.#canvasHost, this.#canvasTurn, this.#canvasNotice, this.#mobileActions, this.#hud);
    this.#shadow.append(style, this.#root);

    if ((window.innerWidth || 0) <= 760) {
      this.#setHudCollapsed(true);
    }
  }

  #initGame(seed, playerNames) {
    const config = new GameConfiguration(2, false, true);
    this.#game = new WebGameManager(config, seed);
    this.#playerNames = playerNames?.length ? playerNames : ['Player 1', 'Player 2'];
    this.#game.start(this.#playerNames);
  }

  #initMultiplayer() {
    const url = new URL(location.href);
    this.#hotseat = url.searchParams.get('hotseat') === '1';

    if (this.#hotseat) {
      const seed = Number.parseInt(url.searchParams.get('seed') || '', 10);
      const playerNames = [
        url.searchParams.get('p1') || 'Codex',
        url.searchParams.get('p2') || 'Helper',
      ];
      this.#myName = 'Hotseat';
      this.#connStatus = { state: 'hotseat' };
      this.#pendingUndoRequest = null;
      this.#actionHistory = [];
      this.#initGame(Number.isFinite(seed) ? seed : randomSeed(), playerNames);
      this.#syncHotseatPlayerIndex();
      this.#mp = {
        sendAction: (type, payload = {}) => this.#applyLocalAction({ type, payload }),
        disconnect: () => {},
      };
      this.#ensureMiniMaps();
      return;
    }

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
      playerToken: url.searchParams.get('playerToken') || undefined,
      onStatus: (s) => {
        this.#connStatus = s;
        this.#refreshHud();
      },
      onJoined: ({ playerIndex, seed, actions, players }) => {
        this.#myPlayerIndex = playerIndex;
        this.#focusedPlayerIndex = playerIndex ?? 0;
        this.#initGame(seed, players);
        this.#pendingUndoRequest = null;
        this.#actionHistory = [];
        // Replay history
        for (const a of (actions || [])) {
          this.#actionHistory.push(a);
          this.#applyNetworkAction(a);
        }
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
        this.#actionHistory.push(action);
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

  #syncHotseatPlayerIndex() {
    if (!this.#hotseat || !this.#game?.players?.length) return;
    if (this.#pendingUndoRequest) {
      const other = this.#pendingUndoRequest.requesterIndex === 0 ? 1 : 0;
      this.#myPlayerIndex = this.#game.players[other] ? other : 0;
      this.#myName = this.#playerNames[this.#myPlayerIndex] ?? this.#game.players[this.#myPlayerIndex]?.name ?? 'Hotseat';
      return;
    }

    const active = this.#activePlayerIndex();
    this.#myPlayerIndex = active ?? 0;
    this.#myName = this.#playerNames[this.#myPlayerIndex] ?? this.#game.players[this.#myPlayerIndex]?.name ?? 'Hotseat';
  }

  #applyLocalAction(action) {
    this.#actionHistory.push(action);
    this.#applyNetworkAction(action);
    this.#syncHotseatPlayerIndex();
    const focusChanged = this.#syncFocusedBoardToPhase();
    this.#refreshHud();
    this.#renderBoard();
    if (focusChanged) this.#centerOnFocusedBoard();
    this.#renderGhost();
    this.#renderMiniMaps();
  }

  #isGameplayActionType(type) {
    return type === 'pickDraft'
      || type === 'rotate'
      || type === 'skip'
      || type === 'selectPlacementTile'
      || type === 'place'
      || type === 'restart';
  }

  #applyGameplayAction(action) {
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
      case 'selectPlacementTile':
        this.#game.selectCurrentPlacementDomino(action.payload.dominoNumber);
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
        this.#pendingUndoRequest = null;
        this.#initGame(seed, this.#playerNames);
        return;
      }
    }
  }

  #effectiveGameplayActionsFromHistory() {
    const effective = [];
    let pendingUndo = null;

    for (const action of this.#actionHistory) {
      if (this.#isGameplayActionType(action.type)) {
        if (pendingUndo && action.type !== 'restart') continue;
        if (action.type === 'restart') pendingUndo = null;
        effective.push(action);
        continue;
      }

      if (action.type === 'requestUndo') {
        const requestId = String(action.payload?.requestId || '').trim();
        const requesterIndex = Number.isInteger(action.payload?.requesterIndex)
          ? action.payload.requesterIndex
          : -1;
        if (requestId && requesterIndex >= 0) {
          pendingUndo = {
            requestId,
            targetPlaceId: typeof action.payload?.targetPlaceId === 'string'
              ? action.payload.targetPlaceId
              : null,
          };
        }
        continue;
      }

      if (action.type === 'denyUndo') {
        const requestId = String(action.payload?.requestId || '').trim();
        if (pendingUndo && pendingUndo.requestId === requestId) pendingUndo = null;
        continue;
      }

      if (action.type === 'approveUndo') {
        const requestId = String(action.payload?.requestId || '').trim();
        if (pendingUndo && pendingUndo.requestId !== requestId) continue;

        const targetPlaceId = action.payload?.targetPlaceId || pendingUndo?.targetPlaceId;
        if (targetPlaceId) {
          for (let i = effective.length - 1; i >= 0; i--) {
            const e = effective[i];
            if (e.type === 'place' && e.payload?.placeId === targetPlaceId) {
              effective.splice(i, 1);
              break;
            }
          }
        } else {
          for (let i = effective.length - 1; i >= 0; i--) {
            if (effective[i].type === 'place') {
              effective.splice(i, 1);
              break;
            }
          }
        }
        pendingUndo = null;
      }
    }
    return effective;
  }

  #rebuildGameFromHistory() {
    const seed = this.#game?.seed ?? randomSeed();
    this.#initGame(seed, this.#playerNames);
    const effective = this.#effectiveGameplayActionsFromHistory();
    for (const action of effective) {
      this.#applyGameplayAction(action);
    }
  }

  #latestUndoablePlaceAction() {
    const effective = this.#effectiveGameplayActionsFromHistory();
    for (let i = effective.length - 1; i >= 0; i--) {
      const a = effective[i];
      if (a?.type === 'restart') return null;
      if (a?.type === 'place') return a;
    }
    return null;
  }

  #isGameplayPausedForUndo() {
    return !!this.#pendingUndoRequest;
  }

  #requestUndo() {
    if (this.#myPlayerIndex == null) return;
    if (this.#pendingUndoRequest) {
      this.#setCanvasNotice('An undo request is already pending.', 'info', 1200);
      return;
    }

    const lastPlace = this.#latestUndoablePlaceAction();
    if (!lastPlace) {
      this.#setCanvasNotice('No move available to undo yet.', 'info', 1200);
      return;
    }

    const requestId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.#mp?.sendAction('requestUndo', {
      requestId,
      requesterIndex: this.#myPlayerIndex,
      targetPlaceId: lastPlace.payload?.placeId ?? null,
    });
  }

  #approvePendingUndo() {
    if (!this.#pendingUndoRequest || this.#myPlayerIndex == null) return;
    const req = this.#pendingUndoRequest;
    if (req.requesterIndex === this.#myPlayerIndex) return;
    this.#mp?.sendAction('approveUndo', {
      requestId: req.requestId,
      approverIndex: this.#myPlayerIndex,
      targetPlaceId: req.targetPlaceId,
    });
  }

  #denyPendingUndo() {
    if (!this.#pendingUndoRequest || this.#myPlayerIndex == null) return;
    const req = this.#pendingUndoRequest;
    if (req.requesterIndex === this.#myPlayerIndex) return;
    this.#mp?.sendAction('denyUndo', {
      requestId: req.requestId,
      deniedByIndex: this.#myPlayerIndex,
    });
  }

  #applyNetworkAction(action) {
    if (this.#isGameplayActionType(action.type)) {
      this.#applyGameplayAction(action);
      return;
    }

    switch (action.type) {
      case 'requestUndo': {
        const requestId = String(action.payload?.requestId || '').trim();
        const requesterIndex = Number.isInteger(action.payload?.requesterIndex)
          ? action.payload.requesterIndex
          : -1;
        const targetPlaceId = typeof action.payload?.targetPlaceId === 'string'
          ? action.payload.targetPlaceId
          : null;
        if (!requestId || requesterIndex < 0) return;

        this.#pendingUndoRequest = { requestId, requesterIndex, targetPlaceId };
        if (this.#myPlayerIndex != null && this.#myPlayerIndex !== requesterIndex) {
          const who = this.#playerNames[requesterIndex] ?? this.#game.players[requesterIndex]?.name ?? `P${requesterIndex + 1}`;
          this.#setCanvasNotice(`${who} requested an undo.`, 'info', 1400);
        }
        return;
      }
      case 'approveUndo': {
        const requestId = String(action.payload?.requestId || '').trim();
        if (!requestId) return;
        if (!this.#pendingUndoRequest || this.#pendingUndoRequest.requestId !== requestId) return;

        this.#pendingUndoRequest = null;
        this.#rebuildGameFromHistory();
        this.#setCanvasNotice('Undo approved.', 'info', 1000);
        return;
      }
      case 'denyUndo': {
        const requestId = String(action.payload?.requestId || '').trim();
        if (!requestId) return;
        if (this.#pendingUndoRequest && this.#pendingUndoRequest.requestId === requestId) {
          this.#pendingUndoRequest = null;
          this.#setCanvasNotice('Undo request denied.', 'info', 1200);
        }
        return;
      }
    }
  }

  #isMyTurnToPick() {
    if (this.#hotseat) return this.#game.state === GameState.DRAFT && this.#game.currentPickingPlayerIndex != null;
    return this.#myPlayerIndex != null && this.#game.state === GameState.DRAFT && this.#myPlayerIndex === this.#game.currentPickingPlayerIndex;
  }

  #isMyTurnToPlace() {
    if (this.#hotseat) return this.#game.state === GameState.PLACE && this.#game.currentPlacingPlayerIndex != null;
    return this.#myPlayerIndex != null && this.#game.state === GameState.PLACE && this.#myPlayerIndex === this.#game.currentPlacingPlayerIndex;
  }

  #activePlayerIndex() {
    if (!this.#game?.players?.length) return null;
    if (this.#game.isGameOver) return null;
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

    if (this.#canvasTurn) {
      this.#canvasTurn.classList.toggle('show', this.#hudCollapsed);
      const hudRect = this.#hud?.getBoundingClientRect();
      const hostRect = this.#root?.getBoundingClientRect();
      if (hudRect && hostRect) {
        const y = Math.max(12, Math.round(hudRect.bottom - hostRect.top + 8));
        this.#canvasTurn.style.top = `${y}px`;
      }
    }
  }

  #isMobileViewport() {
    return (window.innerWidth || 0) <= 760;
  }

  #syncMobilePanelForPhase() {
    if (!this.#game || !this.#isMobileViewport()) return;
    if (this.#lastAutoHudPhase === this.#game.state) return;
    this.#lastAutoHudPhase = this.#game.state;

    if (this.#game.state === GameState.PLACE) this.#setHudCollapsed(true);
    else if (this.#game.state === GameState.DRAFT) this.#setHudCollapsed(false);
  }

  #syncMobileActions() {
    if (!this.#mobileActions || !this.#game) return;
    const drafted = this.#game.currentPlacingDraftedTile;
    const show = this.#isMobileViewport() && this.#isMyTurnToPlace() && this.#game.state === GameState.PLACE && !this.#game.isGameOver;
    this.#mobileActions.classList.toggle('show', show);
    if (!show) {
      this.#setCanvasNotice('');
      this.#btnMobilePlace.textContent = 'Place';
      return;
    }

    const canAct = !!drafted && !this.#isGameplayPausedForUndo();
    const canSkip = canAct && this.#game.canSkipCurrentPlacement();
    const canUndo = this.#myPlayerIndex != null && !!this.#latestUndoablePlaceAction() && !this.#pendingUndoRequest;
    this.#btnMobileRotate.disabled = !canAct;
    this.#btnMobileSkip.disabled = !canSkip;
    this.#btnMobileUndo.disabled = !canUndo;
    this.#btnMobileNext.disabled = !canAct;
    this.#btnMobilePlace.disabled = !canAct;
    this.#btnMobilePlace.textContent = this.#hoverAnchor ? 'Place' : 'Select';
  }

  #setCanvasNotice(message, tone = 'error', autoHideMs = 0) {
    if (!this.#canvasNotice) return;
    if (this.#canvasNoticeTimer != null) {
      clearTimeout(this.#canvasNoticeTimer);
      this.#canvasNoticeTimer = null;
    }

    const text = (message || '').trim();
    if (!text) {
      this.#canvasNotice.textContent = '';
      this.#canvasNotice.classList.remove('show', 'error', 'info');
      return;
    }

    this.#canvasNotice.textContent = text;
    this.#canvasNotice.classList.remove('error', 'info');
    this.#canvasNotice.classList.add(tone === 'info' ? 'info' : 'error', 'show');

    if (autoHideMs > 0) {
      this.#canvasNoticeTimer = setTimeout(() => {
        this.#setCanvasNotice('');
      }, autoHideMs);
    }
  }

  #collectLandscapeRegions(board) {
    const visited = new Set();
    const regions = [];

    for (const k of Object.keys(board)) {
      if (visited.has(k)) continue;
      const start = board[k];
      if (!start || start.landscape === Landscapes.CASTLE) {
        visited.add(k);
        continue;
      }

      const regionKeys = new Set();
      const tiles = [];
      let crowns = 0;
      const queue = [start];
      visited.add(k);

      while (queue.length) {
        const tile = queue.shift();
        const tk = keyOf(tile.x, tile.y);
        if (regionKeys.has(tk)) continue;
        regionKeys.add(tk);
        tiles.push(tile);
        crowns += tile.crowns || 0;

        const n = [
          [tile.x + 1, tile.y],
          [tile.x - 1, tile.y],
          [tile.x, tile.y + 1],
          [tile.x, tile.y - 1],
        ];
        for (const [nx, ny] of n) {
          const nk = keyOf(nx, ny);
          const nt = board[nk];
          if (!nt || nt.landscape !== start.landscape) continue;
          if (visited.has(nk)) continue;
          visited.add(nk);
          queue.push(nt);
        }
      }

      regions.push({
        landscape: start.landscape,
        tiles,
        keys: regionKeys,
        crowns,
        score: tiles.length * crowns,
      });
    }

    return regions;
  }

  #addRegionBoundariesAndScore(region) {
    const edge = 0.49;
    const y = 0.29;

    const base = LANDSCAPE_COLORS[region.landscape] ?? 0xffffff;
    const borderColor = new THREE.Color(base).offsetHSL(0, 0, 0.28);
    const borderMat = new THREE.MeshBasicMaterial({
      color: borderColor,
      transparent: true,
      opacity: 0.98,
    });
    const borderGeomX = new THREE.BoxGeometry(0.05, 0.07, 0.98);
    const borderGeomZ = new THREE.BoxGeometry(0.98, 0.07, 0.05);

    const addBorderX = (x, z) => {
      const m = new THREE.Mesh(borderGeomX, borderMat);
      m.position.set(x, y, z);
      this.#regionOverlayGroup.add(m);
    };
    const addBorderZ = (x, z) => {
      const m = new THREE.Mesh(borderGeomZ, borderMat);
      m.position.set(x, y, z);
      this.#regionOverlayGroup.add(m);
    };

    for (const tile of region.tiles) {
      const x = tile.x;
      const z = tile.y;

      const left = keyOf(x - 1, z);
      const right = keyOf(x + 1, z);
      const up = keyOf(x, z + 1);
      const down = keyOf(x, z - 1);

      if (!region.keys.has(left)) {
        addBorderX(x - edge, z);
      }
      if (!region.keys.has(right)) {
        addBorderX(x + edge, z);
      }
      if (!region.keys.has(up)) {
        addBorderZ(x, z + edge);
      }
      if (!region.keys.has(down)) {
        addBorderZ(x, z - edge);
      }
    }

    const cx = region.tiles.reduce((s, t) => s + t.x, 0) / region.tiles.length;
    const cz = region.tiles.reduce((s, t) => s + t.y, 0) / region.tiles.length;
    const dist2 = (t) => {
      const dx = t.x - cx;
      const dz = t.y - cz;
      return dx * dx + dz * dz;
    };
    const sortedTiles = [...region.tiles].sort((a, b) => {
      const ac = a.crowns || 0;
      const bc = b.crowns || 0;
      if (ac !== bc) return ac - bc;
      return dist2(a) - dist2(b);
    });
    const bestTile = sortedTiles[0] ?? { x: cx, y: cz, crowns: 0 };

    const scoreLabel = `${region.score}`;
    const label = createTextSprite(scoreLabel, {
      size: 256,
      font: '800 86px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      fillStyle: '#f5f7fb',
      background: 'rgba(17,20,26,0.88)',
      border: 'rgba(255,255,255,0.22)',
    });
    label.scale.set(0.74, 0.46, 1);
    // Prefer low-crown tiles and offset label from tile center to avoid crown badge overlap.
    label.position.set(bestTile.x + 0.2, 0.66, bestTile.y - 0.2);
    this.#regionOverlayGroup.add(label);
  }

  #renderRegionScoring(board) {
    while (this.#regionOverlayGroup.children.length) {
      this.#regionOverlayGroup.remove(this.#regionOverlayGroup.children[0]);
    }

    const regions = this.#collectLandscapeRegions(board);
    for (const region of regions) {
      this.#addRegionBoundariesAndScore(region);
    }
  }

  #buildProjectedBoard(board, drafted, anchor, anchorEnd) {
    const connectedEdge = drafted.domino.getConnectedEdge(anchorEnd);
    const off = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
    const other = { x: anchor.x + off.x, y: anchor.y + off.y };

    const leftCoord = anchorEnd === DominoEnd.LEFT ? anchor : other;
    const rightCoord = anchorEnd === DominoEnd.RIGHT ? anchor : other;

    const projected = { ...board };
    projected[keyOf(leftCoord.x, leftCoord.y)] = {
      x: leftCoord.x,
      y: leftCoord.y,
      landscape: drafted.domino.leftEnd.landscape,
      crowns: drafted.domino.leftEnd.crowns,
    };
    projected[keyOf(rightCoord.x, rightCoord.y)] = {
      x: rightCoord.x,
      y: rightCoord.y,
      landscape: drafted.domino.rightEnd.landscape,
      crowns: drafted.domino.rightEnd.crowns,
    };

    return { projected, other };
  }

  #initThree() {
    const debugParam = new URL(location.href).searchParams.get('debug');
    const debugLevel = debugParam == null ? 0 : Number.parseInt(debugParam, 10);
    const debug = debugLevel >= 1;

    this.#scene = new THREE.Scene();
    // Galaxy behind the play surface.
    this.#scene.background = createGalaxyBackgroundTexture(debug, 1024);

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

    // Rectangular bamboo mats sized just beyond the 15x15 grid.
    const bambooFrontTex = createSceneBackgroundTexture(debug, 1024, 'front');
    this.#bambooMatFront = new THREE.Mesh(
      new THREE.PlaneGeometry(16.5, 16.5),
      new THREE.MeshBasicMaterial({
        map: bambooFrontTex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.98,
      })
    );
    this.#bambooMatFront.rotation.x = -Math.PI / 2;
    this.#bambooMatFront.position.y = -0.12;
    this.#scene.add(this.#bambooMatFront);

    // 15x15 cells -> 7 squares in each direction from the castle.
    // Size 15 means lines land on half-steps (-7.5..7.5), matching tile edges.
    const grid = new THREE.GridHelper(15, 15, debug ? 0x6b8bb3 : 0x3a4353, debug ? 0x3f5a74 : 0x222a35);
    grid.position.set(0, 0, 0);
    this.#scene.add(grid);
    this.#gridHelper = grid;

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
    this.#regionOverlayGroup = new THREE.Group();
    this.#scene.add(this.#regionOverlayGroup);
    this.#ghostGroup = new THREE.Group();
    this.#scene.add(this.#ghostGroup);

    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = true;
    this.#controls.enableRotate = false;
    this.#controls.enablePan = true;
    this.#controls.enableZoom = true;
    this.#controls.panSpeed = 1.35;
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
      if (this.#isGameplayPausedForUndo()) return;
      this.#mp?.sendAction('rotate');
    });
    this.#btnSkip.addEventListener('click', () => {
      if (!this.#isMyTurnToPlace()) return;
      if (this.#isGameplayPausedForUndo()) return;
      if (!this.#game.canSkipCurrentPlacement()) {
        this.#setCanvasNotice('You can only skip when no legal placement exists.', 'error', 1400);
        return;
      }
      this.#mp?.sendAction('skip');
    });
    this.#btnUndoRequest.addEventListener('click', () => {
      this.#requestUndo();
    });
    this.#btnRestart.addEventListener('click', () => {
      const seed = randomSeed();
      this.#mp?.sendAction('restart', { seed });
    });

    this.#btnNextValid.addEventListener('click', () => {
      this.#jumpToNextValidAnchor();
    });

    this.#btnResetTile.addEventListener('click', () => {
      this.#resetPlacementAnchor();
    });

    this.#btnPlace.addEventListener('click', () => {
      if (!this.#isMyTurnToPlace()) return;
      if (!this.#hoverAnchor) {
        this.#resetPlacementAnchor();
        this.#setCanvasNotice('Anchor selected. Click Place again to confirm.', 'info', 1100);
        return;
      }
      this.#tryPlaceAtHover();
    });

    this.#btnCenter.addEventListener('click', () => {
      this.#centerOnFocusedBoard();
    });

    this.#btnCollapse.addEventListener('click', () => {
      this.#setHudCollapsed(!this.#hudCollapsed);
    });

    this.#btnMobileRotate.addEventListener('click', () => {
      if (!this.#isMyTurnToPlace()) return;
      if (this.#isGameplayPausedForUndo()) return;
      this.#mp?.sendAction('rotate');
    });

    this.#btnMobileSkip.addEventListener('click', () => {
      if (!this.#isMyTurnToPlace()) return;
      if (this.#isGameplayPausedForUndo()) return;
      if (!this.#game.canSkipCurrentPlacement()) {
        this.#setCanvasNotice('You can only skip when no legal placement exists.', 'error', 1400);
        return;
      }
      this.#mp?.sendAction('skip');
    });

    this.#btnMobileUndo.addEventListener('click', () => {
      this.#requestUndo();
    });

    this.#btnMobileNext.addEventListener('click', () => {
      this.#jumpToNextValidAnchor();
    });

    this.#btnMobilePlace.addEventListener('click', () => {
      if (!this.#isMyTurnToPlace()) return;
      if (!this.#hoverAnchor) {
        this.#resetPlacementAnchor();
        this.#setCanvasNotice('Anchor selected. Tap Place to confirm.', 'info', 1100);
        return;
      }
      this.#tryPlaceAtHover();
    });

    this.#renderer.domElement.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    this.#renderer.domElement.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    this.#renderer.domElement.addEventListener('pointerup', (e) => this.#onPointerUp(e));
    this.#renderer.domElement.addEventListener('pointercancel', () => this.#onPointerCancel());
    this.#renderer.domElement.addEventListener('click', (e) => this.#onCanvasClick(e));

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

    if (this.#canvasTurn && this.#hudCollapsed) {
      const hudRect = this.#hud?.getBoundingClientRect();
      const hostRect = this.#root?.getBoundingClientRect();
      if (hudRect && hostRect) {
        const y = Math.max(12, Math.round(hudRect.bottom - hostRect.top + 8));
        this.#canvasTurn.style.top = `${y}px`;
      }
    }
  };

  #onKeyDown = (e) => {
    if (e.key.toLowerCase() === 'r') {
      if (!this.#isMyTurnToPlace()) return;
      if (this.#isGameplayPausedForUndo()) return;
      this.#mp?.sendAction('rotate');
    }
  };

  #onPointerMove(e) {
    if (e.pointerType === 'touch') {
      if (this.#activeTouchPointerId !== e.pointerId) return;
      if (this.#touchInteractionMode !== 'movePlacement') return;
    }

    if (!this.#isMyTurnToPlace()) {
      if (this.#hoverAnchor) {
        this.#hoverAnchor = null;
        this.#hoverAnchorAuto = false;
        this.#renderGhost();
      }
      this.#placementHint = '';
      this.#setCanvasNotice('');
      return;
    }
    const grid = this.#gridFromClient(e.clientX, e.clientY);
    if (!grid) return;
    this.#hoverAnchor = grid;
    this.#hoverAnchorAuto = false;

    const feedback = this.#game.getPlacementFeedbackAt(grid.x, grid.y);
    this.#placementHint = feedback.ok ? '' : feedback.reason;
    this.#setCanvasNotice(this.#placementHint, 'error');
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

    if (!this.#isMyTurnToPlace()) return;

    if (e.pointerType === 'touch') {
      this.#activeTouchPointerId = e.pointerId;
      this.#touchInteractionMode = 'pan';

      const grid = this.#gridFromClient(e.clientX, e.clientY);
      if (grid && this.#isTouchingCurrentGhost(grid)) {
        this.#touchInteractionMode = 'movePlacement';
        this.#controls.enabled = false;
        this.#hoverAnchor = grid;
        this.#hoverAnchorAuto = false;
        this.#renderGhost();
      }

      this.#pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }

    const grid = this.#gridFromClient(e.clientX, e.clientY);
    if (grid) {
      this.#hoverAnchor = grid;
      this.#hoverAnchorAuto = false;
      this.#renderGhost();
    }

    this.#pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  #onPointerUp(e) {
    if (e.pointerType === 'touch') e.preventDefault();
    if (!this.#isMyTurnToPlace()) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }

    if (e.pointerType === 'touch' && this.#activeTouchPointerId != null && this.#activeTouchPointerId !== e.pointerId) {
      return;
    }

    const start = this.#pointerDown;
    this.#pointerDown = null;
    if (!start) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }

    // Treat as a tap if the pointer didn’t move much.
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist2 = dx * dx + dy * dy;
    const dt = performance.now() - start.t;
    const TAP_DIST2 = e.pointerType === 'touch' ? 9 * 9 : 20 * 20;
    const TAP_MS = 350;
    const isTap = e.pointerType === 'touch'
      ? dist2 <= TAP_DIST2 && dt <= TAP_MS
      : dist2 <= TAP_DIST2;
    if (!isTap) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }

    const grid = this.#gridFromClient(e.clientX, e.clientY);
    if (!grid) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }
    this.#hoverAnchor = grid;
    this.#hoverAnchorAuto = false;

    const feedback = this.#game.getPlacementFeedbackAt(grid.x, grid.y);
    this.#placementHint = feedback.ok ? '' : feedback.reason;

    this.#renderGhost();

    if (e.pointerType === 'touch') {
      if (feedback.ok) this.#setCanvasNotice('Tap Place to confirm.', 'info');
      else this.#setCanvasNotice(this.#placementHint, 'error');
      this.#syncMobileActions();
      this.#resetTouchInteraction();
      return;
    }
  }

  #onCanvasClick(e) {
    if (!this.#isMyTurnToPlace()) return;
    if (e.pointerType === 'touch') return;

    const grid = this.#gridFromClient(e.clientX, e.clientY);
    if (!grid) return;
    this.#hoverAnchor = grid;
    this.#hoverAnchorAuto = false;

    const feedback = this.#game.getPlacementFeedbackAt(grid.x, grid.y);
    this.#placementHint = feedback.ok ? '' : feedback.reason;
    this.#renderGhost();

    if (!feedback.ok) {
      this.#setCanvasNotice(this.#placementHint, 'error');
      return;
    }

    this.#tryPlaceAtHover();
  }

  #onPointerCancel() {
    this.#pointerDown = null;
    this.#resetTouchInteraction();
  }

  #resetTouchInteraction() {
    this.#activeTouchPointerId = null;
    this.#touchInteractionMode = null;
    if (this.#controls) this.#controls.enabled = true;
  }

  #isTouchingCurrentGhost(grid) {
    const cells = this.#currentGhostCells();
    for (const c of cells) {
      if (c.x === grid.x && c.y === grid.y) return true;
    }
    return false;
  }

  #currentGhostCells() {
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return [];
    const drafted = g.currentPlacingDraftedTile;
    if (!drafted || !this.#hoverAnchor) return [];

    const anchor = this.#hoverAnchor;
    const feedback = g.getPlacementFeedbackAt(anchor.x, anchor.y);
    const ghostAnchorEnd = feedback.ok ? feedback.anchorEnd : DominoEnd.LEFT;
    const connectedEdge = drafted.domino.getConnectedEdge(ghostAnchorEnd);
    const off = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
    const other = { x: anchor.x + off.x, y: anchor.y + off.y };

    const leftCoord = ghostAnchorEnd === DominoEnd.LEFT ? anchor : other;
    const rightCoord = ghostAnchorEnd === DominoEnd.RIGHT ? anchor : other;
    return [leftCoord, rightCoord];
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
    if (this.#isGameplayPausedForUndo()) {
      this.#setCanvasNotice('Resolve the undo request before continuing.', 'info', 1200);
      return;
    }

    const x = this.#hoverAnchor.x;
    const y = this.#hoverAnchor.y;

    const feedback = this.#game.getPlacementFeedbackAt(x, y);
    if (!feedback.ok) {
      this.#placementHint = feedback.reason;
      this.#setCanvasNotice(this.#placementHint || 'Invalid placement.', 'error');
      return;
    }

    const anchorEnd = feedback.anchorEnd === DominoEnd.RIGHT ? 'RIGHT' : 'LEFT';
    this.#placementHint = '';
    this.#setCanvasNotice('');

    this.#mp?.sendAction('place', {
      x,
      y,
      anchorEnd,
      placeId: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  #flashError(message) {
    this.#setCanvasNotice(message, 'error', 1400);
  }

  #refreshHud() {
    const g = this.#game;
    this.#syncHotseatPlayerIndex();
    this.#syncMobilePanelForPhase();
    const standings = g.players
      .map((p, i) => ({
        index: i,
        name: this.#playerNames[i] ?? p.name ?? `Player ${i + 1}`,
        score: p.board.score,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const playerScores = g.players
      .map((p, i) => `P${i + 1} ${this.#playerNames[i] ?? p.name}: ${p.board.score}`)
      .join(' · ');

    this.#hudTitle.textContent = g.isGameOver
      ? 'End of Game'
      : `Round ${g.round} — ${playerScores}`;

    const canPlaceUi = this.#isMyTurnToPlace() && !g.isGameOver && !!g.currentPlacingDraftedTile && !this.#isGameplayPausedForUndo();
    const canRequestUndo = this.#myPlayerIndex != null && !!this.#latestUndoablePlaceAction() && !this.#pendingUndoRequest;
    this.#btnRotate.disabled = !canPlaceUi;
    this.#btnSkip.disabled = !canPlaceUi || !g.canSkipCurrentPlacement();
    this.#btnUndoRequest.disabled = !canRequestUndo;
    this.#btnNextValid.disabled = !canPlaceUi;
    this.#btnResetTile.disabled = !canPlaceUi;
    this.#btnPlace.disabled = !canPlaceUi;
    this.#btnPlace.textContent = this.#hoverAnchor ? 'Place' : 'Select';

    this.#hudBody.innerHTML = '';

    const you = document.createElement('div');
    you.className = 'muted';
    if (this.#myPlayerIndex == null) you.textContent = `You: ${this.#myName} (Spectator)`;
    else you.textContent = `You: P${this.#myPlayerIndex + 1} ${this.#myName}`;
    this.#hudBody.append(you);

    if (this.#pendingUndoRequest) {
      const p = this.#pendingUndoRequest;
      const requester = this.#playerNames[p.requesterIndex] ?? this.#game.players[p.requesterIndex]?.name ?? `P${p.requesterIndex + 1}`;

      const undoLine = document.createElement('div');
      undoLine.className = 'turnBanner turnOther';
      undoLine.textContent = `${requester} requested an undo.`;
      this.#hudBody.append(undoLine);

      if (this.#myPlayerIndex != null && this.#myPlayerIndex !== p.requesterIndex) {
        const row = document.createElement('div');
        row.className = 'row';
        const approve = document.createElement('button');
        approve.textContent = 'Approve Undo';
        approve.addEventListener('click', () => this.#approvePendingUndo());
        const deny = document.createElement('button');
        deny.textContent = 'Deny';
        deny.addEventListener('click', () => this.#denyPendingUndo());
        row.append(approve, deny);
        this.#hudBody.append(row);
      }
    }

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

    if (g.isGameOver) {
      const topScore = standings.length ? standings[0].score : 0;
      const winners = standings.filter((s) => s.score === topScore);

      if (this.#canvasTurn) {
        this.#canvasTurn.classList.remove('turnMine', 'turnOther');
        this.#canvasTurn.classList.add('turnOther');
        this.#canvasTurn.classList.toggle('show', this.#hudCollapsed);
        this.#canvasTurn.textContent = winners.length > 1
          ? `Game Over — Tie at ${topScore}`
          : `Game Over — Winner: ${winners[0].name}`;
      }

      const winnerLine = document.createElement('div');
      winnerLine.className = 'turnBanner turnOther';
      winnerLine.textContent = winners.length > 1
        ? `🏆 Tie: ${winners.map((w) => w.name).join(', ')} (${topScore})`
        : `🏆 Winner: ${winners[0].name} (${topScore})`;
      this.#hudBody.append(winnerLine);

      const summary = document.createElement('div');
      summary.className = 'muted';
      summary.textContent = `Final scores — ${standings.map((s) => `P${s.index + 1} ${s.name}: ${s.score}`).join(' · ')}`;
      this.#hudBody.append(summary);

      const rank = document.createElement('div');
      rank.className = 'draftList';
      standings.forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'draftItem';
        const left = document.createElement('div');
        left.className = 'draftMeta';
        left.textContent = `#${i + 1} · P${s.index + 1} ${s.name}`;
        const right = document.createElement('div');
        right.className = 'tag';
        right.textContent = `${s.score}`;
        row.append(left, right);
        rank.append(row);
      });
      this.#hudBody.append(rank);

      this.#renderMiniMaps();
      this.#syncMobileActions();
      return;
    }

    const activeIdx = this.#activePlayerIndex();
    const activeName = this.#playerNames[activeIdx] ?? g.players[activeIdx]?.name ?? `P${activeIdx + 1}`;
    const isMine = this.#myPlayerIndex != null && this.#myPlayerIndex === activeIdx;
    const mode = g.state === GameState.DRAFT ? 'pick' : 'place';

    if (this.#canvasTurn) {
      this.#canvasTurn.classList.remove('turnMine', 'turnOther');
      this.#canvasTurn.classList.add(isMine ? 'turnMine' : 'turnOther');
      this.#canvasTurn.classList.toggle('show', this.#hudCollapsed);

      const hudRect = this.#hud?.getBoundingClientRect();
      const hostRect = this.#root?.getBoundingClientRect();
      if (hudRect && hostRect) {
        const y = Math.max(12, Math.round(hudRect.bottom - hostRect.top + 8));
        this.#canvasTurn.style.top = `${y}px`;
      }

      this.#canvasTurn.textContent = isMine
        ? `Your turn — ${mode}`
        : `Their turn — ${activeName} is choosing ${mode}`;
    }

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
    if (g.state === GameState.DRAFT) {
      this.#placementHint = '';
      this.#hoverAnchor = null;
      this.#hoverAnchorAuto = false;
      this.#setCanvasNotice('');
      status.textContent = `Draft phase — picking: ${this.#playerNames[g.currentPickingPlayerIndex] ?? g.players[g.currentPickingPlayerIndex].name}`;
      this.#hudBody.append(status);

      const nextOrderByNumber = [...g.currentDraft]
        .sort((a, b) => a.domino.number - b.domino.number);
      const nextSlotByDominoNumber = new Map(
        nextOrderByNumber.map((slot, i) => [slot.domino.number, i + 1])
      );

      const slotsByPlayer = new Map();
      for (let i = 0; i < g.players.length; i++) slotsByPlayer.set(i, []);
      for (let i = 0; i < nextOrderByNumber.length; i++) {
        const slot = nextOrderByNumber[i];
        if (slot.player == null) continue;
        slotsByPlayer.get(slot.player)?.push(i + 1);
      }

      const forecast = document.createElement('div');
      forecast.className = 'muted';
      forecast.style.marginTop = '6px';
      const parts = [];
      for (let i = 0; i < g.players.length; i++) {
        const name = this.#playerNames[i] ?? g.players[i].name ?? `P${i + 1}`;
        const slots = slotsByPlayer.get(i) ?? [];
        parts.push(slots.length ? `${name}: #${slots.join(', #')}` : `${name}: —`);
      }
      forecast.textContent = `Next order (so far): ${parts.join(' · ')}`;
      this.#hudBody.append(forecast);

      const list = document.createElement('div');
      list.className = 'draftList';
      g.currentDraft.forEach((slot, idx) => {
        const item = document.createElement('div');
        item.className = 'draftItem';

        const left = `${landscapeLabel(slot.domino.leftEnd.landscape)}(${slot.domino.leftEnd.crowns})`;
        const right = `${landscapeLabel(slot.domino.rightEnd.landscape)}(${slot.domino.rightEnd.crowns})`;
        const nextSlot = nextSlotByDominoNumber.get(slot.domino.number) ?? '?';
        const pickedBy = slot.player == null
          ? `Next #${nextSlot} · Available`
          : `Next #${nextSlot} · Picked by ${this.#playerNames[slot.player] ?? g.players[slot.player].name}`;

        const label = document.createElement('div');
        label.className = 'draftMeta';

        const top = document.createElement('div');
        top.className = 'draftTop';

        const topMain = document.createElement('div');
        topMain.className = 'draftTopMain';
        topMain.innerHTML = `<span class="tag">#${slot.domino.number}</span> ${left} | ${right}`;

        const topStatus = document.createElement('div');
        topStatus.className = 'draftTopStatus';
        topStatus.textContent = pickedBy;

        top.append(topMain, topStatus);

        const preview = document.createElement('div');
        preview.className = 'dominoPreview';

        const mkHalf = (landscape, crowns) => {
          const el = document.createElement('div');
          el.className = 'dominoHalf';
          el.style.background = landscapeCssBackground(landscape, crowns || 0);
          el.style.backgroundBlendMode = 'normal';

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

        label.append(top, preview);

        const btn = document.createElement('button');
        btn.textContent = 'Pick';
        btn.disabled = slot.player != null || !this.#isMyTurnToPick() || this.#isGameplayPausedForUndo();
        btn.addEventListener('click', () => {
          if (!this.#isMyTurnToPick()) return;
          if (this.#isGameplayPausedForUndo()) return;
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

        const choices = g.getCurrentPlacingChoices();
        if (choices.length > 1) {
          const chooser = document.createElement('div');
          chooser.className = 'row';

          const label = document.createElement('span');
          label.className = 'muted';
          label.textContent = 'Choose tile to place first:';
          chooser.append(label);

          for (const choice of choices) {
            const b = document.createElement('button');
            const n = choice.domino.number;
            b.textContent = `#${n}`;
            b.disabled = !this.#isMyTurnToPlace() || this.#isGameplayPausedForUndo() || n === drafted.domino.number;
            b.addEventListener('click', () => {
              if (!this.#isMyTurnToPlace()) return;
              if (this.#isGameplayPausedForUndo()) return;
              this.#mp?.sendAction('selectPlacementTile', { dominoNumber: n });
            });
            chooser.append(b);
          }

          this.#hudBody.append(chooser);
        }
      }

      if (!this.#isMyTurnToPlace()) {
        this.#placementHint = '';
        this.#hoverAnchor = null;
        this.#hoverAnchorAuto = false;
        this.#setCanvasNotice('');
      }
    }

    this.#renderMiniMaps();
    this.#syncMobileActions();
  }

  #renderBoard() {
    while (this.#tilesGroup.children.length) this.#tilesGroup.remove(this.#tilesGroup.children[0]);

    const focusedBoardManager = this.#game.players[this.#focusedPlayerIndex]?.board || this.#game.players[0].board;
    const board = focusedBoardManager.board;
    for (const k of Object.keys(board)) {
      const tile = board[k];
      const material = this.#getTileMaterial(tile.landscape, tile.crowns || 0, `${tile.x},${tile.y}`, false);

      const tileMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.22, 0.98),
        material
      );
      tileMesh.position.set(tile.x, 0.11, tile.y);
      this.#tilesGroup.add(tileMesh);

      if (tile.landscape === Landscapes.CASTLE) {
        this.#addCastleDetail(tile.x, tile.y, board, focusedBoardManager);
      } else {
        this.#addLandscapeDetail(tile);
        if ((tile.crowns || 0) > 0) {
          this.#addCrownDetail(tile, board);
        }
      }

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

    this.#renderRegionScoring(board);
  }

  #castleGrowthState(board, boardManager) {
    const maxSize = Math.max(1, boardManager?.maxBoardSize ?? 7);
    const targetArea = maxSize * maxSize;
    const allTiles = Object.keys(board).length;
    const nonCastleTiles = Math.max(0, allTiles - 1);
    const progress = Math.max(0, Math.min(1, nonCastleTiles / Math.max(1, targetArea - 1)));

    const axis = boardManager?.boardSize;
    const xMin = axis?.xMin ?? 0;
    const xMax = axis?.xMax ?? 0;
    const yMin = axis?.yMin ?? 0;
    const yMax = axis?.yMax ?? 0;
    const spanX = xMax - xMin + 1;
    const spanY = yMax - yMin + 1;
    const fullBounds = spanX === maxSize && spanY === maxSize;

    let noGaps = false;
    if (fullBounds) {
      noGaps = true;
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          if (!board[keyOf(x, y)]) {
            noGaps = false;
            break;
          }
        }
        if (!noGaps) break;
      }
    }

    const perfectKingdom = fullBounds && noGaps && allTiles === targetArea;

    let tier = 0;
    if (progress >= 0.85) tier = 3;
    else if (progress >= 0.55) tier = 2;
    else if (progress >= 0.25) tier = 1;
    if (perfectKingdom) tier = 4;

    return { tier, progress, perfectKingdom };
  }

  #variationRand(tile, tag = 'v') {
    return mulberry32(hash32(`${tag}|${tile.x},${tile.y}|${landscapeKey(tile.landscape)}|${tile.crowns || 0}`));
  }

  #addLandscapeDetail(tile) {
    const x = tile.x;
    const y = tile.y;
    const landscape = tile.landscape;
    const rand = this.#variationRand(tile, 'landscape');

    switch (landscape) {
      case Landscapes.FOREST: {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c33, roughness: 0.75, metalness: 0.02 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7a43, roughness: 0.68, metalness: 0.02 });
        const treeCount = 2 + Math.floor(rand() * 3);
        const trees = [];
        for (let i = 0; i < treeCount; i++) {
          trees.push({
            dx: -0.2 + rand() * 0.4,
            dz: -0.2 + rand() * 0.4,
            h: 0.13 + rand() * 0.08,
            cr: 0.06 + rand() * 0.04,
            ch: 0.12 + rand() * 0.08,
          });
        }
        for (const t of trees) {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, t.h, 7), trunkMat);
          trunk.position.set(x + t.dx, 0.22 + t.h / 2, y + t.dz);
          trunk.rotation.y = rand() * Math.PI * 2;
          this.#tilesGroup.add(trunk);

          const canopy = new THREE.Mesh(new THREE.ConeGeometry(t.cr, t.ch, 8), leafMat);
          canopy.position.set(x + t.dx, 0.22 + t.h + 0.07, y + t.dz);
          canopy.rotation.y = rand() * Math.PI * 2;
          this.#tilesGroup.add(canopy);
        }
        break;
      }
      case Landscapes.WHEAT: {
        const stalkMat = new THREE.MeshStandardMaterial({ color: 0xe8c36a, roughness: 0.62, metalness: 0.04 });
        const stalkCount = 4 + Math.floor(rand() * 4);
        for (let i = 0; i < stalkCount; i++) {
          const dx = -0.2 + rand() * 0.4;
          const dz = -0.2 + rand() * 0.4;
          const h = 0.14 + rand() * 0.08;
          const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, h, 6), stalkMat);
          stalk.position.set(x + dx, 0.31, y + dz);
          stalk.rotation.z = (-0.25 + rand() * 0.5);
          stalk.rotation.y = rand() * Math.PI * 2;
          this.#tilesGroup.add(stalk);
        }
        break;
      }
      case Landscapes.WATER: {
        const waveMat = new THREE.MeshStandardMaterial({
          color: 0x3aa8c7,
          roughness: 0.30,
          metalness: 0.22,
          transparent: true,
          opacity: 0.88,
          emissive: 0x0c3040,
          emissiveIntensity: 0.14,
        });

        const waveCount = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < waveCount; i++) {
          const points = [];
          const segments = 6;
          const diagOffset = -0.18 + rand() * 0.36;
          const amp = 0.015 + rand() * 0.022;
          const phase = rand() * Math.PI * 2;

          for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            // Primarily horizontal sweep (left->right) with a slight diagonal slant.
            const px = -0.24 + t * 0.48;
            const slant = (t - 0.5) * 0.20;
            const wobble = Math.sin((t * Math.PI * 2) + phase) * amp;
            const pz = diagOffset + slant + wobble;
            points.push(new THREE.Vector3(px, 0, pz));
          }

          const curve = new THREE.CatmullRomCurve3(points);
          const radius = 0.007 + rand() * 0.006;
          const wave = new THREE.Mesh(new THREE.TubeGeometry(curve, 26, radius, 8, false), waveMat);
          wave.position.set(x, 0.245 + rand() * 0.02, y);
          wave.rotation.y = (rand() - 0.5) * 0.04;
          this.#tilesGroup.add(wave);
        }
        break;
      }
      case Landscapes.PASTURE: {
        const tuftMat = new THREE.MeshStandardMaterial({ color: 0x63b85f, roughness: 0.76, metalness: 0.02 });
        const tuftCount = 3 + Math.floor(rand() * 4);
        for (let i = 0; i < tuftCount; i++) {
          const dx = -0.2 + rand() * 0.4;
          const dz = -0.2 + rand() * 0.4;
          const r = 0.04 + rand() * 0.03;
          const tuft = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), tuftMat);
          tuft.scale.set(1.0, 0.65, 1.0);
          tuft.position.set(x + dx, 0.24, y + dz);
          tuft.rotation.y = rand() * Math.PI * 2;
          this.#tilesGroup.add(tuft);
        }
        break;
      }
      case Landscapes.BOG: {
        const muckMat = new THREE.MeshStandardMaterial({ color: 0x4a355e, roughness: 0.82, metalness: 0.04 });
        const puddleCount = 3 + Math.floor(rand() * 2);
        for (let i = 0; i < puddleCount; i++) {
          const dx = -0.2 + rand() * 0.4;
          const dz = -0.2 + rand() * 0.4;
          const r = 0.045 + rand() * 0.05;
          const puddle = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), muckMat);
          puddle.scale.set(1.0 + rand() * 0.4, 0.22 + rand() * 0.12, 1.0 + rand() * 0.3);
          puddle.position.set(x + dx, 0.22, y + dz);
          puddle.rotation.y = rand() * Math.PI * 2;
          this.#tilesGroup.add(puddle);
        }
        break;
      }
      case Landscapes.MINE: {
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x7f878d, roughness: 0.74, metalness: 0.08 });
        const rockCount = 3 + Math.floor(rand() * 3);
        for (let i = 0; i < rockCount; i++) {
          const r = {
            dx: -0.2 + rand() * 0.4,
            dz: -0.2 + rand() * 0.4,
            s: 0.05 + rand() * 0.05,
          };
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r.s, 0), rockMat);
          rock.position.set(x + r.dx, 0.25 + r.s * 0.4, y + r.dz);
          rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
          this.#tilesGroup.add(rock);
        }
        break;
      }
    }
  }

  #addCastleDetail(x, y, board, boardManager) {
    const growth = this.#castleGrowthState(board, boardManager);
    const tier = growth.tier;

    const stone = new THREE.MeshStandardMaterial({
      color: tier >= 3 ? 0xe1e5ee : 0xd4d8df,
      roughness: tier === 0 ? 0.68 : 0.56,
      metalness: tier >= 2 ? 0.11 : 0.06,
      emissive: growth.perfectKingdom ? 0x1b2841 : 0x11141a,
      emissiveIntensity: growth.perfectKingdom ? 0.20 : 0.08,
    });

    const keepScale = tier === 0 ? 0.80 : tier === 1 ? 0.95 : tier === 2 ? 1.10 : tier === 3 ? 1.22 : 1.30;
    const keepHeight = 0.18 + keepScale * 0.20;
    const keep = new THREE.Mesh(new THREE.BoxGeometry(0.42 * keepScale, keepHeight, 0.42 * keepScale), stone);
    keep.position.set(x, 0.22 + keepHeight / 2, y);
    this.#tilesGroup.add(keep);

    const towerCount = tier === 0 ? 2 : 4;
    const towerGeom = new THREE.CylinderGeometry(0.07 + tier * 0.012, 0.08 + tier * 0.012, 0.18 + tier * 0.05, 12);
    const towerOffsets = [
      [-0.28, -0.28],
      [0.28, -0.28],
      [-0.28, 0.28],
      [0.28, 0.28],
    ];
    for (let i = 0; i < towerCount; i++) {
      const [dx, dz] = towerOffsets[i];
      const tower = new THREE.Mesh(towerGeom, stone);
      tower.position.set(x + dx, 0.25 + (0.18 + tier * 0.05) / 2, y + dz);
      this.#tilesGroup.add(tower);
    }

    if (tier >= 1) {
      const battlement = new THREE.MeshStandardMaterial({ color: 0xc3c8cf, roughness: 0.52, metalness: 0.1 });
      const toothGeom = new THREE.BoxGeometry(0.08, 0.08, 0.08);
      const teeth = [
        [-0.16, -0.16], [0.00, -0.16], [0.16, -0.16],
        [-0.16, 0.16], [0.00, 0.16], [0.16, 0.16],
        [-0.16, 0.00], [0.16, 0.00],
      ];
      for (const [dx, dz] of teeth) {
        const tooth = new THREE.Mesh(toothGeom, battlement);
        tooth.position.set(x + dx * keepScale, 0.44 + keepHeight * 0.35, y + dz * keepScale);
        this.#tilesGroup.add(tooth);
      }
    }

    if (tier >= 2) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x49566f, roughness: 0.42, metalness: 0.16 });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.20 * keepScale, 0.16, 4), roofMat);
      roof.rotation.y = Math.PI * 0.25;
      roof.position.set(x, 0.46 + keepHeight * 0.4, y);
      this.#tilesGroup.add(roof);
    }

    if (tier >= 3) {
      const bannerMat = new THREE.MeshStandardMaterial({ color: 0x2d5ea8, roughness: 0.6, metalness: 0.08, side: THREE.DoubleSide });
      const mastMat = new THREE.MeshStandardMaterial({ color: 0x5d4c3a, roughness: 0.75, metalness: 0.03 });
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.28, 8), mastMat);
      mast.position.set(x + 0.06, 0.62, y + 0.06);
      this.#tilesGroup.add(mast);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.09), bannerMat);
      banner.position.set(x + 0.12, 0.66, y + 0.06);
      banner.rotation.y = Math.PI * 0.20;
      this.#tilesGroup.add(banner);
    }

    if (growth.perfectKingdom) {
      const crownMat = new THREE.MeshStandardMaterial({
        color: 0xffd66d,
        roughness: 0.28,
        metalness: 0.55,
        emissive: 0x7a4b08,
        emissiveIntensity: 0.35,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 10, 26), crownMat);
      ring.position.set(x, 0.84, y);
      ring.rotation.x = Math.PI / 2;
      this.#tilesGroup.add(ring);

      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.08, 8), crownMat);
        tip.position.set(x + Math.cos(a) * 0.18, 0.88, y + Math.sin(a) * 0.18);
        this.#tilesGroup.add(tip);
      }
    }
  }

  #crownAnchor(tile, board) {
    const n = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const same = [];
    for (const [dx, dy] of n) {
      const other = board[keyOf(tile.x + dx, tile.y + dy)];
      if (!other) continue;
      if (other.landscape !== tile.landscape) continue;
      same.push(other);
    }
    if (same.length === 1) {
      const m = same[0];
      return { x: (tile.x + m.x) / 2, y: (tile.y + m.y) / 2 };
    }
    return { x: tile.x, y: tile.y };
  }

  #addCrownDetail(tile, board) {
    const x = tile.x;
    const y = tile.y;
    const crowns = tile.crowns || 0;
    const tier = Math.max(1, Math.min(3, crowns));
    const rand = this.#variationRand(tile, 'crown');
    const anchor = this.#crownAnchor(tile, board);
    const bx = anchor.x;
    const by = anchor.y;

    const style = Math.floor(rand() * 4);
    const prominence = 1.18 + tier * 0.08;

    let theme = {
      base: 0x9b8452,
      accent: 0xffd46e,
      stone: 0xc9ced6,
      emissiveAccent: 0x4a3210,
      emissiveStone: 0x1a1e24,
    };
    switch (tile.landscape) {
      case Landscapes.FOREST:
        theme = { base: 0x6f5233, accent: 0x7ed086, stone: 0x9fb6a3, emissiveAccent: 0x1f4328, emissiveStone: 0x172a1b };
        break;
      case Landscapes.WHEAT:
        theme = { base: 0x9f7440, accent: 0xffdc7a, stone: 0xd6caa4, emissiveAccent: 0x5a3c16, emissiveStone: 0x302514 };
        break;
      case Landscapes.WATER:
        theme = { base: 0x3d6b7a, accent: 0x7bd9ff, stone: 0x9ec1cf, emissiveAccent: 0x13354a, emissiveStone: 0x182630 };
        break;
      case Landscapes.PASTURE:
        theme = { base: 0x62834c, accent: 0xb8ef8e, stone: 0xbfd7ac, emissiveAccent: 0x2f4f22, emissiveStone: 0x24301f };
        break;
      case Landscapes.BOG:
        theme = { base: 0x5a4768, accent: 0xc7a3ff, stone: 0xaea0bf, emissiveAccent: 0x31224d, emissiveStone: 0x251f33 };
        break;
      case Landscapes.MINE:
        theme = { base: 0x6f767d, accent: 0x9be2ff, stone: 0xc4ccd4, emissiveAccent: 0x233f52, emissiveStone: 0x20262d };
        break;
    }

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry((0.11 + rand() * 0.03) * prominence, (0.13 + rand() * 0.03) * prominence, (0.08 + rand() * 0.03) * prominence, 12),
      new THREE.MeshStandardMaterial({ color: theme.base, roughness: 0.58, metalness: 0.14 })
    );
    plinth.position.set(bx, 0.29, by);
    plinth.rotation.y = rand() * Math.PI * 2;
    this.#tilesGroup.add(plinth);

    const gold = new THREE.MeshStandardMaterial({
      color: theme.accent,
      roughness: 0.30,
      metalness: 0.80,
      emissive: theme.emissiveAccent,
      emissiveIntensity: 0.18,
    });

    const stone = new THREE.MeshStandardMaterial({
      color: theme.stone,
      roughness: 0.48,
      metalness: 0.16,
      emissive: theme.emissiveStone,
      emissiveIntensity: 0.10,
    });

    if (style === 0) {
      // Classic crown monument.
      const ringR = (0.10 + rand() * 0.04) * prominence;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, (0.028 + rand() * 0.01) * prominence, 10, 24), gold);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = rand() * Math.PI;
      ring.position.set(bx, 0.37, by);
      this.#tilesGroup.add(ring);

      const spikeGeom = new THREE.ConeGeometry((0.028 + rand() * 0.012) * prominence, (0.09 + tier * 0.02 + rand() * 0.02) * prominence, 8);
      const spikeCount = 4 + tier + Math.floor(rand() * 2);
      const phase = rand() * Math.PI * 2;
      for (let i = 0; i < spikeCount; i++) {
        const a = phase + (i / spikeCount) * Math.PI * 2;
        const s = new THREE.Mesh(spikeGeom, gold);
        const rr = ringR - 0.01 + rand() * 0.02;
        s.position.set(bx + Math.cos(a) * rr, 0.45 + tier * 0.012 + rand() * 0.01, by + Math.sin(a) * rr);
        s.rotation.y = a;
        this.#tilesGroup.add(s);
      }
    } else if (style === 1) {
      // Mini tower.
      const bodyH = (0.22 + tier * 0.04) * prominence;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * prominence, 0.10 * prominence, bodyH, 10), stone);
      body.position.set(bx, 0.32 + bodyH / 2, by);
      this.#tilesGroup.add(body);

      const roofH = (0.14 + tier * 0.02) * prominence;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.13 * prominence, roofH, 8), gold);
      roof.position.set(bx, 0.32 + bodyH + roofH * 0.45, by);
      roof.rotation.y = rand() * Math.PI * 2;
      this.#tilesGroup.add(roof);
    } else if (style === 2) {
      // Shrine gate.
      const beamMat = new THREE.MeshStandardMaterial({ color: theme.base, roughness: 0.58, metalness: 0.10, emissive: theme.emissiveStone, emissiveIntensity: 0.06 });
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.035 * prominence, 0.19 * prominence, 0.035 * prominence), beamMat);
      const p2 = p1.clone();
      p1.position.set(bx - 0.09 * prominence, 0.38, by);
      p2.position.set(bx + 0.09 * prominence, 0.38, by);
      this.#tilesGroup.add(p1, p2);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.24 * prominence, 0.035 * prominence, 0.05 * prominence), gold);
      top.position.set(bx, 0.49, by);
      this.#tilesGroup.add(top);
    } else {
      // Obelisk.
      const obH = (0.26 + tier * 0.05) * prominence;
      const ob = new THREE.Mesh(new THREE.ConeGeometry(0.065 * prominence, obH, 4), stone);
      ob.position.set(bx, 0.30 + obH / 2, by);
      ob.rotation.y = rand() * Math.PI * 2;
      this.#tilesGroup.add(ob);

      const cap = new THREE.Mesh(new THREE.OctahedronGeometry((0.032 + tier * 0.006) * prominence, 0), gold);
      cap.position.set(bx, 0.30 + obH + 0.05 * prominence, by);
      this.#tilesGroup.add(cap);
    }

    // Landscape-themed ornament near the monument base.
    if (tile.landscape === Landscapes.WATER) {
      const wave = new THREE.Mesh(
        new THREE.TorusGeometry(0.08 * prominence, 0.008 * prominence, 8, 20),
        new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.30, metalness: 0.30, emissive: theme.emissiveAccent, emissiveIntensity: 0.20 })
      );
      wave.rotation.x = Math.PI / 2;
      wave.position.set(bx, 0.33, by);
      this.#tilesGroup.add(wave);
    } else if (tile.landscape === Landscapes.FOREST) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.04 * prominence, 0.08 * prominence, 7), new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.62, metalness: 0.08 }));
      leaf.position.set(bx + 0.1 * prominence, 0.36, by - 0.02 * prominence);
      this.#tilesGroup.add(leaf);
    } else if (tile.landscape === Landscapes.MINE) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.025 * prominence, 0), new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.emissiveAccent, emissiveIntensity: 0.22, roughness: 0.2, metalness: 0.28 }));
      crystal.position.set(bx - 0.09 * prominence, 0.37, by + 0.03 * prominence);
      this.#tilesGroup.add(crystal);
    }

    if (tier >= 2) {
      const jewel = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.045 * prominence, 0),
        new THREE.MeshStandardMaterial({
          color: tier >= 3 ? 0x9ae0ff : 0xff8ec0,
          emissive: tier >= 3 ? 0x1f3c5a : 0x4a1731,
          emissiveIntensity: 0.32,
          roughness: 0.18,
          metalness: 0.34,
        })
      );
      jewel.position.set(bx + (-0.015 + rand() * 0.03), 0.47 + tier * 0.01 + rand() * 0.01, by + (-0.015 + rand() * 0.03));
      jewel.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      this.#tilesGroup.add(jewel);

      if (tier >= 3) {
        const sideJewel = new THREE.Mesh(
          new THREE.OctahedronGeometry((0.028 + rand() * 0.01) * prominence, 0),
          new THREE.MeshStandardMaterial({
            color: 0x8ef5cf,
            emissive: 0x1e4a3d,
            emissiveIntensity: 0.28,
            roughness: 0.20,
            metalness: 0.30,
          })
        );
        const a = rand() * Math.PI * 2;
        const rr = 0.10 + rand() * 0.04;
        sideJewel.position.set(bx + Math.cos(a) * rr, 0.44 + rand() * 0.02, by + Math.sin(a) * rr);
        this.#tilesGroup.add(sideJewel);
      }
    }
  }

  #getTileTexture(landscape, crowns, seedKey) {
    const key = `${landscapeKey(landscape)}|${crowns}|${seedKey}`;
    const cached = this.#tileTextureCache.get(key);
    if (cached) return cached;

    const texture = createLandscapeTileTexture(landscape, crowns, seedKey, 256);
    this.#tileTextureCache.set(key, texture);
    return texture;
  }

  #getTileMaterial(landscape, crowns, seedKey, ghost = false) {
    const key = `${ghost ? 'ghost' : 'solid'}|${landscapeKey(landscape)}|${crowns}|${seedKey}`;
    const cached = this.#tileMaterialCache.get(key);
    if (cached) return cached;

    const texture = this.#getTileTexture(landscape, crowns, seedKey);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      roughness: ghost ? 0.74 : 0.60,
      metalness: 0.03,
      transparent: ghost,
      opacity: ghost ? 0.78 : 1,
    });

    if (landscape === Landscapes.CASTLE) {
      material.emissive = new THREE.Color(0x23262b);
      material.emissiveIntensity = ghost ? 0.08 : 0.16;
    }

    this.#tileMaterialCache.set(key, material);
    return material;
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
      title.textContent = `P${idx + 1}: ${this.#playerNames[idx] ?? p.name} · ${p.board.score}`;

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
      if (t) t.textContent = `P${idx + 1}: ${this.#playerNames[idx] ?? this.#game.players[idx].name} · ${this.#game.players[idx].board.score}`;
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
      const py = oy + (y - minY) * tilePx;
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

  #findBestInitialHoverAnchor() {
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return null;

    const activeIdx = g.currentPlacingPlayerIndex;
    if (activeIdx == null) return null;

    const playerBoard = g.players[activeIdx]?.board;
    const board = playerBoard?.board;
    const boardSize = playerBoard?.boardSize;
    if (!board || !boardSize) return null;

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

    const ordered = [...candidates]
      .map((k) => {
        const [sx, sy] = k.split(',');
        return { x: Number.parseInt(sx, 10), y: Number.parseInt(sy, 10) };
      })
      .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y))
      .sort((a, b) => {
        const ad = Math.abs(a.x - centerX) + Math.abs(a.y - centerY);
        const bd = Math.abs(b.x - centerX) + Math.abs(b.y - centerY);
        return ad - bd;
      });

    let firstVisible = null;
    for (const c of ordered) {
      if (!firstVisible && !board[keyOf(c.x, c.y)]) firstVisible = c;
      const feedback = g.getPlacementFeedbackAt(c.x, c.y);
      if (feedback.ok) return c;
    }

    if (firstVisible) return firstVisible;
    return { x: centerX, y: centerY };
  }

  #orderedPlacementCandidateAnchors() {
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return [];

    const activeIdx = g.currentPlacingPlayerIndex;
    if (activeIdx == null) return [];

    const playerBoard = g.players[activeIdx]?.board;
    const board = playerBoard?.board;
    const boardSize = playerBoard?.boardSize;
    if (!board || !boardSize) return [];

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

  #resetPlacementAnchor() {
    if (!this.#isMyTurnToPlace()) {
      this.#setCanvasNotice('It is not your turn to place.', 'info', 1100);
      return;
    }

    const activeIdx = this.#game?.currentPlacingPlayerIndex;
    if (activeIdx != null) this.#focusedPlayerIndex = activeIdx;

    const suggested = this.#findBestInitialHoverAnchor();
    if (!suggested) {
      this.#setCanvasNotice('No placement candidates found.', 'info', 1100);
      return;
    }

    this.#hoverAnchor = suggested;
    this.#hoverAnchorAuto = true;
    this.#placementHint = '';
    this.#setCanvasNotice('Reset tile preview.', 'info', 900);
    this.#renderGhost();
    this.#centerOnFocusedBoard();
    this.#syncMobileActions();
    this.#refreshHud();
  }

  #jumpToNextValidAnchor() {
    if (!this.#isMyTurnToPlace()) {
      this.#setCanvasNotice('It is not your turn to place.', 'info', 1100);
      return;
    }
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return;

    const activeIdx = g.currentPlacingPlayerIndex;
    if (activeIdx != null) this.#focusedPlayerIndex = activeIdx;

    const ordered = this.#orderedPlacementCandidateAnchors();
    if (!ordered.length) {
      this.#setCanvasNotice('No placement candidates found.', 'info', 1100);
      return;
    }

    const valid = ordered.filter((c) => g.getPlacementFeedbackAt(c.x, c.y).ok);
    if (!valid.length) {
      this.#setCanvasNotice('No valid placements. Use Skip if available.', 'info', 1300);
      return;
    }

    let currentIndex = -1;
    if (this.#hoverAnchor) {
      currentIndex = valid.findIndex((c) => c.x === this.#hoverAnchor.x && c.y === this.#hoverAnchor.y);
    }
    const nextIndex = (currentIndex + 1) % valid.length;
    const next = valid[nextIndex];

    this.#hoverAnchor = next;
    this.#hoverAnchorAuto = false;
    this.#placementHint = '';
    if (valid.length === 1) {
      this.#setCanvasNotice('Only one valid spot is available.', 'info', 1100);
    } else {
      this.#setCanvasNotice(`Valid spot ${nextIndex + 1}/${valid.length}`, 'info', 900);
    }
    this.#renderGhost();
    this.#centerOnFocusedBoard();
    this.#syncMobileActions();
    this.#refreshHud();
  }

  #isCurrentHoverAnchorOccluded() {
    if (!this.#hoverAnchor) return false;

    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return false;

    const activeIdx = g.currentPlacingPlayerIndex;
    if (activeIdx == null) return false;
    const board = g.players[activeIdx]?.board?.board;
    if (!board) return false;

    const anchor = this.#hoverAnchor;
    if (board[keyOf(anchor.x, anchor.y)]) return true;

    const feedback = g.getPlacementFeedbackAt(anchor.x, anchor.y);
    return !feedback.ok && feedback.reason === 'Space occupied.';
  }

  #renderGhost() {
    while (this.#ghostGroup.children.length) this.#ghostGroup.remove(this.#ghostGroup.children[0]);

    const g = this.#game;
    const activeIdx = g.currentPlacingPlayerIndex;
    if (this.#isMyTurnToPlace() && activeIdx != null && this.#focusedPlayerIndex !== activeIdx) {
      this.#focusedPlayerIndex = activeIdx;
    }

    const focusedBoard = g.players[this.#focusedPlayerIndex]?.board?.board || g.players[0].board.board;
    if (g.isGameOver) return;
    if (g.state !== GameState.PLACE) {
      this.#renderRegionScoring(focusedBoard);
      return;
    }
    if (!this.#isMyTurnToPlace()) {
      this.#renderRegionScoring(focusedBoard);
      return;
    }

    const drafted = g.currentPlacingDraftedTile;
    if (!drafted) {
      this.#renderRegionScoring(focusedBoard);
      return;
    }

    // On entering placement phase, show the ghost immediately.
    // Prefer a legal/visible anchor so the ghost does not spawn hidden under tiles.
    if (!this.#hoverAnchor || (this.#hoverAnchorAuto && this.#isCurrentHoverAnchorOccluded())) {
      const suggested = this.#findBestInitialHoverAnchor();
      if (suggested) {
        this.#hoverAnchor = suggested;
        this.#hoverAnchorAuto = true;
      }
    }

    const anchor = this.#hoverAnchor;
    const feedback = g.getPlacementFeedbackAt(anchor.x, anchor.y);
    const ghostAnchorEnd = feedback.ok ? feedback.anchorEnd : DominoEnd.LEFT;

    const built = this.#buildProjectedBoard(focusedBoard, drafted, anchor, ghostAnchorEnd);
    const other = built.other;

    const board = g.players[activeIdx].board.board;
    const occupied = board[keyOf(anchor.x, anchor.y)] || board[keyOf(other.x, other.y)];
    const valid = feedback.ok;

    const borderColor = valid && !occupied ? 0x8cff9b : 0xff6b6b;

    const makeGhostCell = (x, y, landscape, crowns) => {
      const material = this.#getTileMaterial(landscape, crowns || 0, `${x},${y}`, true);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.18, 0.98),
        material
      );
      mesh.position.set(x, 0.09, y);
      this.#ghostGroup.add(mesh);

      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.99, 0.20, 0.99));
      const edgeMat = new THREE.LineBasicMaterial({ color: borderColor, transparent: true, opacity: 0.98 });
      const edge = new THREE.LineSegments(edgeGeo, edgeMat);
      edge.position.set(x, 0.09, y);
      this.#ghostGroup.add(edge);

      if ((crowns || 0) > 0) {
        const star = createTextSprite(crownsText(crowns), {
          font: '700 46px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
          fillStyle: '#f5cc51',
          background: 'rgba(25,28,34,0.78)',
          border: 'rgba(255,255,255,0.28)',
        });
        star.position.set(x, 0.34, y);
        star.scale.set(0.30, 0.30, 1);
        this.#ghostGroup.add(star);
      }
    };

    const leftCoord = ghostAnchorEnd === DominoEnd.LEFT ? anchor : other;
    const rightCoord = ghostAnchorEnd === DominoEnd.RIGHT ? anchor : other;

    makeGhostCell(leftCoord.x, leftCoord.y, drafted.domino.leftEnd.landscape, drafted.domino.leftEnd.crowns);
    makeGhostCell(rightCoord.x, rightCoord.y, drafted.domino.rightEnd.landscape, drafted.domino.rightEnd.crowns);

    if (valid && !occupied) this.#renderRegionScoring(built.projected);
    else this.#renderRegionScoring(focusedBoard);
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

    if (this.#controls) {
      const t = this.#controls.target;
      // Keep mat + grid + gameplay layers attached together.
      const worldParallax = 0.12;
      const px = t.x * worldParallax;
      const pz = t.z * worldParallax;

      if (this.#bambooMatFront) {
        this.#bambooMatFront.position.x = px;
        this.#bambooMatFront.position.z = pz;
      }
      if (this.#gridHelper) {
        this.#gridHelper.position.x = px;
        this.#gridHelper.position.z = pz;
      }
      if (this.#tilesGroup) {
        this.#tilesGroup.position.x = px;
        this.#tilesGroup.position.z = pz;
      }
      if (this.#regionOverlayGroup) {
        this.#regionOverlayGroup.position.x = px;
        this.#regionOverlayGroup.position.z = pz;
      }
      if (this.#ghostGroup) {
        this.#ghostGroup.position.x = px;
        this.#ghostGroup.position.z = pz;
      }
      if (this.#boardPlane) {
        this.#boardPlane.position.x = px;
        this.#boardPlane.position.z = pz;
      }
    }

    if (this.#controls) this.#controls.update();
    if (this.#renderer && this.#scene && this.#camera) this.#renderer.render(this.#scene, this.#camera);
    requestAnimationFrame(this.#tick);
  };
}
