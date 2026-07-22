import {
  SCENE_JUSTIN_MAX_BOSS, SCENE_DIALOGUE, SCENE_NEIGHBORHOOD, SCENE_BOSS_GAUNTLET, SCENE_HUD,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, SPRITE_LEO, txt, MUSIC_BOSS,
} from '../constants.js';
import AudioManager from '../systems/AudioManager.js';
import FX from '../systems/FX.js';
import { createHearts } from '../ui/BossHud.js';
import { registerCharacterAnims } from '../utils/AnimationRegistry.js';
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
// Playable yard — the house fills the top of the background, so play is confined
// below it (down to the front walkway).
const YARD_LEFT = 12, YARD_RIGHT = 468, YARD_TOP = 135, YARD_BOTTOM = 252;
// Max stays in the UPPER yard so Leo always keeps a dodge lane below him.
const MAX_Y_BOTTOM = YARD_TOP + 46; // 181
// Yard trees — oval trunk obstacles Leo rides around (matched to the art).
const TREES = [
  { x: 79,  y: 188, rx: 13, ry: 30 },
  { x: 406, y: 198, rx: 12, ry: 26 },
];

// Max constants
const MAX_HP            = 4;
const PATROL_SPEED      = 55;
const CHASE_SPEED       = 84;
const CHASE_RANGE       = 150;
const PITCH_INTERVAL    = 3000;
const ELECTRIC_INTERVAL = 7000;
const ELECTRIC_WIND_UP  = 1200;  // ms
const ELECTRIC_EXPAND   = 600;   // ms expansion
const ELECTRIC_RADIUS   = 140;   // max radius px (covers most of the arena — must hug walls)
const STUN_DURATION     = 1200;
const FART_HIT_RANGE    = 80;

