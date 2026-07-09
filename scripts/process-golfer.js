// scripts/process-golfer.js
// Cleans the golfer sprite sheet (checkerboard transparency preview -> real
// transparency) so it can be loaded as a 256x256-frame spritesheet.
//
// Usage: node scripts/process-golfer.js [source]   (defaults to ~/Downloads/golfer.jpg)
// Output: public/assets/sprites/golfer.png (1024x1024, frames 0-7 = golfer poses)

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'assets', 'sprites', 'golfer.png');

async function run() {
  const src = process.argv[2] || join(homedir(), 'Downloads', 'golfer.jpg');
  const { data, info } = await sharp(src).resize(1024, 1024, { fit: 'fill' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info, ch = 4;

  // Checkerboard preview = light, colour-neutral squares (white + grey).
  const isBg = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const bright = (r + g + b) / 3;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    return bright > 140 && sat < 48;
  };

  // Edge-seeded flood fill so the checkerboard behind/between frames clears but
  // light details enclosed inside each golfer (hat, ball) are preserved.
  const clear = new Uint8Array(W * H), seen = new Uint8Array(W * H), st = [];
  for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { st.push(y * W, y * W + W - 1); }
  while (st.length) {
    const p = st.pop();
    if (seen[p]) continue; seen[p] = 1;
    if (!isBg(p * ch)) continue;
    clear[p] = 1;
    const x = p % W, y = (p - x) / W;
    if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1);
    if (y > 0) st.push(p - W); if (y < H - 1) st.push(p + W);
  }
  const out = Buffer.from(data);
  for (let p = 0; p < W * H; p++) if (clear[p]) out[p * ch + 3] = 0;

  const png = await sharp(out, { raw: { width: W, height: H, channels: ch } }).png().toBuffer();
  writeFileSync(OUT, png);
  console.log('✓ golfer.png (1024x1024, 256px frames)');
}
run().catch(e => { console.error(e.message); process.exit(1); });
