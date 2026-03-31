import {
  SCENE_NEIGHBORHOOD, SCENE_DIALOGUE,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, PLAYER_SPEED, txt,
} from '../constants.js';
import Player from '../entities/Player.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import SaveSystem from '../systems/SaveSystem.js';

// ─── Real-world map layout ─────────────────────────────────────────────────────
// Each tile = 8 meters. World = 250×160 tiles = 2000m × 1280m (~1.25mi × 0.8mi)
//
// GPS reference points → tile coordinates:
//   Leo's house   (35.0288, -81.0343)  →  tile (18, 130)  [bottom-left area]
//   Warren's house(35.0337, -81.0245)  →  tile (210, 95)  [northeast, ~200 tiles E, ~35 N]
//   Golf Club     (35.0365, -81.0204)  →  tile (235, 81)  [further NE past Warren]
//   School        (35.0521, -81.0063)  →  tile (350, 20)  [far north, Act 1 obstacle zone]
//
// Route: Topsail Circle → Anchorage Lane (east) → Tega Cay Drive (NE) → Suwarrow Circle
// ──────────────────────────────────────────────────────────────────────────────

const MAP_COLS = 250;
const MAP_ROWS = 160;

// Leo's starting tile position
const LEO_START_COL = 18;
const LEO_START_ROW = 130;

// House tile positions [col, row, widthTiles, heightTiles, label, color]
const HOUSES = [
  [15,  127, 6, 5, "LEO'S HOUSE",  0x8b7355],
  [207,  92, 5, 4, 'WARREN',       0xe74c3c],
  // MJ, Carsen, Justin added in Phase 3 with real addresses
];

// Road definitions [col, row, widthTiles, heightTiles, isHorizontal]
// Anchorage Lane runs east from Leo's neighborhood (~row 128, col 20–90)
// Tega Cay Drive runs NE — approximated as two segments
const ROADS = [
  // Anchorage Lane — east from Leo's neighborhood to Tega Cay Drive junction
  { x: 0,   y: 128, w: MAP_COLS, h: 2, color: 0x555566 },  // main horizontal road
  // Tega Cay Drive — angled NE; approximated with a vertical road segment
  { x: 90,  y: 0,   w: 2, h: MAP_ROWS, color: 0x555566 },  // north-south connector
  // Suwarrow Circle area road
  { x: 200, y: 88,  w: 25, h: 2, color: 0x555566 },
];

