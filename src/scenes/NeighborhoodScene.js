import { SCENE_NEIGHBORHOOD, BASE_WIDTH, BASE_HEIGHT, TILE_SIZE } from '../constants.js';
import Player from '../entities/Player.js';

// NeighborhoodScene: the open-world hub for Act 1.
// Phase 1: placeholder tile grid + player movement + camera.
// Phase 3: replace with real Tiled tilemap and friend house interactables.
export default class NeighborhoodScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_NEIGHBORHOOD });
  }

  create() {
    // ── Placeholder world ─────────────────────────────────────────────────────
    // In Phase 3 this becomes a real Tiled tilemap.
    // For now: a grass-green ground with some gray wall blocks to collide with.
    const MAP_COLS = 40;
    const MAP_ROWS = 30;
    const worldWidth = MAP_COLS * TILE_SIZE;
    const worldHeight = MAP_ROWS * TILE_SIZE;

    // Ground - fill entire world with grass tiles (simple rectangles)
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const color = (row + col) % 2 === 0 ? 0x2d5a1b : 0x336b20;
        this.add.rectangle(
          col * TILE_SIZE + TILE_SIZE / 2,
          row * TILE_SIZE + TILE_SIZE / 2,
          TILE_SIZE - 1,
          TILE_SIZE - 1,
          color
        );
      }
    }

    // ── Static obstacle blocks ────────────────────────────────────────────────
    // These are placeholder walls. In Phase 3 collision comes from the Tiled map.
    this._walls = this.physics.add.staticGroup();
    const wallData = [
      // [col, row, widthInTiles, heightInTiles]
      [0, 0, MAP_COLS, 1],         // top border
      [0, MAP_ROWS - 1, MAP_COLS, 1], // bottom border
      [0, 0, 1, MAP_ROWS],         // left border
      [MAP_COLS - 1, 0, 1, MAP_ROWS], // right border
      [5, 3, 4, 3],                // Warren's house placeholder
      [15, 5, 4, 3],               // MJ's house placeholder
      [8, 14, 4, 3],               // Carsen's house placeholder
      [22, 10, 4, 3],              // Justin's house placeholder
    ];

    wallData.forEach(([col, row, w, h]) => {
      const rect = this.add.rectangle(
        col * TILE_SIZE + (w * TILE_SIZE) / 2,
        row * TILE_SIZE + (h * TILE_SIZE) / 2,
        w * TILE_SIZE,
        h * TILE_SIZE,
        0x8b7355
      );
      this.physics.add.existing(rect, true); // true = static body
      this._walls.add(rect);
    });

    // ── Road strips (visual only for now) ─────────────────────────────────────
    this.add.rectangle(
      worldWidth / 2, 10 * TILE_SIZE,
      worldWidth, 2 * TILE_SIZE,
      0x555555
    ).setDepth(-1);

    // ── Player ────────────────────────────────────────────────────────────────
    // Starts near Leo's house (bottom-left area of the map)
    this._player = new Player(this, 3 * TILE_SIZE, 22 * TILE_SIZE);

    // Collide player with the wall blocks
    this.physics.add.collider(this._player, this._walls);

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this._player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(40, 30);

    // ── Debug label ───────────────────────────────────────────────────────────
    // Shows current zone name; will be replaced with proper UI in Phase 3
    this._debugText = this.add.text(4, 20, 'ACT 1 - NEIGHBORHOOD', {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: '#ffffff',
    }).setScrollFactor(0); // stays fixed on screen (not scrolling with camera)
  }

  update() {
    this._player.update();
  }
}
