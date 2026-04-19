// scripts/process-leo.js
// Slices the AI-generated 3×3 Leo reference image into a Phaser texture atlas.
//
// Usage:
//   node scripts/process-leo.js <path-to-source-image.png|.jpg>
//
// Output:
//   public/assets/sprites/leo.png   — packed sprite sheet (12 frames)
//   public/assets/sprites/leo.json  — Phaser atlas JSON
//
// Source image layout (3 columns × 3 rows):
//   Row 0: [front/down,   back/up,    right-angled-front]   ← top row
//   Row 1: [left-side,    left-back,  right-side         ]   ← middle (cleanest profiles)
//   Row 2: [down-side,    3D/iso,     right-side-alt     ]   ← bottom
//
// Frame mapping — ONLY consistent angles per direction (avoids "spinning" effect):
//   right: cells (1,2) and (2,2) — both clean right-side profiles
//   left:  cells (1,2) and (2,2) MIRRORED — perfect horizontal flip of right frames
//          (mirroring gives identical jitter quality to right direction)
//   down:  cell  (0,0) only     — front view
//   up:    cell  (0,1) only     — back view
//
// Note: (0,2) "Right-angled-front" is intentionally excluded from right frames
// because its different angle causes a spinning illusion when animated at 8fps.

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT    = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'sprites');

// ── Output frame size ─────────────────────────────────────────────────────────
const FRAME_SIZE = 48;  // 3 × TILE_SIZE=16; bike needs 3 tiles

// ── Frame mapping: [frameName, sourceRow, sourceCol, options?] ───────────────
// right-2 repeats right-0 intentionally to create a 2-unique-frame cycle (1→2→1)
// left frames are horizontal mirrors of right frames — identical jitter quality
// down/up have only one view each — duplicated to fill 3-frame slot
const FRAMES = [
  ['right-0', 1, 2],                    // clean right side profile
  ['right-1', 2, 2],                    // right side variant (same angle, different pose)
  ['right-2', 1, 2],                    // repeat of right-0 (completes 3-frame cycle)
  ['left-0',  1, 2, { flop: true }],   // mirror of right-0
  ['left-1',  2, 2, { flop: true }],   // mirror of right-1
  ['left-2',  1, 2, { flop: true }],   // mirror of right-0 again
  ['down-0',  0, 0],                    // front view
  ['down-1',  0, 0],                    // repeat
  ['down-2',  0, 0],                    // repeat
  ['up-0',    0, 1],                    // back view
  ['up-1',    0, 1],                    // repeat
  ['up-2',    0, 1],                    // repeat
];

// ── Background removal ────────────────────────────────────────────────────────
// The source image has a checkerboard transparency preview baked in (grey + white
// squares). This function removes it using edge-seeded flood fill: start from
// every edge pixel, propagate inward through "light neutral" pixels, mark as
// transparent. Sprites are enclosed so their light interior pixels (e.g., white
// spokes) aren't reachable from the edge and are preserved.

async function removeBackground(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const ch = 4; // RGBA
  const total = width * height;

  // A pixel is "background-like" when it's light AND colour-neutral.
  // Covers both white (#fff) and grey (#bbb–#ccc) checkerboard squares.
  // Uses a generous threshold so JPEG compression artifacts around squares
  // are also caught.
  function isBgLike(r, g, b) {
    const brightness  = (r + g + b) / 3;
    const saturation  = Math.max(r, g, b) - Math.min(r, g, b);
    return brightness > 145 && saturation < 45;
  }

  const transparent = new Uint8Array(total); // 1 = should be cleared
  const visited     = new Uint8Array(total);

  // Seed queue with all edge pixel indices (iterative BFS/DFS — no recursion)
  const queue = [];
  for (let x = 0; x < width; x++) {
    queue.push(x);                       // top row
    queue.push((height - 1) * width + x); // bottom row
  }
  for (let y = 1; y < height - 1; y++) {
    queue.push(y * width);               // left col
    queue.push(y * width + (width - 1)); // right col
  }

  while (queue.length > 0) {
    const pos = queue.pop(); // depth-first is fine here; avoids shift() O(n)
    if (visited[pos]) continue;
    visited[pos] = 1;

    const base = pos * ch;
    const r = data[base], g = data[base + 1], b = data[base + 2];
    if (!isBgLike(r, g, b)) continue; // stop propagating at sprite edge

    transparent[pos] = 1;

    const x = pos % width;
    const y = (pos - x) / width;
    if (x > 0)          queue.push(y * width + x - 1);
    if (x < width - 1)  queue.push(y * width + x + 1);
    if (y > 0)          queue.push((y - 1) * width + x);
    if (y < height - 1) queue.push((y + 1) * width + x);
  }

  // Apply: zero out alpha for background pixels
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
    console.error('Usage: node scripts/process-leo.js <source-image.png|.jpg>');
    process.exit(1);
  }

  const meta  = await sharp(srcPath).metadata();
  const srcW  = meta.width;
  const srcH  = meta.height;
  const cellW = Math.floor(srcW / 3);
  const cellH = Math.floor(srcH / 3);

  console.log(`Source: ${srcW}×${srcH}px  cells: ${cellW}×${cellH}px  output: ${FRAME_SIZE}×${FRAME_SIZE}px`);
  console.log('Processing frames...');

  // Cache unique (row,col,flop) extractions to avoid re-processing the same cell
  const cellCache = {};
  const getCellBuffer = async (row, col, options = {}) => {
    const key = `${row},${col},${options.flop ? 'f' : ''}`;
    if (cellCache[key]) return cellCache[key];

    // Extract cell, optionally flip horizontally, remove background, then scale
    let pipeline = sharp(srcPath)
      .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH });

    if (options.flop) pipeline = pipeline.flop(); // horizontal mirror for left frames

    const extracted = await pipeline.toBuffer();
    const noBg      = await removeBackground(extracted);

    const scaled = await sharp(noBg)
      .resize(FRAME_SIZE, FRAME_SIZE, {
        kernel: sharp.kernel.nearest, // nearest-neighbour = crisp pixel art
        fit:    'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    cellCache[key] = scaled;
    return scaled;
  };

  const frameBuffers = await Promise.all(
    FRAMES.map(([, row, col, opts]) => getCellBuffer(row, col, opts))
  );

  // Pack into a single horizontal strip
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

  writeFileSync(join(OUT_DIR, 'leo.png'), sheetBuffer);

  // Build Phaser atlas JSON (Texture Packer JSON Hash format)
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

  writeFileSync(join(OUT_DIR, 'leo.json'), JSON.stringify({
    frames,
    meta: {
      app:    'process-leo.js',
      image:  'leo.png',
      format: 'RGBA8888',
      size:   { w: totalW, h: FRAME_SIZE },
      scale:  '1',
    },
  }, null, 2));

  console.log(`✓  leo.png  (${totalW}×${FRAME_SIZE}px, ${FRAMES.length} frames)`);
  console.log(`✓  leo.json`);
  console.log('\nFrame layout:');
  FRAMES.forEach(([name, row, col], i) => {
    const cached = Object.keys(cellCache).includes(`${row},${col}`);
    console.log(`  [${String(i).padStart(2)}] x=${String(i * FRAME_SIZE).padStart(3)}  ${name.padEnd(8)}  ← cell (row${row},col${col})`);
    void cached;
  });
}

run().catch(err => { console.error(err.message); process.exit(1); });
