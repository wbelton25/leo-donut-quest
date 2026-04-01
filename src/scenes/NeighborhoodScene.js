import {
  SCENE_NEIGHBORHOOD, SCENE_DIALOGUE,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, PLAYER_SPEED, txt,
  PARTY_WARREN,
} from '../constants.js';
import Player from '../entities/Player.js';
import Follower, { PositionBuffer } from '../entities/Follower.js';
import DeerObstacle from '../entities/DeerObstacle.js';
import GraceBoss from '../entities/GraceBoss.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import SaveSystem from '../systems/SaveSystem.js';

// ═══════════════════════════════════════════════════════════════════════════════
// REAL-WORLD MAP — Tega Cay, SC (calibrated from Google Maps screenshot)
//
// Origin: Leo's house (Topsail Cir) → tile (40, 115)
// Scale:  1 tile = 8 meters
//
// GPS → tile:
//   col = 40 + (lon + 81.0343) × 11378
//   row = 115 - (lat - 35.0288) × 13893
//
// Road layout (from image):
//   Topsail Cir     — small cul-de-sac loop, SW corner
//   Anchorage Lane  — E-W road from Topsail east to Windward roundabout
//   Windward Dr     — main N-S artery, diagonal NE through center
//   Catamaran Dr    — NW from Woodhaven/Windward toward marina
//   Woodhaven Dr    — short N-S road just east of Runde Park
//   Tega Cay Dr     — diagonal road on east side
//   Tara Tea Dr     — E-W from Tega Cay Dr to Warren's house
//   Mariana Ln      — secondary E-W on Windward mid section
//   Marquesas Ave   — short E-W south of Mariana
// ═══════════════════════════════════════════════════════════════════════════════

const MAP_COLS = 280;
const MAP_ROWS = 160;

const T = TILE_SIZE;

function darken(hex) {
  const r = Math.floor((hex >> 16 & 0xff) * 0.58);
  const g = Math.floor((hex >> 8  & 0xff) * 0.58);
  const b = Math.floor((hex       & 0xff) * 0.58);
  return (r << 16) | (g << 8) | b;
}

// ── Road segments [col, row, width, height, label] ────────────────────────────
// Each entry is [startCol, startRow, widthTiles, heightTiles, label]
const ROADS = [
  // ── Topsail Cir ───────────────────────────────────────────────────────────
  [38, 107, 4, 10, 'Topsail Cir'],  // approach N to Anchorage Lane
  [30, 115, 4, 13, null],           // W arm of loop
  [42, 115, 4, 13, null],           // E arm of loop
  [30, 126, 16, 4, null],           // S close (near lake)

  // ── Anchorage Lane — E-W from Topsail to Windward roundabout ─────────────
  [38, 107, 36, 4, 'Anchorage Ln'],

  // ── Windward Dr roundabout stub — N approach into roundabout ─────────────
  [72, 100, 6, 11, null],           // fills into roundabout from south

  // ── Windward Dr S — col 72-77, rows 72-100 ────────────────────────────────
  [72, 72, 6, 30, 'Windward Dr'],
  [72, 72, 14, 4, null],            // E-step connector at row 72

  // ── Windward Dr Mid — col 78-83, rows 48-76 ───────────────────────────────
  [78, 48, 6, 28, null],
  [78, 48, 14, 4, null],            // E-step connector at row 48

  // ── Windward Dr Upper — col 83-88, rows 18-52 ─────────────────────────────
  [83, 18, 6, 34, null],

  // ── Woodhaven Dr — short N-S road east of Runde Park ─────────────────────
  [79, 18, 4, 26, 'Woodhaven Dr'],
  [79, 18, 10, 4, null],            // E-W connector to Windward at top

  // ── Catamaran Dr — NW toward marina ──────────────────────────────────────
  [53,  6, 4, 16, 'Catamaran Dr'],  // N-S near marina
  [53,  6, 30, 4, null],            // E-W connector to Woodhaven area

  // ── Connector: upper Windward to Tega Cay Dr ──────────────────────────────
  [83, 24, 20, 4, null],

  // ── Tega Cay Dr — diagonal (stairstepped) east side ──────────────────────
  [100, 6,  4, 24, 'Tega Cay Dr'],
  [100, 28, 8, 4,  null],           // SE step
  [104, 26, 4, 50, null],           // south section

  // ── Tara Tea Dr — E-W from Tega Cay Dr to Warren's ───────────────────────
  [100, 42, 58, 4, 'Tara Tea Dr'],

  // ── Mariana Ln ────────────────────────────────────────────────────────────
  [83, 63, 26, 4, 'Mariana Ln'],

  // ── Marquesas Ave ─────────────────────────────────────────────────────────
  [76, 86, 18, 4, 'Marquesas Ave'],
];

