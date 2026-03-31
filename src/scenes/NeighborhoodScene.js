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
// Origin: Leo's house (35.0288°N, -81.0343°W) → tile (40, 130)
// Scale:  1 tile = 8 meters
//         lat:  13,893 tiles / degree  (1° lat = 111,139 m)
//         lon:  11,378 tiles / degree  (1° lon at 35°N = 91,050 m)
//
// GPS → tile:
//   col = 40 + (lon_deg + 81.0343) × 11378
//   row = 130 − (lat_deg − 35.0288) × 13893
//
// Key points (verified from OpenStreetMap):
//   Leo's house      35.0288, -81.0343  →  (40,  130)
//   Warren's house   35.0337, -81.0248  →  (148,  62)   ~865m E, ~545m N
//   Golf Club        35.0365, -81.0204  →  (198,  23)
//   Runde Park ctr   35.0328, -81.0291  →  (99,   74)
//   Runde Park bbox  N=35.0339→row59, S=35.0316→row91,
//                    W=-81.0303→col85,  E=-81.0277→col115
//   Anchorage Lane   ~35.0300, cols 17–88, row 112
//   Marina Drive     col 48, rows 73–112  (N-S connector)
//   Cross road       row 73, cols 48–90
//   Windward Drive   cols 99–117, rows 57–75  (runs past Runde Park)
//   Suwarrow Circle  row 62, cols 117–152
// ═══════════════════════════════════════════════════════════════════════════════

const MAP_COLS = 280;
const MAP_ROWS = 160;

// ── Road segments [col, row, width, height, label] ────────────────────────────
const ROADS = [
  // Topsail Circle cul-de-sac loop (Leo's street)
  [38, 113, 4, 17, null],          // north from Leo to Anchorage Lane
  [30, 122, 14, 3,  null],         // cul-de-sac east arm
  [30, 116, 3, 9,  null],          // cul-de-sac west arm

  // Anchorage Lane — main E-W road out of The Anchorage
  [17, 111, 72, 4,  'Anchorage Ln'],

  // Marina Drive — N-S connector from Anchorage Lane north
  [46, 73, 4, 38, 'Marina Dr'],

  // Cross road connecting Marina Dr east to Catamaran Dr / park area
  [46, 71, 45, 4, null],

  // Catamaran Drive — curves north toward golf course
  [85, 54, 4, 19, 'Catamaran Dr'],

  // Windward Drive — runs NE past Runde Park toward Suwarrow
  [85, 52, 36, 4,  'Windward Dr'],

  // Suwarrow Circle approach (east to Warren's house)
  [85, 60, 70, 4,  'Suwarrow Cir'],

  // Tega Cay Drive segment (secondary road, runs NE past the area)
  [70, 68, 4, 46, 'Tega Cay Dr'],  // N-S segment
  [70, 68, 30, 4,  null],          // E arm connecting to Windward

  // Short stub: Tara Tea Dr (intersects Suwarrow near Warren)
  [148, 48, 4, 20, 'Tara Tea Dr'],
];