export default class NeighborhoodScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_NEIGHBORHOOD });
  }

  create() {
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
      this._fireLightningFart(scene, player);
    });

    // ── World dimensions ──────────────────────────────────────────────────────
    const worldW = MAP_COLS * TILE_SIZE;
    const worldH = MAP_ROWS * TILE_SIZE;

    // ── Ground ────────────────────────────────────────────────────────────────
    // Draw in 8×8 tile chunks for performance (fewer objects than 1-per-tile)
    const CHUNK = 8;
    for (let row = 0; row < MAP_ROWS; row += CHUNK) {
      for (let col = 0; col < MAP_COLS; col += CHUNK) {
        const color = ((row / CHUNK) + (col / CHUNK)) % 2 === 0 ? 0x2d5a1b : 0x336b20;
        this.add.rectangle(
          col * TILE_SIZE + (CHUNK * TILE_SIZE) / 2,
          row * TILE_SIZE + (CHUNK * TILE_SIZE) / 2,
          CHUNK * TILE_SIZE, CHUNK * TILE_SIZE, color
        );
      }
    }

    // ── Roads ─────────────────────────────────────────────────────────────────
    ROADS.forEach(r => {
      this.add.rectangle(
        r.x * TILE_SIZE + (r.w * TILE_SIZE) / 2,
        r.y * TILE_SIZE + (r.h * TILE_SIZE) / 2,
        r.w * TILE_SIZE, r.h * TILE_SIZE, r.color
      );
      // Road centre line (dashed feel via lighter strip)
      this.add.rectangle(
        r.x * TILE_SIZE + (r.w * TILE_SIZE) / 2,
        r.y * TILE_SIZE + (r.h * TILE_SIZE) / 2,
        r.w * TILE_SIZE, 1, 0x888899
      );
    });

    // ── Walls / Buildings ─────────────────────────────────────────────────────
    this._walls = this.physics.add.staticGroup();

    // World border walls (invisible, just collision)
    this._addWall(0, 0, MAP_COLS, 1, 0x1a1a2e, false);
    this._addWall(0, MAP_ROWS - 1, MAP_COLS, 1, 0x1a1a2e, false);
    this._addWall(0, 0, 1, MAP_ROWS, 0x1a1a2e, false);
    this._addWall(MAP_COLS - 1, 0, 1, MAP_ROWS, 0x1a1a2e, false);

    // Houses
    HOUSES.forEach(([col, row, w, h, label, color]) => {
      this._addWall(col, row, w, h, color, true);
      txt(this, col * TILE_SIZE + 2, row * TILE_SIZE - 9, label, {
        fontSize: '6px', color: '#ffff88',
      });
    });

    // Golf course outline (large green rectangle, walkable - just visual)
    this.add.rectangle(
      238 * TILE_SIZE, 75 * TILE_SIZE,
      30 * TILE_SIZE, 20 * TILE_SIZE,
      0x1a6b1a, 0.6
    );
    txt(this, 228 * TILE_SIZE, 65 * TILE_SIZE, 'GOLF COURSE', {
      fontSize: '6px', color: '#88ff88',
    });

    // ── Player ────────────────────────────────────────────────────────────────
    this._player = new Player(this, LEO_START_COL * TILE_SIZE, LEO_START_ROW * TILE_SIZE);
    this.physics.add.collider(this._player, this._walls);

    // ── Keys ──────────────────────────────────────────────────────────────────
    this._fartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);

    const dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    dKey.once('down', () => {
      this.scene.get(SCENE_DIALOGUE).showScript('intro', () => {});
    });

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this._player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(60, 40);

    // ── On-screen hint (fixed to camera) ─────────────────────────────────────
    txt(this, 6, BASE_HEIGHT - 22, 'MOVE: WASD / ARROWS', {
      fontSize: '6px', color: '#ffffff',
    }).setScrollFactor(0);
    txt(this, 6, BASE_HEIGHT - 12, 'FART: F    TALK: D', {
      fontSize: '6px', color: '#aaaaaa',
    }).setScrollFactor(0);

    // ── Minimap ───────────────────────────────────────────────────────────────
    this._buildMinimap(worldW, worldH);

    // Initial state emit so HUD populates
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

  // ── Helpers ───────────────────────────────────────────────────────────────────

  _addWall(col, row, w, h, color, visible = true) {
    const rect = this.add.rectangle(
      col * TILE_SIZE + (w * TILE_SIZE) / 2,
      row * TILE_SIZE + (h * TILE_SIZE) / 2,
      w * TILE_SIZE, h * TILE_SIZE, color
    );
    if (!visible) rect.setAlpha(0);
    this.physics.add.existing(rect, true);
    this._walls.add(rect);
  }

  _fireLightningFart(scene, player) {
    const ring = scene.add.circle(player.x, player.y, 8, 0xf5e642, 0.8);
    scene.tweens.add({
      targets: ring, radius: 48, alpha: 0, duration: 400,
      onComplete: () => ring.destroy(),
    });
  }

  _buildMinimap(worldW, worldH) {
    // Tiny minimap in top-right corner, fixed to screen
    const MM_W = 80;
    const MM_H = 50;
    const MM_X = BASE_WIDTH - MM_W - 4;
    const MM_Y = 24;

    const scaleX = MM_W / worldW;
    const scaleY = MM_H / worldH;

    // Background
    this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W, MM_H, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(50);

    // Road dots on minimap
    ROADS.forEach(r => {
      this.add.rectangle(
        MM_X + r.x * TILE_SIZE * scaleX + (r.w * TILE_SIZE * scaleX) / 2,
        MM_Y + r.y * TILE_SIZE * scaleY + (r.h * TILE_SIZE * scaleY) / 2,
        Math.max(1, r.w * TILE_SIZE * scaleX),
        Math.max(1, r.h * TILE_SIZE * scaleY),
        0x888899
      ).setScrollFactor(0).setDepth(51);
    });

    // House dots
    HOUSES.forEach(([col, row,, , label, color]) => {
      this.add.rectangle(
        MM_X + col * TILE_SIZE * scaleX,
        MM_Y + row * TILE_SIZE * scaleY,
        3, 3, color
      ).setScrollFactor(0).setDepth(51);
    });

    // Player dot (updated each frame)
    this._minimapDot = this.add.rectangle(0, 0, 3, 3, 0xffffff)
      .setScrollFactor(0).setDepth(52);

    this._minimapX = MM_X;
    this._minimapY = MM_Y;
    this._minimapScaleX = scaleX;
    this._minimapScaleY = scaleY;
    this._minimapW = worldW;
    this._minimapH = worldH;
  }

  _updateMinimap() {
    this._minimapDot.setPosition(
      this._minimapX + this._player.x * this._minimapScaleX,
      this._minimapY + this._player.y * this._minimapScaleY
    );
  }

  _autosave() {
    const gameState = this.game.registry.get('gameState') ?? {};
    gameState.resources = this._resources.getAll();
    const partyState = this._party.getState();
    gameState.party = partyState.party;
    gameState.lostMembers = partyState.lostMembers;
    SaveSystem.save(gameState);
  }
}
