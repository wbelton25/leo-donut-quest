import {
  SCENE_REPORT_CARD, SCENE_CREDITS, BASE_WIDTH, BASE_HEIGHT, txt, MUSIC_CREDITS,
} from '../constants.js';
import ScoreSystem from '../systems/ScoreSystem.js';
import AudioManager from '../systems/AudioManager.js';
import BadgeSystem from '../systems/BadgeSystem.js';

// ReportCardScene: the end-of-run payoff. Grades the whole run (donuts, crew kept,
// time to spare, deer toppled, best fart combo) into a big S/A/B/C/D and shows the
// point breakdown, then hands off to the credits + leaderboard.

const GRADE_TONE = {
  S: { color: '#ffdd33', word: 'LEGENDARY DELIVERY' },
  A: { color: '#66dd66', word: 'GREAT RUN' },
  B: { color: '#4fc3f7', word: 'SOLID DELIVERY' },
  C: { color: '#ffa04d', word: 'YOU MADE IT' },
  D: { color: '#ff6666', word: 'BARELY MADE IT' },
};

export default class ReportCardScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_REPORT_CARD });
  }

  init(data) {
    this._party  = data?.party  ?? [];
    this._donuts = data?.donuts ?? 0;
    this._time   = data?.resources?.time ?? 0;
    const gs = this.game.registry.get('gameState') ?? {};
    this._deer  = gs.deerToppled ?? 0;
    this._combo = gs.bestCombo   ?? 0;
  }

  create() {
    AudioManager.playMusic(this, MUSIC_CREDITS);
    const cx = BASE_WIDTH / 2;
    this.add.rectangle(cx, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x0a0a16);

    const stats = { donuts: this._donuts, party: this._party, time: this._time, deer: this._deer, combo: this._combo };
    this._stats = stats;
    this._score = ScoreSystem.calculate(stats);
    this._grade = ScoreSystem.grade(this._score);
    const tone  = GRADE_TONE[this._grade];

    // ── Header ────────────────────────────────────────────────────────────────
    txt(this, cx, 12, 'MISSION REPORT', { fontSize: '12px', color: '#f5a623' }).setOrigin(0.5);
    txt(this, cx, 30, this._donuts > 0 ? 'YOU DELIVERED THE DONUTS!' : 'NO DONUTS DELIVERED...', {
      fontSize: '8px', color: this._donuts > 0 ? '#88ff88' : '#ff6666',
    }).setOrigin(0.5);

    // ── Grade badge ──────────────────────────────────────────────────────────
    const gy = 66;
    this.add.circle(cx, gy, 30, 0x12121f).setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(tone.color).color);
    const letter = txt(this, cx, gy, this._grade, { fontSize: '32px', color: tone.color }).setOrigin(0.5);
    txt(this, cx, gy + 40, tone.word, { fontSize: '8px', color: tone.color }).setOrigin(0.5);

    // Little pop on the grade for satisfaction — starts big so it's always visible.
    letter.setScale(1.6);
    this.tweens.add({ targets: letter, scale: 1, duration: 450, ease: 'Back.Out', delay: 150 });

    // ── Point breakdown ─────────────────────────────────────────────────────
    const rows = ScoreSystem.breakdown(stats);
    let y = 120;
    rows.forEach((r) => {
      txt(this, 66,  y, r.label,  { fontSize: '8px', color: '#aab' }).setOrigin(0, 0.5);
      txt(this, 300, y, r.detail, { fontSize: '8px', color: '#667788' }).setOrigin(0.5, 0.5);
      txt(this, 414, y, `${r.pts}`, { fontSize: '8px', color: r.pts > 0 ? '#dde' : '#556' }).setOrigin(1, 0.5);
      y += 15;
    });

    // ── Total ────────────────────────────────────────────────────────────────
    this.add.rectangle(cx, y + 2, BASE_WIDTH - 120, 1, 0x334455);
    y += 12;
    txt(this, 66, y, 'TOTAL SCORE', { fontSize: '8px', color: '#f5e642' }).setOrigin(0, 0.5);
    txt(this, 414, y, `${this._score} PTS`, { fontSize: '8px', color: '#f5e642' }).setOrigin(1, 0.5);

    // ── Continue ────────────────────────────────────────────────────────────
    const prompt = txt(this, cx, 252, 'PRESS SPACE', { fontSize: '8px', color: '#f5e642' }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.15, yoyo: true, repeat: -1, duration: 600, delay: 700 });

    // ── Replay badges (Phase R) — award after the grade pop so toasts don't clash ──
    this.time.delayedCall(900, () => {
      const gs = this.game.registry.get('gameState') ?? {};
      BadgeSystem.awardAndToast(this, 'first_delivery');
      if (this._grade === 'S')     BadgeSystem.awardAndToast(this, 's_rank');
      if (gs.crewWasWornOut)       BadgeSystem.awardAndToast(this, 'survivor');
    });

    // Small delay so a mashed key from the boss fight doesn't skip instantly.
    this.time.delayedCall(700, () => {
      this.input.keyboard.once('keydown-SPACE', () => this._toCredits());
      this.input.keyboard.once('keydown-ENTER', () => this._toCredits());
      this.input.once('pointerdown', () => this._toCredits());
    });
  }

  _toCredits() {
    this.cameras.main.fade(350, 0, 0, 0);
    this.time.delayedCall(360, () => {
      this.scene.start(SCENE_CREDITS, { ...this._stats, score: this._score });
    });
  }
}