// ── House clusters [col, row, count, direction, color] ───────────────────────
// direction: 'h'=houses face road horizontally, 'v'=vertically
// Each house is drawn as a 4×3 tile rectangle
const HOUSE_GROUPS = [
  // The Anchorage — Leo's neighborhood (south of Anchorage Lane)
  { col: 22, row: 116, n: 5, stepCol: 7, stepRow: 0,  color: 0x7a6b52 },  // south side
  { col: 22, row: 107, n: 5, stepCol: 7, stepRow: 0,  color: 0x8b7355 },  // north side
  // Leo's own house (slightly different color)
  { col: 34, row: 126, n: 1, stepCol: 0, stepRow: 0,  color: 0x9b8765 },

  // Along Marina Drive
  { col: 38, row: 76,  n: 4, stepCol: 0, stepRow: 8,  color: 0x7a6b52 },
  { col: 52, row: 76,  n: 4, stepCol: 0, stepRow: 8,  color: 0x856b52 },

  // Around Runde Park (Windward Drive / Catamaran area)
  { col: 90, row: 45,  n: 5, stepCol: 7, stepRow: 0,  color: 0x8b7b55 },
  { col: 90, row: 65,  n: 4, stepCol: 7, stepRow: 0,  color: 0x7a6b52 },

  // Suwarrow Circle area — Warren's neighborhood
  { col: 118, row: 53, n: 6, stepCol: 6, stepRow: 0,  color: 0x8b7b55 },
  { col: 118, row: 65, n: 5, stepCol: 6, stepRow: 0,  color: 0x9b8060 },
  // Warren's house (highlighted red)
  { col: 152, row: 57, n: 1, stepCol: 0, stepRow: 0,  color: 0x992222 },
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

    // ── Ground (chunked for performance) ─────────────────────────────────────
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

    // ── Roads ─────────────────────────────────────────────────────────────────
    this._walls = this.physics.add.staticGroup();

    ROADS.forEach(([c, r, w, h, label]) => {
      const px = c * TILE_SIZE + (w * TILE_SIZE) / 2;
      const py = r * TILE_SIZE + (h * TILE_SIZE) / 2;
      const pw = w * TILE_SIZE;
      const ph = h * TILE_SIZE;

      // Road surface
      this.add.rectangle(px, py, pw, ph, 0x4a4a55);
      // Centre line
      if (w > h) {
        this.add.rectangle(px, py, pw, 1, 0xffff88, 0.3);
      } else {
        this.add.rectangle(px, py, 1, ph, 0xffff88, 0.3);
      }
      // Road label
      if (label) {
        txt(this, c * TILE_SIZE + 2, r * TILE_SIZE + 2, label, {
          fontSize: '8px', color: '#888899',
        });
      }
    });

    // ── Runde Park ────────────────────────────────────────────────────────────
    // GPS-derived bounds: cols 85-115, rows 59-91
    const PARK_C = 85, PARK_R = 59, PARK_W = 30, PARK_H = 32;
    const parkPx = PARK_C * TILE_SIZE + (PARK_W * TILE_SIZE) / 2;
    const parkPy = PARK_R * TILE_SIZE + (PARK_H * TILE_SIZE) / 2;
    // Park grass
    this.add.rectangle(parkPx, parkPy, PARK_W * TILE_SIZE, PARK_H * TILE_SIZE, 0x1e7a1e);
    // Park border
    this.add.rectangle(parkPx, parkPy, PARK_W * TILE_SIZE, PARK_H * TILE_SIZE, 0, 0)
      .setStrokeStyle(2, 0x22aa22);
    // Park label
    txt(this, PARK_C * TILE_SIZE + 8, PARK_R * TILE_SIZE + 8, 'RUNDE\nPARK', {
      fontSize: '8px', color: '#88ff88',
    });
    // Park features: path, bench spots
    this.add.rectangle(parkPx, parkPy, PARK_W * TILE_SIZE, 2, 0x4a7a2a); // path
    this.add.rectangle(parkPx, parkPy, 2, PARK_H * TILE_SIZE, 0x4a7a2a); // path

    // ── Golf course ───────────────────────────────────────────────────────────
    // GPS: 35.0365,-81.0204 → tile (198,23); 27-hole course, large footprint
    this.add.rectangle(205 * TILE_SIZE, 35 * TILE_SIZE, 60 * TILE_SIZE, 40 * TILE_SIZE, 0x1a6b1a);
    this.add.rectangle(205 * TILE_SIZE, 35 * TILE_SIZE, 60 * TILE_SIZE, 40 * TILE_SIZE, 0, 0)
      .setStrokeStyle(2, 0x22aa22);
    // Fairway strips
    for (let i = 0; i < 4; i++) {
      this.add.rectangle(
        (193 + i * 14) * TILE_SIZE, 35 * TILE_SIZE,
        10 * TILE_SIZE, 38 * TILE_SIZE, 0x1f7a1f
      );
    }
    txt(this, 197 * TILE_SIZE, 17 * TILE_SIZE, 'TEGA CAY\nGOLF CLUB', {
      fontSize: '8px', color: '#88ff88',
    });

    // ── Houses ────────────────────────────────────────────────────────────────
    HOUSE_GROUPS.forEach(({ col, row, n, stepCol, stepRow, color }) => {
      for (let i = 0; i < n; i++) {
        const hc = col + i * stepCol;
        const hr = row + i * stepRow;
        // House body
        this.add.rectangle(
          hc * TILE_SIZE + 2 * TILE_SIZE,
          hr * TILE_SIZE + 1.5 * TILE_SIZE,
          4 * TILE_SIZE, 3 * TILE_SIZE, color
        );
        // Roof (darker strip across top)
        this.add.rectangle(
          hc * TILE_SIZE + 2 * TILE_SIZE,
          hr * TILE_SIZE + 0.5 * TILE_SIZE,
          4 * TILE_SIZE, TILE_SIZE,
          Phaser.Display.Color.ValueToColor(color).darken(30).color
        );
      }
    });

    // Warren's house label
    txt(this, 152 * TILE_SIZE, 55 * TILE_SIZE, "WARREN'S", {
      fontSize: '8px', color: '#ff8888',
    });

    // ── Trees ─────────────────────────────────────────────────────────────────
    // Scatter trees in grass areas (avoid roads and buildings)
    // Use a seeded pattern so they're consistent
    const TREE_POSITIONS = this._generateTrees();
    TREE_POSITIONS.forEach(([tc, tr]) => {
      this.add.circle(tc * TILE_SIZE + TILE_SIZE / 2, tr * TILE_SIZE + TILE_SIZE / 2,
        TILE_SIZE * 0.7, 0x1a5c1a);
      this.add.circle(tc * TILE_SIZE + TILE_SIZE / 2, tr * TILE_SIZE + TILE_SIZE / 2,
        TILE_SIZE * 0.4, 0x228b22);
    });

    // ── World border walls ────────────────────────────────────────────────────
    this._addWall(0, 0, MAP_COLS, 1, false);
    this._addWall(0, MAP_ROWS - 1, MAP_COLS, 1, false);
    this._addWall(0, 0, 1, MAP_ROWS, false);
    this._addWall(MAP_COLS - 1, 0, 1, MAP_ROWS, false);

    // ── Player ────────────────────────────────────────────────────────────────
    this._player = new Player(this, 40 * TILE_SIZE, 125 * TILE_SIZE);
    this.physics.add.collider(this._player, this._walls);

    // ── Keys ──────────────────────────────────────────────────────────────────
    this._fartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      .once('down', () => this.scene.get(SCENE_DIALOGUE).showScript('intro', () => {}));

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this._player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(80, 60);

    // ── On-screen controls hint ───────────────────────────────────────────────
    // Placed above HUD strip, fixed to camera
    txt(this, 6, BASE_HEIGHT - 46, 'MOVE: WASD / ARROWS   F: FART   D: TALK', {
      fontSize: '8px', color: '#778899',
    }).setScrollFactor(0);

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
    // Deterministic pseudo-random tree placement (no Math.random so layout is stable)
    const positions = [];
    // Road tile lookup (very approximate — just avoid major road rows/cols)
    const onRoad = (c, r) => {
      if (r >= 110 && r <= 116 && c >= 17 && c <= 89) return true;  // Anchorage Lane
      if (c >= 46 && c <= 50 && r >= 71 && r <= 113) return true;   // Marina Dr
      if (r >= 70 && r <= 75 && c >= 46 && c <= 92)  return true;   // cross road
      if (c >= 83 && c <= 91 && r >= 52 && r <= 75)  return true;   // Catamaran/Windward
      if (r >= 59 && r <= 65 && c >= 83 && c <= 158) return true;   // Suwarrow
      if (c >= 68 && c <= 74 && r >= 68 && r <= 115) return true;   // Tega Cay Dr
      if (c >= 83 && c <= 118 && r >= 58 && r <= 94) return true;   // Runde Park (no trees inside park boundary)
      if (c >= 38 && c <= 42 && r >= 112 && r <= 130) return true;  // Topsail approach
      return false;
    };
    // Seed-based positions scattered across the map
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };

    for (let i = 0; i < 600; i++) {
      const c = Math.floor(rand() * (MAP_COLS - 4)) + 2;
      const r = Math.floor(rand() * (MAP_ROWS - 4)) + 2;
      if (!onRoad(c, r)) positions.push([c, r]);
    }
    return positions;
  }

  _buildMinimap(worldW, worldH) {
    const MM_W = 90, MM_H = 55;
    const MM_X = BASE_WIDTH - MM_W - 4, MM_Y = 4;
    const sx = MM_W / worldW, sy = MM_H / worldH;

    this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W, MM_H, 0x000000, 0.8)
      .setScrollFactor(0).setDepth(50);
    this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W, MM_H, 0, 0)
      .setStrokeStyle(1, 0x334455).setScrollFactor(0).setDepth(50);

    // Roads on minimap
    ROADS.forEach(([c, r, w, h]) => {
      this.add.rectangle(
        MM_X + c * TILE_SIZE * sx + (w * TILE_SIZE * sx) / 2,
        MM_Y + r * TILE_SIZE * sy + (h * TILE_SIZE * sy) / 2,
        Math.max(1, w * TILE_SIZE * sx), Math.max(1, h * TILE_SIZE * sy),
        0x777788
      ).setScrollFactor(0).setDepth(51);
    });

    // Runde Park on minimap
    const PARK_C = 85, PARK_R = 59, PARK_W = 30, PARK_H = 32;
    this.add.rectangle(
      MM_X + PARK_C * TILE_SIZE * sx + (PARK_W * TILE_SIZE * sx) / 2,
      MM_Y + PARK_R * TILE_SIZE * sy + (PARK_H * TILE_SIZE * sy) / 2,
      PARK_W * TILE_SIZE * sx, PARK_H * TILE_SIZE * sy, 0x1e7a1e
    ).setScrollFactor(0).setDepth(51);

    // Warren's house on minimap (red dot)
    this.add.rectangle(MM_X + 152 * TILE_SIZE * sx, MM_Y + 59 * TILE_SIZE * sy, 3, 3, 0xff4444)
      .setScrollFactor(0).setDepth(51);

    // Leo's house on minimap (blue dot)
    this.add.rectangle(MM_X + 40 * TILE_SIZE * sx, MM_Y + 127 * TILE_SIZE * sy, 3, 3, 0x4488ff)
      .setScrollFactor(0).setDepth(51);

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
