import { TILE_SIZE } from '../constants.js';

// BikeObstacle: a kid on a bike weaving unpredictably along a path.
// Sinusoidal weave on the perpendicular axis + occasional speed bursts.
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
const WEAVE_AMP      = 8;   // pixels of perpendicular weave
const WEAVE_PERIOD   = 2.2; // seconds per full weave cycle

export default class BikeObstacle {
  constructor(scene, x, y, minBound, maxBound, isHorizontal = true, onHitPlayer, speed, damage) {
    this._scene       = scene;
    this._onHitPlayer = onHitPlayer;
    this._isH         = isHorizontal;
    this._lastHit     = 0;
    this._baseSpeed   = speed ?? DEFAULT_SPEED;
    this._speed       = this._baseSpeed;
    this._damage      = damage ?? DEFAULT_DAMAGE;
    this._waveTimer   = Math.random() * Math.PI * 2; // random phase start
    this._baseY       = y;  // centre Y (for H patrol)
    this._baseX       = x;  // centre X (for V patrol)

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

    // Visuals — rider (blue) on a bike (orange)
    this._bikeBody = scene.add.rectangle(x, y, TILE_SIZE * 1.4, TILE_SIZE * 0.6, 0xff8800).setDepth(2);
    this._rider    = scene.add.rectangle(x, y - 5, TILE_SIZE * 0.7, TILE_SIZE * 0.9, 0x336699).setDepth(3);
    this._wheelF   = scene.add.circle(x + (this._isH ? 8 : 0), y + (this._isH ? 0 : 8), 4, 0x222222).setDepth(2);
    this._wheelB   = scene.add.circle(x - (this._isH ? 8 : 0), y - (this._isH ? 0 : 8), 4, 0x222222).setDepth(2);
  }

  update(player) {
    const dt = 1 / 60;
    this._waveTimer += dt * (2 * Math.PI / WEAVE_PERIOD);

    this._x += this._vx * dt;
    this._y += this._vy * dt;

    // Apply weave on perpendicular axis
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

    this._bikeBody.setPosition(this._x, this._y);
    this._rider.setPosition(this._x, this._y - 5);
    const fOff = this._isH ? 8 : 0, bOff = this._isH ? 0 : 8;
    this._wheelF.setPosition(this._x + fOff, this._y + bOff);
    this._wheelB.setPosition(this._x - fOff, this._y - bOff);

    const dx = Math.abs(player.x - this._x);
    const dy = Math.abs(player.y - this._y);
    if (dx < TILE_SIZE * 1.2 && dy < TILE_SIZE) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer(this._damage);
      }
    }
  }

  destroy() {
    this._bikeBody.destroy();
    this._rider.destroy();
    this._wheelF.destroy();
    this._wheelB.destroy();
  }
}
