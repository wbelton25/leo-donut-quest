// scripts/generate-obstacle-sprites.js
// Generates 8-bit pixel art sprite sheets for deer, car, and golf cart obstacles.
// Each sprite is 48×48 per frame, matching Leo/Warren/MJ's scale.
// Output: public/assets/sprites/  deer.png/json, car.png/json, golf-cart.png/json
//
// Usage:  node scripts/generate-obstacle-sprites.js

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'sprites');

const SZ = 48;

// ── Pixel-painting primitives ────────────────────────────────────────────────

function newFrame() {
  return new Uint8ClampedArray(SZ * SZ * 4); // RGBA transparent
}

function pxc(f, x, y, c) {
  if (x < 0 || y < 0 || x >= SZ || y >= SZ) return;
  const i = (y * SZ + x) * 4;
  f[i] = c[0]; f[i+1] = c[1]; f[i+2] = c[2]; f[i+3] = c[3] ?? 255;
}

function fillRect(f, x1, y1, x2, y2, c) {
  for (let y = Math.max(0, y1|0); y <= Math.min(SZ-1, y2|0); y++)
    for (let x = Math.max(0, x1|0); x <= Math.min(SZ-1, x2|0); x++)
      pxc(f, x, y, c);
}

function fillOval(f, cx, cy, rx, ry, c) {
  cx = cx|0; cy = cy|0;
  for (let y = cy - ry; y <= cy + ry; y++) {
    const t = (y - cy) / ry;
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let x = cx - hw; x <= cx + hw; x++) pxc(f, x, y, c);
  }
}

// Draw oval with 1-pixel outline: paint outline-sized oval first, then fill
function dOval(f, cx, cy, rx, ry, fill, outline) {
  fillOval(f, cx, cy, rx + 1, ry + 1, outline);
  fillOval(f, cx, cy, rx, ry, fill);
}

// Draw rect with 1-pixel outline
function dRect(f, x1, y1, x2, y2, fill, outline) {
  fillRect(f, x1 - 1, y1 - 1, x2 + 1, y2 + 1, outline);
  fillRect(f, x1, y1, x2, y2, fill);
}

// Outline only (no fill)
function strokeRect(f, x1, y1, x2, y2, c) {
  for (let x = x1; x <= x2; x++) { pxc(f, x, y1, c); pxc(f, x, y2, c); }
  for (let y = y1; y <= y2; y++) { pxc(f, x1, y, c); pxc(f, x2, y, c); }
}

function mirrorH(src) {
  const dst = new Uint8ClampedArray(SZ * SZ * 4);
  for (let y = 0; y < SZ; y++)
    for (let x = 0; x < SZ; x++) {
      const si = (y * SZ + x) * 4;
      const di = (y * SZ + (SZ - 1 - x)) * 4;
      dst[di] = src[si]; dst[di+1] = src[si+1];
      dst[di+2] = src[si+2]; dst[di+3] = src[si+3];
    }
  return dst;
}

function rotate90CW(src) {
  const dst = new Uint8ClampedArray(SZ * SZ * 4);
  for (let y = 0; y < SZ; y++)
    for (let x = 0; x < SZ; x++) {
      const si = (y * SZ + x) * 4;
      const dx = SZ - 1 - y, dy = x;
      const di = (dy * SZ + dx) * 4;
      dst[di] = src[si]; dst[di+1] = src[si+1];
      dst[di+2] = src[si+2]; dst[di+3] = src[si+3];
    }
  return dst;
}

function rotate90CCW(src) {
  const dst = new Uint8ClampedArray(SZ * SZ * 4);
  for (let y = 0; y < SZ; y++)
    for (let x = 0; x < SZ; x++) {
      const si = (y * SZ + x) * 4;
      const dx = y, dy = SZ - 1 - x;
      const di = (dy * SZ + dx) * 4;
      dst[di] = src[si]; dst[di+1] = src[si+1];
      dst[di+2] = src[si+2]; dst[di+3] = src[si+3];
    }
  return dst;
}

