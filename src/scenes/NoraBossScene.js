import {
  SCENE_NORA_BOSS, SCENE_DIALOGUE, SCENE_NEIGHBORHOOD, SCENE_BOSS_GAUNTLET, SCENE_HUD,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, SPRITE_LEO, txt, MUSIC_BOSS,
} from '../constants.js';
import AudioManager from '../systems/AudioManager.js';
import FX from '../systems/FX.js';
import { createHearts } from '../ui/BossHud.js';
import { registerCharacterAnims } from '../utils/AnimationRegistry.js';
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

// Pool geometry — round hot-tub in bottom-right of nora_boss_level.png
// Pool — an ellipse matched to the water in the art (mostly off-screen SE).
// Leo triggers the splash the moment his centre crosses the water's edge.
const POOL = { x: 425, y: 228, rx: 123, ry: 51 };

// Stone firepit — solid obstacle Leo rides around (oval, matched to the art)
const FIREPIT = { x: 132, y: 171, rx: 38, ry: 22 };

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
const CONTACT_DAMAGE   = 15;
const CONTACT_COOLDOWN = 1400;
// Pool: same stun+push penalty as Grace's fight (no energy drain)
const POOL_STUN_MS     = 1500; // ms Leo is stunned after falling in the pool
const POOL_PUSH_DIST   = 40;   // px pushed away from pool edge on entry

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
    AudioManager.playMusic(this, MUSIC_BOSS);
    this._resources = this.game.registry.get('resources');
    this._party     = this.game.registry.get('party');
    this._abilities = this.game.registry.get('abilities');

    if (!this._resources) {
      this._resources = new ResourceSystem(this.game);
      this._party     = new PartySystem(this.game);
      this._abilities = new AbilitySystem(this.game, this._party);
    }

    // Boss fights always start at full energy (5 hearts)
    this._resources.applyChanges({ energy: 100 - this._resources.energy });

    // Hide the neighborhood HUD during the fight
    this.scene.sleep(SCENE_HUD);

    this._abilities.register('lightning_fart', (scene, player) => {
      AudioManager.playFart(scene);
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
    this._leoStunned     = false;
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
    // Background image — replaces all primitive visuals
    if (this.textures.exists('bg-nora')) {
      this.add.image(0, 0, 'bg-nora').setOrigin(0, 0).setDisplaySize(ARENA_W, ARENA_H).setDepth(0);
    } else {
      // Fallback
      this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 0x3a7a2a);
      this.add.rectangle(ARENA_W / 2, BAR_Y, ARENA_W, BAR_H, BAR_COLOR);
    }
    // Pool collision zone is invisible — the POOL ellipse drives the hazard logic
    // Bar collision zone — Leo cannot cross into the bar area (clamped in _updateLeo)
  }

  // ─── Nora visual ──────────────────────────────────────────────────────────

  _buildNora() {
    if (this.textures.exists('sprite-nora-char')) {
      this._noraBody = this.add.image(this._noraX, this._noraY, 'sprite-nora-char').setDisplaySize(40, 56).setDepth(6);
      this._noraImg = true;
    } else {
      this._noraBody = this.add.rectangle(this._noraX, this._noraY, T * 2, T * 2.8, 0xff8c00).setDepth(6);
      this._noraImg = false;
    }
    // Shirt + held ball — only shown for the rectangle fallback (art includes them)
    this._noraShirt = this.add.rectangle(this._noraX, this._noraY - 3, T * 2, T * 1.4, 0xdd2200).setDepth(7).setVisible(!this._noraImg);
    this._noraBall  = this.add.circle(this._noraX + 16, this._noraY + 6, 7, 0xffffff).setDepth(7).setVisible(!this._noraImg);
    this._noraBallDot = this.add.circle(this._noraX + 16, this._noraY + 6, 3, 0x222222).setDepth(8).setVisible(!this._noraImg);

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
    if (this.textures.exists(SPRITE_LEO)) {
      registerCharacterAnims(this.anims, SPRITE_LEO);
      this._leoSprite = this.add.sprite(this._leoX, this._leoY, SPRITE_LEO, 'down-0')
        .setDisplaySize(T * 3, T * 3).setDepth(6);
      this._leoBody = null;
      this._leoDot  = null;
    } else {
      this._leoSprite = null;
      this._leoBody = this.add.rectangle(this._leoX, this._leoY, T * 2, T * 2.5, 0x4488ff).setDepth(6);
      this._leoDot  = this.add.rectangle(this._leoX, this._leoY - 12, 6, 4, 0xffffff).setDepth(6);
    }
    this._leoFacing = 'down';
  }

  _moveLeoVisual(vx, vy) {
    if (this._leoSprite) {
      this._leoSprite.setPosition(this._leoX, this._leoY);
      if (Math.abs(vx) >= Math.abs(vy)) { if (vx > 0) this._leoFacing = 'right'; else if (vx < 0) this._leoFacing = 'left'; }
      else                              { if (vy > 0) this._leoFacing = 'down';  else if (vy < 0) this._leoFacing = 'up'; }
      const moving  = vx !== 0 || vy !== 0;
      const animKey = moving ? `${SPRITE_LEO}-walk-${this._leoFacing}` : `${SPRITE_LEO}-idle-${this._leoFacing}`;
      if (this._leoSprite.anims?.currentAnim?.key !== animKey) this._leoSprite.play(animKey);
    } else {
      this._leoBody.setPosition(this._leoX, this._leoY);
      this._leoDot.setPosition(this._leoX, this._leoY - 12);
    }
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  _buildHud() {
    txt(this, 8, 8,  'F: FART',   { fontSize: '8px', color: '#f5e642' }).setScrollFactor(0).setDepth(20);
    txt(this, 8, 20, 'WASD: MOVE',{ fontSize: '8px', color: '#aaaaaa' }).setScrollFactor(0).setDepth(20);
    txt(this, ARENA_W / 2, ARENA_H - 10, 'FART NORA WHEN SHE EMERGES!',
      { fontSize: '8px', color: '#ffaa44' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    // Leo hearts — matches Grace's fight
    this._heartsUpdate = createHearts(this, ARENA_W);
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
    this._vulnerable  = true; // exposed while running to cover — Leo can still hit her
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
    if (this._fxFrozen) return; // hit-stop
    this._updateLeo();
    this._updateNora();
    this._updateBalls();
    this._checkPoolHazard();
  }

  _updateLeo() {
    if (this._inputLocked || this._leoStunned) return;

    let vx = 0, vy = 0;
    if (this._keys.left.isDown  || this._keys.leftAlt.isDown)  vx = -LEO_SPEED;
    if (this._keys.right.isDown || this._keys.rightAlt.isDown) vx =  LEO_SPEED;
    if (this._keys.up.isDown    || this._keys.upAlt.isDown)    vy = -LEO_SPEED;
    if (this._keys.down.isDown  || this._keys.downAlt.isDown)  vy =  LEO_SPEED;

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    const dt = 1 / 60;
    const nx = Phaser.Math.Clamp(this._leoX + vx * dt, 12, ARENA_W - 12);
    const ny = Phaser.Math.Clamp(this._leoY + vy * dt, BAR_Y + BAR_H / 2 + 8, ARENA_H - 12);
    if (!this._inFirepit(nx, ny))              { this._leoX = nx; this._leoY = ny; }
    else if (!this._inFirepit(nx, this._leoY)) { this._leoX = nx; }
    else if (!this._inFirepit(this._leoX, ny)) { this._leoY = ny; }

    this._moveLeoVisual(vx, vy);

    // Fart
    if (Phaser.Input.Keyboard.JustDown(this._fartKey) && this._fartReady) {
      this._fartReady = false;
      AudioManager.playFart(this);
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
        this._heartsUpdate(this._resources.energy / 100);
        this.cameras.main.shake(150, 0.008);
        this._leoHurtFx(CONTACT_DAMAGE);
        if (!this._defeated && this._resources.isExhausted()) this._gameOver();
      }
    }

    // Keep Nora off-screen-bottom (no going behind pool)
    this._noraY = Phaser.Math.Clamp(this._noraY, BAR_Y - 8, POOL.y - POOL.ry - 20);

    this._noraBody.setPosition(this._noraX, this._noraY);
    this._noraShirt.setPosition(this._noraX, this._noraY - 3);
    this._noraBall.setPosition(this._noraX + 16, this._noraY + 6);
    this._noraBallDot.setPosition(this._noraX + 16, this._noraY + 6);
    this._alertLabel.setPosition(this._noraX, this._noraY - 28);

    // Nora is only hidden once she's actually behind the bar (SHOOT). While she's
    // travelling to a cabinet she stays visible so the player sees her run to cover
    // instead of vanishing and reappearing elsewhere.
    const hiding = (this._noraState === 'SHOOT');
    this._noraBody.setAlpha(hiding ? 0 : 1);
    this._noraShirt.setAlpha(hiding ? 0 : 1);
    this._noraBall.setAlpha(hiding ? 0 : 1);
    this._noraBallDot.setAlpha(hiding ? 0 : 1);
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
        this._heartsUpdate(this._resources.energy / 100);
        this.cameras.main.shake(120, 0.006);
        this._leoHurtFx(BALL_DAMAGE);
        if (!this._defeated && this._resources.isExhausted()) this._gameOver();
        b.sprite.destroy(); b.dot.destroy();
        this._balls.splice(i, 1);
      }
    }
  }

  // Tint the boss body — image (setTint) or fallback rectangle (setFillStyle).
  _noraTint(color) {
    if (this._noraImg) {
      if (color === null) this._noraBody.clearTint();
      else this._noraBody.setTint(color);
    } else {
      this._noraBody.setFillStyle(color === null ? 0xff8c00 : color);
    }
  }

  _inFirepit(x, y) {
    const dx = (x - FIREPIT.x) / (FIREPIT.rx + 7);
    const dy = (y - FIREPIT.y) / (FIREPIT.ry + 7);
    return dx * dx + dy * dy < 1;
  }

  _checkPoolHazard() {
    if (this._leoStunned) return;
    // Ellipse containment: e < 1 means Leo's centre is over the water
    const vx = this._leoX - POOL.x, vy = this._leoY - POOL.y;
    const e = (vx / POOL.rx) ** 2 + (vy / POOL.ry) ** 2;
    if (e >= 1) return;

    const splashX = this._leoX, splashY = this._leoY;

    // Push Leo radially out to the water's edge + extra distance
    const s = 1 / Math.sqrt(Math.max(e, 0.0001));       // scale to the ellipse edge
    const edgeX = POOL.x + vx * s, edgeY = POOL.y + vy * s;
    const len = Math.hypot(vx, vy) || 1;
    this._leoX = edgeX + (vx / len) * POOL_PUSH_DIST;
    this._leoY = edgeY + (vy / len) * POOL_PUSH_DIST;
    this._leoX = Phaser.Math.Clamp(this._leoX, 12, ARENA_W - 12);
    this._leoY = Phaser.Math.Clamp(this._leoY, BAR_Y + BAR_H / 2 + 8, ARENA_H - 12);

    // Stun
    this._leoStunned = true;
    this.time.delayedCall(POOL_STUN_MS, () => { this._leoStunned = false; });

    // Splash SFX + ripple + blue flash + "SPLASH!" + Leo blink
    AudioManager.playSfx(this, 'sfx-splash', { volume: 0.9 });
    const ripple = this.add.circle(splashX, splashY, 6, 0x4db8f0, 0.85).setDepth(9);
    this.tweens.add({ targets: ripple, scaleX: 7, scaleY: 7, alpha: 0, duration: 650,
      onComplete: () => ripple.destroy() });
    this.cameras.main.flash(300, 0, 120, 255);
    const t = txt(this, splashX, splashY - 12, 'SPLASH!', { fontSize: '8px', color: '#88ddff' })
      .setOrigin(0.5).setDepth(10);
    this.tweens.add({ targets: t, y: t.y - 20, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    const leoVisual = this._leoSprite ?? this._leoBody;
    if (leoVisual) {
      this.tweens.add({ targets: leoVisual, alpha: 0.25, duration: 180, yoyo: true, repeat: 4,
        onComplete: () => leoVisual.setAlpha(1) });
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

  // Shared "Leo got hurt" juice: red burst + floating damage number.
  _leoHurtFx(amount) {
    FX.burst(this, this._leoX, this._leoY, {
      count: 9, colors: [0xff5252, 0xff8a80, 0xffffff],
      minSpeed: 35, maxSpeed: 100, minSize: 1, maxSize: 3, duration: 420, depth: 30,
    });
    FX.popText(this, this._leoX, this._leoY - 18, `-${amount}`, {
      color: '#ff5252', fontSize: '9px', rise: 22, duration: 600,
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

    AudioManager.playSfx(this, 'sfx-girly-nora', { volume: 0.9 });
    this._noraHp--;
    this._noraHpFill.scaleX = Math.max(0, this._noraHp / NORA_MAX_HP);

    this._noraTint(0xffffff);
    this.time.delayedCall(120, () => {
      if (!this._defeated) this._noraTint(null);
    });

    // ── Juice ──────────────────────────────────────────────────────────────
    FX.freeze(this, 60);
    FX.shake(this, 220, 0.012);
    FX.pop(this, this._noraBody, 0.4);
    FX.burst(this, this._noraX, this._noraY, {
      count: 12, colors: [0xd4e157, 0x9ccc65, 0xffffff],
      minSpeed: 40, maxSpeed: 130, minSize: 1, maxSize: 4, duration: 460, depth: 30,
    });
    const lastHit = this._noraHp <= 0;
    FX.popText(this, this._noraX, this._noraY - 22, lastHit ? 'K.O.!' : 'POW!', {
      color: lastHit ? '#ff5252' : '#ffee58',
      fontSize: lastHit ? '14px' : '12px', rise: 30, duration: 750,
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
        if (progress === 1) {
          this.scene.wake(SCENE_HUD);
          this.scene.start(SCENE_NEIGHBORHOOD, {
            bossLost: 'nora', bossScene: SCENE_NORA_BOSS, spawnCol: 295, spawnRow: 79,
          });
        }
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
          this.time.delayedCall(520, () => {
            this.scene.wake(SCENE_HUD);
            this.scene.start(SCENE_NEIGHBORHOOD, { noraDefeated: true, spawnCol: 295, spawnRow: 79 });
          });
        }
      });
    });
  }
}
