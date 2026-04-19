// scripts/generate-tileset.js
// Generates public/assets/tilesets/neighborhood.png
// 8 tiles wide × 4 rows = 32 tiles, each 16×16px → 128×64px total
//
// Usage:  node scripts/generate-tileset.js
//
// Tile index reference (row × 8 + col):
//
//  Row 0 — Terrain
//   0  grass-main       1  grass-variant    2  grass-dark      3  sidewalk
//   4  dirt             5  water-deep       6  water-shallow   7  shore
//
//  Row 1 — Roads
//   8  road             9  road-h-dash     10  road-v-dash    11  road-edge-top
//  12  road-edge-bot   13  road-edge-left  14  road-edge-right 15 road-intersect
//
//  Row 2 — Structures
//  16  house-wall      17  house-roof      18  house-window   19  house-door
//  20  fence-h         21  fence-v         22  fence-corner   23  (empty)
//
//  Row 3 — Vegetation / Details
//  24  tree-canopy-dk  25  tree-canopy-lt  26  tree-trunk     27  bush
//  28  flowers         29  golf-green      30  golf-hole      31  bench

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT    = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'tilesets');

const T     = 16;  // tile size px
const TCOLS = 8;   // tiles per row
const TROWS = 4;   // rows

// ── Colour helpers ────────────────────────────────────────────────────────────
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n>>16)&0xff,(n>>8)&0xff,n&0xff]; };
const dk  = ([r,g,b], a) => [Math.max(0,r-a), Math.max(0,g-a), Math.max(0,b-a)];
const lt  = ([r,g,b], a) => [Math.min(255,r+a), Math.min(255,g+a), Math.min(255,b+a)];

// Deterministic noise [0,1) — no randomness so output is reproducible
const noise = (x, y, s=0) => (((x*1234 + y*5678 + s*91011) ^ (x*31 + y*97)) & 0x7fffffff) / 0x7fffffff;

// Build a 16×16 RGBA Buffer from a per-pixel function (x,y) → [r,g,b] or [r,g,b,a]
const tile = fn => {
  const buf = Buffer.alloc(T * T * 4);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const px = fn(x, y);
    const i  = (y * T + x) * 4;
    buf[i]=px[0]; buf[i+1]=px[1]; buf[i+2]=px[2]; buf[i+3]=px[3]??255;
  }
  return buf;
};

// ── Tile definitions ──────────────────────────────────────────────────────────

// 0  grass-main
const T0 = tile((x,y) => {
  const base=hex('#3a8c3a'), d=hex('#2d7030'), l=hex('#4aaa4a');
  const n=noise(x,y,0);
  if (n<0.14) return d;
  if (n>0.86) return l;
  // single-pixel grass blades
  if (n>0.80 && y%3===1 && x%4===2) return lt(l,20);
  return base;
});

// 1  grass-variant
const T1 = tile((x,y) => {
  const base=hex('#3e9242'), d=hex('#2d7030'), l=hex('#50b050');
  const n=noise(x,y,13);
  if ((x+y)%6===0 && n>0.75) return lt(l,10);
  if (n<0.18) return d;
  if (n>0.82) return l;
  return base;
});

// 2  grass-dark (park / golf)
const T2 = tile((x,y) => {
  const base=hex('#1e7a1e'), d=hex('#166016'), l=hex('#2a8c2a');
  const n=noise(x,y,7);
  return n<0.2?d:n>0.8?l:base;
});

// 3  sidewalk
const T3 = tile((x,y) => {
  const base=hex('#c8b89a'), d=hex('#b0a080'), l=hex('#d8c8a8');
  // expansion-joint crack lines
  if (x===8||y===8) return dk(base,22);
  if (x===9||y===9) return lt(base,10);
  const n=noise(x,y,3);
  return n<0.1?d:n>0.9?l:base;
});

// 4  dirt path
const T4 = tile((x,y) => {
  const base=hex('#a07850'), d=hex('#856040'), l=hex('#b89060');
  const n=noise(x,y,5);
  if (n>0.78&&noise(x,y,99)>0.82) return dk(base,30); // pebble
  return n<0.2?d:n>0.8?l:base;
});

// 5  water-deep
const T5 = tile((x,y) => {
  const base=hex('#1a5f8a'), shimmer=hex('#2272a0');
  const wave = Math.sin((x+y*0.5)*0.9)>0.55;
  // highlight ripple pixels
  if (wave && (x+y)%4===0) return lt(shimmer,15);
  return wave?shimmer:base;
});

// 6  water-shallow
const T6 = tile((x,y) => {
  const base=hex('#2980b9'), l=hex('#3a96cc');
  const wave=Math.sin((x+y*0.4)*1.1)>0.45;
  return wave?l:base;
});

