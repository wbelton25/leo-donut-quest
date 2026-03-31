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
// REAL-WORLD MAP DATA
// Origin: Leo's house (35.0288°N, -81.0343°W) → tile (40, 115)
// Scale:  1 tile = 8 meters
//         lat:  13,893 tiles / degree
//         lon:  11,378 tiles / degree
//
// GPS → tile:
//   col = 40 + (lon_deg + 81.0343) × 11378
//   row = 115 − (lat_deg − 35.0288) × 13893
//
// Key landmarks:
//   Leo's house      35.0288, -81.0343  →  (40,  115)
//   Warren's house   35.0337, -81.0248  →  (148,  47)
//   Runde Park ctr   ~35.0310, -81.0316  →  (62,   87)
//   Lake Wylie       begins ~row 130 southward (Leo is ~120m from shore)
//   Golf Club        35.0365, -81.0204  →  (198,   8)
// ═══════════════════════════════════════════════════════════════════════════════

const MAP_COLS = 280;
const MAP_ROWS = 160;

// Roof darkener — avoid Phaser.Display.Color API which may not have darken()
function darken(hex) {
  const r = Math.floor((hex >> 16 & 0xff) * 0.58);
  const g = Math.floor((hex >> 8  & 0xff) * 0.58);
  const b = Math.floor((hex       & 0xff) * 0.58);
  return (r << 16) | (g << 8) | b;
}

// ── Road segments [col, row, width, height, label] ────────────────────────────
const ROADS = [
  // ── Topsail Circle — cul-de-sac loop near Lake Wylie ──────────────────────
  [37, 97, 4, 19, 'Topsail Cir'],   // approach south from Anchorage Ln
  [30, 114, 4, 14, null],           // west arm of loop
  [41, 114, 4, 14, null],           // east arm of loop
  [30, 126, 15, 4, null],           // south bar (terminates near lake shore)

  // ── Anchorage Lane — main E-W artery out of The Anchorage ─────────────────
  [17, 96, 72, 4, 'Anchorage Ln'],

  // ── Marina Drive — N-S connector ──────────────────────────────────────────
  [46, 58, 4, 40, 'Marina Dr'],

  // ── Cross road (E-W) connecting Marina Dr east ────────────────────────────
  [46, 56, 45, 4, null],

  // ── Catamaran Drive — curves north toward golf course ─────────────────────
  [85, 38, 4, 20, 'Catamaran Dr'],

  // ── Windward Drive — runs NE past area ────────────────────────────────────
  [85, 36, 36, 4, 'Windward Dr'],

  // ── Suwarrow Circle — east to Warren's house ──────────────────────────────
  [85, 44, 70, 4, 'Suwarrow Cir'],

  // ── Tega Cay Drive ────────────────────────────────────────────────────────
  [70, 52, 4, 47, 'Tega Cay Dr'],
  [70, 52, 30, 4, null],           // E arm to Windward

  // ── Tara Tea Dr — Warren's corner ─────────────────────────────────────────
  [148, 32, 4, 20, 'Tara Tea Dr'],
];

// ── Park constants ────────────────────────────────────────────────────────────
// Runde Park — moved to central position between Leo and Warren
const PARK_C = 52, PARK_R = 65, PARK_W = 26, PARK_H = 24;

