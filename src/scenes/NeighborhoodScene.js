import {
  SCENE_NEIGHBORHOOD, SCENE_DIALOGUE, SCENE_GAME_OVER,
  SCENE_GRACE_BOSS, SCENE_MAX_BOSS, SCENE_NORA_BOSS, SCENE_JUSTIN_MAX_BOSS,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, PLAYER_SPEED, txt,
  PARTY_WARREN, PARTY_MJ, PARTY_CARSON, PARTY_JUSTIN,
} from '../constants.js';
import Player from '../entities/Player.js';
import Follower, { PositionBuffer } from '../entities/Follower.js';
import DeerObstacle from '../entities/DeerObstacle.js';
// GraceBoss is now handled in GraceBossScene; import removed
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import SaveSystem from '../systems/SaveSystem.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MAP v2 — designed in the Level Editor
//
// Leo's house loop — SW corner, cols 21-50, rows 137-151
// Windward Dr      — main N-S artery, cols 45-56, rows 47-131
// Tega Cay Drive   — dual E-W roads across top, rows 46-59
// Tara Tea Dr      — E-W from Windward east to Warren's house, row 63-67
// Mariana Ln       — E-W below Tara Tea, row 83-87
// Marquesas Ave    — short E-W, row 115-119
// Suwarrow Ct      — N-S spur to Warren's house, cols 108-112
// Water            — left strip (col 0-8) + south strip (row 152+)
// Park (Runde)     — col 19-43, row 65-91
// Warren's house   — col 126-130, row 78-81 (zone center 128, 72)
// MJ's house       — col 188-192, row 69-73 (zone center 190, 67)
// ═══════════════════════════════════════════════════════════════════════════════

const MAP_COLS = 320;
const MAP_ROWS = 160;

const T = TILE_SIZE;

function darken(hex) {
  const r = Math.floor((hex >> 16 & 0xff) * 0.58);
  const g = Math.floor((hex >> 8  & 0xff) * 0.58);
  const b = Math.floor((hex       & 0xff) * 0.58);
  return (r << 16) | (g << 8) | b;
}

// ── Road segments [col, row, width, height, label] ────────────────────────────
const ROADS = [
  [56, 63, 74, 4, 'Tara Tea Dr'],
  [56, 83, 28, 4, 'Mariana Ln'],
  [64, 115, 18, 4, null],
  [10, 147, 5, 4, null],
  [10, 145, 5, 4, null],
  [15, 146, 8, 4, null],
  [20, 146, 16, 4, null],
  [21, 137, 4, 10, null],
  [24, 137, 12, 4, null],
  [32, 139, 4, 8, null],
  [34, 137, 16, 4, null],
  [56, 115, 10, 4, 'Marquesas Ave'],
  [45, 131, 4, 8, null],
  [48, 131, 8, 4, null],
  [52, 134, 4, 7, null],
  [46, 137, 9, 4, null],
  [45, 60, 4, 71, null],
  [52, 59, 4, 72, 'Windward'],
  [45, 59, 4, 5, 'Windward'],
  [80, 67, 4, 19, null],
  [122, 66, 4, 17, null],
  [108, 79, 17, 4, null],
  [108, 65, 4, 14, 'Suwarrow Ct.'],
  [45, 55, 169, 4, 'Tega Cay Drive'],
  [45, 46, 168, 4, 'Tega Cay Drive'],
  [45, 49, 4, 11, null],
  [52, 47, 4, 14, null],
  [209, 46, 4, 38, null],
  [188, 80, 22, 4, null],
  [188, 69, 4, 12, null],
  // ── Eastern extension — Carson and Justin's neighborhood ─────────────────
  [209, 55, 103, 4, null],
  [211, 46, 100, 4, null],
  [311, 46, 4, 36, null],
  [273, 78, 38, 4, null],
  [273, 82, 4, 19, null],
  [275, 97, 40, 4, null],
  [311, 79, 4, 48, null],
  [238, 57, 4, 99, null],
  [240, 152, 75, 4, null],
  [311, 124, 4, 30, null],
  [283, 151, 1, 4, null],
];

