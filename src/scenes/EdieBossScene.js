import {
  SCENE_EDIE_BOSS, SCENE_BOSS_GAUNTLET, SCENE_DIALOGUE, SCENE_GAME_OVER,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';

// EdieBossScene: Leo's sister Edie — the final boss of the gauntlet.
// She throws household items (books, shoes) and charges at Leo.
// 3 HP; defeat → transitions back to BossGauntletScene with winner flag.

const ARENA_W = BASE_WIDTH;
const ARENA_H = BASE_HEIGHT;

const EDIE_COLOR   = 0xff69b4;  // hot pink
const EDIE_HP      = 3;
const EDIE_SPEED   = 95;
const CHARGE_SPEED = 200;
const LEO_SPEED    = 170;
const FART_RADIUS  = 55;
const FART_CD      = 4500;
const PROJECTILE_SPEED = 140;
const THROW_INTERVAL   = 2800;  // ms between throws
const CHARGE_INTERVAL  = 6000;  // ms between charges
const CHARGE_DURATION  = 800;   // ms charge lasts

export default class EdieBossScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_EDIE_BOSS });
  }

  init(data) {
    this._gauntletData = data ?? {};
  }

  create() {
    // ── Arena — Leo's living room ──────────────────────────────────────────────
    this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, ARENA_H, 0x3a2a1a);
    // Walls
    [
      [0, ARENA_H / 2, 20, ARENA_H],
      [ARENA_W, ARENA_H / 2, 20, ARENA_H],
      [ARENA_W / 2, 0, ARENA_W, 20],
      [ARENA_W / 2, ARENA_H, ARENA_W, 20],
    ].forEach(([x, y, w, h]) => this.add.rectangle(x, y, w, h, 0x5a3a1a));

    // Furniture (sofas, TV — impassable flavor)
    this.add.rectangle(ARENA_W / 2, 40, 120, 18, 0x6b4226);  // TV stand
    this.add.rectangle(80, ARENA_H / 2, 20, 60, 0x5a3a20);   // bookshelf
    this.add.rectangle(ARENA_W - 80, ARENA_H / 2, 20, 60, 0x5a3a20);

    txt(this, ARENA_W / 2, 16, 'EDIE', { fontSize: '8px', color: '#ff69b4' }).setOrigin(0.5);

    // ── Edie ──────────────────────────────────────────────────────────────────
    this._edieHP     = EDIE_HP;
    this._edieX      = ARENA_W / 2;
    this._edieY      = 80;
    this._edieSprite = this.add.rectangle(this._edieX, this._edieY, 14, 18, EDIE_COLOR).setDepth(5);

    // ── HP bar ────────────────────────────────────────────────────────────────
    this.add.rectangle(ARENA_W / 2, ARENA_H - 18, 120, 8, 0x1a1a1a);
    this._hpFill = this.add.rectangle(ARENA_W / 2 - 58, ARENA_H - 18, 116, 6, 0xff69b4).setOrigin(0, 0.5);
    txt(this, ARENA_W / 2, ARENA_H - 30, 'EDIE', { fontSize: '8px', color: '#ff69b4' }).setOrigin(0.5);

    // ── Leo ───────────────────────────────────────────────────────────────────
    this._leoX    = ARENA_W / 2;
    this._leoY    = ARENA_H - 60;
    this._leoSprite = this.add.rectangle(this._leoX, this._leoY, 12, 16, 0x3b82f6).setDepth(5);

    // ── Input ─────────────────────────────────────────────────────────────────
    this._cursors  = this.input.keyboard.createCursorKeys();
    this._wasd     = this.input.keyboard.addKeys('W,A,S,D');
    this._fartKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this._fartReady = true;
    this._fartCooldown = 0;

    // ── Projectile group ──────────────────────────────────────────────────────
    this._projectiles = [];

    // ── Timers ────────────────────────────────────────────────────────────────
    this._throwTimer  = THROW_INTERVAL;
    this._chargeTimer = CHARGE_INTERVAL;
    this._charging    = false;
    this._chargeVx    = 0;
    this._chargeVy    = 0;
    this._chargeMs    = 0;

    this._hitFlashTimer  = 0;
    this._leoHitCooldown = 0;
    this._defeated       = false;
    this._gameover       = false;

    this._leoHP  = 5;
    this._leoHpBar = this._buildLeoHpBar();

    txt(this, ARENA_W / 2, ARENA_H / 2 - 8,
      'F: FART   WASD/ARROWS: MOVE', { fontSize: '8px', color: '#778899' })
      .setOrigin(0.5).setDepth(10);
  }

  update(time, delta) {
    if (this._defeated || this._gameover) return;
    const dt = delta / 1000;

    this._moveLeo(dt);
    this._updateEdie(dt, delta);
    this._updateProjectiles(dt);
    this._checkFart(delta);
    this._checkLeoHit();
  }

  // ── Leo movement ─────────────────────────────────────────────────────────────

  _moveLeo(dt) {
    let vx = 0, vy = 0;
    const k = this._cursors, w = this._wasd;
    if (k.left.isDown  || w.A.isDown) vx = -LEO_SPEED;
    if (k.right.isDown || w.D.isDown) vx =  LEO_SPEED;
    if (k.up.isDown    || w.W.isDown) vy = -LEO_SPEED;
    if (k.down.isDown  || w.S.isDown) vy =  LEO_SPEED;
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    this._leoX = Phaser.Math.Clamp(this._leoX + vx * dt, 20, ARENA_W - 20);
    this._leoY = Phaser.Math.Clamp(this._leoY + vy * dt, 20, ARENA_H - 20);
    this._leoSprite.setPosition(this._leoX, this._leoY);
  }

  // ── Edie AI ───────────────────────────────────────────────────────────────────

  _updateEdie(dt, delta) {
    if (this._charging) {
      this._chargeMs -= delta;
      this._edieX += this._chargeVx * dt;
      this._edieY += this._chargeVy * dt;
      this._edieX = Phaser.Math.Clamp(this._edieX, 20, ARENA_W - 20);
      this._edieY = Phaser.Math.Clamp(this._edieY, 20, ARENA_H - 20);
      if (this._chargeMs <= 0) this._charging = false;
    } else {
      // Drift toward Leo
      const dx = this._leoX - this._edieX;
      const dy = this._leoY - this._edieY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      this._edieX += (dx / dist) * EDIE_SPEED * dt;
      this._edieY += (dy / dist) * EDIE_SPEED * dt;

      // Throw
      this._throwTimer -= delta;
      if (this._throwTimer <= 0) {
        this._throwProjectile();
        this._throwTimer = THROW_INTERVAL;
      }

      // Charge
      this._chargeTimer -= delta;
      if (this._chargeTimer <= 0) {
        this._startCharge();
        this._chargeTimer = CHARGE_INTERVAL;
      }
    }

    // Hit flash
    if (this._hitFlashTimer > 0) {
      this._hitFlashTimer -= delta;
      this._edieSprite.setFillStyle(this._hitFlashTimer % 200 < 100 ? 0xffffff : EDIE_COLOR);
    }

    this._edieSprite.setPosition(this._edieX, this._edieY);
  }

  _startCharge() {
    const dx = this._leoX - this._edieX;
    const dy = this._leoY - this._edieY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    this._chargeVx = (dx / dist) * CHARGE_SPEED;
    this._chargeVy = (dy / dist) * CHARGE_SPEED;
    this._chargeMs = CHARGE_DURATION;
    this._charging = true;
    this._edieSprite.setFillStyle(0xff0088);
  }

  _throwProjectile() {
    const dx = this._leoX - this._edieX;
    const dy = this._leoY - this._edieY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const item = this.add.rectangle(this._edieX, this._edieY, 7, 7, 0xaa7744).setDepth(4);
    this._projectiles.push({
      sprite: item,
      vx: (dx / dist) * PROJECTILE_SPEED,
      vy: (dy / dist) * PROJECTILE_SPEED,
    });
  }

  _updateProjectiles(dt) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      if (p.sprite.x < 0 || p.sprite.x > ARENA_W || p.sprite.y < 0 || p.sprite.y > ARENA_H) {
        p.sprite.destroy();
        this._projectiles.splice(i, 1);
      }
    }
  }

  // ── Fart ──────────────────────────────────────────────────────────────────────

  _checkFart(delta) {
    if (!this._fartReady) {
      this._fartCooldown -= delta;
      if (this._fartCooldown <= 0) this._fartReady = true;
    }

    if (Phaser.Input.Keyboard.JustDown(this._fartKey) && this._fartReady) {
      this._fartReady = false;
      this._fartCooldown = FART_CD;
      const ring = this.add.circle(this._leoX, this._leoY, 6, 0xf5e642, 0.9).setDepth(6);
      this.tweens.add({ targets: ring, displayWidth: FART_RADIUS * 2, displayHeight: FART_RADIUS * 2, alpha: 0, duration: 350, onComplete: () => ring.destroy() });

      const dx = this._edieX - this._leoX;
      const dy = this._edieY - this._leoY;
      if (Math.sqrt(dx * dx + dy * dy) < FART_RADIUS) {
        this._hitEdie();
      }
    }
  }

  _hitEdie() {
    this._edieHP--;
    this._hitFlashTimer = 500;
    this._hpFill.setSize(Math.max(0, (116 / EDIE_HP) * this._edieHP), 6);

    const floatTxt = txt(this, this._edieX, this._edieY - 14, '-1', { fontSize: '8px', color: '#ffff44' }).setDepth(10);
    this.tweens.add({ targets: floatTxt, y: this._edieY - 40, alpha: 0, duration: 800, onComplete: () => floatTxt.destroy() });

    if (this._edieHP <= 0) this._defeatEdie();
  }

  _defeatEdie() {
    this._defeated = true;
    this._edieSprite.setFillStyle(0x444444);
    this._projectiles.forEach(p => p.sprite.destroy());
    this._projectiles = [];

    const banner = txt(this, ARENA_W / 2, ARENA_H / 2, 'EDIE DEFEATED!', {
      fontSize: '16px', color: '#f5e642',
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets: banner, alpha: 0.2, yoyo: true, repeat: 3, duration: 300, onComplete: () => {
      banner.destroy();
      this.time.delayedCall(600, () => {
        this.scene.get(SCENE_DIALOGUE).showScript('edie_defeated', () => {
          this.cameras.main.fade(500, 0, 0, 0);
          this.time.delayedCall(520, () => {
            this.scene.start(SCENE_BOSS_GAUNTLET, {
              ...this._gauntletData,
              edieDefeated: true,
            });
          });
        });
      });
    }});
  }

  // ── Leo hit ───────────────────────────────────────────────────────────────────

  _checkLeoHit() {
    if (this._leoHitCooldown > 0) {
      this._leoHitCooldown -= this.game.loop.delta;
      return;
    }

    // Check charge hit
    const cedx = this._leoX - this._edieX;
    const cedy = this._leoY - this._edieY;
    if (this._charging && Math.sqrt(cedx * cedx + cedy * cedy) < 18) {
      this._damageLeo(2);
      return;
    }

    // Check projectile hits
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      const pdx = this._leoX - p.sprite.x;
      const pdy = this._leoY - p.sprite.y;
      if (Math.sqrt(pdx * pdx + pdy * pdy) < 12) {
        p.sprite.destroy();
        this._projectiles.splice(i, 1);
        this._damageLeo(1);
        break;
      }
    }
  }

  _damageLeo(amount) {
    this._leoHP = Math.max(0, this._leoHP - amount);
    this._leoHitCooldown = 800;
    this._leoSprite.setFillStyle(0xff0000);
    this.time.delayedCall(200, () => this._leoSprite.setFillStyle(0x3b82f6));
    this.cameras.main.flash(180, 255, 50, 50);
    this._updateLeoHp();

    if (this._leoHP <= 0) {
      this._gameover = true;
      this.time.delayedCall(400, () => {
        this.scene.start(SCENE_GAME_OVER, { reason: 'gauntlet' });
      });
    }
  }

  _buildLeoHpBar() {
    txt(this, 8, 8, 'LEO', { fontSize: '8px', color: '#3b82f6' });
    this.add.rectangle(50 + (this._leoHP * 8), 14, this._leoHP * 16, 6, 0x1a1a1a).setOrigin(1, 0.5);
    const fill = this.add.rectangle(10, 14, this._leoHP * 16, 4, 0x3b82f6).setOrigin(0, 0.5);
    return fill;
  }

  _updateLeoHp() {
    this._leoHpBar.setSize(Math.max(0, this._leoHP * 16), 4);
  }
}