// Damage
const PITCH_DAMAGE      = 14;
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
    AudioManager.playMusic(this, MUSIC_BOSS);
    this._resources = this.game.registry.get('resources');
    this._party     = this.game.registry.get('party');
    this._abilities = this.game.registry.get('abilities');

    if (!this._resources) {
      this._resources = new ResourceSystem(this.game);
      this._party     = new PartySystem(this.game);
      this._abilities = new AbilitySystem(this.game, this._party);
    }

    // Standalone (Act 1) boss fights start fresh at full energy. In the Act 3 gauntlet,
    // energy PERSISTS across bosses (set full once when the gauntlet begins) so that
    // spending a donut to recharge between fights actually matters.
    if (!this._gauntlet) this._resources.applyChanges({ energy: 100 - this._resources.energy });

    // Hide the neighborhood HUD during the fight
    this.scene.sleep(SCENE_HUD);

    this._abilities.register('lightning_fart', (scene, player) => {
      AudioManager.playFart(scene);
      const ring = scene.add.circle(player.x, player.y, 6, 0xf5e642, 0.9);
      scene.tweens.add({ targets: ring, radius: FART_HIT_RANGE, alpha: 0, duration: 400,
        onComplete: () => ring.destroy() });
    });

    this._maxHp          = MAX_HP;
    this._maxState       = 'PATROL';
    this._maxUnleashed   = false; // becomes true on Leo's first fart
    this._maxX           = 130;
    this._maxY           = 155;
    this._maxVx          = PATROL_SPEED;
    this._lastContact    = 0;
    this._fartReady      = true;
    this._fartCooldownMs = 4000;
    this._pitches        = [];   // flying baseballs
    this._electricActive = false;
    this._electricCharging = false;
    this._defeated       = false;
    this._inputLocked    = true;

    this._leoX = 340;
    this._leoY = ARENA_H - 30;

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
    // Full-scene background art drops in here; otherwise fall back to the
    // procedural ball-field. The wooden fence marks Leo's play boundary, so it's
    // always drawn on top even when art is present.
    if (this.textures.exists('bg-justin-max')) {
      this.add.image(0, 0, 'bg-justin-max').setOrigin(0, 0).setDisplaySize(ARENA_W, ARENA_H).setDepth(-1);
    } else {
      // Grass yard
      this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 0x3a7a3a);

      // Grass stripes
      for (let i = 0; i < 5; i++) {
        if (i % 2 === 0) {
          const sw = ARENA_W / 5;
          this.add.rectangle(sw * i + sw / 2, ARENA_H / 2, sw, ARENA_H, 0x3e8040, 0.35);
        }
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

      // Wooden fence (4 sides) + posts — only for the procedural fallback.
      // With real background art these would "bleed" a brown frame over the yard.
      this.add.rectangle(ARENA_W / 2, FENCE_THICK / 2, ARENA_W, FENCE_THICK, 0x8b5e2a);
      this.add.rectangle(ARENA_W / 2, ARENA_H - FENCE_THICK / 2, ARENA_W, FENCE_THICK, 0x8b5e2a);
      this.add.rectangle(FENCE_THICK / 2, ARENA_H / 2, FENCE_THICK, ARENA_H, 0x8b5e2a);
      this.add.rectangle(ARENA_W - FENCE_THICK / 2, ARENA_H / 2, FENCE_THICK, ARENA_H, 0x8b5e2a);
      for (let x = 0; x <= ARENA_W; x += 30) {
        this.add.rectangle(x, FENCE_THICK / 2, 4, FENCE_THICK + 4, 0x5a3a10);
        this.add.rectangle(x, ARENA_H - FENCE_THICK / 2, 4, FENCE_THICK + 4, 0x5a3a10);
      }
    }
  }

  // ─── Max visual ───────────────────────────────────────────────────────────

  _buildMax() {
    if (this.textures.exists('sprite-justin-max-char')) {
      this._maxBody = this.add.image(this._maxX, this._maxY, 'sprite-justin-max-char').setDepth(5);
      this._maxBody.setScale(60 / this._maxBody.height); // scale to ~60px tall, keep aspect
      this._maxImg = true;
    } else {
      this._maxBody = this.add.rectangle(this._maxX, this._maxY, T * 2.5, T * 3, 0xcc4400).setDepth(5);
      this._maxImg = false;
    }
    // Helmet + bat — only shown for the rectangle fallback (the art includes them)
    this._maxHelmet  = this.add.rectangle(this._maxX, this._maxY - 14, T * 2.5, T, 0x992200).setDepth(6).setVisible(!this._maxImg);
    this._maxBat     = this.add.rectangle(this._maxX + 20, this._maxY + 4, T * 0.5, T * 2.5, 0x9b6820).setDepth(6).setVisible(!this._maxImg);

    this._maxHpBg   = this.add.rectangle(ARENA_W / 2, 16, 160, 8, 0x440000).setScrollFactor(0).setDepth(20);
    this._maxHpFill = this.add.rectangle(ARENA_W / 2 - 78, 16, 156, 6, 0xff4400)
      .setScrollFactor(0).setDepth(21).setOrigin(0, 0.5);
    txt(this, ARENA_W / 2, 6, "MAX", { fontSize: '8px', color: '#ffaa44' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(21);

    this._alertLabel    = txt(this, this._maxX, this._maxY - 32, '!',
      { fontSize: '8px', color: '#ffff00' }).setOrigin(0.5).setDepth(6).setVisible(false);

    this._chargeLabel   = txt(this, ARENA_W / 2, ARENA_H / 2 - 30, '⚡ CHARGING ⚡',
      { fontSize: '8px', color: '#ffff00' }).setOrigin(0.5).setScrollFactor(0).setDepth(25).setVisible(false);
  }

  // ─── Leo visual ───────────────────────────────────────────────────────────

  _buildLeo() {
    if (this.textures.exists(SPRITE_LEO)) {
      registerCharacterAnims(this.anims, SPRITE_LEO);
      this._leoSprite = this.add.sprite(this._leoX, this._leoY, SPRITE_LEO, 'down-0')
        .setDisplaySize(T * 3, T * 3).setDepth(5);
      this._leoBody = null;
      this._leoDot  = null;
    } else {
      this._leoSprite = null;
      this._leoBody = this.add.rectangle(this._leoX, this._leoY, T * 2, T * 2.5, 0x4488ff).setDepth(5);
      this._leoDot  = this.add.rectangle(this._leoX, this._leoY - 12, 6, 4, 0xffffff).setDepth(5);
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
    if (this._fxFrozen) return; // hit-stop
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
    const nx = Phaser.Math.Clamp(this._leoX + vx * dt, YARD_LEFT, YARD_RIGHT);
    const ny = Phaser.Math.Clamp(this._leoY + vy * dt, YARD_TOP, YARD_BOTTOM);
    if (!this._blockedByTree(nx, ny))              { this._leoX = nx; this._leoY = ny; }
    else if (!this._blockedByTree(nx, this._leoY)) { this._leoX = nx; }
    else if (!this._blockedByTree(this._leoX, ny)) { this._leoY = ny; }

    this._moveLeoVisual(vx, vy);

    // Fart
    if (Phaser.Input.Keyboard.JustDown(this._fartKey) && this._fartReady) {
      this._fartReady = false;
      this._maxUnleashed = true; // first fart lets Max chase across the whole yard
      AudioManager.playFart(this);
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

  // Tint the boss body — image (setTint) or fallback rectangle (setFillStyle).
  _maxTint(color) {
    if (this._maxImg) {
      if (color === null) this._maxBody.clearTint();
      else this._maxBody.setTint(color);
    } else {
      this._maxBody.setFillStyle(color === null ? 0xcc4400 : color);
    }
  }

  _blockedByTree(x, y) {
    const pad = 7;
    for (const t of TREES) {
      const dx = (x - t.x) / (t.rx + pad);
      const dy = (y - t.y) / (t.ry + pad);
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }

  _updateMax() {
    const dt = 1 / 60;

    // Hold still while winding up / firing the electric shock so it emanates
    // from a fixed point (Max plants his feet to unleash it). His visuals are
    // already in place from the prior frame, so just skip movement.
    if (this._electricCharging || this._electricActive) return;

    if (this._maxState === 'PATROL') {
      this._maxX += this._maxVx * dt;
      const left = YARD_LEFT + 20, right = YARD_RIGHT - 20;
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

      // Contact damage
      if (dist < 22 && Date.now() - this._lastContact > CONTACT_COOLDOWN) {
        this._lastContact = Date.now();
        this._resources.applyChanges({ energy: -CONTACT_DAMAGE });
        this.cameras.main.shake(150, 0.008);
        this._leoHurtFx(CONTACT_DAMAGE);
        if (!this._defeated && this._resources.isExhausted()) this._gameOver();
      }

    } else if (this._maxState === 'STUNNED') {
      // Handled by timer
    }

    // Max holds to the upper yard until Leo's first fart, then chases the whole yard
    const maxYBottom = this._maxUnleashed ? YARD_BOTTOM : MAX_Y_BOTTOM;
    this._maxX = Phaser.Math.Clamp(this._maxX, YARD_LEFT, YARD_RIGHT);
    this._maxY = Phaser.Math.Clamp(this._maxY, YARD_TOP, maxYBottom);

    // Sync visuals
    this._maxBody.setPosition(this._maxX, this._maxY);
    this._maxHelmet.setPosition(this._maxX, this._maxY - 14);
    this._maxBat.setPosition(this._maxX + 20, this._maxY + 4);
    this._alertLabel.setPosition(this._maxX, this._maxY - 32);
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
        this._leoHurtFx(PITCH_DAMAGE);
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
      let sprite;
      if (this.textures.exists('sprite-baseball')) {
        sprite = this.add.image(this._maxX, this._maxY, 'sprite-baseball').setDepth(6);
        sprite.setScale(16 / sprite.height); // ~16px ball, keep aspect
      } else {
        sprite = this.add.circle(this._maxX, this._maxY, 7, 0xffeedd).setDepth(6);
      }
      this._pitches.push({ x: this._maxX, y: this._maxY,
        vx: Math.cos(a) * BALL_SPEED, vy: Math.sin(a) * BALL_SPEED, sprite });
    }
  }

  _startElectric() {
    if (this._maxState === 'STUNNED' || this._defeated || this._inputLocked) return;
    if (this._electricCharging || this._electricActive) return;

    this._electricCharging = true;

    // Plant the shock's origin where Max is standing (he's frozen in _updateMax)
    this._elecX = this._maxX;
    this._elecY = this._maxY;

    // Warning flash on Max (crackling cyan)
    this._chargeLabel.setVisible(true);
    let flashCount = 0;
    this.time.addEvent({
      delay: 150, repeat: 7,
      callback: () => { flashCount++; this._maxTint(flashCount % 2 === 0 ? null : 0x88ddff); },
    });

    // Pulsing danger-zone telegraph centered on the origin
    const warnRing = this.add.graphics().setDepth(4);
    warnRing.fillStyle(0x66ddff, 0.12);
    warnRing.fillCircle(this._elecX, this._elecY, ELECTRIC_RADIUS);
    warnRing.lineStyle(2, 0x88ddff, 0.7);
    warnRing.strokeCircle(this._elecX, this._elecY, ELECTRIC_RADIUS);
    this.tweens.add({ targets: warnRing, alpha: 0.35, duration: 200, yoyo: true, repeat: -1 });

    this.time.delayedCall(ELECTRIC_WIND_UP, () => {
      this._electricCharging = false;
      this._chargeLabel.setVisible(false);
      this._maxTint(null);
      warnRing.destroy();

      if (this._maxState === 'STUNNED' || this._defeated) return;
      this._releaseElectric();
    });
  }

  _releaseElectric() {
    this._electricActive = true;
    this.cameras.main.shake(300, 0.012);

    const ox = this._elecX, oy = this._elecY;

    // Bright burst at the origin as the shock erupts
    FX.burst(this, ox, oy, {
      count: 18, colors: [0x66ddff, 0xffffff, 0xbdf0ff],
      minSpeed: 70, maxSpeed: 190, minSize: 1, maxSize: 3, duration: 420, depth: 9,
    });

    // Jagged, crackling electric ring that flickers as it expands
    const ring = this.add.graphics().setDepth(9);
    const N = 44;
    let radius = 8;
    let electricHit = false; // ring can only hit Leo once per wave

    this.time.addEvent({
      delay: 16, repeat: Math.floor(ELECTRIC_EXPAND / 16),
      callback: () => {
        // Build a closed jagged polygon (fresh jitter each frame = crackle/flicker)
        const pts = [];
        for (let k = 0; k <= N; k++) {
          const ang = (k / N) * Math.PI * 2;
          const jr  = radius + (Math.random() - 0.5) * 11;
          pts.push([ox + Math.cos(ang) * jr, oy + Math.sin(ang) * jr]);
        }
        const stroke = (w, c, a) => {
          ring.lineStyle(w, c, a);
          ring.beginPath();
          ring.moveTo(pts[0][0], pts[0][1]);
          for (let k = 1; k < pts.length; k++) ring.lineTo(pts[k][0], pts[k][1]);
          ring.strokePath();
        };
        ring.clear();
        stroke(7, 0x2288ff, 0.30); // outer glow
        stroke(3, 0x66ddff, 0.9);  // mid arc
        stroke(1.5, 0xffffff, 1);  // white-hot core

        // Hit Leo as the ring passes through him — once per wave
        if (!electricHit) {
          const leoR = Math.hypot(this._leoX - ox, this._leoY - oy);
          if (Math.abs(leoR - radius) < 16) {
            electricHit = true;
            this._resources.applyChanges({ energy: -ELECTRIC_DAMAGE });
            this.cameras.main.flash(200, 120, 200, 255); // electric-blue flash
            this.cameras.main.shake(200, 0.014);
            this._leoHurtFx(ELECTRIC_DAMAGE, true);
            if (!this._defeated && this._resources.isExhausted()) this._gameOver();
          }
        }

        radius += ELECTRIC_RADIUS / (ELECTRIC_EXPAND / 16);
      },
    });

    this.time.delayedCall(ELECTRIC_EXPAND + 100, () => {
      ring.destroy();
      this._electricActive = false;
    });
  }

  // Shared "Leo got hurt" juice: colored burst + floating damage number.
  _leoHurtFx(amount, isElectric = false) {
    this._heartsUpdate(this._resources.energy / 100);
    FX.burst(this, this._leoX, this._leoY, {
      count: 9,
      colors: isElectric ? [0x66ddff, 0xbdf0ff, 0xffffff] : [0xff5252, 0xff8a80, 0xffffff],
      minSpeed: 35, maxSpeed: 100, minSize: 1, maxSize: 3, duration: 420, depth: 30,
    });
    FX.popText(this, this._leoX, this._leoY - 18, `-${amount}`, {
      color: isElectric ? '#88ddff' : '#ff5252', fontSize: '9px', rise: 22, duration: 600,
    });
  }

  // ─── Fart hit ─────────────────────────────────────────────────────────────

  _checkFartHit() {
    const dx = this._maxX - this._leoX, dy = this._maxY - this._leoY;
    if (Math.sqrt(dx * dx + dy * dy) > FART_HIT_RANGE) return;

    AudioManager.playSfx(this, 'sfx-coyote-max-baseball', { volume: 0.9 });
    this._maxHp--;
    this._maxHpFill.scaleX = Math.max(0, this._maxHp / MAX_HP);

    this._maxTint(0xffffff);
    this.time.delayedCall(120, () => this._maxTint(null));

    // ── Juice ──────────────────────────────────────────────────────────────
    FX.freeze(this, 60);
    FX.shake(this, 220, 0.012);
    FX.pop(this, this._maxBody, 0.4);
    FX.burst(this, this._maxX, this._maxY, {
      count: 12, colors: [0xd4e157, 0x9ccc65, 0xffffff],
      minSpeed: 40, maxSpeed: 130, minSize: 1, maxSize: 4, duration: 460, depth: 30,
    });
    const lastHit = this._maxHp <= 0;
    FX.popText(this, this._maxX, this._maxY - 22, lastHit ? 'K.O.!' : 'POW!', {
      color: lastHit ? '#ff5252' : '#ffee58',
      fontSize: lastHit ? '14px' : '12px', rise: 30, duration: 750,
    });

    if (this._maxHp <= 0) {
      this._defeatMax();
      return;
    }

    this._maxState = 'STUNNED';
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
        if (progress === 1) {
          this.scene.wake(SCENE_HUD);
          this.scene.start(SCENE_NEIGHBORHOOD, {
            bossLost: 'justinmax', bossScene: SCENE_JUSTIN_MAX_BOSS, spawnCol: 312, spawnRow: 123,
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
      txt(this, ARENA_W / 2, ARENA_H / 2, "MAX DEFEATED!", {
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
          this.time.delayedCall(520, () => {
            this.scene.wake(SCENE_HUD);
            this.scene.start(SCENE_NEIGHBORHOOD, { justinMaxDefeated: true, spawnCol: 312, spawnRow: 123 });
          });
        }
      });
    });
  }
}