// ── House clusters ────────────────────────────────────────────────────────────
const HOUSE_GROUPS = [
  // The Anchorage — Leo's neighborhood (both sides of Anchorage Lane)
  { col: 22, row: 100, n: 5, stepCol: 7, stepRow: 0, color: 0x7a6b52 },  // south side
  { col: 22, row: 91,  n: 5, stepCol: 7, stepRow: 0, color: 0x8b7355 },  // north side
  // Leo's own house
  { col: 34, row: 110, n: 1, stepCol: 0, stepRow: 0, color: 0x9b8765 },

  // Waterfront homes — south of Anchorage Lane, backing up to lake
  { col: 20, row: 101, n: 4, stepCol: 8, stepRow: 0, color: 0x6b8ca5 },  // lake-facing
  { col: 56, row: 101, n: 3, stepCol: 8, stepRow: 0, color: 0x7a9bb5 },  // lake-facing east

  // Along Marina Drive
  { col: 38, row: 61,  n: 4, stepCol: 0, stepRow: 8, color: 0x7a6b52 },
  { col: 52, row: 61,  n: 4, stepCol: 0, stepRow: 8, color: 0x856b52 },

  // Around Runde Park area
  { col: 82, row: 28,  n: 5, stepCol: 7, stepRow: 0, color: 0x8b7b55 },  // north of park
  { col: 82, row: 50,  n: 4, stepCol: 7, stepRow: 0, color: 0x7a6b52 },  // south of park

  // Suwarrow Circle area — Warren's neighborhood
  { col: 118, row: 37, n: 6, stepCol: 6, stepRow: 0, color: 0x8b7b55 },
  { col: 118, row: 50, n: 5, stepCol: 6, stepRow: 0, color: 0x9b8060 },

  // Warren's house (red)
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
      if (w > h) {
        this.add.rectangle(px, py, pw, 1, 0xffff88, 0.3);
      } else {
        this.add.rectangle(px, py, 1, ph, 0xffff88, 0.3);
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
    // Crossing paths
    this.add.rectangle(parkPx, parkPy, PARK_W * TILE_SIZE, 2, 0x4a7a2a);
    this.add.rectangle(parkPx, parkPy, 2, PARK_H * TILE_SIZE, 0x4a7a2a);

    // ── Golf course ───────────────────────────────────────────────────────────
    const GC_C = 190, GC_R = 5, GC_W = 70, GC_H = 35;
    const gcPx = GC_C * TILE_SIZE + (GC_W * TILE_SIZE) / 2;
    const gcPy = GC_R * TILE_SIZE + (GC_H * TILE_SIZE) / 2;
    this.add.rectangle(gcPx, gcPy, GC_W * TILE_SIZE, GC_H * TILE_SIZE, 0x1a6b1a);
    this.add.rectangle(gcPx, gcPy, GC_W * TILE_SIZE, GC_H * TILE_SIZE, 0, 0)
      .setStrokeStyle(2, 0x22aa22);
    for (let i = 0; i < 4; i++) {
      this.add.rectangle(
        (GC_C + 4 + i * 15) * TILE_SIZE, gcPy,
        10 * TILE_SIZE, (GC_H - 4) * TILE_SIZE, 0x1f7a1f
      );
    }
    txt(this, GC_C * TILE_SIZE + 8, GC_R * TILE_SIZE + 4, 'TEGA CAY\nGOLF CLUB', {
      fontSize: '8px', color: '#88ff88',
    });

    // ── Houses ────────────────────────────────────────────────────────────────
    HOUSE_GROUPS.forEach(({ col, row, n, stepCol, stepRow, color }) => {
      for (let i = 0; i < n; i++) {
        const hc = col + i * stepCol;
        const hr = row + i * stepRow;
        this.add.rectangle(
          hc * TILE_SIZE + 2 * TILE_SIZE,
          hr * TILE_SIZE + 1.5 * TILE_SIZE,
          4 * TILE_SIZE, 3 * TILE_SIZE, color
        );
        this.add.rectangle(
          hc * TILE_SIZE + 2 * TILE_SIZE,
          hr * TILE_SIZE + 0.5 * TILE_SIZE,
          4 * TILE_SIZE, TILE_SIZE, darken(color)
        );
      }
    });

    // Warren's house label
    txt(this, 152 * TILE_SIZE, 39 * TILE_SIZE, "WARREN'S", {
      fontSize: '8px', color: '#ff8888',
    });

    // ── Trees ─────────────────────────────────────────────────────────────────
    this._generateTrees().forEach(([tc, tr]) => {
      this.add.circle(
        tc * TILE_SIZE + TILE_SIZE / 2, tr * TILE_SIZE + TILE_SIZE / 2,
        TILE_SIZE * 0.7, 0x1a5c1a
      );
      this.add.circle(
        tc * TILE_SIZE + TILE_SIZE / 2, tr * TILE_SIZE + TILE_SIZE / 2,
        TILE_SIZE * 0.4, 0x228b22
      );
    });

    // ── Boat docks on lake shore ──────────────────────────────────────────────
    [[28, 132], [44, 133], [62, 132], [76, 133]].forEach(([dc, dr]) => {
      // dock plank extending into lake
      this.add.rectangle(
        dc * TILE_SIZE + TILE_SIZE, dr * TILE_SIZE + TILE_SIZE * 2,
        TILE_SIZE * 2, TILE_SIZE * 4, 0x8b6914
      );
    });

    // ── World border walls ────────────────────────────────────────────────────
    this._addWall(0, 0, MAP_COLS, 1, false);
    this._addWall(0, MAP_ROWS - 1, MAP_COLS, 1, false);
    this._addWall(0, 0, 1, MAP_ROWS, false);
    this._addWall(MAP_COLS - 1, 0, 1, MAP_ROWS, false);

    // ── Player (starts at Leo's house) ────────────────────────────────────────
    this._player = new Player(this, 40 * TILE_SIZE, 110 * TILE_SIZE);
    this.physics.add.collider(this._player, this._walls);

    // ── Keys ──────────────────────────────────────────────────────────────────
    this._fartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      .once('down', () => this.scene.get(SCENE_DIALOGUE).showScript('intro', () => {}));

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this._player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(80, 60);

    // ── Controls hint (bottom of screen, below HUD now at top) ───────────────
    txt(this, 6, BASE_HEIGHT - 10, 'WASD: MOVE   F: FART   D: TALK', {
      fontSize: '8px', color: '#778899',
    }).setScrollFactor(0).setDepth(10);

    // ── Minimap ───────────────────────────────────────────────────────────────
    this._buildMinimap(worldW, worldH);

    // Emit initial state to HUD
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

    // Sandy shoreline strip (north edge of lake)
    this.add.rectangle(W / 2, 129 * T, W, 3 * T, 0xc8a870);

    // Shallow water
    this.add.rectangle(W / 2, 132.5 * T, W, 3 * T, 0x2980b9);

    // Main lake body (fills to bottom of map)
    this.add.rectangle(W / 2, 140 * T, W, 20 * T, 0x1a5f8a);

    // Western lake arm — Lake Wylie wraps the west side of Tega Cay peninsula
    this.add.rectangle(6 * T, 105 * T, 12 * T, 30 * T, 0x1a5f8a);
    // West shore edge
    this.add.rectangle(12 * T + T / 2, 105 * T, 3 * T, 30 * T, 0x2980b9);
    this.add.rectangle(15 * T + T / 2, 105 * T, 2 * T, 30 * T, 0xc8a870);

    // Lake label
    txt(this, 90 * T, 137 * T, 'LAKE WYLIE', {
      fontSize: '8px', color: '#7cc8e8',
    });

    // Dock pilings on the main shoreline
    [25, 36, 50, 65, 80].forEach(col => {
      this.add.rectangle(col * T, 130 * T, T / 2, T, 0x5a3a0a);
    });
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
    const onRoad = (c, r) => {
      if (r >= 128) return true;                                              // lake shore / water
      if (c <= 15 && r >= 100) return true;                                  // west lake arm
      if (r >= 96 && r <= 101 && c >= 17 && c <= 89) return true;           // Anchorage Lane
      if (c >= 46 && c <= 50 && r >= 56 && r <= 98)  return true;           // Marina Dr
      if (r >= 55 && r <= 61 && c >= 46 && c <= 92)  return true;           // cross road
      if (c >= 83 && c <= 91 && r >= 36 && r <= 60)  return true;           // Catamaran/Windward
      if (r >= 43 && r <= 49 && c >= 83 && c <= 158) return true;           // Suwarrow Cir
      if (c >= 68 && c <= 74 && r >= 52 && r <= 100) return true;           // Tega Cay Dr
      if (c >= 37 && c <= 46 && r >= 97 && r <= 130) return true;           // Topsail Circle
      if (c >= 30 && c <= 46 && r >= 114 && r <= 130) return true;          // Topsail loop arms
      if (c >= PARK_C && c <= PARK_C + PARK_W && r >= PARK_R && r <= PARK_R + PARK_H) return true; // Runde Park
      if (c >= 190 && c <= 260 && r >= 5 && r <= 40) return true;           // golf course
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
    // Position minimap below the HUD strip (HUD is 28px tall at top)
    const MM_Y = 32;
    const sx = MM_W / worldW, sy = MM_H / worldH;

    this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W, MM_H, 0x000000, 0.8)
      .setScrollFactor(0).setDepth(50);
    this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W, MM_H, 0, 0)
      .setStrokeStyle(1, 0x334455).setScrollFactor(0).setDepth(50);

    // Lake on minimap (bottom strip)
    this.add.rectangle(
      MM_X + MM_W / 2, MM_Y + 130 * TILE_SIZE * sy + (30 * TILE_SIZE * sy) / 2,
      MM_W, 30 * TILE_SIZE * sy, 0x1a5f8a
    ).setScrollFactor(0).setDepth(51);

    // West lake arm on minimap
    this.add.rectangle(
      MM_X + 4 * TILE_SIZE * sx, MM_Y + 108 * TILE_SIZE * sy,
      10 * TILE_SIZE * sx, 30 * TILE_SIZE * sy, 0x1a5f8a
    ).setScrollFactor(0).setDepth(51);

    // Runde Park on minimap
    this.add.rectangle(
      MM_X + PARK_C * TILE_SIZE * sx + (PARK_W * TILE_SIZE * sx) / 2,
      MM_Y + PARK_R * TILE_SIZE * sy + (PARK_H * TILE_SIZE * sy) / 2,
      PARK_W * TILE_SIZE * sx, PARK_H * TILE_SIZE * sy, 0x1e7a1e
    ).setScrollFactor(0).setDepth(51);

    // Roads on minimap
    ROADS.forEach(([c, r, w, h]) => {
      this.add.rectangle(
        MM_X + c * TILE_SIZE * sx + (w * TILE_SIZE * sx) / 2,
        MM_Y + r * TILE_SIZE * sy + (h * TILE_SIZE * sy) / 2,
        Math.max(1, w * TILE_SIZE * sx), Math.max(1, h * TILE_SIZE * sy),
        0x777788
      ).setScrollFactor(0).setDepth(51);
    });

    // Warren's house (red dot)
    this.add.rectangle(
      MM_X + 152 * TILE_SIZE * sx, MM_Y + 43 * TILE_SIZE * sy, 3, 3, 0xff4444
    ).setScrollFactor(0).setDepth(51);

    // Leo's house (blue dot)
    this.add.rectangle(
      MM_X + 40 * TILE_SIZE * sx, MM_Y + 112 * TILE_SIZE * sy, 3, 3, 0x4488ff
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
