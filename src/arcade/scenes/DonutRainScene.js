import Phaser from 'phaser';
import FX from '../../systems/FX.js';
import { PIXEL_FONT } from '../../constants.js';
import ArcadeScores from '../systems/ArcadeScores.js';
import ArcadeGlobalScores from '../systems/ArcadeGlobalScores.js';
import ArcadeAudio from '../systems/ArcadeAudio.js';
import FallingItem, { GOOD_KINDS, BAD_KINDS } from '../entities/FallingItem.js';
import { K_LEO } from './BootArcadeScene.js';

// Boss roster — invaders rotate through this in order, each raining their own
// signature weapon (mirrors who throws what in the adventure).
const BOSSES = [
  { id: 'grace',     name: 'GRACE',        face: 'head-grace',     proj: 'noodle',     voice: 'sfx-girly-grace' },
  { id: 'nora',      name: 'NORA',         face: 'head-nora',      proj: 'soccerball', voice: 'sfx-girly-nora' },
  { id: 'max',       name: 'MAX',          face: 'head-max',       proj: 'football',   voice: 'sfx-coyote-max' },
  { id: 'justinmax', name: 'JUSTIN & MAX', face: 'head-justinmax', proj: 'baseball',   voice: 'sfx-coyote-max' },
  { id: 'edie',      name: 'EDIE',         face: 'head-edie',      proj: 'stuffie',    voice: 'sfx-girly-edie' },
];

// ─── Tuning — every knob for the feel lives here ────────────────────────────
const T = {
  leoScale:      1.7,
  leoBottomGap:  178,   // px from bottom to Leo's feet — raised well up so your
                        // thumb slides in the open zone BELOW him without covering him
  followRate:    14,    // Leo-follows-finger snappiness (higher = tighter)

  startInterval: 820,   // ms between spawns at t=0
  minInterval:   300,   // ms between spawns at full difficulty
  startSpeed:    150,   // px/s base fall speed at t=0
  maxSpeed:      340,   // px/s at full difficulty
  startHazard:   0.28,  // P(a spawn is a hazard) at t=0
  maxHazard:     0.50,  // P at full difficulty
  rampTime:      75,    // seconds to reach full difficulty

  catchR:        24,    // catch radius for good items (generous)
  hurtR:         19,    // hit radius for hazards (tighter = fairer near-misses)
  hearts:        3,
  invulnMs:      900,   // i-frames after a hit

  bossFirst:     250,   // score that triggers the first boss invader
  bossEvery:     400,   // score gap between subsequent invaders
  bossDurationMs:6500,  // how long the onslaught lasts
  bossBurstMs:   430,   // gap between boss-thrown hazards

  comboStep:     5,     // catches per +50% multiplier step
  comboMaxMult:  3,     // cap the combo multiplier (was unbounded → +450%)

  chargeMax:     100,   // full Fart Meter
  chargeGain:    0.7,   // meter gained per point of a caught item (hole~3.5, donut~10, golden~35)
  frenzyMs:      4500,  // Fart Frenzy duration
  frenzyMagnetK: 0.30,  // how hard good items are vacuumed to Leo during frenzy
  frenzyGraceMs: 600,   // i-frames granted as the frenzy ends
  frenzySpawnMs: 130,   // good-item spawn gap during the donut storm
};

// Weighted spawn tables.
const GOOD_WEIGHTS = { hole: 70, donut: 26, golden: 4 };
const BAD_WEIGHTS  = { pothole: 34, golfball: 30, deer: 20, car: 16 };

