import {
  SCENE_NEIGHBORHOOD, SCENE_TITLE, SCENE_DIALOGUE, SCENE_GAME_OVER, SCENE_OREGON_TRAIL, SCENE_BOSS_GAUNTLET, SCENE_HUD,
  SCENE_GRACE_BOSS, SCENE_MAX_BOSS, SCENE_NORA_BOSS, SCENE_JUSTIN_MAX_BOSS, SCENE_EDIE_BOSS, SCENE_DONUT_SHOP,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, PLAYER_SPEED, txt,
  PARTY_WARREN, PARTY_MJ, PARTY_CARSON, PARTY_JUSTIN, MUSIC_NEIGHBORHOOD, DEV_MODE,
} from '../constants.js';
import AudioManager from '../systems/AudioManager.js';
import FX from '../systems/FX.js';
import Player from '../entities/Player.js';
import Follower, { PositionBuffer } from '../entities/Follower.js';
import DeerObstacle     from '../entities/DeerObstacle.js';
import CarObstacle      from '../entities/CarObstacle.js';
import GolfCartObstacle from '../entities/GolfCartObstacle.js';
import BikeObstacle     from '../entities/BikeObstacle.js';
import GolfBallSpawner  from '../entities/GolfBallSpawner.js';
import BeanPickup       from '../entities/BeanPickup.js';
import BikeRepairPickup from '../entities/BikeRepairPickup.js';
import DonutHolePickup  from '../entities/DonutHolePickup.js';
import GoldenDonutPickup from '../entities/GoldenDonutPickup.js';
// GraceBoss is now handled in GraceBossScene; import removed
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import SaveSystem from '../systems/SaveSystem.js';
import BadgeSystem from '../systems/BadgeSystem.js';

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

// Tile indices in tileset-neighborhood (8 cols × 4 rows, 16×16px each)
const TILE = {
  GRASS:     0,  GRASS2:    1,  GRASS_DK:  2,  SIDEWALK:  3,
  DIRT:      4,  WATER_DK:  5,  WATER_LT:  6,  SHORE:     7,
  ROAD:      8,  ROAD_H:    9,  ROAD_V:   10,  ROAD_ET:  11,
  ROAD_EB:  12,  ROAD_EL:  13,  ROAD_ER:  14,  ROAD_X:   15,
  WALL:     16,  ROOF:     17,  WINDOW:   18,  DOOR:     19,
  FENCE_H:  20,  FENCE_V:  21,  FENCE_C:  22,
  TREE_DK:  24,  TREE_LT:  25,  TRUNK:    26,  BUSH:     27,
  FLOWERS:  28,  GOLF:     29,  GOLF_HOLE:30,  BENCH:    31,
};

// ── Map data — loaded from neighborhood_map.json in _createImpl() ────────────
// These are module-level so they're accessible everywhere in the file.
// Values are populated from the JSON at scene startup.
let ROADS        = [];
let PARK_C = 19, PARK_R = 65, PARK_W = 24, PARK_H = 26;
let HOUSE_GROUPS = [];
let FRIEND_ZONES = [];

