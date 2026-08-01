import Phaser from 'phaser';
import FX from '../../systems/FX.js';
import { PIXEL_FONT } from '../../constants.js';
import ArcadeScores from '../systems/ArcadeScores.js';
import ArcadeGlobalScores from '../systems/ArcadeGlobalScores.js';
import ArcadeAudio from '../systems/ArcadeAudio.js';
import FallingItem, { GOOD_KINDS, BAD_KINDS, friendKind } from '../entities/FallingItem.js';
import { K_LEO } from './BootArcadeScene.js';

// Boss roster — invaders rotate through this in order, each raining their own
// signature weapon (mirrors who throws what in the adventure). `friend` is the
// aligned buddy from the adventure: catch them in the recruit window and the
// fight flips into a grab-fest. Edie has no friend — always a solo-survival boss.
const BOSSES = [
  { id: 'grace',     name: 'GRACE',        face: 'head-grace',     proj: 'noodle',     voice: 'sfx-girly-grace', friend: 'warren' },
  { id: 'nora',      name: 'NORA',         face: 'head-nora',      proj: 'soccerball', voice: 'sfx-girly-nora',  friend: 'carson' },
  { id: 'max',       name: 'MAX',          face: 'head-max',       proj: 'football',   voice: 'sfx-coyote-max',  friend: 'mj' },
  { id: 'justinmax', name: 'JUSTIN & MAX', face: 'head-justinmax', proj: 'baseball',   voice: 'sfx-coyote-max',  friend: 'justin' },
  { id: 'edie',      name: 'EDIE',         face: 'head-edie',      proj: 'stuffie',    voice: 'sfx-girly-edie',  friend: null },
];

const FRIEND_NAMES  = { warren: 'WARREN', mj: 'MJ', carson: 'CARSON', justin: 'JUSTIN' };
const WEAPON_NAMES  = { noodle: 'NOODLES', soccerball: 'SOCCER BALLS', football: 'FOOTBALLS', baseball: 'BASEBALLS', stuffie: 'STUFFIES' };
const BOSS_WEAPONS  = new Set(['noodle', 'soccerball', 'football', 'baseball', 'stuffie']);