// 7  shore (sand)
const T7 = tile((x,y) => {
  const base=hex('#c8a870'), d=hex('#b09060'), l=hex('#d8b880');
  const n=noise(x,y,11);
  return n<0.2?d:n>0.8?l:base;
});

// 8  road plain
const T8 = tile((x,y) => {
  const base=hex('#4a4a55'), d=hex('#3a3a45'), l=hex('#585866');
  if (y===0)  return lt(base,25);  // top curb highlight
  if (y===15) return dk(base,15);  // bottom shadow
  const n=noise(x,y,2);
  return n<0.1?d:n>0.9?l:base;
});

// 9  road horizontal center-dashes
const T9 = tile((x,y) => {
  const base=hex('#4a4a55'), d=hex('#3a3a45'), l=hex('#585866');
  const yellow=hex('#f5e642');
  if ((y===7||y===8) && x>=1&&x<=5)  return yellow;
  if ((y===7||y===8) && x>=9&&x<=13) return yellow;
  if (y===0)  return lt(base,25);
  if (y===15) return dk(base,15);
  const n=noise(x,y,2);
  return n<0.1?d:n>0.9?l:base;
});

// 10  road vertical center-dashes
const T10 = tile((x,y) => {
  const base=hex('#4a4a55'), d=hex('#3a3a45'), l=hex('#585866');
  const yellow=hex('#f5e642');
  if ((x===7||x===8) && y>=1&&y<=5)  return yellow;
  if ((x===7||x===8) && y>=9&&y<=13) return yellow;
  if (x===0)  return lt(base,25);
  if (x===15) return dk(base,15);
  const n=noise(x,y,2);
  return n<0.1?d:n>0.9?l:base;
});

// 11  road edge top (curb visible at top)
const T11 = tile((x,y) => {
  const base=hex('#4a4a55'), curb=hex('#a09080');
  if (y<=1) return curb;
  if (y===2) return lt(base,20);
  const n=noise(x,y,2);
  return n<0.1?dk(base,10):n>0.9?lt(base,10):base;
});

// 12  road edge bottom (curb at bottom)
const T12 = tile((x,y) => {
  const base=hex('#4a4a55'), curb=hex('#a09080');
  if (y>=14) return curb;
  if (y===13) return dk(base,20);
  const n=noise(x,y,2);
  return n<0.1?dk(base,10):n>0.9?lt(base,10):base;
});

// 13  road edge left (curb at left)
const T13 = tile((x,y) => {
  const base=hex('#4a4a55'), curb=hex('#a09080');
  if (x<=1) return curb;
  if (x===2) return lt(base,20);
  const n=noise(x,y,2);
  return n<0.1?dk(base,10):n>0.9?lt(base,10):base;
});

// 14  road edge right (curb at right)
const T14 = tile((x,y) => {
  const base=hex('#4a4a55'), curb=hex('#a09080');
  if (x>=14) return curb;
  if (x===13) return dk(base,20);
  const n=noise(x,y,2);
  return n<0.1?dk(base,10):n>0.9?lt(base,10):base;
});

// 15  road intersection (no dashes)
const T15 = tile((x,y) => {
  const base=hex('#4a4a55');
  const n=noise(x,y,2);
  return n<0.1?dk(base,10):n>0.9?lt(base,10):base;
});

// 16  house wall (lap siding)
const T16 = tile((x,y) => {
  const base=hex('#d4b483'), d=hex('#b89060'), l=hex('#e4c89a');
  if (y%4===0) return dk(base,25); // siding groove
  if (y%4===1) return lt(base,15); // siding highlight
  const n=noise(x,y,4);
  return n<0.05?d:n>0.95?l:base;
});

// 17  house roof (shingles)
const T17 = tile((x,y) => {
  const base=hex('#8b3a2a'), d=hex('#6e2a1a'), l=hex('#a04a3a');
  if (y%3===0) return dk(base,20); // row gap
  const offset=(Math.floor(y/3)%2===0)?0:4;
  if ((x+offset)%8===0) return dk(base,15); // column gap
  const n=noise(x,y,6);
  return n<0.1?d:n>0.9?l:base;
});

// 18  house window
const T18 = tile((x,y) => {
  const wall=hex('#d4b483'), frame=hex('#7a5030');
  const glass=hex('#88ccff'), glassLt=hex('#aaddff');
  if (x<2||x>13||y<2||y>13) return wall;
  if (x===2||x===13||y===2||y===13) return frame;
  if (x===7||x===8||y===7||y===8) return frame;
  if (x<6&&y<6) return glassLt; // sun reflection
  return glass;
});