// Drivable off-road pockets (2D) — [col, row, w, h] in tiles. Leo can ride here even
// though they aren't roads: Runde Park (widened east to Windward) + the golf course
// (extended south to Tega Cay Dr). Shared by collision, tree-gen, and the minimap.
const DRIVABLE_POCKETS = [
  [19,  65, 26, 26],   // Runde Park
  [220,  0, 70, 46],   // Tega Cay golf course
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
    AudioManager.playMusic(this, MUSIC_NEIGHBORHOOD);
    this.scene.wake(SCENE_HUD);   // Act 1 owns the HUD — ensure it's visible (Act 2/bosses sleep it)
    const worldW = MAP_COLS * T;
    const worldH = MAP_ROWS * T;

    // ── Load map data from JSON ───────────────────────────────────────────────
    const mapData = this.cache.json.get('neighborhood-map');
    if (mapData) {
      ROADS        = (mapData.roads ?? []).map(r => [r.col, r.row, r.w, r.h, r.label ?? null]);
      HOUSE_GROUPS = (mapData.houses ?? []).map(h => ({ col: h.col, row: h.row, n: 1, stepCol: 0, stepRow: 0, color: 0x8b7355 }));
      if (mapData.park) { PARK_C = mapData.park.col; PARK_R = mapData.park.row; PARK_W = mapData.park.w; PARK_H = mapData.park.h; }
      FRIEND_ZONES = (mapData.friendZones ?? []).map(fz => ({
        id:           fz.id,
        col:          fz.col,
        row:          fz.row,
        radius:       fz.radius,
        meetScript:   fz.meetScript,
        joinScript:   fz.joinScript,
        color:        parseInt(fz.colorHex, 16),
        label:        fz.label,
        hasBoss:      fz.hasBoss ?? false,
        bossScene:    fz.bossScene,
        defeatedFlag: fz.defeatedFlag,
      }));
    } else {
      console.warn('[NeighborhoodScene] neighborhood-map JSON not found — map will be empty');
    }

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
      AudioManager.playFart(scene);

      // Power-fart buff (from eating beans) → bigger cloud, wider knockdown radius
      const boosted = scene._powerFartUntil && Date.now() < scene._powerFartUntil;
      const FART_RADIUS = boosted ? 130 : 80;
      const ringMax     = boosted ? 96  : 48;
      const ring2Max    = boosted ? 130 : 72;

      // Expanding shockwave ring
      const ring = scene.add.circle(player.x, player.y, 6, 0xf5e642, 0.9).setDepth(6);
      scene.tweens.add({ targets: ring, radius: ringMax, alpha: 0, duration: 400,
        onComplete: () => ring.destroy() });

      // Second, fainter ring for a layered blast look
      const ring2 = scene.add.circle(player.x, player.y, 4, 0xbfa640, 0.6).setDepth(6);
      scene.tweens.add({ targets: ring2, radius: ring2Max, alpha: 0, duration: 520,
        onComplete: () => ring2.destroy() });

      // Green/yellow gas cloud puffing out behind Leo (denser when boosted)
      FX.burst(scene, player.x, player.y, {
        count: boosted ? 24 : 14,
        colors: [0xd4e157, 0xaed581, 0x9ccc65, 0xe6ee9c],
        minSpeed: 30, maxSpeed: boosted ? 130 : 95,
        minSize: 2, maxSize: boosted ? 7 : 5,
        duration: 520, depth: 6,
      });

      // Punchy comic-book callout + a little kick to the camera
      FX.popText(scene, player.x, player.y - 20, boosted ? 'BRAAAP!' : 'PBBBT!', {
        color: '#c6e37b', fontSize: boosted ? '12px' : '10px', rise: 18,
      });
      FX.shake(scene, boosted ? 220 : 160, boosted ? 0.009 : 0.006);

      // ── Rocket fart: shove Leo forward (bigger shove when boosted) ──────────────
      player.boostForward(
        PLAYER_SPEED * (boosted ? 3.6 : 2.2),
        boosted ? 340 : 260,
      );

      // Knock down deer within radius. Each FRESH topple claws back clock time —
      // deer flip from a hazard-to-avoid into a time resource worth hunting.
      const TIME_PER_DEER = 2;
      let knocked = 0;
      (scene._obstacles ?? []).forEach(o => {
        if (typeof o.knockdown !== 'function') return;
        const dx = o._x - player.x, dy = o._y - player.y;
        if (dx * dx + dy * dy > FART_RADIUS * FART_RADIUS) return;

        const alreadyDown = o._knockedDown || o._bolting;
        o.knockdown();
        if (alreadyDown || !o._knockedDown) return; // only reward a fresh knockdown

        knocked++;
        scene._resources.applyChanges({ time: TIME_PER_DEER });

        // Dust puff + "time gained" popup where the deer topples
        FX.burst(scene, o._x, o._y + 8, {
          count: 6, colors: [0xcdb891, 0xbfa77e, 0xe0d3b8],
          minSpeed: 20, maxSpeed: 55, minSize: 1, maxSize: 3,
          duration: 420, depth: 5, gravity: 6,
        });
        FX.popText(scene, o._x, o._y - 12, `+${TIME_PER_DEER} MIN`, {
          color: '#7fe07f', fontSize: '8px', rise: 18, duration: 700,
        });
      });

      // Combo callout shows the total time banked
      if (knocked >= 2) {
        FX.popText(scene, player.x, player.y - 40, `${knocked}x COMBO!  +${knocked * TIME_PER_DEER} MIN`, {
          color: '#ffd54f', fontSize: '12px', rise: 30, duration: 900,
        });
        FX.shake(scene, 240, 0.011);
      }

      // Bank the run stats for the end-of-run report card (survives boss fights
      // and save/continue via the persistent gameState object).
      if (knocked > 0) {
        const gs = scene.game.registry.get('gameState') ?? {};
        gs.deerToppled = (gs.deerToppled ?? 0) + knocked;
        gs.bestCombo   = Math.max(gs.bestCombo ?? 0, knocked);
        scene.game.registry.set('gameState', gs);

        // ── Replay badges (Phase R) ──────────────────────────────────────────
        if (knocked >= 3) BadgeSystem.awardAndToast(scene, 'fart_storm');
        if (knocked >= 5) BadgeSystem.awardAndToast(scene, 'tootnado');
        if (gs.deerToppled >= 15) BadgeSystem.awardAndToast(scene, 'deer_whisperer');
      }
    });

    // ── Ground ────────────────────────────────────────────────────────────────
    // Single seamless grass texture covering the whole world — no visible grid
    this._ts(worldW / 2, worldH / 2, worldW, worldH, 'tex-grass');

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

    // ── Roads — tile-set bitmask approach ────────────────────────────────────
    // 1. Build a Set of every (col,row) occupied by a road rectangle.
    // 2. Fill each road rect with plain asphalt texture.
    // 3. Scan the tile set: for every tile whose neighbour is NOT road, that
    //    side is a grass-facing edge → draw a sandy edge strip there.
    //    Where two roads connect, both tiles are in the set so no strip is
    //    placed — roads join cleanly with no unwanted sandy border.
    // 4. Group consecutive exposed-edge tiles into spans so we draw one
    //    tileSprite per run instead of one per tile.

    const roadSet = new Set();
    ROADS.forEach(([c, r, w, h]) => {
      for (let row = r; row < r + h; row++)
        for (let col = c; col < c + w; col++)
          roadSet.add(`${col},${row}`);
    });
    const isRoad = (col, row) => roadSet.has(`${col},${row}`);

    // Asphalt fill
    ROADS.forEach(([c, r, w, h, label]) => {
      this._ts(c * T + (w * T) / 2, r * T + (h * T) / 2, w * T, h * T, 'tex-road', 1);
      if (label) txt(this, c * T + 2, r * T + 2, label, { fontSize: '8px', color: '#888899' }).setDepth(3);
    });

    // Collect exposed edge tiles into per-row / per-col lists
    const topEdges = new Map(), botEdges = new Map();
    const lefEdges = new Map(), rigEdges = new Map();
    roadSet.forEach(key => {
      const [col, row] = key.split(',').map(Number);
      if (!isRoad(col, row - 1)) { (topEdges.get(row) ?? topEdges.set(row, []).get(row)).push(col); }
      if (!isRoad(col, row + 1)) { (botEdges.get(row) ?? botEdges.set(row, []).get(row)).push(col); }
      if (!isRoad(col - 1, row)) { (lefEdges.get(col) ?? lefEdges.set(col, []).get(col)).push(row); }
      if (!isRoad(col + 1, row)) { (rigEdges.get(col) ?? rigEdges.set(col, []).get(col)).push(row); }
    });

    // Group a sorted integer array into consecutive runs [[start,end], ...]
    const getRuns = arr => {
      const s = [...arr].sort((a, b) => a - b);
      const runs = [];
      let lo = s[0], hi = s[0];
      for (let i = 1; i < s.length; i++) {
        if (s[i] === hi + 1) hi = s[i];
        else { runs.push([lo, hi]); lo = s[i]; hi = s[i]; }
      }
      runs.push([lo, hi]);
      return runs;
    };

    // Road-to-grass edge gradient — uses pre-generated 16×16 PNG textures (power-of-2,
    // no WebGL seam artifacts). Run scripts/generate-road-edges.js to (re)generate them.
    const EDGE = 16;

    // Top edges — strip above road; tex-road-edge-h has transparent top, opaque bottom
    topEdges.forEach((cols, row) => getRuns(cols).forEach(([sc, ec]) => {
      const rw = (ec - sc + 1) * T;
      this.add.tileSprite(sc * T + rw / 2, row * T - EDGE / 2, rw, EDGE, 'tex-road-edge-h').setDepth(2);
    }));

    // Bottom edges — flip Y so opaque side faces the road (upward)
    botEdges.forEach((cols, row) => getRuns(cols).forEach(([sc, ec]) => {
      const rw = (ec - sc + 1) * T;
      this.add.tileSprite(sc * T + rw / 2, (row + 1) * T + EDGE / 2, rw, EDGE, 'tex-road-edge-h').setDepth(2).setFlipY(true);
    }));

    // Left edges — tex-road-edge-v has transparent left, opaque right (toward road)
    lefEdges.forEach((rows, col) => getRuns(rows).forEach(([sr, er]) => {
      const rh = (er - sr + 1) * T;
      this.add.tileSprite(col * T - EDGE / 2, sr * T + rh / 2, EDGE, rh, 'tex-road-edge-v').setDepth(2);
    }));

    // Right edges — flip X so opaque side faces the road (leftward)
    rigEdges.forEach((rows, col) => getRuns(rows).forEach(([sr, er]) => {
      const rh = (er - sr + 1) * T;
      this.add.tileSprite((col + 1) * T + EDGE / 2, sr * T + rh / 2, EDGE, rh, 'tex-road-edge-v').setDepth(2).setFlipX(true);
    }));

    // Corner arcs — solid filled quarter-circle sectors matching road color.
    // Center is inset INTO the road so the arc overlaps the road surface and
    // the curved boundary falls in the grass — creating a visually rounded corner.
    const INSET = 4;  // px into road per axis
    const R = INSET + 1; // radius clips 1px into grass
    const gCorner = this.add.graphics().setDepth(1);
    gCorner.fillStyle(0x343434, 1.0);
    roadSet.forEach(key => {
      const [col, row] = key.split(',').map(Number);
      const nOpen = !isRoad(col, row - 1), sOpen = !isRoad(col, row + 1);
      const wOpen = !isRoad(col - 1, row), eOpen = !isRoad(col + 1, row);
      if (nOpen && wOpen) {
        const cx = col * T + INSET, cy = row * T + INSET;
        gCorner.beginPath();
        gCorner.moveTo(cx, cy);
        gCorner.arc(cx, cy, R, Math.PI, Math.PI * 1.5, false);
        gCorner.closePath();
        gCorner.fillPath();
      }
      if (nOpen && eOpen) {
        const cx = (col + 1) * T - INSET, cy = row * T + INSET;
        gCorner.beginPath();
        gCorner.moveTo(cx, cy);
        gCorner.arc(cx, cy, R, Math.PI * 1.5, Math.PI * 2, false);
        gCorner.closePath();
        gCorner.fillPath();
      }
      if (sOpen && wOpen) {
        const cx = col * T + INSET, cy = (row + 1) * T - INSET;
        gCorner.beginPath();
        gCorner.moveTo(cx, cy);
        gCorner.arc(cx, cy, R, Math.PI * 0.5, Math.PI, false);
        gCorner.closePath();
        gCorner.fillPath();
      }
      if (sOpen && eOpen) {
        const cx = (col + 1) * T - INSET, cy = (row + 1) * T - INSET;
        gCorner.beginPath();
        gCorner.moveTo(cx, cy);
        gCorner.arc(cx, cy, R, 0, Math.PI * 0.5, false);
        gCorner.closePath();
        gCorner.fillPath();
      }
    });


    // ── Runde Park ────────────────────────────────────────────────────────────
    const parkPx = PARK_C * T + (PARK_W * T) / 2;
    const parkPy = PARK_R * T + (PARK_H * T) / 2;
    this._ts(parkPx, parkPy, PARK_W * T, PARK_H * T, 'tex-park');
    // Fence border along top and left edges
    this._ts(parkPx, PARK_R * T + T / 2,        PARK_W * T, T, TILE.FENCE_H);
    this._ts(PARK_C * T + T / 2, parkPy,         T, PARK_H * T, TILE.FENCE_V);
    txt(this, PARK_C * T + 8, PARK_R * T + 8, 'RUNDE\nPARK', {
      fontSize: '8px', color: '#88ff88',
    });

    // ── Golf course (east side, above Tega Cay Drive) ─────────────────────────
    const GC_C = 220, GC_R = 0, GC_W = 70, GC_H = 44;
    const gcPx = GC_C * T + (GC_W * T) / 2;
    const gcPy = GC_R * T + (GC_H * T) / 2;
    this._ts(gcPx, gcPy, GC_W * T, GC_H * T, 'tex-golf');
    // Fairway strips with darker rough grass + hole flag markers
    for (let i = 0; i < 4; i++) {
      const fwX = (GC_C + 5 + i * 15) * T + 5 * T;
      const fwH = (GC_H - 4) * T;
      this._ts(fwX, gcPy, 10 * T, fwH, 'tex-park');
      // One hole flag per fairway
      this._ts(fwX, gcPy - fwH / 4, T, T, TILE.GOLF_HOLE);
    }
    txt(this, GC_C * T + 8, 4, 'TEGA CAY\nGOLF CLUB', { fontSize: '8px', color: '#88ff88' });

    // ── Houses ────────────────────────────────────────────────────────────────
    const useHouseSprite = this.textures.exists('sprite-house');
    HOUSE_GROUPS.forEach(({ col, row, n, stepCol, stepRow }) => {
      for (let i = 0; i < n; i++) {
        const hc = col + i * stepCol;
        const hr = row + i * stepRow;
        const hx = hc * T + 2 * T;
        if (useHouseSprite) {
          this.add.image(hx, hr * T + T * 1.5, 'sprite-house')
            .setDisplaySize(T * 4, T * 3).setDepth(4);
        } else {
          this._ts(hx, hr * T + T / 2,  4 * T, T,     TILE.ROOF);
          this._ts(hx, hr * T + 2 * T,  4 * T, 2 * T, TILE.WALL);
          this._ts(hc * T + T,       hr * T + 1.5 * T, T, T, TILE.WINDOW);
          this._ts(hc * T + 2.5 * T, hr * T + 2.5 * T, T, T, TILE.DOOR);
        }
      }
    });
    txt(this, 126 * T, 75 * T, "WARREN'S",  { fontSize: '8px', color: '#ff8888' });
    txt(this, 188 * T, 66 * T, "MJ'S",      { fontSize: '8px', color: '#88ff88' });
    txt(this, 294 * T, 74 * T, "CARSON'S",  { fontSize: '8px', color: '#88aaff' });
    txt(this, 314 * T, 119 * T, "JUSTIN'S", { fontSize: '8px', color: '#cc88ff' });

    // ── Act 2 exit zone — position from neighborhood_map.json ───────────────
    this._exitX = null;
    this._exitY = null;
    this._exitRadius = 50;
    if (mapData?.exit) {
      this._exitX = mapData.exit.col * T;
      this._exitY = mapData.exit.row * T;
    }

    // Exit zone visual marker (if position was found in the Tiled map)
    if (this._exitX !== null) {
      const em = this.add.rectangle(this._exitX, this._exitY, 20, 20, 0xf5e642, 0.85).setDepth(3);
      this.tweens.add({ targets: em, alpha: 0.15, yoyo: true, repeat: -1, duration: 500 });
      txt(this, this._exitX, this._exitY - 18, 'TO DONUT HOUSE →', { fontSize: '8px', color: '#f5e642' }).setOrigin(0.5).setDepth(3);
    }

    // Zone markers — flashing indicators so the player can see where to go
    FRIEND_ZONES.forEach(zone => {
      const marker = this.add.rectangle(zone.col * T, zone.row * T, 12, 12, zone.color, 0.7).setDepth(3);
      this.tweens.add({ targets: marker, alpha: 0.1, yoyo: true, repeat: -1, duration: 600 });
      txt(this, zone.col * T, zone.row * T - 14, '▼', {
        fontSize: '8px', color: '#ffffff',
      }).setOrigin(0.5).setDepth(3);
    });

    // ── Trees ─────────────────────────────────────────────────────────────────
    const useTreeSprite = this.textures.exists('sprite-tree');
    this._generateTrees().forEach(([tc, tr]) => {
      const tx = tc * T + T / 2, ty = tr * T + T / 2;
      if (useTreeSprite) {
        this.add.image(tx, ty, 'sprite-tree').setDisplaySize(T * 3, T * 3).setDepth(5);
      } else {
        this._ts(tx, ty, T, T, TILE.TRUNK);
        this._ts(tx, ty, T, T, TILE.TREE_DK);
        this._ts(tx, ty, T, T, TILE.TREE_LT);
      }
    });

    // ── Boat docks — on left lake shore ───────────────────────────────────────
    [[10, 40], [10, 60], [10, 90], [10, 120]].forEach(([dc, dr]) => {
      this._ts(dc * T, dr * T, T * 2, T * 4, TILE.DIRT);
    });

    // ── Player ────────────────────────────────────────────────────────────────
    const startX = this._initData.spawnCol ? this._initData.spawnCol * T : 30 * T;
    const startY = this._initData.spawnRow ? this._initData.spawnRow * T : 142 * T;
    this._player = new Player(this, startX, startY);
    this._player.setDepth(6);
    // Fallback rectangle (used when sprite atlas isn't loaded yet)
    if (this._player._visual)        this._player._visual.setDepth(6);
    if (this._player._dirIndicator)  this._player._dirIndicator.setDepth(6);
    this.physics.add.collider(this._player, this._walls);

    // ── Recruited set (must init before Grace / deer which read it) ──────────
    this._recruited = new Set();
    const gs2 = this.game.registry.get('gameState');
    if (gs2?.party) gs2.party.forEach(id => this._recruited.add(id));

    // ── Position buffer + followers ───────────────────────────────────────────
    this._posBuffer = new PositionBuffer(this._player);
    this._followers = [];

    // ── Boss return handling ──────────────────────────────────────────────────
    // If returning from a boss scene with a win, recruit the friend (party + money).
    // Follower spawning is handled in one consolidated loop below so that all
    // previously-recruited members are also re-spawned after a scene restart.
    this._graceDefeated = this._recruited.has(PARTY_WARREN) || !!this._initData.graceDefeated;
    if (this._initData.graceDefeated && !this._recruited.has(PARTY_WARREN)) {
      this._recruited.add(PARTY_WARREN);
      this._party.addMember(PARTY_WARREN);
      this._resources.applyChanges({ money: 10 });
    }

    this._maxDefeated = this._recruited.has(PARTY_MJ) || !!this._initData.maxDefeated;
    if (this._initData.maxDefeated && !this._recruited.has(PARTY_MJ)) {
      this._recruited.add(PARTY_MJ);
      this._party.addMember(PARTY_MJ);
      this._resources.applyChanges({ money: 10 });
    }

    this._noraDefeated = this._recruited.has(PARTY_CARSON) || !!this._initData.noraDefeated;
    if (this._initData.noraDefeated && !this._recruited.has(PARTY_CARSON)) {
      this._recruited.add(PARTY_CARSON);
      this._party.addMember(PARTY_CARSON);
      this._resources.applyChanges({ money: 10 });
    }

    this._justinMaxDefeated = this._recruited.has(PARTY_JUSTIN) || !!this._initData.justinMaxDefeated;
    if (this._initData.justinMaxDefeated && !this._recruited.has(PARTY_JUSTIN)) {
      this._recruited.add(PARTY_JUSTIN);
      this._party.addMember(PARTY_JUSTIN);
      this._resources.applyChanges({ money: 10 });
    }

    // Spawn followers for every recruited member in a fixed chain order.
    // This runs on every scene start — handles both the initial recruitment
    // session and restarts after boss fights where prior followers were lost.
    [PARTY_WARREN, PARTY_MJ, PARTY_CARSON, PARTY_JUSTIN].forEach(id => {
      if (this._recruited.has(id)) {
        const zone = FRIEND_ZONES.find(z => z.id === id);
        if (zone) this._spawnFollower(zone);
      }
    });

    // Boss retry dialog — if returning from a loss with bossLost flag set
    if (this._initData.bossLost) {
      this.time.delayedCall(400, () => this._showBossRetryDialog(this._initData));
    }

    // ── Dynamic obstacles (deer, cars, golf carts, bikes, golf balls) ────────────
    // Reads from a Tiled 'DynamicObstacles' object layer when the map is loaded.
    // Until Tiled integration is active, DEFAULT_OBSTACLES below defines the spawn set.
    this._spawnObstaclesFromMap();

    // ── Bean power-ups (temporary "power fart" buff) ─────────────────────────────
    this._spawnBeans();

    // ── Bike-repair pickups (restore bike condition → speed) ─────────────────────
    this._spawnBikeRepairs();

    // ── Donut-hole trails ($1 each; breadcrumb the routes to each friend) ─────────
    this._spawnDonutHoles();

    // ── Golden donuts (3 hidden secrets, +$5 each) ───────────────────────────────
    this._spawnGoldenDonuts();

    // ── Potholes — hop over them (SPACE) for a bonus, or eat bike damage ─────────
    this._spawnPotholes();

    // Proximity prompt label (shown when near a friend's house)
    this._proximityPrompt = txt(this, 0, 0, 'SPACE: Talk', {
      fontSize: '8px', color: '#f5e642',
    }).setScrollFactor(0).setDepth(20).setVisible(false);

    // Low-bike hint — appears when the bike is worn and you have a spare to swap to.
    this._spareHint = txt(this, BASE_WIDTH / 2, 34, '', {
      fontSize: '8px', color: '#8ac6ff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20).setVisible(false);

    // ── Input ─────────────────────────────────────────────────────────────────
    this._fartKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    // R = deliberately swap to a fresh SPARE bike (trade a spare for speed).
    this._spareKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    // NOTE: there is deliberately no "talk" key. D is WASD-right, so binding it
    // to the intro script meant the first press of "move right" fired dialogue.
    // The intro now plays by itself once per new game — see the end of this method.

    // ── Scene-skip / boss-warp shortcuts — DEV ONLY ───────────────────────────
    // Never bound in a production build, so a player can't press 5 and land in
    // a boss fight. Add ?debug=1 to the URL to get them back on the live site.
    if (DEV_MODE) {
    // ── DEV CHEAT: press "2" to skip straight to Act 2 with full party ────────
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO)
      .once('down', () => {
        this.cameras.main.fade(400, 0, 0, 0);
        this.time.delayedCall(420, () => {
          this.scene.start(SCENE_OREGON_TRAIL, {
            party:     ['warren', 'mj', 'carson', 'justin'],
            resources: { time: 100, bikeCondition: 100, energy: 100, snacks: 0, money: 50 },
          });
        });
      });

    // ── DEV CHEAT: press "4" to skip straight to the Donut Shop ─────────────
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR)
      .once('down', () => {
        this.cameras.main.fade(400, 0, 0, 0);
        this.time.delayedCall(420, () => {
          this.scene.start(SCENE_DONUT_SHOP, {
            party:     ['warren', 'mj', 'carson', 'justin'],
            resources: { time: 55, bikeCondition: 60, energy: 50, snacks: 0, money: 30 },
          });
        });
      });

    // ── DEV CHEAT: press "3" to skip straight to the Boss Gauntlet ───────────
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE)
      .once('down', () => {
        this.cameras.main.fade(400, 0, 0, 0);
        this.time.delayedCall(420, () => {
          this.scene.start(SCENE_BOSS_GAUNTLET, {
            party:          ['warren', 'mj', 'carson', 'justin'],
            donuts:         6,
            resources:      { time: 80, bikeCondition: 75, energy: 70, snacks: 2, money: 5 },
            defeatedBosses: [],
          });
        });
      });

    // ── DEV CHEAT: jump straight to any boss fight (keys 5-9) for testing ────────
    const BOSS_KEYS = {
      FIVE:  { scene: SCENE_GRACE_BOSS,      name: 'GRACE' },
      SIX:   { scene: SCENE_MAX_BOSS,        name: 'MAX (MJ)' },
      SEVEN: { scene: SCENE_NORA_BOSS,       name: 'NORA' },
      EIGHT: { scene: SCENE_JUSTIN_MAX_BOSS, name: "MAX (JUSTIN'S)" },
      NINE:  { scene: SCENE_EDIE_BOSS,       name: 'EDIE' },
    };
    Object.entries(BOSS_KEYS).forEach(([code, { scene }]) => {
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[code]).on('down', () => {
        // Refill Leo so every test starts fresh
        this._resources.applyChanges({
          energy:        100 - this._resources.energy,
          bikeCondition: 100 - this._resources.bikeCondition,
        });
        this.cameras.main.fade(300, 0, 0, 0);
        this.time.delayedCall(320, () => this.scene.start(scene, {}));
      });
    });
    }   // end DEV_MODE shortcuts

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this._player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(80, 60);

    // ── Controls hint ─────────────────────────────────────────────────────────
    // The boss-warp list is dev-only; the controls line is for players and stays.
    // (D: TALK is gone — D is WASD-right, and the intro now plays on its own.)
    if (DEV_MODE) {
      txt(this, 6, BASE_HEIGHT - 18, 'BOSS TEST  5:GRACE  6:MAX  7:NORA  8:JUSTIN-MAX  9:EDIE', {
        fontSize: '8px', color: '#997788',
      }).setScrollFactor(0).setDepth(10);
    }
    txt(this, 6, BASE_HEIGHT - 10, 'WASD: MOVE   F: FART   SPACE: HOP OVER STUFF', {
      fontSize: '8px', color: '#778899',
    }).setScrollFactor(0).setDepth(10);

    // ── Minimap ───────────────────────────────────────────────────────────────
    this._buildMinimap(worldW, worldH);

    this._resources.applyChanges({});
    this._party._emit();

    // ── Opening lines ─────────────────────────────────────────────────────────
    // Plays by itself at the start of a new game, then never again — the flag
    // lives in gameState so coming back here from a boss fight or Act 2 doesn't
    // replay it. Everything else stays event-driven, as it already was.
    const gs = this.game.registry.get('gameState');
    if (gs && !gs.introSeen) {
      gs.introSeen = true;
      this.time.delayedCall(400, () => {
        this.scene.get(SCENE_DIALOGUE)?.showScript('intro', () => {});
      });
    }
  }

  update(time, delta) {
    if (this._runPaused) {
      // Skipping _player.update() stops input, but the Arcade body keeps its last
      // velocity and would coast across the map behind the overlay ("bike keeps
      // moving when a repair is mandatory"). Zero it so the ride is truly frozen.
      if (this._player?.body) this._player.setVelocity(0, 0);
      return;
    }
    this._player.update();
    this._posBuffer.record();
    this._followers.forEach(f => f.update());

    const fartJustDown = Phaser.Input.Keyboard.JustDown(this._fartKey) ||
                         this._player.fartJustPressed;
    if (fartJustDown) {
      this._abilities.execute('lightning_fart', this, this._player);
      // A fart near a golfer spooks him into a wild, erratic spray of balls.
      const FART_STARTLE_R2 = 90 * 90;
      for (const o of this._obstacles) {
        if (typeof o.startle !== 'function') continue;
        const dx = o._x - this._player.x, dy = o._y - this._player.y;
        if (dx * dx + dy * dy <= FART_STARTLE_R2) o.startle(this._player.x, this._player.y);
      }
    }

    // Update obstacles
    this._obstacles.forEach(o => o.update(this._player));

    // ── Bean pickups + power-fart buff ───────────────────────────────────────────
    this._checkBeanPickups();
    this._updatePowerFart();
    this._checkBikeRepairs();
    this._checkDonutHoles();
    this._checkGoldenDonuts();
    this._checkPotholes();

    // ── Bike condition → Leo's speed (0.3× at 0 bike, 1.0× at full) ─────────────
    this._player.speedMultiplier = 0.3 + 0.7 * (this._resources.bikeCondition / 100);

    // ── Deliberate spare swap (R): trade a spare for a fresh, fast bike ──────────
    if (Phaser.Input.Keyboard.JustDown(this._spareKey)) this._trySwapSpare();
    this._updateSpareHint();

    // ── Act 1 clock drain (only while Leo is moving) ─────────────────────────────
    // ACT1_TIME_RATE: time-units per second. 0.5 = ~9 min real time to drain Act 1 budget.
    // Time pauses when Leo stops — rewards exploration but punishes long detours.
    const ACT1_TIME_RATE = 0.5;
    const leoMoving = Math.abs(this._player.body.velocity.x) > 2
                   || Math.abs(this._player.body.velocity.y) > 2;
    if (!this._departurePlayed && leoMoving) {
      this._act1TimeAccum = (this._act1TimeAccum ?? 0) + delta;
      if (this._act1TimeAccum >= 1000) {
        this._resources.applyChanges({ time: -Math.round(ACT1_TIME_RATE * this._act1TimeAccum / 1000) });
        this._act1TimeAccum = 0;
      }
    }

    // ── Game over checks ──────────────────────────────────────────────────────────
    // Energy hits 0
    if (this._resources.isExhausted() && !this._gameOverTriggered) {
      this._gameOverTriggered = true;
      this.cameras.main.fade(600, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) this.scene.start(SCENE_GAME_OVER, { reason: 'energy' });
      });
    }

    // Bike condition hits 0
    if (this._resources.isBikeBroken() && !this._bikeBrokenTriggered) {
      this._bikeBrokenTriggered = true;
      this._onBikeBroken();
    }

    // 3:00 PM hard stop (time ≤ 120)
    if (!this._deadlineShown && this._resources.time <= 120 && !this._departurePlayed) {
      this._deadlineShown = true;
      this._showDeadlineOverlay();
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

    // ── Exit zone — auto-show choice overlay on entry (no SPACE needed)
    if (this._exitX !== null && !this._departurePlayed) {
      const edx = px - this._exitX;
      const edy = py - this._exitY;
      if (edx * edx + edy * edy < this._exitRadius * this._exitRadius) {
        if (!this._departurePromptShown && !this._dialoguePlayed) {
          this._departurePromptShown = true;
          this._dialoguePlayed = true;
          this._proximityPrompt.setVisible(false);
          this._showDepartureChoice();
        }
        return;
      } else if (this._departurePromptShown) {
        // Leo walked out of the exit zone — allow the overlay to show again on re-entry
        this._departurePromptShown = false;
        this._dialoguePlayed = false;
      }
    }

    // ── Friend house zones ─────────────────────────────────────────────────────
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
    this._onObstacleHit(10);
  }

  _onObstacleHit(damage = 10) {
    this._resources.applyChanges({ bikeCondition: -damage });
    // Getting hit also costs TIME (bug 7), scaled gently with how hard the hit was.
    const timeLoss = Math.max(2, Math.round(damage / 8));
    this._resources.applyChanges({ time: -timeLoss });
    FX.popText(this, this._player.x, this._player.y - 18, `-${timeLoss} MIN`, {
      color: '#ff7766', fontSize: '8px', rise: 18, duration: 700,
    });
    this.cameras.main.flash(200, 255, Math.min(damage * 5, 255), 0);
  }

  // Collected-pickup tracking lives on the saved gameState object (same channel
  // that persists recruited friends), so it survives boss fights AND save/continue.
  // Returns the Set of collected spot-indices for the given pickup key.
  _collectedSet(key) {
    const gs = this.game.registry.get('gameState') ?? {};
    this.game.registry.set('gameState', gs);
    return new Set(gs[key] ?? []);
  }

  _markCollected(key, index) {
    const gs = this.game.registry.get('gameState') ?? {};
    const set = new Set(gs[key] ?? []);
    set.add(index);
    gs[key] = [...set];
    this.game.registry.set('gameState', gs);
    this._autosave(); // persist immediately so a boss entry can't lose it
  }

  // ── Bean power-ups ───────────────────────────────────────────────────────────
  // Beans sit on out-of-the-way road tiles. Grabbing one grants a temporary
  // "power fart" buff: bigger cloud + wider knockdown radius + 3× faster recharge.
  // Collected beans persist in gameState so they don't respawn after a boss fight.

  _spawnBeans() {
    // Tile (col,row) spots — each verified to sit on a road, off the main artery.
    const SPOTS = [
      [58, 65],   // Tara Tea Dr, west end
      [82, 85],   // Mariana Ln, east end
      [64, 117],  // Marquesas Ave
      [30, 148],  // Leo's house loop (SW)
      [110, 76],  // Suwarrow Ct cul-de-sac
      [300, 154], // south road near Justin's
      [240, 120], // long central N-S spur — pairs with the 10-deer combo shrine nearby
      // Combo-setup beans (2D): grab, then blast the herd just past it.
      [46, 114],  // ride north on Windward → starter pod at r104
      [43, 78],   // park entrance → park herd
      [224, 47],  // golf entrance → golf rough herd
    ];

    this._powerFartUntil = 0;
    this._powerFartDuration = 15000;

    const collected = this._collectedSet('collectedBeans');

    this._beans = [];
    SPOTS.forEach(([c, r], i) => {
      if (collected.has(i)) return;
      const bean = new BeanPickup(this, c * T + 8, r * T + 8);
      bean._spotIndex = i;
      this._beans.push(bean);
    });

    // Green aura that pulses around Leo while the buff is active
    this._fartAura = this.add.ellipse(0, 0, 44, 44, 0x9ccc65, 0).setDepth(2);

    // Small buff timer HUD (bottom-left, pinned to camera)
    this._beanHud = this.add.container(24, BASE_HEIGHT - 26)
      .setScrollFactor(0).setDepth(41).setVisible(false);
    const hudCan = this.add.rectangle(0, 0, 9, 12, 0xc0392b).setStrokeStyle(1, 0x7b241c);
    const hudLbl = this.add.rectangle(0, 1, 9, 4, 0xf5e6c0);
    const barBg  = this.add.rectangle(9, 0, 46, 6, 0x222222).setOrigin(0, 0.5);
    this._beanBar = this.add.rectangle(9, 0, 46, 6, 0x9ccc65).setOrigin(0, 0.5);
    const hudTxt = txt(this, 9, -11, 'POWER FART', { fontSize: '8px', color: '#c6e37b' }).setOrigin(0, 0.5);
    this._beanHud.add([hudCan, hudLbl, barBg, this._beanBar, hudTxt]);
  }

  _checkBeanPickups() {
    if (!this._beans || this._beans.length === 0) return;
    const px = this._player.x, py = this._player.y;
    for (const bean of this._beans) {
      if (bean.collected) continue;
      const dx = bean.x - px, dy = bean.y - py;
      if (dx * dx + dy * dy < 18 * 18) {
        bean.collect();
        this._markCollected('collectedBeans', bean._spotIndex);
        this._activatePowerFart();
      }
    }
  }

  _activatePowerFart() {
    this._powerFartUntil = Date.now() + this._powerFartDuration;
    this._abilities.setCooldownScale('lightning_fart', 0.3);
    AudioManager.playFart(this);
    FX.popText(this, this._player.x, this._player.y - 26, 'POWER FART!', {
      color: '#c6e37b', fontSize: '12px', rise: 28, duration: 900,
    });
  }

  _updatePowerFart() {
    const active = this._powerFartUntil && Date.now() < this._powerFartUntil;

    if (!active) {
      if (this._powerFartUntil) {
        this._powerFartUntil = 0;
        this._abilities.setCooldownScale('lightning_fart', 1);
      }
      this._beanHud.setVisible(false);
      this._fartAura.setVisible(false);
      return;
    }

    const remain = (this._powerFartUntil - Date.now()) / this._powerFartDuration;
    this._beanHud.setVisible(true);
    this._beanBar.width = 46 * Phaser.Math.Clamp(remain, 0, 1);

    this._fartAura.setVisible(true).setPosition(this._player.x, this._player.y);
    this._fartAura.setAlpha(0.22 + 0.14 * Math.sin(Date.now() / 110));
  }

  // ── Bike-repair pickups ──────────────────────────────────────────────────────
  // Toolboxes on out-of-the-way road tiles. Grabbing one fully restores bike
  // condition (and therefore speed) — a finite lifeline for a battered bike.
  // Collected ones persist in gameState so they don't respawn after a boss.

  _spawnBikeRepairs() {
    const SPOTS = [
      [47, 100],  // Windward Dr, mid — long southbound artery
      [210, 70],  // east spur off Tega Cay Drive
      [290, 98],  // far-east loop road
      [313, 140], // south-east corner
    ];

    const collected = this._collectedSet('collectedBikeRepairs');

    this._bikeRepairs = [];
    SPOTS.forEach(([c, r], i) => {
      if (collected.has(i)) return;
      const kit = new BikeRepairPickup(this, c * T + 8, r * T + 8);
      kit._spotIndex = i;
      this._bikeRepairs.push(kit);
    });
  }

  _checkBikeRepairs() {
    if (!this._bikeRepairs || this._bikeRepairs.length === 0) return;
    const px = this._player.x, py = this._player.y;
    for (const kit of this._bikeRepairs) {
      if (kit.collected) continue;
      const dx = kit.x - px, dy = kit.y - py;
      if (dx * dx + dy * dy < 18 * 18) {
        kit.collect();
        this._markCollected('collectedBikeRepairs', kit._spotIndex);
        this._repairBike();
      }
    }
  }

  _repairBike() {
    const missing = 100 - this._resources.bikeCondition;
    this._resources.applyChanges({ bikeCondition: missing });
    AudioManager.playSfx(this, 'sfx-bike-hit', { volume: 0.5 });
    FX.popText(this, this._player.x, this._player.y - 26, 'BIKE FIXED!', {
      color: '#8ad4ff', fontSize: '12px', rise: 28, duration: 900,
    });
    // Quick sparkle wash over Leo
    FX.burst(this, this._player.x, this._player.y, {
      count: 12, colors: [0x8ad4ff, 0xe8eef2, 0xffffff],
      minSpeed: 30, maxSpeed: 90, minSize: 1, maxSize: 3, duration: 450, depth: 7,
    });
  }

  // ── Donut-hole trails (2A) ─────────────────────────────────────────────────────
  // Coins on the roads: each pays $1, and the trails double as breadcrumbs pointing
  // toward each friend's house. Collected indices persist in gameState so they don't
  // respawn after a boss fight. Positions are FIXED (route knowledge is Act 1's replay
  // value — see design principle #7).
  _spawnDonutHoles() {
    // A straight run of holes from (c0,r0) to (c1,r1); one axis must be constant.
    const line = (c0, r0, c1, r1, step) => {
      const pts = [];
      if (c0 !== c1) { const d = Math.sign(c1 - c0); for (let c = c0; d > 0 ? c <= c1 : c >= c1; c += d * step) pts.push([c, r0]); }
      else           { const d = Math.sign(r1 - r0); for (let r = r0; d > 0 ? r <= r1 : r >= r1; r += d * step) pts.push([c0, r]); }
      return pts;
    };
    const SPOTS = [
      ...line(46, 128, 46, 100, 4),   // Windward — the opening climb north
      ...line(60,  47, 120, 47, 8),   // Tega Cay Dr W — toward MJ
      ...line(60,  64, 124, 64, 8),   // Tara Tea Dr — toward Warren
      ...line(214, 56, 270, 56, 8),   // Tega Cay Dr E — toward Carson
      ...line(311, 84, 311, 120, 6),  // east loop — toward Justin
      [24, 68], [30, 68], [36, 68], [36, 78], [30, 84], [24, 84],  // park interior loop
    ];

    const collected = this._collectedSet('collectedDonutHoles');
    this._donutHoles = [];
    SPOTS.forEach(([c, r], i) => {
      if (collected.has(i)) return;
      const hole = new DonutHolePickup(this, c * T + 8, r * T + 8);
      hole._spotIndex = i;
      this._donutHoles.push(hole);
    });
  }

  _checkDonutHoles() {
    if (!this._donutHoles || this._donutHoles.length === 0) return;
    const px = this._player.x, py = this._player.y;
    for (const hole of this._donutHoles) {
      if (hole.collected) continue;
      const dx = hole.x - px, dy = hole.y - py;
      if (dx * dx + dy * dy < 16 * 16) {
        hole.collect();
        this._markCollected('collectedDonutHoles', hole._spotIndex);
        this._resources.applyChanges({ money: 1 });
        FX.popText(this, hole.x, hole.y - 12, '+$1', { color: '#f5d24a', fontSize: '8px', rise: 16, duration: 600 });
        const gs = this.game.registry.get('gameState') ?? {};
        gs.donutHolesCollected = (gs.donutHolesCollected ?? 0) + 1;
        this.game.registry.set('gameState', gs);
      }
    }
  }

  // ── Golden donuts (R3) ─────────────────────────────────────────────────────────
  // Three hidden secrets in rarely-visited spots (deep golf course, marina stub, far
  // SE corner). +$5 + big fanfare each; all 3 in a run → GOLDEN GLAZE badge. NOT on
  // the minimap — the badge hint is the only clue.
  _spawnGoldenDonuts() {
    const SPOTS = [
      [258, 12],   // deep in the golf course, behind the ball-fire line (needs drivable golf)
      [11, 146],   // marina road stub, SW of Leo's house
      [313, 153],  // far SE corner, south road by Justin's street
    ];
    const collected = this._collectedSet('collectedGoldenDonuts');
    this._goldenDonuts = [];
    SPOTS.forEach(([c, r], i) => {
      if (collected.has(i)) return;
      const g = new GoldenDonutPickup(this, c * T + 8, r * T + 8);
      g._spotIndex = i;
      this._goldenDonuts.push(g);
    });
  }

  _checkGoldenDonuts() {
    if (!this._goldenDonuts || this._goldenDonuts.length === 0) return;
    const px = this._player.x, py = this._player.y;
    for (const g of this._goldenDonuts) {
      if (g.collected) continue;
      const dx = g.x - px, dy = g.y - py;
      if (dx * dx + dy * dy < 18 * 18) {
        g.collect();
        this._markCollected('collectedGoldenDonuts', g._spotIndex);
        this._resources.applyChanges({ money: 5 });
        FX.popText(this, g.x, g.y - 24, 'GOLDEN DONUT! +$5', { color: '#ffd23f', fontSize: '12px', rise: 30, duration: 1100 });
        const gs = this.game.registry.get('gameState') ?? {};
        gs.goldenDonuts = (gs.goldenDonuts ?? 0) + 1;
        this.game.registry.set('gameState', gs);
        if (gs.goldenDonuts >= 3) BadgeSystem.awardAndToast(this, 'golden_glaze');
      }
    }
  }

  // ── Potholes (hop targets) ──────────────────────────────────────────────────
  // Static road hazards. Ride through one → bike damage + lost time. HOP over it
  // (SPACE, mid-jump) → a time BONUS. You can also just steer around them — but the
  // hop is the rewarding play, which finally gives the jump a real job in Act 1.
  _spawnPotholes() {
    const SPOTS = [
      [47, 90], [52, 115], [90, 47], [150, 55], [230, 47], [90, 64], [311, 100], [280, 152],
    ];
    this._potholes = SPOTS.map(([c, r]) => {
      const x = c * T + 8, y = r * T + 8;
      this.add.ellipse(x, y, 20, 12, 0x080808, 0.92).setStrokeStyle(1, 0x333333).setDepth(2);
      this.add.rectangle(x - 3, y,     7, 1, 0x2e2e2e).setAngle(20).setDepth(2);
      this.add.rectangle(x + 4, y - 1, 6, 1, 0x2e2e2e).setAngle(-35).setDepth(2);
      return { x, y, lastHit: 0 };
    });
  }

  _checkPotholes() {
    if (!this._potholes) return;
    const now = Date.now();
    const px = this._player.x, py = this._player.y;
    for (const p of this._potholes) {
      if (now - p.lastHit < 1500) continue;           // don't retrigger while lingering
      const dx = p.x - px, dy = p.y - py;
      if (dx * dx + dy * dy > 15 * 15) continue;
      p.lastHit = now;
      if (this._player.isJumping) {
        this._resources.applyChanges({ time: 2 });
        FX.popText(this, px, py - 22, 'NICE HOP! +2 MIN', { color: '#8fd6ff', fontSize: '8px', rise: 20, duration: 800 });
      } else {
        this._resources.applyChanges({ bikeCondition: -8, time: -2 });
        FX.popText(this, px, py - 18, 'POTHOLE! -2 MIN', { color: '#ff7766', fontSize: '8px', rise: 18, duration: 700 });
        this.cameras.main.shake(120, 0.006);
      }
    }
  }

  // ── Obstacle factory ───────────────────────────────────────────────────────────
  // Reads the 'obstacles' array from neighborhood_map.json.
  // Each entry: { type, col, row, w, h, count?, speed?, damage?, angle?, interval? }
  //   type  = 'deer' | 'car' | 'golf_cart' | 'bike' | 'golf_ball'
  //   w ≥ h → horizontal patrol (E-W); h > w → vertical patrol (N-S)
  //   bounding box (col/row/w/h in tiles) → patrol range in pixels
  //   count → N evenly-distributed instances across the rect

  _spawnObstaclesFromMap() {
    const cb = (dmg) => this._onObstacleHit(dmg);
    this._obstacles = [];

    const mapData = this.cache.json.get('neighborhood-map');
    const defs = mapData?.obstacles;
    if (!defs?.length) {
      console.warn('[NeighborhoodScene] No obstacles in neighborhood-map JSON');
      return;
    }

    defs.forEach(d => {
      const dw    = d.w ?? 0;
      const dh    = d.h ?? 0;
      const isH   = dw >= dh;
      const minB  = (isH ? d.col : d.row) * T;
      const maxB  = (isH ? d.col + dw : d.row + dh) * T;
      const cx    = (d.col + dw / 2) * T;
      const cy    = (d.row + dh / 2) * T;
      const count = d.count ?? 1;

      // Jitter each spawn within ±30% of its slice so no two runs open identically
      // (2D vi — "static places, random moments": the patrol range/road is fixed,
      // only the starting position inside it varies). Golf balls stay deterministic.
      const slice = count > 0 ? (maxB - minB) / count : 0;
      for (let i = 0; i < count; i++) {
        let spawnX = cx, spawnY = cy;
        if (count > 1) {
          const t = (i + 0.5) / count;
          if (isH) spawnX = minB + t * (maxB - minB);
          else     spawnY = minB + t * (maxB - minB);
        }
        if (d.type !== 'golf_ball' && slice > 0) {
          const jitter = (Math.random() - 0.5) * 0.6 * slice;   // ±30% of a slice
          if (isH) spawnX = Phaser.Math.Clamp(spawnX + jitter, minB, maxB);
          else     spawnY = Phaser.Math.Clamp(spawnY + jitter, minB, maxB);
        }

        switch (d.type) {
          case 'deer':
            this._obstacles.push(new DeerObstacle(this, spawnX, spawnY, minB, maxB, isH, cb, d.speed));
            break;
          case 'car':
            this._obstacles.push(new CarObstacle(this, spawnX, spawnY, minB, maxB, isH, cb, d.speed, d.damage));
            break;
          case 'golf_cart':
            this._obstacles.push(new GolfCartObstacle(this, spawnX, spawnY, minB, maxB, isH, cb, d.speed, d.damage));
            break;
          case 'bike':
            this._obstacles.push(new BikeObstacle(this, spawnX, spawnY, minB, maxB, isH, cb, d.speed, d.damage));
            break;
          case 'golf_ball':
            this._obstacles.push(new GolfBallSpawner(this, cx, cy, d.angle ?? 0, d.interval, d.speed, d.damage, cb));
            break;
          default:
            console.warn('[NeighborhoodScene] Unknown obstacle type:', d.type);
        }
      }
    });
  }

  _doDepart() {
    this._departurePlayed = true;
    this.cameras.main.fade(500, 0, 0, 0);
    this.time.delayedCall(520, () =>
      this.scene.start(SCENE_OREGON_TRAIL, {
        party:     this._party.getParty(),
        resources: this._resources.getAll(),
      })
    );
  }

  _showDepartureChoice() {
    const cx = BASE_WIDTH / 2, cy = BASE_HEIGHT / 2;
    const objs = [];

    objs.push(this.add.rectangle(cx, cy, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.82).setScrollFactor(0).setDepth(50).setInteractive());
    objs.push(txt(this, cx, cy - 52, 'READY TO DEPART?', { fontSize: '12px', color: '#f5e642' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));

    const partyNames = this._party.getParty();
    const crewLine = partyNames.length > 0
      ? `CREW: Leo + ${partyNames.map(id => id.charAt(0).toUpperCase() + id.slice(1)).join(', ')}`
      : 'CREW: Leo (solo)';
    objs.push(txt(this, cx, cy - 36, crewLine, { fontSize: '8px', color: '#aaccee' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));

    // ── The early-departure gamble ──────────────────────────────────────────
    // Leaving with fewer friends banks more time for the ride, but each friend
    // is $10 of supplies, a skill in road events, AND one fewer sibling to fight
    // on the way home. Make that trade-off explicit.
    const missing = 4 - partyNames.length;
    if (missing > 0) {
      objs.push(txt(this, cx, cy - 20, `${missing} friend${missing > 1 ? 's' : ''} still out there.  Each one brings:`,
        { fontSize: '8px', color: '#ffcc66' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));
      objs.push(txt(this, cx, cy - 10, '+$10 supplies  ·  a road-event move  ·  one more boss home',
        { fontSize: '8px', color: '#889' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));
      objs.push(txt(this, cx, cy, 'Leave now and you keep the extra time.',
        { fontSize: '8px', color: '#7fd67f' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));
    } else {
      objs.push(txt(this, cx, cy - 14, 'FULL CREW!  Everyone is with you.',
        { fontSize: '8px', color: '#7fd67f' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));
    }

    const goLabel = missing > 0 ? 'RIDE NOW (more time, fewer friends)' : 'RIDE TO THE DONUTS!';
    const btn1 = this.add.rectangle(cx, cy + 16, 260, 16, 0x1a3a1a).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
    objs.push(btn1);
    objs.push(txt(this, cx, cy + 16, goLabel, { fontSize: '8px', color: '#88ff88' }).setScrollFactor(0).setOrigin(0.5).setDepth(52));

    const btn2 = this.add.rectangle(cx, cy + 38, 260, 16, 0x1a1a3a).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
    objs.push(btn2);
    objs.push(txt(this, cx, cy + 38, missing > 0 ? `KEEP LOOKING (find the other ${missing})` : 'KEEP EXPLORING ACT 1',
      { fontSize: '8px', color: '#4fc3f7' }).setScrollFactor(0).setOrigin(0.5).setDepth(52));

    const dismiss = () => {
      objs.forEach(o => o.destroy());
      // Keep _departurePromptShown and _dialoguePlayed true so the overlay
      // doesn't immediately re-trigger while Leo is still standing on the exit.
      // Both flags reset when Leo walks out of the exit radius.
    };

    btn1.on('pointerdown', () => {
      objs.forEach(o => o.destroy());
      this._doDepart();
    });
    btn2.on('pointerdown', dismiss);
  }

  // Bike broke (condition hit 0). Spend a BIKE LIFE and respawn right where you are with
  // a repaired bike; out of lives → full restart. (Bugs 1 & 2: was a dead-end restart, and
  // the flag never reset so a second break did nothing.)
  _onBikeBroken() {
    // Spares are spent WHEN used (below), not upfront — so 3 pips = 3 real swaps and the
    // deliberate R-swap and the auto-break share one clean model.
    const spares = this.game.registry.get('gameState')?.bikeLives ?? 3;

    // Freeze the scene while the overlay is up so nothing keeps ticking behind it —
    // no time drain, no re-triggers, and (crucially) no autosave re-persisting the run.
    this._runPaused = true;

    const cx = BASE_WIDTH / 2, cy = BASE_HEIGHT / 2;
    const objs = [];
    // Interactive so clicks can't fall through the overlay to the game world.
    objs.push(this.add.rectangle(cx, cy, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.88).setScrollFactor(0).setDepth(50).setInteractive());

    if (spares >= 1) {
      objs.push(txt(this, cx, cy - 24, 'BIKE BROKE!', { fontSize: '12px', color: '#ff8844' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));
      objs.push(txt(this, cx, cy - 6, `${spares} SPARE BIKE${spares === 1 ? '' : 'S'} READY`, { fontSize: '8px', color: '#ffcc66' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));
      const btn = this.add.rectangle(cx, cy + 20, 170, 16, 0x1a3a1a).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
      objs.push(btn);
      objs.push(txt(this, cx, cy + 20, 'HOP ON A SPARE & KEEP GOING', { fontSize: '8px', color: '#88ff88' }).setScrollFactor(0).setOrigin(0.5).setDepth(52));
      btn.on('pointerdown', () => {
        objs.forEach(o => o.destroy());
        this._useSpareBike();                // spend a spare → fresh bike
        this._bikeBrokenTriggered = false;   // can break again later
        this._runPaused = false;             // resume the ride
        this._autosave();
      });
    } else {
      objs.push(txt(this, cx, cy - 20, 'OUT OF BIKES!', { fontSize: '12px', color: '#ff4444' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));
      objs.push(txt(this, cx, cy - 2, 'THE QUEST IS OVER', { fontSize: '8px', color: '#aaaaaa' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));
      const btn = this.add.rectangle(cx, cy + 20, 100, 16, 0x2a1a1a).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
      objs.push(btn);
      objs.push(txt(this, cx, cy + 20, 'RESTART', { fontSize: '8px', color: '#ff4444' }).setScrollFactor(0).setOrigin(0.5).setDepth(52));
      btn.on('pointerdown', () => {
        // Full wipe → a genuine new game. Clear the saved file AND the in-memory run
        // state (party, spawn, lives), so the restart can't resurrect a mid-run save.
        SaveSystem.deleteSave();
        this.game.registry.set('gameState', SaveSystem.newGame());
        this.scene.start(SCENE_TITLE);
      });
    }
  }

  // Spend one spare bike → jump onto a fresh, full-condition bike. Shared by the auto-break
  // and the deliberate R-swap. Returns false if there are no spares left.
  _useSpareBike() {
    const gs = this.game.registry.get('gameState') ?? {};
    if ((gs.bikeLives ?? 0) <= 0) return false;
    gs.bikeLives -= 1;
    this.game.registry.set('gameState', gs);
    this._resources.applyChanges({ bikeCondition: 100 - this._resources.bikeCondition });
    return true;
  }

  // Deliberate swap (R): trade a spare for a fresh fast bike when yours is worn — so you
  // can choose speed over limping. Only when the bike is actually worn (<60%), so you can't
  // waste a spare on a near-full bike.
  _trySwapSpare() {
    if (this._runPaused || this._departurePlayed) return;
    const spares = this.game.registry.get('gameState')?.bikeLives ?? 3;
    if (this._resources.bikeCondition >= 60) {
      FX.popText(this, this._player.x, this._player.y - 22, 'BIKE STILL GOOD', { color: '#8899aa', fontSize: '8px', rise: 16, duration: 700 });
      return;
    }
    if (spares <= 0) {
      FX.popText(this, this._player.x, this._player.y - 22, 'NO SPARES LEFT!', { color: '#ff7766', fontSize: '8px', rise: 16, duration: 700 });
      return;
    }
    this._useSpareBike();
    AudioManager.playSfx(this, 'sfx-bike-hit', { volume: 0.5 });
    FX.popText(this, this._player.x, this._player.y - 26, 'FRESH BIKE!', { color: '#8ad4ff', fontSize: '12px', rise: 26, duration: 900 });
    FX.burst(this, this._player.x, this._player.y, {
      count: 12, colors: [0x8ad4ff, 0xe8eef2, 0xffffff], minSpeed: 30, maxSpeed: 90, minSize: 1, maxSize: 3, duration: 450, depth: 7,
    });
    this._autosave();
  }

  // Show the "press R for a spare" nudge only when the bike is worn AND you have a spare.
  _updateSpareHint() {
    if (!this._spareHint) return;
    const spares = this.game.registry.get('gameState')?.bikeLives ?? 3;
    const show = this._resources.bikeCondition < 60 && spares > 0 && !this._departurePlayed;
    this._spareHint.setVisible(show);
    if (show) this._spareHint.setText(`BIKE WORN! Press R for a spare (x${spares})`);
  }

  _showDeadlineOverlay() {
    const cx = BASE_WIDTH / 2, cy = BASE_HEIGHT / 2;
    const objs = [];
    objs.push(this.add.rectangle(cx, cy, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.88).setScrollFactor(0).setDepth(50).setInteractive());
    objs.push(txt(this, cx, cy - 30, "IT'S 3:00 PM!", { fontSize: '12px', color: '#f5a623' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));
    objs.push(txt(this, cx, cy - 10, 'LAST CHANCE TO DEPART', { fontSize: '8px', color: '#cccccc' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));

    const btn1 = this.add.rectangle(cx, cy + 12, 148, 16, 0x1a3a1a).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
    objs.push(btn1);
    objs.push(txt(this, cx, cy + 12, 'DEPART WITH CURRENT CREW', { fontSize: '8px', color: '#88ff88' }).setScrollFactor(0).setOrigin(0.5).setDepth(52));

    const btn2 = this.add.rectangle(cx, cy + 34, 90, 16, 0x2a1a1a).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
    objs.push(btn2);
    objs.push(txt(this, cx, cy + 34, 'RESTART GAME', { fontSize: '8px', color: '#ff4444' }).setScrollFactor(0).setOrigin(0.5).setDepth(52));

    btn1.on('pointerdown', () => { objs.forEach(o => o.destroy()); this._doDepart(); });
    btn2.on('pointerdown', () => { SaveSystem.deleteSave(); this.scene.start(SCENE_TITLE); });
  }

  _showBossRetryDialog({ bossLost, bossScene, spawnCol, spawnRow }) {
    const NAMES = { grace: 'GRACE', max: 'MAX', nora: 'NORA', justinmax: 'MAX' };
    const name = NAMES[bossLost] ?? 'SIBLING';
    const cx = BASE_WIDTH / 2, cy = BASE_HEIGHT / 2;
    const objs = [];
    objs.push(this.add.rectangle(cx, cy, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.82).setScrollFactor(0).setDepth(50).setInteractive());
    objs.push(txt(this, cx, cy - 28, `LOST TO ${name}!`, { fontSize: '10px', color: '#ff4444' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));

    const dismiss = () => objs.forEach(o => o.destroy());

    if (this._resources.time > 10) {
      const btnR = this.add.rectangle(cx, cy - 4, 170, 16, 0x1a1a3a).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
      objs.push(btnR);
      objs.push(txt(this, cx, cy - 4, 'FIGHT AGAIN  (-10 MIN)', { fontSize: '8px', color: '#4fc3f7' }).setScrollFactor(0).setOrigin(0.5).setDepth(52));
      btnR.on('pointerdown', () => {
        this._resources.applyChanges({ time: -10, energy: 100 - this._resources.energy });
        dismiss();
        this.cameras.main.fade(400, 0, 0, 0);
        this.time.delayedCall(420, () => this.scene.start(bossScene, { returnFlag: `${bossLost}Defeated` }));
      });
    } else {
      objs.push(txt(this, cx, cy - 4, 'NOT ENOUGH TIME TO RETRY', { fontSize: '8px', color: '#556677' }).setScrollFactor(0).setOrigin(0.5).setDepth(51));
    }

    const btnS = this.add.rectangle(cx, cy + 18, 170, 16, 0x2a1a1a).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
    objs.push(btnS);
    objs.push(txt(this, cx, cy + 18, `CONTINUE WITHOUT ${name}`, { fontSize: '8px', color: '#aaaaaa' }).setScrollFactor(0).setOrigin(0.5).setDepth(52));
    btnS.on('pointerdown', dismiss);
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
    const slotIndex   = this._followers.length;
    const spriteKey   = `sprite-${zone.id}`;
    const displaySize = zone.id === PARTY_WARREN ? Math.round(TILE_SIZE * 3.2) : TILE_SIZE * 3;
    const follower    = new Follower(this, this._posBuffer, slotIndex, zone.color, zone.label, spriteKey, displaySize);
    follower.setDepth(5);
    this._followers.push(follower);
  }

  // Shorthand: fill an area with a repeating texture.
  // key: a 'tex-*' image key (seamless 128px textures for large surfaces) OR
  //      a number (tile index from the 16×16 tileset spritesheet).
  // x/y are the centre of the filled area (same convention as add.rectangle).
  //
  // For 'tex-*' textures the tile position is world-anchored: every sprite
  // using the same texture samples the exact same pixel at any world coordinate.
  // This means overlapping road/ground sprites blend seamlessly at intersections
  // instead of showing a seam where their independent offsets don't match.
  _ts(x, y, w, h, key, depth = 0) {
    let sp;
    if (typeof key === 'number') {
      sp = this.add.tileSprite(x, y, w, h, 'tileset-neighborhood', key);
    } else {
      sp = this.add.tileSprite(x, y, w, h, key);
      // World-anchor: tilePositionX = spriteLeft % 128, same for Y
      const sl = x - w / 2, st = y - h / 2;
      sp.setTilePosition(sl % 128, st % 128);
    }
    return sp.setDepth(depth);
  }

  _buildLake() {
    const worldH = MAP_ROWS * T;
    // Left water strip (col 0-8, full height) — Lake Wylie inlet / marina
    this._ts(4 * T,       worldH / 2, 8 * T, worldH, 'tex-water');
    this._ts(8 * T + T/2, worldH / 2, 2 * T, worldH, 'tex-water-lt');
    this._ts(9 * T + T/2, worldH / 2, T,     worldH, 'tex-shore');

    // South water strip (col 1-109, rows 152-160)
    this._ts(55 * T, 156 * T, 109 * T, 8 * T, 'tex-water');
    this._ts(55 * T, 152 * T, 109 * T, T,     'tex-water-lt');
    this._ts(55 * T, 151 * T, 109 * T, T,     'tex-shore');

    txt(this, 2 * T,  80 * T, 'LAKE\nWYLIE',    { fontSize: '8px', color: '#7cc8e8' });
    txt(this, 30 * T, 156 * T, 'LAKE WYLIE',     { fontSize: '8px', color: '#7cc8e8' });
    txt(this, 2 * T,  10 * T,  'TEGA CAY\nMARINA', { fontSize: '8px', color: '#4db8e8' });
  }

  // Returns true if a chunk at (c,r) overlaps any road (i.e. is walkable).
  _isRoadChunk(c, r, step) {
    // Left water strip (col 0-9)
    if (c + step <= 10) return false;
    // South water is ONLY the left portion (cols 0-110, rows 151+). The right
    // side of the bottom band is dry land carrying the southern roads (37/38/39/40),
    // so we must NOT blanket-wall all of rows 151+ — that made those roads
    // un-rideable even though they render as asphalt.
    if (c + step <= 110 && r + step > 151) return false;

    // Drivable off-road POCKETS (2D): Runde Park + the golf course. Opening these
    // turns two dead decorations into playgrounds — the park is a safe deer-combo
    // pocket, the golf course a treasure zone guarded by golf-ball fire.
    // [col, row, w, h] in tiles. Park widened east to meet Windward; golf down to Tega Cay Dr.
    for (const [pc, pr, pw, ph] of DRIVABLE_POCKETS) {
      if (c < pc + pw && c + step > pc && r < pr + ph && r + step > pr) return true;
    }

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
      // Keep the drivable pockets (park + golf fairways) clear of trees so they stay rideable.
      for (const [pc, pr, pw, ph] of DRIVABLE_POCKETS) {
        if (c >= pc && c < pc + pw && r >= pr && r < pr + ph) return true;
      }
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

    // Runde Park + golf course (drivable pockets)
    this.add.rectangle(
      MM_X + PARK_C * T * sx + (PARK_W * T * sx) / 2,
      MM_Y + PARK_R * T * sy + (PARK_H * T * sy) / 2,
      PARK_W * T * sx, PARK_H * T * sy, 0x1e7a1e
    ).setScrollFactor(0).setDepth(51);
    this.add.rectangle(
      MM_X + 220 * T * sx + (70 * T * sx) / 2,
      MM_Y + 0 * T * sy + (46 * T * sy) / 2,
      70 * T * sx, 46 * T * sy, 0x2f7a3a
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

    // Act 2 exit — the objective. A pulsing gold star so the player can see
    // where to head to leave town for the Donut House.
    if (this._exitX != null && this._exitY != null) {
      const ex = MM_X + this._exitX * sx, ey = MM_Y + this._exitY * sy;
      const exitStar = this.add.star(ex, ey, 5, 2, 4, 0xf5e642)
        .setScrollFactor(0).setDepth(53);
      this.tweens.add({
        targets: exitStar, scale: { from: 0.7, to: 1.35 },
        yoyo: true, repeat: -1, duration: 650, ease: 'Sine.InOut',
      });
    }

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