// Roundabout center (tile coords) — where Windward Dr meets Anchorage Lane
const RBT_COL = 74, RBT_ROW = 107;  // tile at center of roundabout

// ── Runde Park bounds (west of Woodhaven Dr, east of Catamaran Dr) ────────────
const PARK_C = 57, PARK_R = 24, PARK_W = 22, PARK_H = 24;

// ── House clusters ────────────────────────────────────────────────────────────
// All positions hand-checked to not overlap any road segment.
// House footprint: cols hc → hc+4, rows hr → hr+3
const HOUSE_GROUPS = [
  // Topsail Cir neighborhood — north of Anchorage Lane
  { col: 20, row: 101, n: 4, stepCol: 7, stepRow: 0, color: 0x7a6b52 },
  { col: 20, row: 92,  n: 4, stepCol: 7, stepRow: 0, color: 0x8b7355 },
  // Leo's own house (inside the Topsail loop, south of Anchorage Lane)
  { col: 34, row: 112, n: 1, stepCol: 0, stepRow: 0, color: 0x9b8765 },

  // Waterfront homes south of Topsail loop (backing up to Lake Wylie)
  { col: 20, row: 120, n: 4, stepCol: 8, stepRow: 0, color: 0x6b8ca5 },

  // North of Anchorage Lane, west of Windward Dr roundabout
  { col: 48, row: 96,  n: 3, stepCol: 7, stepRow: 0, color: 0x7a6b52 },
  // South of Anchorage Lane east side
  { col: 48, row: 112, n: 3, stepCol: 7, stepRow: 0, color: 0x856b52 },

  // North of Catamaran Dr E-W (cols 58-82, east of catamaran N-S)
  { col: 59, row: 12,  n: 4, stepCol: 6, stepRow: 0, color: 0x8b7b55 },
  // East of Woodhaven Dr, north of cross connector
  { col: 85, row: 12,  n: 4, stepCol: 6, stepRow: 0, color: 0x7a6b52 },

  // West of Windward Dr mid (col 63), between Catamaran and Mariana
  { col: 63, row: 49,  n: 3, stepCol: 0, stepRow: 9, color: 0x7a8b52 },
  // West of Windward Dr south (col 63), between Mariana and Marquesas
  { col: 63, row: 74,  n: 2, stepCol: 0, stepRow: 9, color: 0x7a7b52 },

  // North of Tara Tea Dr, east of Tega Cay Dr
  { col: 109, row: 35, n: 5, stepCol: 7, stepRow: 0, color: 0x8b7b55 },
  // South of Tara Tea Dr, east of Tega Cay Dr
  { col: 109, row: 49, n: 5, stepCol: 7, stepRow: 0, color: 0x9b8060 },

  // Warren's house (red) — north of Tara Tea Dr at far east end
  { col: 152, row: 36, n: 1, stepCol: 0, stepRow: 0, color: 0x992222 },
];