// ── Runde Park ────────────────────────────────────────────────────────────────
const PARK_C = 19, PARK_R = 65, PARK_W = 24, PARK_H = 26;

// ── House clusters ────────────────────────────────────────────────────────────
const HOUSE_GROUPS = [
  { col: 126, row: 78,  n: 1, stepCol: 0, stepRow: 0, color: 0x8b7355 },
  { col: 117, row: 70,  n: 1, stepCol: 0, stepRow: 0, color: 0x8b7355 },
  { col: 79,  row: 111, n: 1, stepCol: 0, stepRow: 0, color: 0x8b7355 },
  { col: 80,  row: 120, n: 1, stepCol: 0, stepRow: 0, color: 0x8b7355 },
  { col: 71,  row: 120, n: 1, stepCol: 0, stepRow: 0, color: 0x8b7355 },
  { col: 71,  row: 111, n: 1, stepCol: 0, stepRow: 0, color: 0x8b7355 },
  { col: 64,  row: 111, n: 1, stepCol: 0, stepRow: 0, color: 0x8b7355 },
  { col: 65,  row: 120, n: 1, stepCol: 0, stepRow: 0, color: 0x8b7355 },
];

// ── Friend house interaction zones ────────────────────────────────────────────
const FRIEND_ZONES = [
  {
    id:          PARTY_WARREN,
    col:         128, row: 72,
    radius:      80,
    meetScript:  'warren_meet',
    joinScript:  'warren_join',
    color:       0xe74c3c,
    label:       'WARREN',
    hasBoss:     true,
    bossScene:   'GraceBossScene',
    defeatedFlag:'graceDefeated',
  },
  {
    id:          PARTY_MJ,
    col:         190, row: 67,
    radius:      72,
    meetScript:  'mj_meet',
    joinScript:  'mj_join',
    color:       0x2ecc71,
    label:       'MJ',
    hasBoss:     true,
    bossScene:   'MaxBossScene',
    defeatedFlag:'maxDefeated',
  },
  {
    id:          PARTY_CARSON,
    col:         296, row: 76,
    radius:      72,
    meetScript:  'carson_meet',
    joinScript:  'carson_join',
    color:       0x3498db,
    label:       'CARSON',
    hasBoss:     true,
    bossScene:   'NoraBossScene',
    defeatedFlag:'noraDefeated',
  },
  {
    id:          PARTY_JUSTIN,
    col:         317, row: 122,
    radius:      72,
    meetScript:  'justin_meet',
    joinScript:  'justin_join',
    color:       0x9b59b6,
    label:       'JUSTIN',
    hasBoss:     true,
    bossScene:   'JustinMaxBossScene',
    defeatedFlag:'justinMaxDefeated',
  },
];

