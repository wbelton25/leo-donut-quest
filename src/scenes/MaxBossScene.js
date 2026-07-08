import {
  SCENE_MAX_BOSS, SCENE_DIALOGUE, SCENE_NEIGHBORHOOD, SCENE_BOSS_GAUNTLET,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, SPRITE_LEO, txt, MUSIC_BOSS,
} from '../constants.js';
import AudioManager from '../systems/AudioManager.js';
import FX from '../systems/FX.js';
import { registerCharacterAnims } from '../utils/AnimationRegistry.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import PartySystem from '../systems/PartySystem.js';

// ─── Max Boss Scene ──────────────────────────────────────────────────────────
// MJ's brother Max is blocking the driveway.
//
// Arena: MJ's front yard / driveway.
//
// Max attacks:
//   TACKLE     — charges straight at Leo, deals damage on impact
//   FOOTBALL   — thrown projectile, burst of 2, every 3s
//
// Leo: WASD / arrows to move, F to fart (3 hits defeat Max)

const T = TILE_SIZE;
const ARENA_W = BASE_WIDTH;
const ARENA_H = BASE_HEIGHT;

// Playable yard — inside the left/bottom fences and below the house strip.
const YARD_LEFT = 44, YARD_RIGHT = 466, YARD_TOP = 52, YARD_BOTTOM = 238;
// Tree trunks — oval obstacles (narrow x, tall y) matched to the art so Leo
// rides around each trunk instead of through it.
const TREES = [
  { x: 143, y: 208, rx: 15, ry: 24 },
  { x: 369, y: 218, rx: 15, ry: 24 },
  { x: 460, y: 224, rx: 14, ry: 22 },
];

const MAX_HP           = 3;
const PATROL_SPEED     = 60;
const CHASE_SPEED      = 95;
const CHASE_RANGE      = 150;
const STUN_DURATION    = 1200;
const FART_HIT_RANGE   = 80;
const CONTACT_DAMAGE   = 12;
const CONTACT_COOLDOWN = 1500;
const FOOTBALL_DAMAGE  = 10;
const FOOTBALL_SPEED   = 130;
const TACKLE_DAMAGE    = 18;
const TACKLE_SPEED     = 220;  // fast charge
const LEO_SPEED        = 170;

