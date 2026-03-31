import {
  SCENE_NEIGHBORHOOD, SCENE_DIALOGUE,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, PLAYER_SPEED, txt,
} from '../constants.js';
import Player from '../entities/Player.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import SaveSystem from '../systems/SaveSystem.js';

// ═══════════════════════════════════════════════════════════════════════════════
// REAL-WORLD MAP — derived from Google Maps screenshot of Tega Cay, SC
//
// Origin: Leo's house (Topsail Cir) → tile (40, 115)
// Scale:  1 tile = 8 meters
//         lat:  13,893 tiles/degree   lon: 11,378 tiles/degree
//
// GPS → tile:
//   col = 40 + (lon + 81.0343) × 11378
//   row = 115 - (lat - 35.0288) × 13893
//
// Key confirmed locations (image-calibrated):
//   Leo's house       Topsail Cir          (40,  115)
//   Warren's house    Tara Tea Dr corner   (152,  47)
//   Runde Park        W of Woodhaven Dr    cols 57-78,  rows 28-51
//   Golf Club                              cols 165-235, rows 0-30
//
// Main route: Topsail Cir → Point Clear Dr → Windward Dr (diagonal) →
//             connector road → Tega Cay Dr → Tara Tea Dr → Warren's
//
// Roads visible in map image:
//   Windward Dr     — main N-S arterial, runs NE diagonally, col 73→88 rows 22→110
//   Point Clear Dr  — E-W connector from Topsail to Windward roundabout
//   Catamaran Dr    — goes NW toward marina/lake, west side
//   Woodhaven Dr    — short N-S road just east of Runde Park
//   Tega Cay Dr     — diagonal road on east side of neighborhood
//   Tara Tea Dr     — E-W road from Tega Cay Dr to Warren's area
//   Mariana Ln      — E-W road below Tara Tea Dr
//   Marquesas Ave   — short E-W below Mariana Ln
// ═══════════════════════════════════════════════════════════════════════════════

const MAP_COLS = 280;
const MAP_ROWS = 160;

function darken(hex) {
  const r = Math.floor((hex >> 16 & 0xff) * 0.58);
  const g = Math.floor((hex >> 8  & 0xff) * 0.58);
  const b = Math.floor((hex       & 0xff) * 0.58);
  return (r << 16) | (g << 8) | b;
}

// ── Road segments [col, row, width, height, label] ────────────────────────────
const ROADS = [
  // ── Topsail Cir — Leo's cul-de-sac near Lake Wylie ────────────────────────
  [38, 106, 4, 10, 'Topsail Cir'],   // N approach up to Point Clear Dr
  [30, 114, 4, 13, null],             // W arm of loop
  [42, 114, 4, 13, null],             // E arm of loop
  [30, 125, 16, 4, null],             // S close (near lake)

  // ── Point Clear Dr — E-W from Topsail to Windward Dr ─────────────────────
  [38, 106, 36, 4, 'Point Clear Dr'],
  [72, 102, 5, 8,  null],             // N jog into Windward roundabout

  // ── Windward Dr — main N-S artery (diagonal, stairstepped NE) ─────────────
  // Southern section: col 72-77, rows 74-110
  [72, 74, 5, 36, 'Windward Dr'],
  [72, 74, 10, 4,  null],             // E-step connector at row 74
  // Mid section: col 78-83, rows 50-78
  [78, 50, 5, 28,  null],
  [78, 50, 10, 4,  null],             // E-step connector at row 50
  // Upper section: col 83-88, rows 20-54
  [83, 20, 5, 34,  null],

  // ── Woodhaven Dr — N-S road just east of Runde Park ──────────────────────
  [79, 20, 4, 24, 'Woodhaven Dr'],    // col 79-83, rows 20-44
  [79, 20, 8, 4,  null],              // E-W top connector to Windward

  // ── Catamaran Dr — NW from Woodhaven area toward marina ──────────────────
  [53, 8,  4, 16,  'Catamaran Dr'],   // N-S section near marina (col 53-57)
  [53, 8,  28, 4,  null],             // E-W to Woodhaven/Windward area

  // ── Cross connector: upper Windward Dr to Tega Cay Dr ─────────────────────
  [83, 26, 20, 4,  null],             // col 83-103, row 26-30

  // ── Tega Cay Dr — diagonal road on east side ─────────────────────────────
  // North section: col 100-104, rows 8-30
  [100, 8,  4, 24, 'Tega Cay Dr'],
  // Step SE:
  [100, 30, 8, 4,  null],
  // South section: col 104-108, rows 28-75
  [104, 28, 4, 48, null],

  // ── Tara Tea Dr — E-W from Tega Cay Dr to Warren's house ─────────────────
  [100, 44, 58, 4, 'Tara Tea Dr'],    // col 100-158, row 44-48

  // ── Mariana Ln — E-W below Tara Tea Dr ───────────────────────────────────
  [83, 65, 26, 4,  'Mariana Ln'],     // col 83-109, row 65-69

  // ── Marquesas Ave — short E-W below Mariana ──────────────────────────────
  [76, 88, 18, 4,  'Marquesas Ave'],
];

