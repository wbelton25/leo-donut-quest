// scripts/process-boss-char.js
// Turns an AI-generated character image into a transparent boss sprite, the same
// way Grace was made. Removes a solid/near-solid background (sampled from the
// corners) via edge-seeded flood fill, trims to the character, and saves it.
//
// Usage:
//   node scripts/process-boss-char.js <input.png> <name> [tolerance]
//
//   <name> is the output sprite key file, one of:
//     nora | max | justin_max | edie   (matches the loaders in PreloadScene)
//   [tolerance] optional 0-120 (default 60) — raise if bg specks remain,
//     lower if edges of the character get eaten.
//
// Example:
//   node scripts/process-boss-char.js ~/Downloads/nora_ai.png nora

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'sprites');

async function run() {
  const src  = process.argv[2];
  const name = process.argv[3];
  const tol  = Number(process.argv[4] ?? 60);
  if (!src || !name) {
    console.error('Usage: node scripts/process-boss-char.js <input.png> <name> [tolerance]');
    console.error('  name = nora | max | justin_max | edie');
    process.exit(1);
  }

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info, ch = 4;

  // Background colour = average of the four corners
  const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]];
  let br = 0, bg = 0, bb = 0;
  corners.forEach(([x, y]) => { const i = (y * W + x) * ch; br += data[i]; bg += data[i + 1]; bb += data[i + 2]; });
  br /= 4; bg /= 4; bb /= 4;

  const near = (i) => {
    const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
    return Math.sqrt(dr * dr + dg * dg + db * db) < tol;
  };

  // Edge-seeded flood fill: only clears background connected to the border, so
  // matching colours *inside* the character (enclosed) are preserved.
  const clear = new Uint8Array(W * H);
  const seen  = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + (W - 1)); }

  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!near(p * ch)) continue;
    clear[p] = 1;
    const x = p % W, y = (p - x) / W;
    if (x > 0)     stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0)     stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }

  const out = Buffer.from(data);
  for (let p = 0; p < W * H; p++) if (clear[p]) out[p * ch + 3] = 0;

  // Trim fully-transparent margins so the character fills the sprite
  const png = await sharp(out, { raw: { width: W, height: H, channels: ch } })
    .png().trim().toBuffer();

  const outPath = join(OUT_DIR, `${name}.png`);
  writeFileSync(outPath, png);
  const meta = await sharp(png).metadata();
  console.log(`✓ ${name}.png  (${meta.width}x${meta.height})  bg≈rgb(${br | 0},${bg | 0},${bb | 0})  tol=${tol}`);
}
run().catch(e => { console.error(e.message); process.exit(1); });
