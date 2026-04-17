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
    this._initialsConfirmed = false;
  }

  create() {
    const cx = BASE_WIDTH / 2;
    this.add.rectangle(cx, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x0a0a1a);

    // ── Donut graphic ────────────────────────────────────────────────────────
    const dy = 20;
    this.add.circle(cx, dy, 12, 0xf5a623);
    this.add.circle(cx, dy, 5, 0x0a0a1a);
    const sc = [0xff4444, 0x44ff44, 0x4444ff, 0xff44ff, 0x44ffff];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.add.rectangle(cx + Math.cos(a) * 9, dy + Math.sin(a) * 9, 4, 2, sc[i % 5]).setRotation(a);
    }

    // ── Title ────────────────────────────────────────────────────────────────
    txt(this, cx, 40, 'YOU GOT THE DONUTS!', { fontSize: '12px', color: '#f5a623' }).setOrigin(0.5);
    txt(this, cx, 58, 'MISSION ACCOMPLISHED', { fontSize: '8px',  color: '#88ff88' }).setOrigin(0.5);

    // ── Score breakdown (calculated now, saved after initials) ───────────────
    this._score = ScoreSystem.calculate({ donuts: this._donuts, party: this._party });

    if (this._donuts < 1) {
      txt(this, cx, 72, 'NO DONUTS — NO SCORE', { fontSize: '8px', color: '#ff4444' }).setOrigin(0.5);
    } else {
      const crewPts  = this._party.length * 100;
      const donPts   = this._donuts * 20;
      txt(this, cx, 72, `CREW: ${this._party.length} × 100 = ${crewPts}`, { fontSize: '8px', color: '#aaaaaa' }).setOrigin(0.5);
      txt(this, cx, 84, `DONUTS: ${this._donuts} × 20 = ${donPts}`, { fontSize: '8px', color: '#aaaaaa' }).setOrigin(0.5);
      txt(this, cx, 96, `TOTAL: ${this._score} PTS`, { fontSize: '8px', color: '#f5e642' }).setOrigin(0.5);
    }

    // ── Party members ────────────────────────────────────────────────────────
    const NAMES = { warren: 'Warren', mj: 'MJ', carson: 'Carson', justin: 'Justin' };
    if (this._party.length > 0) {
      const names = this._party.map(id => NAMES[id] ?? id).join(', ');
      txt(this, cx, 110, `WITH: ${names}`, { fontSize: '8px', color: '#778899' }).setOrigin(0.5);
    }

    // ── Divider ──────────────────────────────────────────────────────────────
    this.add.rectangle(cx, 122, BASE_WIDTH - 80, 1, 0x334455);

    // ── Credits — right-align label, left-align value at center ─────────────
    const credits = [
      { label: 'STORY & DESIGN', value: 'Leo W.'        },
      { label: 'DEVELOPMENT',    value: 'Claude + Leo'  },
      { label: 'SETTING',        value: 'Tega Cay, SC'  },
      { label: 'DONUTS',         value: 'Donut House'   },
    ];
    credits.forEach((c, i) => {
      const cy2 = 130 + i * 12;
      txt(this, cx - 8, cy2, c.label, { fontSize: '8px', color: '#445566' }).setOrigin(1, 0);
      txt(this, cx + 8, cy2, c.value, { fontSize: '8px', color: '#aaccee' }).setOrigin(0, 0);
    });
    // last row at y=130+3×12=166

    // ── Divider ──────────────────────────────────────────────────────────────
    this.add.rectangle(cx, 172, BASE_WIDTH - 80, 1, 0x334455);

    // ── Initials entry ───────────────────────────────────────────────────────
    this._buildInitialsUI(cx);
  }

  // ── Initials entry UI ─────────────────────────────────────────────────────

  _buildInitialsUI(cx) {
    txt(this, cx, 180, 'ENTER YOUR INITIALS', { fontSize: '8px', color: '#4fc3f7' }).setOrigin(0.5);

    this._initials = ['A', 'A', 'A'];
    this._cursor   = 0;
    this._ilBoxes  = [];

    const boxW = 28, boxH = 26, gap = 14;
    const totalW = 3 * boxW + 2 * gap;
    const startX = cx - totalW / 2;

    for (let i = 0; i < 3; i++) {
      const bx = startX + i * (boxW + gap) + boxW / 2;
      const by = 202;
      const bg = this.add.rectangle(bx, by, boxW, boxH, 0x112233).setStrokeStyle(1, 0x334455);
      const lt = txt(this, bx, by, 'A', { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
      this._ilBoxes.push({ bg, lt, bx, by });
    }
    this._refreshBoxes();

    txt(this, cx, 220, 'UP/DN CHANGE   LT/RT MOVE   ENTER CONFIRM',
      { fontSize: '8px', color: '#445566' }).setOrigin(0.5);

    this.input.keyboard.on('keydown', (e) => this._handleInitialsKey(e));
  }

  _handleInitialsKey(e) {
    if (this._initialsConfirmed) return;
    const KC = Phaser.Input.Keyboard.KeyCodes;
    switch (e.keyCode) {
      case KC.UP:
        this._initials[this._cursor] = this._shiftLetter(this._initials[this._cursor], 1);
        this._refreshBoxes(); break;
      case KC.DOWN:
        this._initials[this._cursor] = this._shiftLetter(this._initials[this._cursor], -1);
        this._refreshBoxes(); break;
      case KC.LEFT:
        this._cursor = (this._cursor + 2) % 3;
        this._refreshBoxes(); break;
      case KC.RIGHT:
        this._cursor = (this._cursor + 1) % 3;
        this._refreshBoxes(); break;
      case KC.ENTER:
      case KC.SPACE:
        this._confirmInitials(); break;
    }
  }

  _shiftLetter(ch, dir) {
    const code = ch.charCodeAt(0) + dir;
    if (code > 90) return 'A';
    if (code < 65) return 'Z';
    return String.fromCharCode(code);
  }

  _refreshBoxes() {
    this._ilBoxes.forEach(({ bg, lt }, i) => {
      const active = i === this._cursor;
      bg.setFillStyle(active ? 0x1a3a6a : 0x112233);
      bg.setStrokeStyle(1, active ? 0x4488ff : 0x334455);
      lt.setText(this._initials[i]).setColor(active ? '#f5e642' : '#cccccc');
    });
  }

  _confirmInitials() {
    if (this._initialsConfirmed) return;
    this._initialsConfirmed = true;

    const initials = this._initials.join('');
    ScoreSystem.saveScore({ donuts: this._donuts, party: this._party, initials });
    const rank = ScoreSystem.getRank(this._score);

    // Flash boxes green
    this._ilBoxes.forEach(({ bg }) => bg.setFillStyle(0x1a4a1a).setStrokeStyle(1, 0x44cc44));
    this.input.keyboard.off('keydown');

    const cx = BASE_WIDTH / 2;

    // Rank announcement
    if (rank) {
      const rankTxt = rank === 1
        ? 'NEW HIGH SCORE!'
        : `RANK #${rank} ON YOUR BOARD`;
      const rankColor = rank === 1 ? '#ffdd00' : '#aaaaaa';
      txt(this, cx, 236, rankTxt, { fontSize: '8px', color: rankColor }).setOrigin(0.5);
    }

    // Continue prompt
    this.time.delayedCall(600, () => {
      const prompt = txt(this, cx, 252, 'PRESS SPACE TO CONTINUE', {
        fontSize: '8px', color: '#f5e642',
      }).setOrigin(0.5);
      this.tweens.add({ targets: prompt, alpha: 0.1, yoyo: true, repeat: -1, duration: 600 });

      this.input.keyboard.once('keydown-SPACE', () => this._restart());
      this.input.once('pointerdown', () => this._restart());
    });
  }

  _restart() {
    SaveSystem.deleteSave();
    this.cameras.main.fade(400, 0, 0, 0);
    this.time.delayedCall(420, () => this.scene.start(SCENE_TITLE));
  }
}
