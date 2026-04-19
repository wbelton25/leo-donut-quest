import { TILE_SIZE } from '../constants.js';

// DeerObstacle: a deer that wanders back and forth along a road segment.
// Multi-part sprite: body, head (direction-aware), ears, 4 legs, tail, eye.
//
// Constructor (pixel coords):
//   scene, x, y      — center spawn position in pixels
//   minBound, maxBound — patrol range in pixels on the patrol axis
//   isHorizontal     — true = patrol X axis (E-W), false = patrol Y axis (N-S)
//   onHitPlayer(damage) — callback when player is hit
//   speed            — optional override (default 40 px/s)

const DEFAULT_SPEED = 40;
const HIT_COOLDOWN  = 2000;
const T = TILE_SIZE;

export default class DeerObstacle {
  constructor(scene, x, y, minBound, maxBound, isHorizontal = true, onHitPlayer, speed) {
    this._scene       = scene;
    this._onHitPlayer = onHitPlayer;
    this._isH         = isHorizontal;
    this._lastHit     = 0;
    this._speed       = speed ?? DEFAULT_SPEED;
    this._x = x;
    this._y = y;
    this._lastDir = null;

    if (this._isH) {
      this._minX = minBound; this._maxX = maxBound;
      this._minY = this._maxY = y;
    } else {
      this._minY = minBound; this._maxY = maxBound;
      this._minX = this._maxX = x;
    }

    const dir = Math.random() < 0.5 ? 1 : -1;
    this._vx = this._isH ? this._speed * dir : 0;
    this._vy = this._isH ? 0 : this._speed * dir;

    // ── Visuals ───────────────────────────────────────────────────────────────
    // Body (main torso)
    this._body  = scene.add.rectangle(x, y, T * 1.5, T * 0.9, 0xb87a4a).setDepth(3);
    // Head
    this._head  = scene.add.rectangle(x, y, T * 0.7, T * 0.65, 0xd4a060).setDepth(4);
    // Ears (pair, on head)
    this._earL  = scene.add.rectangle(x, y, T * 0.2, T * 0.38, 0x8b5530).setDepth(4);
    this._earR  = scene.add.rectangle(x, y, T * 0.2, T * 0.38, 0x8b5530).setDepth(4);
    // Eye (tiny dot)
    this._eye   = scene.add.rectangle(x, y, T * 0.18, T * 0.18, 0x1a0800).setDepth(5);
    // Nose
    this._snout = scene.add.rectangle(x, y, T * 0.3, T * 0.22, 0x8b4c20).setDepth(4);
    // Tail (fluffy white)
    this._tail  = scene.add.rectangle(x, y, T * 0.32, T * 0.32, 0xf0eae0).setDepth(4);
    // 4 legs (small dark rectangles hanging below body)
    this._legs  = Array.from({ length: 4 }, () =>
      scene.add.rectangle(x, y, T * 0.2, T * 0.48, 0x7a4a20).setDepth(3)
    );

    this._updateLayout();

    scene.time.addEvent({
      delay: Phaser.Math.Between(3000, 7000),
      loop: true,
      callback: this._graze,
      callbackScope: this,
    });
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
      // Body: horizontal
      this._body.setSize(T * 1.5, T * 0.9).setPosition(x, y);
      // Head: in front of body
      this._head.setSize(T * 0.7, T * 0.62).setPosition(x + s * T * 1.0, y - T * 0.04);
      // Snout: tip of head
      this._snout.setSize(T * 0.28, T * 0.2).setPosition(x + s * T * 1.38, y);
      // Ears: on top of head
      this._earL.setSize(T * 0.2, T * 0.38).setPosition(x + s * T * 0.88, y - T * 0.46);
      this._earR.setSize(T * 0.2, T * 0.38).setPosition(x + s * T * 1.08, y - T * 0.46);
      // Eye: front of head
      this._eye.setSize(T * 0.18, T * 0.18).setPosition(x + s * T * 1.18, y - T * 0.12);
      // Tail: back of body
      this._tail.setSize(T * 0.32, T * 0.32).setPosition(x - s * T * 0.88, y - T * 0.08);
      // 4 legs below body
      const legY = y + T * 0.62;
      const legXs = [s * T * 0.48, s * T * 0.2, -s * T * 0.2, -s * T * 0.46];
      this._legs.forEach((leg, i) => {
        leg.setSize(T * 0.2, T * 0.48).setPosition(x + legXs[i], legY);
      });
    } else {
      const s = dir === 'down' ? 1 : -1;
      // Body: vertical
      this._body.setSize(T * 0.9, T * 1.5).setPosition(x, y);
      // Head: in front of body
      this._head.setSize(T * 0.62, T * 0.7).setPosition(x - T * 0.04, y + s * T * 1.0);
      // Snout
      this._snout.setSize(T * 0.2, T * 0.28).setPosition(x, y + s * T * 1.38);
      // Ears: sides of head
      this._earL.setSize(T * 0.38, T * 0.2).setPosition(x - T * 0.46, y + s * T * 0.88);
      this._earR.setSize(T * 0.38, T * 0.2).setPosition(x - T * 0.46, y + s * T * 1.08);
      // Eye
      this._eye.setSize(T * 0.18, T * 0.18).setPosition(x - T * 0.12, y + s * T * 1.18);
      // Tail
      this._tail.setSize(T * 0.32, T * 0.32).setPosition(x - T * 0.08, y - s * T * 0.88);
      // 4 legs: to the side of body
      const legX = x + T * 0.62;
      const legYs = [s * T * 0.48, s * T * 0.2, -s * T * 0.2, -s * T * 0.46];
      this._legs.forEach((leg, i) => {
        leg.setSize(T * 0.48, T * 0.2).setPosition(legX, y + legYs[i]);
      });
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

    const dir = this._getDir();
    if (dir !== this._lastDir) { this._lastDir = dir; }
    this._updateLayout();

    const dx = Math.abs(player.x - this._x);
    const dy = Math.abs(player.y - this._y);
    if (dx < T * 1.5 && dy < T) {
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
    this._head.destroy();
    this._earL.destroy();
    this._earR.destroy();
    this._eye.destroy();
    this._snout.destroy();
    this._tail.destroy();
    this._legs.forEach(l => l.destroy());
  }
}
