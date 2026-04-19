// scripts/generate-world-textures.js
// Generates seamless 128×128 surface textures in an 8-bit / SNES pixel-art style,
// plus 128×20 RGBA edge-transition strips that give roads organic, non-rectangular
// boundaries when placed straddling the road/grass border in-game.
//
// Usage:  node scripts/generate-world-textures.js
//
// Output (public/assets/textures/):
//   grass.png  park.png  golf.png  road.png  sidewalk.png
//   water.png  water-lt.png  shore.png
//   road-edge-h.png  road-edge-v.png   ← RGBA edge strips

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT    = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'textures');

const W = 128, H = 128;

// ── Seamless noise helpers ─────────────────────────────────────────────────
const sn = (x, y, freq, phase = 0) =>
  (Math.sin(2 * Math.PI * x / W * freq + phase) *
   Math.sin(2 * Math.PI * y / H * freq + phase * 1.37)) * 0.5 + 0.5;

const noise = (x, y, seed = 0) =>
  sn(x, y, 1, seed + 0.30) * 0.44 +
  sn(x, y, 2, seed + 1.70) * 0.26 +
  sn(x, y, 4, seed + 0.90) * 0.18 +
  sn(x, y, 8, seed + 2.40) * 0.12;

const grain = (x, y, seed = 0) =>
  sn(x, y, 16, seed + 1.1) * 0.55 +
  sn(x, y, 32, seed + 3.7) * 0.45;

// ── Palette quantiser with Bayer 2×2 dithering ────────────────────────────
const BAYER2 = [[0, 2], [3, 1]];

function quantise(val, palette, x, y, dither = 0.6) {
  const n = palette.length;
  const d = (BAYER2[y & 1][x & 1] / 4 - 0.375) * dither * (1 / n);
  const idx = Math.min(n - 1, Math.max(0, Math.floor((val + d) * n)));
  return palette[idx];
}

// ── Texture builders ───────────────────────────────────────────────────────
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));

function makeTexture(fn, w = W, h = H) {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 3;
      buf[i] = clamp(r); buf[i+1] = clamp(g); buf[i+2] = clamp(b);
    }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

// RGBA version — returns [r,g,b,a] per pixel; used for edge-transition strips
function makeTextureRGBA(fn, w = W, h = H) {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = fn(x, y);
      const i = (y * w + x) * 4;
      buf[i] = clamp(r); buf[i+1] = clamp(g); buf[i+2] = clamp(b); buf[i+3] = clamp(a);
    }
  return sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

// ── Surface definitions ───────────────────────────────────────────────────

// Grass — vertical blade structure.
// Each column has a different phase offset so blade tips land at staggered
// heights, creating an organic irregular feel rather than horizontal bands.
const GRASS_PAL = [
  [14,  44, 14],   // 0 deep shadow  (ground between blades)
  [34,  88, 34],   // 1 dark         (blade base)
  [50, 122, 50],   // 2 mid-dark     (lower blade body)
  [65, 150, 55],   // 3 mid          (upper blade — slight yellow shift)
  [84, 175, 58],   // 4 upper        (blade tip)
  [108, 208, 68],  // 5 bright       (sun-caught tip highlight, rare)
];

const BLADE_H = 6;
const BLADE_GRAD = [1.0, 0.78, 0.56, 0.36, 0.18, 0.02];

const grass = (x, y) => {
  const patch    = noise(x, y, 0);
  const colPhase = Math.floor(sn(x, 0, 10, 1.8) * BLADE_H);
  const bp       = (y + colPhase) % BLADE_H;
  const bladeV   = BLADE_GRAD[bp];
  const colDense = sn(x, 0, 6, 3.2) > 0.55 ? 0.08 : 0.0;
  const v = bladeV * 0.62 + patch * 0.30 + colDense + grain(x, y, 1) * 0.08;
  if (bp === 0 && patch > 0.60 && grain(x, y, 4) > 0.74) return GRASS_PAL[5];
  return quantise(Math.max(0, Math.min(1, v)), GRASS_PAL, x, y, 0.18);
};

// Park / golf rough — darker, more saturated
const PARK_PAL = [
  [18,  60, 18],
  [28,  82, 28],
  [38, 105, 38],
  [50, 128, 50],
  [62, 148, 62],
];

const park = (x, y) => {
  const v = noise(x, y, 3) * 0.6 + grain(x, y, 3) * 0.4;
  return quantise(v, PARK_PAL, x, y, 0.5);
};

// Golf green — mowing stripes every 8px
const GOLF_PAL = [
  [14, 100, 28],
  [20, 120, 38],
  [26, 140, 48],
  [34, 158, 58],
  [42, 174, 68],
];

const golf = (x, y) => {
  const stripe = Math.floor(y / 8) % 2 === 0 ? 0.55 : 0.45;
  const v = stripe + (noise(x, y, 6) - 0.5) * 0.25 + (grain(x, y, 6) - 0.5) * 0.12;
  return quantise(v, GOLF_PAL, x, y, 0.4);
};

// Road asphalt
const ROAD_PAL = [
  [38, 38, 48],   // 0 very dark  (crack / old wear)
  [52, 52, 62],   // 1 dark
  [65, 65, 76],   // 2 base  ← most common
  [80, 80, 93],   // 3 light stone
  [97, 97, 112],  // 4 bright stone highlight
];

// Shared road pixel computation — used by both road() and the edge strips
const roadPixel = (x, y) => {
  const base = noise(x, y, 1);
  const g    = grain(x, y, 1);
  const v    = 0.25 + base * 0.35 + g * 0.40;
  const c    = quantise(v, ROAD_PAL, x, y, 0.35);
  if (g > 0.86 && grain(x, y, 9) > 0.78) return ROAD_PAL[4];
  if (g < 0.10 && base < 0.25)           return ROAD_PAL[0];
  return c;
};

