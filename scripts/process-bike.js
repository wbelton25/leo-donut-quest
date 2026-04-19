// scripts/process-bike.js
// Slices the AI-generated 3×2 kid-on-bike reference image into a Phaser atlas.
//
// Usage:
//   node scripts/process-bike.js <path-to-source-image.png|.jpg>
//
// Source image layout (3 cols × 2 rows):
//   (row 0, col 0) — front-left diagonal view
//   (row 0, col 1) — BACK view  (kid riding away / up direction)
//   (row 0, col 2) — RIGHT side profile
//   (row 1, col 0) — FRONT view (kid riding toward camera / down direction)
//   (row 1, col 1) — front view variant
//   (row 1, col 2) — right side variant
//
// Source has a BLACK background — uses dark-flood-fill removal.
//
// Output → public/assets/sprites/bike.png + bike.json

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'sprites');
const FRAME_SIZE = 48;

const FRAMES = [
  ['right-0', 0, 2],
  ['right-1', 1, 2],
  ['right-2', 0, 2],
  ['left-0',  0, 2, { flop: true }],
  ['left-1',  1, 2, { flop: true }],
  ['left-2',  0, 2, { flop: true }],
  ['down-0',  1, 0],           // front view
  ['down-1',  1, 1],
  ['down-2',  1, 0],
  ['up-0',    0, 1],           // back view
  ['up-1',    0, 1],
  ['up-2',    0, 1],
];

// ── Background removal — BLACK background flood fill ──────────────────────
// Dark and colour-neutral pixels seeded from edges are marked transparent.
// Sprite colours (orange skin, blue jeans, dark bike) must be distinguishable
// from pure black — the threshold gives enough headroom for near-black colours
// on the sprite without swallowing them.
async function removeBackground(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const ch = 4, total = width * height;

  function isBgLike(r, g, b) {
    const brightness = (r + g + b) / 3;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    // Pure / near-pure black background; sprite darkest pixels ~20-30 brightness
    return brightness < 28 && saturation < 18;
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
    if (!isBgLike(data[base], data[base+1], data[base+2])) continue;
    transparent[pos] = 1;
    const x = pos % width, y = (pos - x) / width;
    if (x > 0)          queue.push(y * width + x - 1);
    if (x < width - 1)  queue.push(y * width + x + 1);
    if (y > 0)          queue.push((y - 1) * width + x);
    if (y < height - 1) queue.push((y + 1) * width + x);
  }

  const result = Buffer.from(data);
  for (let i = 0; i < total; i++) if (transparent[i]) result[i * ch + 3] = 0;
  return sharp(result, { raw: { width, height, channels: ch } }).png().toBuffer();
}

async function run() {
  const srcPath = process.argv[2];
  if (!srcPath) {
    console.error('Usage: node scripts/process-bike.js <source-image.png>');
    process.exit(1);
  }

  const meta  = await sharp(srcPath).metadata();
  const cellW = Math.floor(meta.width  / 3);
  const cellH = Math.floor(meta.height / 2);
  console.log(`Source: ${meta.width}×${meta.height}  cells: ${cellW}×${cellH}  output: ${FRAME_SIZE}×${FRAME_SIZE}`);

  const cache = {};
  const getCell = async (row, col, opts = {}) => {
    const key = `${row},${col},${opts.flop ? 'f' : ''}`;
    if (cache[key]) return cache[key];

    let pipe = sharp(srcPath)
      .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH });
    if (opts.flop) pipe = pipe.flop();

    const extracted = await pipe.toBuffer();
    const noBg      = await removeBackground(extracted);
    const scaled    = await sharp(noBg)
      .resize(FRAME_SIZE, FRAME_SIZE, {
        kernel: sharp.kernel.nearest,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      }).png().toBuffer();

    cache[key] = scaled;
    return scaled;
  };

  const frameBuffers = await Promise.all(FRAMES.map(([, row, col, opts]) => getCell(row, col, opts)));

  mkdirSync(OUT_DIR, { recursive: true });

  const totalW = FRAME_SIZE * FRAMES.length;
  const sheet  = await sharp({
    create: { width: totalW, height: FRAME_SIZE, channels: 4, background: { r:0,g:0,b:0,alpha:0 } },
  }).composite(frameBuffers.map((buf, i) => ({ input: buf, left: i * FRAME_SIZE, top: 0 })))
    .png().toBuffer();

  writeFileSync(join(OUT_DIR, 'bike.png'), sheet);

  const frames = {};
  FRAMES.forEach(([name], i) => {
    frames[name] = {
      frame: { x: i * FRAME_SIZE, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
      rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
      sourceSize: { w: FRAME_SIZE, h: FRAME_SIZE },
    };
  });
  writeFileSync(join(OUT_DIR, 'bike.json'), JSON.stringify({
    frames,
    meta: { app: 'process-bike.js', image: 'bike.png', format: 'RGBA8888',
            size: { w: totalW, h: FRAME_SIZE }, scale: '1' },
  }, null, 2));

  console.log(`✓  bike.png  (${totalW}×${FRAME_SIZE}, ${FRAMES.length} frames)`);
}

run().catch(err => { console.error(err.message); process.exit(1); });
