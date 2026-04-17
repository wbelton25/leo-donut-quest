import { TILE_SIZE } from '../constants.js';

// CarObstacle: a car driving along a road at speed.
// No grazing — drives constantly. Higher damage than deer.
//
// Constructor (pixel coords):
//   scene, x, y      — center spawn position in pixels
//   minBound, maxBound — patrol range in pixels on the patrol axis
//   isHorizontal     — true = E-W lane, false = N-S lane
//   onHitPlayer(damage) — callback
//   speed            — optional override (default 160 px/s)
//   damage           — optional override (default 25)

const DEFAULT_SPEED  = 160;
const DEFAULT_DAMAGE = 25;
const HIT_COOLDOWN   = 2500;

const CAR_COLORS = [0xcc2222, 0x2244cc, 0xaaaaaa, 0x228833, 0xaa6600];

export default class CarObstacle {
  constructor(scene, x, y, minBound, maxBound, isHorizontal = true, onHitPlayer, speed, damage) {
    this._scene       = scene;
    this._onHitPlayer = onHitPlayer;
    this._isH         = isHorizontal;
    this._lastHit     = 0;
    this._speed       = speed ?? DEFAULT_SPEED;
    this._damage      = damage ?? DEFAULT_DAMAGE;

    this._x = x;
    this._y = y;

    if (this._isH) {
      this._minX = minBound; this._maxX = maxBound;
    } else {
      this._minY = minBound; this._maxY = maxBound;
    }

    const dir = Math.random() < 0.5 ? 1 : -1;
    this._vx = this._isH ?  this._speed * dir : 0;
    this._vy = this._isH ? 0 : this._speed * dir;

    // Visuals — rectangle body + two wheel dots
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const bw = this._isH ? TILE_SIZE * 2.5 : TILE_SIZE * 1.5;
    const bh = this._isH ? TILE_SIZE * 1.5 : TILE_SIZE * 2.5;
    this._body   = scene.add.rectangle(x, y, bw, bh, color).setDepth(2);
    this._roof   = scene.add.rectangle(x, y, bw * 0.6, bh * 0.55, 0x000000, 0.35).setDepth(3);
    const wOff = this._isH ? bw * 0.35 : 0;
    const hOff = this._isH ? 0 : bh * 0.35;
    this._wheelL = scene.add.circle(x - wOff, y + hOff, 3, 0x111111).setDepth(2);
    this._wheelR = scene.add.circle(x + wOff, y - hOff, 3, 0x111111).setDepth(2);
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
    this._roof.setPosition(this._x, this._y);
    const wOff = this._isH ? this._body.width * 0.35 : 0;
    const hOff = this._isH ? 0 : this._body.height * 0.35;
    this._wheelL.setPosition(this._x - wOff, this._y + hOff);
    this._wheelR.setPosition(this._x + wOff, this._y - hOff);

    const dx = Math.abs(player.x - this._x);
    const dy = Math.abs(player.y - this._y);
    if (dx < TILE_SIZE * 2 && dy < TILE_SIZE * 1.5) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer(this._damage);
      }
    }
  }

  destroy() {
    this._body.destroy();
    this._roof.destroy();
    this._wheelL.destroy();
    this._wheelR.destroy();
  }
}