async function bufToSharpPNG(f) {
  return sharp(Buffer.from(f.buffer), {
    raw: { width: SZ, height: SZ, channels: 4 },
  }).png().toBuffer();
}

async function packSheet(frames) {
  const n = frames.length;
  const composites = await Promise.all(
    frames.map(async (f, i) => ({
      input: await bufToSharpPNG(f),
      left: i * SZ,
      top: 0,
    }))
  );
  return sharp({
    create: {
      width: n * SZ, height: SZ,
      channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(composites).png().toBuffer();
}

function makeAtlas(name, frameNames) {
  const frames = {};
  frameNames.forEach((fname, i) => {
    frames[fname] = {
      frame: { x: i * SZ, y: 0, w: SZ, h: SZ },
      rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: SZ, h: SZ },
      sourceSize: { w: SZ, h: SZ },
    };
  });
  return {
    frames,
    meta: {
      app: 'generate-obstacle-sprites.js',
      image: `${name}.png`,
      format: 'RGBA8888',
      size: { w: frameNames.length * SZ, h: SZ },
      scale: '1',
    },
  };
}

// ── DEER ────────────────────────────────────────────────────────────────────
//
// White-tailed deer seen from the side (3/4 view matching Leo's perspective).
// Tan-brown body, white belly patch and tail, four legs, pointed ears.
// Facing RIGHT; left = mirror; down/up = 90° rotations.

const D = {
  O:  [22, 8, 0],          // dark brown outline
  BD: [88, 44, 14],        // body shadow
  BM: [152, 84, 32],       // body main
  BL: [198, 130, 60],      // body light
  BH: [232, 174, 96],      // body highlight (sun-catch)
  WH: [244, 240, 224],     // white — tail + belly
  CR: [218, 192, 150],     // cream — inner belly
  LG: [52, 22, 6],         // leg
  HF: [22, 8, 0],          // hoof (same as outline)
  EY: [8, 2, 0],           // eye
  NS: [30, 10, 0],         // nose
  EI: [218, 158, 90],      // ear inner
  SP: [255, 252, 240],     // eye specular highlight
};

function makeDeerRight() {
  const f = newFrame();

  // ── TAIL (white, at back-left) ───────────────────────────────────────────
  dOval(f, 9, 25, 5, 6, D.WH, D.O);

  // ── BACK LEGS (far side — rendered behind body) ──────────────────────────
  dRect(f, 14, 33, 16, 43, D.BD, D.O);
  dRect(f, 20, 33, 22, 43, D.BD, D.O);

  // ── BODY ─────────────────────────────────────────────────────────────────
  dOval(f, 22, 28, 14, 7, D.BM, D.O);
  fillOval(f, 20, 24, 9, 3, D.BL);        // dorsal highlight stripe
  fillOval(f, 22, 31, 8, 3, D.CR);        // belly lighter

  // ── NECK ─────────────────────────────────────────────────────────────────
  dRect(f, 31, 20, 37, 28, D.BM, D.O);
  fillRect(f, 31, 20, 33, 28, D.BD);      // neck shadow (far side)
  fillRect(f, 35, 20, 37, 23, D.BL);      // neck highlight

  // ── HEAD ─────────────────────────────────────────────────────────────────
  dOval(f, 39, 18, 6, 5, D.BM, D.O);
  fillOval(f, 37, 15, 3, 2, D.BL);        // forehead highlight

  // ── SNOUT ────────────────────────────────────────────────────────────────
  dRect(f, 41, 17, 46, 22, D.BD, D.O);
  fillRect(f, 41, 17, 46, 18, D.BM);      // top of snout lighter
  pxc(f, 45, 19, D.NS); pxc(f, 46, 19, D.NS); // nostrils
  pxc(f, 45, 20, D.NS); pxc(f, 46, 20, D.NS);

  // ── FAR EAR (behind near ear) ─────────────────────────────────────────────
  dRect(f, 33, 11, 35, 18, D.BD, D.O);
  fillRect(f, 33, 12, 35, 15, D.BM);

  // ── NEAR EAR ─────────────────────────────────────────────────────────────
  dRect(f, 37, 9, 40, 18, D.BM, D.O);
  fillRect(f, 38, 10, 39, 15, D.EI);      // ear inner (pink/tan)
  pxc(f, 38, 9, D.BL); pxc(f, 39, 9, D.BL); // ear tip highlight

  // ── EYE ──────────────────────────────────────────────────────────────────
  fillRect(f, 41, 14, 43, 16, D.EY);      // dark eye
  pxc(f, 41, 14, D.SP);                   // specular highlight

  // ── FRONT LEGS (near side — rendered in front of body) ───────────────────
  dRect(f, 26, 33, 28, 43, D.BM, D.O);
  dRect(f, 31, 33, 33, 43, D.BM, D.O);
  fillRect(f, 26, 40, 28, 44, D.HF);      // hooves
  fillRect(f, 31, 40, 33, 44, D.HF);

  return f;
}

// ── DEER DOWN (top-down front view) ─────────────────────────────────────────
// Wider, rounder body with head + ears visible, two visible legs at bottom.
function makeDeerDown() {
  const f = newFrame();

  // Body (wider oval seen from above)
  dOval(f, 24, 26, 10, 13, D.BM, D.O);
  fillOval(f, 24, 23, 6, 6, D.BL);       // dorsal stripe
  fillOval(f, 24, 34, 5, 4, D.CR);       // rump patch

  // Head at bottom (facing camera)
  dOval(f, 24, 37, 6, 5, D.BM, D.O);
  dRect(f, 21, 40, 27, 44, D.BD, D.O);  // snout
  pxc(f, 22, 42, D.NS); pxc(f, 26, 42, D.NS); // nostrils

  // Two front legs (bottom of sprite)
  dRect(f, 16, 44, 18, 47, D.LG, D.O);
  dRect(f, 30, 44, 32, 47, D.LG, D.O);

  // Ears (sides of head)
  dOval(f, 15, 36, 4, 3, D.BM, D.O);
  fillOval(f, 15, 36, 2, 2, D.EI);
  dOval(f, 33, 36, 4, 3, D.BM, D.O);
  fillOval(f, 33, 36, 2, 2, D.EI);

  // Eyes
  fillRect(f, 19, 36, 21, 37, D.EY);
  fillRect(f, 27, 36, 29, 37, D.EY);
  pxc(f, 19, 36, D.SP); pxc(f, 27, 36, D.SP);

  // White tail at top
  dOval(f, 24, 10, 5, 4, D.WH, D.O);

  return f;
}

// ── CAR ─────────────────────────────────────────────────────────────────────
//
// Classic compact sedan, side view (right-facing).
// Colored body (multiple variants), dark windows, visible wheels.
// Distinct hood, cabin roof, and trunk silhouette.

const CAR_BODIES = [
  { body: [188, 32, 32], bDark: [130, 18, 18], bLight: [220, 90, 80], label: 'red' },
  { body: [38, 68, 192], bDark: [24, 44, 138], bLight: [88, 130, 232], label: 'blue' },
  { body: [155, 155, 165], bDark: [100, 100, 112], bLight: [210, 210, 218], label: 'silver' },
  { body: [32, 148, 48], bDark: [18, 100, 28], bLight: [72, 195, 88], label: 'green' },
];

function makeCarRight(pal) {
  const f = newFrame();
  const O  = [16, 14, 12];                    // dark outline
  const WD = [82, 108, 142];                  // window glass (blue-tint grey)
  const WF = [28, 26, 32];                    // window frame
  const WL = [52, 60, 68];                    // wheel dark
  const WH = [85, 88, 95];                    // wheel mid
  const WC = [175, 175, 180];                 // hubcap light
  const HL = [255, 240, 120];                 // headlight yellow
  const TL = [255, 45, 22];                   // taillight red
  const UN = [50, 48, 44];                    // undercarriage

  // ── UNDERCARRIAGE / chassis bottom ──────────────────────────────────────
  fillRect(f, 4, 36, 43, 38, UN);

  // ── WHEEL ARCHES (cut out shape) ─────────────────────────────────────────
  // We'll draw wheels on top later; arch shadows
  fillOval(f, 12, 37, 8, 5, [30, 28, 26]);
  fillOval(f, 36, 37, 8, 5, [30, 28, 26]);

  // ── MAIN BODY ─────────────────────────────────────────────────────────────
  //   Body: x=3..44, y=22..35   (hood+trunk lower than cabin)
  fillRect(f, 5, 27, 42, 35, pal.bDark);      // shadow base
  fillRect(f, 5, 25, 42, 33, pal.body);       // main body
  fillRect(f, 6, 25, 42, 26, pal.bLight);     // top highlight stripe
  fillRect(f, 5, 33, 42, 34, pal.bDark);      // bottom shadow stripe

  // ── HOOD (front, right side) ─────────────────────────────────────────────
  fillRect(f, 32, 22, 43, 26, pal.bDark);     // hood shadow
  fillRect(f, 33, 20, 43, 25, pal.body);      // hood face
  fillRect(f, 34, 20, 43, 21, pal.bLight);    // hood highlight

  // ── TRUNK (rear, left side) ──────────────────────────────────────────────
  fillRect(f, 4, 24, 14, 29, pal.bDark);

  // ── CABIN (roof) ─────────────────────────────────────────────────────────
  fillRect(f, 11, 14, 36, 24, pal.bDark);     // cabin shadow base
  fillRect(f, 12, 13, 35, 23, pal.body);      // cabin face
  fillRect(f, 12, 13, 35, 14, pal.bLight);    // roof highlight

  // Pillar lines (A and C pillars)
  fillRect(f, 30, 13, 32, 23, pal.bDark);     // A-pillar (front)
  fillRect(f, 12, 13, 14, 23, pal.bDark);     // C-pillar (rear)

  // ── WINDOWS ──────────────────────────────────────────────────────────────
  // Rear window
  fillRect(f, 14, 14, 21, 22, WD);
  fillRect(f, 14, 14, 14, 22, WF);           // window frame edges
  fillRect(f, 14, 14, 21, 14, WF);
  fillRect(f, 21, 14, 21, 22, WF);
  fillRect(f, 14, 22, 21, 22, WF);
  // Window highlight
  fillRect(f, 15, 15, 17, 17, [145, 175, 205]);

  // Front window
  fillRect(f, 23, 14, 29, 22, WD);
  fillRect(f, 23, 14, 23, 22, WF);
  fillRect(f, 23, 14, 29, 14, WF);
  fillRect(f, 29, 14, 29, 22, WF);
  fillRect(f, 23, 22, 29, 22, WF);
  fillRect(f, 24, 15, 26, 17, [145, 175, 205]);

  // ── DOOR LINE ─────────────────────────────────────────────────────────────
  fillRect(f, 21, 23, 22, 34, pal.bDark);

  // ── HEADLIGHT ─────────────────────────────────────────────────────────────
  fillRect(f, 40, 22, 44, 25, HL);
  fillRect(f, 41, 22, 44, 23, [255, 255, 200]); // bright center
  strokeRect(f, 40, 22, 44, 25, O);

  // ── TAILLIGHT ─────────────────────────────────────────────────────────────
  fillRect(f, 3, 23, 6, 26, TL);
  strokeRect(f, 3, 23, 6, 26, O);

  // ── BUMPERS ──────────────────────────────────────────────────────────────
  fillRect(f, 38, 32, 44, 35, [195, 195, 195]);  // front bumper
  fillRect(f, 3, 30, 6, 33, [195, 195, 195]);    // rear bumper

  // ── WHEELS ──────────────────────────────────────────────────────────────
  // Rear wheel
  fillOval(f, 12, 38, 7, 6, WL);
  fillOval(f, 12, 38, 5, 4, WH);
  fillOval(f, 12, 38, 2, 2, WC);

  // Front wheel
  fillOval(f, 36, 38, 7, 6, WL);
  fillOval(f, 36, 38, 5, 4, WH);
  fillOval(f, 36, 38, 2, 2, WC);

  // ── OUTLINE ───────────────────────────────────────────────────────────────
  strokeRect(f, 4, 24, 43, 35, O);              // body outline
  strokeRect(f, 11, 13, 36, 24, O);             // cabin outline

  return f;
}

// Car top-down view (for down/up variants)
function makeCarDown(pal) {
  const f = newFrame();
  const O  = [16, 14, 12];
  const WD = [82, 108, 142];
  const WF = [28, 26, 32];
  const WL = [52, 60, 68];
  const WH = [85, 88, 95];
  const WC = [175, 175, 180];
  const HL = [255, 240, 120];
  const TL = [255, 45, 22];
  const RF = [55, 52, 50];                      // roof dark

  // Main body (wider than side view)
  fillRect(f, 8, 5, 39, 42, pal.bDark);
  fillRect(f, 9, 4, 38, 41, pal.body);
  fillRect(f, 10, 4, 37, 5, pal.bLight);

  // Roof panel
  fillRect(f, 11, 14, 36, 32, RF);
  fillRect(f, 12, 15, 35, 31, [72, 68, 65]);

  // Windshield (front, bottom)
  fillRect(f, 12, 32, 35, 36, WD);
  fillRect(f, 13, 33, 34, 35, [105, 135, 165]);
  strokeRect(f, 11, 31, 36, 37, WF);

  // Rear window (back, top)
  fillRect(f, 12, 10, 35, 13, WD);
  strokeRect(f, 11, 9, 36, 14, WF);

  // Hood (front)
  fillRect(f, 9, 37, 38, 42, pal.body);
  fillRect(f, 10, 37, 37, 38, pal.bLight);

  // Trunk (rear)
  fillRect(f, 9, 4, 38, 8, pal.bDark);

  // Headlights (front corners)
  fillRect(f, 9, 40, 13, 43, HL);
  fillRect(f, 35, 40, 39, 43, HL);

  // Taillights (rear corners)
  fillRect(f, 9, 4, 13, 7, TL);
  fillRect(f, 35, 4, 39, 7, TL);

  // Wheels (4 corners)
  fillOval(f, 9,  14, 4, 6, WL);
  fillOval(f, 9,  14, 2, 4, WH);
  fillOval(f, 38, 14, 4, 6, WL);
  fillOval(f, 38, 14, 2, 4, WH);
  fillOval(f, 9,  34, 4, 6, WL);
  fillOval(f, 9,  34, 2, 4, WH);
  fillOval(f, 38, 34, 4, 6, WL);
  fillOval(f, 38, 34, 2, 4, WH);

  strokeRect(f, 8, 4, 39, 42, O);

  return f;
}

// ── GOLF CART ────────────────────────────────────────────────────────────────
//
// Open golf cart with canopy and a seated driver character.
// Cream/white chassis, dark green canopy, driver (head + polo shirt) visible.

const G = {
  O:   [18, 14, 8],          // outline
  CH:  [240, 228, 188],      // chassis cream
  CHS: [195, 182, 142],      // chassis shadow
  CHL: [255, 248, 225],      // chassis highlight
  CAN: [28, 72, 28],         // canopy dark green
  CNM: [42, 102, 38],        // canopy mid
  CNL: [64, 138, 54],        // canopy highlight
  POL: [26, 56, 22],         // canopy post
  SK:  [235, 192, 140],      // skin
  SKD: [195, 148, 100],      // skin shadow
  SH:  [240, 230, 92],       // shirt yellow
  SHD: [195, 182, 60],       // shirt shadow
  CAP: [42, 68, 168],        // cap blue
  HAI: [78, 42, 16],         // hair
  EY:  [8, 4, 0],            // eye
  WL:  [52, 52, 58],         // wheel dark
  WH:  [88, 88, 95],         // wheel mid
  WC:  [180, 178, 182],      // hubcap
  BED: [200, 185, 148],      // cart bed
  TR:  [88, 70, 32],         // trim/accent
};

function makeGolfCartRight() {
  const f = newFrame();

  // ── CART BED (rear storage) ───────────────────────────────────────────────
  dRect(f, 4, 27, 15, 35, G.BED, G.O);
  fillRect(f, 5, 27, 15, 28, G.CH);  // bed top lighter

  // ── CHASSIS / FLOOR ───────────────────────────────────────────────────────
  dRect(f, 3, 33, 42, 39, G.CHS, G.O);
  fillRect(f, 4, 32, 41, 37, G.CH);
  fillRect(f, 4, 32, 41, 33, G.CHL);  // floor highlight

  // ── SEAT ──────────────────────────────────────────────────────────────────
  dRect(f, 18, 30, 38, 35, [175, 160, 122], G.O);
  fillRect(f, 19, 30, 38, 31, [215, 198, 155]);  // seat top

  // ── CANOPY POSTS ──────────────────────────────────────────────────────────
  dRect(f, 18, 14, 20, 33, G.POL, G.O);   // rear post
  dRect(f, 38, 14, 40, 33, G.POL, G.O);   // front post

  // ── CANOPY ROOF ───────────────────────────────────────────────────────────
  dRect(f, 15, 10, 43, 16, G.CAN, G.O);
  fillRect(f, 16, 11, 42, 14, G.CNM);
  fillRect(f, 17, 11, 41, 12, G.CNL);     // canopy highlight
  // Canopy lip (front)
  fillRect(f, 38, 14, 44, 16, G.CAN);
  fillRect(f, 38, 14, 44, 15, G.CNL);

  // ── DRIVER ───────────────────────────────────────────────────────────────
  // Shirt / body
  dRect(f, 24, 22, 36, 32, G.SH, G.O);
  fillRect(f, 25, 22, 36, 23, G.SHD);  // shirt shadow top

  // Arm (right, reaching forward)
  dRect(f, 35, 25, 40, 27, G.SH, G.O);

  // Head
  dOval(f, 29, 17, 6, 5, G.SK, G.O);
  fillOval(f, 29, 16, 3, 2, [248, 210, 165]);  // face highlight

  // Cap
  dRect(f, 24, 12, 34, 17, G.CAP, G.O);
  fillRect(f, 24, 12, 34, 13, [72, 102, 208]); // cap highlight
  fillRect(f, 30, 17, 36, 19, G.CAP);           // cap brim

  // Hair (under cap sides)
  fillRect(f, 24, 16, 26, 18, G.HAI);

  // Eye
  fillRect(f, 32, 17, 34, 18, G.EY);
  pxc(f, 32, 17, [255, 255, 255]);  // eye specular

  // Ear
  fillRect(f, 23, 18, 25, 20, G.SK);

  // ── WINDSHIELD (small glass at front) ────────────────────────────────────
  fillRect(f, 39, 18, 44, 26, [100, 135, 165]);
  fillRect(f, 40, 19, 43, 22, [130, 168, 200]);  // glass highlight
  strokeRect(f, 39, 18, 44, 26, G.O);

  // ── FRONT ACCENT ─────────────────────────────────────────────────────────
  dRect(f, 40, 35, 45, 38, G.TR, G.O);

  // ── WHEELS ───────────────────────────────────────────────────────────────
  fillOval(f, 10, 40, 7, 6, G.WL);
  fillOval(f, 10, 40, 5, 4, G.WH);
  fillOval(f, 10, 40, 2, 2, G.WC);

  fillOval(f, 36, 40, 7, 6, G.WL);
  fillOval(f, 36, 40, 5, 4, G.WH);
  fillOval(f, 36, 40, 2, 2, G.WC);

  return f;
}

// Golf cart top-down (down/up variants)
function makeGolfCartDown() {
  const f = newFrame();

  // Chassis top-down (wider oval view)
  dRect(f, 7, 6, 40, 42, G.CHS, G.O);
  fillRect(f, 8, 5, 39, 41, G.CH);
  fillRect(f, 9, 5, 38, 7, G.CHL);

  // Canopy (dark green rect, center of cart)
  dRect(f, 9, 8, 38, 28, G.CAN, G.O);
  fillRect(f, 10, 9, 37, 27, G.CNM);
  fillRect(f, 11, 9, 36, 12, G.CNL);

  // Driver head visible through canopy gap
  dOval(f, 24, 20, 5, 5, G.SK, G.O);
  fillRect(f, 21, 16, 27, 18, G.CAP);  // cap
  fillRect(f, 20, 18, 28, 20, G.CAP);  // cap brim
  fillRect(f, 22, 20, 26, 22, G.EY);   // sunglasses

  // Cart bed (rear)
  dRect(f, 9, 30, 38, 40, G.BED, G.O);

  // 4 wheels
  fillOval(f, 9,  14, 4, 5, G.WL);
  fillOval(f, 9,  14, 2, 3, G.WH);
  fillOval(f, 39, 14, 4, 5, G.WL);
  fillOval(f, 39, 14, 2, 3, G.WH);
  fillOval(f, 9,  36, 4, 5, G.WL);
  fillOval(f, 9,  36, 2, 3, G.WH);
  fillOval(f, 39, 36, 4, 5, G.WL);
  fillOval(f, 39, 36, 2, 3, G.WH);

  return f;
}

// ── Sprite sheet assembly ────────────────────────────────────────────────────

const FRAME_NAMES = [
  'right-0', 'right-1', 'right-2',
  'left-0',  'left-1',  'left-2',
  'down-0',  'down-1',  'down-2',
  'up-0',    'up-1',    'up-2',
];

async function writeSprite(name, frames12) {
  const sheet = await packSheet(frames12);
  writeFileSync(join(OUT_DIR, `${name}.png`), sheet);

  const atlas = makeAtlas(name, FRAME_NAMES);
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(atlas, null, 2));
  console.log(`✓  ${name}.png  (${FRAME_NAMES.length * SZ}×${SZ}px, 12 frames)`);
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });

  // ── DEER ──────────────────────────────────────────────────────────────────
  {
    const R  = makeDeerRight();
    const L  = mirrorH(R);
    const Dn = makeDeerDown();
    const Up = mirrorH(rotate90CW(rotate90CW(Dn)));  // flip down vertically = up view
    await writeSprite('deer', [R, R, R, L, L, L, Dn, Dn, Dn, Up, Up, Up]);
  }

  // ── CARS (one sheet per color variant) ───────────────────────────────────
  for (const pal of CAR_BODIES) {
    const R  = makeCarRight(pal);
    const L  = mirrorH(R);
    const Dn = makeCarDown(pal);
    const Up = rotate90CW(rotate90CW(Dn));  // 180° flip = car facing up
    await writeSprite(`car-${pal.label}`, [R, R, R, L, L, L, Dn, Dn, Dn, Up, Up, Up]);
  }

  // Alias car.png/json → red variant (NeighborhoodScene picks by color at runtime)
  const redSheet = await packSheet(
    Array.from({ length: 12 }, (_, i) => {
      const R  = makeCarRight(CAR_BODIES[0]);
      const L  = mirrorH(R);
      const Dn = makeCarDown(CAR_BODIES[0]);
      const Up = rotate90CW(rotate90CW(Dn));
      return [R, R, R, L, L, L, Dn, Dn, Dn, Up, Up, Up][i];
    })
  );
  writeFileSync(join(OUT_DIR, 'car.png'), redSheet);
  writeFileSync(join(OUT_DIR, 'car.json'), JSON.stringify(makeAtlas('car', FRAME_NAMES), null, 2));
  console.log('✓  car.png  (alias → red)');

  // ── GOLF CART ─────────────────────────────────────────────────────────────
  {
    const R  = makeGolfCartRight();
    const L  = mirrorH(R);
    const Dn = makeGolfCartDown();
    const Up = rotate90CW(rotate90CW(Dn));
    await writeSprite('golf-cart', [R, R, R, L, L, L, Dn, Dn, Dn, Up, Up, Up]);
  }

  console.log('\nAll obstacle sprites written to public/assets/sprites/');
}

run().catch(err => { console.error(err.message); process.exit(1); });
