import { SCENE_PRELOAD, SCENE_TITLE, MAP_TEST, BASE_WIDTH, BASE_HEIGHT } from '../constants.js';

// PreloadScene: loads all game assets and shows a loading progress bar.
// Once everything is loaded, it starts TitleScene.
export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_PRELOAD });
  }

  preload() {
    this._createLoadingBar();

    // ── Test map (Phase 1 placeholder) ────────────────────────────────────────
    // In Phase 3 this will load the real neighborhood tilemap from Tiled.
    // For now we load a tiny inline map built in create() using graphics.
    // Real asset loads look like:
    //   this.load.tilemapTiledJSON(MAP_TEST, '/src/maps/test-map.json');
    //   this.load.image(TILESET_NEIGHBORHOOD, '/src/assets/tilesets/neighborhood-tiles.png');

    // Wire up load progress events to update the bar
    this.load.on('progress', (value) => {
      if (this._bar) this._bar.scaleX = value;
    });
  }

  create() {
    this.scene.start(SCENE_TITLE);
  }

  _createLoadingBar() {
    const cx = BASE_WIDTH / 2;
    const cy = BASE_HEIGHT / 2;

    // Background box
    this.add.rectangle(cx, cy - 10, 200, 12, 0x333333);
    // Progress bar (starts at scaleX = 0, grows to 1 as assets load)
    this._bar = this.add.rectangle(cx - 98, cy - 10, 196, 8, 0xf5a623).setOrigin(0, 0.5);
    this._bar.scaleX = 0;

    this.add.text(cx, cy + 10, 'Loading...', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffffff',
    }).setOrigin(0.5);
  }
}
