// scripts/process-tileset.js
// Processes game_components.jpg (2×2 grid) into individual game assets.
//
// Source layout:
//   (row 0, col 0) — Road + sidewalk texture
//   (row 0, col 1) — Grass texture
//   (row 1, col 0) — Tree on grass background
//   (row 1, col 1) — House on dirt background
//
// Outputs:
//   public/assets/textures/road.png      — 128×128 seamless road tile
//   public/assets/textures/sidewalk.png  — 128×128 seamless sidewalk tile
//   public/assets/textures/grass.png     — 128×128 seamless grass tile
//   public/assets/sprites/tree.png       — 64×64 tree sprite (bg removed)
//   public/assets/sprites/house.png      — 96×64 house sprite (bg removed)
//
// Usage:
//   node scripts/process-tileset.js <path-to-game_components.jpg>

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEX_DIR    = join(__dirname, '..', 'public', 'assets', 'textures');
const SPRITE_DIR = join(__dirname, '..', 'public', 'assets', 'sprites');

// ── BG removal: flood-fill from edges, remove pixels matching predicate ───────
async function removeBackground(imageBuffer, isBgFn) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const ch = 4, total = width * height;
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
    const b = pos * ch;
    if (!isBgFn(data[b], data[b+1], data[b+2])) continue;
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

function isGrassBg(r, g, b) {
  // Green-ish grass: G channel dominant, medium brightness
  return g > r + 15 && g > b && g > 80 && g < 200;
}

function isDirtBg(r, g, b) {
  // Sandy/brown dirt: R and G high together, B low, warm tone
  return r > 140 && g > 100 && b < 100 && r > b + 60;
}

async function run() {
  const srcPath = process.argv[2];
  if (!srcPath) {
    console.error('Usage: node scripts/process-tileset.js <game_components.jpg>');
    process.exit(1);
  }

  const meta = await sharp(srcPath).metadata();
  const cellW = Math.floor(meta.width  / 2);
  const cellH = Math.floor(meta.height / 2);
  console.log(`Source: ${meta.width}×${meta.height}  cells: ${cellW}×${cellH}`);

  mkdirSync(TEX_DIR,    { recursive: true });
  mkdirSync(SPRITE_DIR, { recursive: true });

  const cell = (col, row) => sharp(srcPath)
    .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH })
    .toBuffer();

  // ── Grass texture (row 0, col 1) ─────────────────────────────────────────────
  // Crop 5% from each edge before resizing — JPEG compression bleeds colour from
  // adjacent cells into the border pixels, causing orange seam lines when tiled.
  const grassCell = await cell(1, 0);
  const gBorder   = Math.floor(cellW * 0.05);
  const grassInner = await sharp(grassCell)
    .extract({ left: gBorder, top: gBorder, width: cellW - gBorder * 2, height: cellH - gBorder * 2 })
    .toBuffer();
  const grassTex  = await sharp(grassInner)
    .resize(128, 128, { kernel: sharp.kernel.lanczos3, fit: 'cover' })
    .png().toBuffer();
  writeFileSync(join(TEX_DIR, 'grass.png'), grassTex);
  console.log('✓  grass.png  (128×128)');

  // Also use grass for park texture (same source, slightly different tint)
  const parkTex = await sharp(grassInner)
    .resize(128, 128, { kernel: sharp.kernel.lanczos3, fit: 'cover' })
    .modulate({ brightness: 1.05, saturation: 1.1 })
    .png().toBuffer();
  writeFileSync(join(TEX_DIR, 'park.png'), parkTex);
  console.log('✓  park.png   (128×128)');

  // ── Road texture — extract inner road surface (skip sidewalk border) ─────────
  // The road cell has a sandy sidewalk border ~10% wide on each side.
  // Crop to the inner 80% to get just the asphalt.
  const roadCell = await cell(0, 0);
  const borderPct = 0.12;
  const cropX = Math.floor(cellW * borderPct);
  const cropY = Math.floor(cellH * borderPct);
  const cropW = cellW - cropX * 2;
  const cropH = cellH - cropY * 2;

  const roadInner = await sharp(roadCell)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .toBuffer();
  const roadTex = await sharp(roadInner)
    .resize(128, 128, { kernel: sharp.kernel.lanczos3, fit: 'cover' })
    .png().toBuffer();
  writeFileSync(join(TEX_DIR, 'road.png'), roadTex);
  console.log('✓  road.png   (128×128)');

  // ── Sidewalk texture — extract just the border strip from the road cell ──────
  // Take a horizontal strip from the top border area
  const sidewalkStrip = await sharp(roadCell)
    .extract({ left: 0, top: 0, width: cellW, height: cropY })
    .toBuffer();
  const sidewalkTex = await sharp(sidewalkStrip)
    .resize(128, 128, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png().toBuffer();
  writeFileSync(join(TEX_DIR, 'sidewalk.png'), sidewalkTex);
  console.log('✓  sidewalk.png (128×128)');

  // ── Tree sprite (row 1, col 0) — remove grass background ─────────────────────
  const treeCell  = await cell(0, 1);
  const treeNoBg  = await removeBackground(treeCell, isGrassBg);
  const treeSized = await sharp(treeNoBg)
    .resize(64, 64, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).png().toBuffer();
  writeFileSync(join(SPRITE_DIR, 'tree.png'), treeSized);
  console.log('✓  tree.png   (64×64, bg removed)');

  // ── House sprite (row 1, col 1) — remove dirt background ─────────────────────
  const houseCell  = await cell(1, 1);
  const houseNoBg  = await removeBackground(houseCell, isDirtBg);
  const houseSized = await sharp(houseNoBg)
    .resize(96, 80, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).png().toBuffer();
  writeFileSync(join(SPRITE_DIR, 'house.png'), houseSized);
  console.log('✓  house.png  (96×80, bg removed)');

  console.log('\nAll done. Reload the game to see changes.');
}

run().catch(err => { console.error(err.message); process.exit(1); });
