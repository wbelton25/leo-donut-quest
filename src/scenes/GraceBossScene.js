import {
  SCENE_GRACE_BOSS, SCENE_DIALOGUE, SCENE_NEIGHBORHOOD, SCENE_BOSS_GAUNTLET,
  BASE_WIDTH, BASE_HEIGHT, TILE_SIZE, txt,
} from '../constants.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import AbilitySystem from '../systems/AbilitySystem.js';
import PartySystem from '../systems/PartySystem.js';

// ─── Grace Boss Scene ────────────────────────────────────────────────────────
// Isolated pool-arena battle. Leo faces Grace in her backyard.
//
// Arena layout (world = 480×270):
//   - Concrete deck (gray) fills most of the arena
//   - Swimming pool (blue rect) is a hazard in the center
//   - Leo starts at the bottom; Grace starts at the top
//
// Grace attack cycle:
//   PATROL  → walks back and forth at top
//   CHASE   → moves toward Leo
//   THROW   → launches a pool noodle projectile every ~3s
//   SQUIRT  → fires fast water shots every ~1.5s when in range
//   STUNNED → brief recovery after taking a fart hit
//   DEFEATED → spin + fade, scene ends
//
// Leo input: WASD to move, F to fart (shockwave)
// 3 fart hits defeat Grace. Pool touch drains energy fast.

const T = TILE_SIZE;

// Arena geometry (in pixels)
const ARENA_W   = BASE_WIDTH;
const ARENA_H   = BASE_HEIGHT;

// Pool (hazard rectangle)
const POOL_X    = ARENA_W / 2;
const POOL_Y    = ARENA_H / 2 - 10;
const POOL_W    = 200;
const POOL_H    = 70;

// Grace constants
const GRACE_MAX_HP    = 3;
const PATROL_SPEED    = 55;
const CHASE_SPEED     = 85;
const CHASE_RANGE     = 140;
const STUN_DURATION   = 1200; // ms
const FART_HIT_RANGE  = 80;   // px shockwave radius

// Leo movement
const LEO_SPEED       = 170;

// Projectile speeds
const NOODLE_SPEED    = 90;
const SQUIRT_SPEED    = 160;

// Damage amounts
const POOL_DRAIN      = 1;    // per frame while in pool (~60 per second)
const NOODLE_DAMAGE   = 10;
const SQUIRT_DAMAGE   = 8;
const CONTACT_DAMAGE  = 15;

const CONTACT_COOLDOWN = 1500; // ms

