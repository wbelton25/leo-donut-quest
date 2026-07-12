// scripts/make-sibling-heads.js
// Crops a headshot from each full-body sibling/boss sprite for the dialogue-box
// portrait. The sprites are transparent PNGs, so we find the character's content
// box, take the top slice (head + a bit of shoulders), and re-center it square.
//
// Usage: node scripts/make-sibling-heads.js
// Output: public/assets/sprites/<name>_head.png (96x96), loaded as head-<key>.

import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '..', 'public', 'assets', 'sprites');

// source file (no .png) → output basename (matches head-<key> the dialogue looks up).
// Optional explicit crop {left,top,side} for sprites the auto-detector trips on
// (Grace holds a pool noodle + water gun that skew her content box).
const MAP = [
  ['grace',      'grace', { left: 455, top: 450, side: 215 }],
  ['nora',       'nora'],
  ['max',        'max'],
  ['justin_max', 'justin_max'],  // dialogue speaker "JustinMax" → head-justinmax
  ['edie',       'edie'],
];

const HEAD_FRAC = 0.27;   // top fraction of the body that is head + shoulders

for (const [src, out, override] of MAP) {
  if (override) {
    await sharp(join(DIR, `${src}.png`))
      .extract({ left: override.left, top: override.top, width: override.side, height: override.side })
      .resize(96, 96, { kernel: 'nearest' }).png().toFile(join(DIR, `${out}_head.png`));
    console.log(`✓ ${out}_head.png  (manual crop)`);
    continue;
  }
  const { data, info } = await sharp(join(DIR, `${src}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const A = (x, y) => data[(y * W + x) * 4 + 3];

  // 1. Full content bounding box (alpha > 40).
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (A(x, y) > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const bodyH = y1 - y0;
  const headBottom = Math.round(y0 + bodyH * HEAD_FRAC);

  // 2. Head x-range within the top slice.
  let hx0 = W, hx1 = 0;
  for (let y = y0; y <= headBottom; y++) for (let x = x0; x <= x1; x++) {
    if (A(x, y) > 40) { if (x < hx0) hx0 = x; if (x > hx1) hx1 = x; }
  }

  // 3. Square crop centered on the head, top-anchored at the crown.
  const cx = Math.round((hx0 + hx1) / 2);
  const side = Math.min(H, Math.max(hx1 - hx0, headBottom - y0) + Math.round(bodyH * 0.04));
  let left = Math.max(0, Math.min(W - side, cx - Math.round(side / 2)));
  let top  = Math.max(0, Math.min(H - side, y0 - Math.round(bodyH * 0.02)));

  await sharp(join(DIR, `${src}.png`))
    .extract({ left, top, width: side, height: side })
    .resize(96, 96, { kernel: 'nearest' })
    .png()
    .toFile(join(DIR, `${out}_head.png`));
  console.log(`✓ ${out}_head.png  (from ${side}x${side} crop)`);
}
