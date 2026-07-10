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
      // Headshot crop of the front-facing frame, for the dialogue-box portrait.
      this.load.image(`head-${id}`, `assets/sprites/${id}_head.png`);
    });

    // World sprites — tree and house (extracted from tileset reference)
    this.load.image('sprite-tree',  'assets/sprites/tree.png');
    this.load.image('sprite-house', 'assets/sprites/house.png');

    // Boss character + weapon sprites (AI-generated, replaced from rectangles).
    // Missing files 404 harmlessly — each boss falls back to its drawn rectangle.
    this.load.image('sprite-grace-char',      'assets/sprites/grace.png');
    this.load.image('sprite-pool-noodle',     'assets/sprites/pool_noodle.png');
    this.load.image('sprite-nora-char',       'assets/sprites/nora.png');
    this.load.image('sprite-max-char',        'assets/sprites/max.png');
    this.load.image('sprite-justin-max-char', 'assets/sprites/justin_max.png');
    this.load.image('sprite-edie-char',       'assets/sprites/edie.png');
    this.load.image('sprite-leo-foot',        'assets/sprites/leo_foot.png');
    this.load.image('sprite-soccer-ball',     'assets/sprites/soccer_ball.png');
    this.load.image('sprite-baseball',        'assets/sprites/baseball.png');
    this.load.image('sprite-football',        'assets/sprites/football.png');
    this.load.image('sprite-golfball',        'assets/sprites/golfball.png');
    // Golfer swing sheet: 8 uniform frames (0-3 swing, 4-7 idle)
    this.load.spritesheet('sprite-golfer', 'assets/sprites/golfer.png', { frameWidth: 196, frameHeight: 248 });

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

    // Boss arena backgrounds (480×270). Missing files 404 harmlessly — the scene
    // falls back to its procedural arena via this.textures.exists() checks.
    this.load.image('bg-grace',      'assets/backgrounds/grace_pool.png');
    this.load.image('bg-nora',       'assets/backgrounds/nora_boss_level.png');
    this.load.image('bg-max',        'assets/backgrounds/max_football.png');
    this.load.image('bg-justin-max', 'assets/backgrounds/justin_max_baseball.png');
    this.load.image('bg-edie',       'assets/backgrounds/edie_livingroom.png');

    // Seamless 128×128 surface textures — used for large tileSprite fills
    ['grass', 'park', 'golf', 'road', 'sidewalk', 'water', 'water-lt', 'shore']
      .forEach(id => this.load.image(`tex-${id}`, `assets/textures/${id}.png`));

    // Road edge strips — sandy curb, transparent on grass side, only at grass boundaries.
    this.load.image('tex-road-edge-h',  'assets/textures/road-edge-h.png');
    this.load.image('tex-road-edge-v',  'assets/textures/road-edge-v.png');
    this.load.image('tex-road-corner',  'assets/textures/road-corner.png');

    // ── Music ────────────────────────────────────────────────────────────────────
    this.load.audio('music-title',              'assets/audio/music/music_intro.wav');
    this.load.audio('music-neighborhood-intro', 'assets/audio/music/music_level_intro.wav');
    this.load.audio('music-neighborhood-loop',  'assets/audio/music/music_level_loop.wav');
    this.load.audio('music-boss',               'assets/audio/music/music_boss.wav');
    this.load.audio('music-credits',            'assets/audio/music/music_credits.wav');

    // ── SFX ──────────────────────────────────────────────────────────────────────
    [1, 2, 3, 4].forEach(n =>
      this.load.audio(`sfx-deer-grunt-${n}`, `assets/audio/sfx/sfx_deer_grunt_${n}.wav`)
    );
    this.load.audio('sfx-coyote-max-baseball', 'assets/audio/sfx/sfx_coyote_max_baseball.mp3');
    this.load.audio('sfx-coyote-max-mj',       'assets/audio/sfx/sfx_coyote_max_mj.mp3');
    this.load.audio('sfx-girly-grace', 'assets/audio/sfx/sfx_girly_grace.mp3');
    this.load.audio('sfx-girly-nora',  'assets/audio/sfx/sfx_girly_nora.mp3');
    this.load.audio('sfx-girly-edie',  'assets/audio/sfx/sfx_girly_edie.mp3');
    this.load.audio('sfx-splash',          'assets/audio/sfx/sfx_splash.wav');
    this.load.audio('sfx-car-hit',        'assets/audio/sfx/sfx_car_hit.mp3');
    this.load.audio('sfx-golf-cart-hit',  'assets/audio/sfx/sfx_golf_cart_hit.mp3');
    this.load.audio('sfx-bike-hit',       'assets/audio/sfx/sfx_bike_hit.mp3');
    // Fart variety: sfx_fart_1..N. Bump this count when you add more files;
    // AudioManager.playFart auto-discovers whatever actually loaded.
    Array.from({ length: 20 }, (_, i) => i + 1).forEach(n =>
      this.load.audio(`sfx-fart-${n}`, `assets/audio/sfx/sfx_fart_${n}.wav`)
    );
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