export default class MaxBossScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_MAX_BOSS });
  }

  init(data) {
    this._returnData   = data ?? {};
    this._gauntlet     = data?.gauntlet ?? false;
    this._gauntletData = data?.gauntletData ?? {};
  }

  create() {
    try {
      this._createImpl();
    } catch (err) {
      console.error('[MaxBossScene] create() threw:', err);
      this.add.text(10, 10, 'MAX SCENE ERROR:\n' + err.message, {
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

    this._maxHp         = MAX_HP;
    this._maxState      = 'PATROL';
    this._maxX          = ARENA_W / 2;
    this._maxY          = 55;
    this._maxVx         = PATROL_SPEED;
    this._lastContact   = 0;
    this._fartReady     = true;
    this._fartCooldown  = 4000;
    this._projectiles   = [];
    this._defeated      = false;
    this._inputLocked   = true;

    this._leoX = ARENA_W / 2;
    this._leoY = ARENA_H - 50;

    this._buildArena();
    this._buildMax();
    this._buildLeo();
    this._buildHud();
    this._setupInput();
    this._setupAttackTimers();
    this._runIntroCutscene();
  }

  // ─── Arena ──────────────────────────────────────────────────────────────────

  _buildArena() {
    // Full-scene background art drops in here; otherwise fall back to the
    // procedural driveway + yard.
    if (this.textures.exists('bg-max')) {
      this.add.image(0, 0, 'bg-max').setOrigin(0, 0).setDisplaySize(ARENA_W, ARENA_H).setDepth(-1);
    } else {
      // Concrete driveway
      this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 0x999aaa);

      // Driveway seams
      for (let i = 1; i < 4; i++) {
        this.add.rectangle(ARENA_W / 2, (ARENA_H / 4) * i, ARENA_W, 2, 0x777788, 0.4);
      }

      // House wall at top with garage door
      this.add.rectangle(ARENA_W / 2, 14, ARENA_W, 28, 0xc8b898);
      this.add.rectangle(ARENA_W / 2 - 60, 14, 100, 22, 0x888877); // garage door
      this.add.rectangle(ARENA_W / 2 + 80, 14, 60, 22, 0x777766);  // side door

      // Lawn edges
      this.add.rectangle(30, ARENA_H / 2, 60, ARENA_H, 0x336633);  // left lawn
      txt(this, 10, ARENA_H / 2 - 10, "MJ'S\nYARD", { fontSize: '8px', color: '#88ff88' });

      // Footballs lying around (decorative)
      [[120, 35], [320, 200], [80, 190]].forEach(([fx, fy]) => {
        this.add.ellipse(fx, fy, 14, 10, 0x8b4513);
        this.add.rectangle(fx, fy, 8, 2, 0xffffff);
      });
    }
  }

  // ─── Max visual ─────────────────────────────────────────────────────────────

  _buildMax() {
    this._maxBody  = this.add.rectangle(this._maxX, this._maxY, T * 2.5, T * 3, 0x334488).setDepth(5);
    this._maxBat   = this.add.rectangle(this._maxX + 22, this._maxY, T * 0.4, T * 2.5, 0x8b4513).setDepth(5);

    // Tackle warning indicator (hidden until charge winds up)
    this._tackleWarn = this.add.rectangle(this._maxX, this._maxY, T * 3, T * 3, 0xff4400, 0).setDepth(4);
    this._isCharging = false;
    this._chargeVx   = 0;
    this._chargeVy   = 0;

    this._maxHpBg   = this.add.rectangle(ARENA_W / 2, 16, 160, 8, 0x002244).setScrollFactor(0).setDepth(20);
    this._maxHpFill = this.add.rectangle(ARENA_W / 2 - 78, 16, 156, 6, 0x2244ff)
      .setScrollFactor(0).setDepth(21).setOrigin(0, 0.5);
    txt(this, ARENA_W / 2, 6, 'MAX', { fontSize: '8px', color: '#88aaff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(21);

    this._alertLabel = txt(this, this._maxX, this._maxY - 30, '!', {
      fontSize: '8px', color: '#ffff00',
    }).setOrigin(0.5).setDepth(6).setVisible(false);
  }

  // ─── Leo visual ─────────────────────────────────────────────────────────────

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

  // ─── HUD ────────────────────────────────────────────────────────────────────

  _buildHud() {
    txt(this, 8, 8,  'F: FART',  { fontSize: '8px', color: '#f5e642' }).setScrollFactor(0).setDepth(20);
    txt(this, 8, 20, 'WASD/ARROWS: MOVE', { fontSize: '8px', color: '#aaaaaa' }).setScrollFactor(0).setDepth(20);
    txt(this, ARENA_W / 2, ARENA_H - 10, 'DODGE THE TACKLE!', {
      fontSize: '8px', color: '#ff8844',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

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

  // ─── Attack timers ──────────────────────────────────────────────────────────

  _setupAttackTimers() {
    // Football burst every 3s
    this._footballTimer = this.time.addEvent({
      delay: 3000, loop: true,
      callback: this._throwFootballBurst, callbackScope: this,
    });

    // Tackle charge every 5s
    this._tackleTimer = this.time.addEvent({
      delay: 5000, loop: true,
      callback: this._windUpTackle, callbackScope: this,
    });
  }

  // ─── Intro cutscene ─────────────────────────────────────────────────────────

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

  // ─── Update ─────────────────────────────────────────────────────────────────

  update() {
    if (this._defeated) return;
    if (this._fxFrozen) return; // hit-stop
    this._updateLeo();
    this._updateMax();
    this._updateProjectiles();
    this._updateCharge();
  }

  _updateLeo() {
    if (this._inputLocked) return;

    let vx = 0, vy = 0;
    if (this._keys.left.isDown  || this._keys.leftAlt.isDown)  vx = -LEO_SPEED;
    if (this._keys.right.isDown || this._keys.rightAlt.isDown) vx =  LEO_SPEED;
    if (this._keys.up.isDown    || this._keys.upAlt.isDown)    vy = -LEO_SPEED;
    if (this._keys.down.isDown  || this._keys.downAlt.isDown)  vy =  LEO_SPEED;
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    // Clamp to the yard, and slide along tree trunks (axis-separated)
    const nx = Phaser.Math.Clamp(this._leoX + vx * (1 / 60), YARD_LEFT, YARD_RIGHT);
    const ny = Phaser.Math.Clamp(this._leoY + vy * (1 / 60), YARD_TOP, YARD_BOTTOM);
    if (!this._blockedByTree(nx, ny))            { this._leoX = nx; this._leoY = ny; }
    else if (!this._blockedByTree(nx, this._leoY)) { this._leoX = nx; }
    else if (!this._blockedByTree(this._leoX, ny)) { this._leoY = ny; }

    this._moveLeoVisual(vx, vy);

    // Fart attack
    if (Phaser.Input.Keyboard.JustDown(this._fartKey) && this._fartReady) {
      this._fartReady = false;
      AudioManager.playFart(this);
      const ring = this.add.circle(this._leoX, this._leoY, 6, 0xf5e642, 0.9).setDepth(8);
      this.tweens.add({
        targets: ring, displayWidth: FART_HIT_RANGE * 2, displayHeight: FART_HIT_RANGE * 2,
        alpha: 0, duration: 400, onComplete: () => ring.destroy(),
      });
      this._checkFartHit();
      this.game.events.emit('ability-used', { abilityId: 'lightning_fart', cooldown: this._fartCooldown });
      this.time.delayedCall(this._fartCooldown, () => { this._fartReady = true; });
    }
  }


  _blockedByTree(x, y) {
    const pad = 7; // Leo's rough radius
    for (const t of TREES) {
      const dx = (x - t.x) / (t.rx + pad);
      const dy = (y - t.y) / (t.ry + pad);
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }

  _checkFartHit() {
    if (this._maxState === 'STUNNED' || this._maxState === 'DEFEATED') return;
    const dx = this._maxX - this._leoX;
    const dy = this._maxY - this._leoY;
    if (dx * dx + dy * dy < FART_HIT_RANGE * FART_HIT_RANGE) {
      this._hitMax();
    }
  }

  _hitMax() {
    AudioManager.playSfx(this, 'sfx-coyote-max-mj', { volume: 0.9 });
    this._maxHp--;
    this._maxState = 'STUNNED';
    this._maxBody.setFillStyle(0xffffff);
    this.time.delayedCall(150, () => this._maxBody.setFillStyle(0x334488));
    this.time.delayedCall(STUN_DURATION, () => {
      if (this._maxState !== 'DEFEATED') {
        this._maxState = this._maxHp > 0 ? 'PATROL' : 'DEFEATED';
        if (this._maxState === 'DEFEATED') this._defeatMax();
      }
    });
    this._updateMaxHpBar();

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
  }

  _updateMax() {
    if (this._maxState === 'STUNNED' || this._maxState === 'DEFEATED') {
      this._syncMaxVisuals();
      return;
    }

    const dx = this._leoX - this._maxX;
    const dy = this._leoY - this._maxY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this._maxState === 'PATROL') {
      this._maxX += this._maxVx * (1 / 60);
      if (this._maxX < 70 || this._maxX > ARENA_W - 70) {
        this._maxVx *= -1;
        this._maxX = Phaser.Math.Clamp(this._maxX, 70, ARENA_W - 70);
      }
      if (dist < CHASE_RANGE) {
        this._maxState = 'CHASE';
        this._alertLabel.setVisible(true);
        this.time.delayedCall(500, () => this._alertLabel.setVisible(false));
      }
    } else if (this._maxState === 'CHASE') {
      if (dist > 4) {
        const nx = dx / dist, ny = dy / dist;
        this._maxX += nx * CHASE_SPEED * (1 / 60);
        this._maxY += ny * CHASE_SPEED * (1 / 60);
      }
      if (dist > CHASE_RANGE * 1.5) this._maxState = 'PATROL';

      // Bat contact damage
      if (dist < 30) {
        const now = Date.now();
        if (now - this._lastContact > CONTACT_COOLDOWN) {
          this._lastContact = now;
          this._damagePlayer(CONTACT_DAMAGE, 'bat');
        }
      }
    }

    this._maxX = Phaser.Math.Clamp(this._maxX, YARD_LEFT, YARD_RIGHT);
    this._maxY = Phaser.Math.Clamp(this._maxY, YARD_TOP, YARD_BOTTOM);
    this._syncMaxVisuals();
  }

  _syncMaxVisuals() {
    this._maxBody.setPosition(this._maxX, this._maxY);
    const batOffX = this._maxVx >= 0 ? 22 : -22;
    this._maxBat.setPosition(this._maxX + batOffX, this._maxY);
    this._tackleWarn.setPosition(this._maxX, this._maxY);
    this._alertLabel.setPosition(this._maxX, this._maxY - 30);
  }

  _updateMaxHpBar() {
    const pct = this._maxHp / MAX_HP;
    this._maxHpFill.setDisplaySize(156 * pct, 6);
    this._maxHpFill.setFillStyle(pct > 0.5 ? 0x2244ff : 0x8800ff);
  }

  // ─── Attacks ────────────────────────────────────────────────────────────────

  _throwFootballBurst() {
    if (this._inputLocked || this._maxState === 'DEFEATED') return;
    // Throw 2 footballs in quick succession
    this._throwFootball(0);
    this.time.delayedCall(300, () => this._throwFootball(0.3));
  }

  _throwFootball(angleOffset) {
    const dx = this._leoX - this._maxX;
    const dy = this._leoY - this._maxY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 8) return;
    const baseAngle = Math.atan2(dy, dx);
    const angle = baseAngle + angleOffset;

    const fb = this.add.ellipse(this._maxX, this._maxY, 14, 10, 0x8b4513).setDepth(4);
    this._projectiles.push({
      obj: fb, vx: Math.cos(angle) * FOOTBALL_SPEED, vy: Math.sin(angle) * FOOTBALL_SPEED,
      damage: FOOTBALL_DAMAGE, type: 'football',
    });
  }

  _windUpTackle() {
    if (this._inputLocked || this._maxState === 'STUNNED' || this._maxState === 'DEFEATED') return;
    if (this._isCharging) return;

    // Flash red warning for 800ms, then charge
    this._tackleWarn.setAlpha(0.6);
    this._maxBody.setFillStyle(0xff2200);
    this._maxState = 'WINDUP';

    // Lock in Leo's position as the charge target
    const dx = this._leoX - this._maxX;
    const dy = this._leoY - this._maxY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 8) return;
    this._chargeVx = (dx / dist) * TACKLE_SPEED;
    this._chargeVy = (dy / dist) * TACKLE_SPEED;

    this.time.delayedCall(800, () => {
      if (this._maxState === 'STUNNED' || this._maxState === 'DEFEATED') return;
      this._tackleWarn.setAlpha(0);
      this._maxBody.setFillStyle(0x334488);
      this._isCharging = true;
      this._maxState = 'CHASE';
      // Stop charging after 600ms
      this.time.delayedCall(600, () => {
        this._isCharging = false;
        this._chargeVx = 0;
        this._chargeVy = 0;
      });
    });
  }

  _updateCharge() {
    if (!this._isCharging || this._maxState === 'STUNNED' || this._maxState === 'DEFEATED') return;

    this._maxX = Phaser.Math.Clamp(this._maxX + this._chargeVx * (1 / 60), 20, ARENA_W - 20);
    this._maxY = Phaser.Math.Clamp(this._maxY + this._chargeVy * (1 / 60), 30, ARENA_H - 20);

    // Check tackle hit
    const dx = this._leoX - this._maxX;
    const dy = this._leoY - this._maxY;
    if (dx * dx + dy * dy < (T * 2) * (T * 2)) {
      this._isCharging = false;
      this._chargeVx = 0;
      this._chargeVy = 0;
      this._damagePlayer(TACKLE_DAMAGE, 'tackle');
      // Knockback Leo away from Max
      const pushDist = 40;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      this._leoX = Phaser.Math.Clamp(this._leoX + (dx / dist) * pushDist, 16, ARENA_W - 16);
      this._leoY = Phaser.Math.Clamp(this._leoY + (dy / dist) * pushDist, 30, ARENA_H - 16);
    }
  }

  _updateProjectiles() {
    const dt = 1 / 60;
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.obj.x += p.vx * dt;
      p.obj.y += p.vy * dt;

      if (p.obj.x < 0 || p.obj.x > ARENA_W || p.obj.y < 0 || p.obj.y > ARENA_H) {
        p.obj.destroy();
        this._projectiles.splice(i, 1);
        continue;
      }

      const dx = p.obj.x - this._leoX;
      const dy = p.obj.y - this._leoY;
      if (dx * dx + dy * dy < (T * 1.5) * (T * 1.5)) {
        this._damagePlayer(p.damage, p.type);
        p.obj.destroy();
        this._projectiles.splice(i, 1);
      }
    }
  }

  // ─── Damage / game over ─────────────────────────────────────────────────────

  _damagePlayer(amount, source) {
    this._resources.applyChanges({ energy: -amount });
    const color = source === 'electric' ? [255, 255, 0] : [255, 60, 60];
    this.cameras.main.flash(200, color[0], color[1], color[2]);

    // ── Juice ──────────────────────────────────────────────────────────────
    FX.shake(this, 200, 0.01);
    const burstColor = source === 'electric'
      ? [0xffff00, 0xfff59d, 0xffffff]
      : [0xff5252, 0xff8a80, 0xffffff];
    FX.burst(this, this._leoX, this._leoY, {
      count: 9, colors: burstColor,
      minSpeed: 35, maxSpeed: 100, minSize: 1, maxSize: 3, duration: 420, depth: 30,
    });
    FX.popText(this, this._leoX, this._leoY - 18, `-${amount}`, {
      color: source === 'electric' ? '#ffee58' : '#ff5252',
      fontSize: '9px', rise: 22, duration: 600,
    });

    if (this._resources.isExhausted()) this._gameOver();
  }

  _gameOver() {
    this._defeated = true;
    this._footballTimer?.remove();
    this._tackleTimer?.remove();

    if (!this._gauntlet) {
      this.cameras.main.fade(600, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) this.scene.start(SCENE_NEIGHBORHOOD, {
          bossLost: 'max', bossScene: SCENE_MAX_BOSS, spawnCol: 189, spawnRow: 70,
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

  // ─── Max defeated ───────────────────────────────────────────────────────────

  _defeatMax() {
    this._defeated = true;
    this._footballTimer?.remove();
    this._tackleTimer?.remove();
    this._projectiles.forEach(p => p.obj.destroy());
    this._projectiles = [];

    this.cameras.main.flash(300, 100, 200, 255);

    this.tweens.add({
      targets: [this._maxBody, this._maxBat],
      alpha: 0, angle: 360, duration: 700,
      onComplete: () => {
        this._maxBody.destroy();
        this._maxBat.destroy();
        this._maxHpBg.destroy();
        this._maxHpFill.destroy();

        // DIALOGUE is already a persistent parallel scene — don't launch/stop it
        const victoryScript = this._gauntlet ? 'gauntlet_max_win' : 'mj_join';
        this.scene.get(SCENE_DIALOGUE).showScript(victoryScript, () => {
          if (this._gauntlet) {
            this._offerDonutRecharge(() => {
              this.cameras.main.fade(500, 0, 0, 0);
              this.time.delayedCall(520, () => this.scene.start(SCENE_BOSS_GAUNTLET, this._gauntletData));
            });
          } else {
            this.cameras.main.fade(500, 0, 0, 0);
            this.time.delayedCall(520, () => this.scene.start(SCENE_NEIGHBORHOOD, { maxDefeated: true, spawnCol: 189, spawnRow: 70 }));
          }
        });
      },
    });
  }
}
