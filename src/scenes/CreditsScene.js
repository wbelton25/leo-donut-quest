import { SCENE_CREDITS, SCENE_TITLE, BASE_WIDTH, BASE_HEIGHT, txt, MUSIC_CREDITS } from '../constants.js';
import SaveSystem from '../systems/SaveSystem.js';
import ScoreSystem from '../systems/ScoreSystem.js';
import GlobalScores from '../systems/GlobalScores.js';
import AudioManager from '../systems/AudioManager.js';
import cleanInitials from '../utils/cleanInitials.js';

export default class CreditsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_CREDITS });
  }

  init(data) {
    this._party  = data?.party  ?? [];
    this._donuts = data?.donuts ?? 0;
    this._time   = data?.time   ?? 0;
    this._deer   = data?.deer   ?? 0;
    this._combo  = data?.combo  ?? 0;
    this._passedScore = data?.score;   // the report card already totalled it
    this._initialsConfirmed = false;
  }

  create() {
    AudioManager.playMusic(this, MUSIC_CREDITS);
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

    // ── Score + grade (detailed breakdown lives on the report card) ──────────
    this._score = this._passedScore ?? ScoreSystem.calculate({
      donuts: this._donuts, party: this._party, time: this._time, deer: this._deer, combo: this._combo,
    });
    const grade = ScoreSystem.grade(this._score);
    txt(this, cx, 80, this._donuts < 1
      ? 'NO DONUTS — NO SCORE'
      : `FINAL SCORE  ${this._score}  —  GRADE ${grade}`,
      { fontSize: '8px', color: this._donuts < 1 ? '#ff4444' : '#f5e642' }).setOrigin(0.5);

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

    txt(this, cx, 220, 'TYPE LETTERS  ←→ MOVE  ENTER CONFIRM',
      { fontSize: '8px', color: '#445566' }).setOrigin(0.5);

    this.input.keyboard.on('keydown', (e) => this._handleInitialsKey(e));
  }

  _handleInitialsKey(e) {
    if (this._initialsConfirmed) return;
    const KC = Phaser.Input.Keyboard.KeyCodes;

    // Direct letter input (A–Z)
    if (e.keyCode >= 65 && e.keyCode <= 90) {
      this._initials[this._cursor] = String.fromCharCode(e.keyCode);
      this._cursor = Math.min(this._cursor + 1, 2);
      this._refreshBoxes();
      return;
    }

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
      case KC.BACKSPACE:
        this._cursor = Math.max(this._cursor - 1, 0);
        this._initials[this._cursor] = 'A';
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

    const initials = cleanInitials(this._initials.join(''));
    ScoreSystem.saveScore({
      donuts: this._donuts, party: this._party, time: this._time,
      deer: this._deer, combo: this._combo, initials, score: this._score,
    });
    const rank = ScoreSystem.getRank(this._score);

    // Fire off to the world board too. Deliberately not awaited — the local
    // board is already saved, so a slow or dead network must not hold up the
    // score screen. The world rank just fills itself in later if it arrives.
    GlobalScores.submit({
      initials, score: this._score,
      grade: ScoreSystem.grade(this._score),
      donuts: this._donuts, partySize: this._party.length,
    }).then((ok) => {
      if (!ok || !this.scene?.isActive()) return;
      return GlobalScores.rankFor(this._score).then((wr) => {
        if (!wr || !this.scene?.isActive()) return;
        txt(this, BASE_WIDTH / 2, 241,
          wr === 1 ? 'BEST IN THE WORLD!' : `#${wr} IN THE WORLD`,
          { fontSize: '8px', color: wr === 1 ? '#ffdd00' : '#88bbff' }).setOrigin(0.5);
      });
    });

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
      // 230 / 241 / 252 — local rank, world rank, continue prompt.
      txt(this, cx, 230, rankTxt, { fontSize: '8px', color: rankColor }).setOrigin(0.5);
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
