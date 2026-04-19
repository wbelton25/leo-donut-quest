// scripts/process-mj.js
// Slices the AI-generated 2×3 MJ scooter reference image into a Phaser texture atlas.
//
// Usage:
//   node scripts/process-mj.js <path-to-source-image.png|.jpg>
//
// Output:
//   public/assets/sprites/mj.png   — packed sprite sheet (12 frames, 576×48px)
//   public/assets/sprites/mj.json  — Phaser atlas JSON
//
// Source image layout (3 columns × 2 rows):
//   Row 0: [back-left walking,  back/straight standing,  front-right facing]   ← top row
//   Row 1: [left side + kick,   front-facing mid-kick,   right side + kick  ]  ← bottom row
//
// Frame mapping — consistent angles only (avoids "spinning" effect):
//   right: cells (1,2) and (0,2) — right side profile + slight front-right angle
//   left:  mirrors of right frames via horizontal flip
//   down:  cell (1,1) only — front-facing, repeated 3×
//   up:    cells (0,1) and (0,0) — back view + back-left variant

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT    = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'sprites');

// ── Output frame size ─────────────────────────────────────────────────────────
const FRAME_SIZE = 48;  // 3 × TILE_SIZE=16

// ── Source grid ───────────────────────────────────────────────────────────────
const SRC_COLS = 3;
const SRC_ROWS = 2;

// ── Frame mapping: [frameName, sourceRow, sourceCol, options?] ───────────────
// right-0: clean right side profile (kick leg out, clearly rightward)
// right-1: front-right angle for variety (gives the same subtle "pedal" jitter as Leo)
// right-2: repeat right-0 to close the 3-frame cycle
// left frames: horizontal mirrors of right frames — identical quality
// down: front-facing kick pose (row1,col1) — only one clean front view, repeat ×3
// up:   back view (row0,col1) + back-left variant (row0,col0) for slight motion
const FRAMES = [
  ['right-0', 1, 2],                    // right side kick profile
  ['right-1', 0, 2],                    // front-right angle variant
  ['right-2', 1, 2],                    // repeat of right-0
  ['left-0',  1, 2, { flop: true }],   // mirror of right-0
  ['left-1',  0, 2, { flop: true }],   // mirror of right-1
  ['left-2',  1, 2, { flop: true }],   // mirror of right-0 again
  ['down-0',  1, 1],                    // front-facing kick
  ['down-1',  1, 1],                    // repeat
  ['down-2',  1, 1],                    // repeat
  ['up-0',    0, 1],                    // back view
  ['up-1',    0, 0],                    // back-left variant
  ['up-2',    0, 1],                    // repeat back view
];

// ── Background removal ────────────────────────────────────────────────────────
// Edge-seeded BFS flood fill: remove "light neutral" pixels reachable from the
// image border. Catches both white and grey checkerboard/solid backgrounds
// while preserving enclosed light pixels inside the sprite.

async function removeBackground(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const ch = 4;
  const total = width * height;

  function isBgLike(r, g, b) {
    const brightness  = (r + g + b) / 3;
    const saturation  = Math.max(r, g, b) - Math.min(r, g, b);
    return brightness > 145 && saturation < 45;
  }

  const transparent = new Uint8Array(total);
  const visited     = new Uint8Array(total);
  const queue = [];

  for (let x = 0; x < width; x++) {
    queue.push(x);
    queue.push((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    queue.push(y * width);
    queue.push(y * width + (width - 1));
  }

  while (queue.length > 0) {
    const pos = queue.pop();
    if (visited[pos]) continue;
    visited[pos] = 1;

    const base = pos * ch;
    const r = data[base], g = data[base + 1], b = data[base + 2];
    if (!isBgLike(r, g, b)) continue;

    transparent[pos] = 1;

    const x = pos % width;
    const y = (pos - x) / width;
    if (x > 0)          queue.push(y * width + x - 1);
    if (x < width - 1)  queue.push(y * width + x + 1);
    if (y > 0)          queue.push((y - 1) * width + x);
    if (y < height - 1) queue.push((y + 1) * width + x);
  }

  const result = Buffer.from(data);
  for (let i = 0; i < total; i++) {
    if (transparent[i]) result[i * ch + 3] = 0;
  }

  return sharp(result, { raw: { width, height, channels: ch } }).png().toBuffer();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const srcPath = process.argv[2];
  if (!srcPath) {
    console.error('Usage: node scripts/process-mj.js <source-image.png|.jpg>');
    process.exit(1);
  }

  const meta  = await sharp(srcPath).metadata();
  const srcW  = meta.width;
  const srcH  = meta.height;
  const cellW = Math.floor(srcW / SRC_COLS);
  const cellH = Math.floor(srcH / SRC_ROWS);

  console.log(`Source: ${srcW}×${srcH}px  grid: ${SRC_COLS}col×${SRC_ROWS}row  cells: ${cellW}×${cellH}px  output: ${FRAME_SIZE}×${FRAME_SIZE}px`);
  console.log('Processing frames...');

  const cellCache = {};
  const getCellBuffer = async (row, col, options = {}) => {
    const key = `${row},${col},${options.flop ? 'f' : ''}`;
    if (cellCache[key]) return cellCache[key];

    let pipeline = sharp(srcPath)
      .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH });

    if (options.flop) pipeline = pipeline.flop();

    const extracted = await pipeline.toBuffer();
    const noBg      = await removeBackground(extracted);

    const scaled = await sharp(noBg)
      .resize(FRAME_SIZE, FRAME_SIZE, {
        kernel: sharp.kernel.nearest,
        fit:    'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    cellCache[key] = scaled;
    return scaled;
  };

  const frameBuffers = await Promise.all(
    FRAMES.map(([, row, col, opts]) => getCellBuffer(row, col, opts ?? {}))
  );

  const totalW = FRAME_SIZE * FRAMES.length;
  const composites = frameBuffers.map((buf, i) => ({
    input: buf,
    left: i * FRAME_SIZE,
    top: 0,
  }));

  mkdirSync(OUT_DIR, { recursive: true });

  const sheetBuffer = await sharp({
    create: {
      width: totalW, height: FRAME_SIZE,
      channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  writeFileSync(join(OUT_DIR, 'mj.png'), sheetBuffer);

  const frames = {};
  FRAMES.forEach(([name], i) => {
    frames[name] = {
      frame:            { x: i * FRAME_SIZE, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
      rotated:          false,
      trimmed:          false,
      spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
      sourceSize:       { w: FRAME_SIZE, h: FRAME_SIZE },
    };
  });

  writeFileSync(join(OUT_DIR, 'mj.json'), JSON.stringify({
    frames,
    meta: {
      app:    'process-mj.js',
      image:  'mj.png',
      format: 'RGBA8888',
      size:   { w: totalW, h: FRAME_SIZE },
      scale:  '1',
    },
  }, null, 2));

  console.log(`\n✓  mj.png  (${totalW}×${FRAME_SIZE}px, ${FRAMES.length} frames)`);
  console.log(`✓  mj.json`);
  console.log('\nFrame layout:');
  FRAMES.forEach(([name, row, col, opts], i) => {
    const flip = opts?.flop ? ' (flipped)' : '';
    console.log(`  [${String(i).padStart(2)}] x=${String(i * FRAME_SIZE).padStart(3)}  ${name.padEnd(8)}  ← cell (row${row},col${col})${flip}`);
  });
}

run().catch(err => { console.error(err.message); process.exit(1); });
