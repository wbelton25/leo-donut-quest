// scripts/make-teammates.js
// Generates Carson & Justin sprite sheets by recoloring Leo's finished sheet.
// Leo stays the reference; teammates are palette swaps of his exact art.
//
//   Justin — blue bike (kept), YELLOW shirt, BLACK hair
//   Carson — RED bike, GREEN shirt, brown hair (like Leo), slightly smaller
//
// Usage:  node scripts/make-teammates.js
// Output: public/assets/sprites/{carson,justin}.{png,json}
//
// Leo's regions (determined by inspecting leo.png):
//   bike  = blue pixels (hue ~200°) anywhere
//   shirt = dark, low-saturation pixels in the torso band (y 12–28)
//   hair  = brown pixels (hue ~15–45°) in the head band (y < 19)

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'public', 'assets', 'sprites');
const FRAME     = 48;

// ── colour helpers ────────────────────────────────────────────────────────────
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h, s, l = (mx + mn) / 2;
  if (mx === mn) { h = s = 0; }
  else {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    switch (mx) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}
function hsl2rgb(h, s, l) {
  h /= 360;
  const hue2 = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2(p, q, h + 1 / 3); g = hue2(p, q, h); b = hue2(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ── per-pixel recolour ────────────────────────────────────────────────────────
// opts: { bikeHue|null, shirt:{h,s}|null, blackHair:bool }
function recolorPixel(r, g, b, a, y, opts) {
  if (a < 40) return [r, g, b, a];
  const [h, s, l] = rgb2hsl(r, g, b);

  // Bike = blue (hue 175–225), well-saturated
  if (opts.bikeHue !== null && s > 0.25 && h >= 175 && h <= 230) {
    const [nr, ng, nb] = hsl2rgb(opts.bikeHue, Math.max(s, 0.55), l);
    return [nr, ng, nb, a];
  }

  // Hair = brown (hue 12–45) in the head band
  if (opts.blackHair && y < 19 && h >= 12 && h <= 48 && l < 0.5 && s > 0.12) {
    const nl = l * 0.35;                       // keep shading, crush to near-black
    const [nr, ng, nb] = hsl2rgb(0, 0, nl);
    return [nr, ng, nb, a];
  }

  // Shirt = dark, low-saturation pixels in the torso band → repaint to a colour.
  // Map the shirt's luminance onto a coloured ramp so folds/shading survive.
  if (opts.shirt && y >= 12 && y <= 29 && s < 0.30 && l >= 0.05 && l <= 0.5) {
    const nl = 0.20 + Math.min(1, l / 0.5) * 0.42; // 0.20–0.62 coloured ramp
    const [nr, ng, nb] = hsl2rgb(opts.shirt.h, opts.shirt.s, nl);
    return [nr, ng, nb, a];
  }

  return [r, g, b, a];
}

async function buildVariant(name, opts, scale = 1) {
  const src = join(OUT_DIR, 'leo.png');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info, ch = 4;
  const out = Buffer.from(data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * ch;
      const [nr, ng, nb, na] = recolorPixel(data[i], data[i + 1], data[i + 2], data[i + 3], y, opts);
      out[i] = nr; out[i + 1] = ng; out[i + 2] = nb; out[i + 3] = na;
    }
  }

  let sheet = sharp(out, { raw: { width, height, channels: ch } });

  // Optional shrink: scale each frame down and bottom-align (wheels stay grounded)
  if (scale !== 1) {
    const recolored = await sheet.png().toBuffer();
    const nF = Math.round(FRAME * scale);
    const composites = [];
    for (let f = 0; f < width / FRAME; f++) {
      const frameBuf = await sharp(recolored)
        .extract({ left: f * FRAME, top: 0, width: FRAME, height: FRAME })
        .resize(nF, nF, { kernel: sharp.kernel.nearest })
        .png().toBuffer();
      composites.push({ input: frameBuf, left: f * FRAME + Math.floor((FRAME - nF) / 2), top: FRAME - nF });
    }
    sheet = sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites);
  }

  const buf = await sheet.png().toBuffer();
  writeFileSync(join(OUT_DIR, `${name}.png`), buf);

  // Reuse Leo's atlas JSON verbatim (identical frame layout), just rename image
  const atlas = JSON.parse(readFileSync(join(OUT_DIR, 'leo.json'), 'utf8'));
  atlas.meta.image = `${name}.png`;
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(atlas, null, 2));
  console.log(`✓ ${name}.png + ${name}.json`);
}

async function run() {
  // Justin: keep blue bike, yellow shirt, black hair
  await buildVariant('justin', { bikeHue: null, shirt: { h: 50, s: 0.85 }, blackHair: true });
  // Carson: red bike, green shirt, brown hair, only a touch smaller than Leo
  await buildVariant('carson', { bikeHue: 2, shirt: { h: 132, s: 0.6 }, blackHair: false }, 0.94);
}
run().catch(e => { console.error(e); process.exit(1); });
