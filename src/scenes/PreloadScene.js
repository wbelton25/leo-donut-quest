import { SCENE_PRELOAD, SCENE_TITLE, BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_PRELOAD });
  }

  preload() {
    this._createLoadingBar();
    this.load.on('progress', (value) => {
      if (this._bar) this._bar.scaleX = value;
    });

    // Single source-of-truth map: roads, houses, friend zones, obstacles, exit
    this.load.json('neighborhood-map', 'maps/neighborhood_map.json');

    // ── Sprite atlases (Aseprite PNG + JSON export) ───────────────────────────
    // Files go in src/assets/sprites/<id>.png + <id>.json.
    // Missing files log a 404 warning but do NOT crash — entities fall back to
    // colored rectangles automatically via scene.textures.exists() checks.
    //
    // Frame naming convention expected from Aseprite:
    //   down-0, down-1, down-2, up-0, up-1, up-2, left-0..., right-0...
    //
    // Character walk sprites (32×32 px, 12 frames each: 4 dirs × 3 walk frames)
    ['leo', 'warren', 'mj', 'carson', 'justin'].forEach(id => {
      this.load.atlas(`sprite-${id}`, `assets/sprites/${id}.png`, `assets/sprites/${id}.json`);
    });

    // Obstacle sprites (48×48, 12 frames: 4 dirs × 3)
    this.load.atlas('sprite-deer',      'assets/sprites/deer.png',      'assets/sprites/deer.json');
    this.load.atlas('sprite-car-red',   'assets/sprites/car-red.png',   'assets/sprites/car-red.json');
    this.load.atlas('sprite-car-blue',  'assets/sprites/car-blue.png',  'assets/sprites/car-blue.json');
    this.load.atlas('sprite-car-silver','assets/sprites/car-silver.png','assets/sprites/car-silver.json');
    this.load.atlas('sprite-car-green', 'assets/sprites/car-green.png', 'assets/sprites/car-green.json');
    this.load.atlas('sprite-golf-cart', 'assets/sprites/golf-cart.png', 'assets/sprites/golf-cart.json');
    this.load.atlas('sprite-bike',      'assets/sprites/bike.png',      'assets/sprites/bike.json');

    // Boss sprites (32×32 px — idle, attack, hit frames; exact frame names TBD)
    ['grace', 'max', 'nora'].forEach(id => {
      this.load.atlas(`sprite-${id}-boss`, `assets/sprites/${id}_boss.png`, `assets/sprites/${id}_boss.json`);
    });

    // World tileset — 16×16 tiles used for single-tile decorations (trees, houses, etc.)
    this.load.spritesheet('tileset-neighborhood',
      'assets/tilesets/neighborhood.png',
      { frameWidth: 16, frameHeight: 16 }
    );

    // Seamless 128×128 surface textures — used for large tileSprite fills
    ['grass', 'park', 'golf', 'road', 'sidewalk', 'water', 'water-lt', 'shore']
      .forEach(id => this.load.image(`tex-${id}`, `assets/textures/${id}.png`));

    // RGBA road edge strips — transparent on grass side, opaque road on other side.
    // Placed straddling each road boundary to replace the hard rectangular edge
    // with an organic noise-driven profile.
    this.load.image('tex-road-edge-h', 'assets/textures/road-edge-h.png');
    this.load.image('tex-road-edge-v', 'assets/textures/road-edge-v.png');
  }

  create() {
    // Wait for the Press Start 2P font to finish loading before showing the title screen.
    // document.fonts.ready resolves once all @font-face fonts are loaded.
    document.fonts.ready.then(() => {
      this.scene.start(SCENE_TITLE);
    });
  }

  _createLoadingBar() {
    const cx = BASE_WIDTH / 2;
    const cy = BASE_HEIGHT / 2;

    this.add.rectangle(cx, cy - 10, 200, 12, 0x333333);
    this._bar = this.add.rectangle(cx - 98, cy - 10, 196, 8, 0xf5a623).setOrigin(0, 0.5);
    this._bar.scaleX = 0;

    txt(this, cx, cy + 10, 'Loading...').setOrigin(0.5);
  }
}
