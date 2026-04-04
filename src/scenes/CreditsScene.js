import { SCENE_CREDITS, SCENE_TITLE, BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';
import SaveSystem from '../systems/SaveSystem.js';

// CreditsScene: shown after ordering donuts at Donut House.
// Displays a victory message and scrolling credits, then returns to title.

export default class CreditsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_CREDITS });
  }

  init(data) {
    this._party = data?.party ?? [];
  }

  create() {
    // Dark background
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x0a0a1a);

    // Donut graphic — big celebratory donut
    const cx = BASE_WIDTH / 2, cy = 60;
    this.add.circle(cx, cy, 28, 0xf5a623);
    this.add.circle(cx, cy, 12, 0x0a0a1a);
    // Sprinkles
    const sprinkleColors = [0xff4444, 0x44ff44, 0x4444ff, 0xff44ff, 0x44ffff];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = 20;
      this.add.rectangle(
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r,
        5, 2, sprinkleColors[i % sprinkleColors.length]
      ).setRotation(angle);
    }

    // Spin the donut
    const donutGroup = this.add.container(cx, cy, []);
    this.tweens.add({ targets: donutGroup, angle: 360, duration: 4000, repeat: -1 });

    // Victory text
    txt(this, BASE_WIDTH / 2, 100, 'YOU GOT THE DONUTS!', {
      fontSize: '16px', color: '#f5a623',
    }).setOrigin(0.5);

    txt(this, BASE_WIDTH / 2, 122, 'MISSION ACCOMPLISHED', {
      fontSize: '8px', color: '#88ff88',
    }).setOrigin(0.5);

    // Party thanks
    const MEMBER_NAMES = { warren: 'Warren', mj: 'MJ', carson: 'Carson', justin: 'Justin' };
    if (this._party.length > 0) {
      const names = this._party.map(id => MEMBER_NAMES[id] ?? id).join(', ');
      txt(this, BASE_WIDTH / 2, 140, `With: ${names}`, {
        fontSize: '8px', color: '#aaaaaa',
      }).setOrigin(0.5);
    }

    // Credits
    const credits = [
      { label: 'STORY & DESIGN',  value: 'Leo W.' },
      { label: 'DEVELOPMENT',     value: 'Claude + Leo' },
      { label: 'SETTING',         value: 'Tega Cay, SC' },
      { label: 'DONUTS',          value: 'Donut House' },
    ];
    credits.forEach((c, i) => {
      txt(this, BASE_WIDTH / 2 - 60, 162 + i * 16, c.label, {
        fontSize: '8px', color: '#556677',
      });
      txt(this, BASE_WIDTH / 2 + 10, 162 + i * 16, c.value, {
        fontSize: '8px', color: '#aaccee',
      });
    });

    // Flash prompt
    const prompt = txt(this, BASE_WIDTH / 2, BASE_HEIGHT - 16, 'PRESS SPACE TO PLAY AGAIN', {
      fontSize: '8px', color: '#f5e642',
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.1, yoyo: true, repeat: -1, duration: 600 });

    // Space / click to restart
    this.input.keyboard.once('keydown-SPACE', () => this._restart());
    this.input.once('pointerdown', () => this._restart());
  }

  _restart() {
    SaveSystem.deleteSave();
    this.cameras.main.fade(400, 0, 0, 0);
    this.time.delayedCall(420, () => this.scene.start(SCENE_TITLE));
  }
}
