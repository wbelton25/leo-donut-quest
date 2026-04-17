import {
  SCENE_NORA_BOSS, SCENE_DIALOGUE, SCENE_NEIGHBORHOOD, SCENE_BOSS_GAUNTLET,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, txt,
} from '../constants.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import PartySystem from '../systems/PartySystem.js';

// ─── Nora Boss Scene ─────────────────────────────────────────────────────────
// Carson's backyard. Nora hides behind a row of outdoor bar cabinets (the
// "Lazy Lizard" bar) and shoots soccer balls at Leo from cover. She is only
// vulnerable to the fart shockwave when NOT behind a cabinet.
//
// Arena layout (480×270):
//   - Grass yard fills the space
//   - Swimming pool hazard bottom-center
//   - "LAZY LIZARD" bar counter across the top with 3 cabinets Nora hides in
//   - Leo starts bottom-center
//
// Nora state machine:
//   HIDE     → moves to a random cabinet; invulnerable while behind it
//   SHOOT    → fires soccer balls from cover; still invulnerable
//   EMERGE   → briefly leaves cabinet to taunt/move; VULNERABLE
//   CHASE    → rushes Leo for a moment before retreating back to HIDE
//   STUNNED  → after fart hit, brief stun
//   DEFEATED → spin + fade
//
// Leo must hit Nora with a fart ONLY during EMERGE or CHASE phases.
// Hitting Nora while she's behind a cabinet has no effect.
// Pool drains energy if Leo falls in.

const T = TILE_SIZE;

const ARENA_W = BASE_WIDTH;
const ARENA_H = BASE_HEIGHT;

// Pool geometry (bottom center)
const POOL_X = ARENA_W / 2;
const POOL_Y = ARENA_H - 55;
const POOL_W = 160;
const POOL_H = 40;

// Bar counter (top strip)
const BAR_Y      = 38;
const BAR_H      = 28;
const BAR_COLOR  = 0x8b5e2a;
const BAR_TOP    = 0xb07840;

// Cabinet positions (3 hiding spots behind the bar)
const CABINETS = [
  { x: 110, y: BAR_Y },
  { x: 240, y: BAR_Y },
  { x: 370, y: BAR_Y },
];

// Nora constants
const NORA_MAX_HP     = 3;
const MOVE_SPEED      = 130;
const CHASE_SPEED     = 160;
const EMERGE_DURATION = 2200; // ms Nora stays exposed
const HIDE_DURATION   = 1800; // ms Nora hides before shooting
const SHOOT_INTERVAL  = 700;  // ms between shots while hiding
const SHOTS_PER_HIDE  = 3;
const STUN_DURATION   = 1200;
const FART_HIT_RANGE  = 80;

// Damage
const BALL_DAMAGE      = 12;
const POOL_DRAIN_RATE  = 15; // energy per second in pool
const CONTACT_DAMAGE   = 15;
const CONTACT_COOLDOWN = 1400;

const BALL_SPEED = 200;
const LEO_SPEED  = 170;

