// scripts/process-mj-house-bg.js
// Builds the Max (MJ's yard) boss background from the source house scene:
//   1. trim the roof off the top, cover-fit to the 480x270 arena
//   2. erase the decorative flower/bush specks on the lawn by filling them
//      with grass sampled from a clean patch (random pool → keeps texture, no smear)
//
// Usage: node scripts/process-mj-house-bg.js <source.png>   (defaults to ~/Downloads/mj_house.png)

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'assets', 'backgrounds', 'max_football.png');
const W = 480, H = 270, ch = 4;

// Big tree canopies — never touch these when cleaning (they'd get erased)
const TREE_BOXES = [
  [115, 50, 245, 246],  // left-center pine  [x0,y0,x1,y1]
  [395, 55, 485, 252],  // right pine
];
const inTree = (x, y) => TREE_BOXES.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

// Yard region to clean (below the house strip, inside the fences)
const YARD = [42, 48, 468, 240];

async function run() {
  const src = process.argv[2] || join(homedir(), 'Downloads', 'mj_house.png');
  const meta = await sharp(src).metadata();
  const topCut = Math.round(meta.height * 0.10);

  const base = await sharp(src)
    .extract({ left: 0, top: topCut, width: meta.width, height: meta.height - topCut })
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .ensureAlpha().raw().toBuffer();

  const out = Buffer.from(base);
  const at = (x, y, c) => base[(y * W + x) * ch + c];

  // Build a pool of clean grass pixels from open mid-yard (no specks/trees there)
  const pool = [];
  for (let y = 110; y <= 175; y++)
    for (let x = 210; x <= 320; x++)
      pool.push([at(x, y, 0), at(x, y, 1), at(x, y, 2)]);

  // A pixel is a "speck" if it's not clearly green-dominant (pink/white/light debris)
  const isSpeck = (x, y) => {
    const r = at(x, y, 0), g = at(x, y, 1), b = at(x, y, 2);
    const mn = Math.min(r, g, b);
    const greenDom = g > r + 6 && g > b + 6;      // healthy grass
    return !greenDom && (mn > 90 || r > g - 2);   // pinkish / whitish / pale
  };

  // Mark specks, then dilate the mask by 1px to catch anti-aliased edges
  const [yx0, yy0, yx1, yy1] = YARD;
  const mask = new Uint8Array(W * H);
  for (let y = yy0; y <= yy1; y++)
    for (let x = yx0; x <= yx1; x++)
      if (!inTree(x, y) && isSpeck(x, y)) mask[y * W + x] = 1;

  const dil = new Uint8Array(mask);
  for (let y = yy0; y <= yy1; y++)
    for (let x = yx0; x <= yx1; x++) {
      if (!mask[y * W + x]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= yx0 && nx <= yx1 && ny >= yy0 && ny <= yy1 && !inTree(nx, ny)) dil[ny * W + nx] = 1;
        }
    }

  let n = 0;
  for (let y = yy0; y <= yy1; y++)
    for (let x = yx0; x <= yx1; x++) {
      if (!dil[y * W + x]) continue;
      const g = pool[(Math.random() * pool.length) | 0];
      const di = (y * W + x) * ch;
      out[di] = g[0]; out[di + 1] = g[1]; out[di + 2] = g[2]; out[di + 3] = 255;
      n++;
    }

  const png = await sharp(out, { raw: { width: W, height: H, channels: ch } }).png().toBuffer();
  writeFileSync(OUT, png);
  console.log(`✓ max_football.png rebuilt — cleaned ${n} speck pixels`);
}
run().catch(e => { console.error(e); process.exit(1); });