// ─── Tuning — every knob for the feel lives here ────────────────────────────
const T = {
  leoScale:      1.7,
  leoBottomGap:  132,   // px from bottom to Leo's feet — raised enough that your
                        // thumb slides in the road zone below him without covering him
  followRate:    14,    // Leo-follows-finger snappiness (higher = tighter)

  startInterval: 820,   // ms between spawns at t=0
  minInterval:   300,   // ms between spawns at full difficulty
  startSpeed:    150,   // px/s base fall speed at t=0
  maxSpeed:      340,   // px/s at full difficulty
  startHazard:   0.28,  // P(a spawn is a hazard) at t=0
  maxHazard:     0.50,  // P at full difficulty
  rampTime:      75,    // seconds to reach full difficulty

  catchR:        24,    // catch radius for good items (generous)
  friendCatchR:  12,    // catch radius for a friend (tight — you must line up under them)
  hurtR:         19,    // hit radius for hazards (tighter = fairer near-misses)
  hearts:        3,
  invulnMs:      900,   // i-frames after a hit

  bossFirst:     250,   // score that triggers the first boss invader
  bossEvery:     400,   // score gap between subsequent invaders
  bossDurationMs:6500,  // how long the onslaught lasts
  bossBurstMs:   430,   // gap between boss-thrown hazards

  recruitMs:     4200,  // recruit window before a friendly boss (grab the friend!)
  weaponGrab:    15,    // points per boss weapon grabbed during a reversal round
  donutPenalty:  12,    // points lost for grabbing a donut during a reversal round
  grabToClear:   16,    // weapon grabs that send the boss packing early
  reversalWarnMs:1800,  // "FRIEND LEAVING!" warning window at the end of a reversal

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
    this._recruitActive = false; // pre-boss window to grab the aligned friend
    this._recruitUntil  = 0;
    this._recruitDropAcc = 0;
    this._pendingBoss   = null;  // boss queued behind the recruit window
    this._friendArmed   = false; // caught the friend -> reversal grab-fest
    this._reversalActive = false;
    this._grabTally     = 0;     // boss weapons grabbed this reversal round
    this._friendBuddy   = null;  // the friend sprite that tags in beside Leo
    this._reversalUI    = null;  // grab-time countdown bar
    this._reversalFill  = null;
    this._reversalLabel = null;
    this._leaveWarned   = false; // fired the "FRIEND LEAVING!" warning yet
    this._infoOpen      = false; // rules overlay showing (pauses the game)
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
    this.bestText  = this._txt(W - 8, 34, `BEST ${ArcadeScores.best()}`, { fontSize: '8px', color: '#ffe6a0' })
      .setOrigin(1, 0);
    this._heartWrap = this.add.container(0, 0).setDepth(30);
    this._renderHearts();

    // Info / how-to-play button (top-right). Tapping it opens the rules overlay.
    this._infoBtn = this.add.container(W - 15, 15).setDepth(32);
    this._infoBtn.add(this.add.circle(0, 0, 11, 0x000000, 0.3));
    this._infoBtn.add(this.add.circle(0, 0, 11, 0x000000, 0).setStrokeStyle(2, 0xffffff));
    this._infoBtn.add(this._txt(0, 1, '?', { fontSize: '12px' }).setOrigin(0.5));

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

    // First-time players get the rules automatically; after that it's the ? button.
    if (!ArcadeScores.seenRules()) this._openInfo();
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  // DRAG = move Leo (his x follows the finger/mouse). A deliberate TAP (quick
  // press-release with no drag) unleashes the Fart Frenzy when the meter's full.
  // Separating the two gestures means moving never accidentally fires the frenzy.
  _setupInput() {
    this.input.on('pointerdown', (p) => {
      if (this._infoOpen) { this._closeInfo(); return; } // any tap dismisses the rules
      if (this.over) { this._gameOverTap(p); return; }
      if (this._inInfo(p)) { this._openInfo(); return; }
      if (this._inMute(p)) { this._pOnMute = true; return; } // corner tap = mute, not move/frenzy
      this._pOnMute = false;
      this._pDownT = this.time.now; this._pDownX = p.x; this._pDownY = p.y; this._pMoved = false;
    });
    this.input.on('pointermove', (p) => {
      if (this.over || this._pOnMute || this._infoOpen) return;
      if (Math.hypot(p.x - this._pDownX, p.y - this._pDownY) > 10) this._pMoved = true;
      this.targetX = p.x;
    });
    this.input.on('pointerup', () => {
      if (this.over || this._infoOpen) return;
      if (this._pOnMute) { this._pOnMute = false; this._toggleMute(); return; }
      if (!this._pMoved && this.time.now - this._pDownT < 260) this._activateFrenzy();
    });
    this.cursors = this.input.keyboard.createCursorKeys();            // desktop dev
    this.input.keyboard.on('keydown-SPACE', () => this._activateFrenzy());
    this.input.keyboard.on('keydown-M', () => this._toggleMute());
  }

  _inMute(p) { return p.x <= 44 && p.y >= 28 && p.y <= 62; }
  _inInfo(p) { return p.x >= this._W - 34 && p.y <= 34; }
  _toggleMute() { this.audio.toggle(); this._drawMuteIcon(); }

  // ── Rules overlay (pauses the game) ────────────────────────────────────────
  _openInfo() {
    if (this._infoOpen) return;
    this._infoOpen = true;
    this._infoPausedAt = this.time.now;
    const W = this._W, H = this._H, D = 50;
    const layer = this.add.container(0, 0).setDepth(D);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0x0a1020, 0.92));
    layer.add(this._txt(W / 2, H * 0.09, 'HOW TO PLAY', { fontSize: '16px', color: '#ffd23f' }).setOrigin(0.5, 0));
    const body =
      'SLIDE to move Leo — steer\n' +
      'in the road below him.\n\n' +
      'CATCH donuts for points.\n' +
      'DODGE the junk (potholes,\n' +
      'cars, deer, balls) or lose\n' +
      'a heart.\n\n' +
      'Fill the FART METER, then\n' +
      'TAP to unleash a FART\n' +
      'FRENZY — briefly invincible\n' +
      'and donuts fly to you.\n\n' +
      'BEFORE A BOSS: grab the\n' +
      'friend who drops! Then the\n' +
      "boss's stuff = points and\n" +
      'donuts cost points (no\n' +
      'life). Miss him = dodge it all.\n\n' +
      'Climb the WORLD BOARD!';
    layer.add(this._txt(W / 2, H * 0.17, body, { fontSize: '9px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5, 0).setLineSpacing(5));
    const tap = this._txt(W / 2, H * 0.92, 'TAP TO PLAY', { fontSize: '12px', color: '#7ce0a0' }).setOrigin(0.5);
    layer.add(tap);
    this.tweens.add({ targets: tap, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
    this._infoLayer = layer;
  }

  _closeInfo() {
    if (!this._infoOpen) return;
    // Push active wall-clock deadlines forward by the paused span so nothing
    // expired while the rules were up.
    const d = this.time.now - (this._infoPausedAt || this.time.now);
    if (this.bossUntil    > this._infoPausedAt) this.bossUntil    += d;
    if (this._recruitUntil > this._infoPausedAt) this._recruitUntil += d;
    if (this.invulnUntil  > this._infoPausedAt) this.invulnUntil  += d;
    if (this.frenzyUntil  > this._infoPausedAt) this.frenzyUntil  += d;
    this._infoLayer?.destroy(); this._infoLayer = null;
    this._infoOpen = false;
    ArcadeScores.setSeenRules();
  }

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
    if (this.over || this._infoOpen) return; // rules overlay pauses everything
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
        // A missed donut breaks the combo (gentle — no life). Friends are exempt.
        if (it.good && !it.friendId && !it.collected && this.combo > 0) this._setCombo(0);
        this.items.splice(i, 1);
        continue;
      }

      const reversal = this.bossActive && this._reversalActive;

      // Fart Frenzy vacuums good donuts toward Leo — but NOT the friend (that'd
      // trivialize grabbing them) and not in a reversal round (donuts are to avoid).
      if (it.good && !it.friendId && !reversal && this._frenzyActive()) {
        it.x += (lx - it.x) * T.frenzyMagnetK;
        it.y += (catchY - it.y) * T.frenzyMagnetK;
        it.container.x = it.x; it.container.y = it.y;
      }

      const dx = it.x - lx;
      const dy = it.y - catchY;
      const dist = Math.hypot(dx, dy);
      const inCatch = dist < it.r + T.catchR;

      if (it.friendId) {
        // Friend face — tight catch, you must line up under them (only appears in
        // the recruit window). No magnet help even during a frenzy.
        if (dist < it.r + T.friendCatchR) { this._onFriendCaught(it); it.destroy(); this.items.splice(i, 1); }
      } else if (reversal) {
        // Grab-fest: the boss's weapon is treasure; donuts are the distraction.
        if (BOSS_WEAPONS.has(it.kind)) {
          if (inCatch) { this._grabWeapon(it); it.destroy(); this.items.splice(i, 1); }
        } else if (it.good && inCatch) {
          this._grabDistraction(it); it.destroy(); this.items.splice(i, 1);
        }
      } else if (it.good) {
        if (inCatch) { this._catch(it); it.destroy(); this.items.splice(i, 1); }
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

  // Reversal round: grab the boss's weapon for points (no damage).
  _grabWeapon(it) {
    this._setCombo(this.combo + 1);
    const mult = Math.min(T.comboMaxMult, 1 + Math.floor(this.combo / T.comboStep) * 0.5);
    const gain = Math.round(T.weaponGrab * mult);
    this.score += gain;
    this.scoreText.setText(String(this.score));
    this.audio.catch(this.combo);
    FX.pop(this, this.scoreText, 0.4, 140);
    FX.burst(this, it.x, it.y, { count: 8, colors: [0x7ce0a0, 0xffe86a, 0xffffff],
      minSpeed: 40, maxSpeed: 95, minSize: 1, maxSize: 2, duration: 380, depth: 20 });
    FX.popText(this, it.x, it.y - 6, `+${gain}`, { color: '#7ce0a0', fontSize: '10px', depth: 25 });
    // Grab enough and the boss gives up early.
    if (++this._grabTally >= T.grabToClear) this.bossUntil = Math.min(this.bossUntil, this.time.now + 400);
  }

  // Reversal round: a donut is the distraction — costs points, never a life.
  _grabDistraction(it) {
    this._setCombo(0);
    this.score = Math.max(0, this.score - T.donutPenalty);
    this.scoreText.setText(String(this.score));
    this.cameras.main.flash(80, 120, 120, 255);
    FX.popText(this, it.x, it.y - 6, `-${T.donutPenalty}`, { color: '#ff8866', fontSize: '10px', depth: 25 });
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
  _cycle() { return Math.floor(this.bossIndex / BOSSES.length); } // 0,1,2… escalation tier

  _updateBoss(time) {
    // Kick off the next boss sequence at the score milestone.
    if (!this.bossActive && !this._recruitActive && this.score >= this.nextBossScore) {
      const boss = BOSSES[this.bossIndex % BOSSES.length];
      this.bossIndex++;
      this._pendingBoss = boss;
      this._friendArmed = false;
      if (boss.friend) this._startRecruitWindow(boss);
      else this._startBoss(boss, false);   // Edie / friendless: straight to solo
    }

    if (this._recruitActive) this._updateRecruit(time);

    if (this.bossActive) {
      // Reversal round: keep the buddy beside Leo, tick down the grab-time bar,
      // and warn hard in the final stretch so you stop grabbing before the
      // weapons turn dangerous again.
      if (this._reversalActive) {
        if (this._friendBuddy) this._friendBuddy.setPosition(this.leo.x - 24, this.leo.y - 22);
        const left = Math.max(0, this.bossUntil - time);
        const ending = left <= T.reversalWarnMs;
        if (this._reversalFill) {
          this._reversalFill.width = this._reversalBarW * Phaser.Math.Clamp(left / T.bossDurationMs, 0, 1);
          this._reversalFill.setFillStyle(ending ? 0xff5a5a : 0x7ce0a0);
        }
        if (this._reversalLabel) {
          this._reversalLabel.setText(ending ? 'FRIEND LEAVING!' : 'GRAB TIME').setColor(ending ? '#ff8866' : '#7ce0a0');
        }
        if (ending) {
          if (this._friendBuddy) this._friendBuddy.setAlpha(0.35 + 0.65 * Math.abs(Math.sin(time / 80)));
          if (!this._leaveWarned) {
            this._leaveWarned = true;
            this.audio.ready();
            FX.popText(this, this.leo.x, this.leo.y - 34, 'FRIEND LEAVING!', { color: '#ff8866', fontSize: '12px', depth: 26 });
          }
        }
      }
      if (time >= this.bossUntil) { this._endBoss(); return; }
      // Rain this boss's signature weapon (with a few donuts mixed in).
      this.bossBurstAcc += this.game.loop.delta;
      const burst = Math.max(220, T.bossBurstMs - this._cycle() * 60); // faster each cycle
      if (this.bossBurstAcc >= burst) {
        this.bossBurstAcc = 0;
        const bx = this.boss ? this.boss.x : this._W / 2;
        const spread = Phaser.Math.Between(-90, 90);
        this._spawn(Math.random() < 0.85 ? this.bossProj : 'donut',
          Phaser.Math.Clamp(bx + spread, 24, this._W - 24));
      }
    }
  }

  // ── Recruit window: grab the aligned friend before the boss lands ──────────
  _startRecruitWindow(boss) {
    this._recruitActive = true;
    this._recruitUntil = this.time.now + Math.max(2600, T.recruitMs - this._cycle() * 500);
    const who = FRIEND_NAMES[boss.friend] || 'FRIEND';
    this._recruitCallout = this._txt(this._W / 2, 96, `${who} INCOMING!\nGRAB HIM!`, {
      fontSize: '12px', color: '#ffe86a', align: 'center',
    }).setOrigin(0.5, 0).setDepth(25).setLineSpacing(6);
    this._recruitCallout.setStroke('#000000', 4);
    FX.shake(this, 200, 0.006);

    // One friend, one chance — miss it and you fight the boss solo.
    this._spawn(friendKind(boss.friend));
  }

  _updateRecruit(time) {
    if (time >= this._recruitUntil) {
      this._recruitActive = false;
      this._recruitCallout?.destroy(); this._recruitCallout = null;
      this._startBoss(this._pendingBoss, this._friendArmed);
    }
  }

  _onFriendCaught(it) {
    this.audio.friendCatch();
    this.score += it.points;
    this.scoreText.setText(String(this.score));
    FX.burst(this, it.x, it.y, { count: 18, colors: [0xffe86a, 0xffffff, 0x7ce0a0],
      minSpeed: 50, maxSpeed: 150, minSize: 1, maxSize: 3, duration: 500, depth: 25 });
    const armed = this._recruitActive && this._pendingBoss && it.friendId === this._pendingBoss.friend;
    if (armed) {
      this._friendArmed = true;
      this._recruitCallout?.setText(`GOT ${FRIEND_NAMES[it.friendId]}!`).setColor('#7ce0a0');
      FX.popText(this, this.leo.x, this.leo.y - 30, 'CREW READY!', { color: '#7ce0a0', fontSize: '12px', depth: 26 });
    }
  }

  _startBoss(boss, armed) {
    this.bossActive = true;
    this.bossUntil = this.time.now + T.bossDurationMs;
    this.bossBurstAcc = 0;
    this.bossProj = boss.proj;
    this._reversalActive = armed;
    this._grabTally = 0;

    this.audio.playMusic('music-boss', 0.34);
    this.audio.bossVoice(boss.voice);

    const bx = this._W / 2;
    if (this.textures.exists(boss.face)) {
      this.boss = this.add.image(bx, -60, boss.face).setDepth(12);
      this.boss.setScale(72 / this.boss.height); // normalize to ~72px tall
    } else {
      this.boss = this.add.circle(bx, -60, 34, 0xd94f8a).setDepth(12);
    }
    // Sits below the top HUD (score + Fart Meter live up there now).
    this.tweens.add({ targets: this.boss, y: 108, duration: 520, ease: 'Back.Out' });
    this.tweens.add({ targets: this.boss, angle: { from: -4, to: 4 },
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    FX.shake(this, 300, 0.01);
    let msg, color;
    if (armed) {
      // Friend tags in beside Leo; the weapons are now treasure.
      const fid = boss.friend;
      this._friendBuddy = this.textures.exists(`head-${fid}`)
        ? this.add.image(this.leo.x - 24, this.leo.y - 22, `head-${fid}`).setDisplaySize(22, 22).setDepth(11)
        : this.add.circle(this.leo.x - 24, this.leo.y - 22, 11, 0x7ce0a0).setDepth(11);
      msg = `${FRIEND_NAMES[fid]} TAGS IN!\nGRAB THE ${WEAPON_NAMES[boss.proj]}!`;
      color = '#7ce0a0';

      // Grab-time countdown so you can see the round ending (weapons turn
      // dangerous again the moment the friend leaves).
      this._leaveWarned = false;
      this._reversalBarW = 150;
      const rbx = this._W / 2 - this._reversalBarW / 2, rby = 182;
      this._reversalLabel = this._txt(this._W / 2, rby - 10, 'GRAB TIME', { fontSize: '8px', color: '#7ce0a0' }).setOrigin(0.5, 1);
      this._reversalFill = this.add.rectangle(rbx, rby, this._reversalBarW, 6, 0x7ce0a0).setOrigin(0, 0.5);
      this._reversalUI = this.add.container(0, 0).setDepth(24).add([
        this.add.rectangle(this._W / 2, rby, this._reversalBarW + 4, 10, 0x000000, 0.5),
        this.add.rectangle(rbx, rby, this._reversalBarW, 6, 0x333333).setOrigin(0, 0.5),
        this._reversalFill, this._reversalLabel,
      ]);
    } else {
      msg = `BOSS!\n${boss.name}`;
      color = '#ff6b6b';
    }
    const warn = this._txt(this._W / 2, 156, msg, { fontSize: '12px', color, align: 'center' })
      .setOrigin(0.5).setDepth(25).setLineSpacing(6);
    warn.setStroke('#000000', 4);
    this.tweens.add({ targets: warn, alpha: 0, delay: 1500, duration: 700, onComplete: () => warn.destroy() });
  }

  _endBoss() {
    const wasReversal = this._reversalActive;
    const grabbed = this._grabTally;
    this.bossActive = false;
    this._reversalActive = false;
    this.nextBossScore = this.score + T.bossEvery;
    this.audio.playMusic('music-loop', 0.3);

    if (this._friendBuddy) { this._friendBuddy.destroy(); this._friendBuddy = null; }
    if (this._reversalUI) { this._reversalUI.destroy(); this._reversalUI = null; this._reversalFill = null; this._reversalLabel = null; }
    if (this.boss) {
      const b = this.boss; this.boss = null;
      this.tweens.killTweensOf(b);
      this.tweens.add({ targets: b, y: -80, angle: 0, duration: 420, ease: 'Back.In',
        onComplete: () => b.destroy() });
    }

    if (wasReversal) {
      // The friend clears the field on the way out — sweep any in-air weapons so a
      // leftover projectile can't suddenly hurt Leo, plus a brief grace window.
      for (let i = this.items.length - 1; i >= 0; i--) {
        if (BOSS_WEAPONS.has(this.items[i].kind)) {
          FX.burst(this, this.items[i].x, this.items[i].y, { count: 4, colors: [0x7ce0a0, 0xffffff],
            minSpeed: 20, maxSpeed: 60, minSize: 1, maxSize: 2, duration: 260, depth: 20 });
          this.items[i].destroy(); this.items.splice(i, 1);
        }
      }
      this.invulnUntil = this.time.now + 900;
      FX.popText(this, this._W / 2, 140, `GRABBED ${grabbed}!`, { color: '#ffd23f', fontSize: '16px', depth: 25 });
    } else {
      // Survived solo — a small consolation shower of donuts.
      FX.popText(this, this._W / 2, 140, 'SAFE!  BONUS!', { color: '#7ce0a0', fontSize: '14px', depth: 25 });
      for (let k = 0; k < 8; k++) {
        this.time.delayedCall(k * 150, () => {
          if (!this.over) this._spawn(Math.random() < 0.25 ? 'golden' : 'donut');
        });
      }
    }
    this.spawnAcc = 0;
  }

  // ── Game over ─────────────────────────────────────────────────────────────
  _gameOver() {
    this.over = true;
    this.frenzyUntil = 0;
    this._recruitActive = false;
    this._reversalActive = false;
    if (this._aura) { this._aura.destroy(); this._aura = null; }
    if (this._friendBuddy) { this._friendBuddy.destroy(); this._friendBuddy = null; }
    if (this._reversalUI) { this._reversalUI.destroy(); this._reversalUI = null; this._reversalFill = null; }
    if (this._recruitCallout) { this._recruitCallout.destroy(); this._recruitCallout = null; }
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
    for (let y = leoY + 20; y < H; y += 30) {
      this.add.rectangle(W / 2, y, 5, 16, 0xffe08a).setDepth(0);                        // lane dashes (vertical, road recedes upward)
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
