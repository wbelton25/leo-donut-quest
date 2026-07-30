// BootArcadeScene — loads only what Donut Rain needs, then starts the loop.
//
// The collectibles and most hazards are drawn from Phaser primitives (see
// FallingItem), so the only real assets are Leo's sprite and a boss face for the
// invader beat. Everything is guarded by textures.exists() downstream, so a
// missing file degrades to a drawn stand-in instead of crashing.

import Phaser from 'phaser';

export const K_LEO = 'sprite-leo';

export default class BootArcadeScene extends Phaser.Scene {
  constructor() {
    super('BootArcadeScene');
  }

  preload() {
    // A brief "loading" note in case the font/atlas take a moment on a phone.
    this.add.text(this.scale.width / 2, this.scale.height / 2, 'loading…', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
    }).setOrigin(0.5);

    // Leo: the same walk atlas the adventure uses (frames like 'down-1').
    this.load.atlas(K_LEO, 'assets/sprites/leo.png', 'assets/sprites/leo.json');

    // Boss invader faces — dialogue headshots. Any that 404 fall back to a shape.
    this.load.image('head-grace',     'assets/sprites/grace_head.png');
    this.load.image('head-nora',      'assets/sprites/nora_head.png');
    this.load.image('head-max',       'assets/sprites/max_head.png');
    this.load.image('head-justinmax', 'assets/sprites/justin_max_head.png');
    this.load.image('head-edie',      'assets/sprites/edie_head.png');

    // Each boss's signature weapon, rained down during their invasion.
    this.load.image('sprite-pool-noodle', 'assets/sprites/pool_noodle.png');
    this.load.image('sprite-soccer-ball', 'assets/sprites/soccer_ball.png');
    this.load.image('sprite-football',    'assets/sprites/football.png');
    this.load.image('sprite-baseball',    'assets/sprites/baseball.png');

    // Audio — reused from the adventure. A 404 just makes that one cue silent.
    this.load.audio('music-loop', 'assets/audio/music/music_level_loop.wav');
    this.load.audio('music-boss', 'assets/audio/music/music_boss.wav');
    this.load.audio('sfx-bike-hit', 'assets/audio/sfx/sfx_bike_hit.mp3');
    this.load.audio('sfx-girly-grace', 'assets/audio/sfx/sfx_girly_grace.mp3');
    this.load.audio('sfx-girly-nora',  'assets/audio/sfx/sfx_girly_nora.mp3');
    this.load.audio('sfx-girly-edie',  'assets/audio/sfx/sfx_girly_edie.mp3');
    this.load.audio('sfx-coyote-max',  'assets/audio/sfx/sfx_coyote_max_baseball.mp3');
    for (let n = 1; n <= 4; n++) this.load.audio(`sfx-deer-grunt-${n}`, `assets/audio/sfx/sfx_deer_grunt_${n}.wav`);
    for (let n = 1; n <= 6; n++) this.load.audio(`sfx-fart-${n}`, `assets/audio/sfx/sfx_fart_${n}.wav`);
  }

  create() {
    // Text resolution for a crisp pixel font at whatever DPR the phone reports.
    // (The adventure's TEXT_RES constant is derived for its 270px landscape base;
    // here we key off devicePixelRatio directly, clamped to a sane range.)
    this.registry.set('textRes', Phaser.Math.Clamp(Math.ceil(window.devicePixelRatio || 1), 2, 4));

    // Start the loop once the web font is ready, so the first frame isn't drawn
    // with fallback glyphs. A single-shot guard means whichever fires first —
    // the font promise or the 1.5s safety net — wins, and the other is ignored.
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      this.scene.start('DonutRainScene');
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.load('10px "Press Start 2P"').then(start).catch(start);
      this.time.delayedCall(1500, start); // safety net if the font hangs
    } else {
      start();
    }
  }
}
