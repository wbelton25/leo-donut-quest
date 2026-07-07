// scripts/generate-road-edges.js
// Generates road textures and road-to-grass gradient textures as PNG files.
//
// Outputs:
//   public/assets/textures/road.png         — 128×128 asphalt (programmatic, no JPEG artifacts)
//   public/assets/textures/road-edge-h.png  — 16×16 horizontal strip, transparent→opaque
//   public/assets/textures/road-edge-v.png  — 16×16 vertical strip, transparent→opaque
//   public/assets/textures/road-corner.png  — 32×32 corner arc, dark road→sandy→transparent
//
// Usage: node scripts/generate-road-edges.js

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEX_DIR = join(__dirname, '..', 'public', 'assets', 'textures');
mkdirSync(TEX_DIR, { recursive: true });

const [SR, SG, SB] = [160, 148, 120]; // sandy kerb colour
const [RR, RG, RB] = [52,  52,  52];  // road asphalt colour
const EDGE_MAX_A   = 0.65;

// ── road.png — 128×128 flat dark asphalt ─────────────────────────────────────────────
{
  const S = 128;
  const data = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      data[i] = 52; data[i + 1] = 52; data[i + 2] = 52; data[i + 3] = 255;
    }
  }
  await sharp(data, { raw: { width: S, height: S, channels: 4 } })
    .png().toFile(join(TEX_DIR, 'road.png'));
  console.log('✓  road.png  (128×128, flat asphalt)');
}

// ── road-edge-h.png — 16×16, row 0 transparent (grass), row 15 opaque (road boundary) ──
{
  const S = 16;
  const data = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    const t = y / (S - 1);
    const a = Math.round(t * t * EDGE_MAX_A * 255);
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      data[i] = SR; data[i + 1] = SG; data[i + 2] = SB; data[i + 3] = a;
    }
  }
  await sharp(data, { raw: { width: S, height: S, channels: 4 } })
    .png().toFile(join(TEX_DIR, 'road-edge-h.png'));
  console.log('✓  road-edge-h.png');
}

// ── road-edge-v.png — 16×16, col 0 transparent (grass), col 15 opaque (road boundary) ──
{
  const S = 16;
  const data = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const t = x / (S - 1);
      const a = Math.round(t * t * EDGE_MAX_A * 255);
      const i = (y * S + x) * 4;
      data[i] = SR; data[i + 1] = SG; data[i + 2] = SB; data[i + 3] = a;
    }
  }
  await sharp(data, { raw: { width: S, height: S, channels: 4 } })
    .png().toFile(join(TEX_DIR, 'road-edge-v.png'));
  console.log('✓  road-edge-v.png');
}

// ── road-corner.png — 32×32, centred on the road corner point ────────────────────────
// Quarter-circle dark arc that rounds a road corner into the grass.
// Image centre = road corner point (placed with setOrigin(0.5, 0.5)).
// Upper-left = grass; lower-right = road.
// Arc covers the grass quadrant + 2 px into the road so it visually connects
// to the road surface without a gap.
{
  const CS   = 32;
  const cx   = CS / 2, cy = CS / 2;
  const maxR = CS / 2;
  const data = Buffer.alloc(CS * CS * 4);
  for (let y = 0; y < CS; y++) {
    for (let x = 0; x < CS; x++) {
      const dx = x - cx, dy = y - cy;
      // Grass quadrant + 2 px road overlap to prevent floating gap
      if (dx > 2 || dy > 2) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxR) continue;
      const t     = dist / maxR;                 // 0 = corner, 1 = outer edge
      const alpha = Math.pow(1 - t, 1.1) * 0.95;
      const a     = Math.round(alpha * 255);
      if (a === 0) continue;
      const i = (y * CS + x) * 4;
      data[i] = RR; data[i + 1] = RG; data[i + 2] = RB; data[i + 3] = a;
    }
  }
  await sharp(data, { raw: { width: CS, height: CS, channels: 4 } })
    .png().toFile(join(TEX_DIR, 'road-corner.png'));
  console.log('✓  road-corner.png  (32×32, quarter-circle arc)');
}

console.log('\nDone. Reload the game to see changes.');