// ── Runde Park bounds ─────────────────────────────────────────────────────────
// Located west of Woodhaven Dr, east of Catamaran Dr, south of Catamaran E-W
const PARK_C = 57, PARK_R = 26, PARK_W = 22, PARK_H = 24;

// ── House clusters ────────────────────────────────────────────────────────────
const HOUSE_GROUPS = [
  // ── Topsail Circle neighborhood (Leo's area) ──────────────────────────────
  { col: 22, row: 99,  n: 4, stepCol: 7, stepRow: 0, color: 0x7a6b52 },
  { col: 22, row: 107, n: 4, stepCol: 7, stepRow: 0, color: 0x8b7355 },
  { col: 34, row: 111, n: 1, stepCol: 0, stepRow: 0, color: 0x9b8765 },  // Leo's house

  // ── Waterfront homes south of Topsail (backing up to Lake Wylie) ──────────
  { col: 20, row: 118, n: 4, stepCol: 8, stepRow: 0, color: 0x6b8ca5 },

  // ── Along Point Clear Dr ──────────────────────────────────────────────────
  { col: 48, row: 99,  n: 3, stepCol: 7, stepRow: 0, color: 0x7a6b52 },
  { col: 48, row: 111, n: 3, stepCol: 7, stepRow: 0, color: 0x856b52 },

  // ── Catamaran Dr / Woodhaven area (north of Runde Park) ───────────────────
  { col: 54, row: 14,  n: 5, stepCol: 6, stepRow: 0, color: 0x8b7b55 },
  { col: 84, row: 14,  n: 4, stepCol: 6, stepRow: 0, color: 0x7a6b52 },

  // ── Windward Dr residential (west side) ───────────────────────────────────
  { col: 62, row: 51,  n: 3, stepCol: 0, stepRow: 8, color: 0x7a8b52 },
  { col: 68, row: 76,  n: 3, stepCol: 0, stepRow: 8, color: 0x7a7b52 },

  // ── Suwarrow / Tara Tea Dr area east of Tega Cay Dr ──────────────────────
  { col: 118, row: 36, n: 5, stepCol: 6, stepRow: 0, color: 0x8b7b55 },
  { col: 118, row: 50, n: 5, stepCol: 6, stepRow: 0, color: 0x9b8060 },

  // ── Warren's house (red) ──────────────────────────────────────────────────
  { col: 152, row: 41, n: 1, stepCol: 0, stepRow: 0, color: 0x992222 },
];