const road = roadPixel;

// Sidewalk / concrete pavement
const WALK_PAL = [
  [148, 133,  98],
  [172, 158, 118],
  [190, 176, 138],
  [208, 194, 158],
  [222, 210, 174],
];

const sidewalk = (x, y) => {
  if (x % 32 === 0 || y % 32 === 0) return WALK_PAL[0];
  const v = noise(x, y, 5) * 0.55 + grain(x, y, 5) * 0.45;
  return quantise(v, WALK_PAL, x, y, 0.45);
};

// Deep water
const WATER_PAL = [
  [ 18,  66, 108],
  [ 22,  82, 128],
  [ 28,  98, 148],
  [ 36, 114, 166],
  [ 46, 130, 184],
];

const water = (x, y) => {
  const wave = Math.sin((x * 0.9 + y * 0.5) * Math.PI / 9 + 0.6) * 0.5 + 0.5;
  const v = noise(x, y, 2) * 0.4 + wave * 0.6;
  return quantise(v, WATER_PAL, x, y, 0.45);
};

// Shallow water
const WATER_LT_PAL = [
  [ 32,  96, 148],
  [ 42, 112, 168],
  [ 52, 128, 186],
  [ 64, 144, 200],
  [ 78, 162, 216],
];

const waterLt = (x, y) => {
  const wave = Math.sin((x * 0.8 + y * 0.6) * Math.PI / 8 + 1.3) * 0.5 + 0.5;
  const v = noise(x, y, 2) * 0.35 + wave * 0.65;
  return quantise(v, WATER_LT_PAL, x, y, 0.45);
};

// Sandy shore
const SHORE_PAL = [
  [168, 128,  72],
  [185, 148,  90],
  [200, 165, 108],
  [216, 182, 126],
  [228, 198, 148],
];

const shore = (x, y) => {
  const v = noise(x, y, 4) * 0.55 + grain(x, y, 4) * 0.45;
  return quantise(v, SHORE_PAL, x, y, 0.5);
};

// ── Road edge transition strips (RGBA) ────────────────────────────────────
//
// These 128×20 (or 20×128) textures straddle a road boundary in-game.
// y=0 is the grass side (transparent), y=19 is the road interior (opaque road
// texture). A noise-driven boundary determines how many pixels deep the grass
// "intrudes" into the road at each x position — creating an organic torn edge
// rather than a perfect straight line.
//
// road-edge-h.png — for top / bottom edges of horizontal roads
// road-edge-v.png — for left / right edges of vertical roads (x/y swapped)
//
// In-game placement (NeighborhoodScene):
//   top edge:    tileSprite centered at (px, roadTopY),    same width as road
//   bottom edge: same + setFlipY(true)
//   left edge:   tileSprite centered at (roadLeftX, py),   road-edge-v
//   right edge:  same + setFlipX(true)

const EDGE_SIZE = 20;  // thickness of each edge strip in pixels

// edgeBoundary(u): how many pixels from the "grass" side before road begins.
// u is the tiling coordinate (0-127), seamless over W=128.
// Three frequency layers create large lumps + medium bumps + fine teeth.
const edgeBoundary = (u) => {
  const coarse = sn(u, 0, 2, 0.7);   // 2 large humps — big curved indentations
  const mid    = sn(u, 0, 5, 2.4);   // 5 medium bumps
  const fine   = sn(u, 0, 11, 4.8);  // 11 small teeth — rough torn look
  const v = coarse * 0.40 + mid * 0.35 + fine * 0.25;
  return Math.floor(v * 12 + 4);     // 4-16px from grass side
};

// Horizontal edge strip: x tiles (0-127), y is depth (0=grass, EDGE_SIZE-1=road)
const roadEdgeH = (x, y) => {
  const bnd = edgeBoundary(x);
  if (y < bnd - 1) {
    return [0, 0, 0, 0];                            // fully transparent
  } else if (y === bnd - 1) {
    const [r, g, b] = roadPixel(x, y);
    return [r, g, b, 110];                          // feathered edge pixel
  } else {
    const [r, g, b] = roadPixel(x, y);
    return [r, g, b, 255];                          // full road texture
  }
};

// Vertical edge strip: y tiles (0-127), x is depth (0=grass, EDGE_SIZE-1=road)
const roadEdgeV = (x, y) => roadEdgeH(y, x);

// ── Generate ──────────────────────────────────────────────────────────────
const TEXTURES = [
  ['grass',    grass],
  ['park',     park],
  ['golf',     golf],
  ['road',     road],
  ['sidewalk', sidewalk],
  ['water',    water],
  ['water-lt', waterLt],
  ['shore',    shore],
];

const TEXTURES_RGBA = [
  ['road-edge-h', roadEdgeH, W,         EDGE_SIZE],
  ['road-edge-v', roadEdgeV, EDGE_SIZE, H        ],
];

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, fn] of TEXTURES) {
    const buf = await makeTexture(fn);
    writeFileSync(join(OUT_DIR, `${name}.png`), buf);
    console.log(`✓  ${name}.png`);
  }
  for (const [name, fn, w, h] of TEXTURES_RGBA) {
    const buf = await makeTextureRGBA(fn, w, h);
    writeFileSync(join(OUT_DIR, `${name}.png`), buf);
    console.log(`✓  ${name}.png  (RGBA ${w}×${h})`);
  }
  console.log('\nAll textures written to public/assets/textures/');
}

run().catch(err => { console.error(err.message); process.exit(1); });