export default class NoraBossScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_NORA_BOSS });
  }

  init(data) {
    this._gauntlet     = data?.gauntlet ?? false;
    this._gauntletData = data?.gauntletData ?? {};
  }

  create() {
    try {
      this._createImpl();
    } catch (err) {
      console.error('[NoraBossScene] create() threw:', err);
      this.add.text(10, 10, 'NORA SCENE ERROR:\n' + err.message, {
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

    this._noraHp         = NORA_MAX_HP;
    this._noraState      = 'HIDE';
    this._noraX          = CABINETS[1].x;
    this._noraY          = BAR_Y;
    this._targetCabinet  = 1;
    this._vulnerable     = false;
    this._lastContact    = 0;
    this._lastPoolDrain  = 0;
    this._fartReady      = true;
    this._fartCooldownMs = 4000;
    this._balls          = [];
    this._defeated       = false;
    this._inputLocked    = true;
    this._shotsRemaining = 0;

    this._leoX = ARENA_W / 2;
    this._leoY = ARENA_H - 90;

    this._buildArena();
    this._buildNora();
    this._buildLeo();
    this._buildHud();
    this._setupInput();
    this._runIntroCutscene();
  }

  // ─── Arena ────────────────────────────────────────────────────────────────

  _buildArena() {
    // Grass yard
    this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 0x3a7a2a);

    // Patio stones around bar area
    this.add.rectangle(ARENA_W / 2, BAR_Y + BAR_H / 2 + 20, ARENA_W, 24, 0x888877, 0.5);

    // Pool
    this.add.rectangle(POOL_X, POOL_Y, POOL_W + 10, POOL_H + 10, 0xaaaacc); // rim
    this._pool = this.add.rectangle(POOL_X, POOL_Y, POOL_W, POOL_H, 0x1a6eb4).setDepth(1);
    for (let i = 0; i < 3; i++) {
      this.add.rectangle(POOL_X - 55 + i * 55, POOL_Y, 35, 3, 0x4db8f0, 0.4).setDepth(2);
    }
    txt(this, POOL_X, POOL_Y - 6, 'POOL', { fontSize: '8px', color: '#7cc8f0' })
      .setOrigin(0.5).setDepth(2);

    // Pool floaties
    this.add.circle(POOL_X - 40, POOL_Y + 5, 10, 0xff6666, 0.8).setDepth(2);
    this.add.circle(POOL_X + 40, POOL_Y - 5, 8,  0xffff44, 0.8).setDepth(2);

    // Bar counter (full width, top)
    this.add.rectangle(ARENA_W / 2, BAR_Y, ARENA_W, BAR_H, BAR_COLOR);
    this.add.rectangle(ARENA_W / 2, BAR_Y - BAR_H / 2 + 3, ARENA_W, 6, BAR_TOP); // counter top

    // Lazy Lizard sign
    txt(this, ARENA_W / 2, BAR_Y - BAR_H / 2 - 14, '🦎 THE LAZY LIZARD 🦎', {
      fontSize: '8px', color: '#ffdd44',
      stroke: '#332200', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(5);

    // Cabinets (3 hiding spots)
    CABINETS.forEach((cab, i) => {
      const c = this.add.rectangle(cab.x, cab.y, 52, BAR_H - 4, 0x5a3a10).setDepth(3);
      this.add.rectangle(cab.x, cab.y, 50, BAR_H - 6, 0x7a5a20).setDepth(4);
      // Cabinet handle
      this.add.rectangle(cab.x + 10, cab.y, 3, 8, 0xddaa44).setDepth(5);
      this.add.rectangle(cab.x - 10, cab.y, 3, 8, 0xddaa44).setDepth(5);
    });

    // Bar stools
    [80, 170, 240, 310, 400].forEach(sx => {
      this.add.rectangle(sx, BAR_Y + BAR_H / 2 + 14, 14, 6, 0x6b3a10);
      this.add.rectangle(sx, BAR_Y + BAR_H / 2 + 22, 4, 16, 0x5a3010);
    });

    // Bottles on bar
    [130, 200, 280, 350].forEach(bx => {
      this.add.rectangle(bx, BAR_Y - 4, 5, 14, 0x44aa44, 0.9).setDepth(5);
      this.add.rectangle(bx, BAR_Y - 12, 3, 6, 0x88dd88, 0.7).setDepth(5);
    });

    // Deck chairs near pool
    [[POOL_X - 100, POOL_Y - 30], [POOL_X + 90, POOL_Y - 30]].forEach(([cx, cy]) => {
      this.add.rectangle(cx, cy, 30, 10, 0xddaa66).setDepth(1);
      this.add.rectangle(cx - 18, cy, 6, 14, 0xaa8844).setDepth(1);
    });
  }

  // ─── Nora visual ──────────────────────────────────────────────────────────

  _buildNora() {
    this._noraBody  = this.add.rectangle(this._noraX, this._noraY, T * 2, T * 2.8, 0xff8c00).setDepth(6);
    this._noraShirt = this.add.rectangle(this._noraX, this._noraY - 3, T * 2, T * 1.4, 0xdd2200).setDepth(7);
    this._noraBall  = this.add.circle(this._noraX + 16, this._noraY + 6, 7, 0xffffff).setDepth(7);
    this._noraBallDot = this.add.circle(this._noraX + 16, this._noraY + 6, 3, 0x222222).setDepth(8);

    this._noraHpBg   = this.add.rectangle(ARENA_W / 2, 16, 160, 8, 0x440000).setScrollFactor(0).setDepth(20);
    this._noraHpFill = this.add.rectangle(ARENA_W / 2 - 78, 16, 156, 6, 0xff6600)
      .setScrollFactor(0).setDepth(21).setOrigin(0, 0.5);
    txt(this, ARENA_W / 2, 6, 'NORA', { fontSize: '8px', color: '#ffaa44' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(21);

    this._alertLabel = txt(this, this._noraX, this._noraY - 28, '!',
      { fontSize: '8px', color: '#ffff00' }).setOrigin(0.5).setDepth(9).setVisible(false);

    this._hidingLabel = txt(this, ARENA_W / 2, ARENA_H / 2 - 10, 'NORA IS HIDING!',
      { fontSize: '8px', color: '#aaaaaa' }).setOrigin(0.5).setScrollFactor(0).setDepth(25).setVisible(false);

    this._emergeLabel = txt(this, ARENA_W / 2, ARENA_H / 2 - 10, 'NOW! HIT HER!',
      { fontSize: '8px', color: '#ffff00', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(25).setVisible(false);
  }

  // ─── Leo visual ───────────────────────────────────────────────────────────

  _buildLeo() {
    this._leoBody = this.add.rectangle(this._leoX, this._leoY, T * 2, T * 2.5, 0x4488ff).setDepth(6);
    this._leoDot  = this.add.rectangle(this._leoX, this._leoY - 12, 6, 4, 0xffffff).setDepth(6);
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  _buildHud() {
    txt(this, 8, 8,  'F: FART',   { fontSize: '8px', color: '#f5e642' }).setScrollFactor(0).setDepth(20);
    txt(this, 8, 20, 'WASD: MOVE',{ fontSize: '8px', color: '#aaaaaa' }).setScrollFactor(0).setDepth(20);
    txt(this, ARENA_W / 2, ARENA_H - 10, 'FART NORA WHEN SHE EMERGES!',
      { fontSize: '8px', color: '#ffaa44' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
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

  // ─── Intro ────────────────────────────────────────────────────────────────

  _runIntroCutscene() {
    this.cameras.main.zoomTo(2, 0);
    this.cameras.main.pan(CABINETS[1].x, BAR_Y, 0);
    this._alertLabel.setVisible(true);

    this.time.delayedCall(300, () => {
      this.cameras.main.zoomTo(1, 800, Phaser.Math.Easing.Quadratic.Out);
      this.cameras.main.pan(ARENA_W / 2, ARENA_H / 2, 800);
    });

    this.time.delayedCall(1200, () => {
      this._alertLabel.setVisible(false);
      this._inputLocked = false;
      this._enterHideState();
    });
  }

  // ─── State transitions ────────────────────────────────────────────────────

  _enterHideState() {
    if (this._defeated) return;
    this._noraState   = 'MOVING_TO_CABINET';
    this._vulnerable  = false;
    this._hidingLabel.setVisible(false);
    this._emergeLabel.setVisible(false);

    // Pick a random cabinet (prefer one away from Leo)
    const options = [0, 1, 2].filter(i => i !== this._targetCabinet);
    this._targetCabinet = options[Math.floor(Math.random() * options.length)];
  }

  _startShooting() {
    if (this._defeated) return;
    this._noraState     = 'SHOOT';
    this._vulnerable    = false;
    this._shotsRemaining = SHOTS_PER_HIDE + (this._noraHp < 2 ? 1 : 0);
    this._hidingLabel.setVisible(true);
    this._scheduleNextShot();
  }

  _scheduleNextShot() {
    if (this._defeated || this._noraState !== 'SHOOT') return;
    this.time.delayedCall(SHOOT_INTERVAL, () => {
      if (this._defeated || this._noraState !== 'SHOOT') return;
      this._shootBall();
      this._shotsRemaining--;
      if (this._shotsRemaining > 0) {
        this._scheduleNextShot();
      } else {
        this._enterEmergeState();
      }
    });
  }

  _enterEmergeState() {
    if (this._defeated) return;
    this._noraState  = 'EMERGE';
    this._vulnerable = true;
    this._hidingLabel.setVisible(false);
    this._emergeLabel.setVisible(true);

    // Flash Nora to indicate vulnerability
    this.tweens.add({
      targets: this._noraBody,
      alpha: 0.4, yoyo: true, repeat: 4, duration: 200,
    });

    // After emerge window, chase briefly then hide again
    this.time.delayedCall(EMERGE_DURATION, () => {
      if (this._defeated || this._noraState !== 'EMERGE') return;
      this._emergeLabel.setVisible(false);
      this._noraState  = 'CHASE';
      this._vulnerable = true;

      this.time.delayedCall(1200, () => {
        if (this._defeated) return;
        this._enterHideState();
      });
    });
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  update() {
    if (this._defeated) return;
    this._updateLeo();
    this._updateNora();
    this._updateBalls();
    this._checkPoolHazard();
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
    this._leoX = Phaser.Math.Clamp(this._leoX + vx * dt, 12, ARENA_W - 12);
    this._leoY = Phaser.Math.Clamp(this._leoY + vy * dt, BAR_Y + BAR_H / 2 + 8, ARENA_H - 12);

    this._leoBody.setPosition(this._leoX, this._leoY);
    this._leoDot.setPosition(this._leoX, this._leoY - 12);

    // Fart
    if (Phaser.Input.Keyboard.JustDown(this._fartKey) && this._fartReady) {
      this._fartReady = false;
      const ring = this.add.circle(this._leoX, this._leoY, 6, 0xf5e642, 0.9).setDepth(9);
      this.tweens.add({
        targets: ring, displayWidth: FART_HIT_RANGE * 2, displayHeight: FART_HIT_RANGE * 2,
        alpha: 0, duration: 400, onComplete: () => ring.destroy(),
      });
      this._checkFartHit();
      this.game.events.emit('ability-used', { abilityId: 'lightning_fart', cooldown: this._fartCooldownMs });
      this.time.delayedCall(this._fartCooldownMs, () => { this._fartReady = true; });
    }
  }

  _updateNora() {
    const dt = 1 / 60;

    if (this._noraState === 'MOVING_TO_CABINET') {
      const target = CABINETS[this._targetCabinet];
      const dx = target.x - this._noraX, dy = target.y - this._noraY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 6) {
        this._noraX = target.x;
        this._noraY = target.y;
        this._startShooting();
      } else {
        this._noraX += (dx / dist) * MOVE_SPEED * dt;
        this._noraY += (dy / dist) * MOVE_SPEED * dt;
      }

    } else if (this._noraState === 'CHASE') {
      const dx = this._leoX - this._noraX, dy = this._leoY - this._noraY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        this._noraX += (dx / dist) * CHASE_SPEED * dt;
        this._noraY += (dy / dist) * CHASE_SPEED * dt;
      }
      // Contact damage during chase
      if (dist < 22 && Date.now() - this._lastContact > CONTACT_COOLDOWN) {
        this._lastContact = Date.now();
        this._resources.applyChanges({ energy: -CONTACT_DAMAGE });
        this.cameras.main.shake(150, 0.008);
        if (!this._defeated && this._resources.isExhausted()) this._gameOver();
      }
    }

    // Keep Nora off-screen-bottom (no going behind pool)
    this._noraY = Phaser.Math.Clamp(this._noraY, BAR_Y - 8, POOL_Y - POOL_H / 2 - 20);

    this._noraBody.setPosition(this._noraX, this._noraY);
    this._noraShirt.setPosition(this._noraX, this._noraY - 3);
    this._noraBall.setPosition(this._noraX + 16, this._noraY + 6);
    this._noraBallDot.setPosition(this._noraX + 16, this._noraY + 6);
    this._alertLabel.setPosition(this._noraX, this._noraY - 28);

    // Hide Nora's body behind cabinet when in hiding states
    const hiding = (this._noraState === 'SHOOT' || this._noraState === 'MOVING_TO_CABINET');
    this._noraBody.setAlpha(hiding ? 0.25 : 1);
    this._noraShirt.setAlpha(hiding ? 0.25 : 1);
    this._noraBall.setAlpha(hiding ? 0.5 : 1);
    this._noraBallDot.setAlpha(hiding ? 0.5 : 1);
  }

  _updateBalls() {
    const dt = 1 / 60;
    for (let i = this._balls.length - 1; i >= 0; i--) {
      const b = this._balls[i];
      b.x  += b.vx * dt;
      b.y  += b.vy * dt;
      b.sprite.setPosition(b.x, b.y);
      b.dot.setPosition(b.x, b.y);
      b.sprite.angle += b.vx > 0 ? 7 : -7;

      if (b.x < -20 || b.x > ARENA_W + 20 || b.y < -20 || b.y > ARENA_H + 20) {
        b.sprite.destroy(); b.dot.destroy();
        this._balls.splice(i, 1);
        continue;
      }

      const dx = b.x - this._leoX, dy = b.y - this._leoY;
      if (Math.sqrt(dx * dx + dy * dy) < 18) {
        this._resources.applyChanges({ energy: -BALL_DAMAGE });
        this.cameras.main.shake(120, 0.006);
        if (!this._defeated && this._resources.isExhausted()) this._gameOver();
        b.sprite.destroy(); b.dot.destroy();
        this._balls.splice(i, 1);
      }
    }
  }

  _checkPoolHazard() {
    const inPool = Math.abs(this._leoX - POOL_X) < POOL_W / 2 &&
                   Math.abs(this._leoY - POOL_Y) < POOL_H / 2;
    if (!inPool) return;

    const now = Date.now();
    if (now - this._lastPoolDrain > 500) {
      this._lastPoolDrain = now;
      this._resources.applyChanges({ energy: -POOL_DRAIN_RATE });
      this.cameras.main.shake(80, 0.004);
      if (!this._defeated && this._resources.isExhausted()) this._gameOver();
      // Push Leo toward nearest pool edge
      const edgeDx = this._leoX < POOL_X ? -(POOL_W / 2 + 10) : (POOL_W / 2 + 10);
      this._leoX = POOL_X + edgeDx;
    }
  }

  // ─── Attacks ──────────────────────────────────────────────────────────────

  _shootBall() {
    if (this._defeated) return;

    // Nora peeks slightly to shoot — visible for a moment
    const peek = this.tweens.add({
      targets: [this._noraBody, this._noraShirt],
      alpha: 0.9, duration: 150, yoyo: true,
    });

    const angle = Math.atan2(this._leoY - this._noraY, this._leoX - this._noraX);
    // Small random spread
    const spread = (Math.random() - 0.5) * 0.3;
    const a = angle + spread;
    const sprite = this.add.circle(this._noraX, this._noraY, 9, 0xffffff).setDepth(6);
    const dot    = this.add.circle(this._noraX, this._noraY, 3, 0x333333).setDepth(7);
    // Black pentagon detail
    this._balls.push({
      x: this._noraX, y: this._noraY,
      vx: Math.cos(a) * BALL_SPEED,
      vy: Math.sin(a) * BALL_SPEED,
      sprite, dot,
    });
  }

  // ─── Fart hit ─────────────────────────────────────────────────────────────

  _checkFartHit() {
    if (!this._vulnerable) {
      // Show "blocked" feedback
      txt(this, ARENA_W / 2, ARENA_H / 2 - 30, 'BLOCKED!',
        { fontSize: '8px', color: '#888888', stroke: '#000', strokeThickness: 2 })
        .setOrigin(0.5).setDepth(30)
        .setScrollFactor(0)
        ._timer = this.time.delayedCall(800, function() { this.destroy(); });
      return;
    }

    const dx = this._noraX - this._leoX, dy = this._noraY - this._leoY;
    if (Math.sqrt(dx * dx + dy * dy) > FART_HIT_RANGE) return;

    this._noraHp--;
    this._noraHpFill.scaleX = Math.max(0, this._noraHp / NORA_MAX_HP);

    this._noraBody.setFillStyle(0xffffff);
    this.time.delayedCall(120, () => {
      if (!this._defeated) this._noraBody.setFillStyle(0xff8c00);
    });

    if (this._noraHp <= 0) {
      this._defeatNora();
      return;
    }

    this._noraState  = 'STUNNED';
    this._vulnerable = false;
    this._emergeLabel.setVisible(false);
    this.time.delayedCall(STUN_DURATION, () => {
      if (!this._defeated) this._enterHideState();
    });
  }

  // ─── Game over ────────────────────────────────────────────────────────────

  _gameOver() {
    this._defeated    = true;
    this._inputLocked = true;

    if (!this._gauntlet) {
      this.cameras.main.fade(600, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) this.scene.start(SCENE_NEIGHBORHOOD, {
          bossLost: 'nora', bossScene: SCENE_NORA_BOSS, spawnCol: 295, spawnRow: 79,
        });
      });
      return;
    }

    const donuts    = this._gauntletData.donuts ?? 0;
    const stolen    = Math.ceil(donuts / 2);
    const newDonuts = donuts - stolen;
    this._resources.applyChanges({ energy: 100 - this._resources.energy });
    this._gauntletData = { ...this._gauntletData, donuts: newDonuts };

    const msg = stolen > 0
      ? `NORA STEALS ${stolen} DONUT${stolen !== 1 ? 'S' : ''}!`
      : 'NORA TRIES TO STEAL — BUT YOU HAD NONE LEFT!';

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

  _defeatNora() {
    this._defeated    = true;
    this._inputLocked = true;
    this._noraHpFill.scaleX = 0;
    this._hidingLabel.setVisible(false);
    this._emergeLabel.setVisible(false);

    this._balls.forEach(b => { b.sprite.destroy(); b.dot.destroy(); });
    this._balls = [];

    this.tweens.add({
      targets: [this._noraBody, this._noraShirt, this._noraBall, this._noraBallDot],
      angle: 720, scaleX: 0, scaleY: 0, alpha: 0,
      duration: 800, ease: 'Quad.easeIn',
    });

    this.time.delayedCall(400, () => {
      txt(this, ARENA_W / 2, ARENA_H / 2, 'NORA DEFEATED!', {
        fontSize: '8px', color: '#ffff44', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(30);
    });

    this.time.delayedCall(900, () => {
      const victoryScript = this._gauntlet ? 'gauntlet_nora_win' : 'carson_after_nora';
      this.scene.get(SCENE_DIALOGUE).showScript(victoryScript, () => {
        if (this._gauntlet) {
          this._offerDonutRecharge(() => {
            this.cameras.main.fade(500, 0, 0, 0);
            this.time.delayedCall(520, () => this.scene.start(SCENE_BOSS_GAUNTLET, this._gauntletData));
          });
        } else {
          this.cameras.main.fade(500, 0, 0, 0);
          this.time.delayedCall(520, () => this.scene.start(SCENE_NEIGHBORHOOD, { noraDefeated: true, spawnCol: 295, spawnRow: 79 }));
        }
      });
    });
  }
}
