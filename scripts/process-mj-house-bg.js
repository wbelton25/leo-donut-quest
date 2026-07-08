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

// Yard region to clean (below the house/stone strip, inside the fences)
const YARD = [44, 55, 466, 242];

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
  const bright = (x, y) => (at(x, y, 0) + at(x, y, 1) + at(x, y, 2)) / 3;
  const greenDom = (x, y) => at(x, y, 1) > at(x, y, 0) + 4 && at(x, y, 1) > at(x, y, 2) + 4;

  // Colour-only speck test: the flowers are LIGHT (white/grey petals, pink centres)
  // and not green. Brown trunks (dark) and green trees fail the brightness test, so
  // they're never touched — no spatial protection boxes needed.
  const isSpeck = (x, y) => bright(x, y) > 132 && !greenDom(x, y);

  const [yx0, yy0, yx1, yy1] = YARD;
  const mask = new Uint8Array(W * H);
  for (let y = yy0; y <= yy1; y++)
    for (let x = yx0; x <= yx1; x++)
      if (isSpeck(x, y)) mask[y * W + x] = 1;

  // Dilate 2px to catch anti-aliased flower edges
  const dil = new Uint8Array(mask);
  for (let y = yy0; y <= yy1; y++)
    for (let x = yx0; x <= yx1; x++) {
      if (!mask[y * W + x]) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= yx0 && nx <= yx1 && ny >= yy0 && ny <= yy1) dil[ny * W + nx] = 1;
        }
    }

  // Fill each masked pixel from the NEAREST local grass pixel (matches lighting,
  // no visible patch). Search outward in rings for a green-dominant, unmasked pixel.
  const findGrass = (x, y) => {
    for (let r = 3; r <= 22; r += 2) {
      for (const [dx, dy] of [[r,0],[-r,0],[0,r],[0,-r],[r,r],[-r,-r],[r,-r],[-r,r]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        if (!dil[ny * W + nx] && greenDom(nx, ny)) return [at(nx, ny, 0), at(nx, ny, 1), at(nx, ny, 2)];
      }
    }
    return [78, 112, 58]; // fallback grass
  };

  let n = 0;
  for (let y = yy0; y <= yy1; y++)
    for (let x = yx0; x <= yx1; x++) {
      if (!dil[y * W + x]) continue;
      const g = findGrass(x, y);
      const di = (y * W + x) * ch;
      out[di] = g[0]; out[di + 1] = g[1]; out[di + 2] = g[2]; out[di + 3] = 255;
      n++;
    }

  const png = await sharp(out, { raw: { width: W, height: H, channels: ch } }).png().toBuffer();
  writeFileSync(OUT, png);
  console.log(`✓ max_football.png rebuilt — cleaned ${n} speck pixels`);
}
run().catch(e => { console.error(e); process.exit(1); });
