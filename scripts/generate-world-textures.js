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

// Grass — explicit blade-cluster geometry.
//
// The texture is divided into a 16×16 grid of "tuft cells" (8px each).
// Each cell has a jittered center and 5-8 blades radiating outward in random
// directions.  For each output pixel we test whether it lands on any blade
// from nearby tufts.  Blades are dark at the base and bright at the tip.
// The tuft grid wraps toroidally so the texture tiles seamlessly.
const GRASS_PAL = [
  [ 8,  32,  8],   // 0 dark ground (between blades)
  [20,  62, 20],   // 1 blade base
  [38, 100, 32],   // 2 lower blade
  [58, 140, 40],   // 3 upper blade
  [80, 178, 50],   // 4 blade tip
  [102, 210, 62],  // 5 sun-caught highlight
];

const TCOLS = 16, TROWS = 16;  // tuft grid (W/TCOLS = 8px per cell)
const TSIZ  = W / TCOLS;       // 8px

// Deterministic hash [0,1) from two ints — avoids degenerate 0,0 case
const hsh = (a, b) => {
  const n = Math.sin((a + 1.3) * 127.1 + (b + 0.7) * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

const grass = (x, y) => {
  const cx = Math.floor(x / TSIZ);
  const cy = Math.floor(y / TSIZ);

  // Background: near-black ground with subtle low-freq variation
  let bladeV = noise(x, y, 0) * 0.15;

  // Check 3×3 neighbourhood of tuft cells
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      // Wrapped grid index for deterministic tuft properties
      const tci = ((cx + di) % TCOLS + TCOLS) % TCOLS;
      const tcj = ((cy + dj) % TROWS + TROWS) % TROWS;

      // Tuft center: cell origin + deterministic jitter [0, TSIZ*0.65]
      const jx = hsh(tci,       tcj * 7) * TSIZ * 0.65;
      const jy = hsh(tci * 13, tcj    ) * TSIZ * 0.65;

      // Pixel → tuft center offset (unwrapped coords keep distance correct)
      const ddx = x - ((cx + di) * TSIZ + jx);
      const ddy = y - ((cy + dj) * TSIZ + jy);

      // Skip tufts that are clearly out of reach (max blade ~9px)
      if (ddx * ddx + ddy * ddy > 11 * 11) continue;

      // Blades: 5-8 per tuft, random angles, random lengths (4-9px)
      const nBlades = 5 + Math.floor(hsh(tci * 3 + 0.1, tcj + 5.7) * 4);
      for (let b = 0; b < nBlades; b++) {
        const angle = hsh(tci + b * 1.7, tcj + b * 2.9) * Math.PI * 2;
        const bLen  = 4 + hsh(tci * 0.5 + b + 3, tcj * 2 + b) * 5;
        const bc = Math.cos(angle), bs = Math.sin(angle);

        const along = ddx * bc + ddy * bs;          // 0=base, bLen=tip
        const perp  = Math.abs(-ddx * bs + ddy * bc); // distance from blade axis

        if (along >= -0.5 && along <= bLen + 0.5 && perp < 0.95) {
          const t  = Math.max(0, along) / bLen;
          bladeV = Math.max(bladeV, 0.15 + t * 0.85);  // dark base → bright tip
        }
      }
    }
  }

  // Occasional sun-caught bright highlight at blade tips
  if (bladeV > 0.84 && grain(x, y, 5) > 0.76) return GRASS_PAL[5];

  return quantise(Math.max(0, Math.min(1, bladeV)), GRASS_PAL, x, y, 0.12);
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
