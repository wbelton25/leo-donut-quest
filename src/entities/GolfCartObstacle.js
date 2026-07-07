import { TILE_SIZE, SFX_GOLF_CART_HIT } from '../constants.js';
import AudioManager from '../systems/AudioManager.js';

// GolfCartObstacle: a golf cart with a visible driver.
// Uses sprite-golf-cart atlas when loaded; falls back to primitives.
//
// Constructor (pixel coords):
//   scene, x, y      — center spawn position in pixels
//   minBound, maxBound — patrol range in pixels on the patrol axis
//   isHorizontal     — true = E-W, false = N-S
//   onHitPlayer(damage) — callback
//   speed            — optional override (default 65 px/s)
//   damage           — optional override (default 15)

const DEFAULT_SPEED  = 65;
const DEFAULT_DAMAGE = 15;
const HIT_COOLDOWN   = 2000;
const T = TILE_SIZE;
const SPRITE_KEY = 'sprite-golf-cart';

export default class GolfCartObstacle {
  constructor(scene, x, y, minBound, maxBound, isHorizontal = true, onHitPlayer, speed, damage) {
    this._scene       = scene;
    this._onHitPlayer = onHitPlayer;
    this._isH         = isHorizontal;
    this._lastHit     = 0;
    this._baseSpeed   = speed  ?? DEFAULT_SPEED;
    this._speed       = this._baseSpeed;
    this._damage      = damage ?? DEFAULT_DAMAGE;
    this._x = x;
    this._y = y;
    this._lastDir = null;

    if (this._isH) {
      this._minX = minBound; this._maxX = maxBound;
    } else {
      this._minY = minBound; this._maxY = maxBound;
    }

    const dir = Math.random() < 0.5 ? 1 : -1;
    this._vx = this._isH ? this._speed * dir : 0;
    this._vy = this._isH ? 0 : this._speed * dir;

    // Occasional speed variation (inconsistent driver)
    scene.time.addEvent({
      delay: Phaser.Math.Between(3000, 6000),
      loop: true,
      callback: () => {
        this._speed = this._baseSpeed + Phaser.Math.Between(-12, 12);
        const d = (this._isH ? this._vx : this._vy) > 0 ? 1 : -1;
        if (this._isH) this._vx = this._speed * d;
        else           this._vy = this._speed * d;
      },
    });

    const hasSprite = scene.textures.exists(SPRITE_KEY);
    if (hasSprite) {
      this._sprite = scene.add.sprite(x, y, SPRITE_KEY, 'right-0')
        .setDisplaySize(T * 3, T * 3)
        .setDepth(3);
      this._parts = null;
    } else {
      this._sprite = null;
      this._parts  = this._buildParts(scene, x, y);
    }
  }

  _buildParts(scene, x, y) {
    return {
      chassis:    scene.add.rectangle(x, y, T * 2.2, T * 1.4, 0xf4e8c0).setDepth(3),
      seat:       scene.add.rectangle(x, y, T * 1.1, T * 0.77, 0xd8c898).setDepth(4),
      canopy:     scene.add.rectangle(x, y, T * 1.65, T * 0.28, 0x1e5c1e).setDepth(5),
      postL:      scene.add.rectangle(x, y, T * 0.18, T * 0.77, 0x1e5c1e).setDepth(4),
      postR:      scene.add.rectangle(x, y, T * 0.18, T * 0.77, 0x1e5c1e).setDepth(4),
      driverBody: scene.add.rectangle(x, y, T * 0.75, T * 0.9, 0xe8d850).setDepth(5),
      driverHead: scene.add.rectangle(x, y, T * 0.72, T * 0.68, 0xe8c478).setDepth(6),
      visor:      scene.add.rectangle(x, y, T * 0.82, T * 0.22, 0x3355aa).setDepth(7),
      wheels:     Array.from({ length: 4 }, () =>
                    scene.add.circle(x, y, 3, 0x222222).setDepth(3)),
    };
  }

  _getDir() {
    if (this._isH) return this._vx >= 0 ? 'right' : 'left';
    return this._vy >= 0 ? 'down' : 'up';
  }

  _updateFrame() {
    const dir = this._getDir();
    if (dir !== this._lastDir) {
      this._lastDir = dir;
      this._sprite.setFrame(`${dir}-0`);
    }
    this._sprite.setPosition(this._x, this._y);
  }