// 19  house door
const T19 = tile((x,y) => {
  const wall=hex('#d4b483'), frame=hex('#5a3820');
  const door=hex('#8b5a2a'), knob=hex('#d4a020'), step=hex('#b09080');
  if (x<3||x>12) return wall;
  if (y>14) return step;
  if (y<1) return wall;
  if (x===3||x===12||y===1) return frame;
  if (x===10&&(y===9||y===10)) return knob; // door knob
  if (y===6||y===7) return dk(door,15); // panel line
  const n=noise(x,y,8);
  return n<0.1?dk(door,20):n>0.9?lt(door,15):door;
});

// 20  fence horizontal (with transparent gaps)
const T20 = tile((x,y) => {
  const wood=hex('#d4c4a0'), dk2=hex('#a09060');
  const NONE=[0,0,0,0];
  // picket posts every 4px
  if (x%4<2 && y>=2&&y<=13) return y%4===0?[...dk2,255]:[...wood,255];
  // two horizontal rails
  if ((y>=5&&y<=6)||(y>=10&&y<=11)) return y===5||y===10?[...dk(wood,20),255]:[...wood,255];
  return NONE;
});

// 21  fence vertical
const T21 = tile((x,y) => {
  const wood=hex('#d4c4a0'), dk2=hex('#a09060');
  const NONE=[0,0,0,0];
  if (y%4<2 && x>=2&&x<=13) return x%4===0?[...dk2,255]:[...wood,255];
  if ((x>=5&&x<=6)||(x>=10&&x<=11)) return x===5||x===10?[...dk(wood,20),255]:[...wood,255];
  return NONE;
});

// 22  fence corner post
const T22 = tile((x,y) => {
  const wood=hex('#d4c4a0'), dk2=hex('#a09060');
  const NONE=[0,0,0,0];
  // thick corner post at center
  if (x>=6&&x<=9&&y>=2&&y<=13) return x===6||x===9?[...dk(wood,25),255]:[...wood,255];
  // horizontal rail going right
  if ((y>=5&&y<=6)||(y>=10&&y<=11)) return y===5||y===10?[...dk(wood,20),255]:[...wood,255];
  // vertical rail going down
  if ((x>=5&&x<=6)||(x>=9&&x<=10)) return x===5||x===9?[...dk(wood,20),255]:[...wood,255];
  return NONE;
});

// 23  empty / transparent
const T23 = tile(() => [0,0,0,0]);

// 24  tree canopy dark (outer ring)
const T24 = tile((x,y) => {
  const base=hex('#1a5c1a'), d=hex('#124512'), l=hex('#268026');
  const NONE=[0,0,0,0];
  const cx=7.5, cy=7.5;
  const dist=Math.hypot(x-cx,y-cy);
  if (dist>7.5) return NONE;
  const n=noise(x,y,9);
  if (dist>6.2&&n<0.55) return NONE; // ragged edge
  return [...(n<0.2?d:n>0.8?l:base),255];
});

// 25  tree canopy light (inner highlight)
const T25 = tile((x,y) => {
  const base=hex('#268026'), l=hex('#38a038'), d=hex('#1a5c1a');
  const NONE=[0,0,0,0];
  const cx=7.5, cy=7.5;
  const dist=Math.hypot(x-cx,y-cy);
  if (dist>6.0) return NONE;
  const n=noise(x,y,14);
  if (dist>4.5&&n<0.45) return NONE;
  if (x<8&&y<8&&dist<3.5) return [...lt(l,15),255]; // sun highlight top-left
  return [...(n<0.2?d:n>0.8?l:base),255];
});

// 26  tree trunk
const T26 = tile((x,y) => {
  const base=hex('#6b4226'), d=hex('#4a2c18'), l=hex('#8b5a3a');
  const NONE=[0,0,0,0];
  if (x<6||x>9) return NONE;
  if (y<5) return NONE;
  if (x===6||x===9) return [...dk(base,20),255];
  const n=noise(x,y,10);
  if (y%3===0&&n>0.5) return [...d,255]; // bark texture
  return [...(n<0.2?d:n>0.8?l:base),255];
});

// 27  bush / shrub
const T27 = tile((x,y) => {
  const base=hex('#2a7030'), d=hex('#1a5020'), l=hex('#3a9040');
  const NONE=[0,0,0,0];
  const cx=7.5, cy=10;
  const dist=Math.hypot(x-cx,y-cy);
  if (dist>6.0||y<5) return NONE;
  const n=noise(x,y,15);
  if (dist>4.8&&n<0.45) return NONE;
  return [...(n<0.2?d:n>0.8?l:base),255];
});

