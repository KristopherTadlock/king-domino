import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GameConfiguration } from '../classes/game-configuration.js';
import { GameState } from '../classes/enums/game-state.js';
import { Landscapes } from '../classes/enums/landscapes.js';
import { DominoEnd } from '../classes/enums/domino-end.js';
import { Edges, EdgeOffset } from '../classes/enums/edges.js';
import { WebGameManager } from '../classes/web-game-manager.js';
import { MultiplayerClient } from '../classes/multiplayer-client.js';
import { DominoPoolManager } from '../classes/domino-pool-manager.js';
import { GameAdvisor } from '../classes/game-advisor.js';
import { randomSeed } from '../classes/utils/rng.js';

const LANDSCAPE_COLORS = Object.freeze({
  [Landscapes.CASTLE]: 0x888888,
  [Landscapes.WHEAT]: 0xeaa83a,
  [Landscapes.FOREST]: 0x176a3b,
  [Landscapes.MINE]: 0x2e3a47,
  [Landscapes.PASTURE]: 0x67c864,
  [Landscapes.BOG]: 0x6b4388,
  [Landscapes.WATER]: 0x1aa7d8,
});

const LANDSCAPE_TEXTURES = Object.freeze({
  [Landscapes.CASTLE]: {
    top: '#d8dadd',
    mid: '#b8bec4',
    bottom: '#939ca4',
    dark: 'rgba(60,64,72,0.34)',
    light: 'rgba(255,255,255,0.18)',
  },
  [Landscapes.WHEAT]: {
    top: '#ffe08a',
    mid: '#eab047',
    bottom: '#b96f25',
    dark: 'rgba(119,70,18,0.28)',
    light: 'rgba(255,246,190,0.32)',
  },
  [Landscapes.FOREST]: {
    top: '#3f9960',
    mid: '#1d743f',
    bottom: '#0f4427',
    dark: 'rgba(6,36,18,0.36)',
    light: 'rgba(159,232,174,0.24)',
  },
  [Landscapes.WATER]: {
    top: '#66d4ec',
    mid: '#2099c4',
    bottom: '#116a95',
    dark: 'rgba(10,68,99,0.32)',
    light: 'rgba(202,248,255,0.30)',
  },
  [Landscapes.PASTURE]: {
    top: '#b1ed89',
    mid: '#6fca61',
    bottom: '#3d9843',
    dark: 'rgba(38,105,42,0.24)',
    light: 'rgba(245,255,205,0.30)',
  },
  [Landscapes.BOG]: {
    top: '#9270aa',
    mid: '#6b4388',
    bottom: '#3f2759',
    dark: 'rgba(41,23,60,0.36)',
    light: 'rgba(193,183,113,0.28)',
  },
  [Landscapes.MINE]: {
    top: '#657484',
    mid: '#394655',
    bottom: '#1c2530',
    dark: 'rgba(8,14,20,0.40)',
    light: 'rgba(199,218,232,0.24)',
  },
});

const ALL_EDGES = [Edges.TOP, Edges.BOTTOM, Edges.LEFT, Edges.RIGHT];
const SCORE_HISTORY_STORAGE_KEY = 'kd.completedGames.v1';
const SCORE_HISTORY_LIMIT = 50;
const ADVISOR_VISIBILITY_STORAGE_KEY = 'kd.showAdvisor';

const LANDSCAPE_COLOR_BY_KEY = Object.freeze(Object.fromEntries(
  Object.getOwnPropertySymbols(LANDSCAPE_COLORS)
    .map((landscape) => [landscapeKey(landscape), LANDSCAPE_COLORS[landscape]])
));

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

function createPlayerMatLabel(name, score, options = {}) {
  const {
    playerColor = 'rgba(126, 192, 255, 0.95)',
    playerGlow = 'rgba(126, 192, 255, 0.18)',
  } = options;
  const width = 512;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, 'rgba(21, 25, 31, 0.38)');
  bg.addColorStop(1, 'rgba(7, 10, 13, 0.30)');
  ctx.fillStyle = bg;
  roundedRect(ctx, 20, 22, width - 40, height - 44, 26);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  roundedRect(ctx, 20, 22, width - 40, height - 44, 26);
  ctx.stroke();

  ctx.shadowColor = playerGlow;
  ctx.shadowBlur = 14;
  ctx.fillStyle = playerColor;
  ctx.beginPath();
  ctx.arc(58, height / 2, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(243, 247, 251, 0.82)';
  let nameFontSize = 36;
  const maxNameWidth = 318;
  do {
    ctx.font = `900 ${nameFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    if (ctx.measureText(name).width <= maxNameWidth || nameFontSize <= 26) break;
    nameFontSize -= 2;
  } while (true);
  let label = name;
  while (label.length > 1 && ctx.measureText(label).width > maxNameWidth) {
    label = `${label.slice(0, -2)}…`;
  }
  ctx.textAlign = 'left';
  ctx.fillText(label, 88, height / 2);

  ctx.textAlign = 'right';
  ctx.font = '950 40px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.fillText(String(score), width - 48, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, height / width), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -0.58;
  return mesh;
}

function createDraftMatLabel(text = 'Draft') {
  const width = 320;
  const height = 96;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, 'rgba(255, 246, 222, 0.14)');
  bg.addColorStop(1, 'rgba(17, 15, 12, 0.20)');
  ctx.fillStyle = bg;
  roundedRect(ctx, 22, 24, width - 44, height - 48, 24);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 238, 198, 0.18)';
  ctx.lineWidth = 2;
  roundedRect(ctx, 22, 24, width - 44, height - 48, 24);
  ctx.stroke();

  ctx.shadowColor = 'rgba(255, 228, 170, 0.16)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(235, 220, 190, 0.72)';
  ctx.font = '900 34px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.16, height / width * 1.16), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -0.58;
  return mesh;
}

function createAdvisorSpeechSprite(text) {
  const width = 384;
  const height = 138;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.shadowColor = 'rgba(6, 8, 10, 0.34)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(28, 31, 35, 0.88)';
  roundedRect(ctx, 22, 16, width - 44, height - 46, 28);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(74, height - 31);
  ctx.lineTo(100, height - 12);
  ctx.lineTo(114, height - 35);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(255, 218, 141, 0.28)';
  ctx.lineWidth = 3;
  roundedRect(ctx, 22, 16, width - 44, height - 46, 28);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 238, 198, 0.94)';
  ctx.font = '900 42px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 - 6);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.22, 0.44, 1);
  sprite.renderOrder = 86;
  return sprite;
}

function createConfirmButtonSprite() {
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  ctx.shadowColor = 'rgba(67, 255, 137, 0.55)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = 'rgba(35, 131, 72, 0.96)';
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(241, 255, 246, 0.98)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(55, 82);
  ctx.lineTo(72, 98);
  ctx.lineTo(106, 61);
  ctx.stroke();

  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.strokeStyle = 'rgba(241, 255, 246, 0.84)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 56, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.70, 0.70, 1);
  sprite.renderOrder = 80;
  return sprite;
}

function createStarShapeGeometry(outer = 0.052, inner = 0.023) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function createWaterShardGeometry(width = 0.18, depth = 0.06, rand = Math.random) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const points = [
    [-halfW + rand() * width * 0.16, -halfD + rand() * depth * 0.34],
    [-halfW * 0.20 + rand() * width * 0.20, -halfD - rand() * depth * 0.10],
    [halfW - rand() * width * 0.16, -halfD * 0.36 + rand() * depth * 0.34],
    [halfW * 0.54 + rand() * width * 0.20, halfD - rand() * depth * 0.22],
    [-halfW + rand() * width * 0.18, halfD * 0.48 + rand() * depth * 0.20],
  ];
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
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

function createSceneBackgroundTexture(debug = false, size = 1024, layer = 'front') {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Stained tabletop tone. Keep it organic, but avoid regular seams that can
  // accidentally read as a second gameplay grid.
  const isBack = layer === 'back';
  const top = isBack
    ? (debug ? '#4d3827' : '#2f2118')
    : (debug ? '#6a4b31' : '#4a321f');
  const bottom = isBack
    ? (debug ? '#382719' : '#22160f')
    : (debug ? '#533722' : '#342113');
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const rand = mulberry32(hash32(`tabletop|${debug ? '1' : '0'}|${layer}`));

  // Broad unevenness gives the surface warmth without producing straight,
  // tile-sized visual guides.
  for (let i = 0; i < 18; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = size * (0.10 + rand() * 0.22);
    const warm = rand() > 0.45;
    const cloud = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
    cloud.addColorStop(0, warm
      ? `rgba(196,121,54,${0.030 + rand() * 0.055})`
      : `rgba(10,8,6,${0.050 + rand() * 0.055})`);
    cloud.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cloud;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // Irregular walnut grain suggests a crafted table while avoiding any
  // repeated alignment with the kingdom grid.
  ctx.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const x = -size * 0.10 + rand() * size * 1.20;
    const y = rand() * size;
    const len = size * (0.12 + rand() * 0.34);
    const bend = size * (-0.07 + rand() * 0.14);
    const drift = size * (-0.05 + rand() * 0.12);
    const alpha = isBack ? 0.028 + rand() * 0.040 : 0.040 + rand() * 0.065;
    const light = rand() > 0.58;
    ctx.strokeStyle = light
      ? `rgba(214,145,75,${alpha})`
      : `rgba(12,8,5,${alpha})`;
    ctx.lineWidth = 0.9 + rand() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + len * 0.32,
      y + bend,
      x + len * 0.70,
      y - bend * 0.55,
      x + len,
      y + drift
    );
    ctx.stroke();
  }

  // Subtle pores and knots keep the surface from feeling like a flat plane.
  const knots = isBack ? 10 : 14;
  for (let i = 0; i < knots; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rx = size * (0.025 + rand() * 0.040);
    const ry = size * (0.010 + rand() * 0.022);
    const angle = rand() * Math.PI;
    ctx.strokeStyle = `rgba(16,10,6,${0.12 + rand() * 0.12})`;
    ctx.lineWidth = 1.1 + rand() * 1.8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(214,132,58,${0.018 + rand() * 0.030})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.58, ry * 0.58, angle, 0, Math.PI * 2);
    ctx.fill();
  }

  const specks = isBack ? 2100 : 1800;
  for (let i = 0; i < specks; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const alpha = 0.018 + rand() * 0.055;
    ctx.fillStyle = rand() > 0.38
      ? `rgba(10,7,5,${alpha})`
      : `rgba(197,122,56,${alpha * 0.7})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.24, size / 2, size / 2, size * 0.76);
  vignette.addColorStop(0, 'rgba(255,205,142,0.030)');
  vignette.addColorStop(1, 'rgba(4,3,2,0.24)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

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
      base = 'linear-gradient(145deg, #ffe08a 0%, #eab047 58%, #b96f25 100%), repeating-linear-gradient(110deg, rgba(255,246,190,0.22) 0 3px, rgba(119,70,18,0) 3px 8px)';
      break;
    case Landscapes.FOREST:
      base = 'linear-gradient(145deg, #3f9960 0%, #1d743f 58%, #0f4427 100%), radial-gradient(circle at 28% 68%, rgba(159,232,174,0.28) 0 18%, rgba(0,0,0,0) 20%)';
      break;
    case Landscapes.WATER:
      base = 'linear-gradient(150deg, #66d4ec 0%, #2099c4 46%, #116a95 100%), repeating-linear-gradient(8deg, rgba(202,248,255,0.18) 0 2px, rgba(0,0,0,0) 2px 9px), radial-gradient(circle at 24% 74%, rgba(10,68,99,0.34) 0 18%, rgba(0,0,0,0) 22%)';
      break;
    case Landscapes.PASTURE:
      base = 'linear-gradient(145deg, #b1ed89 0%, #6fca61 58%, #3d9843 100%), radial-gradient(circle at 72% 34%, rgba(245,255,205,0.30) 0 17%, rgba(0,0,0,0) 19%)';
      break;
    case Landscapes.BOG:
      base = 'linear-gradient(145deg, #9270aa 0%, #6b4388 58%, #3f2759 100%), radial-gradient(circle at 62% 66%, rgba(193,183,113,0.24) 0 20%, rgba(0,0,0,0) 22%)';
      break;
    case Landscapes.MINE:
      base = 'linear-gradient(145deg, #657484 0%, #394655 56%, #1c2530 100%), repeating-linear-gradient(45deg, rgba(199,218,232,0.16) 0 3px, rgba(0,0,0,0) 3px 8px)';
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

function createLandscapeTileCanvas(landscape, crowns, seedKey, size = 256) {
  const seed = hash32(`${landscapeKey(landscape)}|${crowns}|${seedKey}`);
  const rand = mulberry32(seed);
  const theme = LANDSCAPE_TEXTURES[landscape] ?? LANDSCAPE_TEXTURES[Landscapes.CASTLE];

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, theme.top);
  grad.addColorStop(0.56, theme.mid);
  grad.addColorStop(1, theme.bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  if (landscape === Landscapes.WHEAT) {
    ctx.save();
    for (let i = 0; i < 18; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const rx = 18 + rand() * 36;
      const ry = 7 + rand() * 18;
      ctx.fillStyle = rand() > 0.45
        ? `rgba(255,239,158,${0.08 + rand() * 0.12})`
        : `rgba(133,78,22,${0.05 + rand() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, -0.38 + rand() * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255,244,183,0.20)';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 28; i++) {
      const x0 = rand() * size;
      const y0 = rand() * size;
      const len = 14 + rand() * 28;
      const bend = -7 + rand() * 14;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + len * 0.45, y0 + bend, x0 + len, y0 - len * 0.18);
      ctx.stroke();
    }
    ctx.restore();
  } else if (landscape === Landscapes.MINE) {
    ctx.save();
    for (let i = 0; i < 10; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const radius = 26 + rand() * 54;
      const sides = 4 + Math.floor(rand() * 3);
      const angle = rand() * Math.PI;
      ctx.fillStyle = rand() > 0.48
        ? `rgba(8,14,20,${0.10 + rand() * 0.16})`
        : `rgba(184,204,218,${0.045 + rand() * 0.060})`;
      ctx.beginPath();
      for (let p = 0; p < sides; p++) {
        const a = angle + (p / sides) * Math.PI * 2;
        const r = radius * (0.62 + rand() * 0.58);
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r * (0.52 + rand() * 0.34);
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x0 = rand() * size;
      const y0 = rand() * size;
      const len = 30 + rand() * 76;
      const angle = -0.80 + rand() * 0.48;
      ctx.strokeStyle = rand() > 0.58
        ? `rgba(136,226,255,${0.14 + rand() * 0.18})`
        : `rgba(255,212,94,${0.10 + rand() * 0.15})`;
      ctx.lineWidth = 1.2 + rand() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(angle) * len, y0 + Math.sin(angle) * len);
      ctx.stroke();
    }
    ctx.restore();
  } else if (landscape === Landscapes.WATER) {
    ctx.save();
    const waterStyle = Math.floor(rand() * 4);
    const facetCount = [5, 8, 4, 7][waterStyle];
    const glintCount = [3, 6, 1, 5][waterStyle];
    for (let i = 0; i < facetCount; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const w = (waterStyle === 2 ? 14 : 20) + rand() * (waterStyle === 1 ? 74 : 48);
      const h = (waterStyle === 0 ? 16 : 10) + rand() * (waterStyle === 3 ? 30 : 22);
      const angle = -0.62 + rand() * 1.24;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const skew = -0.35 + rand() * 0.70;
      const points = [
        [-w * 0.50, -h * 0.45],
        [w * 0.48, -h * 0.30 + skew * h],
        [w * 0.42, h * 0.50],
        [-w * 0.52, h * 0.30 - skew * h],
      ].map(([px, py]) => ({
        x: cx + px * ca - py * sa,
        y: cy + px * sa + py * ca,
      }));
      ctx.fillStyle = rand() > 0.50
        ? `rgba(185,242,255,${0.055 + rand() * 0.065})`
        : `rgba(11,82,120,${0.060 + rand() * 0.085})`;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y);
      ctx.closePath();
      ctx.fill();
    }

    for (let i = 0; i < glintCount; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const w = 6 + rand() * (waterStyle === 1 ? 30 : 18);
      const h = 3 + rand() * (waterStyle === 2 ? 5 : 9);
      const angle = -0.65 + rand() * 1.30;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const points = [
        [-w * 0.48, -h * 0.18],
        [-w * 0.08, -h * 0.54],
        [w * 0.50, -h * 0.10],
        [w * 0.18, h * 0.56],
        [-w * 0.52, h * 0.22],
      ].map(([px, py]) => ({
        x: cx + px * ca - py * sa,
        y: cy + px * sa + py * ca,
      }));
      ctx.fillStyle = `rgba(220,252,255,${0.050 + rand() * 0.095})`;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else if (landscape === Landscapes.PASTURE) {
    ctx.fillStyle = 'rgba(255,248,185,0.08)';
    for (let y = -20; y < size; y += 42) {
      ctx.beginPath();
      ctx.ellipse(size * 0.5, y, size * 0.58, 7, 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (landscape === Landscapes.BOG) {
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const rx = 20 + rand() * 52;
      const ry = 9 + rand() * 25;
      const angle = rand() * Math.PI;
      ctx.fillStyle = rand() > 0.48
        ? `rgba(38,20,55,${0.16 + rand() * 0.18})`
        : `rgba(145,139,72,${0.08 + rand() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const x0 = rand() * size;
      const y0 = rand() * size;
      const h = 10 + rand() * 28;
      const lean = -7 + rand() * 14;
      ctx.strokeStyle = rand() > 0.52
        ? `rgba(117,128,65,${0.15 + rand() * 0.18})`
        : `rgba(62,43,76,${0.14 + rand() * 0.18})`;
      ctx.lineWidth = 1.2 + rand() * 2.0;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + h * 0.5);
      ctx.quadraticCurveTo(x0 + lean * 0.35, y0, x0 + lean, y0 - h * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  const featureCount = 24 + Math.floor(rand() * 18);
  for (let i = 0; i < featureCount; i++) {
    const x = rand() * size;
    const y = rand() * size;

    if (landscape === Landscapes.WATER) {
      if (rand() > 0.78) {
        const angle = rand() * Math.PI;
        const len = 5 + rand() * 12;
        const width = 2.2 + rand() * 4.2;
        ctx.fillStyle = `rgba(218,252,255,${0.050 + rand() * 0.075})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-len * 0.48, -width * 0.08);
        ctx.lineTo(-len * 0.08, -width * 0.54);
        ctx.lineTo(len * 0.50, -width * 0.08);
        ctx.lineTo(len * 0.16, width * 0.50);
        ctx.lineTo(-len * 0.52, width * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (rand() > 0.58) {
        const body = 4 + rand() * 7;
        const angle = rand() * Math.PI * 2;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = rand() > 0.65 ? 'rgba(255,168,70,0.24)' : 'rgba(5,47,74,0.22)';
        ctx.beginPath();
        ctx.ellipse(0, 0, body * 1.25, body * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-body * 1.0, 0);
        ctx.lineTo(-body * 1.65, -body * 0.52);
        ctx.lineTo(-body * 1.65, body * 0.52);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else if (landscape === Landscapes.FOREST) {
      const r = 8 + rand() * 18;
      ctx.fillStyle = `rgba(5,34,18,${0.14 + rand() * 0.24})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      if (rand() > 0.55) {
        ctx.fillStyle = `rgba(159,232,174,${0.08 + rand() * 0.10})`;
        ctx.beginPath();
        ctx.arc(x + rand() * 14 - 7, y + rand() * 14 - 7, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (landscape === Landscapes.WHEAT) {
      ctx.strokeStyle = `rgba(255,246,190,${0.18 + rand() * 0.24})`;
      ctx.lineWidth = 1.2 + rand() * 2.1;
      ctx.beginPath();
      ctx.moveTo(x - 12, y + 12);
      ctx.quadraticCurveTo(x, y, x + 10, y - 12);
      ctx.stroke();

      ctx.fillStyle = `rgba(194,122,38,${0.10 + rand() * 0.16})`;
      ctx.beginPath();
      ctx.ellipse(x + 8, y - 10, 4 + rand() * 4, 9 + rand() * 7, -0.42 + rand() * 0.35, 0, Math.PI * 2);
      ctx.fill();

      if (rand() > 0.55) {
        ctx.strokeStyle = `rgba(120,72,18,${0.10 + rand() * 0.12})`;
        ctx.beginPath();
        ctx.moveTo(x + 7, y + 10);
        ctx.lineTo(x + 12, y - 9);
        ctx.stroke();
      }
    } else if (landscape === Landscapes.PASTURE) {
      if (rand() > 0.74) {
        const body = 4 + rand() * 5;
        const angle = rand() * Math.PI * 2;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = 'rgba(255,255,238,0.30)';
        ctx.beginPath();
        ctx.ellipse(0, 0, body * 1.45, body * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(62,52,42,0.24)';
        ctx.beginPath();
        ctx.ellipse(body * 1.38, -body * 0.05, body * 0.48, body * 0.40, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(70,55,42,0.20)';
        ctx.lineWidth = 1.2;
        for (const lx of [-body * 0.45, body * 0.45]) {
          ctx.beginPath();
          ctx.moveTo(lx, body * 0.45);
          ctx.lineTo(lx, body * 1.05);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.strokeStyle = `rgba(44,126,54,${0.13 + rand() * 0.18})`;
        ctx.lineWidth = 1 + rand() * 1.6;
        const bladeCount = 2 + Math.floor(rand() * 3);
        for (let b = 0; b < bladeCount; b++) {
          const lean = -8 + rand() * 16;
          ctx.beginPath();
          ctx.moveTo(x + rand() * 10 - 5, y + 8);
          ctx.quadraticCurveTo(x + lean * 0.45, y, x + lean, y - 7 - rand() * 9);
          ctx.stroke();
        }
        if (rand() > 0.58) {
          ctx.fillStyle = rand() > 0.45
            ? `rgba(255,246,174,${0.16 + rand() * 0.18})`
            : `rgba(255,210,235,${0.14 + rand() * 0.18})`;
          ctx.beginPath();
          ctx.arc(x + rand() * 12 - 6, y + rand() * 10 - 5, 2.2 + rand() * 3.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (landscape === Landscapes.MINE) {
      const r = 8 + rand() * 24;
      const sides = 4 + Math.floor(rand() * 4);
      ctx.fillStyle = rand() > 0.45
        ? `rgba(8,14,20,${0.22 + rand() * 0.26})`
        : `rgba(108,126,142,${0.15 + rand() * 0.20})`;
      ctx.beginPath();
      for (let p = 0; p < sides; p++) {
        const a = rand() * 0.4 + (p / sides) * Math.PI * 2;
        const pr = r * (0.65 + rand() * 0.55);
        const px = x + Math.cos(a) * pr;
        const py = y + Math.sin(a) * pr;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      if (rand() > 0.42) {
        const oreGold = rand() > 0.52;
        ctx.strokeStyle = oreGold ? 'rgba(255,220,116,0.30)' : 'rgba(139,226,255,0.34)';
        ctx.lineWidth = 1.2 + rand() * 1.8;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.8, y + rand() * r - r * 0.5);
        ctx.lineTo(x - r * 0.15, y + rand() * r - r * 0.5);
        ctx.lineTo(x + r * 0.8, y + rand() * r - r * 0.5);
        ctx.stroke();

        if (rand() > 0.62) {
          ctx.fillStyle = oreGold ? 'rgba(255,226,120,0.30)' : 'rgba(150,232,255,0.34)';
          ctx.beginPath();
          ctx.arc(x + rand() * r - r * 0.5, y + rand() * r - r * 0.5, 1.5 + rand() * 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (landscape === Landscapes.BOG) {
      const featureRoll = rand();
      if (featureRoll > 0.70) {
        ctx.strokeStyle = `rgba(132,137,66,${0.20 + rand() * 0.22})`;
        ctx.lineWidth = 1.2 + rand() * 1.6;
        const reedCount = 2 + Math.floor(rand() * 3);
        for (let r = 0; r < reedCount; r++) {
          const dx = rand() * 14 - 7;
          const h = 10 + rand() * 18;
          ctx.beginPath();
          ctx.moveTo(x + dx, y + h * 0.35);
          ctx.quadraticCurveTo(x + dx + rand() * 6 - 3, y, x + dx + rand() * 8 - 4, y - h);
          ctx.stroke();
        }
        if (rand() > 0.48) {
          ctx.fillStyle = `rgba(87,58,35,${0.24 + rand() * 0.20})`;
          ctx.beginPath();
          ctx.ellipse(x + rand() * 14 - 7, y - 10 - rand() * 8, 2.4 + rand() * 2.2, 6 + rand() * 5, rand() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (featureRoll > 0.40) {
        const rx = 8 + rand() * 20;
        const ry = 5 + rand() * 13;
        ctx.fillStyle = `rgba(44,24,62,${0.18 + rand() * 0.24})`;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(177,178,94,${0.11 + rand() * 0.18})`;
        ctx.beginPath();
        ctx.ellipse(x, y, 5 + rand() * 13, 3 + rand() * 8, rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        if (rand() > 0.62) {
          ctx.fillStyle = `rgba(213,197,122,${0.16 + rand() * 0.18})`;
          ctx.beginPath();
          ctx.arc(x + rand() * 12 - 6, y + rand() * 10 - 5, 1.8 + rand() * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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

  ctx.save();
  const grainCount = 140 + Math.floor(rand() * 90);
  for (let i = 0; i < grainCount; i++) {
    ctx.globalAlpha = 0.22 + rand() * 0.38;
    ctx.fillStyle = rand() > 0.76 ? theme.light : theme.dark;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 1.4, 1 + rand() * 1.4);
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = Math.max(4, Math.floor(size * 0.03));
  ctx.strokeRect(1, 1, size - 2, size - 2);

  // subtle vignette
  const vignette = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.2, size * 0.5, size * 0.5, size * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  return canvas;
}

function createLandscapeTileTexture(landscape, crowns, seedKey, size = 256) {
  const canvas = createLandscapeTileCanvas(landscape, crowns, seedKey, size);
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
  #topBar;
  #hud;
  #canvasNotice;
  #hudHeader;
  #hudTitle;
  #hudHint;
  #hudBody;
  #miniMapDock;
  #endOverlay;
  #primaryControlsRow;
  #secondaryControlsRow;
  #tertiaryControlsRow;
  #btnRotate;
  #btnSkip;
  #btnUndoRequest;
  #btnNextValid;
  #btnResetTile;
  #btnScores;
  #btnPlace;
  #btnCenter;
  #btnMore;
  #btnLibrary;
  #btnToggleAdvisor;
  #btnToggleMiniMap;
  #btnHighScores;
  #btnRestart;
  #btnEndGame;
  #mobileActions;
  #btnMobileRotate;
  #btnMobileSkip;
  #btnMobileUndo;
  #btnMobileNext;
  #btnMobilePlace;
  #localPlacementDock;
  #btnLocalClear;
  #btnLocalAdvisor;
  #btnLocalPrev;
  #btnLocalNext;
  #btnLocalPlace;
  #localPlacementLabel;
  #miniMapRow;
  /** @type {HTMLCanvasElement[]} */
  #miniMapCanvases = [];

  /** @type {WebGameManager} */
  #game;

  /** @type {GameAdvisor} */
  #advisor = new GameAdvisor();

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

  /** @type {number} */
  #playerCount = 2;

  /** @type {string} */
  #myName = 'Player';

  /** @type {{state:string, attempt?:number, delay?:number} | null} */
  #connStatus = null;

  /** @type {string | null} */
  #roomId = null;

  /** @type {boolean} */
  #homeMode = false;

  /** @type {HTMLDivElement} */
  #startOverlay;

  /** @type {HTMLDivElement} */
  #scoreHistoryOverlay;

  /** @type {{type:string,payload:any}[]} */
  #actionHistory = [];

  /** @type {{requestId:string, requesterIndex:number, targetPlaceId:string | null} | null} */
  #pendingUndoRequest = null;

  /** @type {string | null} */
  #autoDraftInFlightKey = null;

  /** @type {number} */
  #autoDraftClaimHoldUntil = 0;

  /** @type {{x:number,z:number} | null} */
  #autoDraftClaimHoldOrigin = null;

  /** @type {number | null} */
  #autoDraftClaimHoldTimer = null;

  /** @type {string | null} */
  #lobbyNotice = null;

  /** @type {string} */
  #pendingInviteRoom = '';

  /** @type {number | null} */
  #pendingInviteSeed = null;

  /** @type {string} */
  #pendingInviteToken = '';

  /** @type {boolean} */
  #showInviteOptions = false;

  /** @type {string} */
  #placementHint = '';

  /** @type {number | null} */
  #canvasNoticeTimer = null;

  /** @type {boolean} */
  #hudCollapsed = false;

  /** @type {GameState | null} */
  #lastAutoHudPhase = null;

  /** @type {boolean} */
  #showPlacementScores = false;

  /** @type {boolean} */
  #endSummaryCollapsed = false;

  /** @type {boolean} */
  #moreOpen = false;

  /** @type {boolean} */
  #showMiniMap = false;

  /** @type {boolean} */
  #showAdvisor = true;

  /** @type {boolean} */
  #libraryOpen = false;

  /** @type {string | null} */
  #libraryFilter = null;

  /** @type {number | null} */
  #libraryFocusedDominoNumber = null;

  /** @type {boolean} */
  #scoreHistoryOpen = false;

  /** @type {string | null} */
  #scoreHistorySelectedId = null;

  /** @type {string | null} */
  #recordedCompletedGameKey = null;

  /** @type {number | null} */
  #startAttractFocusedDominoNumber = null;

  /** @type {string} */
  #startAttractKey = '';

  /** @type {number} */
  #startAttractStep = 0;

  /** @type {number} */
  #startAttractNextAt = 0;

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
  /** @type {THREE.Group} */
  #scoreBurstGroup;
  /** @type {THREE.Group | null} */
  #currentTileRenderGroup = null;

  /** @type {{object:THREE.Object3D,type:string,basePosition:THREE.Vector3,baseRotation:THREE.Euler,baseScale:THREE.Vector3,phase:number,speed:number,amplitude:number,travel:number,wander:number,tail?:THREE.Object3D,tailBaseRotation?:THREE.Euler,fin?:THREE.Object3D,finBaseRotation?:THREE.Euler,flippers?:{object:THREE.Object3D,baseRotation:THREE.Euler}[],head?:THREE.Object3D,headBasePosition?:THREE.Vector3,headBaseRotation?:THREE.Euler,legs?:{object:THREE.Object3D,baseRotation:THREE.Euler}[],material?:THREE.Material,targetPosition?:THREE.Vector3,targetScale?:THREE.Vector3,targetRotationY?:number,startedAt?:number,duration?:number}[]} */
  #animatedObjects = [];

  /** @type {{group:THREE.Group,startedAt:number,duration:number,baseY:number}[]} */
  #scoreBursts = [];

  /** @type {Map<string, number>} */
  #draftClaimAnimationStartedAt = new Map();

  /** @type {Map<string, {leftX:number,z:number,targetLeftX:number,targetZ:number,owner:number,rowIndex:number,dominoNumber:number}>} */
  #draftClaimAnimationSourceByKey = new Map();

  /** @type {Map<number, {centerX:number,centerZ:number,width:number,height:number}>} */
  #kingdomMatBoundsByPlayer = new Map();

  /** @type {{key:string,spacing:number,origins:{x:number,z:number}[]} | null} */
  #tabletopLayoutCache = null;

  /** @type {{x:number,z:number} | null} */
  #lastCanvasDraftOrigin = null;

  /** @type {{key:string,playerIndex:number,dominoNumber:number,startedAt:number,duration:number,sourceX:number,sourceZ:number,targetX:number,targetZ:number} | null} */
  #placementGhostAnimation = null;

  /** @type {Map<number, {key:string,playerIndex:number,dominoNumber:number,domino:import('../classes/domino.js').Domino,startedAt:number,duration:number,sourceWorldX:number,sourceWorldZ:number,targetWorldX:number,targetWorldZ:number,sourceRotationY:number}>} */
  #placementReturnAnimations = new Map();

  /** @type {Map<string, {key:string,playerIndex:number,dominoNumber:number,domino:import('../classes/domino.js').Domino,startedAt:number,duration:number,sourceWorldX:number,sourceWorldZ:number,targetWorldX:number,targetWorldZ:number,sourceRotationY:number}>} */
  #placementSkipAnimations = new Map();

  /** @type {{object:THREE.Object3D,radiusWorld:number} | null} */
  #canvasPlacementConfirmTarget = null;

  /** @type {{renderBoard:number,renderGhost:number,refreshHud:number}} */
  #perfCounters = { renderBoard: 0, renderGhost: 0, refreshHud: 0 };

  /** @type {Set<string> | null} */
  #perfAnimationTypeFilter = null;

  /** @type {string} */
  #lastGridPresentationKey = '';

  /** @type {number} */
  #placementCacheVersion = 0;

  /** @type {Map<number, {version:number, options:any[]}>} */
  #placementOptionsCache = new Map();

  /** @type {Map<number, {version:number, option:any | null}>} */
  #advisorPlacementCache = new Map();

  /** @type {MediaQueryList | null} */
  #reducedMotionQuery = null;

  /** @type {Map<string, THREE.Texture>} */
  #tileTextureCache = new Map();

  /** @type {Map<string, THREE.MeshStandardMaterial>} */
  #tileMaterialCache = new Map();

  /** @type {{x:number,y:number} | null} */
  #hoverAnchor = null;

  /** @type {{x:number,y:number} | null} */
  #localPlacementFocus = null;

  /** @type {boolean} */
  #isApplyingPlacementOption = false;

  /** @type {number} */
  #placementSelectionSequence = 0;

  /** @type {number} */
  #latestLocalPlacementSelectionId = 0;

  /** @type {Map<number, {playerIndex:number,dominoNumber:number,orientation:number,x:number,y:number,anchorEnd:symbol,t?:number}>} */
  #remotePlacementPreviews = new Map();

  /** @type {string} */
  #lastSentPlacementPreviewKey = '';

  /** @type {boolean} */
  #hoverAnchorAuto = false;

  /** @type {{x:number,y:number,t:number,maxDist2:number} | null} */
  #pointerDown = null;

  /** @type {number | null} */
  #activeTouchPointerId = null;

  /** @type {{startedAt:number,duration:number,startPosition:THREE.Vector3,endPosition:THREE.Vector3,startTarget:THREE.Vector3,endTarget:THREE.Vector3,startViewSize:number,endViewSize:number} | null} */
  #cameraTransition = null;

  // Controls how wide the view is in world units (before aspect).
  static #VIEW_SIZE_CLOSE = 4.4;
  static #VIEW_SIZE_MID = 5.8;
  static #VIEW_SIZE_FAR = 7.5;
  static #VIEW_SIZE = GameLayout.#VIEW_SIZE_FAR;

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

  #viewSizeForBoardSize(boardSize) {
    if (!boardSize) return GameLayout.#VIEW_SIZE_FAR;

    const width = (boardSize.xMax - boardSize.xMin) + 1;
    const height = (boardSize.yMax - boardSize.yMin) + 1;
    const footprint = Math.max(width, height);

    if (footprint <= 2) return GameLayout.#VIEW_SIZE_CLOSE;
    if (footprint <= 4) return GameLayout.#VIEW_SIZE_MID;
    return GameLayout.#VIEW_SIZE_FAR;
  }

  #tabletopSpreadProgress() {
    const g = this.#game;
    if (!g?.players?.length) return 0;

    const { round, total } = this.#roundProgress(g);
    const roundProgress = total <= 1 ? 0 : (round - 1) / Math.max(1, total - 1);
    const draftProgress = g.state === GameState.DRAFT
      ? (g.pickCursor ?? 0) / Math.max(1, g.pickOrder?.length ?? g.currentDraft?.length ?? 1)
      : 0.55;

    let footprintProgress = 0;
    for (const player of g.players) {
      const boardSize = player.board?.boardSize;
      const maxBoardSize = Math.max(1, player.board?.maxBoardSize ?? 7);
      if (!boardSize) continue;
      const width = (boardSize.xMax - boardSize.xMin) + 1;
      const height = (boardSize.yMax - boardSize.yMin) + 1;
      footprintProgress = Math.max(footprintProgress, Math.max(width, height) / maxBoardSize);
    }

    return Math.max(0, Math.min(1, Math.max(roundProgress + draftProgress * 0.16, footprintProgress * 0.72)));
  }

  #tabletopBoardSpacing() {
    const count = Math.max(1, this.#game?.players?.length ?? 2);
    const progress = this.#tabletopSpreadProgress();
    const vertical = count === 2 || this.#useVerticalTabletopLayout();
    const base = vertical
      ? count <= 2 ? 8.2 : 9.4
      : count <= 2 ? 12.4 : 13.8;
    const far = vertical
      ? count <= 2 ? 14.2 : 15.4
      : count <= 2 ? 18.0 : 18.8;
    let spacing = base + (far - base) * progress;
    const players = this.#game?.players ?? [];
    if (players.length < 2) return spacing;

    const matBounds = players.map((player, playerIndex) => {
      const boardManager = player?.board;
      if (!boardManager) return null;
      return this.#preservedKingdomMatBounds(boardManager, playerIndex);
    });

    for (let guard = 0; guard < 32; guard++) {
      let hasOverlap = false;
      for (let i = 0; i < players.length; i++) {
        const a = matBounds[i];
        if (!a) continue;
        const aOrigin = this.#boardOriginForPlayerAtSpacing(i, count, spacing);
        const aRect = this.#matWorldRect(a, aOrigin, 0.18);
        for (let j = i + 1; j < players.length; j++) {
          const b = matBounds[j];
          if (!b) continue;
          const bOrigin = this.#boardOriginForPlayerAtSpacing(j, count, spacing);
          const bRect = this.#matWorldRect(b, bOrigin, 0.18);
          if (this.#rectOverlapArea(aRect, bRect) > 0.001) {
            hasOverlap = true;
            break;
          }
        }
        if (hasOverlap) break;
      }
      if (!hasOverlap) return spacing;
      spacing += 0.80;
    }

    return spacing;
  }

  #invalidateTabletopLayoutCache() {
    this.#tabletopLayoutCache = null;
  }

  #tabletopLayoutCacheKey() {
    const g = this.#game;
    const players = g?.players ?? [];
    const state = g?.state?.description ?? String(g?.state ?? '');
    const viewport = typeof window === 'undefined'
      ? 'server'
      : `${window.innerWidth || 0}x${window.innerHeight || 0}`;
    const boardKey = players.map((player, playerIndex) => {
      const board = player?.board;
      const size = board?.boardSize;
      const preserved = this.#kingdomMatBoundsByPlayer.get(playerIndex);
      return [
        size?.xMin ?? 0,
        size?.xMax ?? 0,
        size?.yMin ?? 0,
        size?.yMax ?? 0,
        board?.maxBoardSize ?? 0,
        preserved?.centerX?.toFixed?.(3) ?? '',
        preserved?.centerZ?.toFixed?.(3) ?? '',
        preserved?.width?.toFixed?.(3) ?? '',
        preserved?.height?.toFixed?.(3) ?? '',
      ].join(',');
    }).join(';');
    return [
      players.length,
      viewport,
      this.#useVerticalTabletopLayout() ? 1 : 0,
      state,
      g?.round ?? 0,
      g?.pickCursor ?? 0,
      this.#placementPlayerIndex() ?? -1,
      this.#placementCacheVersion,
      boardKey,
    ].join('|');
  }

  #currentTabletopLayout() {
    const count = Math.max(1, this.#game?.players?.length ?? 2);
    const key = this.#tabletopLayoutCacheKey();
    if (this.#tabletopLayoutCache?.key === key) return this.#tabletopLayoutCache;

    const spacing = this.#tabletopBoardSpacing();
    const origins = Array.from({ length: count }, (_, playerIndex) => (
      this.#boardOriginForPlayerAtSpacing(playerIndex, count, spacing)
    ));
    this.#tabletopLayoutCache = { key, spacing, origins };
    return this.#tabletopLayoutCache;
  }

  #useVerticalTabletopLayout() {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    return w <= 760 || h > w * 1.12;
  }

  #screenVerticalTabletopAxis() {
    const unit = 1 / Math.sqrt(2);
    return { x: unit, z: unit };
  }

  #boardOriginForPlayer(playerIndex = 0) {
    const count = Math.max(1, this.#game?.players?.length ?? 2);
    const idx = Math.max(0, Math.min(playerIndex ?? 0, count - 1));
    return this.#currentTabletopLayout().origins[idx] ?? { x: 0, z: 0 };
  }

  #boardOriginForPlayerAtSpacing(playerIndex = 0, count = Math.max(1, this.#game?.players?.length ?? 2), spacing = this.#tabletopBoardSpacing()) {
    const idx = Math.max(0, Math.min(playerIndex ?? 0, count - 1));

    if (count === 1) return { x: 0, z: 0 };
    if (count === 2) {
      const axis = this.#screenVerticalTabletopAxis();
      const side = idx === 0 ? -1 : 1;
      return { x: axis.x * side * spacing / 2, z: axis.z * side * spacing / 2 };
    }
    if (count === 3) {
      if (this.#useVerticalTabletopLayout()) {
        return [
          { x: 0, z: -spacing },
          { x: 0, z: 0 },
          { x: 0, z: spacing },
        ][idx];
      }
      return [
        { x: -spacing / 2, z: -spacing / 2 },
        { x: spacing / 2, z: -spacing / 2 },
        { x: 0, z: spacing / 2 },
      ][idx];
    }
    return [
      { x: -spacing / 2, z: -spacing / 2 },
      { x: spacing / 2, z: -spacing / 2 },
      { x: -spacing / 2, z: spacing / 2 },
      { x: spacing / 2, z: spacing / 2 },
    ][idx % 4];
  }

  #focusedBoardOrigin() {
    return this.#boardOriginForPlayer(this.#focusedPlayerIndex);
  }

  #placementBoardOrigin() {
    const idx = this.#game?.state === GameState.PLACE
      ? this.#placementPlayerIndex()
      : this.#focusedPlayerIndex;
    return this.#boardOriginForPlayer(idx ?? this.#focusedPlayerIndex);
  }

  #addTileObjects(...objects) {
    const group = this.#currentTileRenderGroup || this.#tilesGroup;
    group.add(...objects);
  }

  #registerAnimatedObject(object, type, options = {}) {
    if (!object || this.#prefersReducedMotion()) return;
    if (this.#perfAnimationTypeFilter && !this.#perfAnimationTypeFilter.has(type)) return;
    this.#animatedObjects.push({
      object,
      type,
      basePosition: object.position.clone(),
      baseRotation: object.rotation.clone(),
      baseScale: object.scale.clone(),
      phase: options.phase ?? 0,
      speed: options.speed ?? 1,
      amplitude: options.amplitude ?? 1,
      travel: options.travel ?? 0.035,
      wander: options.wander ?? 0.014,
      tail: options.tail,
      tailBaseRotation: options.tail?.rotation.clone(),
      fin: options.fin,
      finBaseRotation: options.fin?.rotation.clone(),
      flippers: (options.flippers ?? []).map((object) => ({
        object,
        baseRotation: object.rotation.clone(),
      })),
      head: options.head,
      headBasePosition: options.head?.position.clone(),
      headBaseRotation: options.head?.rotation.clone(),
      legs: (options.legs ?? []).map((object) => ({
        object,
        baseRotation: object.rotation.clone(),
      })),
      material: options.material,
      targetPosition: options.targetPosition?.clone?.(),
      targetScale: options.targetScale?.clone?.(),
      targetRotationY: options.targetRotationY,
      startedAt: options.startedAt,
      duration: options.duration,
    });
  }

  #prepareObjectMaterialsForOpacity(object) {
    if (!object) return;
    object.traverse((node) => {
      if (!node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const cloned = materials.map((material) => {
        const next = material.clone();
        next.transparent = true;
        next.depthWrite = false;
        next.userData.baseOpacity = Number.isFinite(material.opacity) ? material.opacity : 1;
        return next;
      });
      node.material = Array.isArray(node.material) ? cloned : cloned[0];
    });
  }

  #setObjectOpacity(object, opacity) {
    const nextOpacity = Math.max(0, Math.min(1, opacity));
    object.traverse((node) => {
      if (!node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        const baseOpacity = Number.isFinite(material.userData?.baseOpacity)
          ? material.userData.baseOpacity
          : Number.isFinite(material.opacity)
            ? material.opacity
            : 1;
        material.opacity = baseOpacity * nextOpacity;
      }
    });
  }

  #updateAnimatedObjects(now = performance.now()) {
    if (!this.#animatedObjects.length) return;
    if (this.#prefersReducedMotion()) return;

    const seconds = now / 1000;
    for (const item of this.#animatedObjects) {
      const object = item.object;
      if (!object.parent) continue;
      const t = seconds * item.speed + item.phase;

      if (item.type === 'fish') {
        const swim = Math.sin(t);
        const drift = Math.cos(t * 0.72 + item.phase * 0.37);
        const facing = item.baseRotation.y;
        const forwardX = Math.sin(facing);
        const forwardZ = Math.cos(facing);
        const sideX = Math.cos(facing);
        const sideZ = -Math.sin(facing);
        const travel = item.travel * item.amplitude;
        const wander = item.wander * item.amplitude;
        object.position.set(
          item.basePosition.x + forwardX * swim * travel + sideX * drift * wander,
          item.basePosition.y + Math.sin(t * 1.7) * 0.006,
          item.basePosition.z + forwardZ * swim * travel + sideZ * drift * wander
        );
        object.rotation.y = item.baseRotation.y + Math.sin(t * 1.3) * 0.18;
        if (item.tail) {
          item.tail.rotation.y = (item.tailBaseRotation?.y ?? Math.PI * 0.50) + Math.sin(t * 6.2) * 0.44;
        }
        if (item.fin) {
          item.fin.rotation.z = (item.finBaseRotation?.z ?? 0) + Math.cos(t * 4.8) * 0.26;
        }
      } else if (item.type === 'deepFish') {
        const swim = Math.sin(t * 0.76);
        const drift = Math.cos(t * 0.52 + item.phase);
        object.position.x = item.basePosition.x + swim * item.travel * item.amplitude;
        object.position.z = item.basePosition.z + drift * item.wander * item.amplitude;
        object.rotation.y = item.baseRotation.y + Math.sin(t * 0.68) * 0.10;
      } else if (item.type === 'turtle') {
        const glide = Math.sin(t * 0.58);
        const drift = Math.cos(t * 0.42 + item.phase);
        const dive = (Math.sin(t * 0.62 - Math.PI * 0.32) + 1) * 0.5;
        const facing = item.baseRotation.y;
        object.position.x = item.basePosition.x + Math.sin(facing) * glide * item.travel + Math.cos(facing) * drift * item.wander;
        object.position.y = item.basePosition.y + Math.sin(t * 1.15) * 0.005 - dive * 0.026 * item.amplitude;
        object.position.z = item.basePosition.z + Math.cos(facing) * glide * item.travel - Math.sin(facing) * drift * item.wander;
        object.rotation.x = item.baseRotation.x + Math.sin(t * 0.62) * 0.035 + dive * 0.10 * item.amplitude;
        object.rotation.y = item.baseRotation.y + Math.sin(t * 0.72) * 0.12;
        for (let i = 0; i < (item.flippers?.length ?? 0); i++) {
          const flipper = item.flippers[i];
          flipper.object.rotation.y = flipper.baseRotation.y + Math.sin(t * 2.8 + i * 0.9) * 0.18;
        }
      } else if (item.type === 'buoy') {
        object.position.y = item.basePosition.y + Math.sin(t) * 0.014 * item.amplitude;
        object.rotation.x = item.baseRotation.x + Math.sin(t * 0.78) * 0.045 * item.amplitude;
        object.rotation.z = item.baseRotation.z + Math.cos(t * 0.88) * 0.045 * item.amplitude;
      } else if (item.type === 'boat') {
        object.position.y = item.basePosition.y + Math.sin(t) * 0.010 * item.amplitude;
        object.rotation.x = item.baseRotation.x + Math.sin(t * 0.86) * 0.030 * item.amplitude;
        object.rotation.z = item.baseRotation.z + Math.cos(t * 0.72) * 0.050 * item.amplitude;
      } else if (item.type === 'lighthouseBeam') {
        object.rotation.y = item.baseRotation.y + Math.sin(t) * 0.42 * item.amplitude;
        if (item.material) {
          item.material.opacity = 0.07 + (Math.sin(t * 1.7) + 1) * 0.025;
        }
      } else if (item.type === 'sheep') {
        const clamp01 = (value) => Math.max(0, Math.min(1, value));
        const snap = (value) => {
          const v = clamp01(value);
          return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
        };
        const cycle = ((t % 1) + 1) % 1;
        const headDrop = snap((cycle - 0.22) / 0.07);
        const headLift = snap((cycle - 0.56) / 0.07);
        const chewFrame = cycle > 0.32 && cycle < 0.52
          ? Math.floor((cycle - 0.32) / 0.070) % 2
          : 0;
        const graze = Math.max(0, Math.min(1, headDrop - headLift)) * (chewFrame ? 0.82 : 1);
        const walkProgress = clamp01((cycle - 0.78) / 0.14);
        const walkActive = cycle >= 0.78 && cycle < 0.92 ? 1 : 0;
        const stepFrame = walkActive ? Math.floor(walkProgress * 4) : 0;
        const step = walkActive ? [-0.45, 0.20, 0.46, -0.16][stepFrame] ?? 0 : 0;
        const facing = item.baseRotation.y;
        object.position.x = item.basePosition.x + Math.sin(facing) * step * item.travel * item.amplitude;
        object.position.y = item.basePosition.y + walkActive * (stepFrame % 2 ? 0.003 : 0.001) * item.amplitude;
        object.position.z = item.basePosition.z + Math.cos(facing) * step * item.travel * item.amplitude;
        object.rotation.y = item.baseRotation.y + walkActive * (stepFrame % 2 ? 0.026 : -0.018) * item.amplitude;
        if (item.head) {
          item.head.position.y = (item.headBasePosition?.y ?? 0) - graze * 0.062 * item.amplitude;
          item.head.position.x = (item.headBasePosition?.x ?? 0) + graze * 0.030 * item.amplitude;
          item.head.rotation.z = (item.headBaseRotation?.z ?? 0) - graze * 0.56 * item.amplitude;
        }
        for (let i = 0; i < (item.legs?.length ?? 0); i++) {
          const leg = item.legs[i];
          const side = i % 2 === stepFrame % 2 ? 1 : -1;
          leg.object.rotation.x = leg.baseRotation.x + walkActive * side * 0.12 * item.amplitude;
        }
      } else if (item.type === 'gate') {
        object.rotation.y = item.baseRotation.y + Math.sin(t) * 0.16 * item.amplitude;
      } else if (item.type === 'wheat') {
        const gust = Math.sin(t + item.basePosition.x * 0.35 + item.basePosition.z * 0.62);
        const shimmer = Math.sin(t * 1.7 + item.phase) * 0.35;
        object.rotation.x = item.baseRotation.x + (gust * 0.055 + shimmer * 0.018) * item.amplitude;
        object.rotation.z = item.baseRotation.z + (gust * 0.095 + shimmer * 0.030) * item.amplitude;
      } else if (item.type === 'advisor') {
        object.position.y = item.basePosition.y + Math.sin(t) * 0.026 * item.amplitude;
        object.rotation.y = item.baseRotation.y + Math.sin(t * 0.62) * 0.08 * item.amplitude;
      } else if (item.type === 'draftClaim' && item.targetPosition && item.startedAt != null) {
        const progress = Math.max(0, Math.min(1, (now - item.startedAt) / Math.max(1, item.duration ?? 650)));
        const eased = 1 - Math.pow(1 - progress, 3);
        object.position.lerpVectors(item.basePosition, item.targetPosition, eased);
        object.rotation.y = item.baseRotation.y + Math.sin(progress * Math.PI) * 0.06;
      } else if (item.type === 'draftTray' && item.targetPosition && item.startedAt != null) {
        const progress = Math.max(0, Math.min(1, (now - item.startedAt) / Math.max(1, item.duration ?? 560)));
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        object.position.lerpVectors(item.basePosition, item.targetPosition, eased);
      } else if (item.type === 'kingdomMat' && item.targetPosition && item.targetScale && item.startedAt != null) {
        const progress = Math.max(0, Math.min(1, (now - item.startedAt) / Math.max(1, item.duration ?? 520)));
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        object.position.lerpVectors(item.basePosition, item.targetPosition, eased);
        object.scale.lerpVectors(item.baseScale, item.targetScale, eased);
      } else if (item.type === 'placementGhost' && item.targetPosition && item.startedAt != null) {
        const progress = Math.max(0, Math.min(1, (now - item.startedAt) / Math.max(1, item.duration ?? 360)));
        const eased = 1 - Math.pow(1 - progress, 3);
        object.position.lerpVectors(item.basePosition, item.targetPosition, eased);
        object.position.y = item.basePosition.y + Math.sin(progress * Math.PI) * 0.12;
        object.rotation.y = item.baseRotation.y + Math.sin(progress * Math.PI) * 0.035;
      } else if (item.type === 'placementReturn' && item.targetPosition && item.startedAt != null) {
        const progress = Math.max(0, Math.min(1, (now - item.startedAt) / Math.max(1, item.duration ?? 420)));
        const eased = 1 - Math.pow(1 - progress, 3);
        object.position.lerpVectors(item.basePosition, item.targetPosition, eased);
        object.position.y = item.basePosition.y + Math.sin(progress * Math.PI) * 0.16;
        object.rotation.y = item.baseRotation.y + ((item.targetRotationY ?? 0) - item.baseRotation.y) * eased;
      } else if (item.type === 'skipDiscard' && item.targetPosition && item.startedAt != null) {
        const progress = Math.max(0, Math.min(1, (now - item.startedAt) / Math.max(1, item.duration ?? 560)));
        const eased = 1 - Math.pow(1 - progress, 3);
        const fade = Math.max(0, 1 - eased);
        object.position.lerpVectors(item.basePosition, item.targetPosition, eased);
        object.position.y = item.basePosition.y + Math.sin(progress * Math.PI) * 0.34 + eased * 0.10;
        object.rotation.y = item.baseRotation.y + ((item.targetRotationY ?? item.baseRotation.y + 0.42) - item.baseRotation.y) * eased;
        const scale = Math.max(0.10, 1 - eased * 0.78);
        object.scale.setScalar(scale);
        this.#setObjectOpacity(object, fade);
      }
    }
  }

  #frameToBoardSize(boardSize, pad = 2, origin = { x: 0, z: 0 }, animate = false, minViewSize = null) {
    if (!this.#camera || !this.#controls) return;
    if (!boardSize) return;

    const startPosition = this.#camera.position.clone();
    const startTarget = this.#controls.target.clone();
    const startViewSize = this.#viewSize;

    const minX = boardSize.xMin - pad;
    const maxX = boardSize.xMax + pad;
    const minZ = boardSize.yMin - pad;
    const maxZ = boardSize.yMax + pad;

    const centerX = origin.x + (minX + maxX) / 2;
    const centerZ = origin.z + (minZ + maxZ) / 2;

    const rect = this.#canvasHost.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const aspect = w / h;

    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);

    // Fit both X and Z extents for an orthographic camera (size is vertical half-extent).
    const neededVertical = Math.max(spanZ / 2, (spanX / 2) / aspect);
    this.#viewSize = Math.max(minViewSize ?? this.#viewSizeForBoardSize(boardSize), neededVertical);

    this.#controls.target.set(centerX, 0, centerZ);

    // Keep a small tilt to avoid the straight-down singularity.
    const span = Math.max(spanX, spanZ);
    const height = Math.max(10, 8 + span * 0.9);
    const tilt = Math.max(6, 5 + span * 0.45);
    this.#camera.position.set(centerX + tilt, height, centerZ + tilt);
    this.#camera.lookAt(centerX, 0, centerZ);
    this.#camera.left = -this.#viewSize * aspect;
    this.#camera.right = this.#viewSize * aspect;
    this.#camera.top = this.#viewSize;
    this.#camera.bottom = -this.#viewSize;
    this.#camera.updateProjectionMatrix();
    this.#camera.updateMatrixWorld();

    // Center against the usable canvas area after persistent overlays have
    // claimed space at the edges.
    const hostRect = this.#canvasHost.getBoundingClientRect();
    let visibleLeft = 0;
    let visibleTop = 0;
    let visibleRight = w;
    let visibleBottom = h;
    const gap = 8;
    const overlayRect = (el) => {
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      return {
        left: Math.max(0, r.left - hostRect.left),
        right: Math.min(w, r.right - hostRect.left),
        top: Math.max(0, r.top - hostRect.top),
        bottom: Math.min(h, r.bottom - hostRect.top),
      };
    };
    const insetTop = (el) => {
      const r = overlayRect(el);
      if (r) visibleTop = Math.max(visibleTop, r.bottom + gap);
    };
    const insetBottom = (el) => {
      const r = overlayRect(el);
      if (r) visibleBottom = Math.min(visibleBottom, r.top - gap);
    };
    const insetLeft = (el) => {
      const r = overlayRect(el);
      if (r) visibleLeft = Math.max(visibleLeft, r.right + gap);
    };
    const insetRight = (el) => {
      const r = overlayRect(el);
      if (r) visibleRight = Math.min(visibleRight, r.left - gap);
    };
    const mobile = this.#isMobileViewport();
    insetTop(this.#topBar);
    if (this.#isSplitViewport()) {
      insetBottom(this.#miniMapDock);
      insetBottom(this.#hud);
    } else if (mobile) {
      insetTop(this.#miniMapDock);
      insetBottom(this.#hud);
    } else {
      insetLeft(this.#hud);
    }
    insetBottom(this.#primaryControlsRow);
    insetBottom(this.#localPlacementDock);
    if (this.#moreOpen) insetRight(this.#tertiaryControlsRow);
    if (this.#isStartAttractMode()) {
      const startCard = this.#startOverlay?.querySelector('.startCard');
      if (this.#isMobileViewport()) insetBottom(startCard);
      else insetRight(startCard);
    }

    const usableW = Math.max(120, visibleRight - visibleLeft);
    const usableH = Math.max(120, visibleBottom - visibleTop);
    if (usableW > 0 && usableH > 0) {
      const dxPx = (visibleLeft + usableW / 2) - w / 2;
      const dyPx = (visibleTop + usableH / 2) - h / 2;
      const worldPerPxX = (this.#camera.right - this.#camera.left) / w;
      const worldPerPxY = (this.#camera.top - this.#camera.bottom) / h;
      const right = new THREE.Vector3().setFromMatrixColumn(this.#camera.matrixWorld, 0).normalize();
      const up = new THREE.Vector3().setFromMatrixColumn(this.#camera.matrixWorld, 1).normalize();
      this.#camera.position.addScaledVector(right, -dxPx * worldPerPxX);
      this.#controls.target.addScaledVector(right, -dxPx * worldPerPxX);
      this.#camera.position.addScaledVector(up, dyPx * worldPerPxY);
      this.#controls.target.addScaledVector(up, dyPx * worldPerPxY);
    }

    const endPosition = this.#camera.position.clone();
    const endTarget = this.#controls.target.clone();
    const endViewSize = this.#viewSize;

    if (animate) {
      this.#camera.position.copy(startPosition);
      this.#controls.target.copy(startTarget);
      this.#viewSize = startViewSize;
      this.#camera.lookAt(this.#controls.target);
      this.#camera.updateMatrixWorld();
      this.#onResize();

      const distance = startTarget.distanceTo(endTarget);
      this.#cameraTransition = {
        startedAt: performance.now(),
        duration: Math.max(420, Math.min(920, 360 + distance * 42)),
        startPosition,
        endPosition,
        startTarget,
        endTarget,
        startViewSize,
        endViewSize,
      };
      return;
    }

    this.#cameraTransition = null;
    this.#controls.update();
    this.#onResize();
  }

  #cancelCameraTransition() {
    this.#cameraTransition = null;
    if (this.#controls) this.#controls.update();
  }

  #updateCameraTransition() {
    if (!this.#cameraTransition || !this.#camera || !this.#controls) return;

    const now = performance.now();
    const rawT = (now - this.#cameraTransition.startedAt) / this.#cameraTransition.duration;
    const t = Math.max(0, Math.min(1, rawT));
    const eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    this.#camera.position.lerpVectors(
      this.#cameraTransition.startPosition,
      this.#cameraTransition.endPosition,
      eased
    );
    this.#controls.target.lerpVectors(
      this.#cameraTransition.startTarget,
      this.#cameraTransition.endTarget,
      eased
    );
    this.#viewSize = this.#cameraTransition.startViewSize
      + (this.#cameraTransition.endViewSize - this.#cameraTransition.startViewSize) * eased;

    this.#camera.lookAt(this.#controls.target);
    this.#camera.updateMatrixWorld();
    this.#onResize();

    if (t >= 1) {
      this.#camera.position.copy(this.#cameraTransition.endPosition);
      this.#controls.target.copy(this.#cameraTransition.endTarget);
      this.#viewSize = this.#cameraTransition.endViewSize;
      this.#cameraTransition = null;
      this.#camera.lookAt(this.#controls.target);
      this.#camera.updateMatrixWorld();
      this.#controls.update();
      this.#onResize();
    }
  }

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  async runPerformanceScenario(name = 'late-placement', options = {}) {
    if (name === 'playthrough') {
      return this.#runPlaythroughPerformanceScenario(options);
    }
    if (name === 'table-motion') {
      return this.#runTableMotionPerformanceScenario(options);
    }
    if (name !== 'late-placement') {
      throw new Error(`Unknown performance scenario: ${name}`);
    }
    return this.#runLatePlacementPerformanceScenario(options);
  }

  connectedCallback() {
    this.#buildDom();
    this.#showAdvisor = this.#loadAdvisorVisibility();
    const urlParams = new URL(location.href).searchParams;
    this.#libraryOpen = urlParams.get('library') === '1';
    const libraryFocus = Number(urlParams.get('focus'));
    if (this.#libraryOpen && Number.isInteger(libraryFocus) && this.#dominoLibraryPlacementByNumber(libraryFocus)) {
      this.#libraryFocusedDominoNumber = libraryFocus;
    }
    this.#safeInitThree();
    if (this.#threeOk) this.#wireEvents();
    this.#initMultiplayer();
    this.#refreshHud();
    if (this.#threeOk) {
      this.#renderBoard();
      if (this.#libraryOpen && this.#libraryFocusedDominoNumber != null) {
        this.#centerOnLibraryDomino(this.#libraryFocusedDominoNumber);
      } else if (this.#isStartAttractMode()) {
        this.#syncStartAttractCamera(true);
      } else {
        this.#centerOnFocusedBoard();
      }
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
      .canvasTurn.show { display: none; }
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
        bottom: var(--placement-notice-bottom, 76px);
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
        z-index: 8;
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
      .localPlacementDock {
        position: absolute;
        left: var(--placement-dock-left, 50%);
        right: auto;
        top: auto;
        bottom: var(--placement-dock-bottom, 12px);
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 5px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(20, 22, 28, 0.88);
        backdrop-filter: blur(8px);
        box-shadow: 0 8px 28px rgba(0,0,0,0.34);
        transform: translateX(-50%);
        z-index: 7;
      }
      .localPlacementDock[hidden] { display: none !important; }
      .localPlacementDock button {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        padding: 0;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(255,255,255,0.08);
        color: #e9eef5;
        font-size: 16px;
        font-weight: 900;
        line-height: 1;
      }
      .localPlacementDock button:disabled {
        opacity: 0.45;
      }
      .localPlacementDock .localPlace {
        border-color: rgba(115, 232, 150, 0.78);
        background: rgba(28, 91, 57, 0.94);
        color: #d7ffe6;
      }
      .localPlacementDock .localClear {
        color: #ffd2d2;
        background: rgba(78, 31, 31, 0.82);
      }
      .localPlacementDock .localAdvisor {
        width: auto;
        min-width: 62px;
        padding: 0 9px;
        border-color: rgba(255, 215, 106, 0.46);
        background: rgba(74, 52, 16, 0.80);
        color: #ffe59a;
        font-size: 11px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .localPlacementDock.isAdvisorPlacement {
        border-color: rgba(255, 215, 106, 0.50);
        box-shadow: 0 0 0 2px rgba(255, 215, 106, 0.08), 0 8px 28px rgba(0,0,0,0.34);
      }
      .localPlacementLabel {
        min-width: 34px;
        text-align: center;
        color: rgba(233,238,245,0.88);
        font-size: 12px;
        font-weight: 900;
      }
      .topBar {
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        background: rgba(20, 22, 28, 0.86);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 10px;
        padding: 8px 10px;
        color: #e9eef5;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        backdrop-filter: blur(8px);
        z-index: 5;
      }
      .topBar h2 {
        margin: 0;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.2px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hud {
        position: absolute;
        box-sizing: border-box;
        top: 72px;
        left: 12px;
        width: min(380px, calc(100vw - 24px));
        max-height: calc(100dvh - 150px);
        background: rgba(20, 22, 28, 0.64);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 10px;
        padding: 10px;
        color: #e9eef5;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        backdrop-filter: blur(6px);
        touch-action: manipulation;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
        z-index: 5;
      }
      .root.isLibraryMode .hud {
        width: min(340px, calc(100vw - 24px));
        max-height: calc(100dvh - 168px);
      }
      .root.isLibraryMode .controlsTertiary {
        top: 58px;
        right: 12px;
        min-width: 160px;
      }
      .root.isLibraryMode .controlsSecondary {
        top: 12px;
        right: 12px;
        min-width: 92px;
      }
      .librarySummary {
        display: grid;
        gap: 8px;
      }
      .libraryKicker {
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(233,238,245,0.66);
      }
      .libraryCopy {
        margin: 0;
        color: rgba(233,238,245,0.78);
        font-size: 12px;
        line-height: 1.35;
      }
      .libraryStats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px;
      }
      .libraryStats.lifecycle {
        grid-template-columns: 1fr;
      }
      .libraryStats.lifecycle .libraryStat {
        padding: 6px 8px;
      }
      .libraryFilter {
        width: 100%;
        min-height: 32px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        text-align: left;
      }
      .libraryFilter.active {
        border-color: rgba(255,255,255,0.36);
        background: rgba(255,255,255,0.16);
        box-shadow: 0 0 0 2px rgba(255,255,255,0.08);
      }
      .libraryStat {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 7px;
        border-radius: 8px;
        background: rgba(255,255,255,0.06);
        font-size: 12px;
        font-weight: 800;
      }
      .libraryStat span:first-child {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-width: 0;
      }
      .librarySwatch {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        flex: 0 0 auto;
        box-shadow: 0 0 0 1px rgba(255,255,255,0.20);
      }
      .hudHeader { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
      .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
      .controlsPrimary {
        position: absolute;
        left: 50%;
        bottom: 12px;
        transform: translateX(-50%);
        display: grid;
        grid-template-columns: minmax(128px, 1fr) minmax(128px, 1fr);
        gap: 8px;
        width: min(520px, calc(100vw - 24px));
        padding: 8px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(20,22,28,0.82);
        backdrop-filter: blur(8px);
        z-index: 5;
      }
      .controlsPrimary.skipOnly { grid-template-columns: 1fr; }
      .controlsSecondary {
        position: absolute;
        top: 12px;
        right: 12px;
        display: flex;
        gap: 6px;
        flex-direction: column;
        align-items: stretch;
        min-width: 92px;
        padding: 6px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(20,22,28,0.72);
        backdrop-filter: blur(8px);
        z-index: 5;
      }
      .controlsTertiary {
        position: absolute;
        top: 58px;
        right: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 150px;
        padding: 8px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(20,22,28,0.92);
        backdrop-filter: blur(8px);
        z-index: 7;
      }
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
      .iconAction {
        min-width: 36px;
        min-height: 34px;
        padding: 6px 8px;
      }
      .primaryAction {
        border-color: rgba(115, 232, 150, 0.75);
        background: rgba(35, 110, 72, 0.72);
        color: #e8fff0;
      }
      .primaryAction:hover { background: rgba(44, 132, 85, 0.84); }
      .secondaryAction {
        width: 100%;
        min-height: 34px;
        display: grid;
        place-items: center;
        padding: 5px 8px;
        font-size: 12px;
        color: rgba(233,238,245,0.82);
      }
      .secondaryAction.active {
        border-color: rgba(126, 192, 255, 0.70);
        background: rgba(38, 81, 128, 0.66);
        color: #d8ecff;
      }
      .dangerAction {
        border-color: rgba(255, 201, 120, 0.70);
        background: rgba(73, 53, 24, 0.72);
        color: #ffe7bc;
      }
      .destructiveAction {
        border-color: rgba(255, 130, 130, 0.55);
        background: rgba(76, 30, 30, 0.42);
        color: #ffd2d2;
      }
      [hidden] { display: none !important; }
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
      .phaseSummary {
        display: grid;
        gap: 6px;
        margin-bottom: 6px;
      }
      .roundProgress {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 8px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.055);
        color: rgba(233,238,245,0.82);
        font-size: 11px;
        font-weight: 850;
      }
      .roundPips {
        display: flex;
        align-items: center;
        gap: 3px;
        min-width: 0;
      }
      .roundPip {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: rgba(233,238,245,0.18);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.10);
      }
      .roundPip.done {
        background: rgba(126, 192, 255, 0.48);
      }
      .roundPip.current {
        background: rgba(255, 215, 106, 0.96);
        box-shadow: 0 0 0 2px rgba(255, 215, 106, 0.15), 0 0 8px rgba(255, 215, 106, 0.35);
      }
      .draftTurnBanner {
        display: grid;
        gap: 2px;
        padding: 8px 9px;
        border-radius: 9px;
        border: 1px solid rgba(136, 186, 255, 0.38);
        background: rgba(41, 68, 116, 0.24);
        color: #d8ecff;
      }
      .draftTurnBanner.isMine {
        border-color: rgba(118, 255, 181, 0.62);
        background: rgba(38, 136, 87, 0.30);
        color: #d9ffeb;
        box-shadow: 0 0 0 2px rgba(118, 255, 181, 0.08), 0 8px 22px rgba(0,0,0,0.20);
      }
      .draftTurnBanner.isBackToBack {
        box-shadow: 0 0 0 2px rgba(255, 215, 106, 0.10), 0 8px 22px rgba(0,0,0,0.20);
      }
      .draftTurnBanner strong {
        font-size: 13px;
        line-height: 1.2;
      }
      .draftTurnMeta {
        font-size: 11px;
        font-weight: 750;
        color: rgba(233,238,245,0.72);
      }
      .draftList {
        margin-top: 6px;
        display: grid;
        grid-template-columns: 1fr;
        gap: 3px;
      }
      .draftItem {
        box-sizing: border-box;
        width: 100%;
        position: relative;
        display: grid;
        grid-template-columns: 28px max-content 28px;
        justify-content: center;
        place-items: center;
        min-height: 52px;
        gap: 4px;
        padding: 1px 3px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.06);
        background: transparent;
        color: #e9eef5;
        cursor: pointer;
        font: inherit;
      }
      .draftTurnSlot,
      .draftClaimSlot {
        display: grid;
        place-items: center;
        width: 100%;
        min-height: 30px;
      }
      .draftClaimSlot {
        min-width: 28px;
      }
      .draftPlayerToken {
        display: grid;
        place-items: center;
        position: relative;
        width: 25px;
        height: 31px;
        color: transparent;
        font-size: 0;
        line-height: 0;
        filter: drop-shadow(0 3px 5px rgba(0,0,0,0.32));
      }
      .draftPlayerToken::before {
        content: "";
        position: absolute;
        top: 0;
        left: 6px;
        width: 13px;
        height: 13px;
        border-radius: 999px;
        background: var(--player-color, #8fc7ff);
        border: 1px solid rgba(255,255,255,0.54);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.48);
      }
      .draftPlayerToken::after {
        content: "";
        position: absolute;
        left: 2px;
        bottom: 0;
        width: 21px;
        height: 22px;
        background: var(--player-color, #8fc7ff);
        border: 1px solid rgba(255,255,255,0.42);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.36);
        clip-path: polygon(50% 0%, 82% 16%, 100% 44%, 76% 48%, 72% 100%, 28% 100%, 24% 48%, 0% 44%, 18% 16%);
      }
      .draftPlayerToken.isCurrent {
        filter: drop-shadow(0 0 0 rgba(255,255,255,0.0)) drop-shadow(0 0 5px rgba(255,255,255,0.78)) drop-shadow(0 3px 5px rgba(0,0,0,0.32));
      }
      .draftTurnSlot.isEmpty::before,
      .draftClaimSlot.isEmpty::before {
        content: "";
        width: 23px;
        height: 29px;
        background: rgba(255,255,255,0.14);
        clip-path: polygon(50% 0%, 72% 4%, 81% 20%, 78% 36%, 100% 50%, 78% 56%, 73% 100%, 27% 100%, 22% 56%, 0% 50%, 22% 36%, 19% 20%, 28% 4%);
        opacity: 0.55;
      }
      .draftItem.isPicked {
        opacity: 0.76;
        background: rgba(0,0,0,0.08);
      }
      .draftItem:disabled {
        opacity: 0.76;
        cursor: default;
      }
      .draftItem:not(:disabled):hover {
        border-color: rgba(126, 192, 255, 0.55);
        background: rgba(255,255,255,0.06);
      }
      .draftItem.isCurrentPick {
        border-color: rgba(115, 232, 150, 0.78);
        box-shadow: 0 0 0 2px rgba(115, 232, 150, 0.14);
      }
      .draftItem.isCurrentPick.isMine {
        background: rgba(115, 232, 150, 0.08);
      }
      .draftItem.isAdvisorPick {
        border-color: rgba(255, 215, 106, 0.64);
        background: rgba(255, 215, 106, 0.07);
        box-shadow: 0 0 0 2px rgba(255, 215, 106, 0.10), 0 8px 18px rgba(0,0,0,0.16);
      }
      .advisorBadge {
        position: absolute;
        top: 4px;
        right: 5px;
        padding: 2px 5px;
        border-radius: 999px;
        border: 1px solid rgba(255, 225, 138, 0.45);
        background: rgba(74, 52, 16, 0.78);
        color: #ffe59a;
        font-size: 9px;
        font-weight: 850;
        letter-spacing: 0.04em;
        line-height: 1;
        pointer-events: none;
        text-transform: uppercase;
      }
      .dominoPreview {
        width: 150px;
        max-width: 100%;
      }
      .dominoPreview.compact {
        width: 140px;
        min-width: 0;
      }
      .draftItem .dominoPreview,
      .placementChoice .dominoPreview {
        width: 126px;
      }
      .dominoPreviewCanvas {
        display: block;
        width: 100%;
        height: auto;
        filter: drop-shadow(0 3px 4px rgba(0,0,0,0.28));
      }
      .placementChoices {
        margin-top: 0;
        display: grid;
      }
      .placementChoiceTitle {
        font-size: 11px;
        font-weight: 800;
        color: rgba(233,238,245,0.68);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .placementChoiceList {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }
      .placementChoice {
        display: grid;
        gap: 3px;
        justify-items: center;
        align-content: center;
        padding: 6px;
        text-align: left;
        min-width: 0;
        border-color: rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
      }
      .placementChoice.selected {
        border-color: var(--player-color, rgba(115, 232, 150, 0.95));
        background: var(--player-color-soft, rgba(31, 103, 66, 0.58));
        box-shadow: 0 0 0 2px var(--player-color-glow, rgba(115, 232, 150, 0.22)), 0 8px 24px rgba(0,0,0,0.22);
        transform: translateY(-1px);
      }
      .placementChoiceHeader {
        display: flex;
        justify-content: flex-end;
        width: 100%;
        gap: 6px;
        align-items: center;
        font-size: 11px;
        font-weight: 800;
      }
      .placementChoiceNumber {
        color: rgba(233,238,245,0.88);
      }
      .placementChoiceStatus {
        padding: 1px 5px;
        border-radius: 999px;
        color: rgba(233,238,245,0.64);
        background: rgba(255,255,255,0.07);
        font-size: 10px;
      }
      .placementChoice.selected .placementChoiceStatus {
        color: #c6ffe4;
        background: rgba(115, 232, 150, 0.16);
      }
      .placementChoice .dominoPreview.compact {
        width: min(170px, 100%);
        min-width: 0;
      }
      .tag { font-size: 12px; padding: 2px 6px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); }
      .error { color: #ffb4b4; margin-top: 6px; }

      .miniMapDock {
        position: absolute;
        left: 12px;
        bottom: 12px;
        max-width: min(360px, calc(100vw - 220px));
        padding: 8px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(20,22,28,0.64);
        backdrop-filter: blur(6px);
        z-index: 5;
      }
      .miniRow { display: flex; gap: 8px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: thin; }
      .miniCard {
        display: grid;
        justify-items: center;
        align-items: center;
        gap: 4px;
        padding: 7px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        background: transparent;
        flex: 0 0 auto;
      }
      .miniTitle {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 700;
        color: rgba(233,238,245,0.85);
      }
      .miniTitle::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: var(--mini-player-color, rgba(255,255,255,0.6));
        box-shadow: 0 0 0 2px var(--mini-player-glow, rgba(255,255,255,0.12));
      }
      canvas.mini {
        width: 140px;
        height: 140px;
        border-radius: 8px;
        background: rgba(0,0,0,0.35);
        box-shadow: 0 0 0 2px var(--mini-player-color, rgba(255,255,255,0.18)), 0 0 0 5px var(--mini-player-glow, rgba(255,255,255,0.06));
      }
      .miniActive {
        outline: 0;
        filter: brightness(1.14);
      }
      .miniTurn {
        border-color: rgba(255,255,255,0.08);
      }
      .focusInfo {
        margin-top: 4px;
        color: #9fd7ff;
        font-weight: 700;
        font-size: 12px;
      }
      .endOverlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 88px 16px 116px;
        pointer-events: none;
        z-index: 6;
      }
      .endOverlay.isCollapsed {
        place-items: end start;
      }
      .endOverlay[hidden] { display: none !important; }
      .endCard {
        width: min(440px, calc(100vw - 32px));
        display: grid;
        gap: 12px;
        padding: 18px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(20,22,28,0.88);
        color: #e9eef5;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        backdrop-filter: blur(10px);
        box-shadow: 0 18px 60px rgba(0,0,0,0.38);
        pointer-events: auto;
      }
      .endCard.isCollapsed {
        width: min(300px, calc(100vw - 32px));
        gap: 8px;
        padding: 12px;
      }
      .endCard.isCollapsed .endKicker,
      .endCard.isCollapsed .endScoreList {
        display: none;
      }
      .endCard.isCollapsed .endTitle {
        font-size: 18px;
      }
      .endCard.isCollapsed .muted {
        font-size: 12px;
      }
      .endKicker {
        font-size: 12px;
        font-weight: 800;
        color: rgba(233,238,245,0.72);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .endTitle {
        font-size: 28px;
        line-height: 1.05;
        font-weight: 900;
      }
      .endScoreList { display: grid; gap: 6px; }
      .endScoreRow {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(255,255,255,0.07);
      }
      .endActions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .scoreHistoryOverlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(8, 10, 14, 0.42);
        backdrop-filter: blur(3px);
        z-index: 24;
        color: #e9eef5;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      }
      .scoreHistoryOverlay[hidden] { display: none !important; }
      .scoreHistoryCard {
        box-sizing: border-box;
        width: min(920px, calc(100vw - 28px));
        max-height: min(760px, calc(100dvh - 28px));
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        gap: 12px;
        padding: 16px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(20,22,28,0.92);
        box-shadow: 0 22px 72px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.08);
      }
      .scoreHistoryHeader {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 12px;
      }
      .scoreHistoryTitle {
        display: grid;
        gap: 3px;
      }
      .scoreHistoryTitle h2 {
        margin: 0;
        font-size: 24px;
        line-height: 1.05;
      }
      .scoreHistoryClose {
        width: auto;
        min-width: 40px;
      }
      .scoreHistoryBody {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(240px, 0.75fr) minmax(0, 1.25fr);
        gap: 12px;
      }
      .scoreHistoryList {
        min-height: 0;
        overflow: auto;
        display: grid;
        align-content: start;
        gap: 7px;
        padding-right: 2px;
      }
      .scoreHistoryItem {
        width: 100%;
        display: grid;
        gap: 4px;
        padding: 9px;
        text-align: left;
        border-radius: 10px;
        background: rgba(255,255,255,0.06);
      }
      .scoreHistoryItem.active {
        border-color: rgba(126, 192, 255, 0.66);
        background: rgba(42, 92, 145, 0.42);
        box-shadow: 0 0 0 2px rgba(126, 192, 255, 0.10);
      }
      .scoreHistoryItemTop,
      .scoreHistoryPlayerRow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .scoreHistoryItemTop strong {
        font-size: 13px;
      }
      .scoreHistoryDate {
        font-size: 11px;
        color: rgba(233,238,245,0.58);
      }
      .scoreHistoryPlayers {
        display: grid;
        gap: 3px;
        font-size: 12px;
        color: rgba(233,238,245,0.80);
      }
      .scoreHistoryDetail {
        min-height: 0;
        overflow: auto;
        display: grid;
        align-content: start;
        gap: 10px;
        padding: 12px;
        border-radius: 12px;
        background: rgba(255,255,255,0.045);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .scoreHistoryDetailHeader {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 10px;
      }
      .scoreHistoryDetailHeader h3 {
        margin: 0;
        font-size: 18px;
      }
      .scoreBoardGrid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
      }
      .scoreBoardCard {
        display: grid;
        gap: 7px;
        padding: 9px;
        border-radius: 10px;
        background: rgba(0,0,0,0.18);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .scoreBoardTitle {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
        font-weight: 800;
      }
      canvas.scoreBoard {
        width: 100%;
        aspect-ratio: 1;
        border-radius: 8px;
        background: rgba(0,0,0,0.35);
      }
      .scoreHistoryEmpty {
        grid-column: 1 / -1;
        padding: 18px;
        border-radius: 12px;
        background: rgba(255,255,255,0.06);
        color: rgba(233,238,245,0.74);
        text-align: center;
      }
      .root.isStartMode .topBar,
      .root.isStartMode .hud,
      .root.isStartMode .miniMapDock,
      .root.isStartMode .controlsPrimary,
      .root.isStartMode .controlsSecondary,
      .root.isStartMode .controlsTertiary,
      .root.isStartMode .mobileActions,
      .root.isStartMode .localPlacementDock,
      .root.isStartMode .canvasNotice {
        display: none !important;
      }
      .startOverlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center end;
        padding: clamp(18px, 3vw, 34px);
        z-index: 20;
        background:
          radial-gradient(circle at 24% 26%, rgba(126, 192, 255, 0.16), rgba(126, 192, 255, 0) 34%),
          linear-gradient(90deg, rgba(10, 12, 16, 0.06) 0%, rgba(10, 12, 16, 0.26) 50%, rgba(10, 12, 16, 0.62) 100%);
        color: #e9eef5;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        pointer-events: auto;
      }
      .startOverlay *,
      .startOverlay *::before,
      .startOverlay *::after {
        box-sizing: border-box;
      }
      .startOverlay[hidden] { display: none !important; }
      .startCard {
        width: min(430px, calc(100vw - 32px));
        min-width: 0;
        display: grid;
        gap: 14px;
        padding: 18px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.18);
        background:
          linear-gradient(145deg, rgba(29, 33, 42, 0.92), rgba(16, 18, 24, 0.90)),
          rgba(20,22,28,0.90);
        backdrop-filter: blur(14px);
        box-shadow: 0 22px 72px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.08);
      }
      .startKicker {
        color: rgba(233,238,245,0.66);
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .startTitle {
        margin: 0;
        font-size: 30px;
        line-height: 1.04;
        font-weight: 900;
      }
      .startCopy {
        margin: 0;
        color: rgba(233,238,245,0.78);
        font-size: 13px;
        line-height: 1.42;
      }
      .startForm {
        display: grid;
        gap: 10px;
      }
      .inviteSummary {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .inviteSummary span {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 5px 9px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.07);
        color: rgba(233,238,245,0.84);
        font-size: 12px;
        font-weight: 850;
      }
      .startField {
        display: grid;
        gap: 5px;
        min-width: 0;
      }
      .startField label {
        color: rgba(233,238,245,0.72);
        font-size: 12px;
        font-weight: 800;
      }
      .startField input,
      .startField select {
        width: 100%;
        min-width: 0;
        min-height: 38px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.08);
        color: #f3f7fb;
        padding: 8px 10px;
        font: inherit;
        font-size: 14px;
      }
      .startField.inviteField input {
        color: #d8ecff;
        font-size: 12px;
      }
      .startField[hidden] {
        display: none !important;
      }
      .startActions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .startActions.single {
        grid-template-columns: 1fr;
      }
      .startActions button {
        min-height: 38px;
        font-weight: 850;
      }
      .startPrimary {
        border-color: rgba(126, 192, 255, 0.72);
        background: rgba(42, 112, 190, 0.86);
        color: #eef7ff;
      }
      .startPrimary:hover {
        background: rgba(52, 132, 222, 0.94);
      }
      .startSecondary {
        background: rgba(255,255,255,0.08);
      }
      @media (max-width: 760px) {
        .startOverlay {
          place-items: end center;
          padding: 16px;
          background:
            radial-gradient(circle at 50% 18%, rgba(126, 192, 255, 0.13), rgba(126, 192, 255, 0) 38%),
            linear-gradient(180deg, rgba(10, 12, 16, 0.04) 0%, rgba(10, 12, 16, 0.22) 48%, rgba(10, 12, 16, 0.70) 100%);
        }
        .startCard {
          width: min(440px, calc(100vw - 24px));
        }
        .scoreHistoryOverlay {
          padding: 10px;
        }
        .scoreHistoryCard {
          width: calc(100vw - 20px);
          max-height: calc(100dvh - 20px);
          padding: 12px;
        }
        .scoreHistoryBody {
          grid-template-columns: 1fr;
        }
        .scoreHistoryList {
          max-height: 230px;
        }
        .scoreHistoryTitle h2 {
          font-size: 21px;
        }
      }
      .lobbyPlayers {
        display: grid;
        gap: 7px;
      }
      .lobbyPlayer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 38px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
        font-size: 13px;
        font-weight: 800;
      }
      .lobbyPlayer.isEmpty {
        color: rgba(233,238,245,0.55);
        border-style: dashed;
      }
      .roomCode {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 32px;
        padding: 5px 9px;
        border-radius: 999px;
        background: rgba(126, 192, 255, 0.14);
        border: 1px solid rgba(126, 192, 255, 0.30);
        color: #d8ecff;
        font-size: 13px;
        font-weight: 900;
      }

      @media (max-width: 760px) {
        .topBar {
          top: 8px;
          left: 8px;
          right: 8px;
          min-height: 42px;
        }
        .canvasNotice {
          left: 8px;
          right: 8px;
          bottom: var(--placement-notice-bottom, 64px);
          transform: none;
          max-width: none;
          text-align: center;
          z-index: 10;
        }
        .localPlacementDock {
          left: var(--placement-dock-left, 50%) !important;
          right: auto;
          top: auto !important;
          bottom: var(--placement-dock-bottom, 64px);
          transform: translateX(-50%);
          z-index: 10;
        }
        .root.hasCanvasNotice .hud {
          bottom: var(--mobile-hud-bottom, 8px);
          max-height: min(30dvh, 230px);
        }
        .root.hasCanvasNotice .canvasNotice {
          bottom: var(--placement-notice-bottom, 188px);
        }
        .root.hasLocalPlacementDock .canvasNotice {
          bottom: var(--placement-notice-bottom, 198px);
        }
        .root.hasLocalPlacementDock .localPlacementDock {
          bottom: var(--placement-dock-bottom, 150px);
        }
        .root.hasLocalPlacementDock .hud {
          bottom: var(--mobile-hud-bottom, 8px);
          max-height: min(30dvh, 230px);
        }
        .hud {
          width: calc(100vw - 16px);
          max-height: min(44dvh, 380px);
          top: auto;
          bottom: 8px;
          left: 8px;
          padding: 8px;
          border-radius: 12px;
        }
        .root.isDraftPhase .hud {
          bottom: 8px;
          max-height: min(50dvh, 420px);
        }
        .root.players3.isDraftPhase .hud,
        .root.players4.isDraftPhase .hud {
          max-height: min(64dvh, 430px);
        }
        .controlsPrimary {
          left: 8px;
          right: 8px;
          bottom: 8px;
          transform: none;
          width: auto;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          padding: 7px;
        }
        .controlsSecondary {
          top: 8px;
          right: 8px;
          min-width: 96px;
          padding: 6px;
        }
        .controlsTertiary {
          top: 56px;
          right: 8px;
        }
        .mobileActions {
          right: 8px;
          bottom: 12px;
          left: 8px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
        .mobileBtn { padding: 9px 11px; }
        .draftList {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2px;
        }
        .draftItem {
          min-width: 0;
          grid-template-columns: 28px max-content 28px;
          min-height: 48px;
          gap: 4px;
          padding: 1px 3px;
        }
        .draftItem .dominoPreview { width: min(122px, calc(100vw - 92px)); }
        .dominoPreview { width: clamp(108px, 18vw, 148px); }
        .dominoPreview.compact { width: clamp(104px, 17vw, 140px); min-width: 0; }
        .placementChoiceList { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .placementChoice {
          min-width: 0;
          padding: 5px;
          gap: 3px;
        }
        .placementChoice .dominoPreview.compact { width: min(184px, 100%); }
        .miniMapDock {
          box-sizing: border-box;
          top: 8px;
          left: 8px;
          bottom: auto;
          max-width: calc(100vw - 132px);
          padding: 6px;
        }
        .miniRow { gap: 6px; }
        .miniCard { padding: 5px; gap: 4px; }
        .miniTitle { font-size: 11px; }
        canvas.mini { width: 76px; height: 76px; }
        .endOverlay { padding: 132px 12px 128px; }
        .endOverlay.isCollapsed { padding: 132px 8px 92px; }
        .endCard { padding: 15px; }
        .endTitle { font-size: 23px; }
      }
      @media (min-width: 521px) {
        .hud {
          top: auto;
          bottom: 8px;
          left: 8px;
          width: min(326px, calc(52vw - 8px));
          max-height: min(58dvh, 500px);
          padding: 7px;
          border-radius: 12px;
          right: auto;
          overflow: visible;
        }
        .miniMapDock {
          top: auto;
          right: 8px;
          bottom: 8px;
          left: auto;
          box-sizing: border-box;
          width: min(224px, calc(48vw - 10px));
          max-width: 224px;
          max-height: min(58dvh, 500px);
          padding: 5px;
          overflow: visible;
        }
        .miniRow {
          display: grid;
          grid-template-columns: 1fr;
          gap: 5px;
          overflow: visible;
        }
        .miniCard {
          min-width: 0;
          justify-items: center;
          padding: 6px;
          gap: 3px;
        }
        .miniTitle {
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11px;
        }
        canvas.mini {
          width: min(142px, calc(48vw - 42px));
          height: min(142px, calc(48vw - 42px));
        }
        .root.players3 .miniMapDock,
        .root.players4 .miniMapDock {
          width: min(360px, calc(48vw - 10px));
          max-width: 360px;
        }
        .root.players3 .miniRow,
        .root.players4 .miniRow {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .root.players3 .miniCard,
        .root.players4 .miniCard {
          padding: 5px;
        }
        .root.players3 canvas.mini,
        .root.players4 canvas.mini {
          width: min(112px, calc((48vw - 62px) / 2));
          height: min(112px, calc((48vw - 62px) / 2));
        }
      }
      @media (min-width: 521px) and (max-height: 620px) {
        .hud,
        .miniMapDock {
          max-height: calc(100dvh - 16px);
          overflow: auto;
        }
      }
      @media (max-width: 520px) {
        .miniMapDock {
          top: 8px;
          padding: 7px;
        }
        .miniRow { gap: 7px; }
        .miniCard { padding: 7px; }
        .miniTitle { font-size: 11px; }
        canvas.mini {
          width: min(96px, calc((100vw - 118px) / 2));
          height: min(96px, calc((100vw - 118px) / 2));
        }
        .draftItem {
          grid-template-columns: 27px max-content 27px;
          gap: 3px;
        }
        .draftItem .dominoPreview { width: min(118px, calc(100vw - 88px)); }
        .draftPlayerToken {
          width: 23px;
          height: 29px;
        }
        .draftPlayerToken::before {
          left: 5px;
          width: 12px;
          height: 12px;
        }
        .draftPlayerToken::after {
          width: 20px;
          height: 21px;
        }
      }
      @media (max-width: 380px) {
        .miniMapDock {
          padding: 6px;
        }
        .miniRow { gap: 5px; }
        .miniCard { padding: 5px; }
        .miniTitle { font-size: 10px; }
        canvas.mini {
          width: min(86px, calc((100vw - 150px) / 2));
          height: min(86px, calc((100vw - 150px) / 2));
        }
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

    this.#localPlacementDock = document.createElement('div');
    this.#localPlacementDock.className = 'localPlacementDock';
    this.#localPlacementDock.hidden = true;
    this.#btnLocalClear = document.createElement('button');
    this.#btnLocalClear.type = 'button';
    this.#btnLocalClear.className = 'localClear';
    this.#btnLocalClear.textContent = 'x';
    this.#btnLocalClear.title = 'Show all moves';
    this.#btnLocalClear.setAttribute('aria-label', 'Show all moves');
    this.#btnLocalAdvisor = document.createElement('button');
    this.#btnLocalAdvisor.type = 'button';
    this.#btnLocalAdvisor.className = 'localAdvisor';
    this.#btnLocalAdvisor.textContent = 'Advisor';
    this.#btnLocalAdvisor.title = 'Show advisor placement';
    this.#btnLocalAdvisor.setAttribute('aria-label', 'Show advisor placement');
    this.#btnLocalPrev = document.createElement('button');
    this.#btnLocalPrev.type = 'button';
    this.#btnLocalPrev.textContent = '‹';
    this.#btnLocalPrev.title = 'Previous move for this spot';
    this.#btnLocalPrev.setAttribute('aria-label', 'Previous move for this spot');
    this.#localPlacementLabel = document.createElement('div');
    this.#localPlacementLabel.className = 'localPlacementLabel';
    this.#localPlacementLabel.textContent = '1/1';
    this.#btnLocalNext = document.createElement('button');
    this.#btnLocalNext.type = 'button';
    this.#btnLocalNext.textContent = '›';
    this.#btnLocalNext.title = 'Next move for this spot';
    this.#btnLocalNext.setAttribute('aria-label', 'Next move for this spot');
    this.#btnLocalPlace = document.createElement('button');
    this.#btnLocalPlace.type = 'button';
    this.#btnLocalPlace.className = 'localPlace';
    this.#btnLocalPlace.textContent = '✓';
    this.#btnLocalPlace.title = 'Place here';
    this.#btnLocalPlace.setAttribute('aria-label', 'Place here');
    this.#localPlacementDock.append(this.#btnLocalClear, this.#btnLocalAdvisor, this.#btnLocalPrev, this.#localPlacementLabel, this.#btnLocalNext, this.#btnLocalPlace);

    this.#hud = document.createElement('div');
    this.#hud.className = 'hud';
    this.#topBar = document.createElement('div');
    this.#topBar.className = 'topBar';
    this.#hudHeader = document.createElement('div');
    this.#hudHeader.className = 'hudHeader';
    this.#hudTitle = document.createElement('h2');

    this.#hudHeader.append(this.#hudTitle);
    this.#hudBody = document.createElement('div');
    this.#hudBody.id = 'hudBody';
    this.#topBar.append(this.#hudTitle);

    this.#primaryControlsRow = document.createElement('div');
    this.#primaryControlsRow.className = 'controlsPrimary';
    this.#secondaryControlsRow = document.createElement('div');
    this.#secondaryControlsRow.className = 'controlsSecondary';
    this.#tertiaryControlsRow = document.createElement('div');
    this.#tertiaryControlsRow.className = 'controlsTertiary';
    this.#btnRotate = document.createElement('button');
    this.#btnRotate.textContent = 'Rotate (R)';
    this.#btnRotate.className = 'secondaryAction';
    this.#btnSkip = document.createElement('button');
    this.#btnSkip.textContent = 'Skip';
    this.#btnSkip.className = 'dangerAction secondaryAction';
    this.#btnUndoRequest = document.createElement('button');
    this.#btnUndoRequest.textContent = 'Request Undo';
    this.#btnUndoRequest.className = 'secondaryAction';
    this.#btnNextValid = document.createElement('button');
    this.#btnNextValid.textContent = 'Next Valid';
    this.#btnNextValid.className = 'primaryAction';
    this.#btnResetTile = document.createElement('button');
    this.#btnResetTile.textContent = 'Reset Tile';
    this.#btnResetTile.className = 'secondaryAction';
    this.#btnScores = document.createElement('button');
    this.#btnScores.textContent = 'Score Preview';
    this.#btnScores.className = 'secondaryAction';
    this.#btnPlace = document.createElement('button');
    this.#btnPlace.textContent = 'Place';
    this.#btnPlace.className = 'primaryAction';
    this.#btnCenter = document.createElement('button');
    this.#btnCenter.textContent = 'Center';
    this.#btnCenter.className = 'secondaryAction iconAction';
    this.#btnMore = document.createElement('button');
    this.#btnMore.textContent = 'Menu';
    this.#btnMore.className = 'secondaryAction iconAction';
    this.#btnLibrary = document.createElement('button');
    this.#btnLibrary.textContent = 'Library';
    this.#btnLibrary.className = 'secondaryAction';
    this.#btnToggleAdvisor = document.createElement('button');
    this.#btnToggleAdvisor.textContent = 'Hide Advisor';
    this.#btnToggleAdvisor.className = 'secondaryAction';
    this.#btnToggleMiniMap = document.createElement('button');
    this.#btnToggleMiniMap.textContent = 'Show Minimap';
    this.#btnToggleMiniMap.className = 'secondaryAction';
    this.#btnHighScores = document.createElement('button');
    this.#btnHighScores.textContent = 'High Scores';
    this.#btnHighScores.className = 'secondaryAction';
    this.#btnRestart = document.createElement('button');
    this.#btnRestart.textContent = 'Restart';
    this.#btnRestart.className = 'secondaryAction destructiveAction';
    this.#btnEndGame = document.createElement('button');
    this.#btnEndGame.textContent = 'End Game';
    this.#btnEndGame.className = 'secondaryAction destructiveAction';
    this.#primaryControlsRow.append(this.#btnSkip, this.#btnNextValid, this.#btnPlace);
    this.#secondaryControlsRow.append(this.#btnMore);
    this.#tertiaryControlsRow.hidden = true;
    this.#tertiaryControlsRow.append(
      this.#btnCenter,
      this.#btnLibrary,
      this.#btnRotate,
      this.#btnResetTile,
      this.#btnScores,
      this.#btnToggleAdvisor,
      this.#btnToggleMiniMap,
      this.#btnUndoRequest,
      this.#btnHighScores,
      this.#btnRestart,
      this.#btnEndGame
    );

    this.#hudHint = document.createElement('div');
    this.#hudHint.className = 'muted hudHint';
    this.#hudHint.textContent = 'Pan: drag on the board. Zoom: scroll/pinch. Use Center if you get lost.';

    this.#miniMapRow = document.createElement('div');
    this.#miniMapRow.className = 'miniRow';
    this.#miniMapDock = document.createElement('div');
    this.#miniMapDock.className = 'miniMapDock';
    this.#miniMapDock.append(this.#miniMapRow);

    this.#endOverlay = document.createElement('div');
    this.#endOverlay.className = 'endOverlay';
    this.#endOverlay.hidden = true;

    this.#startOverlay = document.createElement('div');
    this.#startOverlay.className = 'startOverlay';
    this.#startOverlay.hidden = true;

    this.#scoreHistoryOverlay = document.createElement('div');
    this.#scoreHistoryOverlay.className = 'scoreHistoryOverlay';
    this.#scoreHistoryOverlay.hidden = true;

    this.#hud.append(this.#hudBody);
    this.#root.append(this.#canvasHost, this.#canvasTurn, this.#canvasNotice, this.#mobileActions, this.#localPlacementDock, this.#topBar, this.#hud, this.#miniMapDock, this.#primaryControlsRow, this.#secondaryControlsRow, this.#tertiaryControlsRow, this.#endOverlay, this.#startOverlay, this.#scoreHistoryOverlay);
    this.#shadow.append(style, this.#root);
  }

  #normalizePlayerCount(value, fallback = 2) {
    const count = Number.parseInt(value, 10);
    if (!Number.isFinite(count)) return Math.max(2, Math.min(4, fallback || 2));
    return Math.max(2, Math.min(4, count));
  }

  #playerCountFromUrl(url = new URL(location.href), fallback = this.#playerCount) {
    const explicit = url.searchParams.get('players') ?? url.searchParams.get('playerCount');
    if (explicit != null) return this.#normalizePlayerCount(explicit, fallback);

    let namedCount = 0;
    for (let i = 1; i <= 4; i++) {
      if ((url.searchParams.get(`p${i}`) || '').trim()) namedCount = i;
    }
    return this.#normalizePlayerCount(namedCount || fallback, fallback);
  }

  #playerCountFromInput(value, fallback = this.#playerCount) {
    const raw = String(value || '').trim();
    if (!raw) return this.#normalizePlayerCount(fallback, fallback);
    try {
      const parsed = new URL(raw, location.href);
      return this.#playerCountFromUrl(parsed, fallback);
    } catch {
      return this.#normalizePlayerCount(fallback, fallback);
    }
  }

  #defaultPlayerNames(primaryName, playerCount = this.#playerCount) {
    return Array.from({ length: playerCount }, (_, index) => {
      if (index === 0 && primaryName) return primaryName;
      if (index === 1) return 'Helper';
      return `Player ${index + 1}`;
    });
  }

  #usesExpandedBoard(playerCount = this.#playerCount) {
    return this.#normalizePlayerCount(playerCount, this.#playerCount) === 2;
  }

  #initGame(seed, playerNames, playerCount = this.#playerCount) {
    const count = this.#normalizePlayerCount(playerCount, this.#playerCount);
    this.#playerCount = count;
    this.#root?.classList.toggle('players3', count === 3);
    this.#root?.classList.toggle('players4', count === 4);
    const config = new GameConfiguration(count, false, this.#usesExpandedBoard(count));
    this.#game = new WebGameManager(config, seed);
    this.#game.setGroupedPlacementTurns?.(this.#hotseat);
    const displayNames = Array.from({ length: count }, (_, index) => {
      const provided = typeof playerNames?.[index] === 'string' ? playerNames[index].trim() : '';
      return provided;
    });
    const gameNames = displayNames.map((name, index) => name || `Player ${index + 1}`);
    this.#playerNames = displayNames;
    this.#remotePlacementPreviews.clear();
    this.#lastSentPlacementPreviewKey = '';
    this.#clearAutoDraftClaimHold();
    this.#draftClaimAnimationStartedAt.clear();
    this.#draftClaimAnimationSourceByKey.clear();
    this.#kingdomMatBoundsByPlayer.clear();
    this.#invalidateTabletopLayoutCache();
    this.#lastCanvasDraftOrigin = null;
    this.#placementGhostAnimation = null;
    this.#placementReturnAnimations.clear();
    this.#placementSkipAnimations.clear();
    this.#clearScoreBursts();
    this.#recordedCompletedGameKey = null;
    this.#invalidatePlacementCaches();
    this.#game.start(gameNames);
  }

  #storedPlayerName() {
    try {
      return localStorage.getItem('kd.playerName') || '';
    } catch {
      return '';
    }
  }

  #savePlayerName(name) {
    const clean = this.#cleanPlayerName(name);
    try {
      localStorage.setItem('kd.playerName', clean);
    } catch {
      // ignore
    }
    return clean;
  }

  #loadAdvisorVisibility() {
    try {
      return localStorage.getItem(ADVISOR_VISIBILITY_STORAGE_KEY) !== '0';
    } catch {
      return true;
    }
  }

  #saveAdvisorVisibility() {
    try {
      localStorage.setItem(ADVISOR_VISIBILITY_STORAGE_KEY, this.#showAdvisor ? '1' : '0');
    } catch {
      // ignore
    }
  }

  #loadScoreHistory() {
    try {
      const raw = localStorage.getItem(SCORE_HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((record) => record && Array.isArray(record.players) && record.players.length)
        .slice(0, SCORE_HISTORY_LIMIT);
    } catch {
      return [];
    }
  }

  #saveScoreHistory(records) {
    try {
      localStorage.setItem(SCORE_HISTORY_STORAGE_KEY, JSON.stringify(records.slice(0, SCORE_HISTORY_LIMIT)));
    } catch {
      // ignore storage quota/private mode failures
    }
  }

  #currentScoreHistoryRecord() {
    if (!this.#game?.isGameOver || !this.#game.players?.length) return null;

    const players = this.#game.players.map((player, index) => {
      const boardManager = player.board;
      const board = boardManager.board;
      const boardSize = boardManager.boardSize;
      const tiles = Object.values(board)
        .map((tile) => ({
          x: tile.x,
          y: tile.y,
          landscape: landscapeKey(tile.landscape),
          crowns: tile.crowns,
          artSeed: tile.artSeed || '',
        }))
        .sort((a, b) => a.x - b.x || a.y - b.y || a.landscape.localeCompare(b.landscape));

      return {
        index,
        name: this.#playerNames[index] || player.name || `Player ${index + 1}`,
        score: boardManager.score,
        boardSize: {
          xMin: boardSize.xMin,
          xMax: boardSize.xMax,
          yMin: boardSize.yMin,
          yMax: boardSize.yMax,
        },
        tiles,
      };
    });

    const topScore = Math.max(...players.map((player) => player.score));
    const winnerNames = players
      .filter((player) => player.score === topScore)
      .map((player) => player.name);
    const keySource = JSON.stringify({
      seed: this.#game.seed,
      playerCount: this.#playerCount,
      players: players.map((player) => ({
        name: player.name,
        score: player.score,
        tiles: player.tiles,
      })),
    });
    const gameKey = hash32(keySource).toString(36);

    return {
      schema: 1,
      id: `game-${Date.now().toString(36)}-${gameKey}`,
      gameKey,
      completedAt: Date.now(),
      seed: this.#game.seed,
      playerCount: this.#playerCount,
      mode: this.#hotseat ? 'Hotseat' : this.#roomId ? 'Online' : 'Local',
      roomId: this.#roomId || '',
      topScore,
      winnerNames,
      players,
    };
  }

  #recordCompletedGameIfNeeded() {
    const record = this.#currentScoreHistoryRecord();
    if (!record) return;
    if (this.#recordedCompletedGameKey === record.gameKey) return;

    const history = this.#loadScoreHistory()
      .filter((item) => item.gameKey !== record.gameKey);
    history.unshift(record);
    this.#saveScoreHistory(history);
    this.#recordedCompletedGameKey = record.gameKey;
    if (this.#scoreHistoryOpen) this.#renderScoreHistoryOverlay();
  }

  #openScoreHistory(selectedId = null) {
    this.#scoreHistoryOpen = true;
    this.#scoreHistorySelectedId = selectedId;
    this.#moreOpen = false;
    this.#renderScoreHistoryOverlay();
    this.#refreshHud();
  }

  #closeScoreHistory() {
    this.#scoreHistoryOpen = false;
    this.#scoreHistorySelectedId = null;
    this.#renderScoreHistoryOverlay();
  }

  #scoreHistoryDate(record) {
    const date = new Date(record?.completedAt || 0);
    if (!Number.isFinite(date.getTime())) return 'Completed game';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  #scoreHistoryTime(record) {
    const date = new Date(record?.completedAt || 0);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  #renderScoreHistoryOverlay() {
    if (!this.#scoreHistoryOverlay) return;
    this.#scoreHistoryOverlay.hidden = !this.#scoreHistoryOpen;
    this.#scoreHistoryOverlay.innerHTML = '';
    if (!this.#scoreHistoryOpen) return;

    const history = this.#loadScoreHistory();
    if (this.#scoreHistorySelectedId && !history.some((record) => record.id === this.#scoreHistorySelectedId)) {
      this.#scoreHistorySelectedId = null;
    }
    const selected = history.find((record) => record.id === this.#scoreHistorySelectedId) ?? history[0] ?? null;
    if (selected) this.#scoreHistorySelectedId = selected.id;

    const card = document.createElement('div');
    card.className = 'scoreHistoryCard';
    const header = document.createElement('div');
    header.className = 'scoreHistoryHeader';
    const title = document.createElement('div');
    title.className = 'scoreHistoryTitle';
    const heading = document.createElement('h2');
    heading.textContent = 'High Scores';
    const copy = document.createElement('div');
    copy.className = 'muted';
    copy.textContent = 'Last 50 completed games saved on this browser.';
    title.append(heading, copy);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'secondaryAction scoreHistoryClose';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.#closeScoreHistory());
    header.append(title, close);

    const body = document.createElement('div');
    body.className = 'scoreHistoryBody';

    if (!history.length) {
      const empty = document.createElement('div');
      empty.className = 'scoreHistoryEmpty';
      empty.textContent = 'Completed games will appear here after the final tile is placed.';
      body.append(empty);
      card.append(header, body);
      this.#scoreHistoryOverlay.append(card);
      return;
    }

    const list = document.createElement('div');
    list.className = 'scoreHistoryList';
    for (const record of history) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'scoreHistoryItem';
      item.classList.toggle('active', record.id === selected?.id);

      const top = document.createElement('div');
      top.className = 'scoreHistoryItemTop';
      const winner = document.createElement('strong');
      winner.textContent = `${record.winnerNames?.join(', ') || 'Winner'} · ${record.topScore}`;
      const date = document.createElement('span');
      date.className = 'scoreHistoryDate';
      date.textContent = `${this.#scoreHistoryDate(record)} ${this.#scoreHistoryTime(record)}`;
      top.append(winner, date);

      const players = document.createElement('div');
      players.className = 'scoreHistoryPlayers';
      for (const player of [...record.players].sort((a, b) => b.score - a.score || a.index - b.index)) {
        const row = document.createElement('div');
        row.className = 'scoreHistoryPlayerRow';
        const name = document.createElement('span');
        name.textContent = player.name;
        const score = document.createElement('strong');
        score.textContent = String(player.score);
        row.append(name, score);
        players.append(row);
      }

      item.append(top, players);
      item.addEventListener('click', () => {
        this.#scoreHistorySelectedId = record.id;
        this.#renderScoreHistoryOverlay();
      });
      list.append(item);
    }

    const detail = document.createElement('div');
    detail.className = 'scoreHistoryDetail';
    this.#renderScoreHistoryDetail(detail, selected);

    body.append(list, detail);
    card.append(header, body);
    this.#scoreHistoryOverlay.append(card);
  }

  #renderScoreHistoryDetail(container, record) {
    container.innerHTML = '';
    if (!record) return;

    const header = document.createElement('div');
    header.className = 'scoreHistoryDetailHeader';
    const text = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = record.winnerNames?.length > 1
      ? `Tie at ${record.topScore}`
      : `${record.winnerNames?.[0] || 'Winner'} wins`;
    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = `${record.mode || 'Game'} · ${record.playerCount || record.players.length} players · Seed ${record.seed}`;
    text.append(title, meta);
    const date = document.createElement('div');
    date.className = 'scoreHistoryDate';
    date.textContent = `${this.#scoreHistoryDate(record)} ${this.#scoreHistoryTime(record)}`;
    header.append(text, date);

    const boards = document.createElement('div');
    boards.className = 'scoreBoardGrid';
    for (const player of record.players) {
      const card = document.createElement('div');
      card.className = 'scoreBoardCard';
      const titleRow = document.createElement('div');
      titleRow.className = 'scoreBoardTitle';
      const name = document.createElement('span');
      name.textContent = player.name;
      const score = document.createElement('strong');
      score.textContent = String(player.score);
      titleRow.append(name, score);

      const canvas = document.createElement('canvas');
      canvas.width = 180;
      canvas.height = 180;
      canvas.className = 'scoreBoard';
      card.append(titleRow, canvas);
      boards.append(card);
      this.#drawScoreBoardSnapshot(canvas, player, player.index ?? 0);
    }

    container.append(header, boards);
  }

  #drawScoreBoardSnapshot(canvas, player, playerIndex = 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tiles = Array.isArray(player?.tiles) ? player.tiles : [];
    if (!tiles.length) return;

    const storedSize = player.boardSize || {};
    const xMin = Number.isFinite(storedSize.xMin) ? storedSize.xMin : Math.min(...tiles.map((tile) => tile.x));
    const xMax = Number.isFinite(storedSize.xMax) ? storedSize.xMax : Math.max(...tiles.map((tile) => tile.x));
    const yMin = Number.isFinite(storedSize.yMin) ? storedSize.yMin : Math.min(...tiles.map((tile) => tile.y));
    const yMax = Number.isFinite(storedSize.yMax) ? storedSize.yMax : Math.max(...tiles.map((tile) => tile.y));
    const minX = Math.min(xMin - 2, -3);
    const maxX = Math.max(xMax + 2, 3);
    const minY = Math.min(yMin - 2, -3);
    const maxY = Math.max(yMax + 2, 3);
    const gridW = maxX - minX + 1;
    const gridH = maxY - minY + 1;
    const tilePx = Math.max(6, Math.floor((Math.min(canvas.width, canvas.height) - 8) / Math.max(gridW, gridH)));
    const drawW = gridW * tilePx;
    const drawH = gridH * tilePx;
    const ox = Math.floor((canvas.width - drawW) / 2);
    const oy = Math.floor((canvas.height - drawH) / 2);

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

    for (const tile of tiles) {
      const px = ox + (tile.x - minX) * tilePx;
      const py = oy + (tile.y - minY) * tilePx;
      const color = LANDSCAPE_COLOR_BY_KEY[tile.landscape] ?? 0xeeeeee;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.fillRect(px + 1, py + 1, tilePx - 2, tilePx - 2);

      if (tile.crowns > 0 || tile.landscape === landscapeKey(Landscapes.CASTLE)) {
        const cx = px + tilePx / 2;
        const cy = py + tilePx / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (tile.landscape === landscapeKey(Landscapes.CASTLE)) {
          const radius = Math.max(4, tilePx * 0.34);
          ctx.fillStyle = this.#playerMiniMapColor(playerIndex, 0.22);
          ctx.beginPath();
          ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = this.#playerMiniMapColor(playerIndex, 0.95);
          ctx.lineWidth = Math.max(1.5, tilePx * 0.12);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(245,248,255,0.86)';
          ctx.font = `${Math.max(8, Math.floor(tilePx * 0.46))}px system-ui`;
          ctx.fillText('C', cx, cy);
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.font = `${Math.max(8, Math.floor(tilePx * 0.55))}px system-ui`;
          ctx.fillText(String(tile.crowns), cx, cy);
        }
      }
    }
  }

  #cleanPlayerName(name, fallback = 'Player') {
    return String(name || '').trim().slice(0, 24) || fallback;
  }

  #cleanPlayerToken(token) {
    return String(token || '').trim().replace(/[^a-z0-9-]/gi, '').slice(0, 96);
  }

  #randomRoomCode() {
    const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const bytes = new Uint8Array(4);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  }

  #roomCodeFromInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw, location.href);
      const room = parsed.searchParams.get('room');
      if (room) return room.trim().replace(/[^a-z0-9-]/gi, '').toUpperCase().slice(0, 24);
    } catch {
      // fall through to plain room code cleanup
    }
    return raw.replace(/[^a-z0-9-]/gi, '').toUpperCase().slice(0, 24);
  }

  #seedFromInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      const parsed = new URL(raw, location.href);
      const seed = Number.parseInt(parsed.searchParams.get('seed') || '', 10);
      return Number.isFinite(seed) ? seed >>> 0 : null;
    } catch {
      return null;
    }
  }

  #seedForRoomInput(value) {
    const parsedSeed = this.#seedFromInput(value);
    if (parsedSeed != null) return parsedSeed;
    const room = this.#roomCodeFromInput(value);
    if (room && room === this.#pendingInviteRoom && this.#pendingInviteSeed != null) {
      return this.#pendingInviteSeed;
    }
    return null;
  }

  #roomIsReady() {
    if (this.#hotseat || this.#homeMode || !this.#roomId) return true;
    return this.#playerNames.filter(Boolean).length >= this.#playerCount;
  }

  #isLobbyWaiting() {
    return !this.#hotseat
      && !this.#homeMode
      && !!this.#roomId
      && this.#myPlayerIndex != null
      && !this.#roomIsReady();
  }

  #isStartAttractMode() {
    return this.#homeMode || this.#isLobbyWaiting();
  }

  #prefersReducedMotion() {
    if (!this.#reducedMotionQuery && globalThis.matchMedia) {
      this.#reducedMotionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    }
    return Boolean(this.#reducedMotionQuery?.matches);
  }

  #clearAutoDraftClaimHold() {
    if (this.#autoDraftClaimHoldTimer != null) {
      globalThis.clearTimeout?.(this.#autoDraftClaimHoldTimer);
    }
    this.#autoDraftClaimHoldTimer = null;
    this.#autoDraftClaimHoldUntil = 0;
    this.#autoDraftClaimHoldOrigin = null;
  }

  #autoDraftClaimHoldActive(now = performance.now()) {
    return this.#autoDraftClaimHoldUntil > now;
  }

  #autoDraftClaimHeldOrigin(now = performance.now()) {
    if (!this.#autoDraftClaimHoldActive(now)) return null;
    return this.#autoDraftClaimHoldOrigin;
  }

  #draftOriginSnapshotForAutoDraft(action, previousState) {
    if (previousState !== GameState.DRAFT || action?.type !== 'pickDraft' || !action.payload?.auto) {
      return null;
    }
    const origin = this.#lastCanvasDraftOrigin ?? this.#canvasDraftOrigin();
    return origin ? { x: origin.x, z: origin.z } : null;
  }

  #startAutoDraftClaimHold(origin = null) {
    if (this.#prefersReducedMotion()) {
      this.#clearAutoDraftClaimHold();
      return false;
    }

    const now = performance.now();
    const duration = 860;
    this.#autoDraftClaimHoldUntil = now + duration;
    this.#autoDraftClaimHoldOrigin = origin
      ? { x: origin.x, z: origin.z }
      : this.#lastCanvasDraftOrigin
        ? { x: this.#lastCanvasDraftOrigin.x, z: this.#lastCanvasDraftOrigin.z }
        : null;

    if (this.#autoDraftClaimHoldTimer != null) {
      globalThis.clearTimeout?.(this.#autoDraftClaimHoldTimer);
    }
    this.#autoDraftClaimHoldTimer = globalThis.setTimeout?.(() => {
      this.#autoDraftClaimHoldTimer = null;
      if (this.#autoDraftClaimHoldActive()) return;
      this.#autoDraftClaimHoldUntil = 0;
      this.#autoDraftClaimHoldOrigin = null;
      this.#refreshHud();
      this.#renderBoard();
      this.#renderGhost();
      if (this.#game?.state === GameState.PLACE && !this.#game.isGameOver) {
        this.#centerOnFocusedBoard(true);
      }
    }, duration + 40) ?? null;

    return true;
  }

  #maybeStartAutoDraftClaimHold(action, previousState, phaseChanged, origin) {
    if (
      action?.type !== 'pickDraft'
      || !action.payload?.auto
      || previousState !== GameState.DRAFT
      || !phaseChanged
      || this.#game?.state !== GameState.PLACE
    ) {
      return false;
    }

    return this.#startAutoDraftClaimHold(origin);
  }

  #startAttractSeedKey() {
    return [
      this.#roomId || this.#pendingInviteRoom || 'home',
      this.#pendingInviteSeed ?? this.#game?.seed ?? 'seed',
      this.#playerCount,
    ].join('|');
  }

  #startAttractDominoNumber(step = 0) {
    const deck = DominoPoolManager.getStartingDominoPool();
    if (!deck.length) return null;

    const rand = mulberry32(hash32(`${this.#startAttractSeedKey()}|attract|${step}`));
    return deck[Math.floor(rand() * deck.length)]?.number ?? deck[0].number;
  }

  #resetStartAttract() {
    this.#startAttractFocusedDominoNumber = null;
    this.#startAttractKey = '';
    this.#startAttractStep = 0;
    this.#startAttractNextAt = 0;
  }

  #syncStartAttractCamera(force = false) {
    if (!this.#threeOk || !this.#isStartAttractMode() || this.#libraryOpen) {
      if (!this.#isStartAttractMode()) this.#resetStartAttract();
      return;
    }

    const key = this.#startAttractSeedKey();
    const now = performance.now();
    const reducedMotion = this.#prefersReducedMotion();
    if (force || key !== this.#startAttractKey || this.#startAttractFocusedDominoNumber == null) {
      this.#startAttractKey = key;
      this.#startAttractStep = Math.floor(hash32(key) % 48);
      this.#startAttractFocusedDominoNumber = this.#startAttractDominoNumber(this.#startAttractStep);
      this.#startAttractNextAt = reducedMotion ? Number.POSITIVE_INFINITY : now + 2600;
      this.#renderBoard();
      if (this.#startAttractFocusedDominoNumber != null) {
        this.#centerOnLibraryDomino(this.#startAttractFocusedDominoNumber, false);
      } else {
        this.#centerOnDominoLibrary(false);
      }
      return;
    }

    if (reducedMotion || this.#cameraTransition || now < this.#startAttractNextAt) return;

    const previous = this.#startAttractFocusedDominoNumber;
    let next = previous;
    for (let guard = 0; guard < 4 && next === previous; guard++) {
      this.#startAttractStep += 1;
      next = this.#startAttractDominoNumber(this.#startAttractStep);
    }

    this.#startAttractFocusedDominoNumber = next;
    this.#startAttractNextAt = now + 5200;
    this.#renderBoard();
    if (next != null) this.#centerOnLibraryDomino(next, true);
  }

  #canUseOnlineGame() {
    if (this.#hotseat) return true;
    if (this.#homeMode || !this.#roomId) return false;
    return this.#roomIsReady() && this.#myPlayerIndex != null;
  }

  #inviteUrl() {
    const url = new URL('/', location.href);
    if (this.#roomId) url.searchParams.set('room', this.#roomId);
    if (this.#game?.seed != null) url.searchParams.set('seed', String(this.#game.seed));
    url.searchParams.set('players', String(this.#playerCount));
    return url.toString();
  }

  #enterHomeMode(url = new URL(location.href), preferredName = '') {
    const name = this.#cleanPlayerName(url.searchParams.get('name') || url.searchParams.get('suggestedName') || preferredName || this.#storedPlayerName());
    this.#playerCount = this.#playerCountFromUrl(url, this.#playerCount);
    this.#pendingInviteRoom = this.#roomCodeFromInput(url.searchParams.get('room') || '');
    const pendingSeed = Number.parseInt(url.searchParams.get('seed') || '', 10);
    this.#pendingInviteSeed = this.#pendingInviteRoom && Number.isFinite(pendingSeed) ? pendingSeed >>> 0 : null;
    this.#pendingInviteToken = this.#pendingInviteRoom ? this.#cleanPlayerToken(url.searchParams.get('joinToken') || '') : '';
    this.#showInviteOptions = false;
    this.#mp?.disconnect?.();
    this.#mp = null;
    this.#homeMode = true;
    this.#hotseat = false;
    this.#roomId = null;
    this.#myName = name;
    this.#myPlayerIndex = null;
    this.#focusedPlayerIndex = 0;
    this.#connStatus = { state: 'home' };
    this.#pendingUndoRequest = null;
    this.#lobbyNotice = null;
    this.#actionHistory = [];
    this.#initGame(randomSeed(), this.#defaultPlayerNames(name, this.#playerCount), this.#playerCount);
  }

  #returnToStartScreen() {
    const preferredName = this.#myName;
    if (!this.#hotseat && this.#roomId && typeof this.#mp?.leaveRoom === 'function') {
      this.#mp.leaveRoom();
      this.#mp = null;
    }
    const url = new URL(location.href);
    url.search = '';
    history.replaceState(null, '', url.toString());

    this.#moreOpen = false;
    this.#libraryOpen = false;
    this.#libraryFilter = null;
    this.#libraryFocusedDominoNumber = null;
    this.#pendingUndoRequest = null;
    this.#lobbyNotice = null;
    this.#autoDraftInFlightKey = null;
    this.#hoverAnchor = null;
    this.#pendingInviteRoom = '';
    this.#pendingInviteSeed = null;
    this.#pendingInviteToken = '';
    this.#showInviteOptions = false;
    this.#remotePlacementPreviews.clear();
    this.#lastSentPlacementPreviewKey = '';
    this.#enterHomeMode(url, preferredName);
    this.#refreshHud();
    this.#renderBoard();
    this.#centerOnFocusedBoard(true);
  }

  #updateOnlineUrl(room, name, seed = null, playerToken = null, playerCount = this.#playerCount) {
    const url = new URL(location.href);
    const version = url.searchParams.get('v');
    url.search = '';
    url.searchParams.set('room', room);
    if (seed != null) url.searchParams.set('seed', String(seed));
    url.searchParams.set('players', String(this.#normalizePlayerCount(playerCount, this.#playerCount)));
    url.searchParams.set('name', name);
    if (version) url.searchParams.set('v', version);
    if (playerToken) url.searchParams.set('playerToken', playerToken);
    history.replaceState(null, '', url.toString());
    return url;
  }

  #connectOnlineRoom(room, name, seed = null, playerCount = this.#playerCount) {
    const cleanRoom = this.#roomCodeFromInput(room);
    if (!cleanRoom) return false;
    const cleanName = this.#savePlayerName(name);
    const count = this.#normalizePlayerCount(playerCount, this.#playerCount);
    const proposedSeed = Number.isFinite(seed) ? seed >>> 0 : randomSeed();
    const urlPlayerToken = this.#cleanPlayerToken(new URL(location.href).searchParams.get('playerToken') || '');
    const invitePlayerToken = cleanRoom === this.#pendingInviteRoom ? this.#pendingInviteToken : '';
    const explicitPlayerToken = urlPlayerToken || invitePlayerToken || null;
    this.#updateOnlineUrl(cleanRoom, cleanName, proposedSeed, explicitPlayerToken, count);

    this.#mp?.disconnect?.();
    this.#homeMode = false;
    this.#hotseat = false;
    this.#roomId = cleanRoom;
    this.#playerCount = count;
    this.#myName = cleanName;
    this.#myPlayerIndex = null;
    this.#focusedPlayerIndex = 0;
    this.#connStatus = { state: 'connecting' };
    this.#pendingUndoRequest = null;
    this.#lobbyNotice = null;
    this.#pendingInviteRoom = '';
    this.#pendingInviteSeed = null;
    this.#pendingInviteToken = '';
    this.#showInviteOptions = false;
    this.#actionHistory = [];
    this.#initGame(proposedSeed, [cleanName], count);

    this.#mp = new MultiplayerClient({
      roomId: cleanRoom,
      name: cleanName,
      playerToken: explicitPlayerToken || undefined,
      playerCount: count,
      proposedSeed,
      onStatus: (s) => {
        this.#connStatus = s;
        this.#refreshHud();
      },
      onJoined: ({ playerIndex, seed: joinedSeed, playerCount: joinedPlayerCount, actions, players, previews }) => {
        this.#myPlayerIndex = playerIndex;
        this.#playerCount = this.#normalizePlayerCount(joinedPlayerCount, count);
        this.#focusedPlayerIndex = playerIndex ?? 0;
        this.#updateOnlineUrl(cleanRoom, cleanName, joinedSeed, this.#mp?.playerToken, this.#playerCount);
        this.#initGame(joinedSeed, players, this.#playerCount);
        this.#pendingUndoRequest = null;
        if (this.#roomIsReady()) this.#lobbyNotice = null;
        this.#actionHistory = [];
        for (const a of (actions || [])) {
          this.#actionHistory.push(a);
          this.#applyNetworkAction(a, { effects: false });
        }
        this.#settleCurrentDraftClaimAnimations();
        for (const preview of (previews || [])) {
          this.#handlePlacementPreview(preview, { render: false });
        }
        this.#syncFocusedBoardToPhase();
        this.#refreshHud();
        this.#renderBoard();
        this.#centerOnFocusedBoard();
        this.#renderGhost();
        this.#autoResolveForcedDraft();
      },
      onPlayers: (players, joinedPlayerCount) => {
        const previousNames = this.#playerNames;
        if (joinedPlayerCount != null) {
          this.#playerCount = this.#normalizePlayerCount(joinedPlayerCount, this.#playerCount);
        }
        const nextNames = players?.length ? players : this.#playerNames;
        const joinedNames = nextNames.filter((name, index) =>
          name && !previousNames[index] && index !== this.#myPlayerIndex
        );
        this.#playerNames = nextNames;
        if (this.#roomIsReady()) {
          this.#lobbyNotice = null;
        } else if (this.#myPlayerIndex != null && joinedNames.length) {
          this.#lobbyNotice = `${joinedNames[joinedNames.length - 1]} joined.`;
        }
        this.#refreshHud();
        this.#ensureMiniMaps();
        this.#renderMiniMaps();
      },
      onAction: (action) => {
        const previousState = this.#game?.state;
        const autoDraftOrigin = this.#draftOriginSnapshotForAutoDraft(action, previousState);
        this.#actionHistory.push(action);
        this.#applyNetworkAction(action);
        const focusChanged = this.#syncFocusedBoardToPhase();
        const phaseChanged = previousState != null && previousState !== this.#game?.state;
        const autoDraftHoldStarted = this.#maybeStartAutoDraftClaimHold(action, previousState, phaseChanged, autoDraftOrigin);
        const needsBoardRender = this.#actionNeedsBoardRender(action);
        this.#refreshHud();
        if (needsBoardRender) {
          this.#renderBoard();
        } else {
          this.#syncBoardLayerPositions();
        }
        this.#renderGhost();
        if (action.type === 'rotate' || action.type === 'selectPlacementTile' || action.type === 'setPlacementSelection') {
          this.#sendPlacementPreview();
        }
        const shouldCenter = action.type === 'place'
          ? phaseChanged || (this.#hotseat && focusChanged)
          : focusChanged || phaseChanged || action.type === 'pickDraft' || action.type === 'skip' || action.type === 'restart';
        if (shouldCenter && !autoDraftHoldStarted) {
          this.#centerOnFocusedBoard(focusChanged || phaseChanged || action.type === 'pickDraft');
        } else if (action.type === 'place') {
          this.#cancelCameraTransition();
        }
        this.#autoResolveForcedDraft();
      },
      onPlacementPreview: (preview) => {
        this.#handlePlacementPreview(preview);
      },
      onPlayerLeft: ({ playerIndex, name, players }) => {
        this.#playerNames = players?.length ? players : this.#playerNames;
        if (playerIndex !== this.#myPlayerIndex) {
          this.#lobbyNotice = `${name || 'The other player'} left the room.`;
        }
        this.#pendingUndoRequest = null;
        this.#remotePlacementPreviews.delete(playerIndex);
        this.#refreshHud();
        this.#renderBoard();
        this.#renderGhost();
      },
      onError: (message) => {
        this.#flashError(message);
      },
    });

    this.#mp.connect();
    this.#refreshHud();
    this.#renderBoard();
    return true;
  }

  #startHotseatGame(name, playerCount = this.#playerCount) {
    const cleanName = this.#savePlayerName(name);
    const count = this.#normalizePlayerCount(playerCount, this.#playerCount);
    const seed = randomSeed();
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('hotseat', '1');
    url.searchParams.set('seed', String(seed));
    url.searchParams.set('players', String(count));
    const playerNames = this.#defaultPlayerNames(cleanName, count);
    playerNames.forEach((playerName, index) => {
      url.searchParams.set(`p${index + 1}`, playerName);
    });
    history.replaceState(null, '', url.toString());

    this.#mp?.disconnect?.();
    this.#homeMode = false;
    this.#hotseat = true;
    this.#roomId = null;
    this.#playerCount = count;
    this.#myName = 'Hotseat';
    this.#connStatus = { state: 'hotseat' };
    this.#pendingUndoRequest = null;
    this.#lobbyNotice = null;
    this.#actionHistory = [];
    this.#initGame(seed, playerNames, count);
    this.#syncHotseatPlayerIndex();
    this.#mp = {
      sendAction: (type, payload = {}) => this.#applyLocalAction({ type, payload }),
      disconnect: () => {},
    };
    this.#ensureMiniMaps();
    this.#refreshHud();
    this.#renderBoard();
    this.#centerOnFocusedBoard(true);
  }

  #initMultiplayer() {
    const url = new URL(location.href);
    this.#hotseat = url.searchParams.get('hotseat') === '1';

    if (this.#hotseat) {
      const seed = Number.parseInt(url.searchParams.get('seed') || '', 10);
      const playerCount = this.#playerCountFromUrl(url, 2);
      const playerNames = Array.from({ length: playerCount }, (_, index) =>
        url.searchParams.get(`p${index + 1}`) || (index === 0 ? 'Codex' : index === 1 ? 'Helper' : `Player ${index + 1}`)
      );
      this.#playerCount = playerCount;
      this.#myName = 'Hotseat';
      this.#connStatus = { state: 'hotseat' };
      this.#pendingUndoRequest = null;
      this.#lobbyNotice = null;
      this.#actionHistory = [];
      this.#initGame(Number.isFinite(seed) ? seed : randomSeed(), playerNames, playerCount);
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
      this.#enterHomeMode(url);
      return;
    }

    const hasJoinIdentity = !!(url.searchParams.get('name') || url.searchParams.get('playerToken'));
    if (!hasJoinIdentity) {
      this.#enterHomeMode(url);
      return;
    }

    const name = this.#cleanPlayerName(url.searchParams.get('name') || this.#storedPlayerName());
    const proposedSeed = Number.parseInt(url.searchParams.get('seed') || '', 10);
    const playerCount = this.#playerCountFromUrl(url, this.#playerCount);
    this.#connectOnlineRoom(room, name, Number.isFinite(proposedSeed) ? proposedSeed : null, playerCount);
  }

  #syncHotseatPlayerIndex() {
    if (!this.#hotseat || !this.#game?.players?.length) return;
    if (this.#pendingUndoRequest) {
      const other = this.#game.players.findIndex((_, index) => index !== this.#pendingUndoRequest.requesterIndex);
      this.#myPlayerIndex = this.#game.players[other] ? other : 0;
      this.#myName = this.#playerNames[this.#myPlayerIndex] ?? this.#game.players[this.#myPlayerIndex]?.name ?? 'Hotseat';
      return;
    }

    const active = this.#activePlayerIndex();
    this.#myPlayerIndex = active ?? 0;
    this.#myName = this.#playerNames[this.#myPlayerIndex] ?? this.#game.players[this.#myPlayerIndex]?.name ?? 'Hotseat';
  }

  #applyLocalAction(action, { render = true } = {}) {
    const previousState = this.#game?.state;
    const autoDraftOrigin = this.#draftOriginSnapshotForAutoDraft(action, previousState);
    this.#actionHistory.push(action);
    this.#applyNetworkAction(action, { effects: render });
    this.#syncHotseatPlayerIndex();
    const focusChanged = this.#syncFocusedBoardToPhase();
    const phaseChanged = previousState != null && previousState !== this.#game?.state;
    const autoDraftHoldStarted = this.#maybeStartAutoDraftClaimHold(action, previousState, phaseChanged, autoDraftOrigin);
    const needsBoardRender = this.#actionNeedsBoardRender(action);

    if (!render) {
      this.#syncBoardLayerPositions();
      this.#autoResolveForcedDraft();
      return;
    }

    this.#refreshHud();
    if (needsBoardRender) {
      this.#renderBoard();
    } else {
      this.#syncBoardLayerPositions();
    }
    this.#renderGhost();
    const shouldCenter = action.type === 'place'
      ? phaseChanged || (this.#hotseat && focusChanged)
      : focusChanged || phaseChanged || action.type === 'pickDraft' || action.type === 'skip' || action.type === 'restart';
    if (shouldCenter && !autoDraftHoldStarted) {
      this.#centerOnFocusedBoard(focusChanged || phaseChanged || action.type === 'pickDraft');
    } else if (action.type === 'place') {
      this.#cancelCameraTransition();
    }
    this.#autoResolveForcedDraft();
  }

  #autoResolveForcedDraft() {
    if (!this.#game || this.#game.isGameOver || this.#game.state !== GameState.DRAFT) {
      this.#autoDraftInFlightKey = null;
      return;
    }
    if (!this.#canUseOnlineGame()) return;
    if (this.#pendingUndoRequest || !this.#isMyTurnToPick()) return;

    const available = this.#game.currentDraft
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.player == null);
    const index = this.#game.forcedDraftIndex;
    if (index == null) {
      this.#autoDraftInFlightKey = null;
      return;
    }

    const key = `${this.#game.round}:${this.#game.pickCursor}:${this.#game.currentPickingPlayerIndex}:${index}`;
    if (this.#autoDraftInFlightKey === key) return;

    this.#autoDraftInFlightKey = key;
    const message = available.length === 1
      ? 'Only one draft tile remains. Picking it automatically.'
      : 'No draft choice remains. Picking remaining tiles automatically.';
    this.#setCanvasNotice(message, 'info', 1200);
    this.#mp?.sendAction('pickDraft', { index, auto: true });
  }

  #isGameplayActionType(type) {
    return type === 'pickDraft'
      || type === 'rotate'
      || type === 'skip'
      || type === 'selectPlacementTile'
      || type === 'setPlacementSelection'
      || type === 'place'
      || type === 'restart';
  }

  #actionNeedsBoardRender(action) {
    return action?.type === 'pickDraft'
      || action?.type === 'place'
      || action?.type === 'skip'
      || action?.type === 'restart'
      || action?.type === 'approveUndo';
  }

  #resetPerfGame(seed, playerCount) {
    const count = this.#normalizePlayerCount(playerCount, this.#playerCount);
    const names = Array.from({ length: count }, (_, index) => (
      index === 0 ? 'Perf Blue' : index === 1 ? 'Perf Green' : `Perf ${index + 1}`
    ));

    this.#mp?.disconnect?.();
    this.#homeMode = false;
    this.#hotseat = true;
    this.#roomId = null;
    this.#myName = 'Perf';
    this.#connStatus = { state: 'perf' };
    this.#pendingUndoRequest = null;
    this.#lobbyNotice = null;
    this.#autoDraftInFlightKey = null;
    this.#hoverAnchor = null;
    this.#localPlacementFocus = null;
    this.#hoverAnchorAuto = false;
    this.#showPlacementScores = false;
    this.#moreOpen = false;
    this.#libraryOpen = false;
    this.#libraryFilter = null;
    this.#libraryFocusedDominoNumber = null;
    this.#scoreHistoryOpen = false;
    this.#scoreHistorySelectedId = null;
    this.#actionHistory = [];
    this.#remotePlacementPreviews.clear();
    this.#lastSentPlacementPreviewKey = '';
    this.#initGame(seed, names, count);
    this.#syncHotseatPlayerIndex();
    this.#mp = {
      sendAction: (type, payload = {}) => this.#applyLocalAction({ type, payload }),
      disconnect: () => {},
    };
  }

  #perfDraftUntilPlacement() {
    let picks = 0;
    let guard = 0;
    while (this.#game?.state === GameState.DRAFT && !this.#game.isGameOver && guard < 8) {
      guard += 1;
      const forcedIndex = this.#game.forcedDraftIndex;
      const index = forcedIndex ?? this.#game.currentDraft.findIndex((slot) => slot.player == null && !slot.placed);
      if (index < 0) break;
      this.#game.pickDraft(index);
      picks += 1;
    }
    return picks;
  }

  #perfChoosePlacementOption(options, offset = 0) {
    if (!options.length) return null;
    return options[offset % options.length];
  }

  #perfAdvanceGame(targetPlacements = 24) {
    const stats = {
      draftPicks: 0,
      placements: 0,
      skips: 0,
      failedPlacements: 0,
      guards: 0,
    };

    while (!this.#game.isGameOver && stats.placements < targetPlacements && stats.guards < 1000) {
      stats.guards += 1;

      if (this.#game.state === GameState.DRAFT) {
        stats.draftPicks += this.#perfDraftUntilPlacement();
        continue;
      }

      if (this.#game.state !== GameState.PLACE) break;

      const options = this.#game.getCurrentPlacementOptions();
      if (!options.length) {
        const skipped = this.#game.skipCurrentPlacement();
        if (skipped?.ok) stats.skips += 1;
        else break;
        continue;
      }

      const option = this.#perfChoosePlacementOption(options, stats.placements);
      this.#game.setCurrentPlacementSelection(option.dominoNumber, option.orientation);
      const result = this.#game.tryPlaceCurrentDominoAt(option.x, option.y, option.anchorEnd);
      if (result?.ok) {
        stats.placements += 1;
      } else {
        stats.failedPlacements += 1;
        const skipped = this.#game.skipCurrentPlacement();
        if (skipped?.ok) stats.skips += 1;
        else break;
      }
    }

    return stats;
  }

  #perfEnsurePlacementPhase() {
    let guard = 0;
    let draftPicks = 0;
    let skips = 0;
    while (!this.#game.isGameOver && guard < 200) {
      guard += 1;
      if (this.#game.state === GameState.DRAFT) {
        draftPicks += this.#perfDraftUntilPlacement();
        continue;
      }
      if (this.#game.state !== GameState.PLACE) break;

      const options = this.#game.getCurrentPlacementOptions();
      if (options.length) return { options, draftPicks, skips };

      const skipped = this.#game.skipCurrentPlacement();
      if (skipped?.ok) skips += 1;
      else break;
    }
    return { options: [], draftPicks, skips };
  }

  #perfCountersSnapshot() {
    return { ...this.#perfCounters };
  }

  #perfObjectCount(object = this.#tilesGroup) {
    if (!object) return 0;
    let count = 0;
    object.traverse(() => {
      count += 1;
    });
    return count;
  }

  #perfAnimatedObjectCountsByType() {
    const counts = {};
    for (const item of this.#animatedObjects) {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
    }
    return counts;
  }

  #perfSummary(values) {
    const clean = values
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    if (!clean.length) {
      return { count: 0, avg: 0, min: 0, p50: 0, p95: 0, max: 0 };
    }
    const pick = (p) => clean[Math.min(clean.length - 1, Math.floor((clean.length - 1) * p))];
    const sum = clean.reduce((total, value) => total + value, 0);
    return {
      count: clean.length,
      avg: sum / clean.length,
      min: clean[0],
      p50: pick(0.50),
      p95: pick(0.95),
      max: clean[clean.length - 1],
    };
  }

  #perfRoundMetric(metric) {
    const rounded = {};
    for (const [key, value] of Object.entries(metric)) {
      rounded[key] = typeof value === 'number' ? Number(value.toFixed(2)) : value;
    }
    return rounded;
  }

  #perfMeasureSync(fn) {
    const startedAt = performance.now();
    fn();
    return performance.now() - startedAt;
  }

  #perfNextFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve(performance.now()));
    });
  }

  async #perfMeasureAction(label, iterations, actionFn) {
    const syncMs = [];
    const nextFrameMs = [];
    const renderBoardDeltas = [];
    const renderGhostDeltas = [];

    for (let i = 0; i < iterations; i++) {
      const before = this.#perfCountersSnapshot();
      const startedAt = performance.now();
      actionFn(i);
      const syncDoneAt = performance.now();
      await this.#perfNextFrame();
      const frameDoneAt = performance.now();
      const after = this.#perfCountersSnapshot();

      syncMs.push(syncDoneAt - startedAt);
      nextFrameMs.push(frameDoneAt - startedAt);
      renderBoardDeltas.push(after.renderBoard - before.renderBoard);
      renderGhostDeltas.push(after.renderGhost - before.renderGhost);
    }

    return {
      label,
      syncMs: this.#perfRoundMetric(this.#perfSummary(syncMs)),
      nextFrameMs: this.#perfRoundMetric(this.#perfSummary(nextFrameMs)),
      renderBoardCalls: renderBoardDeltas.reduce((total, value) => total + value, 0),
      renderGhostCalls: renderGhostDeltas.reduce((total, value) => total + value, 0),
    };
  }

  async #perfMeasureStep(label, actionFn) {
    const before = this.#perfCountersSnapshot();
    const startedAt = performance.now();
    actionFn();
    const syncDoneAt = performance.now();
    await this.#perfNextFrame();
    const frameDoneAt = performance.now();
    const after = this.#perfCountersSnapshot();

    return {
      label,
      syncMs: syncDoneAt - startedAt,
      nextFrameMs: frameDoneAt - startedAt,
      renderBoardCalls: after.renderBoard - before.renderBoard,
      renderGhostCalls: after.renderGhost - before.renderGhost,
    };
  }

  #perfSummarizeSteps(steps) {
    const byLabel = new Map();
    for (const step of steps) {
      if (!byLabel.has(step.label)) {
        byLabel.set(step.label, {
          syncMs: [],
          nextFrameMs: [],
          renderBoardCalls: 0,
          renderGhostCalls: 0,
        });
      }
      const bucket = byLabel.get(step.label);
      bucket.syncMs.push(step.syncMs);
      bucket.nextFrameMs.push(step.nextFrameMs);
      bucket.renderBoardCalls += step.renderBoardCalls;
      bucket.renderGhostCalls += step.renderGhostCalls;
    }

    const summary = {};
    for (const [label, bucket] of byLabel.entries()) {
      summary[label] = {
        count: bucket.syncMs.length,
        syncMs: this.#perfRoundMetric(this.#perfSummary(bucket.syncMs)),
        nextFrameMs: this.#perfRoundMetric(this.#perfSummary(bucket.nextFrameMs)),
        renderBoardCalls: bucket.renderBoardCalls,
        renderGhostCalls: bucket.renderGhostCalls,
      };
    }
    return summary;
  }

  #perfFirstAvailableDraftIndex() {
    return this.#game?.currentDraft?.findIndex((slot) => slot?.player == null && !slot?.placed) ?? -1;
  }

  #perfPlacementOptionForTurn() {
    const options = this.#uniqueVisiblePlacementOptions(this.#currentPlacementOptions(), { preserveDomino: true });
    if (!options.length) return null;
    const advisor = this.#advisorPlacementOption();
    if (advisor) {
      return options.find((option) =>
        option.dominoNumber === advisor.dominoNumber
        && option.orientation === advisor.orientation
        && option.x === advisor.x
        && option.y === advisor.y
        && option.anchorEnd === advisor.anchorEnd
      ) ?? options[0];
    }
    return options[0];
  }

  async #perfMeasureFrames(frameCount = 60) {
    const intervals = [];
    let previous = await this.#perfNextFrame();
    for (let i = 0; i < frameCount; i++) {
      const next = await this.#perfNextFrame();
      intervals.push(next - previous);
      previous = next;
    }
    return this.#perfRoundMetric(this.#perfSummary(intervals));
  }

  async #runLatePlacementPerformanceScenario(options = {}) {
    const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : 123;
    const playerCount = this.#normalizePlayerCount(options.playerCount ?? 2, 2);
    const setupPlacements = Math.max(0, Math.min(40, Number.parseInt(options.setupPlacements ?? 28, 10)));
    const iterations = Math.max(1, Math.min(80, Number.parseInt(options.iterations ?? 30, 10)));
    const frameSamples = Math.max(1, Math.min(180, Number.parseInt(options.frameSamples ?? 60, 10)));

    const setupStartedAt = performance.now();
    this.#resetPerfGame(seed, playerCount);
    const setupStats = this.#perfAdvanceGame(setupPlacements);
    const placementSetup = this.#perfEnsurePlacementPhase();
    const setupMs = performance.now() - setupStartedAt;

    this.#syncHotseatPlayerIndex();
    this.#syncFocusedBoardToPhase();
    this.#refreshHud();
    const initialRenderBoardMs = this.#perfMeasureSync(() => this.#renderBoard());
    this.#centerOnFocusedBoard(true);
    this.#renderGhost();
    await this.#perfNextFrame();

    const initialOptions = this.#uniqueVisiblePlacementOptions(this.#currentPlacementOptions(), { preserveDomino: true });
    if (initialOptions.length) {
      this.#applyPlacementOption(initialOptions[0]);
      this.#renderGhost();
      this.#refreshHud();
      await this.#perfNextFrame();
    }

    const interactionCountersBefore = this.#perfCountersSnapshot();
    const cycle = await this.#perfMeasureAction('cycle-local-placement', iterations, () => {
      this.#cycleLocalPlacement(1);
    });
    const rotate = await this.#perfMeasureAction('rotate-placement', iterations, () => {
      this.#applyLocalAction({ type: 'rotate', payload: this.#placementActionPayload() });
    });
    const frame = await this.#perfMeasureFrames(frameSamples);
    const interactionCountersAfter = this.#perfCountersSnapshot();

    return {
      scenario: 'late-placement',
      seed,
      playerCount,
      setup: {
        requestedPlacements: setupPlacements,
        setupMs: Number(setupMs.toFixed(2)),
        initialRenderBoardMs: Number(initialRenderBoardMs.toFixed(2)),
        boardObjectCount: this.#perfObjectCount(),
        animatedObjectCount: this.#animatedObjects.length,
        optionsAvailable: placementSetup.options.length,
        ...setupStats,
        setupDraftPicks: setupStats.draftPicks + placementSetup.draftPicks,
        setupSkips: setupStats.skips + placementSetup.skips,
      },
      actions: {
        cycle,
        rotate,
      },
      frame,
      counters: {
        beforeInteractions: interactionCountersBefore,
        afterInteractions: interactionCountersAfter,
        renderBoardDuringInteractions: interactionCountersAfter.renderBoard - interactionCountersBefore.renderBoard,
        renderGhostDuringInteractions: interactionCountersAfter.renderGhost - interactionCountersBefore.renderGhost,
      },
    };
  }

  async #runPlaythroughPerformanceScenario(options = {}) {
    const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : 123;
    const playerCount = this.#normalizePlayerCount(options.playerCount ?? 2, 2);
    const maxActions = Math.max(1, Math.min(240, Number.parseInt(options.maxActions ?? 180, 10)));
    const frameSamples = Math.max(1, Math.min(180, Number.parseInt(options.frameSamples ?? 60, 10)));

    const setupStartedAt = performance.now();
    this.#resetPerfGame(seed, playerCount);
    this.#syncHotseatPlayerIndex();
    this.#syncFocusedBoardToPhase();
    this.#refreshHud();
    const initialRenderBoardMs = this.#perfMeasureSync(() => this.#renderBoard());
    this.#centerOnFocusedBoard(true);
    this.#renderGhost();
    await this.#perfNextFrame();
    const initialObjectCount = this.#perfObjectCount();
    const initialAnimatedObjectCount = this.#animatedObjects.length;
    const setupMs = performance.now() - setupStartedAt;

    const steps = [];
    const countersBefore = this.#perfCountersSnapshot();
    let draftPicks = 0;
    let placements = 0;
    let skips = 0;
    let failedPlacements = 0;
    let guards = 0;

    while (!this.#game.isGameOver && guards < maxActions) {
      guards += 1;
      this.#syncHotseatPlayerIndex();

      if (this.#game.state === GameState.DRAFT) {
        const activeIdx = this.#game.currentPickingPlayerIndex;
        const suggestion = this.#advisor.suggestDraftMove(this.#game, activeIdx);
        const index = Number.isInteger(suggestion?.index) ? suggestion.index : this.#perfFirstAvailableDraftIndex();
        if (index < 0) break;
        steps.push(await this.#perfMeasureStep('draft-pick', () => {
          this.#mp?.sendAction('pickDraft', { index, perf: true });
        }));
        draftPicks += 1;
        continue;
      }

      if (this.#game.state === GameState.PLACE) {
        const option = this.#perfPlacementOptionForTurn();
        if (!option) {
          steps.push(await this.#perfMeasureStep('skip-placement', () => {
            this.#mp?.sendAction('skip', this.#placementActionPayload({ perf: true }));
          }));
          skips += 1;
          continue;
        }

        steps.push(await this.#perfMeasureStep('select-placement', () => {
          this.#applyPlacementOption(option);
          this.#renderGhost();
          this.#syncMobileActions();
          this.#refreshHud();
        }));

        const beforePlacements = this.#game.players
          .reduce((total, player) => total + Math.max(0, Object.keys(player.board.board).length - 1), 0);
        steps.push(await this.#perfMeasureStep('confirm-placement', () => {
          this.#tryPlaceAtHover();
        }));
        const afterPlacements = this.#game.players
          .reduce((total, player) => total + Math.max(0, Object.keys(player.board.board).length - 1), 0);
        if (afterPlacements > beforePlacements) placements += 1;
        else failedPlacements += 1;
        continue;
      }

      break;
    }

    const countersAfter = this.#perfCountersSnapshot();
    const frame = await this.#perfMeasureFrames(frameSamples);

    return {
      scenario: 'playthrough',
      seed,
      playerCount,
      setup: {
        setupMs: Number(setupMs.toFixed(2)),
        initialRenderBoardMs: Number(initialRenderBoardMs.toFixed(2)),
        boardObjectCount: initialObjectCount,
        animatedObjectCount: initialAnimatedObjectCount,
      },
      playthrough: {
        completed: Boolean(this.#game.isGameOver),
        guards,
        draftPicks,
        placements,
        skips,
        failedPlacements,
        finalState: this.#game.state?.description ?? String(this.#game.state),
        finalBoardObjectCount: this.#perfObjectCount(),
        finalAnimatedObjectCount: this.#animatedObjects.length,
        scores: this.#game.players.map((player, index) => ({
          playerIndex: index,
          name: player.name,
          score: player.board.score,
          tiles: Math.max(0, Object.keys(player.board.board).length - 1),
        })),
      },
      actions: this.#perfSummarizeSteps(steps),
      frame,
      counters: {
        beforeInteractions: countersBefore,
        afterInteractions: countersAfter,
        renderBoardDuringInteractions: countersAfter.renderBoard - countersBefore.renderBoard,
        renderGhostDuringInteractions: countersAfter.renderGhost - countersBefore.renderGhost,
      },
    };
  }

  async #runTableMotionPerformanceScenario(options = {}) {
    const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : 123;
    const playerCount = this.#normalizePlayerCount(options.playerCount ?? 2, 2);
    const maxActions = Math.max(1, Math.min(240, Number.parseInt(options.maxActions ?? 120, 10)));
    const frameSamples = Math.max(1, Math.min(180, Number.parseInt(options.frameSamples ?? 60, 10)));
    const previousAnimationFilter = this.#perfAnimationTypeFilter;
    this.#perfAnimationTypeFilter = new Set([
      'draftClaim',
      'draftTray',
      'kingdomMat',
      'placementGhost',
      'placementReturn',
      'skipDiscard',
    ]);

    try {
      const setupStartedAt = performance.now();
      this.#resetPerfGame(seed, playerCount);
      this.#syncHotseatPlayerIndex();
      this.#syncFocusedBoardToPhase();
      this.#refreshHud();
      const initialRenderBoardMs = this.#perfMeasureSync(() => this.#renderBoard());
      this.#centerOnFocusedBoard(true);
      this.#renderGhost();
      await this.#perfNextFrame();
      const initialObjectCount = this.#perfObjectCount();
      const initialAnimatedObjectCount = this.#animatedObjects.length;
      const initialAnimatedObjectTypes = this.#perfAnimatedObjectCountsByType();
      const setupMs = performance.now() - setupStartedAt;

      const steps = [];
      const countersBefore = this.#perfCountersSnapshot();
      let draftPicks = 0;
      let placements = 0;
      let skips = 0;
      let failedPlacements = 0;
      let guards = 0;

      while (!this.#game.isGameOver && guards < maxActions) {
        guards += 1;
        this.#syncHotseatPlayerIndex();

        if (this.#game.state === GameState.DRAFT) {
          const activeIdx = this.#game.currentPickingPlayerIndex;
          const suggestion = this.#advisor.suggestDraftMove(this.#game, activeIdx);
          const index = Number.isInteger(suggestion?.index) ? suggestion.index : this.#perfFirstAvailableDraftIndex();
          if (index < 0) break;
          steps.push(await this.#perfMeasureStep('draft-pick', () => {
            this.#mp?.sendAction('pickDraft', { index, perf: true });
          }));
          draftPicks += 1;
          continue;
        }

        if (this.#game.state === GameState.PLACE) {
          const option = this.#perfPlacementOptionForTurn();
          if (!option) {
            steps.push(await this.#perfMeasureStep('skip-placement', () => {
              this.#mp?.sendAction('skip', this.#placementActionPayload({ perf: true }));
            }));
            skips += 1;
            continue;
          }

          steps.push(await this.#perfMeasureStep('select-placement', () => {
            this.#applyPlacementOption(option);
            this.#renderGhost();
            this.#syncMobileActions();
            this.#refreshHud();
          }));

          const beforePlacements = this.#game.players
            .reduce((total, player) => total + Math.max(0, Object.keys(player.board.board).length - 1), 0);
          steps.push(await this.#perfMeasureStep('confirm-placement', () => {
            this.#tryPlaceAtHover();
          }));
          const afterPlacements = this.#game.players
            .reduce((total, player) => total + Math.max(0, Object.keys(player.board.board).length - 1), 0);
          if (afterPlacements > beforePlacements) placements += 1;
          else failedPlacements += 1;
          continue;
        }

        break;
      }

      const countersAfter = this.#perfCountersSnapshot();
      const frame = await this.#perfMeasureFrames(frameSamples);

      return {
        scenario: 'table-motion',
        seed,
        playerCount,
        setup: {
          setupMs: Number(setupMs.toFixed(2)),
          initialRenderBoardMs: Number(initialRenderBoardMs.toFixed(2)),
          boardObjectCount: initialObjectCount,
          animatedObjectCount: initialAnimatedObjectCount,
          animatedObjectTypes: initialAnimatedObjectTypes,
        },
        playthrough: {
          completed: Boolean(this.#game.isGameOver),
          guards,
          draftPicks,
          placements,
          skips,
          failedPlacements,
          finalState: this.#game.state?.description ?? String(this.#game.state),
          finalBoardObjectCount: this.#perfObjectCount(),
          finalAnimatedObjectCount: this.#animatedObjects.length,
          finalAnimatedObjectTypes: this.#perfAnimatedObjectCountsByType(),
        },
        actions: this.#perfSummarizeSteps(steps),
        frame,
        counters: {
          beforeInteractions: countersBefore,
          afterInteractions: countersAfter,
          renderBoardDuringInteractions: countersAfter.renderBoard - countersBefore.renderBoard,
          renderGhostDuringInteractions: countersAfter.renderGhost - countersBefore.renderGhost,
        },
      };
    } finally {
      this.#perfAnimationTypeFilter = previousAnimationFilter;
    }
  }

  #applyGameplayAction(action) {
    switch (action.type) {
      case 'pickDraft':
        this.#game.pickDraft(action.payload.index);
        return;
      case 'rotate': {
        const playerIndex = Number.isInteger(action.payload?.playerIndex) ? action.payload.playerIndex : null;
        this.#applyPayloadPlacementSelection(playerIndex, action.payload);
        if (playerIndex == null) this.#game.rotateCurrentDomino();
        else this.#game.rotatePlacementDominoForPlayer(playerIndex);
        return;
      }
      case 'skip': {
        const playerIndex = Number.isInteger(action.payload?.playerIndex) ? action.payload.playerIndex : null;
        this.#applyPayloadPlacementSelection(playerIndex, action.payload);
        if (playerIndex == null) this.#game.skipCurrentPlacement();
        else this.#game.skipPlacementForPlayer(playerIndex);
        return;
      }
      case 'selectPlacementTile': {
        const playerIndex = Number.isInteger(action.payload?.playerIndex) ? action.payload.playerIndex : null;
        if (playerIndex == null) this.#game.selectCurrentPlacementDomino(action.payload?.dominoNumber);
        else this.#game.selectPlacementDominoForPlayer(playerIndex, action.payload?.dominoNumber);
        return;
      }
      case 'setPlacementSelection': {
        const playerIndex = Number.isInteger(action.payload?.playerIndex) ? action.payload.playerIndex : null;
        if (playerIndex == null) {
          this.#game.setCurrentPlacementSelection(
            action.payload?.dominoNumber,
            action.payload?.orientation
          );
        } else {
          this.#game.setPlacementSelectionForPlayer(
            playerIndex,
            action.payload?.dominoNumber,
            action.payload?.orientation
          );
        }
        return;
      }
      case 'place': {
        // Network-safe payloads use string anchor ends.
        // Default to LEFT for backwards/defensive compatibility.
        const playerIndex = Number.isInteger(action.payload?.playerIndex) ? action.payload.playerIndex : null;
        this.#applyPayloadPlacementSelection(playerIndex, action.payload);
        const anchorEnd = action.payload.anchorEnd === 'RIGHT' ? DominoEnd.RIGHT : DominoEnd.LEFT;
        if (playerIndex == null) {
          this.#game.tryPlaceCurrentDominoAt(action.payload.x, action.payload.y, anchorEnd);
        } else {
          this.#game.tryPlaceDominoAtForPlayer(playerIndex, action.payload.x, action.payload.y, anchorEnd);
        }
        return;
      }
      case 'restart': {
        // Restart uses a new seed to avoid repeating the same shuffle.
        const seed = action.payload.seed ?? randomSeed();
        this.#pendingUndoRequest = null;
        this.#initGame(seed, this.#playerNames);
        return;
      }
    }
  }

  #applyPayloadPlacementSelection(playerIndex, payload = {}) {
    const dominoNumber = Number(payload?.dominoNumber);
    const orientation = Number(payload?.orientation);
    if (!Number.isInteger(dominoNumber) || ![0, 90, 180, 270].includes(orientation)) return null;

    if (playerIndex == null) {
      return this.#game.setCurrentPlacementSelection?.(dominoNumber, orientation) ?? null;
    }
    return this.#game.setPlacementSelectionForPlayer?.(playerIndex, dominoNumber, orientation) ?? null;
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

  #applyNetworkAction(action, { effects = true } = {}) {
    if (this.#isGameplayActionType(action.type)) {
      this.#invalidatePlacementCaches();
      if (
        action.type === 'setPlacementSelection'
        && !this.#hotseat
        && action.payload?.playerIndex === this.#myPlayerIndex
        && Number.isInteger(action.payload?.selectionId)
        && action.payload.selectionId < this.#latestLocalPlacementSelectionId
      ) {
        return;
      }
      if (action.type === 'pickDraft') {
        this.#prepareDraftClaimAnimation(action.payload?.index);
      } else if (action.type === 'skip') {
        this.#preparePlacementSkipAnimation(action);
      }
      const scoreBurst = effects ? this.#placementScoreBurstSnapshot(action) : null;
      this.#applyGameplayAction(action);
      this.#startPlacementScoreBurst(scoreBurst);
      if (
        (action.type === 'rotate' || action.type === 'selectPlacementTile')
        && !this.#isApplyingPlacementOption
        && !action.payload?.rackOnly
      ) {
        this.#repairSelectedPlacementAfterDominoChange();
      } else if (action.type === 'pickDraft' || action.type === 'restart') {
        this.#remotePlacementPreviews.clear();
        this.#placementReturnAnimations.clear();
        if (action.type === 'restart') this.#placementSkipAnimations.clear();
        this.#hoverAnchor = null;
        this.#localPlacementFocus = null;
        this.#hoverAnchorAuto = false;
      } else if (action.type === 'place' || action.type === 'skip') {
        const playerIndex = Number.isInteger(action.payload?.playerIndex) ? action.payload.playerIndex : null;
        if (playerIndex == null) this.#remotePlacementPreviews.clear();
        else this.#remotePlacementPreviews.delete(playerIndex);
        for (const [dominoNumber, animation] of this.#placementReturnAnimations) {
          if (playerIndex == null || animation.playerIndex === playerIndex) {
            this.#placementReturnAnimations.delete(dominoNumber);
          }
        }

        if (this.#hotseat || playerIndex == null || playerIndex === this.#myPlayerIndex) {
          this.#hoverAnchor = null;
          this.#localPlacementFocus = null;
          this.#hoverAnchorAuto = false;
        }
      }
      return;
    }

    switch (action.type) {
      case 'placementPreview':
        this.#handlePlacementPreview(action.payload, { render: false });
        return;
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

  #handlePlacementPreview(preview, { render = true } = {}) {
    const playerIndex = Number(preview?.playerIndex);
    if (!Number.isInteger(playerIndex) || playerIndex < 0) return;
    if (playerIndex === this.#myPlayerIndex) return;

    const hasPendingPlacement = (this.#game?.getCurrentPlacingChoicesForPlayer?.(playerIndex) ?? []).length > 0;
    if (
      preview?.clear
      || this.#game?.state !== GameState.PLACE
      || !hasPendingPlacement
    ) {
      this.#remotePlacementPreviews.delete(playerIndex);
      if (render) this.#renderGhost();
      return;
    }

    const dominoNumber = Number(preview.dominoNumber);
    const orientation = Number(preview.orientation);
    const x = Number(preview.x);
    const y = Number(preview.y);
    if (
      !Number.isInteger(dominoNumber)
      || ![0, 90, 180, 270].includes(orientation)
      || !Number.isInteger(x)
      || !Number.isInteger(y)
    ) {
      return;
    }

    this.#remotePlacementPreviews.set(playerIndex, {
      playerIndex,
      dominoNumber,
      orientation,
      x,
      y,
      anchorEnd: preview.anchorEnd === 'RIGHT' ? DominoEnd.RIGHT : DominoEnd.LEFT,
      t: Number(preview.t) || Date.now(),
    });
    if (render) this.#renderGhost();
  }

  #sendPlacementPreview(clear = false) {
    if (this.#hotseat || typeof this.#mp?.sendPlacementPreview !== 'function') return;
    if (this.#myPlayerIndex == null) return;
    if (!this.#canUseOnlineGame()) return;
    if (!this.#isMyTurnToPlace()) return;

    const payload = { playerIndex: this.#myPlayerIndex, clear: Boolean(clear) };
    if (!clear) {
      const drafted = this.#currentPlacementDraftedTile();
      if (!drafted || !this.#hoverAnchor) return this.#sendPlacementPreview(true);
      payload.dominoNumber = drafted.domino.number;
      payload.orientation = drafted.domino.orientation;
      payload.x = this.#hoverAnchor.x;
      payload.y = this.#hoverAnchor.y;
      payload.anchorEnd = this.#hoverAnchor.anchorEnd === DominoEnd.RIGHT ? 'RIGHT' : 'LEFT';
    }

    const key = JSON.stringify(payload);
    if (key === this.#lastSentPlacementPreviewKey) return;
    this.#lastSentPlacementPreviewKey = key;
    this.#mp.sendPlacementPreview(payload);
  }

  #isMyTurnToPick() {
    if (!this.#game) return false;
    if (!this.#canUseOnlineGame()) return false;
    if (this.#hotseat) return this.#game.state === GameState.DRAFT && this.#game.currentPickingPlayerIndex != null;
    return this.#myPlayerIndex != null && this.#game.state === GameState.DRAFT && this.#myPlayerIndex === this.#game.currentPickingPlayerIndex;
  }

  #isMyTurnToPlace() {
    if (!this.#game) return false;
    if (!this.#canUseOnlineGame()) return false;
    if (this.#hotseat) return this.#game.state === GameState.PLACE && this.#game.currentPlacingPlayerIndex != null;
    return this.#myPlayerIndex != null
      && this.#game.state === GameState.PLACE
      && this.#game.getCurrentPlacingChoicesForPlayer?.(this.#myPlayerIndex).length > 0;
  }

  #placementPlayerIndex() {
    if (!this.#game || this.#game.state !== GameState.PLACE) return null;
    if (this.#hotseat) return this.#game.currentPlacingPlayerIndex;
    if (
      this.#myPlayerIndex != null
      && this.#game.getCurrentPlacingChoicesForPlayer?.(this.#myPlayerIndex).length > 0
    ) {
      return this.#myPlayerIndex;
    }
    return this.#game.currentPlacingPlayerIndex;
  }

  #placementActionPayload(payload = {}) {
    const nextPayload = { ...payload };
    const drafted = this.#currentPlacementDraftedTile();
    if (this.#game?.state === GameState.PLACE && drafted) {
      if (nextPayload.dominoNumber == null) nextPayload.dominoNumber = drafted.domino.number;
      if (nextPayload.orientation == null) nextPayload.orientation = drafted.domino.orientation;
    }
    if (this.#hotseat || this.#myPlayerIndex == null) return nextPayload;
    return { ...nextPayload, playerIndex: this.#myPlayerIndex };
  }

  #currentPlacementDraftedTile() {
    const playerIndex = this.#placementPlayerIndex();
    if (playerIndex == null) return null;
    return this.#game.currentPlacingDraftedTileForPlayer?.(playerIndex) ?? this.#game.currentPlacingDraftedTile;
  }

  #currentPlacementChoices() {
    const playerIndex = this.#placementPlayerIndex();
    if (playerIndex == null) return [];
    return this.#game.getCurrentPlacingChoicesForPlayer?.(playerIndex) ?? this.#game.getCurrentPlacingChoices?.() ?? [];
  }

  #invalidatePlacementCaches() {
    this.#placementCacheVersion += 1;
    this.#placementOptionsCache.clear();
    this.#advisorPlacementCache.clear();
    this.#invalidateTabletopLayoutCache();
  }

  #currentPlacementOptions() {
    const playerIndex = this.#placementPlayerIndex();
    if (playerIndex == null) return [];
    const cached = this.#placementOptionsCache.get(playerIndex);
    if (cached?.version === this.#placementCacheVersion) return cached.options;
    const options = this.#game.getCurrentPlacementOptionsForPlayer?.(playerIndex) ?? this.#game.getCurrentPlacementOptions?.() ?? [];
    this.#placementOptionsCache.set(playerIndex, {
      version: this.#placementCacheVersion,
      options,
    });
    return options;
  }

  #canSkipPlacement() {
    const playerIndex = this.#placementPlayerIndex();
    if (playerIndex == null) return false;
    return this.#game.canSkipPlacementForPlayer?.(playerIndex) ?? this.#game.canSkipCurrentPlacement?.() ?? false;
  }

  #activePlayerIndex() {
    if (!this.#game?.players?.length) return null;
    if (this.#game.isGameOver) return null;
    if (this.#game.state === GameState.PLACE) return this.#placementPlayerIndex();
    return this.#game.currentPickingPlayerIndex;
  }

  #roundProgress(g = this.#game) {
    if (!g) return { round: 1, total: 1 };
    const round = Math.max(1, g.round || 1);
    const drawSize = Math.max(1, g.currentDraft?.length || 4);
    const remainingRounds = g.isGameOver ? 0 : Math.ceil((g.remainingDominoNumbers?.length ?? 0) / drawSize);
    return {
      round,
      total: Math.max(round, round + remainingRounds),
    };
  }

  #roundProgressLabel(g = this.#game) {
    const { round, total } = this.#roundProgress(g);
    return `Round ${round}/${total}`;
  }

  #createRoundProgress(g = this.#game) {
    const { round, total } = this.#roundProgress(g);
    const progress = document.createElement('div');
    progress.className = 'roundProgress';

    const label = document.createElement('span');
    label.textContent = `Round ${round} of ${total}`;

    const pips = document.createElement('div');
    pips.className = 'roundPips';
    pips.setAttribute('aria-label', `Round ${round} of ${total}`);
    const visiblePips = Math.min(total, 16);
    for (let i = 1; i <= visiblePips; i++) {
      const pip = document.createElement('span');
      pip.className = 'roundPip';
      pip.classList.toggle('done', i < round);
      pip.classList.toggle('current', i === round);
      pips.append(pip);
    }

    progress.append(label, pips);
    return progress;
  }

  #draftTurnMeta(pickOrder, pickedCount, playerIndex) {
    const remaining = pickOrder.slice(pickedCount);
    const picksLeft = remaining.filter((idx) => idx === playerIndex).length;
    const pickNumber = pickOrder.slice(0, pickedCount + 1).filter((idx) => idx === playerIndex).length;
    const totalPicks = pickOrder.filter((idx) => idx === playerIndex).length;
    const backToBack = remaining[1] === playerIndex;
    return { picksLeft, pickNumber, totalPicks, backToBack };
  }

  #syncFocusedBoardToPhase() {
    if (!this.#game?.players?.length) return false;
    const active = this.#activePlayerIndex();
    if (active == null) return false;
    if (this.#focusedPlayerIndex === active) return false;
    this.#focusedPlayerIndex = active;
    return true;
  }

  #setHudCollapsed(collapsed) {
    this.#hudCollapsed = !!collapsed;
    this.#hud?.classList.toggle('collapsed', this.#hudCollapsed);

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

  #isSplitViewport() {
    const w = window.innerWidth || 0;
    return w > 520;
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
    const drafted = this.#currentPlacementDraftedTile();
    const show = false;
    this.#mobileActions.classList.toggle('show', show);
    if (!show) {
      this.#btnMobilePlace.textContent = 'Place';
      return;
    }

    const canAct = !!drafted && !this.#isGameplayPausedForUndo();
    const canSkip = canAct && this.#canSkipPlacement();
    const canUndo = this.#myPlayerIndex != null && !!this.#latestUndoablePlaceAction() && !this.#pendingUndoRequest;
    this.#btnMobileRotate.disabled = !canAct;
    this.#btnMobileSkip.disabled = !canSkip;
    this.#btnMobileSkip.hidden = !canSkip;
    this.#btnMobileUndo.disabled = !canUndo;
    this.#btnMobileUndo.hidden = !canUndo;
    this.#btnMobileNext.disabled = !canAct;
    this.#btnMobilePlace.disabled = !canAct;
    this.#btnMobilePlace.textContent = 'Place';
  }

  #syncMobilePlacementStack() {
    if (!this.#root) return;
    const rootRect = this.#root.getBoundingClientRect();
    const hudRect = this.#hud && !this.#hud.hidden ? this.#hud.getBoundingClientRect() : null;
    const dockLeft = hudRect
      ? Math.round(hudRect.left - rootRect.left + hudRect.width / 2)
      : Math.round(rootRect.width / 2);
    this.#root.style.setProperty('--placement-dock-left', `${dockLeft}px`);

    if (!this.#isMobileViewport()) {
      this.#root.style.removeProperty('--mobile-hud-bottom');
      const gap = 8;
      const dockVisible = this.#localPlacementDock && !this.#localPlacementDock.hidden;
      const dockHeight = dockVisible ? this.#localPlacementDock.getBoundingClientRect().height : 0;
      const dockBottom = hudRect
        ? Math.round(rootRect.bottom - hudRect.top + gap)
        : 12;
      const noticeBottom = dockVisible ? dockBottom + dockHeight + gap : 76;
      this.#root.style.setProperty('--placement-dock-bottom', `${dockBottom}px`);
      this.#root.style.setProperty('--placement-notice-bottom', `${noticeBottom}px`);
      return;
    }

    const gap = 8;
    const primaryVisible = this.#primaryControlsRow && !this.#primaryControlsRow.hidden;
    const primaryHeight = primaryVisible ? this.#primaryControlsRow.getBoundingClientRect().height : 0;
    const hudBottom = primaryVisible ? Math.round(primaryHeight + 16) : 8;
    const hudHeight = hudRect ? hudRect.height : 0;
    const dockVisible = this.#localPlacementDock && !this.#localPlacementDock.hidden;
    const dockHeight = dockVisible ? this.#localPlacementDock.getBoundingClientRect().height : 0;
    const dockBottom = Math.round(hudBottom + hudHeight + gap);
    const noticeBottom = Math.round(dockVisible
      ? dockBottom + dockHeight + gap
      : hudBottom + hudHeight + gap);

    this.#root.style.setProperty('--mobile-hud-bottom', `${hudBottom}px`);
    this.#root.style.setProperty('--placement-dock-bottom', `${dockBottom}px`);
    this.#root.style.setProperty('--placement-notice-bottom', `${noticeBottom}px`);
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
      this.#root?.classList.remove('hasCanvasNotice');
      this.#syncMobilePlacementStack();
      return;
    }

    this.#canvasNotice.textContent = text;
    this.#canvasNotice.classList.remove('error', 'info');
    this.#canvasNotice.classList.add(tone === 'info' ? 'info' : 'error', 'show');
    this.#root?.classList.add('hasCanvasNotice');
    this.#syncMobilePlacementStack();

    if (autoHideMs > 0) {
      this.#canvasNoticeTimer = setTimeout(() => {
        this.#setCanvasNotice('');
      }, autoHideMs);
    }
  }

  #createDominoPreview(domino, compact = false) {
    const wrap = document.createElement('div');
    wrap.className = compact ? 'dominoPreview compact' : 'dominoPreview';

    const canvas = document.createElement('canvas');
    canvas.className = 'dominoPreviewCanvas';
    canvas.width = 260;
    canvas.height = 132;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      `Domino ${landscapeLabel(domino.leftEnd.landscape)} ${domino.leftEnd.crowns || 0} crowns and ${landscapeLabel(domino.rightEnd.landscape)} ${domino.rightEnd.crowns || 0} crowns`
    );

    this.#drawDominoPreview(canvas, domino);
    wrap.append(canvas);
    return wrap;
  }

  #drawIsoTile(ctx, tile, cx, cy, tileW, tileH, depth, seedKey) {
    const pTop = { x: cx, y: cy - tileH / 2 };
    const pRight = { x: cx + tileW / 2, y: cy };
    const pBottom = { x: cx, y: cy + tileH / 2 };
    const pLeft = { x: cx - tileW / 2, y: cy };
    const down = { x: 0, y: depth };

    ctx.fillStyle = 'rgba(47, 52, 57, 0.84)';
    ctx.beginPath();
    ctx.moveTo(pLeft.x, pLeft.y);
    ctx.lineTo(pBottom.x, pBottom.y);
    ctx.lineTo(pBottom.x + down.x, pBottom.y + down.y);
    ctx.lineTo(pLeft.x + down.x, pLeft.y + down.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(32, 36, 41, 0.92)';
    ctx.beginPath();
    ctx.moveTo(pRight.x, pRight.y);
    ctx.lineTo(pBottom.x, pBottom.y);
    ctx.lineTo(pBottom.x + down.x, pBottom.y + down.y);
    ctx.lineTo(pRight.x + down.x, pRight.y + down.y);
    ctx.closePath();
    ctx.fill();

    const texture = createLandscapeTileCanvas(tile.landscape, tile.crowns || 0, seedKey, 128);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pTop.x, pTop.y);
    ctx.lineTo(pRight.x, pRight.y);
    ctx.lineTo(pBottom.x, pBottom.y);
    ctx.lineTo(pLeft.x, pLeft.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(
      (pRight.x - pTop.x) / texture.width,
      (pRight.y - pTop.y) / texture.width,
      (pLeft.x - pTop.x) / texture.height,
      (pLeft.y - pTop.y) / texture.height,
      pTop.x,
      pTop.y
    );
    ctx.drawImage(texture, 0, 0);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pTop.x, pTop.y);
    ctx.lineTo(pRight.x, pRight.y);
    ctx.lineTo(pBottom.x, pBottom.y);
    ctx.lineTo(pLeft.x, pLeft.y);
    ctx.closePath();
    ctx.stroke();

    if ((tile.crowns || 0) > 0) {
      ctx.save();
      ctx.font = '700 18px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(20, 16, 6, 0.72)';
      ctx.fillText(crownsText(tile.crowns), cx + 2, cy - 1);
      ctx.fillStyle = '#ffd96e';
      ctx.fillText(crownsText(tile.crowns), cx, cy - 3);
      ctx.restore();
    }
  }

  #drawDominoPreview(canvas, domino) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const connectedEdge = domino.getConnectedEdge(DominoEnd.LEFT);
    const offset = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge) ?? { x: 1, y: 0 };
    const tiles = [
      { x: 0, y: 0, tile: domino.leftEnd },
      { x: offset.x, y: offset.y, tile: domino.rightEnd },
    ];
    const tileW = 124;
    const tileH = 72;
    const depth = 16;
    const iso = (x, y) => ({
      x: (x - y) * tileW / 2,
      y: (x + y) * tileH / 2,
    });

    const projected = tiles.map((t) => ({ ...t, ...iso(t.x, t.y) }));
    const minX = Math.min(...projected.map((p) => p.x - tileW / 2));
    const maxX = Math.max(...projected.map((p) => p.x + tileW / 2));
    const minY = Math.min(...projected.map((p) => p.y - tileH / 2));
    const maxY = Math.max(...projected.map((p) => p.y + tileH / 2 + depth));
    const ox = (canvas.width - (maxX - minX)) / 2 - minX;
    const oy = (canvas.height - (maxY - minY)) / 2 - minY - 1;

    projected
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((p) => {
        const endName = p.tile === domino.leftEnd ? 'left' : 'right';
        this.#drawIsoTile(ctx, p.tile, p.x + ox, p.y + oy, tileW, tileH, depth, this.#tileArtSeedKey(p.tile, `preview|${domino.number}|${endName}`));
      });
  }

  #playerDraftColor(playerIndex) {
    const colors = ['#8fc7ff', '#87e39f', '#f2c96f', '#d6a0ff'];
    return colors[Math.max(0, playerIndex) % colors.length];
  }

  #playerMiniMapColor(playerIndex, alpha = 1) {
    const colors = [
      [102, 191, 255],
      [119, 232, 151],
      [242, 201, 111],
      [214, 160, 255],
    ];
    const [r, g, b] = colors[Math.max(0, playerIndex) % colors.length];
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  #playerColorHex(playerIndex) {
    const colors = [0x66bfff, 0x77e897, 0xf2c96f, 0xd6a0ff];
    return colors[Math.max(0, playerIndex) % colors.length];
  }

  #createDraftPlayerToken(playerIndex, current = false) {
    const token = document.createElement('div');
    token.className = 'draftPlayerToken';
    token.classList.toggle('isCurrent', current);
    token.style.setProperty('--player-color', this.#playerDraftColor(playerIndex));
    const name = this.#playerNames[playerIndex] ?? this.#game?.players[playerIndex]?.name ?? `P${playerIndex + 1}`;
    token.title = name;
    token.setAttribute('aria-label', name);
    return token;
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

  #regionsByKey(board) {
    const regions = this.#collectLandscapeRegions(board);
    const byKey = new Map();
    regions.forEach((region, id) => {
      region.id = id;
      for (const key of region.keys) byKey.set(key, region);
    });
    return { regions, byKey };
  }

  #placementActionPlayerIndex(action) {
    if (action?.type !== 'place' || !this.#game) return null;
    if (Number.isInteger(action.payload?.playerIndex)) return action.payload.playerIndex;
    return this.#game.currentPlacingPlayerIndex;
  }

  #placementScoreBurstSnapshot(action) {
    if (action?.type !== 'place' || !this.#game || this.#game.state !== GameState.PLACE) return null;
    const playerIndex = this.#placementActionPlayerIndex(action);
    const boardManager = this.#game.players?.[playerIndex]?.board;
    if (!boardManager) return null;
    const board = boardManager.board;
    return {
      playerIndex,
      beforeKeys: new Set(Object.keys(board)),
      beforeRegionsByKey: this.#regionsByKey(board).byKey,
    };
  }

  #placementScoreConnections(board, newKeys) {
    const dirs = [
      { dx: 1, dy: 0, axis: 'x' },
      { dx: -1, dy: 0, axis: 'x' },
      { dx: 0, dy: 1, axis: 'z' },
      { dx: 0, dy: -1, axis: 'z' },
    ];
    const seen = new Set();
    const connections = [];

    for (const key of newKeys) {
      const tile = board[key];
      if (!tile || tile.landscape === Landscapes.CASTLE) continue;

      for (const dir of dirs) {
        const neighborKey = keyOf(tile.x + dir.dx, tile.y + dir.dy);
        const neighbor = board[neighborKey];
        if (!neighbor || neighbor.landscape !== tile.landscape) continue;

        const connectionKey = [key, neighborKey].sort().join('|');
        if (seen.has(connectionKey)) continue;
        seen.add(connectionKey);

        connections.push({
          key,
          neighborKey,
          landscape: tile.landscape,
          x: tile.x + dir.dx * 0.5,
          y: tile.y + dir.dy * 0.5,
          axis: dir.axis,
        });
      }
    }

    return connections;
  }

  #placementScoreBursts(snapshot, board, newKeys) {
    const afterRegions = this.#regionsByKey(board).regions;
    const bursts = [];

    for (const region of afterRegions) {
      const placedTiles = region.tiles.filter((tile) => newKeys.has(keyOf(tile.x, tile.y)));
      if (!placedTiles.length) continue;

      const beforeRegionIds = new Set();
      let beforeScore = 0;
      for (const key of region.keys) {
        const beforeRegion = snapshot.beforeRegionsByKey.get(key);
        if (!beforeRegion || beforeRegionIds.has(beforeRegion.id)) continue;
        beforeRegionIds.add(beforeRegion.id);
        beforeScore += beforeRegion.score;
      }

      const delta = Math.max(0, region.score - beforeScore);
      bursts.push({ region, placedTiles, delta });
    }

    return bursts;
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
    this.#syncBoardLayerPositions();
    if (!board) return;

    const regions = this.#collectLandscapeRegions(board);
    for (const region of regions) {
      this.#addRegionBoundariesAndScore(region);
    }
  }

  #clearScoreBursts() {
    this.#scoreBursts = [];
    if (!this.#scoreBurstGroup) return;
    while (this.#scoreBurstGroup.children.length) {
      this.#scoreBurstGroup.remove(this.#scoreBurstGroup.children[0]);
    }
  }

  #addScoreBurstTileGlow(group, origin, tile, color) {
    const glowColor = new THREE.Color(color ?? 0xffd76a).offsetHSL(0, 0.04, 0.18);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.62, 36),
      new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.40,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    ring.position.set(origin.x + tile.x, 0.335, origin.z + tile.y);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 50;
    group.add(ring);
  }

  #addScoreBurstEdgeGlow(group, origin, connection) {
    const glowColor = new THREE.Color(LANDSCAPE_COLORS[connection.landscape] ?? 0xffd76a).offsetHSL(0, 0.10, 0.28);
    const geometry = connection.axis === 'x'
      ? new THREE.BoxGeometry(0.080, 0.035, 0.78)
      : new THREE.BoxGeometry(0.78, 0.035, 0.080);
    const edge = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      })
    );
    edge.position.set(origin.x + connection.x, 0.365, origin.z + connection.y);
    edge.renderOrder = 55;
    group.add(edge);
  }

  #addScoreBurstLabel(group, origin, placedTiles, delta) {
    if (!delta || delta <= 0 || !placedTiles.length) return;
    const x = placedTiles.reduce((sum, tile) => sum + tile.x, 0) / placedTiles.length;
    const y = placedTiles.reduce((sum, tile) => sum + tile.y, 0) / placedTiles.length;
    const label = createTextSprite(`+${delta}`, {
      size: 180,
      font: '950 80px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      fillStyle: '#fff7cf',
      background: 'rgba(34, 28, 12, 0.84)',
      border: 'rgba(255, 217, 111, 0.62)',
      shadow: 'rgba(255, 217, 111, 0.44)',
    });
    label.scale.set(0.50, 0.34, 1);
    label.userData.scoreBurstLabelBaseScale = label.scale.clone();
    label.position.set(origin.x + x + 0.12, 0.84, origin.z + y - 0.18);
    label.renderOrder = 96;
    if (label.material) {
      label.material.depthWrite = false;
      label.material.depthTest = false;
      label.material.userData.baseOpacity = 1;
    }
    group.add(label);
  }

  #startPlacementScoreBurst(snapshot) {
    if (!snapshot || this.#prefersReducedMotion() || !this.#scoreBurstGroup) return;
    const boardManager = this.#game?.players?.[snapshot.playerIndex]?.board;
    if (!boardManager) return;
    const board = boardManager.board;
    const newKeys = new Set(Object.keys(board).filter((key) => !snapshot.beforeKeys.has(key)));
    if (!newKeys.size) return;

    const connections = this.#placementScoreConnections(board, newKeys);
    const scoreBursts = this.#placementScoreBursts(snapshot, board, newKeys);
    if (!connections.length && !scoreBursts.some((burst) => burst.delta > 0)) return;

    const origin = this.#boardOriginForPlayer(snapshot.playerIndex);
    const group = new THREE.Group();
    group.userData.scoreBurst = true;
    this.#scoreBurstGroup.add(group);

    const glowKeys = new Set();
    for (const connection of connections) {
      glowKeys.add(connection.key);
      if (newKeys.has(connection.neighborKey)) glowKeys.add(connection.neighborKey);
      this.#addScoreBurstEdgeGlow(group, origin, connection);
    }
    for (const burst of scoreBursts) {
      if (burst.delta > 0) {
        for (const tile of burst.placedTiles) glowKeys.add(keyOf(tile.x, tile.y));
      }
    }
    for (const key of glowKeys) {
      const tile = board[key];
      if (!tile) continue;
      this.#addScoreBurstTileGlow(group, origin, tile, LANDSCAPE_COLORS[tile.landscape] ?? 0xffd76a);
    }
    for (const burst of scoreBursts) {
      this.#addScoreBurstLabel(group, origin, burst.placedTiles, burst.delta);
    }

    this.#prepareObjectMaterialsForOpacity(group);
    this.#scoreBursts.push({
      group,
      startedAt: performance.now(),
      duration: 1120,
      baseY: group.position.y,
    });
  }

  #updateScoreBurstAnimations(now = performance.now()) {
    if (!this.#scoreBursts.length) return;
    for (let i = this.#scoreBursts.length - 1; i >= 0; i--) {
      const burst = this.#scoreBursts[i];
      const progress = Math.max(0, Math.min(1, (now - burst.startedAt) / burst.duration));
      if (progress >= 1 || !burst.group.parent) {
        burst.group.parent?.remove(burst.group);
        this.#scoreBursts.splice(i, 1);
        continue;
      }

      const rise = 1 - Math.pow(1 - progress, 2);
      const fade = progress < 0.18
        ? progress / 0.18
        : 1 - Math.max(0, progress - 0.64) / 0.36;
      const pop = 1 + Math.sin(Math.min(1, progress / 0.24) * Math.PI) * 0.10;
      burst.group.position.y = burst.baseY + rise * 0.30;
      burst.group.traverse((object) => {
        const baseScale = object.userData?.scoreBurstLabelBaseScale;
        if (!baseScale) return;
        object.scale.copy(baseScale).multiplyScalar(pop);
      });
      this.#setObjectOpacity(burst.group, Math.max(0, Math.min(1, fade)));
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

  #placementOptionCells(option) {
    const choice = this.#currentPlacementChoices()
      ?.find((c) => c.domino.number === option.dominoNumber);
    const domino = choice?.domino;
    if (!domino) return [{ x: option.x, y: option.y }];

    const originalOrientation = domino.orientation;
    try {
      let guard = 0;
      while (domino.orientation !== option.orientation && guard < 4) {
        domino.rotate();
        guard += 1;
      }

      const connectedEdge = domino.getConnectedEdge(option.anchorEnd);
      const offset = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
      return [
        { x: option.x, y: option.y },
        { x: option.x + offset.x, y: option.y + offset.y },
      ];
    } finally {
      while (domino.orientation !== originalOrientation) {
        domino.rotate();
      }
    }
  }

  #placementHighlightCells(options) {
    const occupiedCells = new Map();
    for (const option of options) {
      for (const cell of this.#placementOptionCells(option)) {
        occupiedCells.set(keyOf(cell.x, cell.y), cell);
      }
    }

    const anchorCells = new Map();
    for (const cell of this.#orderedPlacementCandidateAnchors()) {
      if (this.#placementOptionsForGrid(cell, options).length) {
        anchorCells.set(keyOf(cell.x, cell.y), cell);
      }
    }

    const dense = occupiedCells.size > 18 || options.length > 56;
    if (dense) {
      const selectedDominoNumber = this.#currentPlacementDraftedTile()?.domino.number;
      const selectedOptions = options.filter((option) => option.dominoNumber === selectedDominoNumber);
      const denseOptions = selectedOptions.length ? selectedOptions : options;
      const selectedAnchorCells = new Map();
      for (const cell of this.#orderedPlacementCandidateAnchors()) {
        if (this.#placementOptionsForGrid(cell, denseOptions).length) {
          selectedAnchorCells.set(keyOf(cell.x, cell.y), cell);
        }
      }
      return { cells: selectedAnchorCells.values(), dense };
    }

    for (const cell of anchorCells.values()) {
      occupiedCells.set(keyOf(cell.x, cell.y), cell);
    }
    return { cells: occupiedCells.values(), dense };
  }

  #placementFootprintCells(options) {
    const cells = new Map();
    for (const option of options) {
      for (const cell of this.#placementOptionCells(option)) {
        cells.set(keyOf(cell.x, cell.y), cell);
      }
    }
    for (const cell of this.#orderedPlacementCandidateAnchors()) {
      if (this.#placementOptionsForGrid(cell, options).length) {
        cells.set(keyOf(cell.x, cell.y), cell);
      }
    }
    return cells.values();
  }

  #renderValidAnchorHighlights(options) {
    if (!options.length) return;

    const highlights = this.#placementHighlightCells(options);
    const tileGeo = new THREE.PlaneGeometry(0.86, 0.86);
    const tileMat = new THREE.MeshBasicMaterial({
      color: 0xd7f1ff,
      transparent: true,
      opacity: highlights.dense ? 0.24 : 0.28,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.86, 0.86));
    const shadowEdgeMat = new THREE.LineBasicMaterial({
      color: 0x101923,
      transparent: true,
      opacity: highlights.dense ? 0.42 : 0.52,
    });
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xf4fbff,
      transparent: true,
      opacity: highlights.dense ? 0.58 : 0.68,
    });
    const cornerGeo = this.#placementHighlightCornerGeometry();
    const cornerMat = new THREE.LineBasicMaterial({
      color: 0xf4fbff,
      transparent: true,
      opacity: highlights.dense ? 0.76 : 0.86,
    });

    for (const cell of highlights.cells) {
      const tile = new THREE.Mesh(tileGeo, tileMat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(cell.x, 0.205, cell.y);
      tile.renderOrder = 20;
      this.#ghostGroup.add(tile);

      const shadowEdge = new THREE.LineSegments(edgeGeo, shadowEdgeMat);
      shadowEdge.rotation.x = -Math.PI / 2;
      shadowEdge.position.set(cell.x, 0.212, cell.y);
      shadowEdge.renderOrder = 21;
      this.#ghostGroup.add(shadowEdge);

      const edge = new THREE.LineSegments(edgeGeo, edgeMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(cell.x, 0.218, cell.y);
      edge.renderOrder = 22;
      this.#ghostGroup.add(edge);

      const corners = new THREE.LineSegments(cornerGeo, cornerMat);
      corners.rotation.x = -Math.PI / 2;
      corners.position.set(cell.x, 0.222, cell.y);
      corners.renderOrder = 23;
      this.#ghostGroup.add(corners);
    }
  }

  #placementHighlightCornerGeometry() {
    const inset = 0.33;
    const outer = 0.43;
    const points = [
      new THREE.Vector3(-outer, -outer, 0), new THREE.Vector3(-inset, -outer, 0),
      new THREE.Vector3(-outer, -outer, 0), new THREE.Vector3(-outer, -inset, 0),
      new THREE.Vector3(outer, -outer, 0), new THREE.Vector3(inset, -outer, 0),
      new THREE.Vector3(outer, -outer, 0), new THREE.Vector3(outer, -inset, 0),
      new THREE.Vector3(-outer, outer, 0), new THREE.Vector3(-inset, outer, 0),
      new THREE.Vector3(-outer, outer, 0), new THREE.Vector3(-outer, inset, 0),
      new THREE.Vector3(outer, outer, 0), new THREE.Vector3(inset, outer, 0),
      new THREE.Vector3(outer, outer, 0), new THREE.Vector3(outer, inset, 0),
    ];
    return new THREE.BufferGeometry().setFromPoints(points);
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

    // Shared tabletop sized to hold both kingdoms with room for the camera pan.
    const bambooFrontTex = createSceneBackgroundTexture(debug, 1024, 'front');
    this.#bambooMatFront = new THREE.Mesh(
      new THREE.PlaneGeometry(72, 48),
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
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.12;
      material.depthWrite = false;
    });
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

    const planeGeo = new THREE.PlaneGeometry(72, 48);
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
    this.#scoreBurstGroup = new THREE.Group();
    this.#scene.add(this.#scoreBurstGroup);

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
      this.#mp?.sendAction('rotate', this.#placementActionPayload());
    });
    this.#btnSkip.addEventListener('click', () => {
      if (!this.#isMyTurnToPlace()) return;
      if (this.#isGameplayPausedForUndo()) return;
      if (!this.#canSkipPlacement()) {
        this.#setCanvasNotice('You can only skip when no legal placement exists.', 'error', 1400);
        return;
      }
      this.#sendPlacementPreview(true);
      this.#mp?.sendAction('skip', this.#placementActionPayload());
    });
    this.#btnUndoRequest.addEventListener('click', () => {
      this.#requestUndo();
    });
    this.#btnRestart.addEventListener('click', () => {
      const seed = randomSeed();
      this.#moreOpen = false;
      this.#mp?.sendAction('restart', { seed });
    });
    this.#btnEndGame.addEventListener('click', () => {
      this.#returnToStartScreen();
    });

    this.#btnNextValid.addEventListener('click', () => {
      this.#jumpToNextValidAnchor();
    });

    this.#btnResetTile.addEventListener('click', () => {
      this.#resetPlacementAnchor();
    });

    this.#btnScores.addEventListener('click', () => {
      this.#showPlacementScores = !this.#showPlacementScores;
      this.#refreshHud();
      this.#renderGhost();
    });

    this.#btnMore.addEventListener('click', () => {
      this.#moreOpen = !this.#moreOpen;
      this.#refreshHud();
    });

    this.#btnToggleMiniMap.addEventListener('click', () => {
      this.#showMiniMap = !this.#showMiniMap;
      this.#refreshHud();
    });

    this.#btnToggleAdvisor.addEventListener('click', () => {
      this.#showAdvisor = !this.#showAdvisor;
      this.#saveAdvisorVisibility();
      this.#invalidatePlacementCaches();
      this.#refreshHud();
      this.#renderBoard();
    });

    this.#btnHighScores.addEventListener('click', () => {
      this.#openScoreHistory();
    });

    this.#btnLibrary.addEventListener('click', () => {
      this.#setLibraryOpen(!this.#libraryOpen);
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

    this.#btnMobileRotate.addEventListener('click', () => {
      if (!this.#isMyTurnToPlace()) return;
      if (this.#isGameplayPausedForUndo()) return;
      this.#mp?.sendAction('rotate', this.#placementActionPayload());
    });

    this.#btnMobileSkip.addEventListener('click', () => {
      if (!this.#isMyTurnToPlace()) return;
      if (this.#isGameplayPausedForUndo()) return;
      if (!this.#canSkipPlacement()) {
        this.#setCanvasNotice('You can only skip when no legal placement exists.', 'error', 1400);
        return;
      }
      this.#sendPlacementPreview(true);
      this.#mp?.sendAction('skip', this.#placementActionPayload());
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

    this.#btnLocalPrev.addEventListener('click', () => {
      this.#cycleLocalPlacement(-1);
    });
    this.#btnLocalNext.addEventListener('click', () => {
      this.#cycleLocalPlacement(1);
    });
    this.#btnLocalPlace.addEventListener('click', () => {
      this.#tryPlaceAtHover();
    });
    this.#btnLocalClear.addEventListener('click', () => {
      this.#clearPlacementSpotFocus();
    });
    this.#btnLocalAdvisor.addEventListener('click', () => {
      this.#jumpToAdvisorPlacement();
    });
    this.#scoreHistoryOverlay.addEventListener('click', (event) => {
      if (event.target === this.#scoreHistoryOverlay) this.#closeScoreHistory();
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
    this.#invalidateTabletopLayoutCache();

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
    this.#syncLocalPlacementDock();
  };

  #onKeyDown = (e) => {
    if (e.key.toLowerCase() === 'r') {
      if (!this.#isMyTurnToPlace()) return;
      if (this.#isGameplayPausedForUndo()) return;
      this.#mp?.sendAction('rotate', this.#placementActionPayload());
    }
  };

  #startPointerTap(e) {
    this.#pointerDown = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      maxDist2: 0,
    };
  }

  #trackPointerMovement(e) {
    if (!this.#pointerDown) return;
    const dx = e.clientX - this.#pointerDown.x;
    const dy = e.clientY - this.#pointerDown.y;
    this.#pointerDown.maxDist2 = Math.max(this.#pointerDown.maxDist2, dx * dx + dy * dy);
  }

  #isPointerTap(start, e) {
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist2 = Math.max(start.maxDist2 ?? 0, dx * dx + dy * dy);
    const maxDistance = e.pointerType === 'touch' ? 9 : 8;
    if (dist2 > maxDistance * maxDistance) return false;

    if (e.pointerType === 'touch') {
      const dt = performance.now() - start.t;
      return dt <= 350;
    }

    return true;
  }

  #onPointerMove(e) {
    this.#trackPointerMovement(e);
    if (this.#libraryOpen) return;
    if (this.#game?.state === GameState.DRAFT) return;
    if (!this.#isMyTurnToPlace()) {
      if (this.#hoverAnchor) {
        this.#hoverAnchor = null;
        this.#localPlacementFocus = null;
        this.#hoverAnchorAuto = false;
        this.#renderGhost();
      }
      this.#placementHint = '';
      this.#setCanvasNotice('');
      return;
    }
  }

  #onPointerDown(e) {
    // Prevent browser panning/zooming the page when interacting with the board.
    if (e.pointerType === 'touch') e.preventDefault();
    try {
      this.#renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (this.#libraryOpen) {
      if (e.pointerType === 'touch') this.#activeTouchPointerId = e.pointerId;
      this.#startPointerTap(e);
      return;
    }

    if (e.pointerType === 'touch') {
      this.#activeTouchPointerId = e.pointerId;
      this.#startPointerTap(e);
      return;
    }

    this.#startPointerTap(e);
  }

  #onPointerUp(e) {
    if (e.pointerType === 'touch') e.preventDefault();
    if (this.#libraryOpen) {
      if (e.pointerType === 'touch' && this.#activeTouchPointerId != null && this.#activeTouchPointerId !== e.pointerId) {
        return;
      }

      const start = this.#pointerDown;
      this.#pointerDown = null;
      if (!start) {
        if (e.pointerType === 'touch') this.#resetTouchInteraction();
        return;
      }

      const isTap = this.#isPointerTap(start, e);
      if (isTap) this.#handleLibraryTap(e.clientX, e.clientY);
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
    const isTap = this.#isPointerTap(start, e);
    if (!isTap) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }

    if (this.#game?.state === GameState.DRAFT && this.#isMyTurnToPick()) {
      const draftHandled = this.#handleCanvasDraftTap(e.clientX, e.clientY);
      if (draftHandled) {
        if (e.pointerType === 'touch') this.#resetTouchInteraction();
        return;
      }
    }

    if (this.#game?.state === GameState.DRAFT && this.#handleCanvasMatFocusTap(e.clientX, e.clientY)) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }

    if (this.#game?.state === GameState.PLACE && this.#isMyTurnToPlace() && this.#handleCanvasPlacementConfirmTap(e.clientX, e.clientY, e.pointerType)) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }

    const grid = this.#gridFromClient(e.clientX, e.clientY);

    if (this.#game?.state === GameState.PLACE && this.#isMyTurnToPlace() && this.#handleCanvasPlacementChoiceTap(e.clientX, e.clientY)) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }

    if (this.#game?.state === GameState.PLACE && this.#isMyTurnToPlace() && grid) {
      const placementHandled = this.#trySelectPlacementAnchor(grid, {
        localize: true,
        showError: false,
        render: true,
      });
      if (placementHandled) {
        if (e.pointerType === 'touch') {
          this.#syncMobileActions();
          this.#resetTouchInteraction();
        }
        return;
      }
    }

    if (this.#handleCanvasMatFocusTap(e.clientX, e.clientY)) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }

    if (!this.#isMyTurnToPlace() && !this.#isMyTurnToPick()) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }

    if (!grid) {
      if (e.pointerType === 'touch') this.#resetTouchInteraction();
      return;
    }
    this.#trySelectPlacementAnchor(grid, {
      localize: true,
      showError: e.pointerType === 'touch',
      render: true,
    });

    if (e.pointerType === 'touch') {
      this.#syncMobileActions();
      this.#resetTouchInteraction();
      return;
    }
  }

  #gridMatchesLocalPlacementAnchor(grid) {
    if (!grid || !this.#localPlacementFocus) return false;
    return this.#localPlacementFocus.x === grid.x && this.#localPlacementFocus.y === grid.y;
  }

  #onPointerCancel() {
    this.#pointerDown = null;
    this.#resetTouchInteraction();
  }

  #resetTouchInteraction() {
    this.#activeTouchPointerId = null;
    if (this.#controls) this.#controls.enabled = true;
  }

  #gridFromClient(clientX, clientY) {
    const p = this.#boardPlanePointFromClient(clientX, clientY);
    if (!p) return null;
    const origin = this.#placementBoardOrigin();
    return { x: Math.round(p.x - origin.x), y: Math.round(p.z - origin.z) };
  }

  #boardPlanePointFromClient(clientX, clientY) {
    const rect = this.#renderer.domElement.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    this.#pointer.x = ((clientX - rect.left) / w) * 2 - 1;
    this.#pointer.y = -(((clientY - rect.top) / h) * 2 - 1);
    this.#raycaster.setFromCamera(this.#pointer, this.#camera);
    const hits = this.#raycaster.intersectObject(this.#boardPlane);
    if (!hits.length) return null;
    return hits[0].point;
  }

  #screenPointForObject(object) {
    if (!object || !object.parent || !this.#renderer || !this.#camera) return null;
    const rect = this.#renderer.domElement.getBoundingClientRect();
    object.updateWorldMatrix(true, false);

    const projected = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
    projected.project(this.#camera);
    if (
      !Number.isFinite(projected.x)
      || !Number.isFinite(projected.y)
      || !Number.isFinite(projected.z)
    ) {
      return null;
    }

    return {
      x: rect.left + (projected.x + 1) * 0.5 * rect.width,
      y: rect.top + (1 - projected.y) * 0.5 * rect.height,
      rect,
    };
  }

  #canvasDraftEnabled() {
    return this.#threeOk;
  }

  #rectOverlapArea(a, b) {
    if (!a || !b) return 0;
    const xOverlap = Math.max(0, Math.min(a.xMax, b.xMax) - Math.max(a.xMin, b.xMin));
    const zOverlap = Math.max(0, Math.min(a.zMax, b.zMax) - Math.max(a.zMin, b.zMin));
    return xOverlap * zOverlap;
  }

  #matWorldRect(mat, origin = { x: 0, z: 0 }, pad = 0) {
    return {
      xMin: origin.x + mat.centerX - mat.width / 2 - pad,
      xMax: origin.x + mat.centerX + mat.width / 2 + pad,
      zMin: origin.z + mat.centerZ - mat.height / 2 - pad,
      zMax: origin.z + mat.centerZ + mat.height / 2 + pad,
    };
  }

  #worldRectContains(rect, point) {
    return Boolean(rect && point
      && point.x >= rect.xMin
      && point.x <= rect.xMax
      && point.z >= rect.zMin
      && point.z <= rect.zMax);
  }

  #canvasDraftWorldRect(pad = 0) {
    if (!this.#canvasDraftEnabled()) return null;
    const layout = this.#canvasDraftLayout();
    if (!layout.rows.length) return null;
    const minX = Math.min(...layout.rows.map((row) => row.xMin)) - 0.30;
    const maxX = Math.max(...layout.rows.map((row) => row.xMax)) + 0.30;
    const minZ = Math.min(...layout.rows.map((row) => row.zMin)) - 0.30;
    const maxZ = Math.max(...layout.rows.map((row) => row.zMax)) + 0.30;
    return {
      xMin: minX - pad,
      xMax: maxX + pad,
      zMin: minZ - pad,
      zMax: maxZ + pad,
    };
  }

  #boardWorldBoundsForPlayer(playerIndex, pad = 0) {
    const boardManager = this.#game?.players?.[playerIndex]?.board;
    const boardSize = boardManager?.boardSize;
    if (!boardSize || !boardManager) return null;
    const origin = this.#boardOriginForPlayer(playerIndex);
    const mat = this.#preservedKingdomMatBounds(boardManager, playerIndex);
    return this.#matWorldRect(mat, origin, pad);
  }

  #boardWorldBounds(pad = 0) {
    const players = this.#game?.players ?? [];
    return players
      .map((_, playerIndex) => this.#boardWorldBoundsForPlayer(playerIndex, pad))
      .filter(Boolean);
  }

  #canvasDraftBoundsForOrigin(origin, rowCount, pad = 0) {
    const rows = Math.max(1, rowCount ?? 0);
    const rowGap = 1.18;
    const startZ = origin.z - ((rows - 1) * rowGap) / 2;
    const baseX = origin.x - 1.90;
    return {
      xMin: baseX - 0.34 - pad,
      xMax: baseX + 4.10 + pad,
      zMin: startZ - 0.55 - pad,
      zMax: startZ + (rows - 1) * rowGap + 0.55 + pad,
    };
  }

  #candidateAxisForCanvasDraft() {
    const count = Math.max(1, this.#game?.players?.length ?? 2);
    if (count === 2) return this.#screenVerticalTabletopAxis();
    if (this.#useVerticalTabletopLayout()) return { x: 0, z: 1 };
    return { x: 1, z: 0 };
  }

  #canvasDraftOrigin() {
    const heldOrigin = this.#autoDraftClaimHeldOrigin();
    if (heldOrigin) return { x: heldOrigin.x, z: heldOrigin.z };

    const count = Math.max(1, this.#game?.players?.length ?? 2);
    const base = this.#canvasDraftHomeOrigin(count);
    const rowCount = this.#game?.currentDraft?.length ?? 0;
    if (!rowCount) return base;

    const axis = this.#candidateAxisForCanvasDraft();
    const perp = { x: -axis.z, z: axis.x };
    const boards = this.#boardWorldBounds(0.55);
    const isReferenceTray = this.#game?.state === GameState.PLACE;
    const reservedRects = this.#canvasReserveTargetRects(0.22);
    if (!boards.length) return base;

    let preferred = base;
    const activePicker = this.#game?.state === GameState.DRAFT
      ? this.#game.currentPickingPlayerIndex
      : null;
    if (activePicker != null && this.#game?.players?.[activePicker]) {
      const activeOrigin = this.#boardOriginForPlayer(activePicker);
      const toBaseX = base.x - activeOrigin.x;
      const toBaseZ = base.z - activeOrigin.z;
      const distanceToBase = Math.hypot(toBaseX, toBaseZ);
      if (distanceToBase > 0.001) {
        const nx = toBaseX / distanceToBase;
        const nz = toBaseZ / distanceToBase;
        const travel = Math.min(distanceToBase * 0.72, count === 2 ? 5.10 : 5.60);
        preferred = {
          x: activeOrigin.x + nx * travel,
          z: activeOrigin.z + nz * travel,
        };
      }
    } else if (isReferenceTray) {
      const referenceShift = count === 2 ? 1.95 : 2.75;
      preferred = {
        x: base.x + perp.x * referenceShift,
        z: base.z + perp.z * referenceShift,
      };
    }

    const candidates = [];
    const addCandidate = (perpOffset, axisOffset, bias = 0) => {
      candidates.push({
        x: preferred.x + perp.x * perpOffset + axis.x * axisOffset,
        z: preferred.z + perp.z * perpOffset + axis.z * axisOffset,
        bias,
      });
    };
    const perpOffsets = [0];
    const axisOffsets = [0];
    for (let step = 1; step <= 8; step++) {
      perpOffsets.push(step * 1.8, -step * 1.8);
    }
    for (let step = 1; step <= 6; step++) {
      axisOffsets.push(step * 1.35, -step * 1.35);
    }
    for (const perpOffset of perpOffsets) {
      for (const axisOffset of axisOffsets) {
        addCandidate(perpOffset, axisOffset, Math.abs(perpOffset) * 0.55 + Math.abs(axisOffset) * 0.45);
      }
    }
    candidates.push({ x: base.x, z: base.z, bias: isReferenceTray ? 6.2 : activePicker == null ? 0.4 : 5.8 });

    let best = candidates[0];
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const draftBounds = this.#canvasDraftBoundsForOrigin(candidate, rowCount, 0.34);
      const boardOverlap = boards.reduce((total, rect) => total + this.#rectOverlapArea(draftBounds, rect), 0);
      const reserveOverlap = reservedRects.reduce((total, rect) => total + this.#rectOverlapArea(draftBounds, rect), 0);
      const distance = Math.hypot(candidate.x - preferred.x, candidate.z - preferred.z);
      const score = boardOverlap * 100000 + reserveOverlap * 80000 + distance * 2.5 + candidate.bias;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return { x: best.x, z: best.z };
  }

  #canvasDraftHomeOrigin(count = Math.max(1, this.#game?.players?.length ?? 2)) {
    if (count === 2) return { x: 0, z: 0 };
    return this.#useVerticalTabletopLayout()
      ? { x: 3.0, z: 0 }
      : { x: 0, z: 0 };
  }

  #playerReserveAnchorDirection(owner) {
    const ownerOrigin = this.#boardOriginForPlayer(owner);
    const home = this.#canvasDraftHomeOrigin();
    let directionX = home.x - ownerOrigin.x;
    let directionZ = home.z - ownerOrigin.z;
    let distance = Math.hypot(directionX, directionZ);

    if (distance < 0.001) {
      if (this.#useVerticalTabletopLayout()) {
        directionX = 1;
        directionZ = 0;
      } else {
        directionX = owner % 2 === 0 ? 1 : -1;
        directionZ = owner < 2 ? 1 : -1;
      }
      distance = Math.hypot(directionX, directionZ);
    }

    return {
      nx: directionX / distance,
      nz: directionZ / distance,
      distance,
    };
  }

  #canvasDraftLayout() {
    const g = this.#game;
    const rows = g?.currentDraft?.length ?? 0;
    const activeIdx = g?.currentPickingPlayerIndex ?? this.#focusedPlayerIndex ?? 0;
    const origin = this.#canvasDraftOrigin();
    const rowGap = 1.18;
    const startZ = origin.z - ((Math.max(1, rows) - 1) * rowGap) / 2;
    const baseX = origin.x - 1.90;

    return {
      activeIdx,
      origin,
      rowGap,
      rows: (g?.currentDraft ?? []).map((slot, index) => {
        const z = startZ + index * rowGap;
        return {
          slot,
          index,
          z,
          xMin: baseX - 0.34,
          xMax: baseX + 4.10,
          zMin: z - 0.55,
          zMax: z + 0.55,
          turnX: baseX + 0.12,
          leftX: baseX + 0.98,
          rightX: baseX + 1.98,
          claimX: baseX + 3.42,
        };
      }),
    };
  }

  #claimTargetRect(leftX, z, pad = 0.10) {
    return {
      xMin: leftX - 0.34 - pad,
      xMax: leftX + 2.08 + pad,
      zMin: z - 0.62 - pad,
      zMax: z + 0.62 + pad,
    };
  }

  #placementHighlightAvoidRects() {
    if (!this.#game || this.#game.state !== GameState.PLACE || this.#game.isGameOver) return [];
    const playerIndex = this.#placementPlayerIndex();
    if (playerIndex == null) return [];

    const options = this.#currentPlacementOptions();
    if (!options.length) return [];

    const origin = this.#boardOriginForPlayer(playerIndex);
    const highlights = this.#placementHighlightCells(options);
    return [...highlights.cells].map((cell) => ({
      xMin: origin.x + cell.x - 0.52,
      xMax: origin.x + cell.x + 0.52,
      zMin: origin.z + cell.y - 0.52,
      zMax: origin.z + cell.y + 0.52,
    }));
  }

  #draftClaimAnimationKey(round, dominoNumber, owner) {
    return `${round}|${dominoNumber}|${owner}`;
  }

  #candidateCanvasDraftClaimTarget(row, owner, reservedAvoidRects = []) {
    const ownerOrigin = this.#boardOriginForPlayer(owner);
    const { nx, nz, distance: zoneDistance } = this.#playerReserveAnchorDirection(owner);
    const count = Math.max(1, this.#game?.players?.length ?? 2);
    const ownerRows = (this.#game?.currentDraft ?? [])
      .map((slot, index) => ({ slot, index }))
      .filter((candidate) => candidate.slot?.player === owner && !candidate.slot?.placed);
    const ownerOrdinal = Math.max(0, ownerRows.findIndex((candidate) => candidate.index === row.index));
    const ownerCount = Math.max(1, ownerRows.length);
    const stackOffset = (ownerOrdinal - (ownerCount - 1) / 2) * (count === 2 ? 2.28 : 1.78);
    let claimDistance = count === 2
      ? Math.max(2.10, Math.min(3.20, zoneDistance * 0.44))
      : Math.max(2.55, Math.min(4.25, zoneDistance * 0.46));

    const boardManager = this.#game?.players?.[owner]?.board;
    if (boardManager) {
      const mat = this.#preservedKingdomMatBounds(boardManager, owner);
      const matEdge = mat.centerX * nx + mat.centerZ * nz
        + Math.abs(nx) * mat.width / 2
        + Math.abs(nz) * mat.height / 2;
      const pieceExtent = Math.abs(nx) * 1.04 + Math.abs(nz) * 0.62;
      claimDistance = Math.max(claimDistance, matEdge + pieceExtent + (count === 2 ? 0.22 : 0.30));
    }

    const avoidRects = [
      ...this.#boardWorldBounds(0.58).map((rect) => ({ rect, weight: 1300 })),
      ...this.#placementHighlightAvoidRects().map((rect) => ({ rect, weight: 900 })),
      ...reservedAvoidRects.map((rect) => ({ rect, weight: 2400 })),
    ];
    const makeCandidate = (distanceOffset, sideOffset, bias = 0) => {
      const side = stackOffset + sideOffset;
      const distance = Math.max(1.2, claimDistance + distanceOffset);
      const leftX = ownerOrigin.x + nx * distance - 0.50 + (-nz * side);
      const z = ownerOrigin.z + nz * distance + (nx * side);
      const rect = this.#claimTargetRect(leftX, z);
      const overlapPenalty = avoidRects.reduce((total, item) => {
        const overlap = this.#rectOverlapArea(rect, item.rect);
        return total + overlap * item.weight;
      }, 0);
      const driftPenalty = Math.abs(distanceOffset) * 4.2 + Math.abs(sideOffset) * 2.4 + bias;
      return { leftX, z, score: overlapPenalty + driftPenalty };
    };

    const distanceOffsets = [0, 0.85, 1.70, 2.60, 3.60, -0.55];
    const sideOffsets = [0, 1.30, -1.30, 2.55, -2.55, 3.75, -3.75];
    let best = makeCandidate(0, 0);
    for (const distanceOffset of distanceOffsets) {
      for (const sideOffset of sideOffsets) {
        const candidate = makeCandidate(distanceOffset, sideOffset);
        if (candidate.score < best.score) best = candidate;
      }
    }
    return { leftX: best.leftX, z: best.z };
  }

  #canvasDraftClaimTargets() {
    const targets = new Map();
    const g = this.#game;
    if (!g) return targets;

    const reservedAvoidRects = [];
    const rows = this.#canvasDraftLayout().rows
      .filter((row) => row.slot?.player != null && !row.slot?.placed)
      .sort((a, b) => {
        const ownerDelta = (a.slot.player ?? 0) - (b.slot.player ?? 0);
        return ownerDelta || a.index - b.index;
      });

    for (const row of rows) {
      const owner = row.slot.player;
      const dominoNumber = row.slot?.domino?.number;
      if (!Number.isInteger(dominoNumber)) continue;
      const key = this.#draftClaimAnimationKey(g.round ?? 0, dominoNumber, owner);
      const target = this.#candidateCanvasDraftClaimTarget(row, owner, reservedAvoidRects);
      targets.set(key, target);
      reservedAvoidRects.push(this.#claimTargetRect(target.leftX, target.z, 0.16));
    }

    return targets;
  }

  #canvasReserveTargetRects(pad = 0.16) {
    const g = this.#game;
    if (!g?.currentDraft?.length) return [];

    const rects = [];
    const reservedAvoidRects = [];
    const rows = g.currentDraft
      .map((slot, index) => ({ slot, index }))
      .filter((row) => row.slot?.player != null && !row.slot?.placed)
      .sort((a, b) => {
        const ownerDelta = (a.slot.player ?? 0) - (b.slot.player ?? 0);
        return ownerDelta || a.index - b.index;
      });

    for (const row of rows) {
      const owner = row.slot.player;
      const dominoNumber = row.slot?.domino?.number;
      if (!Number.isInteger(dominoNumber)) continue;
      const target = this.#candidateCanvasDraftClaimTarget(row, owner, reservedAvoidRects);
      rects.push(this.#claimTargetRect(target.leftX, target.z, pad));
      reservedAvoidRects.push(this.#claimTargetRect(target.leftX, target.z, 0.16));
    }

    return rects;
  }

  #canvasDraftClaimTarget(row, owner) {
    const dominoNumber = row?.slot?.domino?.number;
    if (!Number.isInteger(dominoNumber)) return this.#candidateCanvasDraftClaimTarget(row, owner);
    const key = this.#draftClaimAnimationKey(this.#game?.round ?? 0, dominoNumber, owner);
    return this.#canvasDraftClaimTargets().get(key) ?? this.#candidateCanvasDraftClaimTarget(row, owner);
  }

  #draftClaimCurrentPosition(meta, key, duration = 720) {
    const startedAt = this.#draftClaimAnimationStartedAt.get(key);
    if (startedAt == null || this.#prefersReducedMotion()) {
      return { leftX: meta.targetLeftX, z: meta.targetZ };
    }

    const progress = Math.max(0, Math.min(1, (performance.now() - startedAt) / Math.max(1, duration)));
    if (progress >= 1) return { leftX: meta.targetLeftX, z: meta.targetZ };

    const eased = 1 - Math.pow(1 - progress, 3);
    return {
      leftX: meta.leftX + (meta.targetLeftX - meta.leftX) * eased,
      z: meta.z + (meta.targetZ - meta.z) * eased,
    };
  }

  #draftClaimMetaFor(row, owner, { create = false } = {}) {
    if (!row || owner == null) return null;
    const dominoNumber = row.slot?.domino?.number;
    if (!Number.isInteger(dominoNumber)) return null;

    const key = this.#draftClaimAnimationKey(this.#game?.round ?? 0, dominoNumber, owner);
    const target = this.#canvasDraftClaimTarget(row, owner);
    const existing = this.#draftClaimAnimationSourceByKey.get(key);
    if (existing) {
      const targetChanged = Math.hypot(
        existing.targetLeftX - target.leftX,
        existing.targetZ - target.z
      ) > 0.04;
      if (targetChanged) {
        const current = this.#draftClaimCurrentPosition(existing, key);
        existing.leftX = current.leftX;
        existing.z = current.z;
        existing.targetLeftX = target.leftX;
        existing.targetZ = target.z;
        this.#draftClaimAnimationStartedAt.set(key, performance.now());
      } else {
        existing.targetLeftX = target.leftX;
        existing.targetZ = target.z;
      }
      return { key, ...existing };
    }

    const meta = {
      leftX: row.leftX,
      z: row.z,
      targetLeftX: target.leftX,
      targetZ: target.z,
      owner,
      rowIndex: row.index,
      dominoNumber,
    };
    if (create) this.#draftClaimAnimationSourceByKey.set(key, meta);
    return { key, ...meta };
  }

  #prepareDraftClaimAnimation(index) {
    const g = this.#game;
    if (!g || g.state !== GameState.DRAFT) return;
    const draftIndex = Number(index);
    if (!Number.isInteger(draftIndex)) return;

    const slot = g.currentDraft?.[draftIndex];
    const owner = g.currentPickingPlayerIndex;
    if (!slot || slot.player != null || owner == null) return;

    const row = this.#canvasDraftLayout().rows.find((candidate) => candidate.index === draftIndex);
    const meta = this.#draftClaimMetaFor(row, owner, { create: true });
    if (!meta) return;
    if (!this.#draftClaimAnimationStartedAt.has(meta.key)) {
      this.#draftClaimAnimationStartedAt.set(meta.key, performance.now());
    }
  }

  #settleCurrentDraftClaimAnimations() {
    const g = this.#game;
    if (!g?.currentDraft?.length) return;
    const settledAt = performance.now() - 1200;
    const layout = this.#canvasDraftLayout();
    for (const row of layout.rows) {
      const owner = row.slot?.player;
      if (owner == null || row.slot?.placed) continue;
      const meta = this.#draftClaimMetaFor(row, owner, { create: true });
      if (meta) this.#draftClaimAnimationStartedAt.set(meta.key, settledAt);
    }
  }

  #canvasDraftIndexAtClient(clientX, clientY) {
    if (!this.#canvasDraftEnabled()) return null;
    const point = this.#boardPlanePointFromClient(clientX, clientY);
    if (!point) return null;
    const layout = this.#canvasDraftLayout();
    let best = null;
    for (const row of layout.rows) {
      if (row.slot?.player != null) continue;
      const xPad = 0.10;
      const zPad = 0.10;
      if (point.x < row.leftX - 0.56 - xPad || point.x > row.rightX + 0.56 + xPad) continue;
      const zDistance = Math.abs(point.z - row.z);
      if (zDistance > 0.56 + zPad) continue;
      if (!best || zDistance < best.zDistance) best = { row, zDistance };
    }
    return best?.row?.index ?? null;
  }

  #canvasDraftMatAtClient(clientX, clientY) {
    if (!this.#canvasDraftEnabled()) return false;
    const g = this.#game;
    if (!g || (g.state !== GameState.DRAFT && g.state !== GameState.PLACE) || g.isGameOver) return false;
    const point = this.#boardPlanePointFromClient(clientX, clientY);
    return this.#worldRectContains(this.#canvasDraftWorldRect(0), point);
  }

  #kingdomMatAtClient(clientX, clientY) {
    const point = this.#boardPlanePointFromClient(clientX, clientY);
    if (!point || !this.#game?.players?.length) return null;
    let best = null;
    for (let playerIndex = 0; playerIndex < this.#game.players.length; playerIndex++) {
      const rect = this.#boardWorldBoundsForPlayer(playerIndex, 0);
      if (!this.#worldRectContains(rect, point)) continue;
      const centerX = (rect.xMin + rect.xMax) / 2;
      const centerZ = (rect.zMin + rect.zMax) / 2;
      const distance = (point.x - centerX) ** 2 + (point.z - centerZ) ** 2;
      if (!best || distance < best.distance) best = { playerIndex, distance };
    }
    return best?.playerIndex ?? null;
  }

  #handleCanvasMatFocusTap(clientX, clientY) {
    if (this.#canvasDraftMatAtClient(clientX, clientY)) {
      return this.#centerOnDraftMat(true);
    }

    const playerIndex = this.#kingdomMatAtClient(clientX, clientY);
    if (playerIndex == null) return false;
    return this.#centerOnPlayerMat(playerIndex, true);
  }

  #canvasDraftAdvisorPosition(row) {
    return {
      x: row.xMax + 0.44,
      z: row.z - 0.12,
    };
  }

  #canvasDraftAdvisorAtClient(clientX, clientY) {
    if (!this.#canvasDraftEnabled()) return null;
    if (!this.#showAdvisor) return null;
    const g = this.#game;
    if (!g || g.state !== GameState.DRAFT || g.isGameOver) return null;
    const suggestion = this.#advisor.suggestDraftMove(g, g.currentPickingPlayerIndex);
    if (!suggestion) return null;

    const point = this.#boardPlanePointFromClient(clientX, clientY);
    if (!point) return null;
    const row = this.#canvasDraftLayout().rows.find((candidate) => candidate.index === suggestion.index);
    if (!row || row.slot?.player != null) return null;
    const xMin = row.xMax - 0.22;
    const xMax = row.xMax + 1.20;
    const zMin = row.zMin - 0.32;
    const zMax = row.zMax + 0.28;
    if (point.x < xMin || point.x > xMax || point.z < zMin || point.z > zMax) return null;
    return suggestion;
  }

  #showDraftAdvisorDetail(suggestion) {
    const message = suggestion?.explanation || suggestion?.summary || 'This looks like the strongest draft option.';
    this.#setCanvasNotice(message, 'info', 3800);
  }

  #handleCanvasDraftTap(clientX, clientY) {
    if (!this.#isMyTurnToPick()) return false;
    if (this.#isGameplayPausedForUndo()) return false;

    const advisor = this.#canvasDraftAdvisorAtClient(clientX, clientY);
    if (advisor) {
      this.#showDraftAdvisorDetail(advisor);
      return true;
    }

    const index = this.#canvasDraftIndexAtClient(clientX, clientY);
    if (index == null) return false;

    const slot = this.#game?.currentDraft?.[index];
    if (!slot || slot.player != null) {
      this.#setCanvasNotice('That tile has already been claimed.', 'info', 1000);
      return false;
    }

    this.#mp?.sendAction('pickDraft', { index });
    return true;
  }

  #canvasPlacementChoiceAtClient(clientX, clientY) {
    if (!this.#canvasDraftEnabled()) return null;
    if (!this.#isMyTurnToPlace()) return null;
    const point = this.#boardPlanePointFromClient(clientX, clientY);
    if (!point) return null;

    const playerIndex = this.#placementPlayerIndex();
    if (playerIndex == null) return null;
    const choices = this.#currentPlacementChoices();
    if (!choices.length) return null;

    const layout = this.#canvasDraftLayout();
    let best = null;
    for (const choice of choices) {
      const row = layout.rows.find((candidate) =>
        candidate.slot?.player === playerIndex
        && !candidate.slot?.placed
        && candidate.slot?.domino?.number === choice.domino.number
      );
      const meta = this.#draftClaimMetaFor(row, playerIndex, { create: true });
      if (!meta) continue;

      const inX = point.x >= meta.targetLeftX - 0.74 && point.x <= meta.targetLeftX + 1.74;
      const inZ = point.z >= meta.targetZ - 0.72 && point.z <= meta.targetZ + 0.72;
      if (!inX || !inZ) continue;
      const dx = point.x - (meta.targetLeftX + 0.5);
      const dz = point.z - meta.targetZ;
      const distance = dx * dx + dz * dz;
      if (!best || distance < best.distance) best = { choice, distance };
    }
    return best?.choice ?? null;
  }

  #canvasPlacementChoiceTargetsForPlayer(playerIndex) {
    if (playerIndex == null) return [];
    const layout = this.#canvasDraftLayout();
    return layout.rows
      .filter((row) => row.slot?.player === playerIndex && !row.slot?.placed)
      .map((row) => {
        const meta = this.#draftClaimMetaFor(row, playerIndex, { create: true });
        return meta ? { leftX: meta.targetLeftX, z: meta.targetZ, dominoNumber: meta.dominoNumber } : null;
      })
      .filter(Boolean);
  }

  #canvasPlacementChoiceTargetForDomino(playerIndex, dominoNumber) {
    return this.#canvasPlacementChoiceTargetsForPlayer(playerIndex)
      .find((target) => target.dominoNumber === dominoNumber) ?? null;
  }

  #isPlacementDominoReturning(dominoNumber) {
    return Number.isInteger(dominoNumber) && this.#placementReturnAnimations.has(dominoNumber);
  }

  #rotationYForRightOffset(offset) {
    if (!offset) return 0;
    return -Math.atan2(offset.y, offset.x);
  }

  #placementSkipAnimationSource(playerIndex, drafted) {
    const boardOrigin = this.#boardOriginForPlayer(playerIndex);
    const currentDrafted = this.#currentPlacementDraftedTile();
    if (this.#hoverAnchor && currentDrafted?.domino?.number === drafted?.domino?.number) {
      const feedback = this.#placementFeedbackForAnchor(this.#hoverAnchor);
      const anchorEnd = feedback.ok ? feedback.anchorEnd : DominoEnd.LEFT;
      const board = this.#game?.players?.[playerIndex]?.board?.board;
      if (board) {
        const built = this.#buildProjectedBoard(board, drafted, this.#hoverAnchor, anchorEnd);
        const other = built.other;
        const leftCoord = anchorEnd === DominoEnd.LEFT ? this.#hoverAnchor : other;
        const rightCoord = anchorEnd === DominoEnd.RIGHT ? this.#hoverAnchor : other;
        const current = this.#placementGhostAnimationCurrentPosition(this.#placementGhostAnimation)
          ?? { x: leftCoord.x, z: leftCoord.y };
        return {
          leftX: boardOrigin.x + current.x,
          z: boardOrigin.z + current.z,
          rotationY: this.#rotationYForRightOffset({
            x: rightCoord.x - leftCoord.x,
            y: rightCoord.y - leftCoord.y,
          }),
        };
      }
    }

    const rackTarget = this.#canvasPlacementChoiceTargetForDomino(playerIndex, drafted.domino.number);
    if (rackTarget) {
      return { leftX: rackTarget.leftX, z: rackTarget.z, rotationY: 0 };
    }

    const row = this.#canvasDraftLayout().rows.find((candidate) =>
      candidate.slot?.player === playerIndex
      && !candidate.slot?.placed
      && candidate.slot?.domino?.number === drafted.domino.number
    );
    const meta = this.#draftClaimMetaFor(row, playerIndex, { create: true });
    if (meta) return { leftX: meta.targetLeftX, z: meta.targetZ, rotationY: 0 };

    return { leftX: boardOrigin.x - 0.5, z: boardOrigin.z, rotationY: 0 };
  }

  #preparePlacementSkipAnimation(action) {
    if (!this.#canvasDraftEnabled() || this.#prefersReducedMotion()) return;
    if (!this.#game || this.#game.state !== GameState.PLACE) return;

    const payload = action?.payload ?? {};
    const playerIndex = Number.isInteger(payload.playerIndex) ? payload.playerIndex : this.#placementPlayerIndex();
    if (playerIndex == null) return;
    const canSkip = this.#game.canSkipPlacementForPlayer?.(playerIndex)
      ?? this.#game.canSkipCurrentPlacement?.()
      ?? false;
    if (!canSkip) return;

    const requestedNumber = Number(payload.dominoNumber);
    const choices = this.#game.getCurrentPlacingChoicesForPlayer?.(playerIndex)
      ?? this.#game.getCurrentPlacingChoices?.()
      ?? [];
    const drafted = Number.isInteger(requestedNumber)
      ? choices.find((choice) => choice.domino?.number === requestedNumber)
      : (this.#game.currentPlacingDraftedTileForPlayer?.(playerIndex) ?? this.#game.currentPlacingDraftedTile);
    if (!drafted?.domino) return;

    const source = this.#placementSkipAnimationSource(playerIndex, drafted);
    const { nx, nz } = this.#playerReserveAnchorDirection(playerIndex);
    const startedAt = performance.now();
    const duration = 620;
    const key = `skip|${playerIndex}|${drafted.domino.number}|${startedAt}`;
    this.#placementSkipAnimations.set(key, {
      key,
      playerIndex,
      dominoNumber: drafted.domino.number,
      domino: drafted.domino,
      startedAt,
      duration,
      sourceWorldX: source.leftX,
      sourceWorldZ: source.z,
      targetWorldX: source.leftX + nx * 0.34,
      targetWorldZ: source.z + nz * 0.34,
      sourceRotationY: source.rotationY,
    });
    this.#draftClaimAnimationStartedAt.set(key, startedAt);

    window.setTimeout(() => {
      this.#placementSkipAnimations.delete(key);
      this.#draftClaimAnimationStartedAt.delete(key);
      this.#renderGhost();
    }, duration + 140);
  }

  #startPlacementReturnAnimation() {
    if (this.#prefersReducedMotion()) return;
    if (!this.#hoverAnchor || !this.#isMyTurnToPlace()) return;
    const g = this.#game;
    const playerIndex = this.#placementPlayerIndex();
    const drafted = this.#currentPlacementDraftedTile();
    if (!g || playerIndex == null || !drafted) return;

    const rackTarget = this.#canvasPlacementChoiceTargetForDomino(playerIndex, drafted.domino.number);
    if (!rackTarget) return;

    const feedback = this.#placementFeedbackForAnchor(this.#hoverAnchor);
    const anchorEnd = feedback.ok ? feedback.anchorEnd : DominoEnd.LEFT;
    const board = g.players[playerIndex]?.board?.board;
    if (!board) return;

    const built = this.#buildProjectedBoard(board, drafted, this.#hoverAnchor, anchorEnd);
    const other = built.other;
    const leftCoord = anchorEnd === DominoEnd.LEFT ? this.#hoverAnchor : other;
    const rightCoord = anchorEnd === DominoEnd.RIGHT ? this.#hoverAnchor : other;
    const rightOffset = {
      x: rightCoord.x - leftCoord.x,
      y: rightCoord.y - leftCoord.y,
    };
    const current = this.#placementGhostAnimationCurrentPosition(this.#placementGhostAnimation)
      ?? { x: leftCoord.x, z: leftCoord.y };
    const boardOrigin = this.#boardOriginForPlayer(playerIndex);
    const duration = 980;
    const key = `return|${playerIndex}|${drafted.domino.number}|${performance.now()}`;
    const startedAt = performance.now();

    this.#placementReturnAnimations.set(drafted.domino.number, {
      key,
      playerIndex,
      dominoNumber: drafted.domino.number,
      domino: drafted.domino,
      startedAt,
      duration,
      sourceWorldX: boardOrigin.x + current.x,
      sourceWorldZ: boardOrigin.z + current.z,
      targetWorldX: rackTarget.leftX,
      targetWorldZ: rackTarget.z,
      sourceRotationY: this.#rotationYForRightOffset(rightOffset),
    });
    this.#draftClaimAnimationStartedAt.set(key, startedAt);

    window.setTimeout(() => {
      const currentReturn = this.#placementReturnAnimations.get(drafted.domino.number);
      if (!currentReturn || currentReturn.key !== key) return;
      this.#placementReturnAnimations.delete(drafted.domino.number);
      this.#draftClaimAnimationStartedAt.delete(key);
      this.#renderBoard();
      this.#renderGhost();
    }, duration + 120);
  }

  #handleCanvasPlacementChoiceTap(clientX, clientY) {
    const choice = this.#canvasPlacementChoiceAtClient(clientX, clientY);
    if (!choice) return false;
    if (choice.domino.number === this.#currentPlacementDraftedTile()?.domino.number) {
      return !this.#hoverAnchor;
    }
    this.#startPlacementReturnAnimation();
    this.#hoverAnchor = null;
    this.#localPlacementFocus = null;
    this.#hoverAnchorAuto = false;
    this.#placementGhostAnimation = null;
    this.#setCanvasNotice('');
    this.#sendPlacementPreview(true);
    this.#mp?.sendAction('selectPlacementTile', this.#placementActionPayload({
      dominoNumber: choice.domino.number,
      rackOnly: true,
    }));
    return true;
  }

  #handleCanvasPlacementConfirmTap(clientX, clientY, pointerType = 'mouse') {
    const target = this.#canvasPlacementConfirmTarget;
    if (!target) return false;
    if (!this.#isMyTurnToPlace() || !this.#hoverAnchor) return false;

    const point = this.#screenPointForObject(target.object);
    if (!point) return false;

    const viewHeight = Math.max(0.001, (this.#camera?.top ?? 1) - (this.#camera?.bottom ?? -1));
    const radiusFromWorld = (target.radiusWorld / viewHeight) * (point.rect.height || 1);
    const minRadius = pointerType === 'touch' ? 32 : 24;
    const maxRadius = pointerType === 'touch' ? 56 : 46;
    const radius = Math.max(minRadius, Math.min(maxRadius, radiusFromWorld));
    const dx = clientX - point.x;
    const dy = clientY - point.y;
    if ((dx * dx + dy * dy) > radius * radius) {
      return false;
    }

    this.#tryPlaceAtHover();
    return true;
  }

  #trySelectPlacementAnchor(grid, { localize = false, showError = false, render = false, auto = false } = {}) {
    if (!grid) return false;
    if (!this.#game || this.#game.state !== GameState.PLACE) return false;

    // Keep the selected anchor stable while cycling. Other valid cells,
    // including cells that appear in this anchor's move family, should
    // re-anchor around the clicked board tile.
    if (localize && this.#gridMatchesLocalPlacementAnchor(grid)) {
      this.#cycleLocalPlacement(1);
      return true;
    }

    const gridOptions = this.#placementOptionsForGrid(grid, null, { preserveDomino: true });
    const playerIndex = this.#placementPlayerIndex();
    const feedback = this.#game.getPlacementFeedbackAtForPlayer?.(playerIndex, grid.x, grid.y)
      ?? this.#game.getPlacementFeedbackAt(grid.x, grid.y);
    if (!feedback.ok) {
      const selectedDominoNumber = this.#currentPlacementDraftedTile()?.domino.number;
      const matchedOption = gridOptions.find((option) => option.dominoNumber === selectedDominoNumber)
        ?? gridOptions[0];
      if (matchedOption) {
        if (localize) this.#localPlacementFocus = { x: grid.x, y: grid.y };
        this.#applyPlacementOption(matchedOption);
        this.#hoverAnchorAuto = auto;
        this.#placementHint = '';
        this.#setCanvasNotice('');
        if (render) this.#renderGhost();
        return true;
      }

      if (showError) {
        this.#placementHint = feedback.reason;
        this.#setCanvasNotice(this.#placementHint || 'Invalid placement.', 'error');
      }
      if (render && !this.#hoverAnchor) this.#renderGhost();
      return false;
    }

    this.#hoverAnchor = { x: grid.x, y: grid.y, anchorEnd: feedback.anchorEnd };
    if (localize) this.#localPlacementFocus = { x: grid.x, y: grid.y };
    this.#hoverAnchorAuto = auto;
    this.#placementHint = '';
    this.#setCanvasNotice('');
    this.#sendPlacementPreview();
    if (render) this.#renderGhost();
    return true;
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

    const feedback = this.#placementFeedbackForAnchor(this.#hoverAnchor);
    if (!feedback.ok) {
      this.#placementHint = feedback.reason;
      this.#setCanvasNotice(this.#placementHint || 'Invalid placement.', 'error');
      return;
    }

    const anchorEnd = feedback.anchorEnd === DominoEnd.RIGHT ? 'RIGHT' : 'LEFT';
    this.#placementHint = '';
    this.#setCanvasNotice('');
    this.#localPlacementFocus = null;
    this.#syncLocalPlacementDock();
    this.#sendPlacementPreview(true);

    this.#mp?.sendAction('place', this.#placementActionPayload({
      x,
      y,
      anchorEnd,
      placeId: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }));
  }

  #flashError(message) {
    this.#setCanvasNotice(message, 'error', 1400);
  }

  #setLibraryOpen(open) {
    this.#libraryOpen = Boolean(open);
    if (!this.#libraryOpen) {
      this.#libraryFilter = null;
      this.#libraryFocusedDominoNumber = null;
    }
    if (this.#libraryOpen) this.#moreOpen = false;
    this.#hoverAnchor = null;
    this.#localPlacementFocus = null;
    this.#hoverAnchorAuto = false;
    this.#sendPlacementPreview(true);
    this.#setCanvasNotice('');
    const url = new URL(location.href);
    if (this.#libraryOpen) url.searchParams.set('library', '1');
    else {
      url.searchParams.delete('library');
      url.searchParams.delete('focus');
    }
    history.replaceState(null, '', url);
    this.#renderBoard();
    if (this.#libraryOpen) this.#centerOnDominoLibrary(true);
    else {
      this.#centerOnFocusedBoard(true);
      this.#renderGhost();
    }
    this.#refreshHud();
  }

  #setLibraryFilter(kind) {
    this.#libraryFilter = this.#libraryFilter === kind ? null : kind;
    this.#libraryFocusedDominoNumber = null;
    const url = new URL(location.href);
    url.searchParams.delete('focus');
    history.replaceState(null, '', url);
    this.#renderBoard();
    this.#centerOnDominoLibrary(true);
    this.#refreshHud();
  }

  #dominoLibraryLayout() {
    const deck = DominoPoolManager.getStartingDominoPool();
    const cols = 6;
    const cellX = 2.55;
    const cellZ = 1.55;
    const rows = Math.ceil(deck.length / cols);
    const xOffset = -((cols - 1) * cellX + 1) / 2;
    const zOffset = -((rows - 1) * cellZ) / 2;
    return { deck, cols, cellX, cellZ, rows, xOffset, zOffset };
  }

  #dominoLibraryPlacement(index, layout = this.#dominoLibraryLayout()) {
    const col = index % layout.cols;
    const row = Math.floor(index / layout.cols);
    return {
      baseX: layout.xOffset + col * layout.cellX,
      baseZ: layout.zOffset + row * layout.cellZ,
    };
  }

  #dominoLibraryPlacementByNumber(number) {
    const layout = this.#dominoLibraryLayout();
    const index = layout.deck.findIndex((domino) => domino.number === number);
    if (index < 0) return null;
    return { ...this.#dominoLibraryPlacement(index, layout), domino: layout.deck[index], layout };
  }

  #dominoLibraryFilterKeyForStatus(kind) {
    return `status:${kind}`;
  }

  #dominoLibraryFilterKeyForLandscape(landscape) {
    return `terrain:${landscapeKey(landscape)}`;
  }

  #dominoMatchesLibraryFilter(domino, status) {
    if (!this.#libraryFilter) return true;
    const [type, value] = this.#libraryFilter.split(':');
    if (type === 'status') return status.kind === value;
    if (type === 'terrain') {
      return landscapeKey(domino.leftEnd.landscape) === value || landscapeKey(domino.rightEnd.landscape) === value;
    }
    return true;
  }

  #libraryDominoAtClient(clientX, clientY) {
    const point = this.#boardPlanePointFromClient(clientX, clientY);
    if (!point) return null;
    const layout = this.#dominoLibraryLayout();
    for (let i = 0; i < layout.deck.length; i++) {
      const { baseX, baseZ } = this.#dominoLibraryPlacement(i, layout);
      if (
        point.x >= baseX - 0.66
        && point.x <= baseX + 1.66
        && point.z >= baseZ - 0.70
        && point.z <= baseZ + 0.72
      ) {
        return layout.deck[i].number;
      }
    }
    return null;
  }

  #handleLibraryTap(clientX, clientY) {
    const dominoNumber = this.#libraryDominoAtClient(clientX, clientY);
    if (dominoNumber == null) {
      this.#libraryFocusedDominoNumber = null;
      const url = new URL(location.href);
      url.searchParams.delete('focus');
      history.replaceState(null, '', url);
      this.#centerOnDominoLibrary(true);
      this.#renderBoard();
      return;
    }

    this.#libraryFocusedDominoNumber = dominoNumber;
    const url = new URL(location.href);
    url.searchParams.set('library', '1');
    url.searchParams.set('focus', String(dominoNumber));
    history.replaceState(null, '', url);
    this.#renderBoard();
    this.#centerOnLibraryDomino(dominoNumber, true);
  }

  #dominoLibraryStats() {
    const stats = new Map();
    for (const domino of DominoPoolManager.getStartingDominoPool()) {
      for (const tile of [domino.leftEnd, domino.rightEnd]) {
        const key = tile.landscape;
        const current = stats.get(key) ?? { total: 0, max: 0 };
        current.total += 1;
        current.max = Math.max(current.max, tile.crowns || 0);
        stats.set(key, current);
      }
    }
    return [Landscapes.WHEAT, Landscapes.FOREST, Landscapes.WATER, Landscapes.PASTURE, Landscapes.BOG, Landscapes.MINE]
      .map((landscape) => ({ landscape, ...(stats.get(landscape) ?? { total: 0, max: 0 }) }));
  }

  #dominoLibraryStatusByNumber() {
    const result = new Map();
    const remaining = new Set(this.#game?.remainingDominoNumbers ?? []);
    const activePlacingNumbers = new Set(
      this.#game?.state === GameState.PLACE
        ? (this.#game?.currentDraft ?? [])
          .filter((slot) => slot.player != null && !slot.placed)
          .map((slot) => slot.domino.number)
        : []
    );

    for (const domino of DominoPoolManager.getStartingDominoPool()) {
      result.set(domino.number, remaining.has(domino.number)
        ? { kind: 'deck', label: 'Deck', color: 0x7b8491 }
        : { kind: 'played', label: 'Played', color: 0x5b6170 });
    }

    for (const slot of this.#game?.currentDraft ?? []) {
      const number = slot.domino.number;
      if (slot.player == null) {
        result.set(number, slot.placed
          ? { kind: 'played', label: 'Discarded', color: 0x5b6170 }
          : { kind: 'available', label: 'Pick', color: 0xffd76a });
        continue;
      }

      const ownerName = this.#playerNames[slot.player] ?? this.#game?.players?.[slot.player]?.name ?? `P${slot.player + 1}`;
      const ownerColor = this.#playerColorHex(slot.player);
      if (slot.placed) {
        result.set(number, { kind: 'played-current', label: ownerName, color: ownerColor, playerIndex: slot.player });
      } else if (this.#game?.state === GameState.PLACE && activePlacingNumbers.has(number)) {
        result.set(number, { kind: 'placing', label: ownerName, color: ownerColor, playerIndex: slot.player });
      } else {
        result.set(number, { kind: 'claimed', label: ownerName, color: ownerColor, playerIndex: slot.player });
      }
    }

    return result;
  }

  #dominoLibraryLifecycleStats(statusByNumber = this.#dominoLibraryStatusByNumber()) {
    const labels = {
      available: 'Pick now',
      claimed: 'Claimed',
      placing: 'Placing',
      'played-current': 'Played this round',
      played: 'Played',
      deck: 'Still in deck',
    };
    const colors = {
      available: 0xffd76a,
      claimed: 0x8fc7ff,
      placing: 0x73e896,
      'played-current': 0x9fb2c8,
      played: 0x5b6170,
      deck: 0x7b8491,
    };
    const order = ['available', 'claimed', 'placing', 'played-current', 'played', 'deck'];
    const counts = new Map();
    for (const status of statusByNumber.values()) {
      counts.set(status.kind, (counts.get(status.kind) ?? 0) + 1);
    }
    return order
      .map((kind) => ({ kind, label: labels[kind], color: colors[kind], count: counts.get(kind) ?? 0 }))
      .filter((item) => item.count > 0);
  }

  #renderStartOverlay() {
    const showHome = this.#homeMode;
    const showLobby = this.#isLobbyWaiting();
    const show = showHome || showLobby;
    this.#root?.classList.toggle('isStartMode', show);
    if (!this.#startOverlay) return show;

    if (!show) {
      this.#startOverlay.hidden = true;
      this.#startOverlay.innerHTML = '';
      this.#resetStartAttract();
      return false;
    }

    this.#startOverlay.hidden = false;
    this.#startOverlay.innerHTML = '';
    if (this.#endOverlay) this.#endOverlay.hidden = true;
    if (this.#canvasTurn) this.#canvasTurn.classList.remove('show');
    if (this.#mobileActions) this.#mobileActions.classList.remove('show');
    if (this.#localPlacementDock) this.#localPlacementDock.hidden = true;

    const card = document.createElement('div');
    card.className = 'startCard';

    const kicker = document.createElement('div');
    kicker.className = 'startKicker';
    const isInviteJoin = showHome && !!this.#pendingInviteRoom;
    kicker.textContent = showHome ? (isInviteJoin ? 'Online Invite' : 'Table Setup') : 'Online Room';

    const title = document.createElement('h1');
    title.className = 'startTitle';
    title.textContent = showHome ? (isInviteJoin ? 'Join Game' : 'King Domino') : 'Waiting for opponent';

    const copy = document.createElement('p');
    copy.className = 'startCopy';

    if (showHome) {
      copy.textContent = isInviteJoin
        ? 'Choose your name before joining this room.'
        : 'Create a room, join by code, or play locally from the same screen.';

      const form = document.createElement('div');
      form.className = 'startForm';

      const nameField = document.createElement('div');
      nameField.className = 'startField';
      const nameLabel = document.createElement('label');
      nameLabel.textContent = 'Your name';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.autocomplete = 'name';
      nameInput.value = this.#myName || this.#storedPlayerName() || 'Player';
      nameInput.maxLength = 24;
      nameLabel.htmlFor = 'kd-start-name';
      nameInput.id = 'kd-start-name';
      nameField.append(nameLabel, nameInput);

      const roomField = document.createElement('div');
      roomField.className = 'startField';
      const roomLabel = document.createElement('label');
      roomLabel.textContent = 'Room code or invite link';
      const roomInput = document.createElement('input');
      roomInput.type = 'text';
      roomInput.placeholder = 'ABCD';
      roomInput.autocomplete = 'off';
      roomInput.autocapitalize = 'characters';
      roomInput.spellcheck = false;
      roomInput.value = this.#pendingInviteRoom;
      roomLabel.htmlFor = 'kd-start-room';
      roomInput.id = 'kd-start-room';
      roomField.append(roomLabel, roomInput);

      const playersField = document.createElement('div');
      playersField.className = 'startField';
      const playersLabel = document.createElement('label');
      playersLabel.textContent = 'Players';
      const playersInput = document.createElement('select');
      playersInput.id = 'kd-start-players';
      playersLabel.htmlFor = playersInput.id;
      for (const count of [2, 3, 4]) {
        const option = document.createElement('option');
        option.value = String(count);
        option.textContent = `${count} players`;
        option.selected = count === this.#playerCount;
        playersInput.append(option);
      }
      playersField.append(playersLabel, playersInput);

      const create = document.createElement('button');
      create.type = 'button';
      create.className = 'startPrimary';
      create.textContent = 'Create Online Game';
      const join = document.createElement('button');
      join.type = 'button';
      join.className = isInviteJoin ? 'startPrimary' : 'startSecondary';
      join.textContent = isInviteJoin ? 'Join This Game' : 'Join Game';
      const actions = document.createElement('div');
      actions.className = isInviteJoin ? 'startActions single' : 'startActions';
      if (isInviteJoin) {
        actions.append(join);
      } else {
        actions.append(create, join);
      }

      const inviteSummary = document.createElement('div');
      inviteSummary.className = 'inviteSummary';
      if (isInviteJoin) {
        const roomChip = document.createElement('span');
        roomChip.textContent = `Room ${this.#pendingInviteRoom}`;
        const playersChip = document.createElement('span');
        playersChip.textContent = `${this.#playerCount} players`;
        inviteSummary.append(roomChip, playersChip);
      }

      const moreOptions = document.createElement('button');
      moreOptions.type = 'button';
      moreOptions.className = 'startSecondary';
      moreOptions.textContent = this.#showInviteOptions ? 'Back to Invite' : 'Other Options';

      const fallbackActions = document.createElement('div');
      fallbackActions.className = 'startActions';
      const fallbackCreate = document.createElement('button');
      fallbackCreate.type = 'button';
      fallbackCreate.className = 'startPrimary';
      fallbackCreate.textContent = 'Create Online Game';
      const joinDifferent = document.createElement('button');
      joinDifferent.type = 'button';
      joinDifferent.className = 'startSecondary';
      joinDifferent.textContent = 'Join Room Code';
      fallbackActions.append(fallbackCreate, joinDifferent);

      const hotseatActions = document.createElement('div');
      hotseatActions.className = 'startActions single';
      const hotseat = document.createElement('button');
      hotseat.type = 'button';
      hotseat.className = 'startSecondary';
      hotseat.textContent = 'Play Hotseat';
      const highScores = document.createElement('button');
      highScores.type = 'button';
      highScores.className = 'startSecondary';
      highScores.textContent = 'High Scores';
      hotseatActions.append(hotseat, highScores);

      const joinRoom = () => {
        const room = this.#roomCodeFromInput(roomInput.value);
        if (!room) {
          roomInput.focus();
          return;
        }
        const count = this.#playerCountFromInput(roomInput.value, Number.parseInt(playersInput.value, 10));
        this.#connectOnlineRoom(room, nameInput.value, this.#seedForRoomInput(roomInput.value), count);
      };

      create.addEventListener('click', () => {
        this.#connectOnlineRoom(this.#randomRoomCode(), nameInput.value, null, Number.parseInt(playersInput.value, 10));
      });
      fallbackCreate.addEventListener('click', () => {
        this.#connectOnlineRoom(this.#randomRoomCode(), nameInput.value, null, Number.parseInt(playersInput.value, 10));
      });
      join.addEventListener('click', joinRoom);
      joinDifferent.addEventListener('click', joinRoom);
      moreOptions.addEventListener('click', () => {
        this.#showInviteOptions = !this.#showInviteOptions;
        this.#refreshHud();
      });
      roomInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') joinRoom();
      });
      nameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && roomInput.value.trim()) joinRoom();
      });
      hotseat.addEventListener('click', () => {
        this.#startHotseatGame(nameInput.value, Number.parseInt(playersInput.value, 10));
      });
      highScores.addEventListener('click', () => {
        this.#openScoreHistory();
      });

      if (isInviteJoin) {
        form.append(nameField, inviteSummary, actions, moreOptions);
        if (this.#showInviteOptions) {
          form.append(roomField, playersField, fallbackActions, hotseatActions);
        }
      } else {
        form.append(nameField, roomField, playersField, actions, hotseatActions);
      }
      card.append(kicker, title, copy, form);
      this.#startOverlay.append(card);
      return true;
    }

    const roomCode = document.createElement('div');
    roomCode.className = 'roomCode';
    roomCode.textContent = this.#roomId ?? '';

    copy.textContent = this.#lobbyNotice
      ? `${this.#lobbyNotice} Send the invite link again, wait for another player, or end this game.`
      : `Send the invite link or room code. The game will unlock when all ${this.#playerCount} players join.`;

    const inviteField = document.createElement('div');
    inviteField.className = 'startField inviteField';
    const inviteLabel = document.createElement('label');
    inviteLabel.textContent = 'Invite link';
    const inviteInput = document.createElement('input');
    inviteInput.type = 'text';
    inviteInput.readOnly = true;
    inviteInput.value = this.#inviteUrl();
    inviteLabel.htmlFor = 'kd-invite-link';
    inviteInput.id = 'kd-invite-link';
    inviteField.append(inviteLabel, inviteInput);
    inviteField.hidden = true;

    const players = document.createElement('div');
    players.className = 'lobbyPlayers';
    for (let i = 0; i < this.#playerCount; i++) {
      const row = document.createElement('div');
      const name = this.#playerNames[i];
      row.className = 'lobbyPlayer';
      row.classList.toggle('isEmpty', !name);
      const left = document.createElement('span');
      left.textContent = name || 'Waiting for player';
      const right = document.createElement('span');
      right.textContent = i === this.#myPlayerIndex ? 'You' : `Player ${i + 1}`;
      row.append(left, right);
      players.append(row);
    }

    const actions = document.createElement('div');
    actions.className = 'startActions';
    const copyInvite = document.createElement('button');
    copyInvite.type = 'button';
    copyInvite.className = 'startPrimary';
    copyInvite.textContent = 'Copy Link';
    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'startSecondary';
    leave.textContent = 'End Game';
    actions.append(copyInvite, leave);

    const resetCopyButton = () => {
      if (copyInvite.isConnected) copyInvite.textContent = 'Copy Link';
    };

    copyInvite.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(inviteInput.value);
        copyInvite.textContent = 'Copied';
        setTimeout(resetCopyButton, 1400);
      } catch {
        inviteField.hidden = false;
        inviteInput.focus();
        inviteInput.select();
        copyInvite.textContent = 'Link Selected';
        setTimeout(resetCopyButton, 1800);
      }
    });

    leave.addEventListener('click', () => {
      this.#returnToStartScreen();
    });

    card.append(kicker, title, roomCode, copy, inviteField, players, actions);
    this.#startOverlay.append(card);
    return true;
  }

  #refreshHud() {
    this.#perfCounters.refreshHud += 1;
    const g = this.#game;
    this.#root?.classList.toggle('isLibraryMode', this.#libraryOpen);
    this.#renderScoreHistoryOverlay();
    this.#syncHotseatPlayerIndex();
    this.#syncMobilePanelForPhase();
    if (this.#renderStartOverlay()) return;
    if (this.#libraryOpen) {
      this.#hudTitle.textContent = 'Domino Library';
      this.#hudBody.innerHTML = '';
      if (this.#topBar) this.#topBar.hidden = false;
      if (this.#endOverlay) this.#endOverlay.hidden = true;
      if (this.#miniMapDock) this.#miniMapDock.hidden = true;
      if (this.#canvasTurn) this.#canvasTurn.classList.remove('show');
      if (this.#mobileActions) this.#mobileActions.classList.remove('show');
      if (this.#localPlacementDock) this.#localPlacementDock.hidden = true;
      this.#primaryControlsRow.hidden = true;
      this.#secondaryControlsRow.hidden = false;
      this.#tertiaryControlsRow.hidden = !this.#moreOpen;
      this.#btnRotate.hidden = true;
      this.#btnResetTile.hidden = true;
      this.#btnScores.hidden = true;
      this.#btnSkip.hidden = true;
      this.#btnUndoRequest.hidden = true;
      this.#btnToggleAdvisor.hidden = true;
      this.#btnToggleMiniMap.hidden = true;
      this.#btnHighScores.hidden = true;
      this.#btnRestart.hidden = true;
      this.#btnEndGame.hidden = true;
      this.#btnMore.hidden = false;
      this.#btnMore.classList.toggle('active', this.#moreOpen);
      this.#btnMore.textContent = this.#moreOpen ? 'Close' : 'Menu';
      this.#btnCenter.hidden = false;
      this.#btnCenter.disabled = false;
      this.#btnLibrary.hidden = false;
      this.#btnLibrary.disabled = false;
      this.#btnLibrary.textContent = 'Back to Game';

      const summary = document.createElement('div');
      summary.className = 'librarySummary';
      const statusByNumber = this.#dominoLibraryStatusByNumber();

      const kicker = document.createElement('div');
      kicker.className = 'libraryKicker';
      kicker.textContent = 'Full Deck';

      const copy = document.createElement('p');
      copy.className = 'libraryCopy';
      copy.textContent = 'All 48 dominoes are laid out in number order. Badges show what can be picked now, what players have claimed, what has already been played, and what is still waiting in the deck.';

      const lifecycle = document.createElement('div');
      lifecycle.className = 'libraryStats lifecycle';
      for (const item of this.#dominoLibraryLifecycleStats(statusByNumber)) {
        const filterKey = this.#dominoLibraryFilterKeyForStatus(item.kind);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'libraryStat libraryFilter';
        row.classList.toggle('active', this.#libraryFilter === filterKey);
        row.setAttribute('aria-pressed', this.#libraryFilter === filterKey ? 'true' : 'false');
        const name = document.createElement('span');
        const swatch = document.createElement('span');
        swatch.className = 'librarySwatch';
        swatch.style.background = `#${item.color.toString(16).padStart(6, '0')}`;
        const label = document.createElement('span');
        label.textContent = item.label;
        name.append(swatch, label);
        const count = document.createElement('span');
        count.textContent = String(item.count);
        row.append(name, count);
        row.addEventListener('click', () => this.#setLibraryFilter(filterKey));
        lifecycle.append(row);
      }

      const stats = document.createElement('div');
      stats.className = 'libraryStats';
      for (const item of this.#dominoLibraryStats()) {
        const filterKey = this.#dominoLibraryFilterKeyForLandscape(item.landscape);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'libraryStat libraryFilter';
        row.classList.toggle('active', this.#libraryFilter === filterKey);
        row.setAttribute('aria-pressed', this.#libraryFilter === filterKey ? 'true' : 'false');
        const name = document.createElement('span');
        const swatch = document.createElement('span');
        swatch.className = 'librarySwatch';
        swatch.style.background = `#${(LANDSCAPE_COLORS[item.landscape] ?? 0xffffff).toString(16).padStart(6, '0')}`;
        const label = document.createElement('span');
        label.textContent = landscapeLabel(item.landscape);
        name.append(swatch, label);
        const max = document.createElement('span');
        max.textContent = item.max > 0 ? `up to ${crownsText(item.max)}` : 'plain';
        row.append(name, max);
        row.addEventListener('click', () => this.#setLibraryFilter(filterKey));
        stats.append(row);
      }

      summary.append(kicker, copy, lifecycle, stats);
      this.#hudBody.append(summary);
      return;
    }
    if (this.#miniMapDock) this.#miniMapDock.hidden = !this.#showMiniMap;
    this.#btnMore.hidden = false;
    this.#btnLibrary.hidden = false;
    this.#btnLibrary.disabled = false;
    this.#btnLibrary.textContent = 'Library';
    this.#btnCenter.hidden = false;
    this.#btnCenter.disabled = false;

    const standings = g.players
      .map((p, i) => ({
        index: i,
        name: this.#playerNames[i] ?? p.name ?? `Player ${i + 1}`,
        score: p.board.score,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    this.#hudTitle.textContent = g.isGameOver
      ? 'End of Game'
      : this.#roundProgressLabel(g);
    if (this.#topBar) this.#topBar.hidden = true;
    this.#root?.classList.toggle('isDraftPhase', g.state === GameState.DRAFT && !g.isGameOver);
    this.#root?.classList.toggle('isPlacementPhase', g.state === GameState.PLACE && !g.isGameOver);
    if (this.#hud) this.#hud.hidden = g.isGameOver;
    if (this.#endOverlay) this.#endOverlay.hidden = !g.isGameOver;

    const canPlaceUi = this.#isMyTurnToPlace() && !g.isGameOver && !!this.#currentPlacementDraftedTile() && !this.#isGameplayPausedForUndo();
    const placementOptions = canPlaceUi ? this.#uniqueVisiblePlacementOptions(this.#currentPlacementOptions()) : [];
    const hasPlacementOptions = placementOptions.length > 0;
    const canRequestUndo = !g.isGameOver && this.#myPlayerIndex != null && !!this.#latestUndoablePlaceAction() && !this.#pendingUndoRequest;
    const canSkip = canPlaceUi && this.#canSkipPlacement();
    const isPlacementPhase = g.state === GameState.PLACE && !g.isGameOver;
    const useCanvasWorldUi = this.#canvasDraftEnabled();
    this.#primaryControlsRow.hidden = !canSkip;
    this.#primaryControlsRow.classList.toggle('skipOnly', canSkip);
    this.#secondaryControlsRow.hidden = false;
    this.#tertiaryControlsRow.hidden = !this.#moreOpen;
    this.#btnRotate.disabled = !canPlaceUi;
    this.#btnRotate.hidden = !isPlacementPhase || canSkip;
    this.#btnResetTile.hidden = !isPlacementPhase || canSkip;
    this.#btnSkip.disabled = !canSkip;
    this.#btnSkip.hidden = !canSkip;
    this.#btnUndoRequest.disabled = !canRequestUndo;
    this.#btnUndoRequest.hidden = !canRequestUndo;
    this.#btnToggleMiniMap.hidden = false;
    this.#btnToggleMiniMap.classList.toggle('active', this.#showMiniMap);
    this.#btnToggleMiniMap.textContent = this.#showMiniMap ? 'Hide Minimap' : 'Show Minimap';
    this.#btnToggleMiniMap.setAttribute('aria-pressed', this.#showMiniMap ? 'true' : 'false');
    this.#btnToggleAdvisor.hidden = false;
    this.#btnToggleAdvisor.classList.toggle('active', this.#showAdvisor);
    this.#btnToggleAdvisor.textContent = this.#showAdvisor ? 'Hide Advisor' : 'Show Advisor';
    this.#btnToggleAdvisor.setAttribute('aria-pressed', this.#showAdvisor ? 'true' : 'false');
    this.#btnHighScores.hidden = false;
    this.#btnRestart.hidden = false;
    this.#btnEndGame.hidden = false;
    this.#btnScores.disabled = !canPlaceUi;
    this.#btnScores.hidden = !isPlacementPhase || canSkip;
    this.#btnScores.classList.toggle('active', this.#showPlacementScores);
    this.#btnScores.textContent = this.#showPlacementScores ? 'Preview On' : 'Score Preview';
    this.#btnMore.classList.toggle('active', this.#moreOpen);
    this.#btnMore.textContent = this.#moreOpen ? 'Close' : 'Menu';
    this.#btnNextValid.hidden = true;
    this.#btnPlace.hidden = true;
    this.#btnNextValid.disabled = !canPlaceUi || !hasPlacementOptions;
    this.#btnResetTile.disabled = !canPlaceUi || !hasPlacementOptions;
    this.#btnPlace.disabled = !canPlaceUi || !hasPlacementOptions;
    this.#btnSkip.classList.toggle('primaryAction', canSkip);
    this.#btnSkip.classList.toggle('secondaryAction', !canSkip);
    this.#btnSkip.textContent = 'Skip';
    this.#btnPlace.textContent = 'Place';

    this.#hudBody.innerHTML = '';
    if (this.#endOverlay) this.#endOverlay.innerHTML = '';

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

    if (g.isGameOver) {
      this.#recordCompletedGameIfNeeded();
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
      if (this.#endOverlay) {
        const card = document.createElement('div');
        card.className = 'endCard';
        card.classList.toggle('isCollapsed', this.#endSummaryCollapsed);
        this.#endOverlay.classList.toggle('isCollapsed', this.#endSummaryCollapsed);

        const kicker = document.createElement('div');
        kicker.className = 'endKicker';
        kicker.textContent = 'Game Over';

        const title = document.createElement('div');
        title.className = 'endTitle';
        title.textContent = winners.length > 1
          ? `Tie at ${topScore}`
          : `${winners[0].name} wins`;

        const summary = document.createElement('div');
        summary.className = 'muted';
        summary.textContent = winners.length > 1
          ? `Shared by ${winners.map((w) => w.name).join(', ')}.`
          : `Final score: ${topScore}`;

        const rank = document.createElement('div');
        rank.className = 'endScoreList';
        standings.forEach((s, i) => {
          const row = document.createElement('div');
          row.className = 'endScoreRow';
          const left = document.createElement('div');
          left.textContent = `#${i + 1} ${s.name}`;
          const right = document.createElement('strong');
          right.textContent = `${s.score}`;
          row.append(left, right);
          rank.append(row);
        });

        const actions = document.createElement('div');
        actions.className = 'endActions';
        const inspect = document.createElement('button');
        inspect.className = 'secondaryAction';
        inspect.textContent = this.#endSummaryCollapsed ? 'Show Results' : 'Inspect Board';
        inspect.addEventListener('click', () => {
          this.#endSummaryCollapsed = !this.#endSummaryCollapsed;
          this.#refreshHud();
        });
        const highScores = document.createElement('button');
        highScores.className = 'secondaryAction';
        highScores.textContent = 'High Scores';
        highScores.addEventListener('click', () => this.#openScoreHistory());
        actions.append(inspect, highScores);

        card.append(kicker, title, summary, rank, actions);
        this.#endOverlay.append(card);
      }

      if (this.#showMiniMap) this.#renderMiniMaps();
      this.#syncMobileActions();
      this.#syncMobilePlacementStack();
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

    if (this.#connStatus && this.#connStatus.state !== 'hotseat' && this.#connStatus.state !== 'open') {
      const conn = document.createElement('div');
      conn.className = 'muted';
      const s = this.#connStatus;
      if (s.state === 'reconnecting') conn.textContent = `Connection: reconnecting (attempt ${s.attempt}, ${Math.ceil((s.delay ?? 0) / 100) / 10}s)`;
      else conn.textContent = `Connection: ${s.state}`;
      this.#hudBody.append(conn);
    }

    if (g.state === GameState.DRAFT) {
      this.#placementHint = '';
      this.#hoverAnchor = null;
      this.#hoverAnchorAuto = false;
      this.#setCanvasNotice('');
      if (!useCanvasWorldUi) {
        const nextOrderByNumber = [...g.currentDraft]
          .sort((a, b) => a.domino.number - b.domino.number);
        const nextSlotByDominoNumber = new Map(
          nextOrderByNumber.map((slot, i) => [slot.domino.number, i + 1])
        );
        const pickOrder = g.pickOrder ?? [];
        const pickedCount = g.pickCursor ?? g.currentDraft.filter((slot) => slot.player != null).length;
        const draftActiveIdx = g.currentPickingPlayerIndex;
        const draftActiveName = this.#playerNames[draftActiveIdx] ?? g.players[draftActiveIdx]?.name ?? `Player ${draftActiveIdx + 1}`;
        const draftIsMine = !this.#hotseat && isMine;
        const turnMeta = this.#draftTurnMeta(pickOrder, pickedCount, draftActiveIdx);
        const draftSuggestion = this.#showAdvisor ? this.#advisor.suggestDraftMove(g, draftActiveIdx) : null;

        const summary = document.createElement('div');
        summary.className = 'phaseSummary';
        summary.append(this.#createRoundProgress(g));

        const turn = document.createElement('div');
        turn.className = 'draftTurnBanner';
        turn.classList.toggle('isMine', draftIsMine);
        turn.classList.toggle('isBackToBack', turnMeta.backToBack);

        const turnTitle = document.createElement('strong');
        turnTitle.textContent = draftIsMine ? 'Your pick' : `${draftActiveName} picking`;
        const turnDetail = document.createElement('span');
        turnDetail.className = 'draftTurnMeta';
        const pickCountText = turnMeta.totalPicks > 1
          ? `Pick ${Math.max(1, turnMeta.pickNumber)} of ${turnMeta.totalPicks}.`
          : 'Pick one tile.';
        const backToBackText = turnMeta.backToBack
          ? (draftIsMine ? 'You pick again next.' : `${draftActiveName} picks again next.`)
          : null;
        turnDetail.textContent = [pickCountText, backToBackText].filter(Boolean).join(' ');
        turn.append(turnTitle, turnDetail);
        summary.append(turn);
        this.#hudBody.append(summary);

        const list = document.createElement('div');
        list.className = 'draftList';
        g.currentDraft.forEach((slot, idx) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'draftItem';
          item.classList.toggle('isPicked', slot.player != null);
          item.classList.toggle('isCurrentPick', idx === pickedCount && slot.player == null);
          item.classList.toggle('isMine', idx === pickedCount && slot.player == null && draftIsMine);
          const isAdvisorPick = draftSuggestion?.index === idx && slot.player == null;
          item.classList.toggle('isAdvisorPick', isAdvisorPick);

          const nextSlot = nextSlotByDominoNumber.get(slot.domino.number) ?? '?';
          const ownerName = slot.player == null
            ? null
            : this.#playerNames[slot.player] ?? g.players[slot.player].name;
          const queuedPlayerIndex = idx >= pickedCount ? pickOrder[idx] : null;
          const queuedPlayerName = queuedPlayerIndex == null
            ? null
            : this.#playerNames[queuedPlayerIndex] ?? g.players[queuedPlayerIndex].name;

          const turnSlot = document.createElement('div');
          turnSlot.className = 'draftTurnSlot';
          turnSlot.classList.toggle('isEmpty', queuedPlayerIndex == null);
          if (queuedPlayerIndex != null) {
            turnSlot.append(this.#createDraftPlayerToken(queuedPlayerIndex, idx === pickedCount));
          }

          const preview = this.#createDominoPreview(slot.domino);
          const statusLabel = ownerName ? `picked by ${ownerName}` : `available as next order ${nextSlot}`;
          const advisorLabel = isAdvisorPick
            ? ` Advisor says ${draftSuggestion.phrase || 'try this'}: ${draftSuggestion.summary || draftSuggestion.focus}.`
            : '';
          item.setAttribute(
            'aria-label',
            `Domino ${slot.domino.number}, ${statusLabel}. ${landscapeLabel(slot.domino.leftEnd.landscape)} with ${slot.domino.leftEnd.crowns || 0} crowns and ${landscapeLabel(slot.domino.rightEnd.landscape)} with ${slot.domino.rightEnd.crowns || 0} crowns.${advisorLabel}`
          );

          const claimSlot = document.createElement('div');
          claimSlot.className = 'draftClaimSlot';
          claimSlot.classList.toggle('isEmpty', slot.player == null);
          if (ownerName) {
            claimSlot.append(this.#createDraftPlayerToken(slot.player));
          }
          item.title = queuedPlayerName
            ? `${queuedPlayerName} is in this pick-order position.`
            : ownerName
              ? `${ownerName} claimed this tile.`
              : '';
          if (isAdvisorPick) {
            item.title = [item.title, `Advisor: ${draftSuggestion.summary || draftSuggestion.focus}`]
              .filter(Boolean)
              .join('\n');
          }

          item.append(turnSlot, preview, claimSlot);
          if (isAdvisorPick) {
            const badge = document.createElement('span');
            badge.className = 'advisorBadge';
            badge.textContent = draftSuggestion.phrase || 'Advisor';
            item.append(badge);
          }

          item.disabled = slot.player != null || !this.#isMyTurnToPick() || this.#isGameplayPausedForUndo();
          item.addEventListener('click', () => {
            if (!this.#isMyTurnToPick()) return;
            if (this.#isGameplayPausedForUndo()) return;
            this.#mp?.sendAction('pickDraft', { index: idx });
          });

          list.append(item);
        });
        this.#hudBody.append(list);
      }
    } else {
      const drafted = this.#currentPlacementDraftedTile();
      if (drafted) {
        const choices = this.#currentPlacementChoices();
        if (choices.length > 0 && !useCanvasWorldUi) {
          const chooser = document.createElement('div');
          chooser.className = 'placementChoices';
          const placementPlayerIndex = this.#placementPlayerIndex();
          chooser.style.setProperty('--player-color', this.#playerMiniMapColor(placementPlayerIndex, 0.95));
          chooser.style.setProperty('--player-color-soft', this.#playerMiniMapColor(placementPlayerIndex, 0.30));
          chooser.style.setProperty('--player-color-glow', this.#playerMiniMapColor(placementPlayerIndex, 0.24));

          const list = document.createElement('div');
          list.className = 'placementChoiceList';
          for (const choice of choices) {
            const b = document.createElement('button');
            const n = choice.domino.number;
            const selected = n === drafted.domino.number;
            b.className = selected ? 'placementChoice selected' : 'placementChoice';
            b.setAttribute('aria-pressed', selected ? 'true' : 'false');
            b.setAttribute('aria-label', `${selected ? 'Selected' : 'Choose'} domino ${n}`);

            if (!selected) {
              const header = document.createElement('div');
              header.className = 'placementChoiceHeader';
              const state = document.createElement('span');
              state.className = 'placementChoiceStatus';
              state.textContent = 'Pick';
              header.append(state);
              b.append(header);
            }
            b.append(this.#createDominoPreview(choice.domino, true));
            b.disabled = !this.#isMyTurnToPlace() || this.#isGameplayPausedForUndo();
            b.addEventListener('click', () => {
              if (!this.#isMyTurnToPlace()) return;
              if (this.#isGameplayPausedForUndo()) return;
              if (n === this.#currentPlacementDraftedTile()?.domino.number) return;
              this.#mp?.sendAction('selectPlacementTile', this.#placementActionPayload({ dominoNumber: n }));
            });
            list.append(b);
          }

          chooser.append(list);
          this.#hudBody.append(chooser);
        }
      }

      if (!this.#isMyTurnToPlace()) {
        this.#placementHint = '';
        this.#hoverAnchor = null;
        this.#localPlacementFocus = null;
        this.#hoverAnchorAuto = false;
        this.#setCanvasNotice('');
      }
    }

    if (this.#hud && !g.isGameOver) {
      const hasHudContent = this.#hudBody.childElementCount > 0 || Boolean(this.#hudBody.textContent.trim());
      this.#hud.hidden = !hasHudContent;
    }

    if (this.#showMiniMap) this.#renderMiniMaps();
    this.#syncMobileActions();
    this.#syncMobilePlacementStack();
  }

  #renderBoard() {
    this.#perfCounters.renderBoard += 1;
    this.#animatedObjects = [];
    while (this.#tilesGroup.children.length) this.#tilesGroup.remove(this.#tilesGroup.children[0]);
    if (this.#isStartAttractMode() && !this.#libraryOpen) {
      this.#renderDominoLibraryScene({
        attract: true,
        focusNumber: this.#startAttractFocusedDominoNumber,
      });
      return;
    }
    if (this.#libraryOpen) {
      this.#renderDominoLibraryScene();
      return;
    }

    const players = this.#game?.players ?? [];
    const previousGroup = this.#currentTileRenderGroup;
    for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
      const player = players[playerIndex];
      const boardManager = player.board;
      const board = boardManager.board;
      const boardGroup = new THREE.Group();
      const origin = this.#boardOriginForPlayer(playerIndex);
      boardGroup.position.set(origin.x, 0, origin.z);
      boardGroup.userData.playerIndex = playerIndex;
      this.#tilesGroup.add(boardGroup);
      this.#currentTileRenderGroup = boardGroup;
      this.#addPlayerPlayArea(playerIndex, boardManager);
      this.#addPlayerScorePlaque(playerIndex, boardManager);

      for (const k of Object.keys(board)) {
        const tile = board[k];
        const tileSeedKey = this.#tileArtSeedKey(tile, `${playerIndex}|${k}`);
        const material = this.#getTileMaterial(tile.landscape, tile.crowns || 0, tileSeedKey, false);

        const tileMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.98, 0.22, 0.98),
          material
        );
        tileMesh.position.set(tile.x, 0.11, tile.y);
        this.#addTileObjects(tileMesh);

        if (tile.landscape === Landscapes.CASTLE) {
          this.#addCastleDetail(tile.x, tile.y, board, boardManager, playerIndex);
        } else {
          this.#addLandscapeDetail(tile, tileSeedKey);
          if ((tile.crowns || 0) > 0) {
            this.#addCrownedLandmark(tile, tileSeedKey);
            this.#addCrownStars(tile.x, tile.y, tile.crowns);
          }
        }

        if (tile.landscape === Landscapes.CASTLE) {
          const sprite = createTextSprite('♜', {
            font: '700 56px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
            fillStyle: '#f5fbff',
            background: this.#playerMiniMapColor(playerIndex, 0.82),
            border: this.#playerMiniMapColor(playerIndex, 0.95),
          });
          sprite.position.set(tile.x, 0.38, tile.y);
          this.#addTileObjects(sprite);
        }
      }
    }
    this.#currentTileRenderGroup = previousGroup;

    if (this.#game?.state === GameState.DRAFT && !this.#game.isGameOver) {
      this.#renderCanvasDraft();
    } else if (this.#game?.state === GameState.PLACE && !this.#game.isGameOver) {
      if (this.#autoDraftClaimHoldActive()) {
        this.#renderCanvasDraft({ claimHold: true });
      } else {
        this.#renderCanvasDraft({ referenceOnly: true });
      }
      this.#renderCanvasPlacementChoices();
    }

    this.#syncBoardLayerPositions();
    this.#renderRegionScoring(null);
  }

  #renderCanvasDraft({ referenceOnly = false, claimHold = false } = {}) {
    if (!this.#canvasDraftEnabled()) return;
    const g = this.#game;
    if (!g || (g.state !== GameState.DRAFT && !((referenceOnly || claimHold) && g.state === GameState.PLACE))) return;

    const layout = this.#canvasDraftLayout();
    const pickOrder = g.pickOrder ?? [];
    const pickedCount = g.pickCursor ?? g.currentDraft.filter((slot) => slot.player != null).length;
    const passive = referenceOnly || claimHold;
    const activeIdx = passive ? null : g.currentPickingPlayerIndex;
    const suggestion = passive || !this.#showAdvisor ? null : this.#advisor.suggestDraftMove(g, activeIdx);
    const previousGroup = this.#currentTileRenderGroup;
    const draftGroup = new THREE.Group();
    draftGroup.userData.canvasDraft = true;
    this.#tilesGroup.add(draftGroup);
    const reserveGroup = new THREE.Group();
    reserveGroup.userData.canvasDraftReserve = true;
    this.#tilesGroup.add(reserveGroup);
    this.#currentTileRenderGroup = draftGroup;
    const previousOrigin = this.#lastCanvasDraftOrigin;
    if (
      previousOrigin
      && !this.#prefersReducedMotion()
      && Math.hypot(previousOrigin.x - layout.origin.x, previousOrigin.z - layout.origin.z) > 0.08
    ) {
      draftGroup.position.set(previousOrigin.x - layout.origin.x, 0, previousOrigin.z - layout.origin.z);
      this.#registerAnimatedObject(draftGroup, 'draftTray', {
        targetPosition: new THREE.Vector3(0, 0, 0),
        startedAt: performance.now(),
        duration: 620,
      });
    }
    this.#lastCanvasDraftOrigin = { x: layout.origin.x, z: layout.origin.z };

    this.#addCanvasDraftTray(layout);

    for (const row of layout.rows) {
      const slot = row.slot;
      const owner = slot.player;
      const queuedPlayerIndex = row.index >= pickedCount ? pickOrder[row.index] : null;
      const isCurrentPick = !passive && row.index === pickedCount && owner == null;
      const isAdvisorPick = suggestion?.index === row.index && owner == null;
      const rowColor = 0x28313b;
      const rowOpacity = 0.10;

      const base = new THREE.Mesh(
        new THREE.PlaneGeometry(row.xMax - row.xMin, row.zMax - row.zMin),
        new THREE.MeshBasicMaterial({
          color: rowColor,
          transparent: true,
          opacity: rowOpacity,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      base.position.set((row.xMin + row.xMax) / 2, 0.010, row.z);
      base.rotation.x = -Math.PI / 2;
      base.renderOrder = -0.25;
      this.#addTileObjects(base);

      this.#addCanvasDraftToken(passive ? null : queuedPlayerIndex, row.turnX, row.z, {
        current: isCurrentPick,
        empty: passive || queuedPlayerIndex == null,
      });
      const claimTarget = owner == null ? null : this.#canvasDraftClaimTarget(row, owner);
      const claimMeta = owner == null ? null : this.#draftClaimMetaFor(row, owner);
      if (owner != null) {
        this.#addCanvasDraftPlaceholder(row.leftX, row.z);
      }
      if (!passive && owner != null) {
        this.#currentTileRenderGroup = reserveGroup;
        this.#addCanvasDraftDomino(slot.domino, row.leftX, row.z, {
          dim: false,
          advisor: false,
          claimed: true,
          sourceLeftX: claimMeta?.leftX,
          sourceZ: claimMeta?.z,
          targetLeftX: claimMeta?.targetLeftX ?? claimTarget?.leftX,
          targetZ: claimMeta?.targetZ ?? claimTarget?.z,
          animationKey: claimMeta?.key,
          playerIndex: owner,
        });
        this.#currentTileRenderGroup = draftGroup;
      } else if (!passive && !slot.placed) {
        this.#addCanvasDraftDomino(slot.domino, row.leftX, row.z, {
          dim: false,
          advisor: isAdvisorPick,
          claimed: false,
        });
      } else if (passive && owner == null) {
        this.#addCanvasDraftPlaceholder(row.leftX, row.z);
      }
      this.#addCanvasDraftToken(owner, row.claimX, row.z, {
        current: false,
        empty: owner == null,
        outline: owner == null,
      });

      if (isAdvisorPick) this.#addCanvasDraftAdvisor(row, suggestion);
    }

    this.#currentTileRenderGroup = previousGroup;
  }

  #addCanvasDraftAdvisor(row, suggestion) {
    if (!row || !suggestion) return;
    const position = this.#canvasDraftAdvisorPosition(row);
    const group = new THREE.Group();
    group.position.set(position.x, 0, position.z);
    group.userData.draftAdvisor = true;

    const robeMaterial = new THREE.MeshStandardMaterial({
      color: 0xb98f4a,
      roughness: 0.56,
      metalness: 0.06,
      emissive: 0x2b1b08,
      emissiveIntensity: 0.10,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd76a,
      roughness: 0.48,
      metalness: 0.10,
      emissive: 0x4c3310,
      emissiveIntensity: 0.16,
    });
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3cf9c,
      roughness: 0.64,
      metalness: 0.02,
    });

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 28),
      new THREE.MeshBasicMaterial({
        color: 0x05070a,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    shadow.position.set(0, 0.018, 0);
    shadow.rotation.x = -Math.PI / 2;
    group.add(shadow);

    const figure = new THREE.Group();
    group.add(figure);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.34, 12), robeMaterial);
    body.position.set(0, 0.30, 0);
    figure.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), skinMaterial);
    head.position.set(0, 0.54, 0);
    figure.add(head);

    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.22, 12), trimMaterial);
    hat.position.set(0, 0.72, 0);
    hat.rotation.z = -0.10;
    figure.add(hat);

    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 18), trimMaterial);
    brim.position.set(0, 0.62, 0);
    figure.add(brim);

    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.58, 8), trimMaterial);
    staff.position.set(0.20, 0.37, 0.02);
    staff.rotation.z = -0.18;
    figure.add(staff);

    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.42, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    marker.position.set(0, 0.026, 0);
    marker.rotation.x = -Math.PI / 2;
    group.add(marker);

    const bubble = createAdvisorSpeechSprite(suggestion.phrase || 'Try this');
    bubble.position.set(-0.82, 1.04, -0.20);
    group.add(bubble);

    this.#addTileObjects(group);
    this.#registerAnimatedObject(figure, 'advisor', {
      phase: (suggestion.dominoNumber ?? 0) * 0.37,
      speed: 1.45,
      amplitude: 1,
    });
  }

  #addCanvasDraftTray(layout) {
    if (!layout?.rows?.length) return;
    const minX = Math.min(...layout.rows.map((row) => row.xMin)) - 0.30;
    const maxX = Math.max(...layout.rows.map((row) => row.xMax)) + 0.30;
    const minZ = Math.min(...layout.rows.map((row) => row.zMin)) - 0.30;
    const maxZ = Math.max(...layout.rows.map((row) => row.zMax)) + 0.30;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const width = maxX - minX;
    const height = maxZ - minZ;
    const accentColor = 0xd8c7a4;

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 0.26, height + 0.26),
      new THREE.MeshBasicMaterial({
        color: 0x05070a,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    shadow.position.set(cx + 0.10, 0.002, cz + 0.10);
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = -0.72;
    this.#addTileObjects(shadow);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.06, height),
      new THREE.MeshStandardMaterial({
        color: 0x2c2923,
        roughness: 0.74,
        metalness: 0.06,
        emissive: 0x100d09,
        emissiveIntensity: 0.10,
      })
    );
    floor.position.set(cx, -0.030, cz);
    floor.renderOrder = -0.71;
    this.#addTileObjects(floor);

    const tray = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: 0x393327,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        side: THREE.DoubleSide,
      })
    );
    tray.position.set(cx, 0.004, cz);
    tray.rotation.x = -Math.PI / 2;
    tray.renderOrder = -0.70;
    this.#addTileObjects(tray);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 0.10, height + 0.10),
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    glow.position.set(cx, 0.006, cz);
    glow.rotation.x = -Math.PI / 2;
    glow.renderOrder = -0.69;
    this.#addTileObjects(glow);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height)),
      new THREE.LineBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.38,
      })
    );
    edge.position.set(cx, 0.012, cz);
    edge.rotation.x = -Math.PI / 2;
    edge.renderOrder = -0.64;
    this.#addTileObjects(edge);

    const label = createDraftMatLabel('Draft');
    label.position.set(minX + 0.78, 0.020, minZ + 0.18);
    this.#addTileObjects(label);
  }

  #renderCanvasPlacementChoices() {
    if (!this.#canvasDraftEnabled()) return;
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return;

    const placementPlayerIndex = this.#placementPlayerIndex();
    const selected = this.#currentPlacementDraftedTile();
    const ghostDominoNumber = this.#hoverAnchor ? selected?.domino?.number : null;
    const previousGroup = this.#currentTileRenderGroup;
    const choiceGroup = new THREE.Group();
    choiceGroup.userData.canvasPlacementChoices = true;
    this.#tilesGroup.add(choiceGroup);
    this.#currentTileRenderGroup = choiceGroup;

    const layout = this.#canvasDraftLayout();
    for (const row of layout.rows) {
      const slot = row.slot;
      const owner = slot.player;
      if (owner == null || slot.placed) continue;

      const claimMeta = this.#draftClaimMetaFor(row, owner, { create: true });
      if (!claimMeta) continue;
      const isSelected = owner === placementPlayerIndex && selected?.domino?.number === slot.domino.number;
      const isMine = owner === placementPlayerIndex && this.#isMyTurnToPlace();
      const remotePreview = this.#remotePlacementPreviews.get(owner);
      const isRemotePreviewed = remotePreview?.dominoNumber === slot.domino.number;
      const isReturning = this.#isPlacementDominoReturning(slot.domino.number);
      const isInGhost = (isSelected && ghostDominoNumber === slot.domino.number) || isRemotePreviewed || isReturning;

      if (isInGhost) {
        this.#addCanvasDraftPlaceholder(claimMeta.targetLeftX, claimMeta.targetZ);
      } else {
        this.#addCanvasDraftDomino(slot.domino, claimMeta.targetLeftX, claimMeta.targetZ, {
          claimed: true,
          sourceLeftX: claimMeta.leftX,
          sourceZ: claimMeta.z,
          targetLeftX: claimMeta.targetLeftX,
          targetZ: claimMeta.targetZ,
          animationKey: claimMeta.key,
          selected: isSelected,
          dim: owner !== placementPlayerIndex && this.#hotseat,
          playerIndex: owner,
        });
      }

      if (isSelected && isMine && !isInGhost) {
        const selectionRing = new THREE.Mesh(
          new THREE.RingGeometry(0.58, 0.66, 32),
          new THREE.MeshBasicMaterial({
            color: this.#playerColorHex(owner),
            transparent: true,
            opacity: 0.50,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        selectionRing.position.set(claimMeta.targetLeftX + 0.5, 0.032, claimMeta.targetZ);
        selectionRing.rotation.x = -Math.PI / 2;
        selectionRing.renderOrder = 0.24;
        this.#addTileObjects(selectionRing);
      }
    }

    this.#currentTileRenderGroup = previousGroup;
  }

  #clearCanvasPlacementChoices() {
    if (!this.#tilesGroup) return;
    for (let i = this.#tilesGroup.children.length - 1; i >= 0; i--) {
      const child = this.#tilesGroup.children[i];
      if (child?.userData?.canvasPlacementChoices) this.#tilesGroup.remove(child);
    }
  }

  #refreshCanvasPlacementChoices() {
    if (!this.#canvasDraftEnabled()) return;
    if (this.#game?.state !== GameState.PLACE || this.#game?.isGameOver) return;
    this.#clearCanvasPlacementChoices();
    this.#renderCanvasPlacementChoices();
  }

  #addCanvasDraftPlaceholder(leftX, z) {
    const holder = new THREE.Mesh(
      new THREE.PlaneGeometry(2.06, 1.00),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.045,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    holder.position.set(leftX + 0.5, 0.014, z);
    holder.rotation.x = -Math.PI / 2;
    holder.renderOrder = -0.1;
    this.#addTileObjects(holder);
  }

  #addCanvasDraftDomino(domino, leftX, z, {
    dim = false,
    advisor = false,
    claimed = false,
    selected = false,
    playerIndex = null,
    sourceLeftX = null,
    sourceZ = null,
    targetLeftX = null,
    targetZ = null,
    animationKey = null,
    animationType = 'draftClaim',
    animationDuration = 720,
    rotationY = 0,
    targetRotationY = null,
  } = {}) {
    const group = new THREE.Group();
    const hasTarget = claimed && Number.isFinite(targetLeftX) && Number.isFinite(targetZ);
    const startedAt = animationKey
      ? (this.#draftClaimAnimationStartedAt.get(animationKey) ?? performance.now())
      : null;
    if (animationKey && !this.#draftClaimAnimationStartedAt.has(animationKey)) {
      this.#draftClaimAnimationStartedAt.set(animationKey, startedAt);
    }
    const targetPosition = hasTarget ? new THREE.Vector3(targetLeftX, 0, targetZ) : null;
    const shouldAnimate = hasTarget
      && !this.#prefersReducedMotion()
      && startedAt != null
      && performance.now() - startedAt < animationDuration + 160;
    const startX = Number.isFinite(sourceLeftX) ? sourceLeftX : leftX;
    const startZ = Number.isFinite(sourceZ) ? sourceZ : z;
    group.position.set(shouldAnimate ? startX : (targetLeftX ?? leftX), 0, shouldAnimate ? startZ : (targetZ ?? z));
    group.rotation.y = shouldAnimate ? rotationY : (targetRotationY ?? rotationY);
    group.userData.draftDominoNumber = domino.number;
    this.#addTileObjects(group);

    const previousGroup = this.#currentTileRenderGroup;
    this.#currentTileRenderGroup = group;

    const ends = [
      { name: 'left', x: 0, tile: domino.leftEnd },
      { name: 'right', x: 1, tile: domino.rightEnd },
    ];

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.16, 1.10),
      new THREE.MeshBasicMaterial({
        color: selected && playerIndex != null ? this.#playerColorHex(playerIndex) : advisor ? 0xffd76a : 0xffffff,
        transparent: true,
        opacity: selected ? 0.20 : advisor ? 0.13 : 0.045,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    glow.position.set(0.5, 0.012, 0);
    glow.rotation.x = -Math.PI / 2;
    glow.renderOrder = -0.15;
    this.#addTileObjects(glow);

    for (const end of ends) {
      const tile = {
        x: end.x,
        y: 0,
        landscape: end.tile.landscape,
        crowns: end.tile.crowns,
        artSeed: end.tile.artSeed,
      };
      let material = this.#getTileMaterial(tile.landscape, tile.crowns || 0, this.#tileArtSeedKey(end.tile, `canvas-draft|${domino.number}|${end.name}`), false);
      if (dim) {
        material = material.clone();
        material.transparent = true;
        material.opacity = 0.64;
        material.color = new THREE.Color(0xa7adb7);
      }
      const tileMesh = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.22, 0.98), material);
      tileMesh.position.set(tile.x, 0.11, tile.y);
      this.#addTileObjects(tileMesh);

      if (!dim) {
        this.#addLandscapeDetail(tile, this.#tileArtSeedKey(end.tile, `canvas-draft|${domino.number}|${end.name}`));
        if ((tile.crowns || 0) > 0) {
          this.#addCrownedLandmark(tile, this.#tileArtSeedKey(end.tile, `canvas-draft|${domino.number}|${end.name}`));
          this.#addCrownStars(tile.x, tile.y, tile.crowns);
        }
      }
    }

    this.#currentTileRenderGroup = previousGroup;
    if (shouldAnimate && targetPosition) {
      this.#registerAnimatedObject(group, animationType, {
        targetPosition,
        targetRotationY,
        startedAt,
        duration: animationDuration,
      });
    }
    return group;
  }

  #addCanvasDraftToken(playerIndex, x, z, { current = false, empty = false, outline = false } = {}) {
    const color = empty ? 0xffffff : this.#playerColorHex(playerIndex);
    const opacity = empty ? (outline ? 0.12 : 0.18) : 0.96;
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.50,
      metalness: 0.08,
      emissive: empty ? 0x000000 : color,
      emissiveIntensity: current ? 0.22 : 0.04,
      transparent: true,
      opacity,
    });
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.35, 10), material);
    body.position.set(0, 0.29, 0);
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 9), material);
    head.position.set(0, 0.55, 0);
    group.add(head);

    const arms = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.09), material);
    arms.position.set(0, 0.36, 0);
    arms.rotation.z = 0.06;
    group.add(arms);

    if (current) {
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.31, 0.39, 28),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.30,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      halo.position.set(0, 0.025, 0);
      halo.rotation.x = -Math.PI / 2;
      group.add(halo);
    }

    this.#addTileObjects(group);
  }

  #renderDominoLibraryScene({ attract = false, focusNumber = this.#libraryFocusedDominoNumber } = {}) {
    if (this.#ghostGroup) {
      while (this.#ghostGroup.children.length) this.#ghostGroup.remove(this.#ghostGroup.children[0]);
    }
    if (this.#regionOverlayGroup) {
      while (this.#regionOverlayGroup.children.length) this.#regionOverlayGroup.remove(this.#regionOverlayGroup.children[0]);
    }

    const layout = this.#dominoLibraryLayout();
    const deck = layout.deck;
    const statusByNumber = attract ? new Map() : this.#dominoLibraryStatusByNumber();
    const group = new THREE.Group();
    group.userData.library = true;
    group.userData.attract = attract;
    this.#tilesGroup.add(group);

    const previousGroup = this.#currentTileRenderGroup;
    this.#currentTileRenderGroup = group;

    deck.forEach((domino, i) => {
      const accentLandscape = (domino.leftEnd.crowns || 0) >= (domino.rightEnd.crowns || 0)
        ? domino.leftEnd.landscape
        : domino.rightEnd.landscape;
      const status = statusByNumber.get(domino.number) ?? {
        kind: attract ? 'showcase' : 'played',
        label: attract ? '' : 'Played',
        color: attract ? (LANDSCAPE_COLORS[accentLandscape] ?? 0x7b8491) : 0x5b6170,
      };
      const filtered = attract ? false : !this.#dominoMatchesLibraryFilter(domino, status);
      const focused = focusNumber === domino.number;
      const { baseX, baseZ } = this.#dominoLibraryPlacement(i, layout);
      const left = {
        x: baseX,
        y: baseZ,
        landscape: domino.leftEnd.landscape,
        crowns: domino.leftEnd.crowns,
      };
      const right = {
        x: baseX + 1,
        y: baseZ,
        landscape: domino.rightEnd.landscape,
        crowns: domino.rightEnd.crowns,
      };

      const statusColor = status.color ?? 0x5b6170;
      const baseOpacity = attract
        ? focused ? 0.38 : 0.20
        : filtered
          ? 0.14
          : status.kind === 'deck'
            ? 0.34
            : status.kind === 'played'
              ? 0.30
              : 0.46;
      const base = new THREE.Mesh(
        new THREE.PlaneGeometry(2.26, 1.20),
        new THREE.MeshBasicMaterial({
          color: filtered ? 0x1c2028 : statusColor,
          transparent: true,
          opacity: baseOpacity,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      base.position.set(baseX + 0.5, 0.006, baseZ);
      base.rotation.x = -Math.PI / 2;
      base.renderOrder = -1;
      this.#addTileObjects(base);

      if (focused) {
        const focusGlow = new THREE.Mesh(
          new THREE.PlaneGeometry(2.46, 1.40),
          new THREE.MeshBasicMaterial({
            color: statusColor,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        focusGlow.position.set(baseX + 0.5, 0.008, baseZ);
        focusGlow.rotation.x = -Math.PI / 2;
        focusGlow.renderOrder = -0.5;
        this.#addTileObjects(focusGlow);
      }

      for (const [endName, tile] of [['left', left], ['right', right]]) {
        const sourceTile = endName === 'left' ? domino.leftEnd : domino.rightEnd;
        const seedKey = this.#tileArtSeedKey(sourceTile, `library|${domino.number}|${endName}`);
        const material = this.#getTileMaterial(tile.landscape, tile.crowns || 0, seedKey, false);
        const tileMesh = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.22, 0.98), material);
        if (filtered) {
          tileMesh.material = material.clone();
          tileMesh.material.color = new THREE.Color(0x535861);
          tileMesh.material.transparent = false;
          tileMesh.material.opacity = 1;
        }
        tileMesh.position.set(tile.x, 0.11, tile.y);
        this.#addTileObjects(tileMesh);
        if (!filtered) {
          this.#addLandscapeDetail(tile, seedKey);
          if ((tile.crowns || 0) > 0) {
            this.#addCrownedLandmark(tile, seedKey);
            this.#addCrownStars(tile.x, tile.y, tile.crowns);
          }
        }
      }

      if (!attract) {
        const number = createTextSprite(String(domino.number), {
          font: '800 36px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
          fillStyle: filtered ? 'rgba(233,238,245,0.46)' : '#e9eef5',
          background: filtered ? 'rgba(20,22,28,0.38)' : 'rgba(20,22,28,0.74)',
          border: filtered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.20)',
          size: 96,
        });
        number.position.set(baseX - 0.52, 0.32, baseZ - 0.58);
        number.scale.set(0.24, 0.24, 0.24);
        this.#addTileObjects(number);

        const statusLabel = status.kind === 'deck'
          ? 'Deck'
          : status.kind === 'available'
            ? 'Pick'
            : status.kind === 'placing'
              ? `${status.label}`
              : status.kind === 'claimed'
                ? `${status.label}`
                : 'Played';
        const badge = createTextSprite(statusLabel, {
          font: '800 28px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
          fillStyle: filtered ? 'rgba(245,251,255,0.50)' : '#f5fbff',
          background: filtered
            ? 'rgba(30,34,42,0.42)'
            : `rgba(${(statusColor >> 16) & 255}, ${(statusColor >> 8) & 255}, ${statusColor & 255}, 0.76)`,
          border: filtered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.28)',
          size: 128,
        });
        badge.position.set(baseX + 1.06, 0.34, baseZ + 0.58);
        badge.scale.set(0.34, 0.20, 0.20);
        this.#addTileObjects(badge);
      }
    });

    this.#currentTileRenderGroup = previousGroup;
    this.#syncBoardLayerPositions();
    this.#renderRegionScoring(null);
  }

  #kingdomMatBounds(boardManager, playerIndex = null) {
    const axis = boardManager?.boardSize;
    const maxSize = Math.max(1, boardManager?.maxBoardSize ?? 7);
    const pad = maxSize <= 5 ? 0.82 : 0.92;
    const minSize = maxSize <= 5 ? 3.35 : 3.65;
    let xMin = (axis?.xMin ?? 0) - 0.5;
    let xMax = (axis?.xMax ?? 0) + 0.5;
    let yMin = (axis?.yMin ?? 0) - 0.5;
    let yMax = (axis?.yMax ?? 0) + 0.5;

    if (
      playerIndex != null
      && this.#game?.state === GameState.PLACE
      && !this.#game?.isGameOver
      && playerIndex === this.#placementPlayerIndex()
    ) {
      const options = this.#currentPlacementOptions();
      if (options.length) {
        for (const cell of this.#placementFootprintCells(options)) {
          xMin = Math.min(xMin, cell.x - 0.52);
          xMax = Math.max(xMax, cell.x + 0.52);
          yMin = Math.min(yMin, cell.y - 0.52);
          yMax = Math.max(yMax, cell.y + 0.52);
        }
      }
    }

    const width = Math.max(minSize, (xMax - xMin) + pad * 2);
    const height = Math.max(minSize, (yMax - yMin) + pad * 2);
    return {
      centerX: (xMin + xMax) / 2,
      centerZ: (yMin + yMax) / 2,
      width,
      height,
    };
  }

  #unionKingdomMatBounds(a, b) {
    if (!a) return b;
    if (!b) return a;

    const xMin = Math.min(a.centerX - a.width / 2, b.centerX - b.width / 2);
    const xMax = Math.max(a.centerX + a.width / 2, b.centerX + b.width / 2);
    const zMin = Math.min(a.centerZ - a.height / 2, b.centerZ - b.height / 2);
    const zMax = Math.max(a.centerZ + a.height / 2, b.centerZ + b.height / 2);

    return {
      centerX: (xMin + xMax) / 2,
      centerZ: (zMin + zMax) / 2,
      width: xMax - xMin,
      height: zMax - zMin,
    };
  }

  #preservedKingdomMatBounds(boardManager, playerIndex, { commit = false } = {}) {
    const current = this.#kingdomMatBounds(boardManager, playerIndex);
    if (playerIndex == null) return current;

    const target = this.#unionKingdomMatBounds(this.#kingdomMatBoundsByPlayer.get(playerIndex), current);
    if (commit) {
      const previous = this.#kingdomMatBoundsByPlayer.get(playerIndex);
      this.#kingdomMatBoundsByPlayer.set(playerIndex, target);
      if (
        !previous
        || Math.hypot(previous.centerX - target.centerX, previous.centerZ - target.centerZ) > 0.001
        || Math.abs(previous.width - target.width) > 0.001
        || Math.abs(previous.height - target.height) > 0.001
      ) {
        this.#invalidateTabletopLayoutCache();
      }
    }
    return target;
  }

  #addPlayerScorePlaque(playerIndex, boardManager) {
    const mat = this.#preservedKingdomMatBounds(boardManager, playerIndex);
    if (!mat) return;

    const name = this.#playerNames[playerIndex]
      ?? this.#game?.players?.[playerIndex]?.name
      ?? `Player ${playerIndex + 1}`;
    const score = boardManager?.score ?? 0;
    const label = createPlayerMatLabel(name, score, {
      playerColor: this.#playerMiniMapColor(playerIndex, 0.94),
      playerGlow: this.#playerMiniMapColor(playerIndex, 0.20),
    });
    const width = Math.max(1.22, Math.min(2.06, mat.width - 0.92));
    const origin = this.#boardOriginForPlayer(playerIndex);
    const towardTableCenterZ = origin.z < -0.05 ? 1 : origin.z > 0.05 ? -1 : playerIndex % 2 === 0 ? 1 : -1;
    label.scale.set(width, width, 1);
    label.position.set(mat.centerX, 0.012, mat.centerZ + towardTableCenterZ * (mat.height / 2 - 0.30));
    this.#addTileObjects(label);
  }

  #addPlayerPlayArea(playerIndex, boardManager) {
    const current = this.#kingdomMatBounds(boardManager, playerIndex);
    const previous = this.#kingdomMatBoundsByPlayer.get(playerIndex) ?? current;
    const target = this.#preservedKingdomMatBounds(boardManager, playerIndex, { commit: true });
    const shouldAnimate = !this.#prefersReducedMotion()
      && (
        Math.hypot(previous.centerX - target.centerX, previous.centerZ - target.centerZ) > 0.035
        || Math.abs(previous.width - target.width) > 0.035
        || Math.abs(previous.height - target.height) > 0.035
      );
    const color = this.#playerColorHex(playerIndex);
    const group = new THREE.Group();
    group.position.set(
      shouldAnimate ? previous.centerX : target.centerX,
      0,
      shouldAnimate ? previous.centerZ : target.centerZ
    );
    group.scale.set(
      shouldAnimate ? previous.width : target.width,
      1,
      shouldAnimate ? previous.height : target.height
    );
    this.#addTileObjects(group);

    const previousGroup = this.#currentTileRenderGroup;
    this.#currentTileRenderGroup = group;

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 1.05),
      new THREE.MeshBasicMaterial({
        color: 0x05070a,
        transparent: true,
        opacity: 0.20,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    shadow.position.set(0.02, -0.091, 0.03);
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = -0.78;
    this.#addTileObjects(shadow);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.055, 1),
      new THREE.MeshStandardMaterial({
        color: 0x18252d,
        roughness: 0.80,
        metalness: 0.04,
        emissive: color,
        emissiveIntensity: 0.025,
      })
    );
    floor.position.set(0, -0.074, 0);
    floor.renderOrder = -0.76;
    this.#addTileObjects(floor);

    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.985, 0.985),
      new THREE.MeshBasicMaterial({
        color: 0x22323b,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    felt.position.set(0, -0.043, 0);
    felt.rotation.x = -Math.PI / 2;
    felt.renderOrder = -0.74;
    this.#addTileObjects(felt);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.01, 1.01),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.080,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    glow.position.set(0, -0.040, 0);
    glow.rotation.x = -Math.PI / 2;
    glow.renderOrder = -0.73;
    this.#addTileObjects(glow);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 0.058, 1.01)),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.36,
      })
    );
    edge.position.set(0, -0.072, 0);
    edge.renderOrder = -0.72;
    this.#addTileObjects(edge);

    this.#currentTileRenderGroup = previousGroup;

    if (shouldAnimate) {
      this.#registerAnimatedObject(group, 'kingdomMat', {
        targetPosition: new THREE.Vector3(target.centerX, 0, target.centerZ),
        targetScale: new THREE.Vector3(target.width, 1, target.height),
        startedAt: performance.now(),
        duration: 560,
      });
    }
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

  #variationRand(tile, tag = 'v', seedKey = '') {
    return mulberry32(hash32(`${tag}|${this.#tileArtSeedKey(tile, seedKey)}|${landscapeKey(tile.landscape)}|${tile.crowns || 0}`));
  }

  #detailSpot(rand, limit = 0.32) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const dx = -limit + rand() * limit * 2;
      const dz = -limit + rand() * limit * 2;
      if (dx < 0.12 || dz > -0.12) return { dx, dz };
    }
    return {
      dx: -limit + rand() * limit * 1.35,
      dz: -limit + rand() * limit * 1.35,
    };
  }

  #spacedDetailSpots(rand, count, limit = 0.32, minDistance = 0.17, avoid = []) {
    const spots = [];
    for (let attempt = 0; attempt < count * 26 && spots.length < count; attempt++) {
      const spot = this.#detailSpot(rand, limit);
      const clear = spots.every((other) => Math.hypot(spot.dx - other.dx, spot.dz - other.dz) >= minDistance)
        && avoid.every((other) => Math.hypot(spot.dx - other.dx, spot.dz - other.dz) >= (other.r ?? minDistance));
      if (clear) spots.push(spot);
    }
    while (spots.length < count) spots.push(this.#detailSpot(rand, limit));
    return spots;
  }

  #clearDetailSpots(rand, count, limit = 0.32, minDistance = 0.17, avoid = []) {
    const spots = [];
    for (let attempt = 0; attempt < count * 36 && spots.length < count; attempt++) {
      const spot = this.#detailSpot(rand, limit);
      const clear = spots.every((other) => Math.hypot(spot.dx - other.dx, spot.dz - other.dz) >= minDistance)
        && avoid.every((other) => Math.hypot(spot.dx - other.dx, spot.dz - other.dz) >= (other.r ?? minDistance));
      if (clear) spots.push(spot);
    }
    return spots;
  }

  #tileArtSeedKey(tile, fallback = '') {
    return tile?.artSeed || fallback || `${tile?.x ?? 0},${tile?.y ?? 0}`;
  }

  #addCrownStars(x, y, crowns, options = {}) {
    const count = Math.max(0, Math.min(3, crowns || 0));
    if (!count) return;

    const ghost = Boolean(options.ghost);
    const target = options.target || null;
    const add = (...objects) => {
      if (target) target.add(...objects);
      else this.#addTileObjects(...objects);
    };

    const plaqueMat = new THREE.MeshStandardMaterial({
      color: 0x181320,
      roughness: 0.48,
      metalness: 0.20,
      emissive: 0x4d2c06,
      emissiveIntensity: ghost ? 0.08 : 0.22,
      transparent: true,
      opacity: ghost ? 0.70 : 0.98,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffcf61,
      transparent: true,
      opacity: ghost ? 0.12 : 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const starOutlineMat = new THREE.MeshBasicMaterial({
      color: 0x130e17,
      transparent: true,
      opacity: ghost ? 0.72 : 0.96,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xfff0a6,
      roughness: 0.26,
      metalness: 0.66,
      emissive: 0xffb22c,
      emissiveIntensity: ghost ? 0.20 : 0.50,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: ghost ? 0.82 : 1,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    const plaqueWidth = count === 1 ? 0.30 : count === 2 ? 0.43 : 0.55;
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(plaqueWidth, 0.034, 0.23), plaqueMat);
    plaque.position.set(x + 0.27, ghost ? 0.205 : 0.245, y - 0.30);
    plaque.rotation.y = -0.08;
    add(plaque);

    const starGeometry = createStarShapeGeometry(0.047, 0.021);
    const outlineGeometry = createStarShapeGeometry(0.060, 0.027);
    const offsets = count === 1 ? [0] : count === 2 ? [-0.078, 0.078] : [-0.124, 0, 0.124];
    offsets.forEach((offset, index) => {
      const layerLift = index * 0.001;
      const halo = new THREE.Mesh(new THREE.CircleGeometry(0.064, 18), haloMat);
      halo.position.set(x + 0.27 + offset, (ghost ? 0.221 : 0.263) + layerLift, y - 0.30);
      halo.rotation.x = -Math.PI / 2;
      halo.rotation.z = -0.10;
      add(halo);

      const outline = new THREE.Mesh(outlineGeometry, starOutlineMat);
      outline.position.set(x + 0.27 + offset, (ghost ? 0.223 : 0.267) + layerLift, y - 0.30);
      outline.rotation.x = -Math.PI / 2;
      outline.rotation.z = -0.10;
      add(outline);

      const star = new THREE.Mesh(starGeometry, starMat);
      star.position.set(x + 0.27 + offset, (ghost ? 0.226 : 0.272) + layerLift, y - 0.30);
      star.rotation.x = -Math.PI / 2;
      star.rotation.z = -0.10;
      add(star);
    });
  }

  #addWaterFish(x, y, dx, dz, angle, scale, bodyMat, tailMat, motion = {}) {
    const fish = new THREE.Group();
    fish.position.set(x + dx, 0.270, y + dz);
    fish.rotation.y = angle;

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.052 * scale, 10, 7), bodyMat);
    body.scale.set(1.45, 0.42, 0.62);
    body.position.set(0, 0.010, 0);
    fish.add(body);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.026 * scale, 0.052 * scale, 3), tailMat);
    tail.rotation.z = Math.PI / 2;
    tail.rotation.y = Math.PI * 0.50;
    tail.position.set(-0.070 * scale, 0.010, 0);
    fish.add(tail);

    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.015 * scale, 0.032 * scale, 3), tailMat);
    fin.rotation.x = Math.PI / 2;
    fin.position.set(0.006 * scale, 0.042 * scale, 0);
    fish.add(fin);

    this.#addTileObjects(fish);
    this.#registerAnimatedObject(fish, 'fish', {
      phase: hash32(`fish|${x}|${y}|${dx.toFixed(3)}|${dz.toFixed(3)}|${angle.toFixed(3)}`) / 997,
      speed: 0.72 + scale * 0.28,
      amplitude: scale,
      travel: motion.travel,
      wander: motion.wander,
      tail,
      fin,
    });
  }

  #addWaterTurtle(x, y, dx, dz, angle, shellMat, bodyMat) {
    const turtle = new THREE.Group();
    turtle.position.set(x + dx, 0.268, y + dz);
    turtle.rotation.y = angle;

    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.064, 12, 8), shellMat);
    shell.scale.set(1.18, 0.34, 0.92);
    shell.position.set(0, 0.020, 0);
    turtle.add(shell);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), bodyMat);
    head.position.set(0.076, 0.016, 0);
    turtle.add(head);

    const flippers = [];
    for (const [fx, fz, rz] of [
      [-0.022, -0.044, -0.42],
      [0.034, -0.044, 0.36],
      [-0.022, 0.044, 0.42],
      [0.034, 0.044, -0.36],
    ]) {
      const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.006, 0.014), bodyMat);
      flipper.position.set(fx, 0.006, fz);
      flipper.rotation.y = rz;
      turtle.add(flipper);
      flippers.push(flipper);
    }

    this.#addTileObjects(turtle);
    this.#registerAnimatedObject(turtle, 'turtle', {
      phase: hash32(`turtle|${x}|${y}|${dx.toFixed(3)}|${dz.toFixed(3)}|${angle.toFixed(3)}`) / 997,
      speed: 0.58,
      amplitude: 1,
      travel: 0.012,
      wander: 0.006,
      flippers,
    });
  }

  #addPastureSheep(x, y, dx, dz, angle, scale, sheepMat, woolMat, headMat) {
    const sheep = new THREE.Group();
    sheep.position.set(x + dx, 0, y + dz);
    sheep.rotation.y = angle;

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.066 * scale, 12, 8), sheepMat);
    body.scale.set(1.36, 0.72, 0.88);
    body.position.set(0, 0.300, 0);
    sheep.add(body);

    const puffGeometry = new THREE.SphereGeometry(0.025 * scale, 8, 6);
    for (const [px, py, pz, ps] of [
      [-0.040, 0.322, -0.022, 1.02],
      [0.000, 0.332, 0.016, 1.12],
      [0.044, 0.318, -0.014, 0.92],
    ]) {
      const puff = new THREE.Mesh(puffGeometry, woolMat);
      puff.scale.set(ps, 0.74, ps * 0.84);
      puff.position.set(px * scale, py, pz * scale);
      sheep.add(puff);
    }

    const headGroup = new THREE.Group();
    headGroup.position.set(0.088 * scale, 0.300, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.030 * scale, 9, 7), headMat);
    head.scale.set(0.94, 0.82, 1.08);
    headGroup.add(head);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.010 * scale, 0.024 * scale, 5), headMat);
      ear.position.set(0.003 * scale, 0.024, side * 0.020 * scale);
      ear.rotation.x = side * 0.55;
      ear.rotation.z = Math.PI / 2;
      headGroup.add(ear);
    }
    sheep.add(headGroup);

    const legs = [];
    for (const [lx, lz] of [
      [-0.042, -0.030],
      [-0.042, 0.030],
      [0.042, -0.030],
      [0.042, 0.030],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.010 * scale, 0.043 * scale, 0.010 * scale), headMat);
      leg.position.set(lx * scale, 0.246, lz * scale);
      sheep.add(leg);
      legs.push(leg);
    }

    this.#addTileObjects(sheep);
    this.#registerAnimatedObject(sheep, 'sheep', {
      phase: hash32(`sheep|${x}|${y}|${dx.toFixed(3)}|${dz.toFixed(3)}|${angle.toFixed(3)}`) / 997,
      speed: 0.22 + scale * 0.05,
      amplitude: scale,
      travel: 0.006,
      wander: 0,
      head: headGroup,
      legs,
    });
  }

  #addMineCart(x, y, dx, dz, angle, railMat, cartMat, darkRockMat, oreMat, rand) {
    const cartGroup = new THREE.Group();
    cartGroup.position.set(x + dx, 0.245, y + dz);
    cartGroup.rotation.y = angle;

    const railGeom = new THREE.BoxGeometry(0.38, 0.014, 0.012);
    const railA = new THREE.Mesh(railGeom, railMat);
    const railB = new THREE.Mesh(railGeom, railMat);
    railA.position.set(0, 0, -0.046);
    railB.position.set(0, 0, 0.046);
    cartGroup.add(railA, railB);

    for (const railX of [-0.13, 0, 0.13]) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.010, 0.14), railMat);
      tie.position.set(railX, -0.007, 0);
      cartGroup.add(tie);
    }

    const cart = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.074, 0.11), cartMat);
    cart.position.set(0.050, 0.052, 0);
    cartGroup.add(cart);

    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.016, 0.124), cartMat);
    lip.position.set(0.050, 0.096, 0);
    cartGroup.add(lip);

    for (const ox of [-0.018, 0.038, 0.092]) {
      const ore = new THREE.Mesh(new THREE.DodecahedronGeometry(0.022, 0), oreMat);
      ore.position.set(ox, 0.122 + Math.abs(0.038 - ox) * 0.20, -0.018 + rand() * 0.036);
      ore.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      cartGroup.add(ore);
    }

    for (const sx of [-0.026, 0.118]) {
      for (const sz of [-0.063, 0.063]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.014, 10), darkRockMat);
        wheel.position.set(sx, 0.014, sz);
        wheel.rotation.x = Math.PI / 2;
        cartGroup.add(wheel);
      }
    }

    this.#addTileObjects(cartGroup);
  }

  #addCrownedLandmark(tile, seedKey = '') {
    const crowns = Math.max(0, Math.min(3, tile.crowns || 0));
    if (!crowns) return;

    const x = tile.x;
    const y = tile.y;
    const rand = this.#variationRand(tile, 'landmark', seedKey);
    const group = new THREE.Group();
    group.position.set(x - 0.14, 0, y + 0.13);
    group.rotation.y = -0.22 + rand() * 0.44;

    const addBox = (w, h, d, mat, px, py, pz, ry = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(px, py, pz);
      mesh.rotation.y = ry;
      group.add(mesh);
      return mesh;
    };
    const addCyl = (rTop, rBottom, h, sides, mat, px, py, pz) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, sides), mat);
      mesh.position.set(px, py, pz);
      group.add(mesh);
      return mesh;
    };

    switch (tile.landscape) {
      case Landscapes.FOREST: {
        const logMat = new THREE.MeshStandardMaterial({ color: 0x7a4d2d, roughness: 0.76, metalness: 0.03 });
        const cabinMat = new THREE.MeshStandardMaterial({ color: 0x9a6840, roughness: 0.70, metalness: 0.04 });
        const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4f2f1f, roughness: 0.82, metalness: 0.02 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x2f5a36, roughness: 0.72, metalness: 0.03 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x236f3d, roughness: 0.70, metalness: 0.02 });
        const lightMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, roughness: 0.34, metalness: 0.42, emissive: 0x7d4a08, emissiveIntensity: 0.30 });

        addBox(0.24, 0.15, 0.20, cabinMat, 0.00, 0.22 + 0.075, -0.02);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.12, 4), roofMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(0.00, 0.44, -0.02);
        group.add(roof);
        addBox(0.048, 0.070, 0.012, darkWoodMat, 0.060, 0.265, -0.126);
        addBox(0.055, 0.045, 0.014, lightMat, -0.060, 0.304, -0.126);

        for (let tier = 0; tier < 3; tier++) {
          for (const lx of [-0.12, -0.04, 0.04, 0.12]) {
            const log = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.18, 8), logMat);
            log.position.set(lx, 0.253 + tier * 0.030, 0.185 + (tier % 2) * 0.020);
            log.rotation.z = Math.PI / 2;
            log.rotation.y = -0.08 + rand() * 0.16;
            group.add(log);
          }
        }

        for (const [dx, dz, s] of [[-0.19, -0.13, 0.75], [0.20, 0.08, 0.64]]) {
          addCyl(0.016 * s, 0.022 * s, 0.18 * s, 7, darkWoodMat, dx, 0.22 + 0.09 * s, dz);
          const tree = new THREE.Mesh(new THREE.ConeGeometry(0.070 * s, 0.16 * s, 8), leafMat);
          tree.position.set(dx, 0.22 + 0.19 * s, dz);
          tree.rotation.y = rand() * Math.PI * 2;
          group.add(tree);
        }

        if (crowns >= 2) {
          addCyl(0.012, 0.014, 0.24, 6, darkWoodMat, 0.20, 0.36, -0.12);
          const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.06), lightMat);
          flag.position.set(0.245, 0.49, -0.12);
          flag.rotation.y = -Math.PI / 5;
          group.add(flag);
        }
        break;
      }
      case Landscapes.WHEAT: {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a6635, roughness: 0.70, metalness: 0.04 });
        const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x5f3820, roughness: 0.78, metalness: 0.03 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x7d3f22, roughness: 0.64, metalness: 0.08 });
        const grainMat = new THREE.MeshStandardMaterial({ color: 0xf1c452, roughness: 0.70, metalness: 0.04, emissive: 0x3b2104, emissiveIntensity: 0.06 });
        const baleMat = new THREE.MeshStandardMaterial({ color: 0xdb9e34, roughness: 0.78, metalness: 0.03, emissive: 0x2f1803, emissiveIntensity: 0.06 });
        const paleMat = new THREE.MeshStandardMaterial({ color: 0xffe7a1, roughness: 0.58, metalness: 0.04 });
        const clothMat = new THREE.MeshStandardMaterial({ color: 0xf6ecd0, roughness: 0.72, metalness: 0.02 });

        const addBale = (px, pz, angle = 0, scale = 1) => {
          const bale = new THREE.Group();
          bale.position.set(px, 0.285, pz);
          bale.rotation.y = angle;
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 0.060 * scale, 0.095 * scale), baleMat);
          bale.add(body);
          for (const bx of [-0.038, 0.038]) {
            const band = new THREE.Mesh(new THREE.BoxGeometry(0.010 * scale, 0.066 * scale, 0.104 * scale), darkWoodMat);
            band.position.set(bx * scale, 0.001, 0);
            bale.add(band);
          }
          group.add(bale);
        };

        const addSack = (px, pz, angle = 0, scale = 1) => {
          const sack = new THREE.Mesh(new THREE.SphereGeometry(0.044 * scale, 9, 7), clothMat);
          sack.scale.set(1.28, 0.58, 0.88);
          sack.position.set(px, 0.275, pz);
          sack.rotation.y = angle;
          group.add(sack);
        };

        if (crowns >= 2) {
          addBox(0.26, 0.13, 0.20, woodMat, -0.01, 0.22 + 0.065, 0.03);
          addBox(0.30, 0.020, 0.22, darkWoodMat, -0.01, 0.355, 0.03);
          const tower = addCyl(0.060, 0.085, 0.34, 10, woodMat, 0, 0.22 + 0.17, 0);
          tower.rotation.y = rand() * Math.PI;
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.095, 4), roofMat);
          roof.rotation.y = Math.PI / 4;
          roof.position.set(0, 0.62, 0);
          group.add(roof);
          const hub = new THREE.Mesh(new THREE.SphereGeometry(0.030, 9, 7), paleMat);
          hub.position.set(0.065, 0.51, -0.072);
          group.add(hub);
          for (const [sx, sy, rz] of [
            [0.15, 0.016, 0],
            [0.016, 0.15, Math.PI / 2],
          ]) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.010, sy), paleMat);
            blade.position.copy(hub.position);
            blade.rotation.y = -Math.PI / 4;
            blade.rotation.z = rz;
            group.add(blade);
          }
          addBox(0.17, 0.035, 0.055, paleMat, 0.105, 0.495, -0.114, -0.42);
          addBox(0.18, 0.042, 0.060, paleMat, 0.028, 0.585, -0.128, -0.42);
          addBox(0.17, 0.074, 0.12, grainMat, -0.18, 0.26, 0.11, 0.18);
          addBale(0.19, 0.15, -0.30, 0.88);
          addSack(-0.18, -0.13, 0.35, 0.82);
          addSack(-0.10, -0.16, -0.18, 0.68);
        } else {
          addBox(0.25, 0.16, 0.20, woodMat, -0.02, 0.22 + 0.080, -0.02);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.12, 4), roofMat);
          roof.rotation.y = Math.PI / 4;
          roof.position.set(-0.02, 0.425, -0.02);
          group.add(roof);
          addBox(0.060, 0.070, 0.014, darkWoodMat, 0.050, 0.275, -0.127);
          addBox(0.045, 0.040, 0.014, paleMat, -0.088, 0.315, -0.127);
          for (const dx of [-0.10, -0.02, 0.07]) {
            addBox(0.065, 0.045, 0.090, grainMat, dx, 0.25, 0.155, -0.14 + rand() * 0.28);
          }
          addBale(0.16, -0.02, -0.18, 0.82);
          addSack(-0.18, 0.04, 0.28, 0.75);
        }
        break;
      }
      case Landscapes.WATER: {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe5ecef, roughness: 0.48, metalness: 0.08 });
        const redMat = new THREE.MeshStandardMaterial({ color: 0xb83b35, roughness: 0.48, metalness: 0.10 });
        const lightMat = new THREE.MeshStandardMaterial({ color: 0xffec9d, roughness: 0.28, metalness: 0.28, emissive: 0xffc846, emissiveIntensity: 0.55 });
        const sandMat = new THREE.MeshStandardMaterial({ color: 0xd9c986, roughness: 0.78, metalness: 0.02 });
        const shoreMat = new THREE.MeshStandardMaterial({ color: 0xf3e5a3, roughness: 0.72, metalness: 0.02 });
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d8b90, roughness: 0.74, metalness: 0.04 });
        const dockMat = new THREE.MeshStandardMaterial({ color: 0x7a5637, roughness: 0.78, metalness: 0.03 });
        const boatMat = new THREE.MeshStandardMaterial({ color: 0x6b3f2b, roughness: 0.72, metalness: 0.04 });
        const hullTrimMat = new THREE.MeshStandardMaterial({ color: 0xdca956, roughness: 0.56, metalness: 0.08 });
        const ropeMat = new THREE.MeshStandardMaterial({ color: 0xe4d29c, roughness: 0.74, metalness: 0.02 });
        const netMat = new THREE.MeshBasicMaterial({ color: 0xdaf7ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide });
        const variant = Math.floor(rand() * 3);

        const addIsland = (cx, cz, sx = 1, sz = 1) => {
          const shore = addCyl(0.18, 0.23, 0.028, 10, shoreMat, cx, 0.234, cz);
          shore.scale.set(sx * 1.12, 1, sz * 0.86);
          const sand = addCyl(0.13, 0.17, 0.032, 9, sandMat, cx - 0.01, 0.254, cz + 0.002);
          sand.scale.set(sx * 0.98, 1, sz * 0.74);
          for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.026 + rand() * 0.018, 0), rockMat);
            rock.position.set(cx - 0.11 + rand() * 0.22, 0.282, cz - 0.08 + rand() * 0.16);
            rock.scale.set(1.0 + rand() * 0.5, 0.42, 0.78 + rand() * 0.4);
            rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
            group.add(rock);
          }
        };

        const addPier = (cx, cz, angle = 0) => {
          const pier = new THREE.Group();
          pier.position.set(cx, 0, cz);
          pier.rotation.y = angle;
          for (let i = 0; i < 4; i++) {
            const plank = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.018, 0.17), dockMat);
            plank.position.set(-0.085 + i * 0.057, 0.251, 0);
            plank.rotation.y = -0.04 + rand() * 0.08;
            pier.add(plank);
          }
          for (const px of [-0.12, 0.13]) {
            for (const pz of [-0.070, 0.070]) {
              const post = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.013, 0.105, 6), dockMat);
              post.position.set(px, 0.286, pz);
              pier.add(post);
            }
          }
          group.add(pier);
        };

        const addFishingBoat = (cx, cz, angle = 0, scale = 1) => {
          const boat = new THREE.Group();
          boat.position.set(cx, 0.268, cz);
          boat.rotation.y = angle;
          const hull = new THREE.Mesh(new THREE.SphereGeometry(0.070 * scale, 12, 7), boatMat);
          hull.scale.set(1.72, 0.35, 0.62);
          hull.position.set(0, 0.014, 0);
          boat.add(hull);
          const deck = new THREE.Mesh(new THREE.BoxGeometry(0.12 * scale, 0.018, 0.050 * scale), hullTrimMat);
          deck.position.set(0.010 * scale, 0.046, 0);
          boat.add(deck);
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.115 * scale, 6), ropeMat);
          mast.position.set(-0.026 * scale, 0.103, 0);
          boat.add(mast);
          const rod = new THREE.Mesh(new THREE.BoxGeometry(0.130 * scale, 0.006, 0.006), ropeMat);
          rod.position.set(0.052 * scale, 0.090, -0.016 * scale);
          rod.rotation.z = -0.34;
          boat.add(rod);
          const net = new THREE.Mesh(new THREE.CircleGeometry(0.046 * scale, 12), netMat);
          net.rotation.x = -Math.PI / 2;
          net.position.set(-0.104 * scale, 0.015, 0.050 * scale);
          boat.add(net);
          group.add(boat);
          this.#registerAnimatedObject(boat, 'boat', {
            phase: rand() * Math.PI * 2,
            speed: 0.82 + rand() * 0.28,
            amplitude: 0.75 + scale * 0.22,
          });
        };

        const addMarkerBuoy = (cx, cz, colorMat = redMat) => {
          const buoy = new THREE.Group();
          buoy.position.set(cx, 0, cz);
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.070, 8), colorMat);
          body.position.set(0, 0.290, 0);
          buoy.add(body);
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.080, 6), ropeMat);
          stem.position.set(0, 0.352, 0);
          buoy.add(stem);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), lightMat);
          cap.position.set(0, 0.405, 0);
          buoy.add(cap);
          group.add(buoy);
          this.#registerAnimatedObject(buoy, 'buoy', {
            phase: rand() * Math.PI * 2,
            speed: 0.74 + rand() * 0.18,
            amplitude: 0.70 + rand() * 0.24,
          });
        };

        if (variant === 0) {
          addIsland(0.02, -0.04, 1.05, 0.95);
          addPier(-0.11, 0.18, 0.10);
          addCyl(0.052, 0.074, 0.30, 12, stoneMat, 0.02, 0.22 + 0.15, -0.04);
          addCyl(0.054, 0.056, 0.035, 12, redMat, 0.02, 0.37, -0.04);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.076, 0.080, 12), redMat);
          roof.position.set(0.02, 0.60, -0.04);
          group.add(roof);
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.033, 10, 8), lightMat);
          beacon.position.set(0.02, 0.53, -0.04);
          group.add(beacon);
          const beamMat = new THREE.MeshBasicMaterial({
            color: 0xfff0a6,
            transparent: true,
            opacity: 0.09,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          });
          const beamPivot = new THREE.Group();
          beamPivot.position.set(0.02, 0.535, -0.04);
          beamPivot.rotation.y = -0.46 + rand() * 0.92;
          const beam = new THREE.Mesh(createWaterShardGeometry(0.70, 0.13, rand), beamMat);
          beam.position.set(0.36, 0, 0);
          beam.rotation.x = -Math.PI / 2;
          beamPivot.add(beam);
          group.add(beamPivot);
          this.#registerAnimatedObject(beamPivot, 'lighthouseBeam', {
            phase: rand() * Math.PI * 2,
            speed: 0.36 + rand() * 0.12,
            amplitude: 0.72,
            material: beamMat,
          });
        } else if (variant === 1) {
          addIsland(-0.17, 0.11, 0.78, 0.56);
          addPier(-0.05, 0.11, -0.08);
          addFishingBoat(0.12, -0.09, -0.48 + rand() * 0.42, 1.08);
          addMarkerBuoy(-0.23, -0.12, redMat);
        } else {
          addFishingBoat(-0.05, 0.02, 0.30 + rand() * 0.55, 1.00);
          addMarkerBuoy(0.18, -0.15, redMat);
          addMarkerBuoy(-0.19, 0.17, hullTrimMat);
          const net = new THREE.Mesh(new THREE.CircleGeometry(0.080, 14), netMat);
          net.rotation.x = -Math.PI / 2;
          net.position.set(0.12, 0.246, 0.11);
          group.add(net);
        }
        break;
      }
      case Landscapes.PASTURE: {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b623a, roughness: 0.76, metalness: 0.03 });
        const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.82, metalness: 0.02 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x5f7940, roughness: 0.68, metalness: 0.04 });
        const woolMat = new THREE.MeshStandardMaterial({ color: 0xfff8df, roughness: 0.82, metalness: 0.01 });
        const sheepHeadMat = new THREE.MeshStandardMaterial({ color: 0x3f352e, roughness: 0.78, metalness: 0.02 });
        const trimMat = new THREE.MeshStandardMaterial({ color: 0xf4e7b0, roughness: 0.70, metalness: 0.02 });
        const hayMat = new THREE.MeshStandardMaterial({ color: 0xe2b34d, roughness: 0.76, metalness: 0.03, emissive: 0x2f1a04, emissiveIntensity: 0.05 });
        const flowerMat = new THREE.MeshStandardMaterial({ color: 0xfff0a6, roughness: 0.58, metalness: 0.02 });
        const addTinySheep = (dx, dz, s = 1, angle = 0) => {
          const sheep = new THREE.Group();
          sheep.position.set(dx, 0, dz);
          sheep.rotation.y = angle;
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.044 * s, 10, 7), woolMat);
          body.scale.set(1.48, 0.72, 0.92);
          body.position.set(0, 0.285, 0);
          sheep.add(body);
          const headGroup = new THREE.Group();
          headGroup.position.set(0.056 * s, 0.286, 0.000);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 8, 6), sheepHeadMat);
          headGroup.add(head);
          sheep.add(headGroup);
          group.add(sheep);
          this.#registerAnimatedObject(sheep, 'sheep', {
            phase: rand() * Math.PI * 2,
            speed: 0.18 + rand() * 0.08,
            amplitude: 0.44 * s,
            travel: 0.004,
            wander: 0,
            head: headGroup,
          });
        };

        for (const z of [-0.18, 0.18]) {
          addBox(0.46, 0.022, 0.016, woodMat, 0.00, 0.292, z);
          addBox(0.46, 0.018, 0.014, woodMat, 0.00, 0.350, z);
          for (const px of [-0.22, -0.05, 0.13, 0.22]) addCyl(0.009, 0.012, 0.13, 6, darkWoodMat, px, 0.285, z);
        }
        for (const xRail of [-0.23, 0.23]) {
          addBox(0.018, 0.018, 0.30, woodMat, xRail, 0.325, 0.00);
        }
        const gate = new THREE.Group();
        gate.position.set(-0.23, 0.304, 0.00);
        for (const z of [-0.055, 0.055]) {
          const slat = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.017, 0.014), woodMat);
          slat.position.set(0.085, z === -0.055 ? 0.012 : 0.068, z);
          gate.add(slat);
        }
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.092, 0.145), darkWoodMat);
        brace.position.set(0.035, 0.040, 0);
        brace.rotation.y = -0.08;
        gate.add(brace);
        group.add(gate);
        this.#registerAnimatedObject(gate, 'gate', {
          phase: rand() * Math.PI * 2,
          speed: 0.24 + rand() * 0.08,
          amplitude: 0.58,
        });

        if (crowns >= 2) {
          addBox(0.25, 0.15, 0.20, trimMat, -0.04, 0.22 + 0.075, -0.01);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.11, 4), roofMat);
          roof.rotation.y = Math.PI / 4;
          roof.position.set(-0.04, 0.43, -0.01);
          group.add(roof);
          addBox(0.070, 0.060, 0.014, darkWoodMat, 0.02, 0.272, -0.116);
          addBox(0.20, 0.045, 0.070, hayMat, 0.14, 0.268, 0.14, -0.20);
          addTinySheep(0.17, -0.06, 0.90, rand() * Math.PI * 2);
          addTinySheep(-0.19, 0.11, 0.72, rand() * Math.PI * 2);
          addTinySheep(0.04, 0.12, 0.66, rand() * Math.PI * 2);
        } else {
          addBox(0.21, 0.052, 0.075, hayMat, -0.05, 0.265, 0.13, 0.12);
          addCyl(0.008, 0.010, 0.24, 6, darkWoodMat, 0.16, 0.35, -0.07);
          const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), flowerMat);
          lantern.position.set(0.16, 0.48, -0.07);
          group.add(lantern);
          addTinySheep(0.09, -0.02, 0.92, rand() * Math.PI * 2);
          addTinySheep(-0.16, -0.08, 0.68, rand() * Math.PI * 2);
        }
        break;
      }
      case Landscapes.BOG: {
        const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b5332, roughness: 0.84, metalness: 0.03 });
        const darkPlankMat = new THREE.MeshStandardMaterial({ color: 0x463622, roughness: 0.86, metalness: 0.03 });
        const hutMat = new THREE.MeshStandardMaterial({ color: 0x4e365d, roughness: 0.78, metalness: 0.05, emissive: 0x17091f, emissiveIntensity: 0.10 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b7c48, roughness: 0.80, metalness: 0.03 });
        const glowMat = new THREE.MeshStandardMaterial({ color: 0xece184, roughness: 0.28, metalness: 0.18, emissive: 0xe6d65a, emissiveIntensity: 0.48 });
        const mossMat = new THREE.MeshStandardMaterial({ color: 0xa3a064, roughness: 0.80, metalness: 0.02 });
        const reedMat = new THREE.MeshStandardMaterial({ color: 0x787a3e, roughness: 0.76, metalness: 0.02 });
        const platform = addBox(0.42, 0.024, 0.28, darkPlankMat, 0.00, 0.255, 0.04, 0.04);
        platform.scale.set(1, 1, 0.86);
        for (let i = 0; i < 5; i++) {
          addBox(0.24, 0.018, 0.045, plankMat, -0.24 + i * 0.12, 0.275, 0.18 + (i % 2) * 0.018, 0.22 + rand() * 0.08);
        }
        if (crowns >= 2) {
          for (const [px, pz] of [[-0.11, -0.11], [0.12, -0.09], [-0.10, 0.10], [0.12, 0.12]]) {
            addCyl(0.010, 0.014, 0.19, 6, plankMat, px, 0.315, pz);
          }
          addBox(0.26, 0.15, 0.22, hutMat, 0.01, 0.40, -0.01);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.10, 4), roofMat);
          roof.rotation.y = Math.PI / 4 + 0.14;
          roof.scale.set(1.05, 0.86, 0.86);
          roof.position.set(0.01, 0.535, -0.01);
          group.add(roof);
          addBox(0.048, 0.060, 0.014, glowMat, -0.055, 0.395, -0.128);
          addBox(0.060, 0.070, 0.014, darkPlankMat, 0.070, 0.375, -0.128);
        } else {
          addCyl(0.028, 0.040, 0.18, 7, hutMat, 0.02, 0.335, -0.04);
          addBox(0.15, 0.025, 0.10, roofMat, 0.02, 0.435, -0.04, 0.28);
          addBox(0.020, 0.17, 0.020, plankMat, -0.11, 0.335, 0.05, -0.12);
        }
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(crowns >= 2 ? 0.034 : 0.027, 10, 8), glowMat);
        lantern.position.set(0.17, crowns >= 2 ? 0.44 : 0.38, -0.09);
        group.add(lantern);
        for (const [rx, rz, scale] of [[-0.22, -0.14, 0.86], [0.22, 0.12, 0.72], [0.20, -0.18, 0.62]]) {
          addCyl(0.005 * scale, 0.008 * scale, 0.14 * scale, 5, reedMat, rx, 0.285 + 0.070 * scale, rz);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.026 * scale, 8, 5), mossMat);
          cap.scale.set(1.42, 0.24, 0.78);
          cap.position.set(rx + 0.020 * scale, 0.256, rz + 0.016 * scale);
          cap.rotation.y = rand() * Math.PI * 2;
          group.add(cap);
        }
        break;
      }
      case Landscapes.MINE: {
        const timberMat = new THREE.MeshStandardMaterial({ color: 0x704e31, roughness: 0.76, metalness: 0.04 });
        const railMat = new THREE.MeshStandardMaterial({ color: 0x5f442d, roughness: 0.78, metalness: 0.05 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x05080d, roughness: 0.86, metalness: 0.06, emissive: 0x020305, emissiveIntensity: 0.12 });
        const oreMat = new THREE.MeshStandardMaterial({ color: 0xf0bc4a, roughness: 0.34, metalness: 0.45, emissive: 0x6b3d08, emissiveIntensity: 0.22 });
        const crystalMat = new THREE.MeshStandardMaterial({ color: 0x89dbff, roughness: 0.25, metalness: 0.30, emissive: 0x1d526f, emissiveIntensity: crowns >= 3 ? 0.44 : 0.26 });
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x526272, roughness: 0.70, metalness: 0.16 });

        const addLocalCart = (px, pz, angle = 0, scale = 1) => {
          const cart = new THREE.Group();
          cart.position.set(px, 0.260, pz);
          cart.rotation.y = angle;
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.13 * scale, 0.060 * scale, 0.095 * scale), stoneMat);
          body.position.set(0, 0.030 * scale, 0);
          cart.add(body);
          const lip = new THREE.Mesh(new THREE.BoxGeometry(0.15 * scale, 0.012 * scale, 0.108 * scale), stoneMat);
          lip.position.set(0, 0.066 * scale, 0);
          cart.add(lip);
          for (const ox of [-0.034, 0.012, 0.044]) {
            const ore = new THREE.Mesh(new THREE.DodecahedronGeometry(0.017 * scale, 0), oreMat);
            ore.position.set(ox * scale, 0.086 * scale, -0.010 * scale + rand() * 0.020 * scale);
            ore.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
            cart.add(ore);
          }
          for (const wx of [-0.048, 0.048]) {
            for (const wz of [-0.052, 0.052]) {
              const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.017 * scale, 0.017 * scale, 0.010 * scale, 10), darkMat);
              wheel.position.set(wx * scale, 0.010 * scale, wz * scale);
              wheel.rotation.x = Math.PI / 2;
              cart.add(wheel);
            }
          }
          group.add(cart);
        };

        const addOrePile = (px, pz, amount = 3, mat = oreMat) => {
          for (let i = 0; i < amount; i++) {
            const ore = new THREE.Mesh(new THREE.OctahedronGeometry(0.022 + rand() * 0.018, 0), mat);
            ore.position.set(px + rand() * 0.11 - 0.055, 0.265 + rand() * 0.045, pz + rand() * 0.09 - 0.045);
            ore.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
            group.add(ore);
          }
        };

        for (const rz of [-0.034, 0.034]) {
          addBox(0.42, 0.014, 0.012, railMat, 0.02, 0.244, 0.145 + rz, -0.16);
        }
        for (const tx of [-0.13, 0.03, 0.19]) {
          addBox(0.032, 0.010, 0.130, railMat, tx, 0.238, 0.145, -0.16);
        }
        const entrance = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), darkMat);
        entrance.scale.set(1.32, 0.88, 0.36);
        entrance.position.set(-0.05, 0.31, -0.115);
        group.add(entrance);
        addBox(0.034, 0.25, 0.034, timberMat, -0.18, 0.34, -0.115);
        addBox(0.034, 0.25, 0.034, timberMat, 0.08, 0.34, -0.115);
        addBox(0.32, 0.035, 0.040, timberMat, -0.05, 0.46, -0.115);
        addBox(0.26, 0.030, 0.050, timberMat, -0.05, 0.505, -0.115);
        addLocalCart(0.15, 0.155, -0.16, 0.86);
        addOrePile(-0.20, 0.12, crowns >= 2 ? 3 : 2, oreMat);
        if (crowns >= 2) {
          addBox(0.026, 0.34, 0.026, timberMat, 0.18, 0.405, -0.02, 0.18);
          addBox(0.026, 0.34, 0.026, timberMat, 0.02, 0.405, 0.09, -0.18);
          addBox(0.22, 0.024, 0.024, timberMat, 0.10, 0.565, 0.035, 0.58);
          const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 8, 18), stoneMat);
          pulley.position.set(0.21, 0.555, -0.030);
          pulley.rotation.y = Math.PI / 2;
          group.add(pulley);
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 6), darkMat);
          rope.position.set(0.21, 0.470, -0.030);
          group.add(rope);
          addBox(0.060, 0.040, 0.070, timberMat, 0.21, 0.350, -0.030, 0.20);
        }
        if (crowns >= 3) {
          const cluster = new THREE.Group();
          cluster.position.set(-0.18, 0.245, 0.18);
          cluster.rotation.y = -0.18 + rand() * 0.36;
          for (const [cx, cz, h, r] of [
            [0, 0, 0.29, 0.052],
            [0.060, -0.024, 0.21, 0.036],
            [-0.052, 0.030, 0.18, 0.032],
          ]) {
            const spire = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), crystalMat);
            spire.position.set(cx, h / 2, cz);
            spire.rotation.y = rand() * Math.PI;
            cluster.add(spire);
          }
          group.add(cluster);
          addOrePile(-0.04, 0.20, 2, crystalMat);
        }
        break;
      }
      default:
        break;
    }

    this.#addTileObjects(group);
  }

  #addLandscapeDetail(tile, seedKey = '') {
    const x = tile.x;
    const y = tile.y;
    const landscape = tile.landscape;
    const rand = this.#variationRand(tile, 'landscape', seedKey);

    switch (landscape) {
      case Landscapes.FOREST: {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c33, roughness: 0.75, metalness: 0.02 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x236f3d, roughness: 0.68, metalness: 0.02 });
        const tipMat = new THREE.MeshStandardMaterial({ color: 0x55b56a, roughness: 0.66, metalness: 0.02 });
        const underbrushMat = new THREE.MeshStandardMaterial({ color: 0x164c2c, roughness: 0.78, metalness: 0.02 });
        const crowned = (tile.crowns || 0) > 0;
        const treeCount = crowned ? 4 + Math.floor(rand() * 2) : 5 + Math.floor(rand() * 3);
        const landmarkAvoidance = crowned ? [{ dx: -0.12, dz: 0.12, r: 0.25 }] : [];
        const trees = this.#spacedDetailSpots(rand, treeCount, 0.34, 0.17, landmarkAvoidance)
          .map((spot) => ({
            dx: spot.dx,
            dz: spot.dz,
            h: 0.13 + rand() * 0.08,
            cr: 0.055 + rand() * 0.035,
            ch: 0.12 + rand() * 0.07,
          }));
        for (const t of trees) {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, t.h, 7), trunkMat);
          trunk.position.set(x + t.dx, 0.22 + t.h / 2, y + t.dz);
          trunk.rotation.y = rand() * Math.PI * 2;
          this.#addTileObjects(trunk);

          const canopy = new THREE.Mesh(new THREE.ConeGeometry(t.cr, t.ch, 8), leafMat);
          canopy.position.set(x + t.dx, 0.22 + t.h + 0.07, y + t.dz);
          canopy.rotation.y = rand() * Math.PI * 2;
          this.#addTileObjects(canopy);

          if (rand() > 0.55) {
            const tip = new THREE.Mesh(new THREE.ConeGeometry(t.cr * 0.68, t.ch * 0.72, 8), tipMat);
            tip.position.set(x + t.dx, 0.22 + t.h + t.ch * 0.58, y + t.dz);
            tip.rotation.y = rand() * Math.PI * 2;
            this.#addTileObjects(tip);
          }
        }
        if (rand() > 0.28) {
          const spot = this.#spacedDetailSpots(rand, 1, 0.28, 0.16, [...landmarkAvoidance, ...trees.map((tree) => ({ dx: tree.dx, dz: tree.dz, r: 0.12 }))])[0];
          const nurseLog = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.24, 8), trunkMat);
          nurseLog.position.set(x + spot.dx, 0.25, y + spot.dz);
          nurseLog.rotation.z = Math.PI / 2;
          nurseLog.rotation.y = rand() * Math.PI * 2;
          this.#addTileObjects(nurseLog);
        }
        for (let i = 0; i < 2; i++) {
          const spot = this.#spacedDetailSpots(rand, 1, 0.34, 0.12, landmarkAvoidance)[0];
          const brush = new THREE.Mesh(new THREE.SphereGeometry(0.035 + rand() * 0.018, 8, 6), underbrushMat);
          brush.scale.set(1.2 + rand() * 0.5, 0.45, 0.8 + rand() * 0.4);
          brush.position.set(x + spot.dx, 0.24, y + spot.dz);
          brush.rotation.y = rand() * Math.PI * 2;
          this.#addTileObjects(brush);
        }
        break;
      }
      case Landscapes.WHEAT: {
        const stalkMat = new THREE.MeshStandardMaterial({ color: 0xf4c95b, roughness: 0.62, metalness: 0.04, emissive: 0x2f1b04, emissiveIntensity: 0.06 });
        const paleStalkMat = new THREE.MeshStandardMaterial({ color: 0xffe59a, roughness: 0.58, metalness: 0.04, emissive: 0x382004, emissiveIntensity: 0.07 });
        const seedMat = new THREE.MeshStandardMaterial({ color: 0xf0b33e, roughness: 0.62, metalness: 0.04, emissive: 0x4b2904, emissiveIntensity: 0.08 });
        const darkSeedMat = new THREE.MeshStandardMaterial({ color: 0xc57925, roughness: 0.68, metalness: 0.03, emissive: 0x321804, emissiveIntensity: 0.05 });
        const twineMat = new THREE.MeshStandardMaterial({ color: 0x7a4d24, roughness: 0.72, metalness: 0.02 });
        const baleMat = new THREE.MeshStandardMaterial({ color: 0xdfaa3d, roughness: 0.74, metalness: 0.03, emissive: 0x321a03, emissiveIntensity: 0.05 });
        const shadowMat = new THREE.MeshStandardMaterial({ color: 0xa76c25, roughness: 0.78, metalness: 0.02, transparent: true, opacity: 0.42 });
        const scarecrowMat = new THREE.MeshStandardMaterial({ color: 0x8a4f24, roughness: 0.74, metalness: 0.02 });
        const clothMat = new THREE.MeshStandardMaterial({ color: 0xb84a2f, roughness: 0.72, metalness: 0.02 });
        const crowned = (tile.crowns || 0) > 0;
        const avoidZones = crowned
          ? [
              { dx: -0.14, dz: 0.13, r: 0.31 },
              { dx: 0.27, dz: -0.30, r: 0.19 },
            ]
          : [];
        const fieldStyle = Math.floor(rand() * 3);
        const rowAngle = -0.38 + rand() * 0.16;
        const rowCos = Math.cos(rowAngle);
        const rowSin = Math.sin(rowAngle);
        const rows = fieldStyle === 0
          ? [-0.31, -0.18, -0.05, 0.08, 0.21]
          : fieldStyle === 1
            ? [-0.28, -0.08, 0.12, 0.28]
            : [-0.25, -0.15, -0.02, 0.11, 0.24];

        const shadowSpots = this.#spacedDetailSpots(rand, fieldStyle === 1 ? 2 : 3, 0.27, 0.13, avoidZones);
        for (const spot of shadowSpots) {
          const patch = new THREE.Mesh(new THREE.SphereGeometry(0.055 + rand() * 0.035, 10, 6), shadowMat);
          patch.scale.set(1.8 + rand() * 0.8, 0.08, 0.65 + rand() * 0.35);
          patch.position.set(x + spot.dx, 0.232, y + spot.dz);
          patch.rotation.y = rowAngle + (-0.18 + rand() * 0.36);
          this.#addTileObjects(patch);
        }

        for (const rowZ of rows) {
          const clusterCount = (fieldStyle === 1 ? 3 : 4) + Math.floor(rand() * 2);
          const rowOffset = -0.03 + rand() * 0.06;
          for (let i = 0; i < clusterCount; i++) {
            const spread = fieldStyle === 1 ? 0.40 : 0.50;
            const along = -spread / 2 + i * (spread / Math.max(1, clusterCount - 1)) + (-0.030 + rand() * 0.060);
            const lateral = rowOffset + (-0.035 + rand() * 0.070);
            const dx = along * rowCos - lateral * rowSin;
            const dz = rowZ + along * rowSin + lateral * rowCos;
            if (avoidZones.some((zone) => Math.hypot(dx - zone.dx, dz - zone.dz) < zone.r * 0.76)) continue;

            const h = 0.12 + rand() * (fieldStyle === 2 ? 0.13 : 0.10);
            const lean = -0.26 + rand() * 0.52;
            const stalkGroup = new THREE.Group();
            stalkGroup.position.set(x + dx, 0.23, y + dz);
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.010, h, 6), rand() > 0.55 ? paleStalkMat : stalkMat);
            stalk.position.set(0, h / 2, 0);
            stalk.rotation.z = lean;
            stalk.rotation.x = -0.08 + rand() * 0.16;
            stalk.rotation.y = rowAngle + (-0.20 + rand() * 0.40);
            stalkGroup.add(stalk);

            const head = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 6), rand() > 0.25 ? seedMat : darkSeedMat);
            head.scale.set(0.54, 1.55 + rand() * 0.35, 0.54);
            head.position.set(Math.sin(lean) * 0.025, h + 0.012, 0);
            head.rotation.z = lean;
            head.rotation.y = stalk.rotation.y;
            stalkGroup.add(head);

            if (rand() > 0.48) {
              for (const side of [-1, 1]) {
                const awn = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.003, 0.055, 5), paleStalkMat);
                awn.position.set(side * 0.014, h + 0.040, 0);
                awn.rotation.z = lean + side * 0.72;
                awn.rotation.y = stalk.rotation.y;
                stalkGroup.add(awn);
              }
            }
            this.#addTileObjects(stalkGroup);
            this.#registerAnimatedObject(stalkGroup, 'wheat', {
              phase: rowZ * 1.8 + i * 0.18 + rand() * 0.20,
              speed: 1.05 + rand() * 0.16,
              amplitude: 0.72 + rand() * 0.28,
            });
          }
        }

        if (rand() > 0.18) {
          const spot = this.#spacedDetailSpots(rand, 1, 0.25, 0.15, avoidZones)[0];
          const baleStyle = Math.floor(rand() * 3);
          const bale = new THREE.Group();
          bale.position.set(x + spot.dx, 0.275, y + spot.dz);
          bale.rotation.y = rowAngle + Math.PI * 0.12 + rand() * 0.35;

          if (baleStyle === 0) {
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.075, 0.13), baleMat);
            bale.add(body);
            for (const bandX of [-0.055, 0.055]) {
              const band = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.081, 0.137), twineMat);
              band.position.set(bandX, 0.002, 0);
              bale.add(band);
            }
            for (const strandZ of [-0.035, 0.0, 0.035]) {
              const strand = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.006, 0.006), paleStalkMat);
              strand.position.set(0, 0.041, strandZ);
              bale.add(strand);
            }
          } else if (baleStyle === 1) {
            for (let i = 0; i < 2; i++) {
              const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.062, 0.11), baleMat);
              body.position.set(-0.035 + i * 0.07, i * 0.035, -0.018 + i * 0.036);
              body.rotation.y = -0.12 + i * 0.24;
              bale.add(body);
              const band = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.068, 0.116), twineMat);
              band.position.copy(body.position);
              band.rotation.y = body.rotation.y;
              bale.add(band);
            }
          } else {
            const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.16, 14), baleMat);
            roll.rotation.z = Math.PI / 2;
            bale.add(roll);
            for (const xOffset of [-0.045, 0.045]) {
              const ring = new THREE.Mesh(new THREE.TorusGeometry(0.067, 0.004, 8, 18), twineMat);
              ring.position.set(xOffset, 0, 0);
              ring.rotation.y = Math.PI / 2;
              bale.add(ring);
            }
          }
          this.#addTileObjects(bale);
        }

        if (rand() > (crowned ? 0.64 : 0.48)) {
          const scareSpot = this.#spacedDetailSpots(rand, 1, 0.28, 0.18, avoidZones)[0];
          const scarecrow = new THREE.Group();
          scarecrow.position.set(x + scareSpot.dx, 0, y + scareSpot.dz);
          scarecrow.rotation.y = rowAngle + 0.20 + rand() * 0.56;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.19, 6), scarecrowMat);
          post.position.set(0, 0.315, 0);
          scarecrow.add(post);
          const arms = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.012, 0.010), scarecrowMat);
          arms.position.set(0, 0.375, 0);
          scarecrow.add(arms);
          const tunic = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.018), clothMat);
          tunic.position.set(0, 0.345, 0.006);
          scarecrow.add(tunic);
          const hat = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.038, 5), darkSeedMat);
          hat.position.set(0, 0.430, 0);
          scarecrow.add(hat);
          this.#addTileObjects(scarecrow);
        }
        break;
      }
      case Landscapes.WATER: {
        const glintMat = new THREE.MeshBasicMaterial({
          color: 0xcaf8ff,
          transparent: true,
          opacity: 0.46,
        });
        const shadowMat = new THREE.MeshStandardMaterial({
          color: 0x0b587a,
          roughness: 0.50,
          metalness: 0.10,
          transparent: true,
          opacity: 0.38,
        });
        const fishBlueMat = new THREE.MeshStandardMaterial({ color: 0x174f72, roughness: 0.42, metalness: 0.16, emissive: 0x092536, emissiveIntensity: 0.08 });
        const fishOrangeMat = new THREE.MeshStandardMaterial({ color: 0xffa13e, roughness: 0.45, metalness: 0.10, emissive: 0x5b2604, emissiveIntensity: 0.08 });
        const fishPaleMat = new THREE.MeshStandardMaterial({ color: 0x9ae2f1, roughness: 0.38, metalness: 0.18, emissive: 0x103447, emissiveIntensity: 0.10 });
        const turtleShellMat = new THREE.MeshStandardMaterial({ color: 0x3f7f60, roughness: 0.68, metalness: 0.04, emissive: 0x0b2c1c, emissiveIntensity: 0.05 });
        const turtleBodyMat = new THREE.MeshStandardMaterial({ color: 0x79b684, roughness: 0.72, metalness: 0.03 });

        const crowned = (tile.crowns || 0) > 0;
        const avoidZones = crowned
          ? [
              { dx: -0.14, dz: 0.13, r: 0.31 },
              { dx: -0.26, dz: 0.28, r: 0.22 },
              { dx: -0.02, dz: 0.04, r: 0.19 },
              { dx: -0.02, dz: 0.24, r: 0.16 },
            ]
          : [];

        const waterStyle = Math.floor(rand() * 4);
        const glintCount = waterStyle === 0 ? 0 : waterStyle === 1 ? 1 : 2;
        for (const { dx, dz } of this.#clearDetailSpots(rand, glintCount, 0.32, 0.12, avoidZones)) {
          const glint = new THREE.Mesh(
            createWaterShardGeometry(0.10 + rand() * 0.13, 0.024 + rand() * 0.026, rand),
            glintMat
          );
          glint.position.set(x + dx, 0.239 + rand() * 0.012, y + dz);
          glint.rotation.x = -Math.PI / 2;
          glint.rotation.y = -0.52 + rand() * 1.04;
          this.#addTileObjects(glint);
        }

        const shadowCount = waterStyle === 3 ? 0 : 1 + Math.floor(rand() * 2);
        for (const { dx, dz } of this.#clearDetailSpots(rand, shadowCount, 0.26, 0.13, avoidZones)) {
          const shadow = new THREE.Mesh(
            createWaterShardGeometry(0.15 + rand() * 0.16, 0.060 + rand() * 0.050, rand),
            shadowMat
          );
          shadow.position.set(x + dx, 0.231, y + dz);
          shadow.rotation.x = -Math.PI / 2;
          shadow.rotation.y = -0.55 + rand() * 1.10;
          this.#addTileObjects(shadow);
          this.#registerAnimatedObject(shadow, 'deepFish', {
            phase: rand() * Math.PI * 2,
            speed: 0.34 + rand() * 0.16,
            amplitude: 0.78 + rand() * 0.26,
            travel: 0.010,
            wander: 0.006,
          });
        }

        if (rand() > 0.82) {
          const [spot] = this.#clearDetailSpots(rand, 1, 0.23, 0.12, avoidZones);
          if (spot) this.#addWaterTurtle(x, y, spot.dx, spot.dz, rand() * Math.PI * 2, turtleShellMat, turtleBodyMat);
        } else {
          const fishCount = waterStyle === 2 ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3);
          const fishSpots = this.#clearDetailSpots(rand, fishCount, 0.30, crowned ? 0.12 : 0.10, avoidZones);
          for (let i = 0; i < fishSpots.length; i++) {
            const { dx, dz } = fishSpots[i];
            const bodyMat = i === 0 && rand() > 0.40
              ? fishOrangeMat
              : rand() > 0.55
                ? fishPaleMat
                : fishBlueMat;
            const tailMat = bodyMat === fishBlueMat ? fishPaleMat : bodyMat;
            this.#addWaterFish(
              x,
              y,
              dx,
              dz,
              rand() * Math.PI * 2,
              0.82 + rand() * 0.46,
              bodyMat,
              tailMat,
              crowned ? { travel: 0.014, wander: 0.006 } : {}
            );
          }
        }
        break;
      }
      case Landscapes.PASTURE: {
        const grassMat = new THREE.MeshStandardMaterial({ color: 0x58b957, roughness: 0.78, metalness: 0.02 });
        const darkGrassMat = new THREE.MeshStandardMaterial({ color: 0x337f3d, roughness: 0.82, metalness: 0.02 });
        const cloverMat = new THREE.MeshStandardMaterial({ color: 0xd8f2a0, roughness: 0.68, metalness: 0.02 });
        const flowerMat = new THREE.MeshStandardMaterial({ color: 0xfff0a6, roughness: 0.58, metalness: 0.02 });
        const pinkFlowerMat = new THREE.MeshStandardMaterial({ color: 0xffbad5, roughness: 0.62, metalness: 0.02 });
        const sheepMat = new THREE.MeshStandardMaterial({ color: 0xf1efe2, roughness: 0.76, metalness: 0.02 });
        const woolMat = new THREE.MeshStandardMaterial({ color: 0xfffbe8, roughness: 0.82, metalness: 0.01 });
        const sheepHeadMat = new THREE.MeshStandardMaterial({ color: 0x3f352e, roughness: 0.78, metalness: 0.02 });

        const crowned = (tile.crowns || 0) > 0;
        const avoidZones = crowned
          ? [
              { dx: -0.14, dz: 0.13, r: 0.30 },
              { dx: 0.27, dz: -0.30, r: 0.18 },
            ]
          : [];
        const tuftCount = 7 + Math.floor(rand() * 5);
        const tuftSpots = this.#spacedDetailSpots(rand, tuftCount, 0.34, 0.080, avoidZones);
        for (const { dx, dz } of tuftSpots) {
          const bladeCount = 3 + Math.floor(rand() * 4);
          for (let b = 0; b < bladeCount; b++) {
            const h = 0.045 + rand() * 0.060;
            const blade = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0035, 0.009, h, 5),
              rand() > 0.35 ? grassMat : darkGrassMat
            );
            blade.position.set(
              x + dx + rand() * 0.055 - 0.027,
              0.226 + h / 2,
              y + dz + rand() * 0.055 - 0.027
            );
            blade.rotation.x = -0.28 + rand() * 0.56;
            blade.rotation.z = -0.28 + rand() * 0.56;
            blade.rotation.y = rand() * Math.PI * 2;
            this.#addTileObjects(blade);
          }

          if (rand() > 0.54) {
            const cloverGroup = new THREE.Group();
            cloverGroup.position.set(x + dx + rand() * 0.050 - 0.025, 0.246, y + dz + rand() * 0.050 - 0.025);
            cloverGroup.rotation.y = rand() * Math.PI * 2;
            for (let leaf = 0; leaf < 3; leaf++) {
              const a = (leaf / 3) * Math.PI * 2;
              const pad = new THREE.Mesh(new THREE.SphereGeometry(0.018 + rand() * 0.006, 7, 5), cloverMat);
              pad.scale.set(1.18, 0.20, 0.82);
              pad.position.set(Math.cos(a) * 0.019, 0, Math.sin(a) * 0.019);
              pad.rotation.y = a;
              cloverGroup.add(pad);
            }
            this.#addTileObjects(cloverGroup);
          }

          if (rand() > 0.68) {
            const flowerGroup = new THREE.Group();
            flowerGroup.position.set(x + dx + rand() * 0.060 - 0.030, 0.258, y + dz + rand() * 0.060 - 0.030);
            const blossom = new THREE.Mesh(
              new THREE.SphereGeometry(0.014 + rand() * 0.008, 8, 6),
              rand() > 0.35 ? flowerMat : pinkFlowerMat
            );
            blossom.scale.set(1.0, 0.46, 1.0);
            flowerGroup.add(blossom);
            this.#addTileObjects(flowerGroup);
          }
        }

        const sheepCount = crowned ? 1 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 3);
        const sheepSpots = this.#spacedDetailSpots(rand, sheepCount, crowned ? 0.31 : 0.30, 0.15, avoidZones);
        for (let i = 0; i < sheepSpots.length; i++) {
          const spot = sheepSpots[i];
          const scale = (i === 0 ? 1.02 : 0.78) + rand() * 0.22;
          this.#addPastureSheep(x, y, spot.dx, spot.dz, rand() * Math.PI * 2, scale, sheepMat, woolMat, sheepHeadMat);
        }
        break;
      }
      case Landscapes.BOG: {
        const muckMat = new THREE.MeshStandardMaterial({ color: 0x3c284d, roughness: 0.84, metalness: 0.04, emissive: 0x15091f, emissiveIntensity: 0.08 });
        const poolMat = new THREE.MeshStandardMaterial({ color: 0x3a2449, roughness: 0.58, metalness: 0.08, emissive: 0x15091f, emissiveIntensity: 0.12, transparent: true, opacity: 0.92 });
        const mossMat = new THREE.MeshStandardMaterial({ color: 0xaaa55c, roughness: 0.78, metalness: 0.03 });
        const darkMossMat = new THREE.MeshStandardMaterial({ color: 0x5f6b3c, roughness: 0.82, metalness: 0.02 });
        const reedMat = new THREE.MeshStandardMaterial({ color: 0x7c7f3e, roughness: 0.74, metalness: 0.02 });
        const cattailMat = new THREE.MeshStandardMaterial({ color: 0x5b3c23, roughness: 0.72, metalness: 0.02 });
        const lilyMat = new THREE.MeshStandardMaterial({ color: 0x8fae58, roughness: 0.72, metalness: 0.02 });
        const fungusStemMat = new THREE.MeshStandardMaterial({ color: 0xd6caa2, roughness: 0.76, metalness: 0.02 });
        const fungusCapMat = new THREE.MeshStandardMaterial({ color: 0xb889c9, roughness: 0.64, metalness: 0.03, emissive: 0x2a123c, emissiveIntensity: 0.08 });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xe6df8d, transparent: true, opacity: 0.74 });
        const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b5332, roughness: 0.84, metalness: 0.03 });
        const crowned = (tile.crowns || 0) > 0;
        const avoidZones = crowned
          ? [
              { dx: -0.14, dz: 0.13, r: 0.32 },
              { dx: 0.27, dz: -0.30, r: 0.18 },
            ]
          : [];
        const puddleCount = 3 + Math.floor(rand() * 3);
        const puddleSpots = this.#spacedDetailSpots(rand, puddleCount, 0.34, 0.13, avoidZones);
        for (const { dx, dz } of puddleSpots) {
          const r = 0.056 + rand() * 0.056;
          const puddle = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 7), rand() > 0.34 ? poolMat : muckMat);
          puddle.scale.set(1.22 + rand() * 0.42, 0.08 + rand() * 0.07, 0.68 + rand() * 0.36);
          puddle.position.set(x + dx, 0.224, y + dz);
          puddle.rotation.y = rand() * Math.PI * 2;
          this.#addTileObjects(puddle);

          if (rand() > 0.30) {
            const moss = new THREE.Mesh(new THREE.SphereGeometry(0.030 + rand() * 0.024, 9, 6), rand() > 0.50 ? mossMat : darkMossMat);
            moss.scale.set(1.35 + rand() * 0.65, 0.16, 0.72 + rand() * 0.44);
            moss.position.set(x + dx + rand() * 0.14 - 0.07, 0.246, y + dz + rand() * 0.14 - 0.07);
            moss.rotation.y = rand() * Math.PI * 2;
            this.#addTileObjects(moss);
          }
        }
        if (rand() > 0.38) {
          const plankSpot = this.#spacedDetailSpots(rand, 1, 0.30, 0.18, avoidZones)[0];
          const boardwalk = new THREE.Group();
          boardwalk.position.set(x + plankSpot.dx, 0.254, y + plankSpot.dz);
          boardwalk.rotation.y = -0.60 + rand() * 1.20;
          for (let i = 0; i < 3; i++) {
            const plank = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.014, 0.043), plankMat);
            plank.position.set(-0.065 + i * 0.065, 0, (i % 2) * 0.014);
            plank.rotation.y = -0.08 + rand() * 0.16;
            boardwalk.add(plank);
          }
          this.#addTileObjects(boardwalk);
        }
        const reedCount = 5 + Math.floor(rand() * 5);
        const reedSpots = this.#spacedDetailSpots(rand, reedCount, 0.33, 0.070, avoidZones);
        for (const { dx, dz } of reedSpots) {
          const h = 0.13 + rand() * 0.12;
          const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, h, 6), reedMat);
          reed.position.set(x + dx, 0.24 + h / 2, y + dz);
          reed.rotation.z = -0.18 + rand() * 0.36;
          this.#addTileObjects(reed);

          if (rand() > 0.45) {
            const cattail = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.011, 0.042, 8), cattailMat);
            cattail.position.set(x + dx, 0.25 + h, y + dz);
            cattail.rotation.z = reed.rotation.z;
            this.#addTileObjects(cattail);
          }
        }
        const lilySpots = this.#spacedDetailSpots(rand, 2 + Math.floor(rand() * 2), 0.28, 0.12, avoidZones);
        for (const { dx, dz } of lilySpots) {
          const pad = new THREE.Mesh(new THREE.SphereGeometry(0.036 + rand() * 0.026, 10, 6), lilyMat);
          pad.scale.set(1.34, 0.10, 0.80);
          pad.position.set(x + dx, 0.246, y + dz);
          pad.rotation.y = rand() * Math.PI * 2;
          this.#addTileObjects(pad);
        }
        if (rand() > 0.18) {
          const mushroomCount = 1 + Math.floor(rand() * 3);
          const mushroomSpots = this.#spacedDetailSpots(rand, mushroomCount, 0.27, 0.12, avoidZones);
          for (const { dx, dz } of mushroomSpots) {
            const h = 0.040 + rand() * 0.032;
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.013, h, 7), fungusStemMat);
            stem.position.set(x + dx, 0.235 + h / 2, y + dz);
            stem.rotation.z = -0.10 + rand() * 0.20;
            this.#addTileObjects(stem);

            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.026 + rand() * 0.016, 9, 6), fungusCapMat);
            cap.scale.set(1.18, 0.42, 0.92);
            cap.position.set(x + dx, 0.245 + h, y + dz);
            cap.rotation.y = rand() * Math.PI * 2;
            this.#addTileObjects(cap);
          }
        }
        if (rand() > 0.34) {
          const glowCount = 1 + Math.floor(rand() * 3);
          const glowSpots = this.#spacedDetailSpots(rand, glowCount, 0.25, 0.10, avoidZones);
          for (const { dx, dz } of glowSpots) {
            const glow = new THREE.Mesh(new THREE.SphereGeometry(0.012 + rand() * 0.007, 8, 6), glowMat);
            glow.position.set(x + dx, 0.36 + rand() * 0.08, y + dz);
            this.#addTileObjects(glow);
          }
        }
        break;
      }
      case Landscapes.MINE: {
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x657484, roughness: 0.72, metalness: 0.12 });
        const slateMat = new THREE.MeshStandardMaterial({ color: 0x485867, roughness: 0.70, metalness: 0.14 });
        const darkRockMat = new THREE.MeshStandardMaterial({ color: 0x192431, roughness: 0.76, metalness: 0.10 });
        const caveMat = new THREE.MeshStandardMaterial({ color: 0x070b10, roughness: 0.86, metalness: 0.04, emissive: 0x020305, emissiveIntensity: 0.10 });
        const railMat = new THREE.MeshStandardMaterial({ color: 0x6a4b32, roughness: 0.76, metalness: 0.04 });
        const cartMat = new THREE.MeshStandardMaterial({ color: 0x655142, roughness: 0.62, metalness: 0.18 });
        const oreGoldMat = new THREE.MeshStandardMaterial({ color: 0xf0bc4a, roughness: 0.34, metalness: 0.42, emissive: 0x6b3d08, emissiveIntensity: 0.16 });
        const crystalMat = new THREE.MeshStandardMaterial({
          color: 0x89dbff,
          emissive: 0x1d526f,
          emissiveIntensity: 0.24,
          roughness: 0.28,
          metalness: 0.26,
        });
        const crowned = (tile.crowns || 0) > 0;
        const avoidZones = crowned
          ? [
              { dx: -0.14, dz: 0.13, r: 0.34 },
              { dx: 0.27, dz: -0.30, r: 0.18 },
            ]
          : [];

        const ridgeCount = crowned ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 2);
        const ridgeSpots = this.#spacedDetailSpots(rand, ridgeCount, crowned ? 0.26 : 0.28, 0.16, avoidZones);
        for (const { dx, dz } of ridgeSpots) {
          const height = crowned ? 0.13 + rand() * 0.11 : 0.16 + rand() * 0.16;
          const radius = crowned ? 0.062 + rand() * 0.040 : 0.074 + rand() * 0.052;
          const sides = rand() > 0.50 ? 4 : 5;
          const ridge = new THREE.Mesh(
            new THREE.ConeGeometry(radius, height, sides),
            rand() > 0.42 ? slateMat : rockMat
          );
          ridge.position.set(x + dx, 0.22 + height / 2, y + dz);
          ridge.rotation.y = rand() * Math.PI * 2;
          this.#addTileObjects(ridge);

          if (rand() > 0.38) {
            const seamMat = rand() > 0.52 ? crystalMat : oreGoldMat;
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.016, height * 0.36, 0.010), seamMat);
            const seamAngle = ridge.rotation.y + (-0.36 + rand() * 0.72);
            seam.position.set(
              x + dx + Math.cos(seamAngle) * radius * 0.46,
              0.23 + height * 0.48,
              y + dz + Math.sin(seamAngle) * radius * 0.46
            );
            seam.rotation.y = seamAngle;
            seam.rotation.z = -0.16 + rand() * 0.32;
            this.#addTileObjects(seam);
          }
        }

        if (!crowned) {
          const caveSpot = this.#spacedDetailSpots(rand, 1, 0.21, 0.18, avoidZones)[0];
          const cave = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 7), caveMat);
          cave.scale.set(1.44, 0.18, 0.88);
          cave.position.set(x + caveSpot.dx, 0.242, y + caveSpot.dz);
          cave.rotation.y = rand() * Math.PI * 2;
          this.#addTileObjects(cave);
        }

        const rubbleCount = crowned ? 2 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 3);
        const rubbleSpots = this.#spacedDetailSpots(rand, rubbleCount, 0.34, 0.11, avoidZones);
        for (const spot of rubbleSpots) {
          const size = crowned ? 0.020 + rand() * 0.026 : 0.024 + rand() * 0.032;
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rand() > 0.52 ? rockMat : darkRockMat);
          rock.position.set(x + spot.dx, 0.238 + size * 0.55, y + spot.dz);
          rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
          this.#addTileObjects(rock);

          if (rand() > (crowned ? 0.82 : 0.68)) {
            const ore = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.44, 0), rand() > 0.45 ? crystalMat : oreGoldMat);
            ore.position.set(x + spot.dx + rand() * 0.045 - 0.022, 0.275 + size * 0.65, y + spot.dz + rand() * 0.045 - 0.022);
            ore.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
            this.#addTileObjects(ore);
          }
        }

        if (!crowned && rand() > 0.16) {
          const cartSpot = this.#spacedDetailSpots(rand, 1, 0.22, 0.18, avoidZones)[0];
          this.#addMineCart(x, y, cartSpot.dx, cartSpot.dz, -0.45 + rand() * 0.9, railMat, cartMat, darkRockMat, oreGoldMat, rand);
        }
        break;
      }
    }
  }

  #addCastleDetail(x, y, board, boardManager, playerIndex = 0) {
    const growth = this.#castleGrowthState(board, boardManager);
    const tier = growth.tier;
    const playerColor = this.#playerColorHex(playerIndex);
    const color = new THREE.Color(playerColor);
    const palePlayerColor = color.clone().lerp(new THREE.Color(0xf4f7ff), 0.62);
    const deepPlayerColor = color.clone().lerp(new THREE.Color(0x1b2230), 0.30);

    const baseStone = new THREE.MeshStandardMaterial({
      color: palePlayerColor,
      roughness: 0.66,
      metalness: 0.08,
      emissive: deepPlayerColor,
      emissiveIntensity: growth.perfectKingdom ? 0.12 : 0.045,
    });
    const wallStone = new THREE.MeshStandardMaterial({
      color: color.clone().lerp(new THREE.Color(0xdbe2ee), 0.46),
      roughness: 0.58,
      metalness: 0.10,
      emissive: deepPlayerColor,
      emissiveIntensity: growth.perfectKingdom ? 0.18 : 0.08,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xf2efe4,
      roughness: 0.48,
      metalness: 0.12,
      emissive: deepPlayerColor,
      emissiveIntensity: 0.04,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: playerColor,
      roughness: 0.40,
      metalness: 0.18,
      emissive: playerColor,
      emissiveIntensity: growth.perfectKingdom ? 0.18 : 0.09,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x202431,
      roughness: 0.78,
      metalness: 0.04,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd66d,
      roughness: 0.30,
      metalness: 0.58,
      emissive: 0x7a4b08,
      emissiveIntensity: growth.perfectKingdom ? 0.42 : 0.20,
    });

    const addBox = (w, h, d, mat, dx, cy, dz, ry = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x + dx, cy, y + dz);
      mesh.rotation.y = ry;
      this.#addTileObjects(mesh);
      return mesh;
    };
    const addCyl = (rt, rb, h, seg, mat, dx, cy, dz) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
      mesh.position.set(x + dx, cy, y + dz);
      this.#addTileObjects(mesh);
      return mesh;
    };
    const addFlag = (dx, dz, height, side = 1) => {
      const mastMat = new THREE.MeshStandardMaterial({ color: 0x5d4c3a, roughness: 0.74, metalness: 0.03 });
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.010, 0.26, 7), mastMat);
      mast.position.set(x + dx, height, y + dz);
      this.#addTileObjects(mast);

      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.085), roofMat);
      banner.position.set(x + dx + 0.055 * side, height + 0.075, y + dz);
      banner.rotation.y = Math.PI * 0.23 * side;
      this.#addTileObjects(banner);
    };
    const addBattlements = (topY, scale) => {
      const toothGeom = new THREE.BoxGeometry(0.052 * scale, 0.060, 0.052 * scale);
      const positions = [
        [-0.19, -0.19], [0.00, -0.19], [0.19, -0.19],
        [-0.19, 0.19], [0.00, 0.19], [0.19, 0.19],
        [-0.19, 0.00], [0.19, 0.00],
      ];
      for (const [dx, dz] of positions) {
        const tooth = new THREE.Mesh(toothGeom, trimMat);
        tooth.position.set(x + dx * scale, topY, y + dz * scale);
        this.#addTileObjects(tooth);
      }
    };

    addBox(0.82, 0.060, 0.82, baseStone, 0, 0.250, 0);
    addBox(0.66, 0.025, 0.66, trimMat, 0, 0.294, 0);

    if (tier >= 1) {
      addBox(0.62, 0.14, 0.070, wallStone, 0, 0.365, -0.32);
      addBox(0.62, 0.14, 0.070, wallStone, 0, 0.365, 0.32);
      addBox(0.070, 0.14, 0.62, wallStone, -0.32, 0.365, 0);
      addBox(0.070, 0.14, 0.62, wallStone, 0.32, 0.365, 0);
    } else {
      addBox(0.52, 0.10, 0.060, wallStone, 0, 0.345, -0.28);
      addBox(0.060, 0.10, 0.52, wallStone, -0.28, 0.345, 0);
    }

    const keepScale = tier === 0 ? 0.76 : tier === 1 ? 0.88 : tier === 2 ? 0.98 : tier === 3 ? 1.08 : 1.16;
    const keepHeight = 0.26 + tier * 0.045;
    addBox(0.34 * keepScale, keepHeight, 0.34 * keepScale, wallStone, 0, 0.30 + keepHeight / 2, 0);
    addBox(0.12 * keepScale, 0.12, 0.020, darkMat, 0, 0.360, -0.174 * keepScale);
    addBox(0.13 * keepScale, 0.13, 0.022, darkMat, 0, 0.365, 0.176 * keepScale);
    addBox(0.022, 0.105, 0.10 * keepScale, darkMat, 0.176 * keepScale, 0.365, 0);
    addBox(0.050, 0.060, 0.018, trimMat, -0.065 * keepScale, 0.475, -0.176 * keepScale);
    addBox(0.050, 0.060, 0.018, trimMat, 0.065 * keepScale, 0.475, -0.176 * keepScale);
    addBox(0.044, 0.052, 0.016, trimMat, -0.060 * keepScale, 0.480, 0.178 * keepScale);
    addBox(0.044, 0.052, 0.016, trimMat, 0.060 * keepScale, 0.480, 0.178 * keepScale);
    addBox(0.016, 0.052, 0.044, trimMat, 0.178 * keepScale, 0.480, -0.060 * keepScale);
    addBox(0.016, 0.052, 0.044, trimMat, 0.178 * keepScale, 0.480, 0.060 * keepScale);
    addBattlements(0.31 + keepHeight, keepScale);

    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.18 * keepScale, 0.12 + tier * 0.012, 4), roofMat);
    keepRoof.rotation.y = Math.PI * 0.25;
    keepRoof.position.set(x, 0.322 + keepHeight + 0.055, y);
    this.#addTileObjects(keepRoof);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.026, 9, 7), goldMat);
    finial.position.set(x, 0.390 + keepHeight + 0.12, y);
    this.#addTileObjects(finial);

    const towerOffsets = tier === 0
      ? [[-0.27, -0.27], [0.27, 0.27]]
      : [[-0.30, -0.30], [0.30, -0.30], [-0.30, 0.30], [0.30, 0.30]];
    const towerHeight = 0.22 + tier * 0.035;
    for (const [dx, dz] of towerOffsets) {
      addCyl(0.060 + tier * 0.006, 0.074 + tier * 0.006, towerHeight, 12, wallStone, dx, 0.29 + towerHeight / 2, dz);
      const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(0.088 + tier * 0.006, tier >= 2 ? 0.115 : 0.086, 12), roofMat);
      towerRoof.position.set(x + dx, 0.305 + towerHeight + (tier >= 2 ? 0.055 : 0.040), y + dz);
      this.#addTileObjects(towerRoof);
    }

    if (tier >= 2) {
      addBox(0.35, 0.018, 0.060, goldMat, 0, 0.575, -0.315);
    }

    if (tier >= 1 && tier < 3) {
      addFlag(0.06, 0.06, 0.650, 1);
    }

    if (tier >= 3) {
      addFlag(0.08, 0.08, 0.675, 1);
      addFlag(-0.24, -0.24, 0.570, -1);
    }

    if (growth.perfectKingdom) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 10, 26), goldMat);
      ring.position.set(x, 0.86, y);
      ring.rotation.x = Math.PI / 2;
      this.#addTileObjects(ring);

      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.08, 8), goldMat);
        tip.position.set(x + Math.cos(a) * 0.18, 0.91, y + Math.sin(a) * 0.18);
        this.#addTileObjects(tip);
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
    const metalness = landscape === Landscapes.MINE ? 0.12 : landscape === Landscapes.WATER ? 0.08 : 0.03;
    const roughness = ghost
      ? 0.74
      : landscape === Landscapes.WATER
        ? 0.46
        : landscape === Landscapes.MINE
          ? 0.56
          : 0.62;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      roughness,
      metalness,
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

  #syncGridPresentation() {
    if (!this.#gridHelper) return;
    const placement = this.#game?.state === GameState.PLACE && !this.#game?.isGameOver;
    const library = this.#libraryOpen || this.#isStartAttractMode();
    const key = `${library ? 1 : 0}|${placement ? 1 : 0}`;
    if (this.#lastGridPresentationKey === key) return;
    this.#lastGridPresentationKey = key;
    const materials = Array.isArray(this.#gridHelper.material)
      ? this.#gridHelper.material
      : [this.#gridHelper.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = library ? 0.035 : placement ? 0.08 : 0.12;
      material.needsUpdate = true;
    }
  }

  #syncBoardLayerPositions() {
    if (this.#libraryOpen || this.#isStartAttractMode()) {
      if (this.#gridHelper) {
        this.#gridHelper.position.x = 0;
        this.#gridHelper.position.z = 0;
      }
      if (this.#ghostGroup) {
        this.#ghostGroup.position.x = 0;
        this.#ghostGroup.position.z = 0;
      }
      if (this.#regionOverlayGroup) {
        this.#regionOverlayGroup.position.x = 0;
        this.#regionOverlayGroup.position.z = 0;
      }
      return;
    }

    const focused = this.#focusedBoardOrigin();
    const placement = this.#placementBoardOrigin();
    if (this.#gridHelper) {
      this.#gridHelper.position.x = focused.x;
      this.#gridHelper.position.z = focused.z;
    }
    if (this.#ghostGroup) {
      this.#ghostGroup.position.x = placement.x;
      this.#ghostGroup.position.z = placement.z;
    }
    if (this.#regionOverlayGroup) {
      this.#regionOverlayGroup.position.x = placement.x;
      this.#regionOverlayGroup.position.z = placement.z;
    }
  }

  #centerOnActiveBoard(animate = false) {
    if (this.#libraryOpen) {
      this.#centerOnDominoLibrary(animate);
      return;
    }
    if (this.#isStartAttractMode()) {
      this.#syncStartAttractCamera();
      return;
    }
    if (this.#game?.state === GameState.DRAFT && this.#canvasDraftEnabled()) {
      this.#centerOnCanvasDraft(animate);
      return;
    }
    if (this.#game?.state === GameState.PLACE && this.#canvasDraftEnabled()) {
      this.#centerOnPlacementPlayer(animate);
      return;
    }
    if (!this.#controls || !this.#camera) return;

    const activeIdx = this.#activePlayerIndex();
    if (activeIdx == null) return;

    const bm = this.#game.players[activeIdx].board;
    const bs = bm.boardSize;

    this.#frameToBoardSize(bs, 2, this.#boardOriginForPlayer(activeIdx), animate);
  }

  #centerOnFocusedBoard(animate = false) {
    if (this.#libraryOpen) {
      this.#centerOnDominoLibrary(animate);
      return;
    }
    if (this.#isStartAttractMode()) {
      this.#syncStartAttractCamera();
      return;
    }
    if (this.#game?.state === GameState.DRAFT && this.#canvasDraftEnabled()) {
      this.#centerOnCanvasDraft(animate);
      return;
    }
    if (this.#game?.state === GameState.PLACE && this.#canvasDraftEnabled()) {
      this.#centerOnPlacementPlayer(animate);
      return;
    }
    if (!this.#game?.players?.length) return;
    const idx = Math.max(0, Math.min(this.#focusedPlayerIndex, this.#game.players.length - 1));
    const bs = this.#game.players[idx].board.boardSize;
    this.#frameToBoardSize(bs, 2, this.#boardOriginForPlayer(idx), animate);
  }

  #centerOnCanvasDraft(animate = false) {
    if (!this.#game?.players?.length) return;
    const activeIdx = this.#game.currentPickingPlayerIndex ?? this.#focusedPlayerIndex ?? 0;
    const origin = this.#boardOriginForPlayer(activeIdx);
    const boardManager = this.#game.players[activeIdx]?.board;
    const bs = boardManager?.boardSize;
    if (!bs || !boardManager) return;

    const layout = this.#canvasDraftLayout();
    if (!layout.rows.length) {
      this.#frameToBoardSize(bs, 2, origin, animate);
      return;
    }
    const rowMinX = Math.min(...layout.rows.map((row) => row.xMin));
    const rowMaxX = Math.max(...layout.rows.map((row) => row.xMax));
    const rowMinZ = Math.min(...layout.rows.map((row) => row.zMin));
    const rowMaxZ = Math.max(...layout.rows.map((row) => row.zMax));
    const claimedTargets = layout.rows
      .filter((row) => row.slot.player === activeIdx)
      .map((row) => this.#canvasDraftClaimTarget(row, row.slot.player));
    const advisorSuggestion = this.#showAdvisor ? this.#advisor.suggestDraftMove(this.#game, activeIdx) : null;
    const advisorRow = advisorSuggestion == null
      ? null
      : layout.rows.find((row) => row.index === advisorSuggestion.index && row.slot.player == null);
    const advisorPosition = advisorRow ? this.#canvasDraftAdvisorPosition(advisorRow) : null;

    const castlePad = 1.35;
    const boardMinX = origin.x + Math.min(bs.xMin, -castlePad);
    const boardMaxX = origin.x + Math.max(bs.xMax, castlePad);
    const boardMinZ = origin.z + Math.min(bs.yMin, -castlePad);
    const boardMaxZ = origin.z + Math.max(bs.yMax, castlePad);

    this.#frameToBoardSize({
      xMin: Math.min(boardMinX, rowMinX, advisorPosition ? advisorPosition.x - 0.72 : rowMinX, ...claimedTargets.map((target) => target.leftX)),
      xMax: Math.max(boardMaxX, rowMaxX, advisorPosition ? advisorPosition.x + 0.94 : rowMaxX, ...claimedTargets.map((target) => target.leftX + 2)),
      yMin: Math.min(boardMinZ, rowMinZ, advisorPosition ? advisorPosition.z - 0.58 : rowMinZ, ...claimedTargets.map((target) => target.z - 0.6)),
      yMax: Math.max(boardMaxZ, rowMaxZ, advisorPosition ? advisorPosition.z + 0.46 : rowMaxZ, ...claimedTargets.map((target) => target.z + 0.6)),
    }, 0.66, { x: 0, z: 0 }, animate, GameLayout.#VIEW_SIZE_CLOSE);
  }

  #centerOnPlacementPlayer(animate = false) {
    if (!this.#game?.players?.length) return;
    const playerIndex = this.#placementPlayerIndex();
    if (playerIndex == null) return;
    const boardManager = this.#game.players[playerIndex]?.board;
    const bs = boardManager?.boardSize;
    if (!bs || !boardManager) return;

    const bounds = this.#boardWorldBoundsForPlayer(playerIndex, 0.24);
    if (!bounds) {
      this.#frameToBoardSize(bs, 2, this.#boardOriginForPlayer(playerIndex), animate, this.#viewSizeForBoardSize(bs));
      return;
    }

    this.#frameToBoardSize({
      xMin: bounds.xMin,
      xMax: bounds.xMax,
      yMin: bounds.zMin,
      yMax: bounds.zMax,
    }, 0.60, { x: 0, z: 0 }, animate, this.#viewSizeForBoardSize(bs));
  }

  #centerOnPlayerMat(playerIndex, animate = true) {
    if (!this.#game?.players?.[playerIndex]) return false;
    const bounds = this.#boardWorldBoundsForPlayer(playerIndex, 0.18);
    if (!bounds) return false;

    this.#focusedPlayerIndex = playerIndex;
    this.#syncBoardLayerPositions();
    this.#renderMiniMaps();
    this.#frameToBoardSize({
      xMin: bounds.xMin,
      xMax: bounds.xMax,
      yMin: bounds.zMin,
      yMax: bounds.zMax,
    }, 0.44, { x: 0, z: 0 }, animate, GameLayout.#VIEW_SIZE_CLOSE);
    return true;
  }

  #centerOnDraftMat(animate = true) {
    const bounds = this.#canvasDraftWorldRect(0.12);
    if (!bounds) return false;

    this.#frameToBoardSize({
      xMin: bounds.xMin,
      xMax: bounds.xMax,
      yMin: bounds.zMin,
      yMax: bounds.zMax,
    }, 0.44, { x: 0, z: 0 }, animate, GameLayout.#VIEW_SIZE_CLOSE);
    return true;
  }

  #centerOnDominoLibrary(animate = false) {
    const { cols, cellX, cellZ, rows, xOffset, zOffset } = this.#dominoLibraryLayout();
    this.#frameToBoardSize({
      xMin: xOffset - 0.72,
      xMax: xOffset + (cols - 1) * cellX + 1.72,
      yMin: zOffset - 0.82,
      yMax: zOffset + (rows - 1) * cellZ + 0.82,
    }, 2.2, { x: 0, z: 0 }, animate);
  }

  #centerOnLibraryDomino(number, animate = false) {
    const placement = this.#dominoLibraryPlacementByNumber(number);
    if (!placement) {
      this.#centerOnDominoLibrary(animate);
      return;
    }
    const { baseX, baseZ } = placement;
    this.#frameToBoardSize({
      xMin: baseX - 0.28,
      xMax: baseX + 1.28,
      yMin: baseZ - 0.54,
      yMax: baseZ + 0.54,
    }, 0.34, { x: 0, z: 0 }, animate, 2.55);
  }

  #ensureMiniMaps() {
    const needed = this.#game.players.length;
    if (this.#miniMapCanvases.length === needed) return;

    this.#miniMapRow.innerHTML = '';
    this.#miniMapCanvases = [];

    this.#game.players.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'miniCard';
      card.style.setProperty('--mini-player-color', this.#playerMiniMapColor(idx, 0.92));
      card.style.setProperty('--mini-player-glow', this.#playerMiniMapColor(idx, 0.16));

      const title = document.createElement('div');
      title.className = 'miniTitle';
      title.textContent = `${this.#playerNames[idx] ?? p.name} · ${p.board.score}`;

      const canvas = document.createElement('canvas');
      canvas.width = 140;
      canvas.height = 140;
      canvas.className = 'mini';

      card.append(title, canvas);
      this.#miniMapRow.append(card);
      card.addEventListener('click', () => {
        this.#focusedPlayerIndex = idx;
        this.#renderBoard();
        this.#centerOnFocusedBoard(true);
        this.#refreshHud();
      });
      this.#miniMapCanvases.push(canvas);
    });
  }

  #renderMiniMaps() {
    this.#ensureMiniMaps();

    const activeIdx = this.#activePlayerIndex();
    const pendingPlacers = this.#game.state === GameState.PLACE
      ? new Set(this.#game.players.map((_, idx) => idx)
        .filter((idx) => (this.#game.getCurrentPlacingChoicesForPlayer?.(idx) ?? []).length > 0))
      : null;

    this.#miniMapCanvases.forEach((canvas, idx) => {
      canvas.classList.toggle('miniActive', idx === this.#focusedPlayerIndex);
      canvas.parentElement?.classList.toggle('miniTurn', pendingPlacers ? pendingPlacers.has(idx) : idx === activeIdx);
      const t = canvas.parentElement?.querySelector('.miniTitle');
      if (t) t.textContent = `${this.#playerNames[idx] ?? this.#game.players[idx].name} · ${this.#game.players[idx].board.score}`;
      this.#drawMiniBoard(canvas, this.#game.players[idx].board, idx);
    });
  }

  #drawMiniBoard(canvas, boardManager, playerIndex = 0) {
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
        ctx.font = `${Math.max(8, Math.floor(tilePx * 0.55))}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (tile.landscape === Landscapes.CASTLE) {
          const cx = px + tilePx / 2;
          const cy = py + tilePx / 2;
          const radius = Math.max(4, tilePx * 0.34);
          ctx.fillStyle = this.#playerMiniMapColor(playerIndex, 0.22);
          ctx.beginPath();
          ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = this.#playerMiniMapColor(playerIndex, 0.95);
          ctx.lineWidth = Math.max(1.5, tilePx * 0.12);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(245,248,255,0.86)';
          ctx.font = `${Math.max(8, Math.floor(tilePx * 0.46))}px system-ui`;
          ctx.fillText('C', cx, cy);
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillText(String(tile.crowns), px + tilePx / 2, py + tilePx / 2);
        }
      }
    }
  }

  #findBestInitialHoverAnchor() {
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return null;

    const activeIdx = this.#placementPlayerIndex();
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
      const feedback = g.getPlacementFeedbackAtForPlayer?.(activeIdx, c.x, c.y) ?? g.getPlacementFeedbackAt(c.x, c.y);
      if (feedback.ok) return c;
    }

    if (firstVisible) return firstVisible;
    return { x: centerX, y: centerY };
  }

  #orderedPlacementCandidateAnchors() {
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return [];

    const activeIdx = this.#placementPlayerIndex();
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

    const activeIdx = this.#placementPlayerIndex();
    if (activeIdx != null) this.#focusedPlayerIndex = activeIdx;

    const options = this.#uniqueVisiblePlacementOptions(this.#currentPlacementOptions());
    if (!options.length) {
      const suggested = this.#findBestInitialHoverAnchor();
      if (suggested) {
        this.#hoverAnchor = suggested;
        this.#localPlacementFocus = null;
        this.#hoverAnchorAuto = true;
        this.#placementHint = '';
        this.#setCanvasNotice('No valid placement. Use Skip if available.', 'info', 1200);
        this.#renderGhost();
        this.#centerOnFocusedBoard();
        this.#syncMobileActions();
        this.#syncLocalPlacementDock();
        this.#refreshHud();
        return;
      }
      this.#setCanvasNotice('No placement candidates found.', 'info', 1100);
      return;
    }

    this.#applyPlacementOption(options[0]);
    this.#hoverAnchorAuto = true;
    this.#localPlacementFocus = null;
    this.#placementHint = '';
    this.#setCanvasNotice('Selected first valid move.', 'info', 900);
    this.#renderGhost();
    this.#centerOnFocusedBoard();
    this.#syncMobileActions();
    this.#syncLocalPlacementDock();
    this.#refreshHud();
  }

  #currentPlacementOptionIndex(options) {
    if (!this.#hoverAnchor) return -1;
    const drafted = this.#currentPlacementDraftedTile();
    if (!drafted) return -1;

    const exactIndex = options.findIndex((option) =>
      option.dominoNumber === drafted.domino.number
      && option.orientation === drafted.domino.orientation
      && option.x === this.#hoverAnchor.x
      && option.y === this.#hoverAnchor.y
      && (!this.#hoverAnchor.anchorEnd || option.anchorEnd === this.#hoverAnchor.anchorEnd)
    );
    if (exactIndex !== -1) return exactIndex;

    const currentKey = this.#currentVisiblePlacementOptionKey();
    if (!currentKey) return -1;
    return options.findIndex((option) => this.#visiblePlacementOptionKey(option) === currentKey);
  }

  #currentVisiblePlacementOptionKey() {
    const drafted = this.#currentPlacementDraftedTile();
    const anchor = this.#hoverAnchor;
    if (!drafted || !anchor) return null;

    return this.#visiblePlacementOptionKey({
      dominoNumber: drafted.domino.number,
      orientation: drafted.domino.orientation,
      x: anchor.x,
      y: anchor.y,
      anchorEnd: anchor.anchorEnd ?? DominoEnd.LEFT,
    });
  }

  #dominoPreservingPlacementOptionKey(option) {
    return `${option.dominoNumber}|${this.#visiblePlacementOptionKey(option)}`;
  }

  #visiblePlacementOptionKey(option) {
    const choice = this.#currentPlacementChoices()
      ?.find((c) => c.domino.number === option.dominoNumber);
    const domino = choice?.domino;
    if (!domino) {
      return [
        option.x,
        option.y,
        option.anchorEnd?.description ?? String(option.anchorEnd),
        option.orientation,
      ].join('|');
    }

    const originalOrientation = domino.orientation;
    try {
      let guard = 0;
      while (domino.orientation !== option.orientation && guard < 4) {
        domino.rotate();
        guard += 1;
      }

      const connectedEdge = domino.getConnectedEdge(option.anchorEnd);
      const offset = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
      const anchorCoord = { x: option.x, y: option.y };
      const otherCoord = { x: option.x + offset.x, y: option.y + offset.y };
      const leftCoord = option.anchorEnd === DominoEnd.LEFT ? anchorCoord : otherCoord;
      const rightCoord = option.anchorEnd === DominoEnd.RIGHT ? anchorCoord : otherCoord;
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

      return cells.map((cell) => `${cell.x},${cell.y}:${cell.landscape}:${cell.crowns}`).join('|');
    } finally {
      while (domino.orientation !== originalOrientation) {
        domino.rotate();
      }
    }
  }

  #uniqueVisiblePlacementOptions(options, { preserveDomino = false } = {}) {
    if (!options.length) return [];
    const currentDominoNumber = this.#currentPlacementDraftedTile()?.domino.number;
    const byKey = new Map();
    for (const option of options) {
      const visibleKey = this.#visiblePlacementOptionKey(option);
      const key = preserveDomino ? this.#dominoPreservingPlacementOptionKey(option) : visibleKey;
      const existing = byKey.get(key);
      if (!existing || (option.dominoNumber === currentDominoNumber && existing.dominoNumber !== currentDominoNumber)) {
        byKey.set(key, option);
      }
    }
    const playerIndex = this.#placementPlayerIndex();
    const boardSize = playerIndex == null ? null : this.#game.players[playerIndex]?.board?.boardSize;
    const centerX = boardSize ? (boardSize.xMin + boardSize.xMax) / 2 : 0;
    const centerY = boardSize ? (boardSize.yMin + boardSize.yMax) / 2 : 0;
    return [...byKey.values()].sort((a, b) => {
      if (a.dominoNumber !== b.dominoNumber) return a.dominoNumber - b.dominoNumber;
      if (a.orientation !== b.orientation) return a.orientation - b.orientation;

      const ad = Math.abs(a.x - centerX) + Math.abs(a.y - centerY);
      const bd = Math.abs(b.x - centerX) + Math.abs(b.y - centerY);
      if (ad !== bd) return ad - bd;
      if (a.y !== b.y) return a.y - b.y;
      if (a.x !== b.x) return a.x - b.x;

      const ae = a.anchorEnd === DominoEnd.RIGHT ? 1 : 0;
      const be = b.anchorEnd === DominoEnd.RIGHT ? 1 : 0;
      return ae - be;
    });
  }

  #applyPlacementOption(option) {
    if (!option) return;

    this.#hoverAnchor = { x: option.x, y: option.y, anchorEnd: option.anchorEnd };
    this.#hoverAnchorAuto = false;
    this.#placementHint = '';

    const drafted = this.#currentPlacementDraftedTile();
    if (
      drafted?.domino.number !== option.dominoNumber
      || drafted?.domino.orientation !== option.orientation
    ) {
      const payload = this.#placementActionPayload({
        dominoNumber: option.dominoNumber,
        orientation: option.orientation,
      });
      if (this.#hotseat) {
        this.#applyLocalAction({ type: 'setPlacementSelection', payload }, { render: false });
      } else {
        payload.selectionId = ++this.#placementSelectionSequence;
        this.#latestLocalPlacementSelectionId = payload.selectionId;
        this.#applyGameplayAction({ type: 'setPlacementSelection', payload });
        this.#mp?.sendAction('setPlacementSelection', payload);
      }
    }
    this.#sendPlacementPreview();
    this.#syncLocalPlacementDock();
  }

  #optionUsesGrid(option, grid) {
    if (!grid) return false;
    const choice = this.#currentPlacementChoices()
      ?.find((c) => c.domino.number === option.dominoNumber);
    const domino = choice?.domino;
    if (!domino) return option.x === grid.x && option.y === grid.y;

    const originalOrientation = domino.orientation;
    try {
      let guard = 0;
      while (domino.orientation !== option.orientation && guard < 4) {
        domino.rotate();
        guard += 1;
      }

      const connectedEdge = domino.getConnectedEdge(option.anchorEnd);
      const offset = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
      const other = { x: option.x + offset.x, y: option.y + offset.y };
      return (option.x === grid.x && option.y === grid.y)
        || (other.x === grid.x && other.y === grid.y);
    } finally {
      while (domino.orientation !== originalOrientation) {
        domino.rotate();
      }
    }
  }

  #optionUsesLocalFocus(option) {
    return this.#optionUsesGrid(option, this.#localPlacementFocus);
  }

  #placementOptionsForGrid(grid, allValid = null, { preserveDomino = false } = {}) {
    if (!grid) return [];
    const options = allValid
      ? this.#uniqueVisiblePlacementOptions(allValid, { preserveDomino })
      : this.#uniqueVisiblePlacementOptions(this.#currentPlacementOptions(), { preserveDomino });
    return this.#uniqueVisiblePlacementOptions(options.filter((option) => this.#optionUsesGrid(option, grid)), { preserveDomino });
  }

  #localPlacementOptions(allValid = null) {
    if (!this.#localPlacementFocus) return [];
    return this.#placementOptionsForGrid(this.#localPlacementFocus, allValid, { preserveDomino: true });
  }

  #placementDockOptions(allValid = null) {
    const rawOptions = allValid ?? this.#currentPlacementOptions();
    const localValid = this.#localPlacementOptions(rawOptions);
    return localValid.length ? localValid : this.#uniqueVisiblePlacementOptions(rawOptions);
  }

  #advisorPlacementOption() {
    if (!this.#showAdvisor) return null;
    const playerIndex = this.#placementPlayerIndex();
    if (playerIndex == null) return null;
    const cached = this.#advisorPlacementCache.get(playerIndex);
    if (cached?.version === this.#placementCacheVersion) return cached.option;
    const option = this.#advisor.suggestPlacementMove(this.#game, playerIndex);
    this.#advisorPlacementCache.set(playerIndex, {
      version: this.#placementCacheVersion,
      option,
    });
    return option;
  }

  #isAdvisorPlacementOption(option, advisor = this.#advisorPlacementOption()) {
    return Boolean(option && advisor
      && option.dominoNumber === advisor.dominoNumber
      && option.orientation === advisor.orientation
      && option.x === advisor.x
      && option.y === advisor.y
      && option.anchorEnd === advisor.anchorEnd);
  }

  #jumpToAdvisorPlacement() {
    if (!this.#isMyTurnToPlace()) return;
    const advisor = this.#advisorPlacementOption();
    if (!advisor) {
      this.#setCanvasNotice('No advisor placement available.', 'info', 1000);
      this.#syncLocalPlacementDock();
      return;
    }

    this.#localPlacementFocus = { x: advisor.x, y: advisor.y };
    this.#applyPlacementOption(advisor);
    this.#setCanvasNotice('');
    this.#renderGhost();
    this.#syncMobileActions();
    this.#syncLocalPlacementDock();
    this.#refreshHud();
  }

  #cycleLocalPlacement(delta) {
    if (!this.#isMyTurnToPlace()) return;
    const valid = this.#placementDockOptions();
    if (!valid.length) {
      this.#setCanvasNotice(this.#localPlacementFocus ? 'No moves for this spot.' : 'No valid moves.', 'info', 1000);
      this.#syncLocalPlacementDock();
      return;
    }

    const currentIndex = this.#currentPlacementOptionIndex(valid);
    const nextIndex = ((currentIndex < 0 ? 0 : currentIndex + delta) + valid.length) % valid.length;
    this.#applyPlacementOption(valid[nextIndex]);
    this.#setCanvasNotice('');
    this.#renderGhost();
    this.#syncMobileActions();
    this.#syncLocalPlacementDock();
    this.#refreshHud();
  }

  #clearPlacementSpotFocus() {
    if (!this.#localPlacementFocus) return;
    this.#localPlacementFocus = null;
    this.#setCanvasNotice('Showing all valid moves.', 'info', 900);
    this.#renderGhost();
    this.#syncMobileActions();
    this.#syncLocalPlacementDock();
    this.#refreshHud();
  }

  #syncLocalPlacementDock() {
    if (!this.#localPlacementDock) return;
    const canShow = this.#game?.state === GameState.PLACE
      && this.#isMyTurnToPlace()
      && !this.#game.isGameOver
      && !this.#isGameplayPausedForUndo();

    if (!canShow) {
      this.#hideLocalPlacementDock();
      return;
    }

    const valid = this.#placementDockOptions();
    if (!valid.length) {
      this.#hideLocalPlacementDock();
      return;
    }

    const currentIndex = this.#currentPlacementOptionIndex(valid);
    const index = currentIndex < 0 ? 0 : currentIndex;
    const currentOption = valid[index] ?? null;
    const advisor = this.#advisorPlacementOption();
    const isAdvisor = this.#isAdvisorPlacementOption(currentOption, advisor);
    this.#localPlacementDock.classList.toggle('isAdvisorPlacement', isAdvisor);
    this.#localPlacementLabel.textContent = `${isAdvisor ? 'Advisor ' : ''}${index + 1}/${valid.length}`;
    this.#btnLocalAdvisor.hidden = !this.#showAdvisor;
    this.#btnLocalAdvisor.disabled = !advisor || isAdvisor;
    this.#btnLocalPrev.disabled = valid.length <= 1;
    this.#btnLocalNext.disabled = valid.length <= 1;
    this.#btnLocalPlace.disabled = !this.#hoverAnchor || !this.#placementFeedbackForAnchor(this.#hoverAnchor).ok;
    this.#btnLocalClear.disabled = !this.#localPlacementFocus;
    this.#btnLocalClear.hidden = !this.#localPlacementFocus;
    const prevLabel = this.#localPlacementFocus ? 'Previous move for this spot' : 'Previous valid move';
    const nextLabel = this.#localPlacementFocus ? 'Next move for this spot' : 'Next valid move';
    this.#btnLocalPrev.title = prevLabel;
    this.#btnLocalPrev.setAttribute('aria-label', prevLabel);
    this.#btnLocalNext.title = nextLabel;
    this.#btnLocalNext.setAttribute('aria-label', nextLabel);

    this.#localPlacementDock.style.left = '';
    this.#localPlacementDock.style.top = '';
    this.#root?.classList.add('hasLocalPlacementDock');
    this.#localPlacementDock.hidden = false;
    this.#syncMobilePlacementStack();
  }

  #hideLocalPlacementDock() {
    if (!this.#localPlacementDock) return;
    this.#localPlacementDock.hidden = true;
    this.#localPlacementDock.classList.remove('isAdvisorPlacement');
    this.#localPlacementDock.style.left = '';
    this.#localPlacementDock.style.top = '';
    this.#root?.classList.remove('hasLocalPlacementDock');
    this.#syncMobilePlacementStack();
  }

  #repairSelectedPlacementAfterDominoChange() {
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return;

    const drafted = this.#currentPlacementDraftedTile();
    if (!drafted) return;

    if (this.#hoverAnchor && this.#placementFeedbackForAnchor(this.#hoverAnchor).ok) {
      this.#placementHint = '';
      this.#setCanvasNotice('');
      this.#sendPlacementPreview();
      return;
    }

    const previous = this.#hoverAnchor;
    const valid = this.#uniqueVisiblePlacementOptions(this.#currentPlacementOptions())
      .filter((option) =>
        option.dominoNumber === drafted.domino.number
        && option.orientation === drafted.domino.orientation
      );

    if (!valid.length) {
      if (previous) {
        this.#placementHint = 'No valid placement for this rotation.';
        this.#setCanvasNotice(this.#placementHint, 'error', 1300);
      }
      return;
    }

    const localValid = this.#localPlacementOptions(valid);
    if (localValid.length) {
      const currentIndex = this.#currentPlacementOptionIndex(localValid);
      const option = localValid[currentIndex >= 0 ? currentIndex : 0];
      this.#hoverAnchor = { x: option.x, y: option.y, anchorEnd: option.anchorEnd };
      this.#hoverAnchorAuto = false;
      this.#placementHint = '';
      this.#setCanvasNotice('');
      this.#sendPlacementPreview();
      this.#syncLocalPlacementDock();
      return;
    }

    valid.sort((a, b) => {
      if (!previous) return 0;
      const ad = Math.abs(a.x - previous.x) + Math.abs(a.y - previous.y);
      const bd = Math.abs(b.x - previous.x) + Math.abs(b.y - previous.y);
      if (ad !== bd) return ad - bd;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    this.#hoverAnchor = { x: valid[0].x, y: valid[0].y, anchorEnd: valid[0].anchorEnd };
    this.#hoverAnchorAuto = false;
    this.#localPlacementFocus = null;
    this.#placementHint = '';
    this.#setCanvasNotice('');
    this.#sendPlacementPreview();
  }

  #jumpToNextValidAnchor() {
    if (!this.#isMyTurnToPlace()) {
      this.#setCanvasNotice('It is not your turn to place.', 'info', 1100);
      return;
    }
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return;

    const activeIdx = this.#placementPlayerIndex();
    if (activeIdx != null) this.#focusedPlayerIndex = activeIdx;

    const allValid = this.#uniqueVisiblePlacementOptions(this.#currentPlacementOptions());
    if (!allValid.length) {
      this.#setCanvasNotice('No valid placements. Use Skip if available.', 'info', 1300);
      return;
    }

    const localValid = this.#localPlacementOptions(allValid);
    const valid = localValid.length ? localValid : allValid;
    const currentIndex = this.#currentPlacementOptionIndex(valid);
    const nextIndex = (currentIndex + 1) % valid.length;
    const next = valid[nextIndex];

    this.#applyPlacementOption(next);
    this.#setCanvasNotice('');
    this.#renderGhost();
    this.#centerOnFocusedBoard();
    this.#syncMobileActions();
    this.#syncLocalPlacementDock();
    this.#refreshHud();
  }

  #isCurrentHoverAnchorOccluded() {
    if (!this.#hoverAnchor) return false;

    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return false;

    const activeIdx = this.#placementPlayerIndex();
    if (activeIdx == null) return false;
    const board = g.players[activeIdx]?.board?.board;
    if (!board) return false;

    const anchor = this.#hoverAnchor;
    if (board[keyOf(anchor.x, anchor.y)]) return true;

    const feedback = this.#placementFeedbackForAnchor(anchor);
    return !feedback.ok && feedback.reason === 'Space occupied.';
  }

  #placementFeedbackForAnchor(anchor, playerIndex = this.#placementPlayerIndex()) {
    if (!anchor) return { ok: false, anchorEnd: DominoEnd.LEFT, reason: 'No placement selected.' };
    if (playerIndex == null) return { ok: false, anchorEnd: DominoEnd.LEFT, reason: 'No active placing player.' };
    if (anchor.anchorEnd) {
      const exact = this.#game.explainPlacementAtForPlayer?.(playerIndex, anchor.x, anchor.y, anchor.anchorEnd)
        ?? this.#game.explainCurrentPlacementAt(anchor.x, anchor.y, anchor.anchorEnd);
      if (exact.ok) return { ok: true, anchorEnd: anchor.anchorEnd, reason: '' };
      return { ...exact, anchorEnd: anchor.anchorEnd };
    }
    return this.#game.getPlacementFeedbackAtForPlayer?.(playerIndex, anchor.x, anchor.y)
      ?? this.#game.getPlacementFeedbackAt(anchor.x, anchor.y);
  }

  #withTemporaryPlacementSelection(playerIndex, dominoNumber, orientation, callback) {
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return null;
    if (playerIndex == null) return null;

    const choices = g.getCurrentPlacingChoicesForPlayer?.(playerIndex) ?? g.getCurrentPlacingChoices?.() ?? [];
    const previousNumber = g.currentPlacingDraftedTileForPlayer?.(playerIndex)?.domino.number
      ?? g.currentPlacingDraftedTile?.domino.number
      ?? null;
    const previousOrientations = choices.map((choice) => ({
      choice,
      orientation: choice.domino.orientation,
    }));

    try {
      const result = g.setPlacementSelectionForPlayer?.(playerIndex, dominoNumber, orientation)
        ?? g.setCurrentPlacementSelection(dominoNumber, orientation);
      if (!result?.ok) return null;
      const drafted = g.currentPlacingDraftedTileForPlayer?.(playerIndex) ?? g.currentPlacingDraftedTile;
      return callback(drafted);
    } finally {
      if (previousNumber != null) {
        if (typeof g.selectPlacementDominoForPlayer === 'function') {
          g.selectPlacementDominoForPlayer(playerIndex, previousNumber);
        } else {
          g.selectCurrentPlacementDomino(previousNumber);
        }
      }
      for (const previous of previousOrientations) {
        let guard = 0;
        while (previous.choice.domino.orientation !== previous.orientation && guard < 4) {
          previous.choice.domino.rotate();
          guard += 1;
        }
      }
    }
  }

  #renderOpponentPlacementPreview() {
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return false;

    let rendered = false;
    for (const [playerIndex, preview] of this.#remotePlacementPreviews) {
      if (playerIndex === this.#myPlayerIndex) continue;
      const hasPendingPlacement = (g.getCurrentPlacingChoicesForPlayer?.(playerIndex) ?? []).length > 0;
      if (!hasPendingPlacement) continue;
      if (this.#renderPlacementPreviewForPlayer(playerIndex, preview)) rendered = true;
    }
    return rendered;
  }

  #renderPlacementPreviewForPlayer(playerIndex, preview) {
    const g = this.#game;
    const board = g?.players[playerIndex]?.board?.board;
    if (!board || !preview) return false;

    return Boolean(this.#withTemporaryPlacementSelection(
      playerIndex,
      preview.dominoNumber,
      preview.orientation,
      (drafted) => {
        if (!drafted) return false;

        const anchor = { x: preview.x, y: preview.y, anchorEnd: preview.anchorEnd };
        const feedback = this.#placementFeedbackForAnchor(anchor, playerIndex);
        if (!feedback.ok) return false;

        const built = this.#buildProjectedBoard(board, drafted, anchor, feedback.anchorEnd);
        const other = built.other;
        const occupied = board[keyOf(anchor.x, anchor.y)] || board[keyOf(other.x, other.y)];
        const borderColor = occupied ? 0xff6b6b : this.#playerColorHex(playerIndex);
        const fillColor = this.#playerColorHex(playerIndex);
        const remoteOrigin = this.#boardOriginForPlayer(playerIndex);
        const remoteGroup = new THREE.Group();
        remoteGroup.position.set(
          remoteOrigin.x - this.#ghostGroup.position.x,
          0,
          remoteOrigin.z - this.#ghostGroup.position.z
        );
        this.#ghostGroup.add(remoteGroup);

        const makeGhostCell = (x, y, landscape, crowns, endName) => {
          const material = this.#getTileMaterial(landscape, crowns || 0, `remote|${drafted.domino.number}|${endName}`, true).clone();
          material.opacity = 0.66;
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.98, 0.18, 0.98),
            material
          );
          mesh.position.set(x, 0.10, y);
          remoteGroup.add(mesh);

          const wash = new THREE.Mesh(
            new THREE.PlaneGeometry(0.98, 0.98),
            new THREE.MeshBasicMaterial({
              color: fillColor,
              transparent: true,
              opacity: 0.14,
              depthWrite: false,
              side: THREE.DoubleSide,
            })
          );
          wash.rotation.x = -Math.PI / 2;
          wash.position.set(x, 0.202, y);
          remoteGroup.add(wash);

          const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 0.22, 1.01));
          const edgeMat = new THREE.LineBasicMaterial({ color: borderColor, transparent: true, opacity: 0.96 });
          const edge = new THREE.LineSegments(edgeGeo, edgeMat);
          edge.position.set(x, 0.11, y);
          remoteGroup.add(edge);

          if ((crowns || 0) > 0) {
            this.#addCrownStars(x, y, crowns, { target: remoteGroup, ghost: true });
          }
        };

        const leftCoord = feedback.anchorEnd === DominoEnd.LEFT ? anchor : other;
        const rightCoord = feedback.anchorEnd === DominoEnd.RIGHT ? anchor : other;

        makeGhostCell(leftCoord.x, leftCoord.y, drafted.domino.leftEnd.landscape, drafted.domino.leftEnd.crowns, 'left');
        makeGhostCell(rightCoord.x, rightCoord.y, drafted.domino.rightEnd.landscape, drafted.domino.rightEnd.crowns, 'right');
        return true;
      }
    ));
  }

  #renderPlacementReturnAnimations() {
    if (!this.#placementReturnAnimations.size || !this.#ghostGroup) return;
    const previousGroup = this.#currentTileRenderGroup;
    this.#currentTileRenderGroup = this.#ghostGroup;
    const now = performance.now();
    const ghostOriginX = this.#ghostGroup.position.x;
    const ghostOriginZ = this.#ghostGroup.position.z;

    for (const animation of this.#placementReturnAnimations.values()) {
      if (now - animation.startedAt > animation.duration + 180) continue;
      this.#addCanvasDraftDomino(animation.domino, animation.sourceWorldX - ghostOriginX, animation.sourceWorldZ - ghostOriginZ, {
        claimed: true,
        selected: true,
        playerIndex: animation.playerIndex,
        sourceLeftX: animation.sourceWorldX - ghostOriginX,
        sourceZ: animation.sourceWorldZ - ghostOriginZ,
        targetLeftX: animation.targetWorldX - ghostOriginX,
        targetZ: animation.targetWorldZ - ghostOriginZ,
        animationKey: animation.key,
        animationType: 'placementReturn',
        animationDuration: animation.duration,
        rotationY: animation.sourceRotationY,
        targetRotationY: 0,
      });
    }

    this.#currentTileRenderGroup = previousGroup;
  }

  #renderPlacementSkipAnimations() {
    if (!this.#placementSkipAnimations.size || !this.#ghostGroup) return;
    const previousGroup = this.#currentTileRenderGroup;
    this.#currentTileRenderGroup = this.#ghostGroup;
    const now = performance.now();
    const ghostOriginX = this.#ghostGroup.position.x;
    const ghostOriginZ = this.#ghostGroup.position.z;

    for (const [key, animation] of this.#placementSkipAnimations) {
      if (now - animation.startedAt > animation.duration + 140) {
        this.#placementSkipAnimations.delete(key);
        this.#draftClaimAnimationStartedAt.delete(key);
        continue;
      }
      const group = this.#addCanvasDraftDomino(animation.domino, animation.sourceWorldX - ghostOriginX, animation.sourceWorldZ - ghostOriginZ, {
        claimed: true,
        selected: true,
        playerIndex: animation.playerIndex,
        sourceLeftX: animation.sourceWorldX - ghostOriginX,
        sourceZ: animation.sourceWorldZ - ghostOriginZ,
        targetLeftX: animation.targetWorldX - ghostOriginX,
        targetZ: animation.targetWorldZ - ghostOriginZ,
        animationKey: animation.key,
        animationType: 'skipDiscard',
        animationDuration: animation.duration,
        rotationY: animation.sourceRotationY,
        targetRotationY: animation.sourceRotationY + 0.42,
      });
      this.#prepareObjectMaterialsForOpacity(group);
    }

    this.#currentTileRenderGroup = previousGroup;
  }

  #placementGhostAnimationCurrentPosition(animation, now = performance.now()) {
    if (!animation) return null;
    const progress = Math.max(0, Math.min(1, (now - animation.startedAt) / Math.max(1, animation.duration)));
    const eased = 1 - Math.pow(1 - progress, 3);
    return {
      x: animation.sourceX + (animation.targetX - animation.sourceX) * eased,
      z: animation.sourceZ + (animation.targetZ - animation.sourceZ) * eased,
    };
  }

  #placementGhostAnimationFor(playerIndex, drafted, leftCoord, rightCoord) {
    const boardOrigin = this.#boardOriginForPlayer(playerIndex);
    const targetX = leftCoord.x;
    const targetZ = leftCoord.y;
    const rightOffset = {
      x: rightCoord.x - leftCoord.x,
      y: rightCoord.y - leftCoord.y,
    };
    const key = [
      playerIndex,
      drafted.domino.number,
      drafted.domino.orientation,
      leftCoord.x,
      leftCoord.y,
      rightCoord.x,
      rightCoord.y,
    ].join('|');

    if (this.#placementGhostAnimation?.key === key) {
      return { animation: this.#placementGhostAnimation, rightOffset };
    }

    const previous = this.#placementGhostAnimation;
    let sourceX = targetX;
    let sourceZ = targetZ;
    if (
      previous
      && previous.playerIndex === playerIndex
      && previous.dominoNumber === drafted.domino.number
    ) {
      const current = this.#placementGhostAnimationCurrentPosition(previous);
      sourceX = current?.x ?? previous.targetX;
      sourceZ = current?.z ?? previous.targetZ;
    } else {
      const rackTarget = this.#canvasPlacementChoiceTargetForDomino(playerIndex, drafted.domino.number);
      if (rackTarget) {
        sourceX = rackTarget.leftX - boardOrigin.x;
        sourceZ = rackTarget.z - boardOrigin.z;
      }
    }

    this.#placementGhostAnimation = {
      key,
      playerIndex,
      dominoNumber: drafted.domino.number,
      startedAt: performance.now(),
      duration: 380,
      sourceX,
      sourceZ,
      targetX,
      targetZ,
    };
    return { animation: this.#placementGhostAnimation, rightOffset };
  }

  #renderGhost() {
    this.#perfCounters.renderGhost += 1;
    while (this.#ghostGroup.children.length) this.#ghostGroup.remove(this.#ghostGroup.children[0]);
    this.#canvasPlacementConfirmTarget = null;
    this.#syncBoardLayerPositions();
    if (this.#libraryOpen) return;

    const g = this.#game;
    const activeIdx = this.#placementPlayerIndex();
    if (this.#isMyTurnToPlace() && activeIdx != null && this.#focusedPlayerIndex !== activeIdx) {
      this.#focusedPlayerIndex = activeIdx;
    }
    this.#renderPlacementSkipAnimations();

    if (g.isGameOver) {
      this.#placementGhostAnimation = null;
      this.#placementReturnAnimations.clear();
      this.#renderRegionScoring(null);
      this.#syncLocalPlacementDock();
      return;
    }
    if (g.state !== GameState.PLACE) {
      this.#placementGhostAnimation = null;
      this.#placementReturnAnimations.clear();
      this.#renderRegionScoring(null);
      this.#syncLocalPlacementDock();
      return;
    }
    this.#refreshCanvasPlacementChoices();
    this.#renderPlacementReturnAnimations();
    if (!this.#isMyTurnToPlace()) {
      this.#placementGhostAnimation = null;
      this.#renderRegionScoring(null);
      this.#renderOpponentPlacementPreview();
      this.#syncLocalPlacementDock();
      return;
    }

    const drafted = this.#currentPlacementDraftedTile();
    if (!drafted) {
      this.#placementGhostAnimation = null;
      this.#renderRegionScoring(null);
      this.#renderOpponentPlacementPreview();
      this.#syncLocalPlacementDock();
      return;
    }

    const placementBoard = g.players[activeIdx]?.board?.board || g.players[0].board.board;

    if (this.#hoverAnchorAuto && this.#isCurrentHoverAnchorOccluded()) {
      this.#hoverAnchor = null;
      this.#localPlacementFocus = null;
      this.#hoverAnchorAuto = false;
      this.#placementGhostAnimation = null;
      this.#sendPlacementPreview(true);
    }

    if (!drafted) {
      this.#placementGhostAnimation = null;
      this.#renderRegionScoring(null);
      this.#renderOpponentPlacementPreview();
      this.#syncLocalPlacementDock();
      return;
    }

    this.#renderValidAnchorHighlights(this.#currentPlacementOptions());

    const anchor = this.#hoverAnchor;
    if (!anchor) {
      this.#placementGhostAnimation = null;
      this.#renderRegionScoring(null);
      this.#renderOpponentPlacementPreview();
      this.#syncLocalPlacementDock();
      return;
    }
    const feedback = this.#placementFeedbackForAnchor(anchor);
    const ghostAnchorEnd = feedback.ok ? feedback.anchorEnd : DominoEnd.LEFT;

    const built = this.#buildProjectedBoard(placementBoard, drafted, anchor, ghostAnchorEnd);
    const other = built.other;

    const board = placementBoard;
    const occupied = board[keyOf(anchor.x, anchor.y)] || board[keyOf(other.x, other.y)];
    const valid = feedback.ok;

    const borderColor = valid && !occupied ? 0x8cff9b : 0xff6b6b;

    const leftCoord = ghostAnchorEnd === DominoEnd.LEFT ? anchor : other;
    const rightCoord = ghostAnchorEnd === DominoEnd.RIGHT ? anchor : other;
    const { animation, rightOffset } = this.#placementGhostAnimationFor(activeIdx, drafted, leftCoord, rightCoord);
    const ghostTileGroup = new THREE.Group();
    ghostTileGroup.position.set(animation.sourceX, 0, animation.sourceZ);
    this.#ghostGroup.add(ghostTileGroup);

    const makeGhostCell = (x, y, landscape, crowns) => {
      const material = this.#getTileMaterial(landscape, crowns || 0, `${x},${y}`, true);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.18, 0.98),
        material
      );
      mesh.position.set(x, 0.09, y);
      ghostTileGroup.add(mesh);

      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.99, 0.20, 0.99));
      const edgeMat = new THREE.LineBasicMaterial({ color: borderColor, transparent: true, opacity: 0.98 });
      const edge = new THREE.LineSegments(edgeGeo, edgeMat);
      edge.position.set(x, 0.09, y);
      ghostTileGroup.add(edge);

      if ((crowns || 0) > 0) {
        this.#addCrownStars(x, y, crowns, { target: ghostTileGroup, ghost: true });
      }
    };

    makeGhostCell(0, 0, drafted.domino.leftEnd.landscape, drafted.domino.leftEnd.crowns);
    makeGhostCell(rightOffset.x, rightOffset.y, drafted.domino.rightEnd.landscape, drafted.domino.rightEnd.crowns);
    this.#registerAnimatedObject(ghostTileGroup, 'placementGhost', {
      targetPosition: new THREE.Vector3(animation.targetX, 0, animation.targetZ),
      startedAt: animation.startedAt,
      duration: animation.duration,
    });

    if (valid && !occupied) {
      const markerX = rightOffset.x / 2;
      const markerZ = rightOffset.y / 2;
      const confirmGroup = new THREE.Group();
      confirmGroup.position.set(animation.targetX + markerX, 0.94, animation.targetZ + markerZ);
      this.#ghostGroup.add(confirmGroup);

      const confirmSprite = createConfirmButtonSprite();
      confirmGroup.add(confirmSprite);

      this.#canvasPlacementConfirmTarget = {
        object: confirmSprite,
        radiusWorld: 0.34,
      };
    }

    if (this.#showPlacementScores && valid && !occupied) this.#renderRegionScoring(built.projected);
    else this.#renderRegionScoring(null);
    this.#renderOpponentPlacementPreview();
    this.#syncLocalPlacementDock();
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

    this.#syncStartAttractCamera();
    this.#updateCameraTransition();
    this.#syncBoardLayerPositions();

    if (this.#controls) this.#controls.update();
    this.#syncGridPresentation();
    this.#updateAnimatedObjects();
    this.#updateScoreBurstAnimations();
    if (this.#renderer && this.#scene && this.#camera) this.#renderer.render(this.#scene, this.#camera);
    requestAnimationFrame(this.#tick);
  };
}
