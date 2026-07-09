// scripts/process-golfer.js
// Cleans the golfer sprite sheet (checkerboard preview -> transparency) and
// RE-PACKS the 8 golfer poses into a uniform, bottom-aligned strip so they
// animate without drift. The source frames aren't on a clean grid (rows sit at
// odd y offsets), so we detect each golfer's true bounding box and re-lay them.
//
// Usage: node scripts/process-golfer.js [source]   (defaults to ~/Downloads/golfer.jpg)
// Output: public/assets/sprites/golfer.png (8 frames of FRAME_W x FRAME_H)
//         frames 0-3 = swing, 4-7 = idle

import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'assets', 'sprites', 'golfer.png');

const FRAME_W = 196;
const FRAME_H = 248;

async function run() {
  const src = process.argv[2] || join(homedir(), 'Downloads', 'golfer.jpg');
  const { data, info } = await sharp(src).resize(1024, 1024, { fit: 'fill' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = 4;

  // 1. Strip the checkerboard preview via edge-seeded flood fill.
  const isBg = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return (r + g + b) / 3 > 140 && Math.max(r, g, b) - Math.min(r, g, b) < 48;
  };
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
  const rgba = Buffer.from(data);
  for (let p = 0; p < W * H; p++) if (clear[p]) rgba[p * ch + 3] = 0;
  const opaque = (x, y) => rgba[(y * W + x) * ch + 3] > 40;

  // 2. Find the two golfer rows (content bands separated by empty gaps).
  const rowHas = (y) => { for (let x = 0; x < W; x++) if (opaque(x, y)) return true; return false; };
  const bands = [];
  let s = -1;
  for (let y = 0; y < H; y++) {
    if (rowHas(y)) { if (s < 0) s = y; }
    else { if (s >= 0) { bands.push([s, y - 1]); s = -1; } }
  }
  if (s >= 0) bands.push([s, H - 1]);
  const golferBands = bands.filter(b => b[1] - b[0] > 120).slice(0, 2); // 2 golfer rows (skip carts)

  // 3. Within each band, find the 4 golfer columns and their tight boxes.
  const boxes = [];
  for (const [y0, y1] of golferBands) {
    const colHas = (x) => { for (let y = y0; y <= y1; y++) if (opaque(x, y)) return true; return false; };
    const runs = []; let cs = -1;
    for (let x = 0; x < W; x++) {
      if (colHas(x)) { if (cs < 0) cs = x; }
      else { if (cs >= 0) { runs.push([cs, x - 1]); cs = -1; } }
    }
    if (cs >= 0) runs.push([cs, W - 1]);
    for (const [x0, x1] of runs.filter(r => r[1] - r[0] > 30)) {
      let mnx = W, mxx = 0, mny = y1, mxy = y0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (opaque(x, y)) {
        if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
      }
      boxes.push([mnx, mny, mxx - mnx + 1, mxy - mny + 1]);
    }
  }
  if (boxes.length !== 8) console.warn(`[process-golfer] expected 8 golfers, found ${boxes.length}`);

  // 4. Extract each box and place it into a uniform frame: horizontally centered,
  //    feet on the bottom (so the swing club extends up, body stays put).
  const cleanPng = await sharp(rgba, { raw: { width: W, height: H, channels: ch } }).png().toBuffer();
  const frameComposites = [];
  for (let i = 0; i < boxes.length; i++) {
    const [bx, by, bw, bh] = boxes[i];
    const crop = await sharp(cleanPng).extract({ left: bx, top: by, width: bw, height: bh }).png().toBuffer();
    const frame = await sharp({ create: { width: FRAME_W, height: FRAME_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: crop, left: Math.round((FRAME_W - bw) / 2), top: FRAME_H - bh - 2 }])
      .png().toBuffer();
    frameComposites.push({ input: frame, left: i * FRAME_W, top: 0 });
  }

  const sheet = await sharp({ create: { width: FRAME_W * boxes.length, height: FRAME_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frameComposites).png().toBuffer();
  await sharp(sheet).toFile(OUT);
  console.log(`✓ golfer.png (${boxes.length} frames of ${FRAME_W}x${FRAME_H})`);
}
run().catch(e => { console.error(e.message); process.exit(1); });
