import { TILE_SIZE } from '../constants.js';

// CarObstacle: a car driving along a road at speed.
// Multi-part: body, roof, windshield (direction-aware), rear window,
//             4 corner wheels, headlights, and a driver silhouette.
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
const T = TILE_SIZE;

const CAR_COLORS = [0xcc2222, 0x2244cc, 0xaaaaaa, 0x228833, 0xaa6600];

// Slightly darker shade of a color for roof/trim
const darken = c => {
  const r = ((c >> 16) & 0xff) * 0.65 | 0;
  const g = ((c >>  8) & 0xff) * 0.65 | 0;
  const b = (c         & 0xff) * 0.65 | 0;
  return (r << 16) | (g << 8) | b;
};

export default class CarObstacle {
  constructor(scene, x, y, minBound, maxBound, isHorizontal = true, onHitPlayer, speed, damage) {
    this._scene       = scene;
    this._onHitPlayer = onHitPlayer;
    this._isH         = isHorizontal;
    this._lastHit     = 0;
    this._speed       = speed  ?? DEFAULT_SPEED;
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
    this._vx = this._isH ?  this._speed * dir : 0;
    this._vy = this._isH ? 0 : this._speed * dir;

    this._color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const roof  = darken(this._color);

    // ── Visuals (built once; repositioned each frame) ─────────────────────────
    this._body        = scene.add.rectangle(x, y, 1, 1, this._color).setDepth(3);
    this._roofPanel   = scene.add.rectangle(x, y, 1, 1, roof).setDepth(4);
    this._windshield  = scene.add.rectangle(x, y, 1, 1, 0xc8ddf0).setDepth(5);   // light blue-grey
    this._rearWindow  = scene.add.rectangle(x, y, 1, 1, 0x889aaa).setDepth(5);   // darker grey
    this._headL       = scene.add.rectangle(x, y, 1, 1, 0xffee66).setDepth(5);   // headlight
    this._headR       = scene.add.rectangle(x, y, 1, 1, 0xffee66).setDepth(5);
    this._tailL       = scene.add.rectangle(x, y, 1, 1, 0xff3322).setDepth(5);   // taillight
    this._tailR       = scene.add.rectangle(x, y, 1, 1, 0xff3322).setDepth(5);
    this._driver      = scene.add.rectangle(x, y, 1, 1, 0x1a1a2e).setDepth(5);   // driver silhouette
    // 4 wheels (corner circles)
    this._wheels = Array.from({ length: 4 }, () =>
      scene.add.circle(x, y, 4, 0x111111).setDepth(3)
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
      const bw = T * 2.8, bh = T * 1.6;

      this._body.setSize(bw, bh).setPosition(x, y);
      // Roof/cabin (centre of body)
      this._roofPanel.setSize(bw * 0.52, bh * 0.7).setPosition(x, y);
      // Windshield — front of travel direction
      this._windshield.setSize(T * 0.5, bh * 0.62).setPosition(x + s * T * 0.82, y);
      // Rear window — back
      this._rearWindow.setSize(T * 0.38, bh * 0.54).setPosition(x - s * T * 0.82, y);
      // Driver head behind windshield
      this._driver.setSize(T * 0.54, T * 0.54).setPosition(x + s * T * 0.32, y - T * 0.1);
      // Headlights at front bumper
      this._headL.setSize(T * 0.3, T * 0.28).setPosition(x + s * T * 1.32, y - T * 0.38);
      this._headR.setSize(T * 0.3, T * 0.28).setPosition(x + s * T * 1.32, y + T * 0.38);
      // Taillights at rear
      this._tailL.setSize(T * 0.28, T * 0.24).setPosition(x - s * T * 1.32, y - T * 0.36);
      this._tailR.setSize(T * 0.28, T * 0.24).setPosition(x - s * T * 1.32, y + T * 0.36);
      // 4 corner wheels
      const wx = T * 0.95, wy = bh * 0.42;
      this._wheels[0].setPosition(x + s * wx, y - wy);  // front-left
      this._wheels[1].setPosition(x + s * wx, y + wy);  // front-right
      this._wheels[2].setPosition(x - s * wx, y - wy);  // rear-left
      this._wheels[3].setPosition(x - s * wx, y + wy);  // rear-right
    } else {
      const s = dir === 'down' ? 1 : -1;
      const bw = T * 1.6, bh = T * 2.8;

      this._body.setSize(bw, bh).setPosition(x, y);
      this._roofPanel.setSize(bw * 0.7, bh * 0.52).setPosition(x, y);
      this._windshield.setSize(bw * 0.62, T * 0.5).setPosition(x, y + s * T * 0.82);
      this._rearWindow.setSize(bw * 0.54, T * 0.38).setPosition(x, y - s * T * 0.82);
      this._driver.setSize(T * 0.54, T * 0.54).setPosition(x - T * 0.1, y + s * T * 0.32);
      this._headL.setSize(T * 0.28, T * 0.3).setPosition(x - T * 0.38, y + s * T * 1.32);
      this._headR.setSize(T * 0.28, T * 0.3).setPosition(x + T * 0.38, y + s * T * 1.32);
      this._tailL.setSize(T * 0.24, T * 0.28).setPosition(x - T * 0.36, y - s * T * 1.32);
      this._tailR.setSize(T * 0.24, T * 0.28).setPosition(x + T * 0.36, y - s * T * 1.32);
      const wx = bw * 0.42, wy = T * 0.95;
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
    if (dx < T * 2 && dy < T * 1.5) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer(this._damage);
        this._scene.cameras.main.flash(100, 255, 140, 0);
      }
    }
  }

  destroy() {
    this._body.destroy();
    this._roofPanel.destroy();
    this._windshield.destroy();
    this._rearWindow.destroy();
    this._headL.destroy();
    this._headR.destroy();
    this._tailL.destroy();
    this._tailR.destroy();
    this._driver.destroy();
    this._wheels.forEach(w => w.destroy());
  }
}