// ── Friend house interaction zones ────────────────────────────────────────────
// Each zone: { id, col, row, radius, meetScript, joinScript, color }
// radius in pixels — player must be within this to see the prompt
const FRIEND_ZONES = [
  {
    id:         PARTY_WARREN,
    col:        154, row: 43,   // on Tara Tea Dr, right in front of Warren's house
    radius:     52,
    meetScript: 'warren_meet',
    joinScript: 'warren_join',
    color:      0xe74c3c,
    label:      'WARREN',
  },
  // MJ, Carsen, Justin zones will be added once their locations are confirmed
];

export default class NeighborhoodScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_NEIGHBORHOOD });
  }

  create() {
    try {
      this._createImpl();
    } catch (err) {
      console.error('[NeighborhoodScene] create() threw:', err);
      // Show error on screen so we can see it without devtools
      this.add.text(10, 10, 'LOAD ERROR:\n' + err.message, {
        fontFamily: 'monospace', fontSize: '10px', color: '#ff4444',
        wordWrap: { width: 460 },
      });
    }
  }

  _createImpl() {
    const worldW = MAP_COLS * T;
    const worldH = MAP_ROWS * T;

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

    // ── Ground ────────────────────────────────────────────────────────────────
    const CHUNK = 8;
    for (let r = 0; r < MAP_ROWS; r += CHUNK) {
      for (let c = 0; c < MAP_COLS; c += CHUNK) {
        const even = ((r / CHUNK) + (c / CHUNK)) % 2 === 0;
        this.add.rectangle(
          c * T + (CHUNK * T) / 2, r * T + (CHUNK * T) / 2,
          CHUNK * T, CHUNK * T, even ? 0x2d5a1b : 0x336b20
        );
      }
    }

    // ── Lake Wylie ────────────────────────────────────────────────────────────
    this._buildLake();

    // ── Collision group ───────────────────────────────────────────────────────
    this._walls = this.physics.add.staticGroup();
    // Water + world edge walls only (off-road wall approach was too expensive)
    this._addWall(0, 132, MAP_COLS, MAP_ROWS - 132, false);  // main lake
    this._addWall(0, 100, 15, 32, false);                    // west arm
    this._addWall(0, 0, MAP_COLS, 1, false);
    this._addWall(0, MAP_ROWS - 1, MAP_COLS, 1, false);
    this._addWall(0, 0, 1, MAP_ROWS, false);
    this._addWall(MAP_COLS - 1, 0, 1, MAP_ROWS, false);

    // ── Roads (visual only — collision is handled by off-road walls above) ────
    ROADS.forEach(([c, r, w, h, label]) => {
      const px = c * T + (w * T) / 2;
      const py = r * T + (h * T) / 2;
      const pw = w * T, ph = h * T;
      this.add.rectangle(px, py, pw, ph, 0x4a4a55);
      if (w >= h) {
        this.add.rectangle(px, py, pw, 1, 0xffff88, 0.25);
      } else {
        this.add.rectangle(px, py, 1, ph, 0xffff88, 0.25);
      }
      if (label) {
        txt(this, c * T + 2, r * T + 2, label, { fontSize: '8px', color: '#888899' });
      }
    });

    // ── Roundabout at Windward Dr / Anchorage Lane junction ───────────────────
    const rbtX = RBT_COL * T + T / 2;
    const rbtY = RBT_ROW * T + T / 2;
    // Use rectangles — circles (Graphics objects) are expensive
    this.add.rectangle(rbtX, rbtY, T * 7, T * 7, 0x4a4a55);  // road surface
    this.add.rectangle(rbtX, rbtY, T * 4, T * 4, 0x2d5a1b);  // grassy center

    // ── Runde Park ────────────────────────────────────────────────────────────
    const parkPx = PARK_C * T + (PARK_W * T) / 2;
    const parkPy = PARK_R * T + (PARK_H * T) / 2;
    this.add.rectangle(parkPx, parkPy, PARK_W * T, PARK_H * T, 0x1e7a1e);
    this.add.rectangle(parkPx, parkPy, PARK_W * T, PARK_H * T, 0, 0)
      .setStrokeStyle(2, 0x22aa22);
    txt(this, PARK_C * T + 8, PARK_R * T + 8, 'RUNDE\nPARK', {
      fontSize: '8px', color: '#88ff88',
    });
    this.add.rectangle(parkPx, parkPy, PARK_W * T, 2, 0x4a7a2a);
    this.add.rectangle(parkPx, parkPy, 2, PARK_H * T, 0x4a7a2a);

    // ── Golf course ───────────────────────────────────────────────────────────
    const GC_C = 165, GC_R = 0, GC_W = 68, GC_H = 30;
    const gcPx = GC_C * T + (GC_W * T) / 2;
    const gcPy = GC_R * T + (GC_H * T) / 2;
    this.add.rectangle(gcPx, gcPy, GC_W * T, GC_H * T, 0x1a6b1a);
    this.add.rectangle(gcPx, gcPy, GC_W * T, GC_H * T, 0, 0).setStrokeStyle(2, 0x22aa22);
    for (let i = 0; i < 4; i++) {
      this.add.rectangle((GC_C + 5 + i * 15) * T, gcPy, 10 * T, (GC_H - 4) * T, 0x1f7a1f);
    }
    txt(this, GC_C * T + 8, 4, 'TEGA CAY\nGOLF CLUB', { fontSize: '8px', color: '#88ff88' });

    // ── Houses ────────────────────────────────────────────────────────────────
    HOUSE_GROUPS.forEach(({ col, row, n, stepCol, stepRow, color }) => {
      for (let i = 0; i < n; i++) {
        const hc = col + i * stepCol;
        const hr = row + i * stepRow;
        const hw = 4 * T, hh = 3 * T;
        const hx = hc * T + 2 * T;
        const hy = hr * T + 1.5 * T;
        this.add.rectangle(hx, hy, hw, hh, color);
        this.add.rectangle(hx, hr * T + 0.5 * T, hw, T, darken(color));
      }
    });
    txt(this, 152 * T, 40 * T, "WARREN'S", { fontSize: '8px', color: '#ff8888' });

    // ── Trees (rectangles — circles are too expensive at volume) ─────────────
    this._generateTrees().forEach(([tc, tr]) => {
      const tx = tc * T + T / 2, ty = tr * T + T / 2;
      this.add.rectangle(tx, ty, T, T, 0x1a5c1a);          // dark outer
      this.add.rectangle(tx, ty, T * 0.6, T * 0.6, 0x228b22); // lighter inner
    });

    // ── Boat docks ────────────────────────────────────────────────────────────
    [[28, 132], [44, 133], [62, 132]].forEach(([dc, dr]) => {
      this.add.rectangle(dc * T + T, dr * T + T * 2, T * 2, T * 4, 0x8b6914);
    });

    // ── Player ────────────────────────────────────────────────────────────────
    this._player = new Player(this, 40 * T, 109 * T);
    this.physics.add.collider(this._player, this._walls);

    // ── Recruited set (must init before Grace / deer which read it) ──────────
    this._recruited = new Set();
    const gs2 = this.game.registry.get('gameState');
    if (gs2?.party) gs2.party.forEach(id => this._recruited.add(id));

    // ── Position buffer + followers ───────────────────────────────────────────
    this._posBuffer = new PositionBuffer(this, this._player);
    this._followers = [];

    // ── Grace boss (blocks Warren's house until defeated) ─────────────────────
    this._grace = null;
    if (!this._recruited.has(PARTY_WARREN)) {
      this._grace = new GraceBoss(this, 152, 43, () => this._onGraceDefeated());
    }

    // ── Deer obstacles ────────────────────────────────────────────────────────
    this._deer = [
      new DeerObstacle(this, 55, 108, [38, 72],   () => this._onDeerHit()),  // Anchorage Lane
      new DeerObstacle(this, 75, 80,  [72, 82],   () => this._onDeerHit()),  // Windward Dr S
      new DeerObstacle(this, 80, 55,  [78, 88],   () => this._onDeerHit()),  // Windward Dr Mid
      new DeerObstacle(this, 85, 30,  [83, 100],  () => this._onDeerHit()),  // upper connector
      new DeerObstacle(this, 120, 43, [100, 148], () => this._onDeerHit()),  // Tara Tea Dr
    ];

    // Proximity prompt label (shown when near a friend's house)
    this._proximityPrompt = txt(this, 0, 0, 'SPACE: Talk', {
      fontSize: '8px', color: '#f5e642',
    }).setScrollFactor(0).setDepth(20).setVisible(false);

    // ── Input ─────────────────────────────────────────────────────────────────
    this._fartKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      .once('down', () => this.scene.get(SCENE_DIALOGUE).showScript('intro', () => {}));

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this._player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(80, 60);

    // ── Controls hint ─────────────────────────────────────────────────────────
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
    this._followers.forEach(f => f.update());

    const fartJustDown = Phaser.Input.Keyboard.JustDown(this._fartKey);
    if (fartJustDown) {
      this._abilities.execute('lightning_fart', this, this._player);
    }

    // Update Grace boss
    if (this._grace) {
      this._grace.update(this._player, fartJustDown);
    }

    // Update deer
    this._deer.forEach(d => d.update(this._player));

    this._updateProximityPrompt();

    this._updateMinimap();
    if (!this._lastSave || Date.now() - this._lastSave > 30000) {
      this._autosave();
      this._lastSave = Date.now();
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  _updateProximityPrompt() {
    const px = this._player.x, py = this._player.y;
    let nearZone = null;

    for (const zone of FRIEND_ZONES) {
      if (this._recruited.has(zone.id)) continue;
      // Warren's zone is blocked until Grace is defeated
      if (zone.id === PARTY_WARREN && this._grace) continue;
      const dx = px - zone.col * T;
      const dy = py - zone.row * T;
      if (dx * dx + dy * dy < zone.radius * zone.radius) {
        nearZone = zone;
        break;
      }
    }

    if (nearZone) {
      // Show prompt anchored just above the player in screen space
      const cam = this.cameras.main;
      const sx = (px - cam.scrollX) * cam.zoom;
      const sy = (py - cam.scrollY) * cam.zoom - 28;
      this._proximityPrompt.setPosition(sx - 40, sy).setVisible(true);

      if (Phaser.Input.Keyboard.JustDown(this._spaceKey)) {
        this._startRecruitment(nearZone);
      }
    } else {
      this._proximityPrompt.setVisible(false);
    }
  }

  _onGraceDefeated() {
    // Show a brief "she ran off!" message then allow Warren recruitment
    const dlg = this.scene.get(SCENE_DIALOGUE);
    dlg.showScript('warren_meet', () => {
      dlg.showScript('warren_join', () => {
        this._recruited.add(PARTY_WARREN);
        this._party.addMember(PARTY_WARREN);
        this._spawnFollower(FRIEND_ZONES.find(z => z.id === PARTY_WARREN));
      });
    });
    this._grace = null;
  }

  _onDeerHit() {
    // Deer collision drains bike condition
    this._resources.applyChanges({ bikeCondition: -10 });
    // Brief screen flash
    this.cameras.main.flash(200, 255, 100, 0);
  }

  _startRecruitment(zone) {
    const dlg = this.scene.get(SCENE_DIALOGUE);
    // Show meet dialogue, then immediately show join and recruit
    dlg.showScript(zone.meetScript, () => {
      dlg.showScript(zone.joinScript, () => {
        this._recruited.add(zone.id);
        this._party.addMember(zone.id);
        this._spawnFollower(zone);
      });
    });
  }

  _spawnFollower(zone) {
    const slotIndex = this._followers.length;
    const follower = new Follower(this, this._posBuffer, slotIndex, zone.color, zone.label);
    this._followers.push(follower);
  }

  _buildLake() {
    const W = MAP_COLS * T;
    this.add.rectangle(W / 2, 129 * T, W, 3 * T, 0xc8a870);    // sandy shore
    this.add.rectangle(W / 2, 132 * T, W, 4 * T, 0x2980b9);     // shallow
    this.add.rectangle(W / 2, 141 * T, W, 20 * T, 0x1a5f8a);    // deep lake
    this.add.rectangle(6 * T, 105 * T, 12 * T, 30 * T, 0x1a5f8a); // west arm
    this.add.rectangle(13 * T, 105 * T, 3 * T, 30 * T, 0x2980b9);
    this.add.rectangle(16 * T, 105 * T, 2 * T, 30 * T, 0xc8a870);
    txt(this, 90 * T, 137 * T, 'LAKE WYLIE', { fontSize: '8px', color: '#7cc8e8' });
    txt(this, 2 * T, 108 * T, 'LAKE\nWYLIE', { fontSize: '8px', color: '#7cc8e8' });
    txt(this, 35 * T, 12 * T, 'TEGA CAY\nMARINA', { fontSize: '8px', color: '#4db8e8' });
  }

  _generateTrees() {
    const onClearArea = (c, r) => {
      // Avoid road tiles (visual only — no physics needed)
      const dc = c - RBT_COL, dr = r - RBT_ROW;
      if (dc * dc + dr * dr <= 16) return true; // roundabout
      for (const [rc, rr, rw, rh] of ROADS) {
        if (c >= rc && c < rc + rw && r >= rr && r < rr + rh) return true;
      }
      if (c >= PARK_C && c <= PARK_C + PARK_W && r >= PARK_R && r <= PARK_R + PARK_H) return true;
      if (c >= 165 && r <= 30) return true; // golf course
      if (r >= 128) return true;            // lake
      if (c <= 14 && r >= 100) return true; // west arm
      return false;
    };

    const positions = [];
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
    for (let i = 0; i < 200; i++) {
      const c = Math.floor(rand() * (MAP_COLS - 4)) + 2;
      const r = Math.floor(rand() * (MAP_ROWS - 4)) + 2;
      if (!onClearArea(c, r)) positions.push([c, r]);
    }
    return positions;
  }

  _buildMinimap(worldW, worldH) {
    const MM_W = 90, MM_H = 55;
    const MM_X = BASE_WIDTH - MM_W - 4, MM_Y = 32;
    const sx = MM_W / worldW, sy = MM_H / worldH;

    this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W, MM_H, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(50);
    this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W, MM_H, 0, 0)
      .setStrokeStyle(1, 0x334455).setScrollFactor(0).setDepth(50);

    // Lake
    this.add.rectangle(MM_X + MM_W / 2, MM_Y + 131 * T * sy + (29 * T * sy) / 2,
      MM_W, 29 * T * sy, 0x1a5f8a).setScrollFactor(0).setDepth(51);
    this.add.rectangle(MM_X + 5 * T * sx, MM_Y + 105 * T * sy,
      10 * T * sx, 30 * T * sy, 0x1a5f8a).setScrollFactor(0).setDepth(51);

    // Runde Park
    this.add.rectangle(
      MM_X + PARK_C * T * sx + (PARK_W * T * sx) / 2,
      MM_Y + PARK_R * T * sy + (PARK_H * T * sy) / 2,
      PARK_W * T * sx, PARK_H * T * sy, 0x1e7a1e
    ).setScrollFactor(0).setDepth(51);

    // Roads
    ROADS.forEach(([c, r, w, h]) => {
      this.add.rectangle(
        MM_X + c * T * sx + (w * T * sx) / 2,
        MM_Y + r * T * sy + (h * T * sy) / 2,
        Math.max(1, w * T * sx), Math.max(1, h * T * sy), 0x777788
      ).setScrollFactor(0).setDepth(51);
    });

    // Leo (blue) + Warren (red)
    this.add.rectangle(MM_X + 40 * T * sx, MM_Y + 111 * T * sy, 3, 3, 0x4488ff)
      .setScrollFactor(0).setDepth(51);
    this.add.rectangle(MM_X + 152 * T * sx, MM_Y + 38 * T * sy, 3, 3, 0xff4444)
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
