// scripts/process-deer.js
// Slices the AI-generated 2×2 deer reference image into a Phaser atlas.
//
// Usage:
//   node scripts/process-deer.js <path-to-source-image.png|.jpg>
//
// Source image layout (2 cols × 2 rows):
//   (row 0, col 0) — deer facing RIGHT, side view
//   (row 0, col 1) — deer facing RIGHT, alternate pose
//   (row 1, col 0) — deer from BEHIND  (back / up view)
//   (row 1, col 1) — deer facing FRONT (front / down view)
//
// Output → public/assets/sprites/deer.png + deer.json

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'sprites');
const FRAME_SIZE = 48;

// [frameName, sourceRow, sourceCol, options?]
// Left frames are horizontal mirrors of right frames (identical pose quality)
// The source cells (row 0) show the deer facing LEFT — mirror them for right,
// use them as-is for left.
const FRAMES = [
  ['right-0', 0, 0, { flop: true }],
  ['right-1', 0, 1, { flop: true }],
  ['right-2', 0, 0, { flop: true }],
  ['left-0',  0, 0],
  ['left-1',  0, 1],
  ['left-2',  0, 0],
  ['down-0',  1, 1],            // front / facing camera
  ['down-1',  1, 1],
  ['down-2',  1, 1],
  ['up-0',    1, 0],            // back / walking away
  ['up-1',    1, 0],
  ['up-2',    1, 0],
];

// ── Background removal (checkerboard / light neutral bg) ───────────────────
async function removeBackground(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const ch = 4, total = width * height;

  function isBgLike(r, g, b) {
    const brightness = (r + g + b) / 3;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    return brightness > 140 && saturation < 50;
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
    console.error('Usage: node scripts/process-deer.js <source-image.png>');
    process.exit(1);
  }

  const meta  = await sharp(srcPath).metadata();
  const cellW = Math.floor(meta.width  / 2);
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

  writeFileSync(join(OUT_DIR, 'deer.png'), sheet);

  const frames = {};
  FRAMES.forEach(([name], i) => {
    frames[name] = {
      frame: { x: i * FRAME_SIZE, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
      rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
      sourceSize: { w: FRAME_SIZE, h: FRAME_SIZE },
    };
  });
  writeFileSync(join(OUT_DIR, 'deer.json'), JSON.stringify({
    frames,
    meta: { app: 'process-deer.js', image: 'deer.png', format: 'RGBA8888',
            size: { w: totalW, h: FRAME_SIZE }, scale: '1' },
  }, null, 2));

  console.log(`✓  deer.png  (${totalW}×${FRAME_SIZE}, ${FRAMES.length} frames)`);
}

run().catch(err => { console.error(err.message); process.exit(1); });
