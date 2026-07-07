// scripts/process-bike.js
// Builds a Phaser atlas from 4 individual biker direction images.
//
// Usage:
//   node scripts/process-bike.js <right.png> <down.png> <up.png> [left.png]
//
// If left.png is omitted, the right image is mirrored for left frames.
// Output → public/assets/sprites/bike.png + bike.json

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'sprites');
const FRAME_SIZE = 48;

// ── Background removal — light / checkerboard bg ──────────────────────────
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

async function prepareFrame(srcPath, flop = false) {
  let pipe = sharp(srcPath);
  if (flop) pipe = pipe.flop();
  const buf   = await pipe.toBuffer();
  const noBg  = await removeBackground(buf);
  return sharp(noBg)
    .resize(FRAME_SIZE, FRAME_SIZE, {
      kernel: sharp.kernel.nearest,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).png().toBuffer();
}

async function run() {
  const [rightSrc, downSrc, upSrc, leftSrc] = process.argv.slice(2);
  if (!rightSrc || !downSrc || !upSrc) {
    console.error('Usage: node scripts/process-bike.js <right.png> <down.png> <up.png> [left.png]');
    process.exit(1);
  }

  console.log(`right: ${rightSrc}`);
  console.log(`down:  ${downSrc}`);
  console.log(`up:    ${upSrc}`);
  console.log(`left:  ${leftSrc ?? '(mirror of right)'}`);

  const rightBuf = await prepareFrame(rightSrc);
  const downBuf  = await prepareFrame(downSrc);
  const upBuf    = await prepareFrame(upSrc);
  const leftBuf  = leftSrc
    ? await prepareFrame(leftSrc)
    : await prepareFrame(rightSrc, true);

  // Build 12-frame atlas: right×3, left×3, down×3, up×3
  const FRAMES = [
    ['right-0', rightBuf],
    ['right-1', rightBuf],
    ['right-2', rightBuf],
    ['left-0',  leftBuf],
    ['left-1',  leftBuf],
    ['left-2',  leftBuf],
    ['down-0',  downBuf],
    ['down-1',  downBuf],
    ['down-2',  downBuf],
    ['up-0',    upBuf],
    ['up-1',    upBuf],
    ['up-2',    upBuf],
  ];

  mkdirSync(OUT_DIR, { recursive: true });

  const totalW = FRAME_SIZE * FRAMES.length;
  const sheet  = await sharp({
    create: { width: totalW, height: FRAME_SIZE, channels: 4, background: { r:0,g:0,b:0,alpha:0 } },
  }).composite(FRAMES.map(([, buf], i) => ({ input: buf, left: i * FRAME_SIZE, top: 0 })))
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