export default class NeighborhoodScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_NEIGHBORHOOD });
  }

  init(data) {
    this._initData = data ?? {};
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
    // Scan in 4-tile chunks; merge contiguous off-road runs per row-strip.
    // 4-tile step → at most 40 row-strips × ~8 runs each ≈ 320 bodies max.
    this._buildOffRoadWalls();
    // World edges
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

    // ── Golf course (east side, above Tega Cay Drive) ─────────────────────────
    const GC_C = 220, GC_R = 0, GC_W = 70, GC_H = 44;
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
    txt(this, 126 * T, 75 * T, "WARREN'S",  { fontSize: '8px', color: '#ff8888' });
    txt(this, 188 * T, 66 * T, "MJ'S",      { fontSize: '8px', color: '#88ff88' });
    txt(this, 294 * T, 74 * T, "CARSON'S",  { fontSize: '8px', color: '#88aaff' });
    txt(this, 314 * T, 119 * T, "JUSTIN'S", { fontSize: '8px', color: '#cc88ff' });

    // Zone markers — flashing indicators so the player can see where to go
    FRIEND_ZONES.forEach(zone => {
      const marker = this.add.rectangle(zone.col * T, zone.row * T, 12, 12, zone.color, 0.7).setDepth(3);
      this.tweens.add({ targets: marker, alpha: 0.1, yoyo: true, repeat: -1, duration: 600 });
      txt(this, zone.col * T, zone.row * T - 14, '▼', {
        fontSize: '8px', color: '#ffffff',
      }).setOrigin(0.5).setDepth(3);
    });

    // ── Trees (rectangles — circles are too expensive at volume) ─────────────
    this._generateTrees().forEach(([tc, tr]) => {
      const tx = tc * T + T / 2, ty = tr * T + T / 2;
      this.add.rectangle(tx, ty, T, T, 0x1a5c1a);          // dark outer
      this.add.rectangle(tx, ty, T * 0.6, T * 0.6, 0x228b22); // lighter inner
    });

    // ── Boat docks — on left lake shore ───────────────────────────────────────
    [[10, 40], [10, 60], [10, 90], [10, 120]].forEach(([dc, dr]) => {
      this.add.rectangle(dc * T, dr * T, T * 2, T * 4, 0x8b6914);
    });

    // ── Player ────────────────────────────────────────────────────────────────
    const startX = this._initData.spawnCol ? this._initData.spawnCol * T : 30 * T;
    const startY = this._initData.spawnRow ? this._initData.spawnRow * T : 142 * T;
    this._player = new Player(this, startX, startY);
    this.physics.add.collider(this._player, this._walls);

    // ── Recruited set (must init before Grace / deer which read it) ──────────
    this._recruited = new Set();
    const gs2 = this.game.registry.get('gameState');
    if (gs2?.party) gs2.party.forEach(id => this._recruited.add(id));

    // ── Position buffer + followers ───────────────────────────────────────────
    this._posBuffer = new PositionBuffer(this._player);
    this._followers = [];

    // ── Boss return handling ──────────────────────────────────────────────────
    // If returning from a boss scene with a win, recruit the friend immediately
    this._graceDefeated = this._recruited.has(PARTY_WARREN) || !!this._initData.graceDefeated;
    if (this._initData.graceDefeated && !this._recruited.has(PARTY_WARREN)) {
      this._recruited.add(PARTY_WARREN);
      this._party.addMember(PARTY_WARREN);
      const zone = FRIEND_ZONES.find(z => z.id === PARTY_WARREN);
      if (zone) this._spawnFollower(zone);
    }

    this._maxDefeated = this._recruited.has(PARTY_MJ) || !!this._initData.maxDefeated;
    if (this._initData.maxDefeated && !this._recruited.has(PARTY_MJ)) {
      this._recruited.add(PARTY_MJ);
      this._party.addMember(PARTY_MJ);
      const zone = FRIEND_ZONES.find(z => z.id === PARTY_MJ);
      if (zone) this._spawnFollower(zone);
    }

    this._noraDefeated = this._recruited.has(PARTY_CARSON) || !!this._initData.noraDefeated;
    if (this._initData.noraDefeated && !this._recruited.has(PARTY_CARSON)) {
      this._recruited.add(PARTY_CARSON);
      this._party.addMember(PARTY_CARSON);
      const zone = FRIEND_ZONES.find(z => z.id === PARTY_CARSON);
      if (zone) this._spawnFollower(zone);
    }

    this._justinMaxDefeated = this._recruited.has(PARTY_JUSTIN) || !!this._initData.justinMaxDefeated;
    if (this._initData.justinMaxDefeated && !this._recruited.has(PARTY_JUSTIN)) {
      this._recruited.add(PARTY_JUSTIN);
      this._party.addMember(PARTY_JUSTIN);
      const zone = FRIEND_ZONES.find(z => z.id === PARTY_JUSTIN);
      if (zone) this._spawnFollower(zone);
    }

    // ── Deer obstacles — frogger-style lanes ──────────────────────────────────
    const H = () => this._onDeerHit();
    this._deer = [
      // Tega Cay Drive upper (row 47-50, cols 45-213): 4 deer E-W
      new DeerObstacle(this, 70,  48, [45, 213], H),
      new DeerObstacle(this, 110, 47, [45, 213], H),
      new DeerObstacle(this, 155, 48, [45, 213], H),
      new DeerObstacle(this, 195, 47, [45, 213], H),

      // Tega Cay Drive lower (row 56-59, cols 45-213): 4 deer E-W
      new DeerObstacle(this, 80,  57, [45, 213], H),
      new DeerObstacle(this, 130, 56, [45, 213], H),
      new DeerObstacle(this, 170, 57, [45, 213], H),
      new DeerObstacle(this, 205, 56, [45, 213], H),

      // Tara Tea Dr (row 64-66, cols 56-129): 4 deer E-W
      new DeerObstacle(this, 70,  64, [56, 129], H),
      new DeerObstacle(this, 90,  65, [56, 129], H),
      new DeerObstacle(this, 108, 64, [56, 129], H),
      new DeerObstacle(this, 120, 65, [56, 129], H),

      // Windward N-S (col 46-56, rows 60-130): 4 deer N-S
      new DeerObstacle(this, 47,  75, [60, 130], H),
      new DeerObstacle(this, 48,  95, [60, 130], H),
      new DeerObstacle(this, 53,  85, [60, 130], H),
      new DeerObstacle(this, 54, 110, [60, 130], H),

      // Mariana Ln (row 84-86, cols 56-84): 2 deer
      new DeerObstacle(this, 65,  84, [56, 84],  H),
      new DeerObstacle(this, 75,  85, [56, 84],  H),
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
    this._posBuffer.record();
    this._followers.forEach(f => f.update());

    const fartJustDown = Phaser.Input.Keyboard.JustDown(this._fartKey);
    if (fartJustDown) {
      this._abilities.execute('lightning_fart', this, this._player);
    }

    // Update deer
    this._deer.forEach(d => d.update(this._player));

    // Game over check — energy hits 0
    if (this._resources.isExhausted() && !this._gameOverTriggered) {
      this._gameOverTriggered = true;
      this.cameras.main.fade(600, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          this.scene.start(SCENE_GAME_OVER, { reason: 'energy' });
        }
      });
    }

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
      const dx = px - zone.col * T;
      const dy = py - zone.row * T;
      if (dx * dx + dy * dy < zone.radius * zone.radius) {
        nearZone = zone;
        break;
      }
    }

    if (nearZone) {
      const zoneId       = nearZone.id;
      const bossBlocking = nearZone.hasBoss && !this._recruited.has(zoneId);
      const metFlagKey   = `_${zoneId}MetDialogueDone`;

      // Auto-trigger meet dialogue on first zone entry, then launch boss fight
      if (bossBlocking && !this[metFlagKey] && !this._dialoguePlayed) {
        this._dialoguePlayed = true;
        this.scene.get(SCENE_DIALOGUE).showScript(nearZone.meetScript, () => {
          this[metFlagKey] = true;
          this._dialoguePlayed = false;
          this.cameras.main.fade(400, 0, 0, 0);
          this.time.delayedCall(420, () =>
            this.scene.start(nearZone.bossScene, { returnFlag: nearZone.defeatedFlag })
          );
        });
      }

      this._proximityPrompt.setVisible(false);
    } else {
      this._proximityPrompt.setVisible(false);
    }
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
    // Left water strip (col 0-8, full height) — Lake Wylie inlet / marina
    this.add.rectangle(4 * T, MAP_ROWS * T / 2, 8 * T, MAP_ROWS * T, 0x1a5f8a);
    this.add.rectangle(8 * T, MAP_ROWS * T / 2, 2 * T, MAP_ROWS * T, 0x2980b9); // shallow edge
    this.add.rectangle(9 * T, MAP_ROWS * T / 2, T,     MAP_ROWS * T, 0xc8a870); // sandy shore

    // South water strip (col 1-109, rows 152-160)
    this.add.rectangle(55 * T, 156 * T, 109 * T, 8 * T, 0x1a5f8a);
    this.add.rectangle(55 * T, 152 * T, 109 * T, T,     0x2980b9); // shallow north edge
    this.add.rectangle(55 * T, 151 * T, 109 * T, T,     0xc8a870); // sandy shore

    txt(this, 2 * T,  80 * T, 'LAKE\nWYLIE', { fontSize: '8px', color: '#7cc8e8' });
    txt(this, 30 * T, 156 * T, 'LAKE WYLIE', { fontSize: '8px', color: '#7cc8e8' });
    txt(this, 2 * T,  10 * T, 'TEGA CAY\nMARINA', { fontSize: '8px', color: '#4db8e8' });
  }

  // Returns true if a chunk at (c,r) overlaps any road (i.e. is walkable).
  _isRoadChunk(c, r, step) {
    // Left water strip (col 0-9)
    if (c + step <= 10) return false;
    // South water (rows 151+)
    if (r >= 151) return false;
    // South water left portion (col 0-110, rows 151+)
    if (c + step <= 110 && r + step > 151) return false;

    for (const [rc, rr, rw, rh] of ROADS) {
      if (c < rc + rw && c + step > rc && r < rr + rh && r + step > rr) return true;
    }
    return false;
  }

  // Cover all non-road tiles with invisible static bodies.
  // 2-tile step → ~1200 bodies max — tight edges, still loads fast.
  _buildOffRoadWalls() {
    const STEP = 2;
    for (let r = 0; r < MAP_ROWS; r += STEP) {
      let runStart = -1;
      for (let c = 0; c <= MAP_COLS; c += STEP) {
        const onRoad = c < MAP_COLS && this._isRoadChunk(c, r, STEP);
        if (!onRoad && runStart === -1) {
          runStart = c;
        } else if (onRoad && runStart !== -1) {
          this._addWall(runStart, r, c - runStart, STEP, false);
          runStart = -1;
        }
      }
      if (runStart !== -1) {
        this._addWall(runStart, r, MAP_COLS - runStart, STEP, false);
      }
    }
  }

  _addWall(col, row, w, h, visible = true) {
    const rect = this.add.rectangle(
      col * T + (w * T) / 2,
      row * T + (h * T) / 2,
      w * T, h * T, 0x000000
    );
    if (!visible) rect.setAlpha(0);
    this.physics.add.existing(rect, true);
    this._walls.add(rect);
  }

  _generateTrees() {
    const onClearArea = (c, r) => {
      for (const [rc, rr, rw, rh] of ROADS) {
        if (c >= rc && c < rc + rw && r >= rr && r < rr + rh) return true;
      }
      if (c >= PARK_C && c < PARK_C + PARK_W && r >= PARK_R && r < PARK_R + PARK_H) return true;
      if (c <= 10) return true;              // left water
      if (r >= 151) return true;             // south water
      if (c <= 110 && r >= 148) return true; // south water buffer
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

    // House markers: Leo (blue), Warren (red), MJ (green)
    this.add.rectangle(MM_X + 30  * T * sx, MM_Y + 142 * T * sy, 3, 3, 0x4488ff)
      .setScrollFactor(0).setDepth(51);
    this.add.rectangle(MM_X + 128 * T * sx, MM_Y + 78  * T * sy, 3, 3, 0xff4444)
      .setScrollFactor(0).setDepth(51);
    this.add.rectangle(MM_X + 190 * T * sx, MM_Y + 69  * T * sy, 3, 3, 0x22cc44)
      .setScrollFactor(0).setDepth(51);
    this.add.rectangle(MM_X + 296 * T * sx, MM_Y + 76  * T * sy, 3, 3, 0x3498db)
      .setScrollFactor(0).setDepth(51);
    this.add.rectangle(MM_X + 317 * T * sx, MM_Y + 122 * T * sy, 3, 3, 0x9b59b6)
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