export default class DonutRainScene extends Phaser.Scene {
  constructor() {
    super('DonutRainScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this._W = W; this._H = H;
    this._textRes = this.registry.get('textRes') || 2;

    // ── Run state (create() reruns on restart, so this is the reset point) ──
    this.score      = 0;
    this.combo      = 0;
    this.hearts     = T.hearts;
    this.elapsed    = 0;          // seconds of play (drives difficulty ramp)
    this.items      = [];
    this.spawnAcc   = 0;
    this.over       = false;
    this.invulnUntil = 0;
    this.nextBossScore = T.bossFirst;
    this.bossActive = false;
    this.bossUntil  = 0;
    this.bossBurstAcc = 0;
    this.boss       = null;
    this.bossIndex  = 0;         // which boss invades next (cycles through BOSSES)
    this.bossProj   = 'pothole'; // current invader's signature weapon
    this.targetX    = W / 2;
    this.charge      = 0;      // Fart Meter, 0..chargeMax
    this.frenzyUntil = 0;      // time.now < this = Fart Frenzy active
    this._aura       = null;   // frenzy glow around Leo
    this._pMoved     = false;  // did the current pointer press drag? (tap vs drag)
    this._pDownT     = 0;
    this._wasReady   = false;  // Fart Meter just-filled edge, for the ready ding

    // Audio: persists across restarts via the registry so mute stays sticky and
    // we never stack two music loops. Rebind to this fresh scene instance.
    this.audio = this.registry.get('audio') || new ArcadeAudio(this);
    this.audio.scene = this;
    this.registry.set('audio', this.audio);
    this.audio.startMusic('music-loop', 0.3);
    this.events.once('shutdown', () => this.audio.stopMusic());

    this._drawBackground(W, H);

    // ── Leo ──────────────────────────────────────────────────────────────
    const leoY = H - T.leoBottomGap;
    if (this.textures.exists(K_LEO)) {
      this.leo = this.add.sprite(W / 2, leoY, K_LEO, 'down-1').setScale(T.leoScale);
    } else {
      this.leo = this.add.rectangle(W / 2, leoY, 26, 34, 0x3a6ea5);
    }
    this.leo.setDepth(10).setOrigin(0.5, 0.9);
    this._leoBaseY = leoY;
    // Miss line: an uncaught item that falls past here (just below Leo) is gone,
    // so nothing rains down over the grass/road below him.
    this._killY = leoY + 10;

    // ── HUD (all top-anchored so the thumb never covers it) ────────────────
    this.scoreText = this._txt(W / 2, 6, '0', { fontSize: '16px' }).setOrigin(0.5, 0);
    this.bestText  = this._txt(W - 8, 8, `BEST ${ArcadeScores.best()}`, { fontSize: '8px', color: '#ffe6a0' })
      .setOrigin(1, 0);
    this._heartWrap = this.add.container(0, 0).setDepth(30);
    this._renderHearts();

    // ── Fart Meter (top) — fills as you catch; tap to unleash. Up here it stays
    // visible and clear of your sliding thumb. ─────────────────────────────
    const bw = 200, bx = W / 2 - bw / 2, by = 44;
    this._chargeBarW = bw; this._chargeBarX = bx;
    this._chargeLabel = this._txt(W / 2, by - 11, 'FART METER', { fontSize: '8px', color: '#ffe6a0' }).setOrigin(0.5, 1);
    this.add.rectangle(W / 2, by, bw + 4, 12, 0x000000, 0.5).setDepth(29);
    this.add.rectangle(bx, by, bw, 8, 0x3a2a10).setOrigin(0, 0.5).setDepth(30);
    this._chargeFill = this.add.rectangle(bx, by, 0, 8, 0xffc43f).setOrigin(0, 0.5).setDepth(31);

    this.comboText = this._txt(W / 2, by + 8, '', { fontSize: '8px', color: '#ffd23f' }).setOrigin(0.5, 0);

    // Mute toggle (top-left, in the gap left of the centered meter).
    this._muteBtn = this.add.container(20, 34).setDepth(32);
    this._drawMuteIcon();

    // ── Onboarding hints (fade out) ────────────────────────────────────────
    const hint = this._txt(W / 2, H * 0.34, 'CATCH DONUTS\n\nDODGE THE JUNK', {
      fontSize: '10px', color: '#ffffff', align: 'center',
    }).setOrigin(0.5).setLineSpacing(8);
    hint.setStroke('#00000088', 4);
    this.tweens.add({ targets: hint, alpha: 0, delay: 2600, duration: 900, onComplete: () => hint.destroy() });

    // Slide-zone hint sits in the open area below Leo, teaching you to steer down
    // there instead of on top of him.
    const slideHint = this._txt(W / 2, this._leoBaseY + 44, '< SLIDE TO MOVE >', {
      fontSize: '9px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(11);
    slideHint.setStroke('#00000088', 4).setAlpha(0.8);
    this.tweens.add({ targets: slideHint, alpha: 0, delay: 3200, duration: 1000, onComplete: () => slideHint.destroy() });

    this._setupInput();
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  // DRAG = move Leo (his x follows the finger/mouse). A deliberate TAP (quick
  // press-release with no drag) unleashes the Fart Frenzy when the meter's full.
  // Separating the two gestures means moving never accidentally fires the frenzy.
  _setupInput() {
    this.input.on('pointerdown', (p) => {
      if (this.over) { this._gameOverTap(p); return; }
      if (this._inMute(p)) { this._pOnMute = true; return; } // corner tap = mute, not move/frenzy
      this._pOnMute = false;
      this._pDownT = this.time.now; this._pDownX = p.x; this._pDownY = p.y; this._pMoved = false;
    });
    this.input.on('pointermove', (p) => {
      if (this.over || this._pOnMute) return;
      if (Math.hypot(p.x - this._pDownX, p.y - this._pDownY) > 10) this._pMoved = true;
      this.targetX = p.x;
    });
    this.input.on('pointerup', () => {
      if (this.over) return;
      if (this._pOnMute) { this._pOnMute = false; this._toggleMute(); return; }
      if (!this._pMoved && this.time.now - this._pDownT < 260) this._activateFrenzy();
    });
    this.cursors = this.input.keyboard.createCursorKeys();            // desktop dev
    this.input.keyboard.on('keydown-SPACE', () => this._activateFrenzy());
    this.input.keyboard.on('keydown-M', () => this._toggleMute());
  }

  _inMute(p) { return p.x <= 44 && p.y >= 28 && p.y <= 62; }
  _toggleMute() { this.audio.toggle(); this._drawMuteIcon(); }

  _drawMuteIcon() {
    const c = this._muteBtn;
    c.removeAll(true);
    const on = !this.audio.muted;
    c.add(this.add.rectangle(2, 0, 38, 26, 0x000000, 0.25));
    c.add(this.add.rectangle(-8, 0, 5, 8, on ? 0xffffff : 0x888888));         // speaker body
    c.add(this.add.triangle(-3, 0, 0, -7, 0, 7, 8, 0, on ? 0xffffff : 0x888888)); // cone
    if (on) {
      c.add(this.add.rectangle(6, -2, 2, 3, 0xffe6a0));
      c.add(this.add.rectangle(9, 0, 2, 7, 0xffe6a0));  // sound waves
    } else {
      c.add(this.add.line(4, 0, -6, -7, 12, 7, 0xff5555).setLineWidth(2)); // muted slash
    }
  }

  update(time, delta) {
    if (this.over) return;
    const dt = Math.min(delta, 50) / 1000; // clamp so a stutter can't teleport things
    this.elapsed += dt;

    this._moveLeo(dt);
    this._updateFrenzy();
    this._runDirector(delta, time);
    this._updateItems(dt);
    this._updateBoss(time);
  }

  // ── Leo movement — eased follow + a little lean ───────────────────────────
  _moveLeo(dt) {
    // Keyboard nudges the target for desktop testing.
    if (this.cursors.left.isDown)  this.targetX -= 260 * dt;
    if (this.cursors.right.isDown) this.targetX += 260 * dt;

    const margin = 22;
    this.targetX = Phaser.Math.Clamp(this.targetX, margin, this._W - margin);
    const follow = Phaser.Math.Clamp(dt * T.followRate, 0, 1);
    const prevX = this.leo.x;
    this.leo.x = Phaser.Math.Linear(this.leo.x, this.targetX, follow);
    this.leo.angle = Phaser.Math.Clamp((this.leo.x - prevX) * 2.2, -14, 14);

    // Blink during i-frames so a hit reads clearly.
    if (this.time.now < this.invulnUntil) {
      this.leo.setAlpha(this.leo.alpha < 1 ? 1 : 0.35);
    } else {
      this.leo.setAlpha(1);
    }
  }

  // ── Difficulty ramp + spawning ────────────────────────────────────────────
  _diffProgress() { return Phaser.Math.Clamp(this.elapsed / T.rampTime, 0, 1); }

  _runDirector(delta, time) {
    if (this.bossActive) return; // the boss handles its own spawns
    if (this._frenzyActive()) {  // donut storm: rapid good-only rain
      this.spawnAcc += delta;
      if (this.spawnAcc >= T.frenzySpawnMs) { this.spawnAcc = 0; this._spawn(this._pick(GOOD_WEIGHTS)); }
      return;
    }
    const p = this._diffProgress();
    const interval = Phaser.Math.Linear(T.startInterval, T.minInterval, p);
    this.spawnAcc += delta;
    if (this.spawnAcc >= interval) {
      this.spawnAcc = 0;
      const hazardChance = Phaser.Math.Linear(T.startHazard, T.maxHazard, p);
      this._spawn(Math.random() < hazardChance ? this._pick(BAD_WEIGHTS) : this._pick(GOOD_WEIGHTS));
    }
  }

  _baseSpeed() { return Phaser.Math.Linear(T.startSpeed, T.maxSpeed, this._diffProgress()); }

  _spawn(kind, x = null) {
    const px = x ?? Phaser.Math.Between(24, this._W - 24);
    this.items.push(new FallingItem(this, px, -24, kind, this._baseSpeed()));
  }

  // ── Item motion + collision ───────────────────────────────────────────────
  _updateItems(dt) {
    const catchY = this.leo.y - this.leo.displayHeight * 0.45; // basket height
    const lx = this.leo.x;

    for (let i = this.items.length - 1; i >= 0; i--) {
      // A hit this iteration can trigger game-over, which empties this.items —
      // bail immediately so we don't read a now-missing item and crash the loop.
      if (this.over) return;
      const it = this.items[i];
      const alive = it.update(dt, this._killY);
      if (!alive) {
        // A good item that fell past Leo breaks the combo (gentle — no life lost).
        if (it.good && !it.collected && this.combo > 0) this._setCombo(0);
        this.items.splice(i, 1);
        continue;
      }

      // Fart Frenzy vacuums good items toward Leo.
      if (it.good && this._frenzyActive()) {
        it.x += (lx - it.x) * T.frenzyMagnetK;
        it.y += (catchY - it.y) * T.frenzyMagnetK;
        it.container.x = it.x; it.container.y = it.y;
      }

      const dx = it.x - lx;
      const dy = it.y - catchY;
      const dist = Math.hypot(dx, dy);

      if (it.good) {
        if (dist < it.r + T.catchR) { this._catch(it); it.destroy(); this.items.splice(i, 1); }
      } else if (!this._frenzyActive() && this.time.now >= this.invulnUntil) {
        // Hazards pass harmlessly during the frenzy (Leo is invincible).
        if (dist < it.r + T.hurtR) { this._hit(it); it.destroy(); this.items.splice(i, 1); }
      }
    }
  }

  _catch(it) {
    it.collected = true;
    this._setCombo(this.combo + 1);
    const mult = Math.min(T.comboMaxMult, 1 + Math.floor(this.combo / T.comboStep) * 0.5); // +50%/step, capped
    const gain = Math.round(it.points * mult);
    this.score += gain;
    this.scoreText.setText(String(this.score));
    // Build the Fart Meter (but not off the frenzy's own storm — that'd loop).
    if (!this._frenzyActive()) this.charge = Math.min(T.chargeMax, this.charge + it.points * T.chargeGain);
    FX.pop(this, this.scoreText, 0.4, 140);

    const gold = it.kind === 'golden';
    this.audio.catch(this.combo);
    if (gold) this.audio.golden();
    FX.burst(this, it.x, it.y, {
      count: gold ? 22 : 8,
      colors: gold ? [0xffd23f, 0xffe86a, 0xffffff] : [0xdca444, 0xf5e6c0, 0xffe08a],
      minSpeed: 40, maxSpeed: gold ? 150 : 90, minSize: 1, maxSize: gold ? 4 : 2, duration: 420, depth: 20,
    });
    FX.popText(this, it.x, it.y - 6, `+${gain}`, {
      color: gold ? '#ffd23f' : '#fff2d8', fontSize: gold ? '12px' : '10px', depth: 25,
    });
    if (gold) FX.shake(this, 160, 0.006);
  }

  _hit(it) {
    this.hearts = Math.max(0, this.hearts - 1);
    this._renderHearts();
    this._setCombo(0);
    this.invulnUntil = this.time.now + T.invulnMs;

    if (it.kind === 'deer') this.audio.deer(); else this.audio.hit();
    FX.freeze(this, 60);
    FX.shake(this, 240, 0.014);
    this.cameras.main.flash(120, 255, 80, 80);
    FX.burst(this, it.x, it.y, {
      count: 12, colors: [0xffffff, 0xbfc6cc, 0x8a5a34], minSpeed: 50, maxSpeed: 130,
      minSize: 1, maxSize: 3, duration: 380, depth: 20,
    });
    FX.popText(this, this.leo.x, this.leo.y - 40, 'OUCH!', { color: '#ff6b6b', fontSize: '12px', depth: 25 });

    if (this.hearts <= 0) this._gameOver();
  }

  _setCombo(n) {
    this.combo = n;
    if (n >= 3) {
      const mult = Math.min(T.comboMaxMult, 1 + Math.floor(n / T.comboStep) * 0.5);
      this.comboText.setText(`COMBO x${n}${mult > 1 ? `  (+${Math.round((mult - 1) * 100)}%)` : ''}`);
    } else {
      this.comboText.setText('');
    }
  }

  // ── Fart Meter / Donut Frenzy ─────────────────────────────────────────────
  _frenzyActive() { return this.time.now < this.frenzyUntil; }
  _canFrenzy()    { return this.charge >= T.chargeMax && !this._frenzyActive(); }

  _activateFrenzy() {
    if (!this._canFrenzy()) return;
    this.charge = 0;
    this.frenzyUntil = this.time.now + T.frenzyMs;
    this.spawnAcc = 0;
    this.audio.frenzy();
    FX.popText(this, this._W / 2, this._H * 0.4, 'DONUT FRENZY!', { color: '#ffd23f', fontSize: '18px', depth: 46 });
    FX.shake(this, 320, 0.012);
    this.cameras.main.flash(200, 255, 240, 150);
  }

  // Charge-bar fill, "ready" pulse, and the aura that tracks Leo while active.
  _updateFrenzy() {
    const frac = Phaser.Math.Clamp(this.charge / T.chargeMax, 0, 1);
    this._chargeFill.width = this._chargeBarW * frac;

    const ready = this._canFrenzy();
    if (ready && !this._wasReady) this.audio.ready(); // ding the instant it fills
    this._wasReady = ready;

    if (ready) {
      this._chargeFill.setFillStyle(0xffe86a);
      this._chargeLabel.setText('TAP TO FART!').setColor('#fff2b0').setAlpha(0.55 + 0.45 * Math.sin(this.time.now / 120));
    } else {
      this._chargeFill.setFillStyle(0xffc43f);
      this._chargeLabel.setText('FART METER').setColor('#ffe6a0').setAlpha(1);
    }

    if (this._frenzyActive()) {
      if (!this._aura) this._aura = this.add.circle(this.leo.x, this.leo.y - 14, 36, 0xffe86a, 0.35).setDepth(9);
      this._aura.setPosition(this.leo.x, this.leo.y - 14)
        .setScale(1 + 0.18 * Math.sin(this.time.now / 80))
        .setAlpha(0.3 + 0.2 * Math.abs(Math.sin(this.time.now / 100)));
    } else if (this._aura) {
      this._aura.destroy();
      this._aura = null;
      this.invulnUntil = this.time.now + T.frenzyGraceMs; // brief grace as it ends
    }
  }

  // ── Boss invader beat ─────────────────────────────────────────────────────
  _updateBoss(time) {
    if (!this.bossActive && this.score >= this.nextBossScore) this._startBoss();

    if (this.bossActive) {
      if (time >= this.bossUntil) { this._endBoss(); return; }
      // Rain this boss's signature weapon from around them in a hurried burst.
      this.bossBurstAcc += this.game.loop.delta;
      if (this.bossBurstAcc >= T.bossBurstMs) {
        this.bossBurstAcc = 0;
        const bx = this.boss ? this.boss.x : this._W / 2;
        const spread = Phaser.Math.Between(-90, 90);
        this._spawn(Math.random() < 0.85 ? this.bossProj : 'donut',
          Phaser.Math.Clamp(bx + spread, 24, this._W - 24));
      }
    }
  }

  _startBoss() {
    this.bossActive = true;
    this.bossUntil = this.time.now + T.bossDurationMs;
    this.bossBurstAcc = 0;

    // Next boss in the rotation brings their own face, weapon, and voice.
    const boss = BOSSES[this.bossIndex % BOSSES.length];
    this.bossIndex++;
    this.bossProj = boss.proj;

    this.audio.playMusic('music-boss', 0.34);
    this.audio.bossVoice(boss.voice);

    const bx = this._W / 2;
    if (this.textures.exists(boss.face)) {
      this.boss = this.add.image(bx, -60, boss.face).setDepth(12);
      // Normalize to ~72px tall regardless of source image size.
      this.boss.setScale(72 / this.boss.height);
    } else {
      this.boss = this.add.circle(bx, -60, 34, 0xd94f8a).setDepth(12);
    }
    this.tweens.add({ targets: this.boss, y: 74, duration: 520, ease: 'Back.Out' });
    this.tweens.add({ targets: this.boss, angle: { from: -4, to: 4 },
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    FX.shake(this, 300, 0.01);
    const warn = this._txt(this._W / 2, 120, `BOSS!\n${boss.name} INCOMING`, {
      fontSize: '12px', color: '#ff6b6b', align: 'center',
    }).setOrigin(0.5).setDepth(25).setLineSpacing(6);
    warn.setStroke('#000000', 4);
    this.tweens.add({ targets: warn, alpha: 0, delay: 1400, duration: 700, onComplete: () => warn.destroy() });
  }

  _endBoss() {
    this.bossActive = false;
    this.nextBossScore = this.score + T.bossEvery;
    this.audio.playMusic('music-loop', 0.3);

    if (this.boss) {
      const b = this.boss; this.boss = null;
      this.tweens.killTweensOf(b);
      this.tweens.add({ targets: b, y: -80, angle: 0, duration: 420, ease: 'Back.In',
        onComplete: () => b.destroy() });
    }

    // Reward for surviving: a shower of good donuts.
    FX.popText(this, this._W / 2, 140, 'SAFE!  BONUS!', { color: '#7ce0a0', fontSize: '14px', depth: 25 });
    for (let k = 0; k < 8; k++) {
      this.time.delayedCall(k * 150, () => {
        if (!this.over) this._spawn(Math.random() < 0.25 ? 'golden' : 'donut');
      });
    }
    this.spawnAcc = 0;
  }

  // ── Game over ─────────────────────────────────────────────────────────────
  _gameOver() {
    this.over = true;
    this.frenzyUntil = 0;
    if (this._aura) { this._aura.destroy(); this._aura = null; }
    this.audio.stopMusic();
    this.audio.gameOver();
    this.items.forEach(it => it.destroy());
    this.items = [];

    const isRecord = ArcadeScores.submit(this.score);
    const best = ArcadeScores.best();
    const W = this._W, H = this._H;
    const D = 41;
    this._goToken = (this._goToken || 0) + 1; // stale-async guard across replays

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.74).setDepth(40);
    this._txt(W / 2, H * 0.10, 'GAME OVER', { fontSize: '20px', color: '#ff6b6b' }).setOrigin(0.5, 0).setDepth(D);
    this._txt(W / 2, H * 0.185, `SCORE ${this.score}`, { fontSize: '16px' }).setOrigin(0.5, 0).setDepth(D);
    this._txt(W / 2, H * 0.24, isRecord ? 'NEW LOCAL BEST!' : `YOUR BEST ${best}`,
      { fontSize: '9px', color: '#ffe6a0' }).setOrigin(0.5, 0).setDepth(D);

    // ── Touch initials entry ──────────────────────────────────────────────
    this._initials  = ArcadeScores.initials().split('');
    this._submitted = false;
    this._txt(W / 2, H * 0.31, 'YOUR INITIALS', { fontSize: '8px', color: '#88ccff' }).setOrigin(0.5, 0).setDepth(D);
    this._initBoxRects = []; this._initBoxTexts = [];
    const boxW = 40, gap = 16, by = H * 0.40;
    const totalW = 3 * boxW + 2 * gap, startX = W / 2 - totalW / 2 + boxW / 2;
    for (let i = 0; i < 3; i++) {
      const bxi = startX + i * (boxW + gap);
      this.add.rectangle(bxi, by, boxW, boxW, 0x1a2740).setStrokeStyle(2, 0x4488ff).setDepth(D);
      this._initBoxTexts.push(this._txt(bxi, by, this._initials[i], { fontSize: '20px' }).setOrigin(0.5).setDepth(D + 1));
      this._initBoxRects.push({ x: bxi, y: by, w: boxW, h: boxW });
    }
    this._txt(W / 2, by + boxW * 0.72, 'tap a letter to change', { fontSize: '8px', color: '#7788aa' })
      .setOrigin(0.5, 0).setDepth(D);

    // ── Submit button ─────────────────────────────────────────────────────
    const sy = H * 0.565;
    this._submitBg = this.add.rectangle(W / 2, sy, 190, 30, 0x2a6a2a).setStrokeStyle(2, 0x55cc55).setDepth(D);
    this._submitLabel = this._txt(W / 2, sy, 'SUBMIT SCORE', { fontSize: '10px' }).setOrigin(0.5).setDepth(D + 1);
    this._submitRect = { x: W / 2, y: sy, w: 190, h: 30 };

    // ── World board result + top list ─────────────────────────────────────
    this._resultText = this._txt(W / 2, H * 0.635, '', { fontSize: '10px', color: '#88ddff' }).setOrigin(0.5, 0).setDepth(D);
    this._topText = this._txt(W / 2, H * 0.685, 'WORLD BOARD...', { fontSize: '9px', color: '#cfe6ff', align: 'center' })
      .setOrigin(0.5, 0).setDepth(D).setLineSpacing(5);

    // ── Play again ────────────────────────────────────────────────────────
    const py = H * 0.90;
    this.add.rectangle(W / 2, py, 190, 30, 0x333344).setStrokeStyle(2, 0x8899bb).setDepth(D);
    const pa = this._txt(W / 2, py, 'PLAY AGAIN', { fontSize: '10px' }).setOrigin(0.5).setDepth(D + 1);
    this.tweens.add({ targets: pa, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
    this._playAgainRect = { x: W / 2, y: py, w: 190, h: 30 };
    this._playAgainAt = this.time.now + 400; // tiny guard vs an accidental tap

    this._refreshTop(); // show the live top of the board right away
  }

  _gameOverTap(p) {
    for (let i = 0; i < 3; i++) {
      if (this._inRect(p, this._initBoxRects?.[i])) { this._cycleLetter(i); return; }
    }
    if (!this._submitted && this._inRect(p, this._submitRect)) { this._submitScore(); return; }
    if (this.time.now >= (this._playAgainAt || 0) && this._inRect(p, this._playAgainRect)) this.scene.restart();
  }

  _inRect(p, r) {
    return !!r && p.x >= r.x - r.w / 2 && p.x <= r.x + r.w / 2 && p.y >= r.y - r.h / 2 && p.y <= r.y + r.h / 2;
  }

  _cycleLetter(i) {
    const code = this._initials[i].charCodeAt(0);
    this._initials[i] = String.fromCharCode(code >= 90 ? 65 : code + 1); // A..Z, wraps
    this._initBoxTexts[i].setText(this._initials[i]);
  }

  _submitScore() {
    this._submitted = true;
    const tok = this._goToken;
    const initials = this._initials.join('');
    ArcadeScores.setInitials(initials);
    this._submitLabel.setText('POSTING...');
    this._submitBg.setFillStyle(0x444444).setStrokeStyle(2, 0x777777);

    ArcadeGlobalScores.submit({ initials, score: this.score }).then((ok) => {
      if (this._goToken !== tok) return;
      if (!ok) {
        this._submitLabel.setText('BOARD OFFLINE');
        this._resultText.setText('COULD NOT REACH WORLD BOARD').setColor('#ff8866');
        return;
      }
      this._submitLabel.setText('SUBMITTED!');
      ArcadeGlobalScores.rankFor(this.score).then((rank) => {
        if (this._goToken !== tok || rank == null) return;
        this._resultText.setText(rank === 1 ? 'BEST IN THE WORLD!' : `#${rank} IN THE WORLD`)
          .setColor(rank === 1 ? '#ffd23f' : '#88ddff');
      });
      this._refreshTop();
    });
  }

  _refreshTop() {
    const tok = this._goToken;
    ArcadeGlobalScores.top(5).then((rows) => {
      if (this._goToken !== tok || !this._topText) return;
      if (!rows) { this._topText.setText('world board offline'); return; }
      if (!rows.length) { this._topText.setText('be the first on the board!'); return; }
      const lines = rows.map((r, i) => `${i + 1}. ${r.initials}  ${r.score}${r.isMe ? '  (YOU)' : ''}`);
      this._topText.setText(lines.join('\n'));
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _pick(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
    return entries[0][0];
  }

  _renderHearts() {
    this._heartWrap.removeAll(true);
    for (let i = 0; i < T.hearts; i++) {
      const on = i < this.hearts;
      const hx = 14 + i * 20, hy = 13;
      const col = on ? 0xff4d6d : 0x5a3a44;
      // Two lobes + a point — a tiny pixel heart.
      this._heartWrap.add(this.add.circle(hx - 3, hy - 2, 4, col));
      this._heartWrap.add(this.add.circle(hx + 3, hy - 2, 4, col));
      this._heartWrap.add(this.add.triangle(hx, hy, -6, -2, 6, -2, 0, 7, col));
    }
  }

  _drawBackground(W, H) {
    // Sky is the scene bg. The ground rises to meet the (raised) Leo, and the
    // road below him doubles as the open slide zone for your thumb.
    const leoY = H - T.leoBottomGap;
    const horizon = leoY - 20;
    const roadTop = leoY - 6;
    this.add.rectangle(W / 2, (horizon + H) / 2, W, H - horizon, 0x6ab04c).setDepth(0); // grass
    this.add.rectangle(W / 2, (roadTop + H) / 2, W, H - roadTop, 0x6b6f76).setDepth(0); // road / slide zone
    for (let y = leoY + 18; y < H; y += 26) {
      this.add.rectangle(W / 2, y, 10, 4, 0xffe08a).setDepth(0);                        // lane dashes
    }
    this.add.circle(W * 0.15, horizon - 2, 30, 0x5aa03e).setDepth(0);                   // bush
    this.add.circle(W * 0.86, horizon,     26, 0x5aa03e).setDepth(0);                   // bush
    this.add.circle(W * 0.50, 60,  16, 0xffffff, 0.80).setDepth(0);                     // cloud
    this.add.circle(W * 0.78, 92,  26, 0xffffff, 0.85).setDepth(0);                     // cloud
    this.add.circle(W * 0.22, 130, 20, 0xffffff, 0.85).setDepth(0);                     // cloud
  }

  _txt(x, y, s, style = {}) {
    const t = this.add.text(x, y, s, { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#ffffff', ...style })
      .setDepth(30);
    t.setResolution(this._textRes);
    return t;
  }
}