  _updateParts() {
    const x = this._x, y = this._y;
    const p = this._parts;
    const dir = this._getDir();
    if (dir === 'right' || dir === 'left') {
      const s = dir === 'right' ? 1 : -1;
      const bw = p.chassis.width, bh = p.chassis.height;
      p.chassis.setPosition(x, y);
      p.seat.setPosition(x - s * bw * 0.12, y + T * 0.1);
      p.canopy.setPosition(x + s * T * 0.1, y - bh * 0.5 - T * 0.14);
      p.postL.setPosition(x + s * T * 0.7, y - bh * 0.15);
      p.postR.setPosition(x - s * T * 0.3, y - bh * 0.15);
      p.driverBody.setPosition(x + s * T * 0.38, y - T * 0.08);
      p.driverHead.setPosition(x + s * T * 0.38, y - T * 0.82);
      p.visor.setPosition(x + s * T * 0.38, y - T * 1.08);
      const wx = bw * 0.42, wy = bh * 0.42;
      p.wheels[0].setPosition(x + s * wx, y - wy);
      p.wheels[1].setPosition(x + s * wx, y + wy);
      p.wheels[2].setPosition(x - s * wx, y - wy);
      p.wheels[3].setPosition(x - s * wx, y + wy);
    } else {
      const s = dir === 'down' ? 1 : -1;
      const bw = p.chassis.width, bh = p.chassis.height;
      p.chassis.setPosition(x, y);
      p.seat.setPosition(x + T * 0.1, y - s * bh * 0.12);
      p.canopy.setPosition(x - bw * 0.5 - T * 0.14, y + s * T * 0.1);
      p.postL.setPosition(x - bw * 0.15, y + s * T * 0.7);
      p.postR.setPosition(x - bw * 0.15, y - s * T * 0.3);
      p.driverBody.setPosition(x - T * 0.08, y + s * T * 0.38);
      p.driverHead.setPosition(x - T * 0.82, y + s * T * 0.38);
      p.visor.setPosition(x - T * 1.08, y + s * T * 0.38);
      const wx = bw * 0.42, wy = T * 0.95;
      p.wheels[0].setPosition(x - wx, y + s * wy);
      p.wheels[1].setPosition(x + wx, y + s * wy);
      p.wheels[2].setPosition(x - wx, y - s * wy);
      p.wheels[3].setPosition(x + wx, y - s * wy);
    }
  }

  update(player) {
    const dt = 1 / 60;
    this._x += this._vx * dt;
    this._y += this._vy * dt;

    if (this._isH) {
      if (this._x <= this._minX || this._x >= this._maxX) {
        this._vx *= -1;
        this._x = Phaser.Math.Clamp(this._x, this._minX, this._maxX);
      }
    } else {
      if (this._y <= this._minY || this._y >= this._maxY) {
        this._vy *= -1;
        this._y = Phaser.Math.Clamp(this._y, this._minY, this._maxY);
      }
    }

    if (this._sprite) this._updateFrame();
    else              this._updateParts();

    const dx = Math.abs(player.x - this._x);
    const dy = Math.abs(player.y - this._y);
    if (dx < T * 1.5 && dy < T * 1.2) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer(this._damage);
        if (this._scene.cache.audio.exists(SFX_GOLF_CART_HIT))
          AudioManager.playSfx(this._scene, SFX_GOLF_CART_HIT, { volume: 0.8 });
      }
    }
  }

  setDepth(d) {
    if (this._sprite) { this._sprite.setDepth(d); return this; }
    const p = this._parts;
    p.chassis.setDepth(d); p.seat.setDepth(d + 1);
    p.canopy.setDepth(d + 2); p.postL.setDepth(d + 1); p.postR.setDepth(d + 1);
    p.driverBody.setDepth(d + 2); p.driverHead.setDepth(d + 3); p.visor.setDepth(d + 4);
    p.wheels.forEach(w => w.setDepth(d));
    return this;
  }

  destroy() {
    if (this._sprite) { this._sprite.destroy(); return; }
    const p = this._parts;
    p.chassis.destroy(); p.seat.destroy(); p.canopy.destroy();
    p.postL.destroy(); p.postR.destroy();
    p.driverBody.destroy(); p.driverHead.destroy(); p.visor.destroy();
    p.wheels.forEach(w => w.destroy());
  }
}
