import { TILE_SIZE } from '../constants.js';

// BikeObstacle: a kid on a bike weaving unpredictably along a path.
// Uses sprite-bike atlas when loaded; falls back to colored rectangles.
//
// Constructor (pixel coords):
//   scene, x, y      — center spawn position in pixels
//   minBound, maxBound — patrol range in pixels on the patrol axis
//   isHorizontal     — true = E-W, false = N-S
//   onHitPlayer(damage) — callback
//   speed            — optional override (default 85 px/s)
//   damage           — optional override (default 10)

const DEFAULT_SPEED  = 85;
const DEFAULT_DAMAGE = 10;
const HIT_COOLDOWN   = 1500;
const WEAVE_AMP      = 8;
const WEAVE_PERIOD   = 2.2;
const T = TILE_SIZE;
const SPRITE_KEY = 'sprite-bike';

export default class BikeObstacle {
  constructor(scene, x, y, minBound, maxBound, isHorizontal = true, onHitPlayer, speed, damage) {
    this._scene       = scene;
    this._onHitPlayer = onHitPlayer;
    this._isH         = isHorizontal;
    this._lastHit     = 0;
    this._baseSpeed   = speed ?? DEFAULT_SPEED;
    this._speed       = this._baseSpeed;
    this._damage      = damage ?? DEFAULT_DAMAGE;
    this._waveTimer   = Math.random() * Math.PI * 2;
    this._baseY       = y;
    this._baseX       = x;
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

    // Occasional speed burst
    scene.time.addEvent({
      delay: Phaser.Math.Between(4000, 8000),
      loop: true,
      callback: () => {
        const prevDir = (this._isH ? this._vx : this._vy) > 0 ? 1 : -1;
        const burstSpeed = this._baseSpeed * 2;
        if (this._isH) this._vx = burstSpeed * prevDir;
        else           this._vy = burstSpeed * prevDir;
        scene.time.delayedCall(500, () => {
          if (this._isH) this._vx = this._speed * prevDir;
          else           this._vy = this._speed * prevDir;
        });
      },
    });

    const hasSprite = scene.textures.exists(SPRITE_KEY);
    if (hasSprite) {
      this._sprite    = scene.add.sprite(x, y, SPRITE_KEY, 'right-0')
        .setDisplaySize(T * 3, T * 3)
        .setDepth(4);
      this._parts = null;
    } else {
      this._sprite = null;
      this._parts  = {
        bikeBody: scene.add.rectangle(x, y, T * 1.4, T * 0.6, 0xff8800).setDepth(3),
        rider:    scene.add.rectangle(x, y - 5, T * 0.7, T * 0.9, 0x336699).setDepth(4),
        wheelF:   scene.add.circle(x + (isHorizontal ? 8 : 0), y + (isHorizontal ? 0 : 8), 4, 0x222222).setDepth(3),
        wheelB:   scene.add.circle(x - (isHorizontal ? 8 : 0), y - (isHorizontal ? 0 : 8), 4, 0x222222).setDepth(3),
      };
    }
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
    const p = this._parts;
    p.bikeBody.setPosition(this._x, this._y);
    p.rider.setPosition(this._x, this._y - 5);
    const fOff = this._isH ? 8 : 0, bOff = this._isH ? 0 : 8;
    p.wheelF.setPosition(this._x + fOff, this._y + bOff);
    p.wheelB.setPosition(this._x - fOff, this._y - bOff);
  }

  update(player) {
    const dt = 1 / 60;
    this._waveTimer += dt * (2 * Math.PI / WEAVE_PERIOD);

    this._x += this._vx * dt;
    this._y += this._vy * dt;

    if (this._isH) {
      this._y = this._baseY + Math.sin(this._waveTimer) * WEAVE_AMP;
      if (this._x <= this._minX || this._x >= this._maxX) {
        this._vx *= -1;
        this._x = Phaser.Math.Clamp(this._x, this._minX, this._maxX);
      }
    } else {
      this._x = this._baseX + Math.sin(this._waveTimer) * WEAVE_AMP;
      if (this._y <= this._minY || this._y >= this._maxY) {
        this._vy *= -1;
        this._y = Phaser.Math.Clamp(this._y, this._minY, this._maxY);
      }
    }

    if (this._sprite) this._updateFrame();
    else              this._updateParts();

    const dx = Math.abs(player.x - this._x);
    const dy = Math.abs(player.y - this._y);
    if (dx < T * 1.2 && dy < T) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer(this._damage);
      }
    }
  }

  setDepth(d) {
    if (this._sprite) { this._sprite.setDepth(d); return this; }
    const p = this._parts;
    p.bikeBody.setDepth(d); p.rider.setDepth(d + 1);
    p.wheelF.setDepth(d); p.wheelB.setDepth(d);
    return this;
  }

  destroy() {
    if (this._sprite) { this._sprite.destroy(); return; }
    const p = this._parts;
    p.bikeBody.destroy(); p.rider.destroy();
    p.wheelF.destroy(); p.wheelB.destroy();
  }
}