export default class GraceBossScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_GRACE_BOSS });
  }

  init(data) {
    this._gauntlet = data?.gauntlet ?? false;
    this._gauntletData = data?.gauntletData ?? {};
  }

  create() {
    try {
      this._createImpl();
    } catch (err) {
      console.error('[GraceBossScene] create() threw:', err);
      this.add.text(10, 10, 'GRACE SCENE ERROR:\n' + err.message, {
        fontFamily: 'monospace', fontSize: '10px', color: '#ff4444',
        wordWrap: { width: 460 },
      });
    }
  }

  _createImpl() {
    // Reuse systems from registry (set up by NeighborhoodScene)
    this._resources = this.game.registry.get('resources');
    this._party     = this.game.registry.get('party');
    this._abilities = this.game.registry.get('abilities');

    // If systems somehow aren't set up, create fresh ones
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

    this._graceHp      = GRACE_MAX_HP;
    this._graceState   = 'PATROL';
    this._graceX       = ARENA_W / 2;
    this._graceY       = 60;
    this._graceVx      = PATROL_SPEED;
    this._lastContact  = 0;
    this._lastPoolDrain = 0;
    this._fartReady    = true;
    this._fartCooldownMs = 4000;
    this._projectiles  = [];
    this._defeated     = false;
    this._inputLocked  = true;  // locked during intro cutscene

    this._leoX = ARENA_W / 2;
    this._leoY = ARENA_H - 50;

    this._buildArena();
    this._buildGrace();
    this._buildLeo();
    this._buildHud();
    this._setupInput();
    this._setupAttackTimers();
    this._runIntroCutscene();
  }

  // ─── Arena ──────────────────────────────────────────────────────────────────

  _buildArena() {
    // Concrete deck
    this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 0x888899);

    // Deck tiles (checkerboard pattern)
    const TILE = 32;
    for (let r = 0; r < ARENA_H; r += TILE) {
      for (let c = 0; c < ARENA_W; c += TILE) {
        if (((r / TILE) + (c / TILE)) % 2 === 0) {
          this.add.rectangle(c + TILE / 2, r + TILE / 2, TILE, TILE, 0x9999aa, 0.3);
        }
      }
    }

    // Pool hazard — inset with lighter rim
    this.add.rectangle(POOL_X, POOL_Y, POOL_W + 10, POOL_H + 10, 0xaaaacc); // rim
    this._pool = this.add.rectangle(POOL_X, POOL_Y, POOL_W, POOL_H, 0x1a6eb4);
    // Pool shimmer lines
    for (let i = 0; i < 4; i++) {
      this.add.rectangle(POOL_X - POOL_W / 2 + 20 + i * 50, POOL_Y, 30, 3, 0x4db8f0, 0.4);
    }
    txt(this, POOL_X - 20, POOL_Y - 6, 'POOL', { fontSize: '8px', color: '#7cc8f0' }).setOrigin(0.5).setDepth(2);

    // Arena bounds enforced via Phaser.Math.Clamp in _updateLeo — no physics walls needed

    // Decorative pool noodles lying around
    const noodleColors = [0xff6060, 0x60ff60, 0x6060ff, 0xffff44];
    [[80, 40], [380, 50], [60, 200], [410, 190]].forEach(([nx, ny], i) => {
      this.add.rectangle(nx, ny, 50, 8, noodleColors[i % noodleColors.length])
        .setAngle(Phaser.Math.Between(-30, 30));
    });
  }

  // ─── Grace visual ───────────────────────────────────────────────────────────

  _buildGrace() {
    this._graceBody   = this.add.rectangle(this._graceX, this._graceY, T * 2.5, T * 3, 0xff6eb4).setDepth(5);
    this._graceNoodle = this.add.rectangle(this._graceX + 20, this._graceY, T * 3, T * 0.5, 0xff8c00).setDepth(5);
    this._graceGun    = this.add.rectangle(this._graceX - 16, this._graceY + 4, T * 1.5, T * 0.4, 0x88aaff).setDepth(5);

    this._graceHpBg   = this.add.rectangle(ARENA_W / 2, 16, 160, 8, 0x440000).setScrollFactor(0).setDepth(20);
    this._graceHpFill = this.add.rectangle(ARENA_W / 2 - 78, 16, 156, 6, 0xff2222)
      .setScrollFactor(0).setDepth(21).setOrigin(0, 0.5);
    txt(this, ARENA_W / 2, 6, 'GRACE', { fontSize: '8px', color: '#ff88cc' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(21);

    this._alertLabel = txt(this, this._graceX, this._graceY - 30, '!', {
      fontSize: '8px', color: '#ffff00',
    }).setOrigin(0.5).setDepth(6).setVisible(false);
  }

  // ─── Leo visual ─────────────────────────────────────────────────────────────

  _buildLeo() {
    this._leoBody = this.add.rectangle(this._leoX, this._leoY, T * 2, T * 2.5, 0x4488ff).setDepth(5);
    this._leoDot  = this.add.rectangle(this._leoX, this._leoY - 12, 6, 4, 0xffffff).setDepth(5);

    // No physics body needed for Leo — movement is manual with bounds clamping
  }

  // ─── HUD overlay ────────────────────────────────────────────────────────────

  _buildHud() {
    txt(this, 8, 8, 'F: FART', { fontSize: '8px', color: '#f5e642' })
      .setScrollFactor(0).setDepth(20);

    txt(this, 8, 20, 'WASD: MOVE', { fontSize: '8px', color: '#aaaaaa' })
      .setScrollFactor(0).setDepth(20);

    // "Don't fall in the pool!" hint
    txt(this, ARENA_W / 2, ARENA_H - 10, 'AVOID THE POOL!', { fontSize: '8px', color: '#ff4444' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(20);
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  _setupInput() {
    this._keys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      upAlt:    Phaser.Input.Keyboard.KeyCodes.UP,
      downAlt:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      leftAlt:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      rightAlt: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    });
    this._fartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
  }

  // ─── Attack timers ──────────────────────────────────────────────────────────

  _setupAttackTimers() {
    // Thrown pool noodle every 2.8s
    this._noodleTimer = this.time.addEvent({
      delay: 2800,
      loop: true,
      callback: this._throwNoodle,
      callbackScope: this,
    });

    // Squirt gun every 1.6s when close enough
    this._squirtTimer = this.time.addEvent({
      delay: 1600,
      loop: true,
      callback: this._squirt,
      callbackScope: this,
    });
  }

  // ─── Intro cutscene ─────────────────────────────────────────────────────────

  _runIntroCutscene() {
    // Camera starts zoomed on Grace, then pulls back to full arena
    this.cameras.main.zoomTo(2.5, 0, Phaser.Math.Easing.Linear);
    this.cameras.main.pan(this._graceX, this._graceY, 0);

    // Flash alert
    this._alertLabel.setVisible(true);

    this.time.delayedCall(300, () => {
      this.cameras.main.zoomTo(1, 800, Phaser.Math.Easing.Quadratic.Out);
      this.cameras.main.pan(ARENA_W / 2, ARENA_H / 2, 800);
    });

    this.time.delayedCall(1200, () => {
      this._alertLabel.setVisible(false);
      this._inputLocked = false;
      this._graceState = 'PATROL';
    });
  }

  // ─── Main update ────────────────────────────────────────────────────────────

  update() {
    if (this._defeated) return;

    this._updateLeo();
    this._updateGrace();
    this._updateProjectiles();
    this._checkPoolHazard();
  }

  _updateLeo() {
    if (this._inputLocked) return;

    let vx = 0, vy = 0;
    if (this._keys.left.isDown  || this._keys.leftAlt.isDown)  vx = -LEO_SPEED;
    if (this._keys.right.isDown || this._keys.rightAlt.isDown) vx =  LEO_SPEED;
    if (this._keys.up.isDown    || this._keys.upAlt.isDown)    vy = -LEO_SPEED;
    if (this._keys.down.isDown  || this._keys.downAlt.isDown)  vy =  LEO_SPEED;

    // Normalize diagonal
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    const dt = 1 / 60;
    this._leoX = Phaser.Math.Clamp(this._leoX + vx * dt, 16, ARENA_W - 16);
    this._leoY = Phaser.Math.Clamp(this._leoY + vy * dt, 16, ARENA_H - 16);

    this._leoBody.setPosition(this._leoX, this._leoY);
    this._leoDot.setPosition(this._leoX, this._leoY - 12);

    // Fart attack — local cooldown so it always works in the boss scene
    if (Phaser.Input.Keyboard.JustDown(this._fartKey) && this._fartReady) {
      this._fartReady = false;
      // Visual ring
      const ring = this.add.circle(this._leoX, this._leoY, 6, 0xf5e642, 0.9).setDepth(8);
      this.tweens.add({
        targets: ring, displayWidth: FART_HIT_RANGE * 2, displayHeight: FART_HIT_RANGE * 2,
        alpha: 0, duration: 400, onComplete: () => ring.destroy(),
      });
      this._checkFartHit();
      // Notify HUD meter
      this.game.events.emit('ability-used', { abilityId: 'lightning_fart', cooldown: this._fartCooldownMs });
      this.time.delayedCall(this._fartCooldownMs, () => { this._fartReady = true; });
    }
  }

  _checkFartHit() {
    if (this._graceState === 'STUNNED' || this._graceState === 'DEFEATED') return;
    const dx = this._graceX - this._leoX;
    const dy = this._graceY - this._leoY;
    if (dx * dx + dy * dy < FART_HIT_RANGE * FART_HIT_RANGE) {
      this._hitGrace();
    }
  }

  _hitGrace() {
    this._graceHp--;
    this._graceState = 'STUNNED';
    this._graceBody.setFillStyle(0xffffff);
    this.time.delayedCall(150, () => this._graceBody.setFillStyle(0xff6eb4));
    this.time.delayedCall(STUN_DURATION, () => {
      if (this._graceState !== 'DEFEATED') {
        if (this._graceHp <= 0) {
          this._graceState = 'DEFEATED';
          this._defeatGrace();
        } else {
          this._graceState = 'PATROL';
        }
      }
    });
    this._updateGraceHpBar();

    // Floating hit number
    const hitNum = txt(this, this._graceX, this._graceY - 20, '!' , {
      fontSize: '8px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: hitNum, y: hitNum.y - 24, alpha: 0, duration: 600,
      onComplete: () => hitNum.destroy() });
  }

  _updateGrace() {
    if (this._graceState === 'STUNNED' || this._graceState === 'DEFEATED') {
      this._syncGraceVisuals();
      return;
    }

    const dx = this._leoX - this._graceX;
    const dy = this._leoY - this._graceY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this._graceState === 'PATROL') {
      // Bounce along top strip
      this._graceX += this._graceVx * (1 / 60);
      if (this._graceX < 40 || this._graceX > ARENA_W - 40) {
        this._graceVx *= -1;
        this._graceX = Phaser.Math.Clamp(this._graceX, 40, ARENA_W - 40);
      }
      if (dist < CHASE_RANGE) {
        this._graceState = 'CHASE';
        this._alertLabel.setVisible(true);
        this.time.delayedCall(500, () => this._alertLabel.setVisible(false));
      }
    } else if (this._graceState === 'CHASE') {
      if (dist > 4) {
        const nx = dx / dist, ny = dy / dist;
        this._graceX += nx * CHASE_SPEED * (1 / 60);
        this._graceY += ny * CHASE_SPEED * (1 / 60);
      }
      // Keep Grace out of the pool (she navigates around it)
      this._keepGraceOutOfPool();
      if (dist > CHASE_RANGE * 1.5) this._graceState = 'PATROL';

      // Contact damage
      if (dist < 28) {
        const now = Date.now();
        if (now - this._lastContact > CONTACT_COOLDOWN) {
          this._lastContact = now;
          this._damagePlayer(CONTACT_DAMAGE, 'contact');
        }
      }
    }

    // Clamp Grace to arena bounds
    this._graceX = Phaser.Math.Clamp(this._graceX, 20, ARENA_W - 20);
    this._graceY = Phaser.Math.Clamp(this._graceY, 20, ARENA_H - 20);

    this._syncGraceVisuals();
  }

  _keepGraceOutOfPool() {
    const hw = POOL_W / 2, hh = POOL_H / 2;
    const px1 = POOL_X - hw, px2 = POOL_X + hw;
    const py1 = POOL_Y - hh, py2 = POOL_Y + hh;
    if (this._graceX > px1 && this._graceX < px2 &&
        this._graceY > py1 && this._graceY < py2) {
      // Push Grace away from pool center
      const pushX = this._graceX < POOL_X ? px1 - 5 : px2 + 5;
      this._graceX = pushX;
    }
  }

  _syncGraceVisuals() {
    this._graceBody.setPosition(this._graceX, this._graceY);
    const offX = this._graceVx >= 0 ? 20 : -20;
    this._graceNoodle.setPosition(this._graceX + offX, this._graceY);
    this._graceGun.setPosition(this._graceX - offX * 0.6, this._graceY + 4);
    this._alertLabel.setPosition(this._graceX, this._graceY - 30);
  }

  _updateGraceHpBar() {
    const pct = this._graceHp / GRACE_MAX_HP;
    this._graceHpFill.setDisplaySize(156 * pct, 6);
    this._graceHpFill.setFillStyle(pct > 0.5 ? 0xff2222 : 0xff8800);
  }

  // ─── Projectiles ────────────────────────────────────────────────────────────

  _throwNoodle() {
    if (this._inputLocked || this._graceState === 'DEFEATED') return;
    const dx = this._leoX - this._graceX;
    const dy = this._leoY - this._graceY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 8) return;
    const nx = dx / dist, ny = dy / dist;

    const noodle = this.add.rectangle(this._graceX, this._graceY, 28, 6, 0xff8c00).setDepth(4);
    noodle.angle = Math.atan2(ny, nx) * (180 / Math.PI);
    this._projectiles.push({
      obj: noodle, vx: nx * NOODLE_SPEED, vy: ny * NOODLE_SPEED,
      damage: NOODLE_DAMAGE, type: 'noodle',
    });
  }

  _squirt() {
    if (this._inputLocked || this._graceState === 'DEFEATED') return;
    const dx = this._leoX - this._graceX;
    const dy = this._leoY - this._graceY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 180) return; // squirt gun has limited range
    const nx = dx / dist, ny = dy / dist;

    const drop = this.add.circle(this._graceX, this._graceY, 4, 0x4db8f0).setDepth(4);
    this._projectiles.push({
      obj: drop, vx: nx * SQUIRT_SPEED, vy: ny * SQUIRT_SPEED,
      damage: SQUIRT_DAMAGE, type: 'squirt',
    });
  }

  _updateProjectiles() {
    const dt = 1 / 60;
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.obj.x += p.vx * dt;
      p.obj.y += p.vy * dt;

      // Out of bounds
      if (p.obj.x < 0 || p.obj.x > ARENA_W || p.obj.y < 0 || p.obj.y > ARENA_H) {
        p.obj.destroy();
        this._projectiles.splice(i, 1);
        continue;
      }

      // Hit Leo
      const dx = p.obj.x - this._leoX;
      const dy = p.obj.y - this._leoY;
      if (dx * dx + dy * dy < (T * 1.5) * (T * 1.5)) {
        this._damagePlayer(p.damage, p.type);
        p.obj.destroy();
        this._projectiles.splice(i, 1);
      }
    }
  }

  // ─── Pool hazard ────────────────────────────────────────────────────────────

  _checkPoolHazard() {
    const hw = POOL_W / 2, hh = POOL_H / 2;
    if (
      this._leoX > POOL_X - hw + 8 && this._leoX < POOL_X + hw - 8 &&
      this._leoY > POOL_Y - hh + 8 && this._leoY < POOL_Y + hh - 8
    ) {
      // Drain energy every 500ms while in pool
      const now = Date.now();
      if (now - this._lastPoolDrain > 500) {
        this._lastPoolDrain = now;
        this._resources.applyChanges({ energy: -15 });
        this.cameras.main.flash(120, 0, 100, 220);
        if (this._resources.isExhausted()) { this._gameOver(); return; }
      }
      // Push Leo toward nearest edge
      const pushX = this._leoX < POOL_X ? -(POOL_W / 2 + 12) : (POOL_W / 2 + 12);
      this._leoX = POOL_X + pushX;
    }
  }

  // ─── Damage player ──────────────────────────────────────────────────────────

  _damagePlayer(amount, source) {
    this._resources.applyChanges({ energy: -amount });
    const color = source === 'squirt' ? [0, 100, 255] : [255, 50, 50];
    this.cameras.main.flash(180, color[0], color[1], color[2]);

    if (this._resources.isExhausted()) {
      this._gameOver();
    }
  }

  _gameOver() {
    this._defeated = true;
    this._noodleTimer?.remove();
    this._squirtTimer?.remove();
    this.cameras.main.fade(600, 0, 0, 0, false, (cam, progress) => {
      if (progress === 1) {
        this.scene.start('GameOverScene', { reason: 'energy' });
      }
    });
  }

  // ─── Grace defeat ───────────────────────────────────────────────────────────

  _defeatGrace() {
    this._defeated = true;
    this._noodleTimer?.remove();
    this._squirtTimer?.remove();

    // Clear remaining projectiles
    this._projectiles.forEach(p => p.obj.destroy());
    this._projectiles = [];

    // Victory flash
    this.cameras.main.flash(300, 255, 255, 100);

    // Spin out Grace
    this.tweens.add({
      targets: [this._graceBody, this._graceNoodle, this._graceGun],
      alpha: 0, angle: 360, duration: 700,
      onComplete: () => {
        this._graceBody.destroy();
        this._graceNoodle.destroy();
        this._graceGun.destroy();
        this._graceHpBg.destroy();
        this._graceHpFill.destroy();

        // Show post-fight dialogue then return to neighborhood
        // DIALOGUE is already a persistent parallel scene — don't launch/stop it
        this.scene.get(SCENE_DIALOGUE).showScript('warren_after_grace', () => {
          this.cameras.main.fade(500, 0, 0, 0);
          this.time.delayedCall(520, () => {
            if (this._gauntlet) {
              this.scene.start(SCENE_BOSS_GAUNTLET, this._gauntletData);
            } else {
              this.scene.start(SCENE_NEIGHBORHOOD, { graceDefeated: true, spawnCol: 122, spawnRow: 65 });
            }
          });
        });
      },
    });
  }
}
