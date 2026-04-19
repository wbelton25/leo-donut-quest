import { TILE_SIZE } from '../constants.js';

// GolfCartObstacle: a golf cart with a visible driver (like Leo/followers).
// Putters along at medium speed with slight random speed variation.
// Multi-part: cart chassis, canopy + posts, seated driver (head + body).
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

    // ── Visuals ───────────────────────────────────────────────────────────────
    // Chassis / floor (cream)
    this._chassis    = scene.add.rectangle(x, y, 1, 1, 0xf4e8c0).setDepth(3);
    // Seat bench (slightly darker)
    this._seat       = scene.add.rectangle(x, y, 1, 1, 0xd8c898).setDepth(4);
    // Canopy roof (dark green)
    this._canopy     = scene.add.rectangle(x, y, 1, 1, 0x1e5c1e).setDepth(5);
    // Canopy support posts (two thin green bars)
    this._postL      = scene.add.rectangle(x, y, 1, 1, 0x1e5c1e).setDepth(4);
    this._postR      = scene.add.rectangle(x, y, 1, 1, 0x1e5c1e).setDepth(4);
    // Driver body (polo shirt — yellow/white)
    this._driverBody = scene.add.rectangle(x, y, 1, 1, 0xe8d850).setDepth(5);
    // Driver head (skin tone — same style as Leo/follower fallback)
    this._driverHead = scene.add.rectangle(x, y, 1, 1, 0xe8c478).setDepth(6);
    // Driver visor cap
    this._visor      = scene.add.rectangle(x, y, 1, 1, 0x3355aa).setDepth(7);
    // 4 wheels
    this._wheels = Array.from({ length: 4 }, () =>
      scene.add.circle(x, y, 3, 0x222222).setDepth(3)
    );

    this._updateLayout();
  }

  _getDir() {
    if (this._isH) return this._vx >= 0 ? 'right' : 'left';
    return this._vy >= 0 ? 'down' : 'up';
  }

  _updateLayout() {
    const x = this._x, y = this._y;
    const dir = this._getDir();

    if (dir === 'right' || dir === 'left') {
      const s = dir === 'right' ? 1 : -1;
      const bw = T * 2.2, bh = T * 1.4;

      // Chassis
      this._chassis.setSize(bw, bh).setPosition(x, y);
      // Seat (rear half of cart)
      this._seat.setSize(bw * 0.5, bh * 0.55).setPosition(x - s * bw * 0.12, y + T * 0.1);
      // Canopy (over front-centre)
      this._canopy.setSize(bw * 0.75, T * 0.28).setPosition(x + s * T * 0.1, y - bh * 0.5 - T * 0.14);
      // Canopy posts (front and rear struts)
      this._postL.setSize(T * 0.18, bh * 0.55).setPosition(x + s * T * 0.7, y - bh * 0.15);
      this._postR.setSize(T * 0.18, bh * 0.55).setPosition(x - s * T * 0.3, y - bh * 0.15);
      // Driver — seated in front, body
      this._driverBody.setSize(T * 0.75, T * 0.9).setPosition(x + s * T * 0.38, y - T * 0.08);
      // Driver head above body
      this._driverHead.setSize(T * 0.72, T * 0.68).setPosition(x + s * T * 0.38, y - T * 0.82);
      // Visor (cap brim) — tiny strip at top of head
      this._visor.setSize(T * 0.82, T * 0.22).setPosition(x + s * T * 0.38, y - T * 1.08);
      // 4 wheels at corners
      const wx = bw * 0.42, wy = bh * 0.42;
      this._wheels[0].setPosition(x + s * wx, y - wy);
      this._wheels[1].setPosition(x + s * wx, y + wy);
      this._wheels[2].setPosition(x - s * wx, y - wy);
      this._wheels[3].setPosition(x - s * wx, y + wy);
    } else {
      const s = dir === 'down' ? 1 : -1;
      const bw = T * 1.4, bh = T * 2.2;

      this._chassis.setSize(bw, bh).setPosition(x, y);
      this._seat.setSize(bw * 0.55, bh * 0.5).setPosition(x + T * 0.1, y - s * bh * 0.12);
      this._canopy.setSize(T * 0.28, bh * 0.75).setPosition(x - bw * 0.5 - T * 0.14, y + s * T * 0.1);
      this._postL.setSize(bw * 0.55, T * 0.18).setPosition(x - bw * 0.15, y + s * T * 0.7);
      this._postR.setSize(bw * 0.55, T * 0.18).setPosition(x - bw * 0.15, y - s * T * 0.3);
      // Driver — seated toward front
      this._driverBody.setSize(T * 0.9, T * 0.75).setPosition(x - T * 0.08, y + s * T * 0.38);
      this._driverHead.setSize(T * 0.68, T * 0.72).setPosition(x - T * 0.82, y + s * T * 0.38);
      this._visor.setSize(T * 0.22, T * 0.82).setPosition(x - T * 1.08, y + s * T * 0.38);
      // 4 wheels
      const wx = bw * 0.42, wy = bh * 0.42;
      this._wheels[0].setPosition(x - wx, y + s * wy);
      this._wheels[1].setPosition(x + wx, y + s * wy);
      this._wheels[2].setPosition(x - wx, y - s * wy);
      this._wheels[3].setPosition(x + wx, y - s * wy);
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

    this._updateLayout();

    const dx = Math.abs(player.x - this._x);
    const dy = Math.abs(player.y - this._y);
    if (dx < T * 1.5 && dy < T * 1.2) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer(this._damage);
      }
    }
  }

  destroy() {
    this._chassis.destroy();
    this._seat.destroy();
    this._canopy.destroy();
    this._postL.destroy();
    this._postR.destroy();
    this._driverBody.destroy();
    this._driverHead.destroy();
    this._visor.destroy();
    this._wheels.forEach(w => w.destroy());
  }
}