export default class NeighborhoodScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_NEIGHBORHOOD });
  }

  create() {
    const worldW = MAP_COLS * TILE_SIZE;
    const worldH = MAP_ROWS * TILE_SIZE;

    // ── Systems ───────────────────────────────────────────────────────────────
    this._resources = new ResourceSystem(this.game);
    this._party     = new PartySystem(this.game);
    this._abilities = new AbilitySystem(this.game, this._party);

    const gameState = this.game.registry.get('gameState');
    if (gameState) {
      this._resources.restoreFromSave(gameState.resources);
      this._party.restoreFromSave(gameState);
    }
    this.game.registry.set('resources', this._resources);
    this.game.registry.set('party',     this._party);
    this.game.registry.set('abilities', this._abilities);

    this._abilities.register('lightning_fart', (scene, player) => {
      const ring = scene.add.circle(player.x, player.y, 6, 0xf5e642, 0.9);
      scene.tweens.add({ targets: ring, radius: 48, alpha: 0, duration: 400,
        onComplete: () => ring.destroy() });
    });

    // ── Ground (chunked) ──────────────────────────────────────────────────────
    const CHUNK = 8;
    for (let r = 0; r < MAP_ROWS; r += CHUNK) {
      for (let c = 0; c < MAP_COLS; c += CHUNK) {
        const even = ((r / CHUNK) + (c / CHUNK)) % 2 === 0;
        this.add.rectangle(
          c * TILE_SIZE + (CHUNK * TILE_SIZE) / 2,
          r * TILE_SIZE + (CHUNK * TILE_SIZE) / 2,
          CHUNK * TILE_SIZE, CHUNK * TILE_SIZE,
          even ? 0x2d5a1b : 0x336b20
        );
      }
    }

    // ── Lake Wylie ────────────────────────────────────────────────────────────
    this._buildLake();

    // ── Roads ─────────────────────────────────────────────────────────────────
    this._walls = this.physics.add.staticGroup();

    ROADS.forEach(([c, r, w, h, label]) => {
      const px = c * TILE_SIZE + (w * TILE_SIZE) / 2;
      const py = r * TILE_SIZE + (h * TILE_SIZE) / 2;
      const pw = w * TILE_SIZE;
      const ph = h * TILE_SIZE;
      this.add.rectangle(px, py, pw, ph, 0x4a4a55);
      if (w >= h) {
        this.add.rectangle(px, py, pw, 1, 0xffff88, 0.25);
      } else {
        this.add.rectangle(px, py, 1, ph, 0xffff88, 0.25);
      }
      if (label) {
        txt(this, c * TILE_SIZE + 2, r * TILE_SIZE + 2, label, {
          fontSize: '8px', color: '#888899',
        });
      }
    });

    // ── Runde Park ────────────────────────────────────────────────────────────
    const parkPx = PARK_C * TILE_SIZE + (PARK_W * TILE_SIZE) / 2;
    const parkPy = PARK_R * TILE_SIZE + (PARK_H * TILE_SIZE) / 2;
    this.add.rectangle(parkPx, parkPy, PARK_W * TILE_SIZE, PARK_H * TILE_SIZE, 0x1e7a1e);
    this.add.rectangle(parkPx, parkPy, PARK_W * TILE_SIZE, PARK_H * TILE_SIZE, 0, 0)
      .setStrokeStyle(2, 0x22aa22);
    txt(this, PARK_C * TILE_SIZE + 8, PARK_R * TILE_SIZE + 8, 'RUNDE\nPARK', {
      fontSize: '8px', color: '#88ff88',
    });
    this.add.rectangle(parkPx, parkPy, PARK_W * TILE_SIZE, 2, 0x4a7a2a);
    this.add.rectangle(parkPx, parkPy, 2, PARK_H * TILE_SIZE, 0x4a7a2a);

    // ── Golf course (upper right, north of Warren's area) ─────────────────────
    const GC_C = 165, GC_R = 0, GC_W = 68, GC_H = 30;
    const gcPx = GC_C * TILE_SIZE + (GC_W * TILE_SIZE) / 2;
    const gcPy = GC_R * TILE_SIZE + (GC_H * TILE_SIZE) / 2;
    this.add.rectangle(gcPx, gcPy, GC_W * TILE_SIZE, GC_H * TILE_SIZE, 0x1a6b1a);
    this.add.rectangle(gcPx, gcPy, GC_W * TILE_SIZE, GC_H * TILE_SIZE, 0, 0)
      .setStrokeStyle(2, 0x22aa22);
    for (let i = 0; i < 4; i++) {
      this.add.rectangle(
        (GC_C + 5 + i * 15) * TILE_SIZE, gcPy,
        10 * TILE_SIZE, (GC_H - 4) * TILE_SIZE, 0x1f7a1f
      );
    }
    txt(this, GC_C * TILE_SIZE + 8, 4, 'TEGA CAY\nGOLF CLUB', {
      fontSize: '8px', color: '#88ff88',
    });

    // ── Houses ────────────────────────────────────────────────────────────────
    HOUSE_GROUPS.forEach(({ col, row, n, stepCol, stepRow, color }) => {
      for (let i = 0; i < n; i++) {
        const hc = col + i * stepCol;
        const hr = row + i * stepRow;
        const hw = 4 * TILE_SIZE, hh = 3 * TILE_SIZE;
        const hx = hc * TILE_SIZE + 2 * TILE_SIZE;
        const hy = hr * TILE_SIZE + 1.5 * TILE_SIZE;
        this.add.rectangle(hx, hy, hw, hh, color);
        this.add.rectangle(hx, hr * TILE_SIZE + 0.5 * TILE_SIZE, hw, TILE_SIZE, darken(color));
        this._addBody(hx, hy, hw, hh);
      }
    });

    // Warren's label
    txt(this, 152 * TILE_SIZE, 38 * TILE_SIZE, "WARREN'S", {
      fontSize: '8px', color: '#ff8888',
    });

    // ── Trees ─────────────────────────────────────────────────────────────────
    this._generateTrees().forEach(([tc, tr]) => {
      const tx = tc * TILE_SIZE + TILE_SIZE / 2;
      const ty = tr * TILE_SIZE + TILE_SIZE / 2;
      this.add.circle(tx, ty, TILE_SIZE * 0.7, 0x1a5c1a);
      this.add.circle(tx, ty, TILE_SIZE * 0.4, 0x228b22);
      this._addBody(tx, ty, TILE_SIZE, TILE_SIZE);
    });

    // ── Boat docks along south shore ──────────────────────────────────────────
    [[28, 132], [44, 133], [62, 132], [76, 133]].forEach(([dc, dr]) => {
      this.add.rectangle(
        dc * TILE_SIZE + TILE_SIZE, dr * TILE_SIZE + TILE_SIZE * 2,
        TILE_SIZE * 2, TILE_SIZE * 4, 0x8b6914
      );
    });

    // ── Water collision ───────────────────────────────────────────────────────
    this._addWall(0, 132, MAP_COLS, MAP_ROWS - 132, false);  // main lake
    this._addWall(0, 100, 15, 32, false);                    // west arm

    // ── World border walls ────────────────────────────────────────────────────
    this._addWall(0, 0, MAP_COLS, 1, false);
    this._addWall(0, MAP_ROWS - 1, MAP_COLS, 1, false);
    this._addWall(0, 0, 1, MAP_ROWS, false);
    this._addWall(MAP_COLS - 1, 0, 1, MAP_ROWS, false);

    // ── Player ────────────────────────────────────────────────────────────────
    this._player = new Player(this, 40 * TILE_SIZE, 110 * TILE_SIZE);
    this.physics.add.collider(this._player, this._walls);

    // ── Input ─────────────────────────────────────────────────────────────────
    this._fartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      .once('down', () => this.scene.get(SCENE_DIALOGUE).showScript('intro', () => {}));

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this._player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(80, 60);

    // ── Controls hint (bottom of screen) ─────────────────────────────────────
    txt(this, 6, BASE_HEIGHT - 10, 'WASD: MOVE   F: FART   D: TALK', {
      fontSize: '8px', color: '#778899',
    }).setScrollFactor(0).setDepth(10);

    // ── Minimap ───────────────────────────────────────────────────────────────
    this._buildMinimap(worldW, worldH);

    this._resources.applyChanges({});
    this._party._emit();
  }

  update() {
    this._player.update();
    if (Phaser.Input.Keyboard.JustDown(this._fartKey)) {
      this._abilities.execute('lightning_fart', this, this._player);
    }
    this._updateMinimap();
    if (!this._lastSave || Date.now() - this._lastSave > 30000) {
      this._autosave();
      this._lastSave = Date.now();
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  _buildLake() {
    const T = TILE_SIZE;
    const W = MAP_COLS * T;
    // Sandy shoreline
    this.add.rectangle(W / 2, 129 * T, W, 3 * T, 0xc8a870);
    // Shallow water
    this.add.rectangle(W / 2, 132 * T, W, 4 * T, 0x2980b9);
    // Deep lake
    this.add.rectangle(W / 2, 141 * T, W, 20 * T, 0x1a5f8a);
    // West arm (peninsula effect)
    this.add.rectangle(6 * T, 105 * T, 12 * T, 30 * T, 0x1a5f8a);
    this.add.rectangle(13 * T, 105 * T, 3 * T, 30 * T, 0x2980b9);
    this.add.rectangle(16 * T, 105 * T, 2 * T, 30 * T, 0xc8a870);
    // Labels
    txt(this, 90 * T, 137 * T, 'LAKE WYLIE', { fontSize: '8px', color: '#7cc8e8' });
    txt(this, 2 * T, 105 * T, 'LAKE\nWYLIE', { fontSize: '8px', color: '#7cc8e8' });
    // Marina callout
    txt(this, 35 * T, 12 * T, 'TEGA CAY\nMARINA', { fontSize: '8px', color: '#4db8e8' });
  }

  _addBody(x, y, w, h) {
    const rect = this.add.rectangle(x, y, w, h, 0x000000).setAlpha(0);
    this.physics.add.existing(rect, true);
    this._walls.add(rect);
  }

  _addWall(col, row, w, h, visible = true) {
    const rect = this.add.rectangle(
      col * TILE_SIZE + (w * TILE_SIZE) / 2,
      row * TILE_SIZE + (h * TILE_SIZE) / 2,
      w * TILE_SIZE, h * TILE_SIZE, 0x000000
    );
    if (!visible) rect.setAlpha(0);
    this.physics.add.existing(rect, true);
    this._walls.add(rect);
  }

  _generateTrees() {
    // Returns tile positions for trees, avoiding roads, parks, water, buildings
    const onRoad = (c, r) => {
      if (r >= 128) return true;                                              // lake
      if (c <= 14 && r >= 100) return true;                                  // west arm

      // Topsail Cir loop
      if (c >= 30 && c <= 46 && r >= 106 && r <= 130) return true;

      // Point Clear Dr (E-W) + N jog
      if (r >= 106 && r <= 110 && c >= 38 && c <= 77) return true;
      if (c >= 72 && c <= 77 && r >= 102 && r <= 110) return true;

      // Windward Dr — all three stairstepped segments
      if (c >= 72 && c <= 77 && r >= 74 && r <= 110) return true;
      if (r >= 74 && r <= 78 && c >= 72 && c <= 88) return true;  // E-step
      if (c >= 78 && c <= 83 && r >= 50 && r <= 78) return true;
      if (r >= 50 && r <= 54 && c >= 78 && c <= 88) return true;  // E-step
      if (c >= 83 && c <= 88 && r >= 20 && r <= 54) return true;

      // Woodhaven Dr
      if (c >= 79 && c <= 83 && r >= 20 && r <= 44) return true;
      if (r >= 20 && r <= 24 && c >= 79 && c <= 91) return true;

      // Catamaran Dr
      if (c >= 53 && c <= 57 && r >= 8 && r <= 24) return true;
      if (r >= 8 && r <= 12 && c >= 53 && c <= 81) return true;

      // Cross connector to Tega Cay Dr
      if (r >= 26 && r <= 30 && c >= 83 && c <= 103) return true;

      // Tega Cay Dr
      if (c >= 100 && c <= 104 && r >= 8 && r <= 32) return true;
      if (r >= 30 && r <= 34 && c >= 100 && c <= 112) return true;
      if (c >= 104 && c <= 108 && r >= 28 && r <= 76) return true;

      // Tara Tea Dr
      if (r >= 44 && r <= 48 && c >= 100 && c <= 158) return true;

      // Mariana Ln
      if (r >= 65 && r <= 69 && c >= 83 && c <= 109) return true;

      // Marquesas Ave
      if (r >= 88 && r <= 92 && c >= 76 && c <= 94) return true;

      // Runde Park
      if (c >= PARK_C && c <= PARK_C + PARK_W && r >= PARK_R && r <= PARK_R + PARK_H) return true;

      // Golf course
      if (c >= 165 && r <= 30) return true;

      return false;
    };

    const positions = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    };
    for (let i = 0; i < 700; i++) {
      const c = Math.floor(rand() * (MAP_COLS - 4)) + 2;
      const r = Math.floor(rand() * (MAP_ROWS - 4)) + 2;
      if (!onRoad(c, r)) positions.push([c, r]);
    }
    return positions;
  }

  _buildMinimap(worldW, worldH) {
    const MM_W = 90, MM_H = 55;
    const MM_X = BASE_WIDTH - MM_W - 4;
    const MM_Y = 32;  // below HUD strip
    const sx = MM_W / worldW, sy = MM_H / worldH;

    // Background
    this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W, MM_H, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(50);
    this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W, MM_H, 0, 0)
      .setStrokeStyle(1, 0x334455).setScrollFactor(0).setDepth(50);

    // Lake (bottom strip + west arm)
    this.add.rectangle(
      MM_X + MM_W / 2,
      MM_Y + 131 * TILE_SIZE * sy + (29 * TILE_SIZE * sy) / 2,
      MM_W, 29 * TILE_SIZE * sy, 0x1a5f8a
    ).setScrollFactor(0).setDepth(51);
    this.add.rectangle(
      MM_X + 5 * TILE_SIZE * sx, MM_Y + 105 * TILE_SIZE * sy,
      10 * TILE_SIZE * sx, 30 * TILE_SIZE * sy, 0x1a5f8a
    ).setScrollFactor(0).setDepth(51);

    // Runde Park
    this.add.rectangle(
      MM_X + PARK_C * TILE_SIZE * sx + (PARK_W * TILE_SIZE * sx) / 2,
      MM_Y + PARK_R * TILE_SIZE * sy + (PARK_H * TILE_SIZE * sy) / 2,
      PARK_W * TILE_SIZE * sx, PARK_H * TILE_SIZE * sy, 0x1e7a1e
    ).setScrollFactor(0).setDepth(51);

    // Roads
    ROADS.forEach(([c, r, w, h]) => {
      this.add.rectangle(
        MM_X + c * TILE_SIZE * sx + (w * TILE_SIZE * sx) / 2,
        MM_Y + r * TILE_SIZE * sy + (h * TILE_SIZE * sy) / 2,
        Math.max(1, w * TILE_SIZE * sx), Math.max(1, h * TILE_SIZE * sy),
        0x777788
      ).setScrollFactor(0).setDepth(51);
    });

    // Leo (blue) + Warren (red)
    this.add.rectangle(
      MM_X + 40 * TILE_SIZE * sx, MM_Y + 113 * TILE_SIZE * sy, 3, 3, 0x4488ff
    ).setScrollFactor(0).setDepth(51);
    this.add.rectangle(
      MM_X + 152 * TILE_SIZE * sx, MM_Y + 43 * TILE_SIZE * sy, 3, 3, 0xff4444
    ).setScrollFactor(0).setDepth(51);

    this._minimapDot = this.add.circle(0, 0, 2, 0xffffff).setScrollFactor(0).setDepth(52);
    this._mm = { x: MM_X, y: MM_Y, sx, sy };
  }

  _updateMinimap() {
    this._minimapDot.setPosition(
      this._mm.x + this._player.x * this._mm.sx,
      this._mm.y + this._player.y * this._mm.sy
    );
  }

  _autosave() {
    const gs = this.game.registry.get('gameState') ?? {};
    gs.resources = this._resources.getAll();
    Object.assign(gs, this._party.getState());
    SaveSystem.save(gs);
  }
}
