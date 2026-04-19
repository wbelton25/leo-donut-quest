import { TILE_SIZE } from '../constants.js';

// CarObstacle: a car driving along a road at speed.
// Uses a randomly-chosen color sprite atlas when loaded; falls back to primitives.
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

const SPRITE_KEYS  = ['sprite-car-red', 'sprite-car-blue', 'sprite-car-silver', 'sprite-car-green'];
const FALLBACK_COLS = [0xcc2222, 0x2244cc, 0xaaaaaa, 0x228833];

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

    const variant = Math.floor(Math.random() * SPRITE_KEYS.length);
    const key     = SPRITE_KEYS[variant];
    const hasSprite = scene.textures.exists(key);

    if (hasSprite) {
      this._sprite = scene.add.sprite(x, y, key, 'right-0')
        .setDisplaySize(T * 3, T * 3)
        .setDepth(3);
      this._parts = null;
    } else {
      this._sprite = null;
      this._parts  = this._buildParts(scene, x, y, FALLBACK_COLS[variant]);
    }
  }

  _buildParts(scene, x, y, color) {
    const roof = darken(color);
    const bw = this._isH ? T * 2.5 : T * 1.5;
    const bh = this._isH ? T * 1.5 : T * 2.5;
    return {
      body:       scene.add.rectangle(x, y, bw, bh, color).setDepth(3),
      roofPanel:  scene.add.rectangle(x, y, bw * 0.6, bh * 0.55, roof).setDepth(4),
      windshield: scene.add.rectangle(x, y, T * 0.5, bh * 0.62, 0xc8ddf0).setDepth(5),
      rearWindow: scene.add.rectangle(x, y, T * 0.38, bh * 0.54, 0x889aaa).setDepth(5),
      headL:      scene.add.rectangle(x, y, T * 0.3, T * 0.28, 0xffee66).setDepth(5),
      headR:      scene.add.rectangle(x, y, T * 0.3, T * 0.28, 0xffee66).setDepth(5),
      tailL:      scene.add.rectangle(x, y, T * 0.28, T * 0.24, 0xff3322).setDepth(5),
      tailR:      scene.add.rectangle(x, y, T * 0.28, T * 0.24, 0xff3322).setDepth(5),
      driver:     scene.add.rectangle(x, y, T * 0.54, T * 0.54, 0x1a1a2e).setDepth(5),
      wheels:     Array.from({ length: 4 }, () =>
                    scene.add.circle(x, y, 4, 0x111111).setDepth(3)),
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
    const q = this._parts;
    const dir = this._getDir();
    if (dir === 'right' || dir === 'left') {
      const s = dir === 'right' ? 1 : -1;
      const bw = q.body.width, bh = q.body.height;
      q.body.setPosition(x, y);
      q.roofPanel.setPosition(x, y);
      q.windshield.setPosition(x + s * T * 0.82, y);
      q.rearWindow.setPosition(x - s * T * 0.82, y);
      q.driver.setPosition(x + s * T * 0.32, y - T * 0.1);
      q.headL.setPosition(x + s * T * 1.32, y - T * 0.38);
      q.headR.setPosition(x + s * T * 1.32, y + T * 0.38);
      q.tailL.setPosition(x - s * T * 1.32, y - T * 0.36);
      q.tailR.setPosition(x - s * T * 1.32, y + T * 0.36);
      const wx = T * 0.95, wy = bh * 0.42;
      q.wheels[0].setPosition(x + s * wx, y - wy);
      q.wheels[1].setPosition(x + s * wx, y + wy);
      q.wheels[2].setPosition(x - s * wx, y - wy);
      q.wheels[3].setPosition(x - s * wx, y + wy);
    } else {
      const s = dir === 'down' ? 1 : -1;
      const bw = q.body.width, bh = q.body.height;
      q.body.setPosition(x, y);
      q.roofPanel.setPosition(x, y);
      q.windshield.setPosition(x, y + s * T * 0.82);
      q.rearWindow.setPosition(x, y - s * T * 0.82);
      q.driver.setPosition(x - T * 0.1, y + s * T * 0.32);
      q.headL.setPosition(x - T * 0.38, y + s * T * 1.32);
      q.headR.setPosition(x + T * 0.38, y + s * T * 1.32);
      q.tailL.setPosition(x - T * 0.36, y - s * T * 1.32);
      q.tailR.setPosition(x + T * 0.36, y - s * T * 1.32);
      const wx = bw * 0.42, wy = T * 0.95;
      q.wheels[0].setPosition(x - wx, y + s * wy);
      q.wheels[1].setPosition(x + wx, y + s * wy);
      q.wheels[2].setPosition(x - wx, y - s * wy);
      q.wheels[3].setPosition(x + wx, y - s * wy);
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
    if (dx < T * 2 && dy < T * 1.5) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer(this._damage);
        this._scene.cameras.main.flash(100, 255, 140, 0);
      }
    }
  }

  setDepth(d) {
    if (this._sprite) { this._sprite.setDepth(d); return this; }
    const q = this._parts;
    q.body.setDepth(d); q.roofPanel.setDepth(d + 1);
    q.windshield.setDepth(d + 2); q.rearWindow.setDepth(d + 2);
    q.headL.setDepth(d + 2); q.headR.setDepth(d + 2);
    q.tailL.setDepth(d + 2); q.tailR.setDepth(d + 2);
    q.driver.setDepth(d + 2);
    q.wheels.forEach(w => w.setDepth(d));
    return this;
  }

  destroy() {
    if (this._sprite) { this._sprite.destroy(); return; }
    const q = this._parts;
    q.body.destroy(); q.roofPanel.destroy(); q.windshield.destroy();
    q.rearWindow.destroy(); q.headL.destroy(); q.headR.destroy();
    q.tailL.destroy(); q.tailR.destroy(); q.driver.destroy();
    q.wheels.forEach(w => w.destroy());
  }
}
