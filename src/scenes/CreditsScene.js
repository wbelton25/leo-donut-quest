import { SCENE_CREDITS, SCENE_TITLE, BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';
import SaveSystem from '../systems/SaveSystem.js';
import ScoreSystem from '../systems/ScoreSystem.js';

export default class CreditsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_CREDITS });
  }

  init(data) {
    this._party  = data?.party  ?? [];
    this._donuts = data?.donuts ?? 0;
  }

  create() {
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x0a0a1a);

    // Spinning donut
    const cx = BASE_WIDTH / 2, cy = 50;
    this.add.circle(cx, cy, 24, 0xf5a623);
    this.add.circle(cx, cy, 10, 0x0a0a1a);
    const sprinkleColors = [0xff4444, 0x44ff44, 0x4444ff, 0xff44ff, 0x44ffff];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = 17;
      this.add.rectangle(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 5, 2, sprinkleColors[i % 5])
        .setRotation(angle);
    }

    // ── Score calculation ─────────────────────────────────────────────────────
    const score = ScoreSystem.saveScore({ donuts: this._donuts, party: this._party });
    const rank  = ScoreSystem.getRank(score);

    txt(this, BASE_WIDTH / 2, 84, 'YOU GOT THE DONUTS!', {
      fontSize: '16px', color: '#f5a623',
    }).setOrigin(0.5);

    txt(this, BASE_WIDTH / 2, 102, 'MISSION ACCOMPLISHED', {
      fontSize: '8px', color: '#88ff88',
    }).setOrigin(0.5);

    // Score breakdown
    const partyCount = this._party.length + 1; // +1 for Leo
    txt(this, BASE_WIDTH / 2, 120,
      `DONUTS: ${this._donuts}  ×  CREW: ${partyCount}  ×  10  =  ${score} PTS`,
      { fontSize: '8px', color: '#f5e642' }).setOrigin(0.5);

    if (rank) {
      txt(this, BASE_WIDTH / 2, 136,
        rank === 1 ? '🏆 NEW HIGH SCORE!' : `RANK #${rank} ON YOUR BOARD`,
        { fontSize: '8px', color: rank === 1 ? '#ffdd00' : '#aaaaaa' }).setOrigin(0.5);
    }

    // Party members
    const NAMES = { warren: 'Warren', mj: 'MJ', carson: 'Carson', justin: 'Justin' };
    if (this._party.length > 0) {
      const names = this._party.map(id => NAMES[id] ?? id).join(', ');
      txt(this, BASE_WIDTH / 2, 152, `WITH: ${names}`, {
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
      txt(this, BASE_WIDTH / 2 - 70, 168 + i * 14, c.label, {
        fontSize: '8px', color: '#445566',
      });
      txt(this, BASE_WIDTH / 2 + 10, 168 + i * 14, c.value, {
        fontSize: '8px', color: '#aaccee',
      });
    });

    const prompt = txt(this, BASE_WIDTH / 2, BASE_HEIGHT - 12, 'PRESS SPACE TO PLAY AGAIN', {
      fontSize: '8px', color: '#f5e642',
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.1, yoyo: true, repeat: -1, duration: 600 });

    this.input.keyboard.once('keydown-SPACE', () => this._restart());
    this.input.once('pointerdown', () => this._restart());
  }

  _restart() {
    SaveSystem.deleteSave();
    this.cameras.main.fade(400, 0, 0, 0);
    this.time.delayedCall(420, () => this.scene.start(SCENE_TITLE));
  }
}
