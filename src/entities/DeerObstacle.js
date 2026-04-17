import { TILE_SIZE } from '../constants.js';

// DeerObstacle: a deer that wanders back and forth along a road segment.
// Colliding with a deer drains bike condition.
//
// Constructor (pixel coords):
//   scene, x, y      — center spawn position in pixels
//   minBound, maxBound — patrol range in pixels on the patrol axis
//   isHorizontal     — true = patrol X axis (E-W), false = patrol Y axis (N-S)
//   onHitPlayer(damage) — callback when player is hit
//   speed            — optional override (default 40 px/s)

const DEFAULT_SPEED = 40;
const HIT_COOLDOWN  = 2000;

export default class DeerObstacle {
  constructor(scene, x, y, minBound, maxBound, isHorizontal = true, onHitPlayer, speed) {
    this._scene       = scene;
    this._onHitPlayer = onHitPlayer;
    this._isH         = isHorizontal;
    this._lastHit     = 0;
    this._speed       = speed ?? DEFAULT_SPEED;

    this._x = x;
    this._y = y;

    if (this._isH) {
      this._minX = minBound;
      this._maxX = maxBound;
      this._minY = this._maxY = y;
    } else {
      this._minY = minBound;
      this._maxY = maxBound;
      this._minX = this._maxX = x;
    }

    const dir = Math.random() < 0.5 ? 1 : -1;
    this._vx = this._isH ? this._speed * dir : 0;
    this._vy = this._isH ? 0 : this._speed * dir;

    // Visuals
    this._body = scene.add.rectangle(x, y, TILE_SIZE * 1.5, TILE_SIZE, 0x8b5e3c);
    this._earL = scene.add.rectangle(x - 4, y - 6, 3, 5, 0x6b3a1f);
    this._earR = scene.add.rectangle(x + 4, y - 6, 3, 5, 0x6b3a1f);

    scene.time.addEvent({
      delay: Phaser.Math.Between(3000, 7000),
      loop: true,
      callback: this._graze,
      callbackScope: this,
    });
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

    this._body.setPosition(this._x, this._y);
    this._earL.setPosition(this._x - 4, this._y - 6);
    this._earR.setPosition(this._x + 4, this._y - 6);
    this._body.setFillStyle((this._isH ? this._vx : this._vy) > 0 ? 0x8b5e3c : 0x7a5230);

    const dx = Math.abs(player.x - this._x);
    const dy = Math.abs(player.y - this._y);
    if (dx < TILE_SIZE * 1.5 && dy < TILE_SIZE) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer(10);
        // Bolt away from player
        if (this._isH) {
          this._vx = (player.x < this._x ? 1 : -1) * this._speed * 2.5;
          this._scene.time.delayedCall(800, () => {
            this._vx = this._speed * (this._vx > 0 ? 1 : -1);
          });
        } else {
          this._vy = (player.y < this._y ? 1 : -1) * this._speed * 2.5;
          this._scene.time.delayedCall(800, () => {
            this._vy = this._speed * (this._vy > 0 ? 1 : -1);
          });
        }
      }
    }
  }

  _graze() {
    this._vx = 0;
    this._vy = 0;
    this._scene.time.delayedCall(Phaser.Math.Between(800, 2000), () => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      if (this._isH) this._vx = this._speed * dir;
      else           this._vy = this._speed * dir;
    });
  }

  destroy() {
    this._body.destroy();
    this._earL.destroy();
    this._earR.destroy();
  }
}
