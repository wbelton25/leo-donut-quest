import {
  SCENE_JUSTIN_MAX_BOSS, SCENE_DIALOGUE, SCENE_NEIGHBORHOOD, SCENE_BOSS_GAUNTLET,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, txt,
} from '../constants.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import PartySystem from '../systems/PartySystem.js';

// ─── Justin's Max Boss Scene ─────────────────────────────────────────────────
// Justin's brother Max faces Leo in the backyard. He plays baseball AND has
// an electric shockwave ability — the most dangerous of the four siblings.
//
// Arena: backyard with a fence border and a small dugout bench.
//
// Max attack cycle:
//   PATROL    → walks back and forth across the back of the yard
//   CHASE     → moves toward Leo
//   PITCH     → throws a baseball at Leo every 3s
//   SWING     → melee bat swing when Leo gets close (wide arc, hard to dodge)
//   ELECTRIC  → charges then releases an expanding electric shockwave every 7s
//   STUNNED   → recovers after a fart hit
//   DEFEATED  → spins + fades
//
// 4 HP (hardest sibling boss). Electric shockwave does 25 damage and covers
// most of the arena — must dodge to the edges.
// Leo: WASD/arrows, F to fart.

const T = TILE_SIZE;

const ARENA_W = BASE_WIDTH;
const ARENA_H = BASE_HEIGHT;

// Arena geometry
const FENCE_THICK = 10;

// Max constants
const MAX_HP            = 4;
const PATROL_SPEED      = 55;
const CHASE_SPEED       = 90;
const CHASE_RANGE       = 150;
const PITCH_INTERVAL    = 3000;
const SWING_RANGE       = 55;
const SWING_DURATION    = 400;   // ms arc
const ELECTRIC_INTERVAL = 7000;
const ELECTRIC_WIND_UP  = 1200;  // ms
const ELECTRIC_EXPAND   = 600;   // ms expansion
const ELECTRIC_RADIUS   = 140;   // max radius px (covers most of the arena — must hug walls)
const STUN_DURATION     = 1200;
const FART_HIT_RANGE    = 80;

// Damage
const PITCH_DAMAGE      = 14;
const SWING_DAMAGE      = 20;
const ELECTRIC_DAMAGE   = 25;
const CONTACT_DAMAGE    = 15;
const CONTACT_COOLDOWN  = 1400;

const BALL_SPEED = 230;
const LEO_SPEED  = 170;

