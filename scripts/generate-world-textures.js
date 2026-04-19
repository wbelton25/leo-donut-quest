// scripts/generate-world-textures.js
// Generates seamless 128×128 surface textures in an 8-bit / SNES pixel-art style.
//
// Key design principles:
//   • Limited color palettes (4-6 shades per surface) — smooth gradients look
//     like photos; discrete palette steps look like a game.
//   • Quantised noise: base noise selects a palette entry.  Fine grain adds
//     per-pixel variation within that entry, giving the "hand-drawn" look.
//   • Seamless tiling: all noise uses trig functions whose period divides the
//     texture dimensions exactly, so opposite edges always match.
//
// Usage:  node scripts/generate-world-textures.js
//
// Output (public/assets/textures/):
//   grass.png  park.png  golf.png  road.png  sidewalk.png
//   water.png  water-lt.png  shore.png

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT    = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'textures');

const W = 128, H = 128;

// ── Seamless noise helpers ─────────────────────────────────────────────────
// sn() is periodic over [0,W] and [0,H] — guarantees edge continuity.
const sn = (x, y, freq, phase = 0) =>
  (Math.sin(2 * Math.PI * x / W * freq + phase) *
   Math.sin(2 * Math.PI * y / H * freq + phase * 1.37)) * 0.5 + 0.5;

// Multi-octave seamless noise [0, 1]
const noise = (x, y, seed = 0) =>
  sn(x, y, 1, seed + 0.30) * 0.44 +
  sn(x, y, 2, seed + 1.70) * 0.26 +
  sn(x, y, 4, seed + 0.90) * 0.18 +
  sn(x, y, 8, seed + 2.40) * 0.12;

// High-frequency grain — for per-pixel detail
const grain = (x, y, seed = 0) =>
  sn(x, y, 16, seed + 1.1) * 0.55 +
  sn(x, y, 32, seed + 3.7) * 0.45;

// ── Palette quantiser ──────────────────────────────────────────────────────
// Maps a continuous value [0,1] onto a small set of discrete RGB entries.
// Bayer-style dithering added so colour steps look pixel-accurate, not banded.
const BAYER2 = [[0, 2], [3, 1]]; // 2×2 Bayer matrix (values 0-3)

function quantise(val, palette, x, y, dither = 0.6) {
  const n   = palette.length;
  // Dither offsets the threshold so adjacent pixels alternate colours
  const d   = (BAYER2[y & 1][x & 1] / 4 - 0.375) * dither * (1 / n);
  const idx = Math.min(n - 1, Math.max(0, Math.floor((val + d) * n)));
  return palette[idx];
}

// ── Texture builder ────────────────────────────────────────────────────────
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));

function makeTexture(fn) {
  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * W + x) * 3;
      buf[i] = clamp(r); buf[i+1] = clamp(g); buf[i+2] = clamp(b);
    }
  return sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

// ── Surface definitions ───────────────────────────────────────────────────

// Grass — 6-shade palette with blade-tip highlights
// Lighter pixels tend to appear in small vertical clusters (like blades)
const GRASS_PAL = [
  [28,  82, 28],   // 0 very dark shadow
  [40, 100, 40],   // 1 dark
  [54, 124, 54],   // 2 medium-dark  ← most common
  [66, 145, 66],   // 3 medium
  [80, 168, 80],   // 4 light
  [96, 194, 96],   // 5 bright blade-tip
];

const grass = (x, y) => {
  const base  = noise(x, y, 0);           // large-patch variation
  const fine  = grain(x, y, 0);           // per-pixel detail
  // Bias toward middle of palette (2-3); fine grain shifts ±1
  const v = base * 0.65 + fine * 0.35;
  const c = quantise(v, GRASS_PAL, x, y, 0.55);
  // Occasional bright blade-tip: only on pixels whose noise is already high
  // and where the pixel "above" (y-1 wraps) is also in the light range —
  // creates short vertical streaks that read as individual grass blades.
  if (fine > 0.80 && noise(x, y - 1, 0) + grain(x, y - 1, 0) * 0.35 > 0.70) {
    return GRASS_PAL[5];
  }
  return c;
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

// Golf green — close-cut, mowing stripes every 8px, bright
const GOLF_PAL = [
  [14, 100, 28],
  [20, 120, 38],
  [26, 140, 48],
  [34, 158, 58],
  [42, 174, 68],
];

const golf = (x, y) => {
  const stripe = Math.floor(y / 8) % 2 === 0 ? 0.55 : 0.45;   // mow stripes
  const v = stripe + (noise(x, y, 6) - 0.5) * 0.25 + (grain(x, y, 6) - 0.5) * 0.12;
  return quantise(v, GOLF_PAL, x, y, 0.4);
};

// Road asphalt — 5-shade dark grey palette
// Most pixels are in the middle; fine grain scatters "stones" (brighter spots)
// and rare very dark pixels suggest age/wear.
const ROAD_PAL = [
  [38, 38, 48],   // 0 very dark  (deep crack / old wear)
  [52, 52, 62],   // 1 dark        ← main base
  [65, 65, 76],   // 2 base        ← most common
  [80, 80, 93],   // 3 light stone
  [97, 97, 112],  // 4 bright stone highlight
];

const road = (x, y) => {
  const base  = noise(x, y, 1);  // slow patch variation
  const g     = grain(x, y, 1);  // fine grain
  // Centre distribution around palette[1-2]; grain adds ±1 steps
  const v = 0.25 + base * 0.35 + g * 0.40;
  const c = quantise(v, ROAD_PAL, x, y, 0.35);
  // Scattered bright "aggregate" stones — rare individual pixels
  if (g > 0.86 && grain(x, y, 9) > 0.78) return ROAD_PAL[4];
  // Occasional very dark wear marks
  if (g < 0.10 && base < 0.25)           return ROAD_PAL[0];
  return c;
};

// Sidewalk / concrete pavement
const WALK_PAL = [
  [148, 133,  98],
  [172, 158, 118],
  [190, 176, 138],
  [208, 194, 158],
  [222, 210, 174],
];

const sidewalk = (x, y) => {
  // Subtle expansion-joint crack: 1px darker line every 32px
  if (x % 32 === 0 || y % 32 === 0) return WALK_PAL[0];
  const v = noise(x, y, 5) * 0.55 + grain(x, y, 5) * 0.45;
  return quantise(v, WALK_PAL, x, y, 0.45);
};

// Deep water — dark blue with diagonal shimmer
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

// Shallow water — lighter, more turquoise
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

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, fn] of TEXTURES) {
    const buf = await makeTexture(fn);
    writeFileSync(join(OUT_DIR, `${name}.png`), buf);
    console.log(`✓  ${name}.png`);
  }
  console.log('\nAll textures written to public/assets/textures/');
}

run().catch(err => { console.error(err.message); process.exit(1); });