// 28  flowers (grass with flower detail)
const T28 = tile((x,y) => {
  const grass=hex('#3a8c3a'), stem=hex('#2a6030');
  const pet1=hex('#ff8844'), pet2=hex('#ffcc44'), center=hex('#ffff00');
  const blooms=[[4,10],[11,6]];
  for (const [fx,fy] of blooms) {
    if (x===fx&&y===fy) return center;
    if ((x===fx-1||x===fx+1)&&y===fy) return pet1;
    if (x===fx&&(y===fy-1||y===fy+1)) return pet2;
    if (x===fx&&(y===fy+1||y===fy+2)) return stem;
  }
  const n=noise(x,y,0);
  const d=hex('#2d7030'), l=hex('#4aaa4a');
  return n<0.14?d:n>0.86?l:grass;
});

// 29  golf green (mow-stripe pattern)
const T29 = tile((x,y) => {
  const s1=hex('#1a8030'), s2=hex('#188028'), d=hex('#126020'), l=hex('#22a040');
  const n=noise(x,y,16);
  const c=Math.floor(y/2)%2===0?s1:s2;
  return n<0.05?d:n>0.95?l:c;
});

// 30  golf hole with flag
const T30 = tile((x,y) => {
  const green=hex('#1a8030'), hole=hex('#0a0a0a');
  const flag=hex('#ff2222'), pole=hex('#dddddd');
  const hx=10, hy=11;
  if (Math.hypot(x-hx,y-hy)<2.5) return hole;
  if (x===10&&y>=3&&y<=9) return pole;
  if (y>=3&&y<=6&&x>=10&&x<=13) return flag;
  const n=noise(x,y,16);
  const c=Math.floor(y/2)%2===0?green:dk(green,5);
  return n<0.05?dk(green,20):n>0.95?lt(green,20):c;
});

// 31  park bench (top-down view)
const T31 = tile((x,y) => {
  const NONE=[0,0,0,0];
  const wood=hex('#8b6914'), dk2=hex('#6b4e0e'), metal=hex('#909090');
  if (y<3||y>12) return NONE;
  // legs
  if ((x===2||x===13)&&(y===3||y===12)) return [...metal,255];
  // back rest (top rail)
  if (y>=3&&y<=5) {
    if (x<2||x>13) return NONE;
    return y===3?[...dk(wood,20),255]:[...wood,255];
  }
  // seat boards
  if (y>=7&&y<=10) {
    if (x<2||x>13) return NONE;
    if (x%3===0) return [...dk2,255];
    return [...wood,255];
  }
  return NONE;
});

// ── Assemble tileset ──────────────────────────────────────────────────────────
const TILES = [
  T0,T1,T2,T3,T4,T5,T6,T7,      // row 0  terrain
  T8,T9,T10,T11,T12,T13,T14,T15, // row 1  roads
  T16,T17,T18,T19,T20,T21,T22,T23, // row 2  structures
  T24,T25,T26,T27,T28,T29,T30,T31, // row 3  vegetation/details
];

const NAMES = [
  'grass-main','grass-variant','grass-dark','sidewalk','dirt','water-deep','water-shallow','shore',
  'road','road-h-dash','road-v-dash','road-edge-top','road-edge-bot','road-edge-left','road-edge-right','road-intersect',
  'house-wall','house-roof','house-window','house-door','fence-h','fence-v','fence-corner','(empty)',
  'tree-canopy-dark','tree-canopy-light','tree-trunk','bush','flowers','golf-green','golf-hole','bench',
];

async function run() {
  const sheetW = TCOLS * T;
  const sheetH = TROWS * T;

  const resolved = [];
  for (let i = 0; i < TILES.length; i++) {
    resolved.push({
      input: await sharp(TILES[i], { raw: { width: T, height: T, channels: 4 } }).png().toBuffer(),
      left: (i % TCOLS) * T,
      top:  Math.floor(i / TCOLS) * T,
    });
  }

  mkdirSync(OUT_DIR, { recursive: true });

  await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r:0,g:0,b:0,alpha:0 } },
  })
    .composite(resolved)
    .png()
    .toFile(join(OUT_DIR, 'neighborhood.png'));

  console.log(`✓  neighborhood.png  (${sheetW}×${sheetH}px, ${TILES.length} tiles)\n`);
  console.log('Tile index reference:');
  NAMES.forEach((name, i) => {
    const row = Math.floor(i / TCOLS);
    const col = i % TCOLS;
    console.log(`  [${String(i).padStart(2)}] row${row} col${col}  ${name}`);
  });
  console.log('\nTile size: 16×16px  |  Load in Tiled with: Tileset → New Tileset → tile width/height: 16');
}

run().catch(err => { console.error(err.message); process.exit(1); });
