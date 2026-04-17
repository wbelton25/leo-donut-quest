import { TILE_SIZE } from '../constants.js';

// GolfCartObstacle: a golf cart puttering along at medium speed.
// Slight random speed variation — feels like someone who can't keep a steady pace.
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

export default class GolfCartObstacle {
  constructor(scene, x, y, minBound, maxBound, isHorizontal = true, onHitPlayer, speed, damage) {
    this._scene       = scene;
    this._onHitPlayer = onHitPlayer;
    this._isH         = isHorizontal;
    this._lastHit     = 0;
    this._baseSpeed   = speed ?? DEFAULT_SPEED;
    this._speed       = this._baseSpeed;
    this._damage      = damage ?? DEFAULT_DAMAGE;

    this._x = x;
    this._y = y;

    if (this._isH) {
      this._minX = minBound; this._maxX = maxBound;
    } else {
      this._minY = minBound; this._maxY = maxBound;
    }

    const dir = Math.random() < 0.5 ? 1 : -1;
    this._vx = this._isH ? this._speed * dir : 0;
    this._vy = this._isH ? 0 : this._speed * dir;

    // Vary speed occasionally (golf cart driver being inconsistent)
    scene.time.addEvent({
      delay: Phaser.Math.Between(3000, 6000),
      loop: true,
      callback: () => {
        this._speed = this._baseSpeed + Phaser.Math.Between(-15, 15);
        const dir = (this._isH ? this._vx : this._vy) > 0 ? 1 : -1;
        if (this._isH) this._vx = this._speed * dir;
        else           this._vy = this._speed * dir;
      },
    });

    // Visuals — cream body with green canopy
    const bw = this._isH ? TILE_SIZE * 2 : TILE_SIZE * 1.5;
    const bh = this._isH ? TILE_SIZE * 1.5 : TILE_SIZE * 2;
    this._body   = scene.add.rectangle(x, y, bw, bh, 0xf0e8c0).setDepth(2);
    this._canopy = scene.add.rectangle(x, y - 3, bw * 0.8, bh * 0.45, 0x336633).setDepth(3);
    this._wheelL = scene.add.circle(x - (this._isH ? bw * 0.35 : 0),
                                    y + (this._isH ? 0 : bh * 0.35), 3, 0x333333).setDepth(2);
    this._wheelR = scene.add.circle(x + (this._isH ? bw * 0.35 : 0),
                                    y - (this._isH ? 0 : bh * 0.35), 3, 0x333333).setDepth(2);
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
    this._canopy.setPosition(this._x, this._y - 3);
    const bw = this._body.width, bh = this._body.height;
    this._wheelL.setPosition(this._x - (this._isH ? bw * 0.35 : 0),
                              this._y + (this._isH ? 0 : bh * 0.35));
    this._wheelR.setPosition(this._x + (this._isH ? bw * 0.35 : 0),
                              this._y - (this._isH ? 0 : bh * 0.35));

    const dx = Math.abs(player.x - this._x);
    const dy = Math.abs(player.y - this._y);
    if (dx < TILE_SIZE * 1.5 && dy < TILE_SIZE * 1.2) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer(this._damage);
      }
    }
  }

  destroy() {
    this._body.destroy();
    this._canopy.destroy();
    this._wheelL.destroy();
    this._wheelR.destroy();
  }
}
