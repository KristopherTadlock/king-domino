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

  // Base tabletop tone. Keep it organic, but avoid regular seams that can
  // accidentally read as a second gameplay grid.
  const isBack = layer === 'back';
  const top = isBack
    ? (debug ? '#876949' : '#735838')
    : (debug ? '#bd9664' : '#9d7848');
  const bottom = isBack
    ? (debug ? '#6d5234' : '#5d4529')
    : (debug ? '#977142' : '#785632');
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
      ? `rgba(255,226,172,${0.035 + rand() * 0.05})`
      : `rgba(50,30,12,${0.035 + rand() * 0.045})`);
    cloud.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cloud;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // Short, broken fibers suggest a tabletop/mat surface while avoiding any
  // repeated alignment with the kingdom grid.
  ctx.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = size * (0.012 + rand() * 0.045);
    const angle = -0.70 + rand() * 1.40;
    const alpha = isBack ? 0.025 + rand() * 0.045 : 0.035 + rand() * 0.065;
    const light = rand() > 0.58;
    ctx.strokeStyle = light
      ? `rgba(255,232,190,${alpha})`
      : `rgba(45,28,12,${alpha})`;
    ctx.lineWidth = 0.7 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
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

  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.24, size / 2, size / 2, size * 0.76);
  vignette.addColorStop(0, 'rgba(255,255,255,0.02)');
  vignette.addColorStop(1, 'rgba(22,12,5,0.16)');
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
  #btnRestart;
  #mobileActions;
  #btnMobileRotate;
  #btnMobileSkip;
  #btnMobileUndo;
  #btnMobileNext;
  #btnMobilePlace;
  #localPlacementDock;
  #btnLocalClear;
  #btnLocalPrev;
  #btnLocalNext;
  #btnLocalPlace;
  #localPlacementLabel;
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

  /** @type {string | null} */
  #autoDraftInFlightKey = null;

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
  #libraryOpen = false;

  /** @type {string | null} */
  #libraryFilter = null;

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
  /** @type {THREE.Group | null} */
  #currentTileRenderGroup = null;

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

  /** @type {boolean} */
  #hoverAnchorAuto = false;

  /** @type {{x:number,y:number,t:number} | null} */
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

  #boardOriginForPlayer(playerIndex = 0) {
    const count = Math.max(1, this.#game?.players?.length ?? 2);
    const spacing = 18;
    const idx = Math.max(0, Math.min(playerIndex ?? 0, count - 1));

    if (count === 1) return { x: 0, z: 0 };
    if (count === 2) return { x: idx === 0 ? -spacing / 2 : spacing / 2, z: 0 };
    if (count === 3) {
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
      ? this.#game.currentPlacingPlayerIndex
      : this.#focusedPlayerIndex;
    return this.#boardOriginForPlayer(idx ?? this.#focusedPlayerIndex);
  }

  #addTileObjects(...objects) {
    const group = this.#currentTileRenderGroup || this.#tilesGroup;
    group.add(...objects);
  }

  #frameToBoardSize(boardSize, pad = 2, origin = { x: 0, z: 0 }, animate = false) {
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
    this.#viewSize = Math.max(this.#viewSizeForBoardSize(boardSize), neededVertical);

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

  connectedCallback() {
    this.#buildDom();
    this.#libraryOpen = new URL(location.href).searchParams.get('library') === '1';
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
        top: 76px;
        right: 12px;
        min-width: 160px;
      }
      .root.isLibraryMode .controlsSecondary {
        top: 130px;
        right: 12px;
        min-width: 160px;
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
        top: 78px;
        right: 12px;
        display: flex;
        gap: 6px;
        flex-direction: column;
        align-items: stretch;
        min-width: 104px;
        padding: 8px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(20,22,28,0.72);
        backdrop-filter: blur(8px);
        z-index: 5;
      }
      .controlsTertiary {
        position: absolute;
        top: 72px;
        right: 82px;
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
      .draftList {
        margin-top: 6px;
        display: grid;
        grid-template-columns: 1fr;
        gap: 3px;
      }
      .draftItem {
        box-sizing: border-box;
        width: 100%;
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
        justify-content: flex-end;
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
          top: 74px;
          right: 8px;
          min-width: 96px;
          padding: 6px;
        }
        .controlsTertiary {
          top: 64px;
          right: 58px;
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
          gap: 3px;
        }
        .draftItem {
          min-width: 0;
          grid-template-columns: 28px max-content 28px;
          min-height: 50px;
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
          top: 78px;
          left: 8px;
          bottom: auto;
          max-width: calc(100vw - 78px);
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
          width: min(310px, calc(52vw - 8px));
          max-height: min(44dvh, 380px);
          padding: 8px;
          border-radius: 12px;
          right: auto;
        }
        .miniMapDock {
          top: auto;
          right: 8px;
          bottom: 8px;
          left: auto;
          box-sizing: border-box;
          width: min(230px, calc(48vw - 10px));
          max-width: 230px;
          max-height: min(44dvh, 380px);
          padding: 6px;
          overflow: auto;
        }
        .miniRow {
          display: grid;
          grid-template-columns: 1fr;
          gap: 6px;
          overflow: visible;
        }
        .miniCard {
          min-width: 0;
          justify-items: center;
          padding: 8px;
          gap: 4px;
        }
        .miniTitle {
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11px;
        }
        canvas.mini {
          width: min(140px, calc(48vw - 46px));
          height: min(140px, calc(48vw - 46px));
        }
      }
      @media (max-width: 520px) {
        .miniMapDock {
          top: 78px;
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
    this.#localPlacementDock.append(this.#btnLocalClear, this.#btnLocalPrev, this.#localPlacementLabel, this.#btnLocalNext, this.#btnLocalPlace);

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
    this.#btnMore.textContent = 'More';
    this.#btnMore.className = 'secondaryAction iconAction';
    this.#btnLibrary = document.createElement('button');
    this.#btnLibrary.textContent = 'Domino Library';
    this.#btnLibrary.className = 'secondaryAction';
    this.#btnRestart = document.createElement('button');
    this.#btnRestart.textContent = 'Restart';
    this.#btnRestart.className = 'secondaryAction destructiveAction';
    this.#primaryControlsRow.append(this.#btnNextValid, this.#btnPlace);
    this.#secondaryControlsRow.append(this.#btnRotate, this.#btnResetTile, this.#btnScores, this.#btnCenter, this.#btnSkip, this.#btnMore);
    this.#tertiaryControlsRow.hidden = true;
    this.#tertiaryControlsRow.append(this.#btnLibrary, this.#btnUndoRequest, this.#btnRestart);

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

    this.#hud.append(this.#hudBody);
    this.#root.append(this.#canvasHost, this.#canvasTurn, this.#canvasNotice, this.#mobileActions, this.#localPlacementDock, this.#topBar, this.#hud, this.#miniMapDock, this.#primaryControlsRow, this.#secondaryControlsRow, this.#tertiaryControlsRow, this.#endOverlay);
    this.#shadow.append(style, this.#root);
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
        this.#autoResolveForcedDraft();
      },
      onPlayers: (players) => {
        this.#playerNames = players?.length ? players : this.#playerNames;
        this.#refreshHud();
        this.#ensureMiniMaps();
        this.#renderMiniMaps();
      },
      onAction: (action) => {
        const previousState = this.#game?.state;
        this.#actionHistory.push(action);
        this.#applyNetworkAction(action);
        const focusChanged = this.#syncFocusedBoardToPhase();
        const phaseChanged = previousState != null && previousState !== this.#game?.state;
        this.#refreshHud();
        this.#renderBoard();
        this.#renderGhost();
        if (focusChanged || phaseChanged || action.type === 'place' || action.type === 'skip' || action.type === 'restart') {
          this.#centerOnFocusedBoard(focusChanged || phaseChanged);
        }
        this.#autoResolveForcedDraft();
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
    const previousState = this.#game?.state;
    this.#actionHistory.push(action);
    this.#applyNetworkAction(action);
    this.#syncHotseatPlayerIndex();
    const focusChanged = this.#syncFocusedBoardToPhase();
    const phaseChanged = previousState != null && previousState !== this.#game?.state;
    this.#refreshHud();
    this.#renderBoard();
    this.#renderGhost();
    if (focusChanged || phaseChanged || action.type === 'place' || action.type === 'skip' || action.type === 'restart') {
      this.#centerOnFocusedBoard(focusChanged || phaseChanged);
    }
    this.#renderMiniMaps();
    this.#autoResolveForcedDraft();
  }

  #autoResolveForcedDraft() {
    if (!this.#game || this.#game.isGameOver || this.#game.state !== GameState.DRAFT) {
      this.#autoDraftInFlightKey = null;
      return;
    }
    if (this.#pendingUndoRequest || !this.#isMyTurnToPick()) return;

    const available = this.#game.currentDraft
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.player == null);
    if (available.length !== 1) {
      this.#autoDraftInFlightKey = null;
      return;
    }

    const index = available[0].index;
    const key = `${this.#game.round}:${this.#game.pickCursor}:${this.#game.currentPickingPlayerIndex}:${index}`;
    if (this.#autoDraftInFlightKey === key) return;

    this.#autoDraftInFlightKey = key;
    this.#setCanvasNotice('Only one draft tile remains. Picking it automatically.', 'info', 1200);
    this.#mp?.sendAction('pickDraft', { index, auto: true });
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
      if ((action.type === 'rotate' || action.type === 'selectPlacementTile') && !this.#isApplyingPlacementOption) {
        this.#repairSelectedPlacementAfterDominoChange();
      } else if (action.type === 'pickDraft' || action.type === 'place' || action.type === 'skip' || action.type === 'restart') {
        this.#hoverAnchor = null;
        this.#localPlacementFocus = null;
        this.#hoverAnchorAuto = false;
      }
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
    const drafted = this.#game.currentPlacingDraftedTile;
    const show = false;
    this.#mobileActions.classList.toggle('show', show);
    if (!show) {
      this.#btnMobilePlace.textContent = 'Place';
      return;
    }

    const canAct = !!drafted && !this.#isGameplayPausedForUndo();
    const canSkip = canAct && this.#game.canSkipCurrentPlacement();
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
        this.#drawIsoTile(ctx, p.tile, p.x + ox, p.y + oy, tileW, tileH, depth, `preview|${domino.number}|${p.x}|${p.y}`);
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
    const choice = this.#game.getCurrentPlacingChoices?.()
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
      const selectedDominoNumber = this.#game.currentPlacingDraftedTile?.domino.number;
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
      new THREE.PlaneGeometry(42, 24),
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

    const planeGeo = new THREE.PlaneGeometry(54, 34);
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
      this.#moreOpen = false;
      this.#mp?.sendAction('restart', { seed });
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
      this.#mp?.sendAction('rotate');
    }
  };

  #onPointerMove(e) {
    if (this.#libraryOpen) return;
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
    if (this.#libraryOpen) return;
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
      this.#pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }

    this.#pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  #onPointerUp(e) {
    if (this.#libraryOpen) return;
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
    const rect = this.#renderer.domElement.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    this.#pointer.x = ((clientX - rect.left) / w) * 2 - 1;
    this.#pointer.y = -(((clientY - rect.top) / h) * 2 - 1);
    this.#raycaster.setFromCamera(this.#pointer, this.#camera);
    const hits = this.#raycaster.intersectObject(this.#boardPlane);
    if (!hits.length) return null;
    const p = hits[0].point;
    const origin = this.#placementBoardOrigin();
    return { x: Math.round(p.x - origin.x), y: Math.round(p.z - origin.z) };
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
    const feedback = this.#game.getPlacementFeedbackAt(grid.x, grid.y);
    if (!feedback.ok) {
      const selectedDominoNumber = this.#game.currentPlacingDraftedTile?.domino.number;
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

  #setLibraryOpen(open) {
    this.#libraryOpen = Boolean(open);
    if (!this.#libraryOpen) this.#libraryFilter = null;
    this.#moreOpen = this.#libraryOpen ? true : this.#moreOpen;
    this.#hoverAnchor = null;
    this.#localPlacementFocus = null;
    this.#hoverAnchorAuto = false;
    this.#setCanvasNotice('');
    const url = new URL(location.href);
    if (this.#libraryOpen) url.searchParams.set('library', '1');
    else url.searchParams.delete('library');
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
    this.#renderBoard();
    this.#refreshHud();
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
    const activePlacingNumber = this.#game?.currentPlacingDraftedTile?.domino?.number ?? null;

    for (const domino of DominoPoolManager.getStartingDominoPool()) {
      result.set(domino.number, remaining.has(domino.number)
        ? { kind: 'deck', label: 'Deck', color: 0x7b8491 }
        : { kind: 'played', label: 'Played', color: 0x5b6170 });
    }

    for (const slot of this.#game?.currentDraft ?? []) {
      const number = slot.domino.number;
      if (slot.player == null) {
        result.set(number, { kind: 'available', label: 'Pick', color: 0xffd76a });
        continue;
      }

      const ownerName = this.#playerNames[slot.player] ?? this.#game?.players?.[slot.player]?.name ?? `P${slot.player + 1}`;
      const ownerColor = this.#playerColorHex(slot.player);
      if (slot.placed) {
        result.set(number, { kind: 'played-current', label: ownerName, color: ownerColor, playerIndex: slot.player });
      } else if (this.#game?.state === GameState.PLACE && number === activePlacingNumber) {
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

  #refreshHud() {
    const g = this.#game;
    this.#root?.classList.toggle('isLibraryMode', this.#libraryOpen);
    this.#syncHotseatPlayerIndex();
    this.#syncMobilePanelForPhase();
    if (this.#libraryOpen) {
      this.#hudTitle.textContent = 'Domino Library';
      this.#hudBody.innerHTML = '';
      if (this.#endOverlay) this.#endOverlay.hidden = true;
      if (this.#miniMapDock) this.#miniMapDock.hidden = true;
      if (this.#canvasTurn) this.#canvasTurn.classList.remove('show');
      if (this.#mobileActions) this.#mobileActions.classList.remove('show');
      if (this.#localPlacementDock) this.#localPlacementDock.hidden = true;
      this.#primaryControlsRow.hidden = true;
      this.#secondaryControlsRow.hidden = false;
      this.#tertiaryControlsRow.hidden = false;
      this.#btnRotate.hidden = true;
      this.#btnResetTile.hidden = true;
      this.#btnScores.hidden = true;
      this.#btnSkip.hidden = true;
      this.#btnUndoRequest.hidden = true;
      this.#btnRestart.hidden = true;
      this.#btnMore.hidden = true;
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
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'libraryStat libraryFilter';
        row.classList.toggle('active', this.#libraryFilter === item.kind);
        row.setAttribute('aria-pressed', this.#libraryFilter === item.kind ? 'true' : 'false');
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
        row.addEventListener('click', () => this.#setLibraryFilter(item.kind));
        lifecycle.append(row);
      }

      const stats = document.createElement('div');
      stats.className = 'libraryStats';
      for (const item of this.#dominoLibraryStats()) {
        const row = document.createElement('div');
        row.className = 'libraryStat';
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
        stats.append(row);
      }

      summary.append(kicker, copy, lifecycle, stats);
      this.#hudBody.append(summary);
      return;
    }
    if (this.#miniMapDock) this.#miniMapDock.hidden = false;
    this.#btnMore.hidden = false;
    this.#btnLibrary.textContent = 'Domino Library';

    const standings = g.players
      .map((p, i) => ({
        index: i,
        name: this.#playerNames[i] ?? p.name ?? `Player ${i + 1}`,
        score: p.board.score,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const playerScores = g.players
      .map((p, i) => `${this.#playerNames[i] ?? p.name}: ${p.board.score}`)
      .join(' · ');
    const titleActiveIdx = this.#activePlayerIndex();
    const titleActiveName = titleActiveIdx == null
      ? ''
      : this.#playerNames[titleActiveIdx] ?? g.players[titleActiveIdx]?.name ?? `P${titleActiveIdx + 1}`;
    const titlePhase = g.state === GameState.DRAFT ? 'picking' : 'placing';

    this.#hudTitle.textContent = g.isGameOver
      ? 'End of Game'
      : `Round ${g.round} — ${titleActiveName} ${titlePhase} · ${playerScores}`;
    this.#root?.classList.toggle('isDraftPhase', g.state === GameState.DRAFT && !g.isGameOver);
    this.#root?.classList.toggle('isPlacementPhase', g.state === GameState.PLACE && !g.isGameOver);
    if (this.#hud) this.#hud.hidden = g.isGameOver;
    if (this.#endOverlay) this.#endOverlay.hidden = !g.isGameOver;

    const canPlaceUi = this.#isMyTurnToPlace() && !g.isGameOver && !!g.currentPlacingDraftedTile && !this.#isGameplayPausedForUndo();
    const placementOptions = canPlaceUi ? this.#uniqueVisiblePlacementOptions(g.getCurrentPlacementOptions?.() ?? []) : [];
    const hasPlacementOptions = placementOptions.length > 0;
    const canRequestUndo = !g.isGameOver && this.#myPlayerIndex != null && !!this.#latestUndoablePlaceAction() && !this.#pendingUndoRequest;
    const canSkip = canPlaceUi && g.canSkipCurrentPlacement();
    const isPlacementPhase = g.state === GameState.PLACE && !g.isGameOver;
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
    this.#btnRestart.hidden = false;
    this.#btnScores.disabled = !canPlaceUi;
    this.#btnScores.hidden = !isPlacementPhase || canSkip;
    this.#btnScores.classList.toggle('active', this.#showPlacementScores);
    this.#btnScores.textContent = this.#showPlacementScores ? 'Preview On' : 'Score Preview';
    this.#btnMore.classList.toggle('active', this.#moreOpen);
    this.#btnMore.textContent = this.#moreOpen ? 'Close' : 'More';
    if (canSkip && this.#btnSkip.parentElement !== this.#primaryControlsRow) {
      this.#primaryControlsRow.prepend(this.#btnSkip);
    } else if (!canSkip && this.#btnSkip.parentElement !== this.#secondaryControlsRow) {
      this.#secondaryControlsRow.insertBefore(this.#btnSkip, this.#btnMore);
    }
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
        actions.append(inspect);

        card.append(kicker, title, summary, rank, actions);
        this.#endOverlay.append(card);
      }

      this.#renderMiniMaps();
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

    const status = document.createElement('div');
    status.className = 'muted';
    if (g.state === GameState.DRAFT) {
      this.#placementHint = '';
      this.#hoverAnchor = null;
      this.#hoverAnchorAuto = false;
      this.#setCanvasNotice('');
      status.textContent = `Draft — ${this.#playerNames[g.currentPickingPlayerIndex] ?? g.players[g.currentPickingPlayerIndex].name} picking`;
      this.#hudBody.append(status);

      const nextOrderByNumber = [...g.currentDraft]
        .sort((a, b) => a.domino.number - b.domino.number);
      const nextSlotByDominoNumber = new Map(
        nextOrderByNumber.map((slot, i) => [slot.domino.number, i + 1])
      );
      const pickOrder = g.pickOrder ?? [];
      const pickedCount = g.pickCursor ?? g.currentDraft.filter((slot) => slot.player != null).length;

      const list = document.createElement('div');
      list.className = 'draftList';
      g.currentDraft.forEach((slot, idx) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'draftItem';
        item.classList.toggle('isPicked', slot.player != null);

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
        item.setAttribute(
          'aria-label',
          `Domino ${slot.domino.number}, ${statusLabel}. ${landscapeLabel(slot.domino.leftEnd.landscape)} with ${slot.domino.leftEnd.crowns || 0} crowns and ${landscapeLabel(slot.domino.rightEnd.landscape)} with ${slot.domino.rightEnd.crowns || 0} crowns.`
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

        item.append(turnSlot, preview, claimSlot);

        item.disabled = slot.player != null || !this.#isMyTurnToPick() || this.#isGameplayPausedForUndo();
        item.addEventListener('click', () => {
          if (!this.#isMyTurnToPick()) return;
          if (this.#isGameplayPausedForUndo()) return;
          this.#mp?.sendAction('pickDraft', { index: idx });
        });

        list.append(item);
      });
      this.#hudBody.append(list);
    } else {
      const drafted = g.currentPlacingDraftedTile;
      if (drafted) {
        const choices = g.getCurrentPlacingChoices();
        if (choices.length > 0) {
          const chooser = document.createElement('div');
          chooser.className = 'placementChoices';
          chooser.style.setProperty('--player-color', this.#playerMiniMapColor(g.currentPlacingPlayerIndex, 0.95));
          chooser.style.setProperty('--player-color-soft', this.#playerMiniMapColor(g.currentPlacingPlayerIndex, 0.30));
          chooser.style.setProperty('--player-color-glow', this.#playerMiniMapColor(g.currentPlacingPlayerIndex, 0.24));

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
              if (n === this.#game.currentPlacingDraftedTile?.domino.number) return;
              this.#mp?.sendAction('selectPlacementTile', { dominoNumber: n });
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

    this.#renderMiniMaps();
    this.#syncMobileActions();
    this.#syncMobilePlacementStack();
  }

  #renderBoard() {
    while (this.#tilesGroup.children.length) this.#tilesGroup.remove(this.#tilesGroup.children[0]);
    if (this.#libraryOpen) {
      this.#renderDominoLibraryScene();
      return;
    }

    const players = this.#game?.players ?? [];
    const focusedPlayerIndex = Math.max(0, Math.min(this.#focusedPlayerIndex, players.length - 1));
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
      this.#addPlayerPlayArea(playerIndex, playerIndex === focusedPlayerIndex);

      for (const k of Object.keys(board)) {
        const tile = board[k];
        const tileSeedKey = `${playerIndex}|${k}|${tile.x},${tile.y}`;
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

    this.#syncBoardLayerPositions();
    this.#renderRegionScoring(null);
  }

  #renderDominoLibraryScene() {
    if (this.#ghostGroup) {
      while (this.#ghostGroup.children.length) this.#ghostGroup.remove(this.#ghostGroup.children[0]);
    }
    if (this.#regionOverlayGroup) {
      while (this.#regionOverlayGroup.children.length) this.#regionOverlayGroup.remove(this.#regionOverlayGroup.children[0]);
    }

    const deck = DominoPoolManager.getStartingDominoPool();
    const statusByNumber = this.#dominoLibraryStatusByNumber();
    const group = new THREE.Group();
    group.userData.library = true;
    this.#tilesGroup.add(group);

    const previousGroup = this.#currentTileRenderGroup;
    this.#currentTileRenderGroup = group;

    const cols = 6;
    const cellX = 2.55;
    const cellZ = 1.55;
    const rows = Math.ceil(deck.length / cols);
    const xOffset = -((cols - 1) * cellX + 1) / 2;
    const zOffset = -((rows - 1) * cellZ) / 2;

    deck.forEach((domino, i) => {
      const status = statusByNumber.get(domino.number) ?? { kind: 'played', label: 'Played', color: 0x5b6170 };
      const filtered = !!this.#libraryFilter && status.kind !== this.#libraryFilter;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const baseX = xOffset + col * cellX;
      const baseZ = zOffset + row * cellZ;
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
      const baseOpacity = filtered
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

      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(2.12, 0.026, 0.070),
        new THREE.MeshStandardMaterial({
          color: filtered ? 0x252a32 : statusColor,
          roughness: 0.42,
          metalness: 0.18,
          emissive: filtered ? 0x000000 : statusColor,
          emissiveIntensity: filtered ? 0 : ['available', 'placing', 'claimed'].includes(status.kind) ? 0.16 : 0.05,
        })
      );
      rail.position.set(baseX + 0.5, 0.244, baseZ + 0.64);
      this.#addTileObjects(rail);

      for (const [endName, tile] of [['left', left], ['right', right]]) {
        const seedKey = `library|${domino.number}|${endName}`;
        const material = this.#getTileMaterial(tile.landscape, tile.crowns || 0, seedKey, false);
        const tileMesh = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.22, 0.98), material);
        if (filtered) {
          tileMesh.material = material.clone();
          tileMesh.material.color = new THREE.Color(0x535861);
          tileMesh.material.transparent = true;
          tileMesh.material.opacity = 0.34;
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
    });

    this.#currentTileRenderGroup = previousGroup;
    this.#syncBoardLayerPositions();
    this.#renderRegionScoring(null);
  }

  #addPlayerPlayArea(playerIndex, focused = false) {
    const size = 8.8;
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        color: this.#playerColorHex(playerIndex),
        transparent: true,
        opacity: focused ? 0.070 : 0.038,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -0.055;
    this.#addTileObjects(pad);
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
    return mulberry32(hash32(`${tag}|${seedKey}|${tile.x},${tile.y}|${landscapeKey(tile.landscape)}|${tile.crowns || 0}`));
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
      color: 0x2c2430,
      roughness: 0.52,
      metalness: 0.18,
      emissive: 0x231604,
      emissiveIntensity: ghost ? 0.08 : 0.16,
      transparent: true,
      opacity: ghost ? 0.68 : 0.94,
    });
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffd76a,
      roughness: 0.30,
      metalness: 0.64,
      emissive: 0x7a4d08,
      emissiveIntensity: ghost ? 0.16 : 0.30,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: ghost ? 0.76 : 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.030, 0.21), plaqueMat);
    plaque.position.set(x + 0.27, ghost ? 0.205 : 0.245, y - 0.30);
    plaque.rotation.y = -0.08;
    add(plaque);

    const starGeometry = createStarShapeGeometry(0.052, 0.023);
    const offsets = count === 1 ? [0] : count === 2 ? [-0.055, 0.055] : [-0.078, 0, 0.078];
    for (const offset of offsets) {
      const star = new THREE.Mesh(starGeometry, starMat);
      star.position.set(x + 0.27 + offset, ghost ? 0.224 : 0.266, y - 0.30);
      star.rotation.x = -Math.PI / 2;
      star.rotation.z = -0.10;
      add(star);
    }
  }

  #addWaterFish(x, y, dx, dz, angle, scale, bodyMat, tailMat) {
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
    }

    this.#addTileObjects(turtle);
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

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.030 * scale, 9, 7), headMat);
    head.scale.set(0.94, 0.82, 1.08);
    head.position.set(0.088 * scale, 0.300, 0);
    sheep.add(head);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.010 * scale, 0.024 * scale, 5), headMat);
      ear.position.set(0.091 * scale, 0.324, side * 0.020 * scale);
      ear.rotation.x = side * 0.55;
      ear.rotation.z = Math.PI / 2;
      sheep.add(ear);
    }

    for (const [lx, lz] of [
      [-0.042, -0.030],
      [-0.042, 0.030],
      [0.042, -0.030],
      [0.042, 0.030],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.010 * scale, 0.043 * scale, 0.010 * scale), headMat);
      leg.position.set(lx * scale, 0.246, lz * scale);
      sheep.add(leg);
    }

    this.#addTileObjects(sheep);
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
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.74, metalness: 0.03 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2c8b4d, roughness: 0.68, metalness: 0.02 });
        const deepLeafMat = new THREE.MeshStandardMaterial({ color: 0x155a32, roughness: 0.72, metalness: 0.02 });
        const lightMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, roughness: 0.34, metalness: 0.42, emissive: 0x7d4a08, emissiveIntensity: 0.28 });
        addCyl(0.036, 0.052, 0.35, 9, trunkMat, 0, 0.22 + 0.35 / 2, 0);
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.17, 13, 9), leafMat);
        canopy.scale.set(1.10, 0.82, 1.02);
        canopy.position.set(0, 0.62, 0);
        group.add(canopy);
        for (const [dx, dz, s] of [[-0.10, 0.04, 0.72], [0.11, 0.02, 0.66], [0.02, -0.10, 0.58]]) {
          const cluster = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 11, 8), deepLeafMat);
          cluster.scale.set(1.12, 0.76, 0.96);
          cluster.position.set(dx, 0.58 + s * 0.08, dz);
          group.add(cluster);
        }
        addBox(0.18, 0.026, 0.14, trunkMat, 0.02, 0.46, -0.02);
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.026, 9, 7), lightMat);
        lantern.position.set(0.11, 0.48, -0.03);
        group.add(lantern);
        break;
      }
      case Landscapes.WHEAT: {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a6635, roughness: 0.70, metalness: 0.04 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x7d3f22, roughness: 0.64, metalness: 0.08 });
        const grainMat = new THREE.MeshStandardMaterial({ color: 0xf1c452, roughness: 0.70, metalness: 0.04, emissive: 0x3b2104, emissiveIntensity: 0.06 });
        const paleMat = new THREE.MeshStandardMaterial({ color: 0xffe7a1, roughness: 0.58, metalness: 0.04 });
        if (crowns >= 2) {
          const tower = addCyl(0.060, 0.085, 0.34, 10, woodMat, 0, 0.22 + 0.17, 0);
          tower.rotation.y = rand() * Math.PI;
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.095, 4), roofMat);
          roof.rotation.y = Math.PI / 4;
          roof.position.set(0, 0.62, 0);
          group.add(roof);
          const hub = new THREE.Mesh(new THREE.SphereGeometry(0.027, 9, 7), paleMat);
          hub.position.set(0.065, 0.51, -0.072);
          group.add(hub);
          for (const [sx, sy, rz] of [[0.11, 0.014, 0], [0.014, 0.11, Math.PI / 2]]) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.010, sy), paleMat);
            blade.position.copy(hub.position);
            blade.rotation.y = -Math.PI / 4;
            blade.rotation.z = rz;
            group.add(blade);
          }
          addBox(0.17, 0.074, 0.12, grainMat, -0.16, 0.26, 0.09, 0.18);
        } else {
          addBox(0.24, 0.17, 0.20, woodMat, 0, 0.22 + 0.085, 0);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.12, 4), roofMat);
          roof.rotation.y = Math.PI / 4;
          roof.position.set(0, 0.44, 0);
          group.add(roof);
          for (const dx of [-0.07, 0.02]) {
            addBox(0.07, 0.05, 0.10, grainMat, dx, 0.25, -0.16, -0.14 + rand() * 0.28);
          }
        }
        break;
      }
      case Landscapes.WATER: {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe8eef1, roughness: 0.46, metalness: 0.08 });
        const redMat = new THREE.MeshStandardMaterial({ color: 0xb83b35, roughness: 0.48, metalness: 0.10 });
        const lightMat = new THREE.MeshStandardMaterial({ color: 0xffec9d, roughness: 0.28, metalness: 0.28, emissive: 0xffc846, emissiveIntensity: 0.55 });
        const dockMat = new THREE.MeshStandardMaterial({ color: 0x7a5637, roughness: 0.78, metalness: 0.03 });
        addBox(0.34, 0.030, 0.10, dockMat, -0.04, 0.245, 0.15, 0.06);
        for (const px of [-0.18, 0.06]) addCyl(0.010, 0.012, 0.10, 6, dockMat, px, 0.28, 0.15);
        addCyl(0.052, 0.074, 0.32, 12, stoneMat, 0.02, 0.22 + 0.16, -0.03);
        addCyl(0.054, 0.056, 0.035, 12, redMat, 0.02, 0.37, -0.03);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.076, 0.080, 12), redMat);
        roof.position.set(0.02, 0.60, -0.03);
        group.add(roof);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.033, 10, 8), lightMat);
        beacon.position.set(0.02, 0.53, -0.03);
        group.add(beacon);
        break;
      }
      case Landscapes.PASTURE: {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b623a, roughness: 0.76, metalness: 0.03 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x5f7940, roughness: 0.68, metalness: 0.04 });
        const woolMat = new THREE.MeshStandardMaterial({ color: 0xfff8df, roughness: 0.82, metalness: 0.01 });
        const trimMat = new THREE.MeshStandardMaterial({ color: 0xf4e7b0, roughness: 0.70, metalness: 0.02 });
        if (crowns >= 2) {
          addBox(0.25, 0.15, 0.20, trimMat, -0.02, 0.22 + 0.075, 0.02);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.11, 4), roofMat);
          roof.rotation.y = Math.PI / 4;
          roof.position.set(-0.02, 0.43, 0.02);
          group.add(roof);
        }
        for (const z of [-0.15, 0.18]) {
          addBox(0.42, 0.025, 0.018, woodMat, 0.00, 0.30, z);
          for (const px of [-0.20, 0.20]) addCyl(0.010, 0.012, 0.12, 6, woodMat, px, 0.27, z);
        }
        const flock = crowns >= 2 ? [[0.18, 0.04, 1.0], [0.06, -0.14, 0.78], [-0.20, 0.12, 0.70]] : [[0.10, 0.02, 0.9], [-0.13, -0.08, 0.68]];
        for (const [dx, dz, s] of flock) {
          const sheep = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 10, 7), woolMat);
          sheep.scale.set(1.45, 0.70, 0.92);
          sheep.position.set(dx, 0.285, dz);
          group.add(sheep);
        }
        break;
      }
      case Landscapes.BOG: {
        const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b5332, roughness: 0.84, metalness: 0.03 });
        const hutMat = new THREE.MeshStandardMaterial({ color: 0x4e365d, roughness: 0.78, metalness: 0.05, emissive: 0x17091f, emissiveIntensity: 0.10 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b7c48, roughness: 0.80, metalness: 0.03 });
        const glowMat = new THREE.MeshStandardMaterial({ color: 0xece184, roughness: 0.28, metalness: 0.18, emissive: 0xe6d65a, emissiveIntensity: 0.48 });
        for (let i = 0; i < 4; i++) {
          addBox(0.23, 0.018, 0.055, plankMat, -0.20 + i * 0.13, 0.245, 0.16 + (i % 2) * 0.018, 0.22);
        }
        if (crowns >= 2) {
          for (const [px, pz] of [[-0.11, -0.11], [0.12, -0.09], [-0.10, 0.10], [0.12, 0.12]]) {
            addCyl(0.010, 0.014, 0.16, 6, plankMat, px, 0.29, pz);
          }
          addBox(0.25, 0.15, 0.22, hutMat, 0.01, 0.39, 0);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.10, 4), roofMat);
          roof.rotation.y = Math.PI / 4 + 0.14;
          roof.position.set(0.01, 0.525, 0);
          group.add(roof);
        } else {
          addCyl(0.028, 0.038, 0.16, 7, hutMat, 0.02, 0.31, -0.04);
        }
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(crowns >= 2 ? 0.034 : 0.027, 10, 8), glowMat);
        lantern.position.set(0.17, crowns >= 2 ? 0.43 : 0.36, -0.09);
        group.add(lantern);
        break;
      }
      case Landscapes.MINE: {
        const timberMat = new THREE.MeshStandardMaterial({ color: 0x704e31, roughness: 0.76, metalness: 0.04 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x05080d, roughness: 0.86, metalness: 0.06, emissive: 0x020305, emissiveIntensity: 0.12 });
        const oreMat = new THREE.MeshStandardMaterial({ color: 0xf0bc4a, roughness: 0.34, metalness: 0.45, emissive: 0x6b3d08, emissiveIntensity: 0.22 });
        const crystalMat = new THREE.MeshStandardMaterial({ color: 0x89dbff, roughness: 0.25, metalness: 0.30, emissive: 0x1d526f, emissiveIntensity: crowns >= 3 ? 0.44 : 0.26 });
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x526272, roughness: 0.70, metalness: 0.16 });
        const entrance = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), darkMat);
        entrance.scale.set(1.25, 0.88, 0.40);
        entrance.position.set(-0.05, 0.31, -0.10);
        group.add(entrance);
        addBox(0.035, 0.24, 0.035, timberMat, -0.18, 0.34, -0.10);
        addBox(0.035, 0.24, 0.035, timberMat, 0.08, 0.34, -0.10);
        addBox(0.32, 0.035, 0.040, timberMat, -0.05, 0.46, -0.10);
        if (crowns >= 2) {
          addBox(0.030, 0.36, 0.030, timberMat, 0.17, 0.40, 0.06, 0.18);
          addBox(0.030, 0.36, 0.030, timberMat, 0.00, 0.40, 0.18, -0.18);
          addBox(0.24, 0.026, 0.026, timberMat, 0.08, 0.58, 0.12, 0.58);
          const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.040, 0.007, 8, 18), stoneMat);
          pulley.position.set(0.20, 0.57, 0.02);
          pulley.rotation.y = Math.PI / 2;
          group.add(pulley);
        }
        const oreCount = crowns >= 3 ? 5 : crowns >= 2 ? 3 : 2;
        for (let i = 0; i < oreCount; i++) {
          const ore = new THREE.Mesh(new THREE.OctahedronGeometry(0.025 + rand() * 0.022, 0), rand() > 0.42 ? crystalMat : oreMat);
          ore.position.set(-0.22 + rand() * 0.46, 0.26 + rand() * 0.07, 0.12 + rand() * 0.15);
          ore.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
          group.add(ore);
        }
        if (crowns >= 3) {
          const spire = new THREE.Mesh(new THREE.ConeGeometry(0.070, 0.36, 5), crystalMat);
          spire.position.set(0.18, 0.22 + 0.18, 0.18);
          spire.rotation.y = rand() * Math.PI;
          group.add(spire);
          addBox(0.18, 0.070, 0.13, stoneMat, -0.19, 0.27, 0.12, -0.22);
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
        const treeCount = 4 + Math.floor(rand() * 4);
        const trees = [];
        for (let i = 0; i < treeCount; i++) {
          const spot = this.#detailSpot(rand, 0.34);
          trees.push({
            dx: spot.dx,
            dz: spot.dz,
            h: 0.13 + rand() * 0.08,
            cr: 0.06 + rand() * 0.04,
            ch: 0.12 + rand() * 0.08,
          });
        }
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
          const spot = this.#detailSpot(rand, 0.28);
          const nurseLog = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.24, 8), trunkMat);
          nurseLog.position.set(x + spot.dx, 0.25, y + spot.dz);
          nurseLog.rotation.z = Math.PI / 2;
          nurseLog.rotation.y = rand() * Math.PI * 2;
          this.#addTileObjects(nurseLog);
        }
        for (let i = 0; i < 2; i++) {
          const spot = this.#detailSpot(rand, 0.34);
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
        const fieldStyle = Math.floor(rand() * 3);
        const rowAngle = -0.38 + rand() * 0.16;
        const rowCos = Math.cos(rowAngle);
        const rowSin = Math.sin(rowAngle);
        const rows = fieldStyle === 0
          ? [-0.31, -0.18, -0.05, 0.08, 0.21]
          : fieldStyle === 1
            ? [-0.28, -0.08, 0.12, 0.28]
            : [-0.25, -0.15, -0.02, 0.11, 0.24];

        for (let i = 0; i < (fieldStyle === 1 ? 2 : 3); i++) {
          const spot = this.#detailSpot(rand, 0.27);
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
            if (dx > 0.13 && dz < -0.13) continue;

            const h = 0.12 + rand() * (fieldStyle === 2 ? 0.13 : 0.10);
            const lean = -0.26 + rand() * 0.52;
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.010, h, 6), rand() > 0.55 ? paleStalkMat : stalkMat);
            stalk.position.set(x + dx, 0.23 + h / 2, y + dz);
            stalk.rotation.z = lean;
            stalk.rotation.x = -0.08 + rand() * 0.16;
            stalk.rotation.y = rowAngle + (-0.20 + rand() * 0.40);
            this.#addTileObjects(stalk);

            const head = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 6), rand() > 0.25 ? seedMat : darkSeedMat);
            head.scale.set(0.54, 1.55 + rand() * 0.35, 0.54);
            head.position.set(x + dx + Math.sin(lean) * 0.025, 0.23 + h + 0.012, y + dz);
            head.rotation.z = lean;
            head.rotation.y = stalk.rotation.y;
            this.#addTileObjects(head);

            if (rand() > 0.48) {
              for (const side of [-1, 1]) {
                const awn = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.003, 0.055, 5), paleStalkMat);
                awn.position.set(x + dx + side * 0.014, 0.23 + h + 0.040, y + dz);
                awn.rotation.z = lean + side * 0.72;
                awn.rotation.y = stalk.rotation.y;
                this.#addTileObjects(awn);
              }
            }
          }
        }

        if (rand() > 0.18) {
          const spot = this.#detailSpot(rand, 0.24);
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

        const waterStyle = Math.floor(rand() * 4);
        const glintCount = waterStyle === 0 ? 0 : waterStyle === 1 ? 1 : 2;
        for (let i = 0; i < glintCount; i++) {
          const { dx, dz } = this.#detailSpot(rand, 0.32);
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
        for (let i = 0; i < shadowCount; i++) {
          const { dx, dz } = this.#detailSpot(rand, 0.26);
          const shadow = new THREE.Mesh(
            createWaterShardGeometry(0.15 + rand() * 0.16, 0.060 + rand() * 0.050, rand),
            shadowMat
          );
          shadow.position.set(x + dx, 0.231, y + dz);
          shadow.rotation.x = -Math.PI / 2;
          shadow.rotation.y = -0.55 + rand() * 1.10;
          this.#addTileObjects(shadow);
        }

        if (rand() > 0.82) {
          const { dx, dz } = this.#detailSpot(rand, 0.23);
          this.#addWaterTurtle(x, y, dx, dz, rand() * Math.PI * 2, turtleShellMat, turtleBodyMat);
        } else {
          const fishCount = waterStyle === 2 ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3);
          for (let i = 0; i < fishCount; i++) {
            const { dx, dz } = this.#detailSpot(rand, 0.30);
            const bodyMat = i === 0 && rand() > 0.40
              ? fishOrangeMat
              : rand() > 0.55
                ? fishPaleMat
                : fishBlueMat;
            const tailMat = bodyMat === fishBlueMat ? fishPaleMat : bodyMat;
            this.#addWaterFish(x, y, dx, dz, rand() * Math.PI * 2, 0.82 + rand() * 0.46, bodyMat, tailMat);
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

        const tuftCount = 7 + Math.floor(rand() * 5);
        for (let i = 0; i < tuftCount; i++) {
          const { dx, dz } = this.#detailSpot(rand, 0.34);
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

        const sheepCount = 2 + Math.floor(rand() * 3);
        const sheepSpots = [];
        for (let i = 0; i < sheepCount; i++) {
          let spot = this.#detailSpot(rand, 0.27);
          for (let attempt = 0; attempt < 14; attempt++) {
            const tooClose = sheepSpots.some((other) => {
              const dx = other.dx - spot.dx;
              const dz = other.dz - spot.dz;
              return Math.hypot(dx, dz) < 0.145;
            });
            if (!tooClose) break;
            spot = this.#detailSpot(rand, 0.30);
          }
          sheepSpots.push(spot);
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
        const puddleCount = 3 + Math.floor(rand() * 3);
        for (let i = 0; i < puddleCount; i++) {
          const { dx, dz } = this.#detailSpot(rand, 0.34);
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
        const reedCount = 5 + Math.floor(rand() * 5);
        for (let i = 0; i < reedCount; i++) {
          const { dx, dz } = this.#detailSpot(rand, 0.33);
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
        for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
          const { dx, dz } = this.#detailSpot(rand, 0.28);
          const pad = new THREE.Mesh(new THREE.SphereGeometry(0.036 + rand() * 0.026, 10, 6), lilyMat);
          pad.scale.set(1.34, 0.10, 0.80);
          pad.position.set(x + dx, 0.246, y + dz);
          pad.rotation.y = rand() * Math.PI * 2;
          this.#addTileObjects(pad);
        }
        if (rand() > 0.18) {
          const mushroomCount = 1 + Math.floor(rand() * 3);
          for (let i = 0; i < mushroomCount; i++) {
            const { dx, dz } = this.#detailSpot(rand, 0.27);
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
          for (let i = 0; i < glowCount; i++) {
            const { dx, dz } = this.#detailSpot(rand, 0.25);
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

        const ridgeCount = 3 + Math.floor(rand() * 2);
        for (let i = 0; i < ridgeCount; i++) {
          const { dx, dz } = this.#detailSpot(rand, 0.27);
          const height = 0.18 + rand() * 0.19;
          const radius = 0.086 + rand() * 0.060;
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

        const caveSpot = this.#detailSpot(rand, 0.21);
        const cave = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 7), caveMat);
        cave.scale.set(1.44, 0.18, 0.88);
        cave.position.set(x + caveSpot.dx, 0.242, y + caveSpot.dz);
        cave.rotation.y = rand() * Math.PI * 2;
        this.#addTileObjects(cave);

        const rubbleCount = 3 + Math.floor(rand() * 4);
        for (let i = 0; i < rubbleCount; i++) {
          const spot = this.#detailSpot(rand, 0.34);
          const size = 0.026 + rand() * 0.034;
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rand() > 0.52 ? rockMat : darkRockMat);
          rock.position.set(x + spot.dx, 0.238 + size * 0.55, y + spot.dz);
          rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
          this.#addTileObjects(rock);

          if (rand() > 0.70) {
            const ore = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.44, 0), rand() > 0.45 ? crystalMat : oreGoldMat);
            ore.position.set(x + spot.dx + rand() * 0.045 - 0.022, 0.275 + size * 0.65, y + spot.dz + rand() * 0.045 - 0.022);
            ore.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
            this.#addTileObjects(ore);
          }
        }

        if (rand() > 0.16) {
          const cartSpot = this.#detailSpot(rand, 0.20);
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

    const stone = new THREE.MeshStandardMaterial({
      color: playerColor,
      roughness: tier === 0 ? 0.62 : 0.52,
      metalness: tier >= 2 ? 0.16 : 0.10,
      emissive: playerColor,
      emissiveIntensity: growth.perfectKingdom ? 0.24 : 0.12,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: 0xe9edf5,
      roughness: 0.48,
      metalness: 0.12,
      emissive: playerColor,
      emissiveIntensity: 0.07,
    });

    const keepScale = tier === 0 ? 0.80 : tier === 1 ? 0.95 : tier === 2 ? 1.10 : tier === 3 ? 1.22 : 1.30;
    const keepHeight = 0.18 + keepScale * 0.20;
    const keep = new THREE.Mesh(new THREE.BoxGeometry(0.42 * keepScale, keepHeight, 0.42 * keepScale), stone);
    keep.position.set(x, 0.22 + keepHeight / 2, y);
    this.#addTileObjects(keep);

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
      this.#addTileObjects(tower);
    }

    if (tier >= 1) {
      const toothGeom = new THREE.BoxGeometry(0.08, 0.08, 0.08);
      const teeth = [
        [-0.16, -0.16], [0.00, -0.16], [0.16, -0.16],
        [-0.16, 0.16], [0.00, 0.16], [0.16, 0.16],
        [-0.16, 0.00], [0.16, 0.00],
      ];
      for (const [dx, dz] of teeth) {
        const tooth = new THREE.Mesh(toothGeom, trim);
        tooth.position.set(x + dx * keepScale, 0.44 + keepHeight * 0.35, y + dz * keepScale);
        this.#addTileObjects(tooth);
      }
    }

    if (tier >= 2) {
      const roofMat = new THREE.MeshStandardMaterial({ color: playerColor, roughness: 0.42, metalness: 0.16, emissive: playerColor, emissiveIntensity: 0.08 });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.20 * keepScale, 0.16, 4), roofMat);
      roof.rotation.y = Math.PI * 0.25;
      roof.position.set(x, 0.46 + keepHeight * 0.4, y);
      this.#addTileObjects(roof);
    }

    if (tier >= 3) {
      const bannerMat = new THREE.MeshStandardMaterial({ color: playerColor, roughness: 0.6, metalness: 0.08, side: THREE.DoubleSide, emissive: playerColor, emissiveIntensity: 0.10 });
      const mastMat = new THREE.MeshStandardMaterial({ color: 0x5d4c3a, roughness: 0.75, metalness: 0.03 });
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.28, 8), mastMat);
      mast.position.set(x + 0.06, 0.62, y + 0.06);
      this.#addTileObjects(mast);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.09), bannerMat);
      banner.position.set(x + 0.12, 0.66, y + 0.06);
      banner.rotation.y = Math.PI * 0.20;
      this.#addTileObjects(banner);
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
      this.#addTileObjects(ring);

      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.08, 8), crownMat);
        tip.position.set(x + Math.cos(a) * 0.18, 0.88, y + Math.sin(a) * 0.18);
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
    const library = this.#libraryOpen;
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
    if (this.#libraryOpen) {
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
    if (!this.#controls || !this.#camera) return;

    const activeIdx = this.#game.state === GameState.PLACE
      ? this.#game.currentPlacingPlayerIndex
      : this.#game.currentPickingPlayerIndex;

    const bm = this.#game.players[activeIdx].board;
    const bs = bm.boardSize;

    this.#frameToBoardSize(bs, 2, this.#boardOriginForPlayer(activeIdx), animate);
  }

  #centerOnFocusedBoard(animate = false) {
    if (this.#libraryOpen) {
      this.#centerOnDominoLibrary(animate);
      return;
    }
    if (!this.#game?.players?.length) return;
    const idx = Math.max(0, Math.min(this.#focusedPlayerIndex, this.#game.players.length - 1));
    const bs = this.#game.players[idx].board.boardSize;
    this.#frameToBoardSize(bs, 2, this.#boardOriginForPlayer(idx), animate);
  }

  #centerOnDominoLibrary(animate = false) {
    const deck = DominoPoolManager.getStartingDominoPool();
    const cols = 6;
    const cellX = 2.55;
    const cellZ = 1.55;
    const rows = Math.ceil(deck.length / cols);
    const xOffset = -((cols - 1) * cellX + 1) / 2;
    const zOffset = -((rows - 1) * cellZ) / 2;
    this.#frameToBoardSize({
      xMin: xOffset - 0.72,
      xMax: xOffset + (cols - 1) * cellX + 1.72,
      yMin: zOffset - 0.82,
      yMax: zOffset + (rows - 1) * cellZ + 0.82,
    }, 2.2, { x: 0, z: 0 }, animate);
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

    const activeIdx = this.#game.state === GameState.PLACE
      ? this.#game.currentPlacingPlayerIndex
      : this.#game.currentPickingPlayerIndex;

    this.#miniMapCanvases.forEach((canvas, idx) => {
      canvas.classList.toggle('miniActive', idx === this.#focusedPlayerIndex);
      canvas.parentElement?.classList.toggle('miniTurn', idx === activeIdx);
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

    const options = this.#uniqueVisiblePlacementOptions(this.#game.getCurrentPlacementOptions?.() ?? []);
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
    const drafted = this.#game.currentPlacingDraftedTile;
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
    const drafted = this.#game.currentPlacingDraftedTile;
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
    const choice = this.#game.getCurrentPlacingChoices?.()
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
    const currentDominoNumber = this.#game.currentPlacingDraftedTile?.domino.number;
    const byKey = new Map();
    for (const option of options) {
      const visibleKey = this.#visiblePlacementOptionKey(option);
      const key = preserveDomino ? this.#dominoPreservingPlacementOptionKey(option) : visibleKey;
      const existing = byKey.get(key);
      if (!existing || (option.dominoNumber === currentDominoNumber && existing.dominoNumber !== currentDominoNumber)) {
        byKey.set(key, option);
      }
    }
    const playerIndex = this.#game.currentPlacingPlayerIndex;
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

    this.#isApplyingPlacementOption = true;
    try {
      const drafted = this.#game.currentPlacingDraftedTile;
      if (drafted?.domino.number !== option.dominoNumber) {
        this.#mp?.sendAction('selectPlacementTile', { dominoNumber: option.dominoNumber });
      }

      const selected = this.#game.currentPlacingDraftedTile;
      let guard = 0;
      while (selected && selected.domino.orientation !== option.orientation && guard < 4) {
        this.#mp?.sendAction('rotate');
        guard += 1;
      }
    } finally {
      this.#isApplyingPlacementOption = false;
    }
    this.#syncLocalPlacementDock();
  }

  #optionUsesGrid(option, grid) {
    if (!grid) return false;
    const choice = this.#game.getCurrentPlacingChoices?.()
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
      : this.#uniqueVisiblePlacementOptions(this.#game?.getCurrentPlacementOptions?.() ?? [], { preserveDomino });
    return this.#uniqueVisiblePlacementOptions(options.filter((option) => this.#optionUsesGrid(option, grid)), { preserveDomino });
  }

  #localPlacementOptions(allValid = null) {
    if (!this.#localPlacementFocus) return [];
    return this.#placementOptionsForGrid(this.#localPlacementFocus, allValid, { preserveDomino: true });
  }

  #placementDockOptions(allValid = null) {
    const rawOptions = allValid ?? this.#game?.getCurrentPlacementOptions?.() ?? [];
    const localValid = this.#localPlacementOptions(rawOptions);
    return localValid.length ? localValid : this.#uniqueVisiblePlacementOptions(rawOptions);
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
    this.#localPlacementLabel.textContent = `${index + 1}/${valid.length}`;
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
    this.#localPlacementDock.style.left = '';
    this.#localPlacementDock.style.top = '';
    this.#root?.classList.remove('hasLocalPlacementDock');
    this.#syncMobilePlacementStack();
  }

  #repairSelectedPlacementAfterDominoChange() {
    const g = this.#game;
    if (!g || g.state !== GameState.PLACE) return;

    const drafted = g.currentPlacingDraftedTile;
    if (!drafted) return;

    if (this.#hoverAnchor && this.#placementFeedbackForAnchor(this.#hoverAnchor).ok) {
      this.#placementHint = '';
      this.#setCanvasNotice('');
      return;
    }

    const previous = this.#hoverAnchor;
    const valid = this.#uniqueVisiblePlacementOptions(g.getCurrentPlacementOptions?.() ?? [])
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

    const allValid = this.#uniqueVisiblePlacementOptions(g.getCurrentPlacementOptions?.() ?? []);
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

    const activeIdx = g.currentPlacingPlayerIndex;
    if (activeIdx == null) return false;
    const board = g.players[activeIdx]?.board?.board;
    if (!board) return false;

    const anchor = this.#hoverAnchor;
    if (board[keyOf(anchor.x, anchor.y)]) return true;

    const feedback = this.#placementFeedbackForAnchor(anchor);
    return !feedback.ok && feedback.reason === 'Space occupied.';
  }

  #placementFeedbackForAnchor(anchor) {
    if (!anchor) return { ok: false, anchorEnd: DominoEnd.LEFT, reason: 'No placement selected.' };
    if (anchor.anchorEnd) {
      const exact = this.#game.explainCurrentPlacementAt(anchor.x, anchor.y, anchor.anchorEnd);
      if (exact.ok) return { ok: true, anchorEnd: anchor.anchorEnd, reason: '' };
      return { ...exact, anchorEnd: anchor.anchorEnd };
    }
    return this.#game.getPlacementFeedbackAt(anchor.x, anchor.y);
  }

  #initialCurrentTilePlacementOption() {
    const g = this.#game;
    const drafted = g?.currentPlacingDraftedTile;
    if (!g || !drafted) return null;

    const options = this.#uniqueVisiblePlacementOptions(g.getCurrentPlacementOptions?.() ?? []);
    return options.find((option) =>
      option.dominoNumber === drafted.domino.number
      && option.orientation === drafted.domino.orientation
    ) ?? null;
  }

  #renderGhost() {
    while (this.#ghostGroup.children.length) this.#ghostGroup.remove(this.#ghostGroup.children[0]);
    this.#syncBoardLayerPositions();
    if (this.#libraryOpen) return;

    const g = this.#game;
    const activeIdx = g.currentPlacingPlayerIndex;
    if (this.#isMyTurnToPlace() && activeIdx != null && this.#focusedPlayerIndex !== activeIdx) {
      this.#focusedPlayerIndex = activeIdx;
    }

    const focusedBoard = g.players[this.#focusedPlayerIndex]?.board?.board || g.players[0].board.board;
    if (g.isGameOver) {
      this.#renderRegionScoring(null);
      this.#syncLocalPlacementDock();
      return;
    }
    if (g.state !== GameState.PLACE) {
      this.#renderRegionScoring(null);
      this.#syncLocalPlacementDock();
      return;
    }
    if (!this.#isMyTurnToPlace()) {
      this.#renderRegionScoring(null);
      this.#syncLocalPlacementDock();
      return;
    }

    const drafted = g.currentPlacingDraftedTile;
    if (!drafted) {
      this.#renderRegionScoring(null);
      this.#syncLocalPlacementDock();
      return;
    }

    // On entering placement phase, show the ghost immediately.
    // Prefer a legal/visible anchor so the ghost does not spawn hidden under tiles.
    if (!this.#hoverAnchor || (this.#hoverAnchorAuto && this.#isCurrentHoverAnchorOccluded())) {
      const option = this.#initialCurrentTilePlacementOption();
      const suggested = option
        ? { x: option.x, y: option.y, anchorEnd: option.anchorEnd }
        : this.#findBestInitialHoverAnchor();
      if (suggested) {
        this.#hoverAnchor = suggested;
        this.#hoverAnchorAuto = true;
      }
    }

    this.#renderValidAnchorHighlights(
      g.getCurrentPlacementOptions?.() ?? []
    );

    const anchor = this.#hoverAnchor;
    const feedback = this.#placementFeedbackForAnchor(anchor);
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
        this.#addCrownStars(x, y, crowns, { target: this.#ghostGroup, ghost: true });
      }
    };

    const leftCoord = ghostAnchorEnd === DominoEnd.LEFT ? anchor : other;
    const rightCoord = ghostAnchorEnd === DominoEnd.RIGHT ? anchor : other;

    makeGhostCell(leftCoord.x, leftCoord.y, drafted.domino.leftEnd.landscape, drafted.domino.leftEnd.crowns);
    makeGhostCell(rightCoord.x, rightCoord.y, drafted.domino.rightEnd.landscape, drafted.domino.rightEnd.crowns);

    if (this.#showPlacementScores && valid && !occupied) this.#renderRegionScoring(built.projected);
    else this.#renderRegionScoring(null);
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

    this.#updateCameraTransition();
    this.#syncBoardLayerPositions();

    if (this.#controls) this.#controls.update();
    this.#syncGridPresentation();
    this.#syncLocalPlacementDock();
    if (this.#renderer && this.#scene && this.#camera) this.#renderer.render(this.#scene, this.#camera);
    requestAnimationFrame(this.#tick);
  };
}