export default class JustinMaxBossScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_JUSTIN_MAX_BOSS });
  }

  init(data) {
    this._gauntlet     = data?.gauntlet ?? false;
    this._gauntletData = data?.gauntletData ?? {};
  }

  create() {
    try {
      this._createImpl();
    } catch (err) {
      console.error('[JustinMaxBossScene] create() threw:', err);
      this.add.text(10, 10, 'JUSTIN MAX SCENE ERROR:\n' + err.message, {
        fontFamily: 'monospace', fontSize: '10px', color: '#ff4444',
        wordWrap: { width: 460 },
      });
    }
  }

  _createImpl() {
    this._resources = this.game.registry.get('resources');
    this._party     = this.game.registry.get('party');
    this._abilities = this.game.registry.get('abilities');

    if (!this._resources) {
      this._resources = new ResourceSystem(this.game);
      this._party     = new PartySystem(this.game);
      this._abilities = new AbilitySystem(this.game, this._party);
    }

    this._abilities.register('lightning_fart', (scene, player) => {
      const ring = scene.add.circle(player.x, player.y, 6, 0xf5e642, 0.9);
      scene.tweens.add({ targets: ring, radius: FART_HIT_RANGE, alpha: 0, duration: 400,
        onComplete: () => ring.destroy() });
    });

    this._maxHp          = MAX_HP;
    this._maxState       = 'PATROL';
    this._maxX           = ARENA_W / 2;
    this._maxY           = 60;
    this._maxVx          = PATROL_SPEED;
    this._lastContact    = 0;
    this._fartReady      = true;
    this._fartCooldownMs = 4000;
    this._pitches        = [];   // flying baseballs
    this._swingActive    = false;
    this._electricActive = false;
    this._electricCharging = false;
    this._defeated       = false;
    this._inputLocked    = true;

    this._leoX = ARENA_W / 2;
    this._leoY = ARENA_H - 45;

    this._buildArena();
    this._buildMax();
    this._buildLeo();
    this._buildHud();
    this._setupInput();
    this._setupTimers();
    this._runIntroCutscene();
  }

  // ─── Arena ────────────────────────────────────────────────────────────────

  _buildArena() {
    // Grass yard
    this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 0x3a7a3a);

    // Grass stripes
    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        const sw = ARENA_W / 5;
        this.add.rectangle(sw * i + sw / 2, ARENA_H / 2, sw, ARENA_H, 0x3e8040, 0.35);
      }
    }

    // Wooden fence (4 sides)
    this.add.rectangle(ARENA_W / 2, FENCE_THICK / 2, ARENA_W, FENCE_THICK, 0x8b5e2a); // top
    this.add.rectangle(ARENA_W / 2, ARENA_H - FENCE_THICK / 2, ARENA_W, FENCE_THICK, 0x8b5e2a); // bottom
    this.add.rectangle(FENCE_THICK / 2, ARENA_H / 2, FENCE_THICK, ARENA_H, 0x8b5e2a); // left
    this.add.rectangle(ARENA_W - FENCE_THICK / 2, ARENA_H / 2, FENCE_THICK, ARENA_H, 0x8b5e2a); // right

    // Fence posts
    for (let x = 0; x <= ARENA_W; x += 30) {
      this.add.rectangle(x, FENCE_THICK / 2, 4, FENCE_THICK + 4, 0x5a3a10);
      this.add.rectangle(x, ARENA_H - FENCE_THICK / 2, 4, FENCE_THICK + 4, 0x5a3a10);
    }

    // Dugout bench (top-left)
    this.add.rectangle(50, 28, 60, 8, 0x6b4820);
    this.add.rectangle(50, 24, 60, 4, 0x9b6830); // bench top
    txt(this, 20, 18, 'DUGOUT', { fontSize: '8px', color: '#886644' });

    // Home plate
    this.add.rectangle(ARENA_W / 2, ARENA_H - 30, 14, 10, 0xffffff, 0.8);

    // Pitcher's mound
    this.add.circle(ARENA_W / 2, ARENA_H / 2, 18).setFillStyle(0x8b7040, 0.6);
    this.add.circle(ARENA_W / 2, ARENA_H / 2, 6).setFillStyle(0x9b8040, 0.8);
  }

  // ─── Max visual ───────────────────────────────────────────────────────────

  _buildMax() {
    this._maxBody    = this.add.rectangle(this._maxX, this._maxY, T * 2.5, T * 3, 0xcc4400).setDepth(5);
    this._maxHelmet  = this.add.rectangle(this._maxX, this._maxY - 14, T * 2.5, T, 0x992200).setDepth(6);
    // Bat
    this._maxBat     = this.add.rectangle(this._maxX + 20, this._maxY + 4, T * 0.5, T * 2.5, 0x9b6820).setDepth(6);

    this._maxHpBg   = this.add.rectangle(ARENA_W / 2, 16, 160, 8, 0x440000).setScrollFactor(0).setDepth(20);
    this._maxHpFill = this.add.rectangle(ARENA_W / 2 - 78, 16, 156, 6, 0xff4400)
      .setScrollFactor(0).setDepth(21).setOrigin(0, 0.5);
    txt(this, ARENA_W / 2, 6, "JUSTIN'S MAX", { fontSize: '8px', color: '#ffaa44' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(21);

    this._alertLabel    = txt(this, this._maxX, this._maxY - 32, '!',
      { fontSize: '8px', color: '#ffff00' }).setOrigin(0.5).setDepth(6).setVisible(false);

    this._swingLabel    = txt(this, this._maxX, this._maxY - 32, 'SWING!',
      { fontSize: '8px', color: '#ff8800' }).setOrigin(0.5).setDepth(6).setVisible(false);

    this._chargeLabel   = txt(this, ARENA_W / 2, ARENA_H / 2 - 30, '⚡ CHARGING ⚡',
      { fontSize: '8px', color: '#ffff00' }).setOrigin(0.5).setScrollFactor(0).setDepth(25).setVisible(false);
  }

  // ─── Leo visual ───────────────────────────────────────────────────────────

  _buildLeo() {
    this._leoBody = this.add.rectangle(this._leoX, this._leoY, T * 2, T * 2.5, 0x4488ff).setDepth(5);
    this._leoDot  = this.add.rectangle(this._leoX, this._leoY - 12, 6, 4, 0xffffff).setDepth(5);
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  _buildHud() {
    txt(this, 8, 8,  'F: FART',   { fontSize: '8px', color: '#f5e642' }).setScrollFactor(0).setDepth(20);
    txt(this, 8, 20, 'WASD: MOVE',{ fontSize: '8px', color: '#aaaaaa' }).setScrollFactor(0).setDepth(20);
    txt(this, ARENA_W / 2, ARENA_H - 10, 'DODGE THE ELECTRIC SHOCK!',
      { fontSize: '8px', color: '#ffff44' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  _setupInput() {
    this._keys = this.input.keyboard.addKeys({
      up:       Phaser.Input.Keyboard.KeyCodes.W,
      down:     Phaser.Input.Keyboard.KeyCodes.S,
      left:     Phaser.Input.Keyboard.KeyCodes.A,
      right:    Phaser.Input.Keyboard.KeyCodes.D,
      upAlt:    Phaser.Input.Keyboard.KeyCodes.UP,
      downAlt:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      leftAlt:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      rightAlt: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    });
    this._fartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
  }

  // ─── Timers ───────────────────────────────────────────────────────────────

  _setupTimers() {
    // Pitch a baseball every 3s
    this.time.addEvent({ delay: PITCH_INTERVAL, loop: true,
      callback: this._pitch, callbackScope: this });

    // Electric shockwave every 7s
    this.time.addEvent({ delay: ELECTRIC_INTERVAL, loop: true,
      callback: this._startElectric, callbackScope: this });
  }

  // ─── Intro ────────────────────────────────────────────────────────────────

  _runIntroCutscene() {
    this.cameras.main.zoomTo(2.5, 0);
    this.cameras.main.pan(this._maxX, this._maxY, 0);
    this._alertLabel.setVisible(true);

    this.time.delayedCall(300, () => {
      this.cameras.main.zoomTo(1, 800, Phaser.Math.Easing.Quadratic.Out);
      this.cameras.main.pan(ARENA_W / 2, ARENA_H / 2, 800);
    });

    this.time.delayedCall(1200, () => {
      this._alertLabel.setVisible(false);
      this._inputLocked = false;
      this._maxState = 'PATROL';
    });
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  update() {
    if (this._defeated) return;
    this._updateLeo();
    this._updateMax();
    this._updatePitches();
  }

  _updateLeo() {
    if (this._inputLocked) return;

    let vx = 0, vy = 0;
    if (this._keys.left.isDown  || this._keys.leftAlt.isDown)  vx = -LEO_SPEED;
    if (this._keys.right.isDown || this._keys.rightAlt.isDown) vx =  LEO_SPEED;
    if (this._keys.up.isDown    || this._keys.upAlt.isDown)    vy = -LEO_SPEED;
    if (this._keys.down.isDown  || this._keys.downAlt.isDown)  vy =  LEO_SPEED;

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    const dt = 1 / 60;
    this._leoX = Phaser.Math.Clamp(this._leoX + vx * dt, FENCE_THICK + 8, ARENA_W - FENCE_THICK - 8);
    this._leoY = Phaser.Math.Clamp(this._leoY + vy * dt, FENCE_THICK + 8, ARENA_H - FENCE_THICK - 8);

    this._leoBody.setPosition(this._leoX, this._leoY);
    this._leoDot.setPosition(this._leoX, this._leoY - 12);

    // Fart
    if (Phaser.Input.Keyboard.JustDown(this._fartKey) && this._fartReady) {
      this._fartReady = false;
      const ring = this.add.circle(this._leoX, this._leoY, 6, 0xf5e642, 0.9).setDepth(8);
      this.tweens.add({
        targets: ring, displayWidth: FART_HIT_RANGE * 2, displayHeight: FART_HIT_RANGE * 2,
        alpha: 0, duration: 400, onComplete: () => ring.destroy(),
      });
      this._checkFartHit();
      this.game.events.emit('ability-used', { abilityId: 'lightning_fart', cooldown: this._fartCooldownMs });
      this.time.delayedCall(this._fartCooldownMs, () => { this._fartReady = true; });
    }
  }

  _updateMax() {
    const dt = 1 / 60;

    if (this._maxState === 'PATROL') {
      this._maxX += this._maxVx * dt;
      const left = FENCE_THICK + 30, right = ARENA_W - FENCE_THICK - 30;
      if (this._maxX <= left || this._maxX >= right) {
        this._maxVx *= -1;
        this._maxX = Phaser.Math.Clamp(this._maxX, left, right);
      }
      const dx = this._leoX - this._maxX, dy = this._leoY - this._maxY;
      if (Math.sqrt(dx * dx + dy * dy) < CHASE_RANGE) this._maxState = 'CHASE';

    } else if (this._maxState === 'CHASE') {
      const dx = this._leoX - this._maxX, dy = this._leoY - this._maxY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        this._maxX += (dx / dist) * CHASE_SPEED * dt;
        this._maxY += (dy / dist) * CHASE_SPEED * dt;
      }
      if (dist > CHASE_RANGE * 1.3) this._maxState = 'PATROL';

      // Swing attack when very close
      if (dist < SWING_RANGE && !this._swingActive) this._doSwing();

      // Contact damage
      if (dist < 22 && Date.now() - this._lastContact > CONTACT_COOLDOWN) {
        this._lastContact = Date.now();
        this._resources.applyChanges({ energy: -CONTACT_DAMAGE });
        this.cameras.main.shake(150, 0.008);
        if (!this._defeated && this._resources.isExhausted()) this._gameOver();
      }

    } else if (this._maxState === 'STUNNED') {
      // Handled by timer
    }

    // Keep Max in upper half
    this._maxX = Phaser.Math.Clamp(this._maxX, FENCE_THICK + 5, ARENA_W - FENCE_THICK - 5);
    this._maxY = Phaser.Math.Clamp(this._maxY, FENCE_THICK + 5, ARENA_H / 2 + 30);

    // Sync visuals
    this._maxBody.setPosition(this._maxX, this._maxY);
    this._maxHelmet.setPosition(this._maxX, this._maxY - 14);
    this._maxBat.setPosition(this._maxX + 20, this._maxY + 4);
    this._alertLabel.setPosition(this._maxX, this._maxY - 32);
    this._swingLabel.setPosition(this._maxX, this._maxY - 32);
  }

  _updatePitches() {
    const dt = 1 / 60;
    for (let i = this._pitches.length - 1; i >= 0; i--) {
      const b = this._pitches[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.sprite.setPosition(b.x, b.y);
      b.sprite.angle += 8;

      if (b.x < -20 || b.x > ARENA_W + 20 || b.y < -20 || b.y > ARENA_H + 20) {
        b.sprite.destroy();
        this._pitches.splice(i, 1);
        continue;
      }

      const dx = b.x - this._leoX, dy = b.y - this._leoY;
      if (Math.sqrt(dx * dx + dy * dy) < 18) {
        this._resources.applyChanges({ energy: -PITCH_DAMAGE });
        this.cameras.main.shake(150, 0.007);
        if (!this._defeated && this._resources.isExhausted()) this._gameOver();
        b.sprite.destroy();
        this._pitches.splice(i, 1);
      }
    }
  }

  // ─── Attacks ──────────────────────────────────────────────────────────────

  _pitch() {
    if (this._maxState === 'STUNNED' || this._defeated || this._inputLocked) return;

    const angleToLeo = Math.atan2(this._leoY - this._maxY, this._leoX - this._maxX);
    // At lower HP, throw 2 baseballs
    const count = this._maxHp <= 2 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const spread = i === 0 ? 0 : (Math.random() - 0.5) * 0.4;
      const a = angleToLeo + spread;
      const sprite = this.add.circle(this._maxX, this._maxY, 7, 0xffeedd).setDepth(6);
      // Stitching detail
      this.add.rectangle(this._maxX, this._maxY, 3, 7, 0xff4444, 0.6).setDepth(7);
      this._pitches.push({ x: this._maxX, y: this._maxY,
        vx: Math.cos(a) * BALL_SPEED, vy: Math.sin(a) * BALL_SPEED, sprite });
    }
  }

  _doSwing() {
    if (this._swingActive) return;
    this._swingActive = true;
    this._swingLabel.setVisible(true);

    // Bat arc tween
    this.tweens.add({
      targets: this._maxBat,
      angle: 180,
      duration: SWING_DURATION,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this._maxBat.angle = 0;
        this._swingLabel.setVisible(false);
        this._swingActive = false;
      },
    });

    // Damage if Leo is still close mid-swing
    this.time.delayedCall(SWING_DURATION / 2, () => {
      const dx = this._leoX - this._maxX, dy = this._leoY - this._maxY;
      if (Math.sqrt(dx * dx + dy * dy) < SWING_RANGE + 10) {
        this._resources.applyChanges({ energy: -SWING_DAMAGE });
        this.cameras.main.shake(200, 0.012);
        if (!this._defeated && this._resources.isExhausted()) this._gameOver();
      }
    });
  }

  _startElectric() {
    if (this._maxState === 'STUNNED' || this._defeated || this._inputLocked) return;
    if (this._electricCharging || this._electricActive) return;

    this._electricCharging = true;

    // Warning flash on Max
    this._chargeLabel.setVisible(true);
    let flashCount = 0;
    const flashTimer = this.time.addEvent({
      delay: 150, repeat: 7,
      callback: () => {
        flashCount++;
        this._maxBody.setFillStyle(flashCount % 2 === 0 ? 0xcc4400 : 0xffff00);
      },
    });

    // Also show warning ring on arena floor
    const warnRing = this.add.graphics().setDepth(4);
    warnRing.lineStyle(3, 0xffff00, 0.5);
    warnRing.strokeCircle(ARENA_W / 2, ARENA_H / 2, ELECTRIC_RADIUS);

    this.time.delayedCall(ELECTRIC_WIND_UP, () => {
      this._electricCharging = false;
      this._chargeLabel.setVisible(false);
      this._maxBody.setFillStyle(0xcc4400);
      warnRing.destroy();

      if (this._maxState === 'STUNNED' || this._defeated) return;
      this._releaseElectric();
    });
  }

  _releaseElectric() {
    this._electricActive = true;
    this.cameras.main.shake(300, 0.01);

    // Expanding electric ring from Max's position
    const ring = this.add.graphics().setDepth(9);
    let radius = 5;

    const expand = this.time.addEvent({
      delay: 16, repeat: Math.floor(ELECTRIC_EXPAND / 16),
      callback: () => {
        ring.clear();
        ring.lineStyle(6, 0xffff00, 0.85);
        ring.strokeCircle(this._maxX, this._maxY, radius);
        ring.lineStyle(3, 0xffffff, 0.5);
        ring.strokeCircle(this._maxX, this._maxY, radius - 4);

        // Check Leo hit as ring passes through him
        const leoR = Math.sqrt(
          (this._leoX - this._maxX) ** 2 + (this._leoY - this._maxY) ** 2
        );
        if (Math.abs(leoR - radius) < 14) {
          this._resources.applyChanges({ energy: -ELECTRIC_DAMAGE });
          this.cameras.main.flash(200, 255, 255, 0);
          this.cameras.main.shake(200, 0.014);
          if (!this._defeated && this._resources.isExhausted()) this._gameOver();
        }

        radius += ELECTRIC_RADIUS / (ELECTRIC_EXPAND / 16);
      },
    });

    this.time.delayedCall(ELECTRIC_EXPAND + 100, () => {
      ring.destroy();
      this._electricActive = false;
    });
  }

  // ─── Fart hit ─────────────────────────────────────────────────────────────

  _checkFartHit() {
    const dx = this._maxX - this._leoX, dy = this._maxY - this._leoY;
    if (Math.sqrt(dx * dx + dy * dy) > FART_HIT_RANGE) return;

    this._maxHp--;
    this._maxHpFill.scaleX = Math.max(0, this._maxHp / MAX_HP);

    this._maxBody.setFillStyle(0xffffff);
    this.time.delayedCall(120, () => this._maxBody.setFillStyle(0xcc4400));

    if (this._maxHp <= 0) {
      this._defeatMax();
      return;
    }

    this._maxState = 'STUNNED';
    this._swingLabel.setVisible(false);
    this._chargeLabel.setVisible(false);
    this._electricCharging = false;
    this.time.delayedCall(STUN_DURATION, () => {
      if (!this._defeated) this._maxState = 'CHASE';
    });
  }

  // ─── Game over ────────────────────────────────────────────────────────────

  _gameOver() {
    this._defeated    = true;
    this._inputLocked = true;

    if (!this._gauntlet) {
      this.cameras.main.fade(600, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) this.scene.start('GameOverScene', { reason: 'energy' });
      });
      return;
    }

    const donuts    = this._gauntletData.donuts ?? 0;
    const stolen    = Math.ceil(donuts / 2);
    const newDonuts = donuts - stolen;
    this._resources.applyChanges({ energy: 100 - this._resources.energy });
    this._gauntletData = { ...this._gauntletData, donuts: newDonuts };

    const msg = stolen > 0
      ? `MAX STEALS ${stolen} DONUT${stolen !== 1 ? 'S' : ''}!`
      : 'MAX TRIES TO STEAL — BUT YOU HAD NONE LEFT!';

    const overlay = this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.78).setDepth(40);
    const t1 = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 16, 'YOU LOST!', { fontSize: '12px', color: '#ff4444' }).setOrigin(0.5).setDepth(41);
    const t2 = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 4,  msg,         { fontSize: '8px',  color: '#f5a623' }).setOrigin(0.5).setDepth(41);
    const t3 = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 20, `DONUTS LEFT: ${newDonuts}`, { fontSize: '8px', color: '#aaaaaa' }).setOrigin(0.5).setDepth(41);

    this.time.delayedCall(2400, () => {
      [overlay, t1, t2, t3].forEach(o => o.destroy());
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(420, () => this.scene.start(SCENE_BOSS_GAUNTLET, this._gauntletData));
    });
  }

  _offerDonutRecharge(onDone) {
    const energy = this._resources.energy;
    const donuts = this._gauntletData.donuts ?? 0;
    if (energy >= 100 || donuts <= 0) { onDone(); return; }

    const overlay = this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.82).setDepth(40);
    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 24, 'ENERGY LOW!', { fontSize: '10px', color: '#ff8888' }).setOrigin(0.5).setDepth(41);
    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 8, `EAT A DONUT TO RECHARGE?  (${donuts} left)`, { fontSize: '7px', color: '#f5e642' }).setOrigin(0.5).setDepth(41);

    const yesBg = this.add.rectangle(BASE_WIDTH / 2 - 36, BASE_HEIGHT / 2 + 14, 60, 14, 0x1a3a1a).setDepth(41).setInteractive({ useHandCursor: true });
    txt(this, BASE_WIDTH / 2 - 36, BASE_HEIGHT / 2 + 14, 'YES', { fontSize: '8px', color: '#88ff88' }).setOrigin(0.5).setDepth(42);
    const noBg  = this.add.rectangle(BASE_WIDTH / 2 + 36, BASE_HEIGHT / 2 + 14, 60, 14, 0x2a1a1a).setDepth(41).setInteractive({ useHandCursor: true });
    txt(this, BASE_WIDTH / 2 + 36, BASE_HEIGHT / 2 + 14, 'NO', { fontSize: '8px', color: '#ff8888' }).setOrigin(0.5).setDepth(42);

    const cleanup = () => this.children.list.filter(c => c.depth >= 40).forEach(c => c.destroy());

    yesBg.once('pointerdown', () => {
      this._gauntletData = { ...this._gauntletData, donuts: donuts - 1 };
      this._resources.applyChanges({ energy: 100 - this._resources.energy });
      cleanup();
      onDone();
    });
    noBg.once('pointerdown', () => { cleanup(); onDone(); });
  }

  // ─── Defeat ───────────────────────────────────────────────────────────────

  _defeatMax() {
    this._defeated    = true;
    this._inputLocked = true;
    this._maxHpFill.scaleX = 0;

    this._pitches.forEach(b => b.sprite.destroy());
    this._pitches = [];
    this._chargeLabel.setVisible(false);
    this._swingLabel.setVisible(false);

    this.tweens.add({
      targets: [this._maxBody, this._maxHelmet, this._maxBat],
      angle:   720,
      scaleX:  0,
      scaleY:  0,
      alpha:   0,
      duration: 800,
      ease: 'Quad.easeIn',
    });

    // Electric spark burst on defeat
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spark = this.add.rectangle(
        this._maxX + Math.cos(angle) * 20,
        this._maxY + Math.sin(angle) * 20,
        3, 12, 0xffff00
      ).setAngle(Phaser.Math.RadToDeg(angle)).setDepth(10);
      this.tweens.add({ targets: spark, x: spark.x + Math.cos(angle) * 40,
        y: spark.y + Math.sin(angle) * 40, alpha: 0, duration: 500,
        onComplete: () => spark.destroy() });
    }

    this.time.delayedCall(400, () => {
      txt(this, ARENA_W / 2, ARENA_H / 2, "JUSTIN'S MAX DEFEATED!", {
        fontSize: '8px', color: '#ffff44',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(30);
    });

    this.time.delayedCall(900, () => {
      const victoryScript = this._gauntlet ? 'gauntlet_max_baseball_win' : 'justin_after_max';
      this.scene.get(SCENE_DIALOGUE).showScript(victoryScript, () => {
        if (this._gauntlet) {
          this._offerDonutRecharge(() => {
            this.cameras.main.fade(500, 0, 0, 0);
            this.time.delayedCall(520, () => this.scene.start(SCENE_BOSS_GAUNTLET, this._gauntletData));
          });
        } else {
          this.cameras.main.fade(500, 0, 0, 0);
          this.time.delayedCall(520, () => this.scene.start(SCENE_NEIGHBORHOOD, { justinMaxDefeated: true, spawnCol: 312, spawnRow: 123 }));
        }
      });
    });
  }
}
