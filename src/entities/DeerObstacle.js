import { TILE_SIZE } from '../constants.js';
import AudioManager from '../systems/AudioManager.js';

// DeerObstacle: wanders in 2D within a patrol rectangle, pausing unpredictably.
// Primary axis (E-W or N-S) comes from Tiled object bounds; perpendicular gets
// DRIFT_RANGE px of wandering on each side.
//
// Constructor (pixel coords):
//   scene, x, y      — center spawn position in pixels
//   minBound, maxBound — patrol range in pixels on the primary axis
//   isHorizontal     — true = primary axis is X, false = Y
//   onHitPlayer(damage) — callback when player is hit
//   speed            — optional override (default 40 px/s)

const DEFAULT_SPEED = 40;
const HIT_COOLDOWN  = 2000;
const DRIFT_RANGE   = TILE_SIZE * 2; // px of perpendicular wandering each side
const ARRIVE_DIST   = 6;             // px — close enough to count as arrived
const T = TILE_SIZE;
const SPRITE_KEY = 'sprite-deer';

export default class DeerObstacle {
  constructor(scene, x, y, minBound, maxBound, isHorizontal = true, onHitPlayer, speed) {
    this._scene       = scene;
    this._onHitPlayer = onHitPlayer;
    this._isH         = isHorizontal;
    this._lastHit     = 0;
    this._speed       = speed ?? DEFAULT_SPEED;
    this._x = x; this._y = y;
    this._vx = 0; this._vy = 0;
    this._targetX = x; this._targetY = y;
    this._lastDir = 'down';
    this._bolting = false;
    this._knockedDown = false;
    this._stateTimer = null;

    // 2D patrol area
    if (this._isH) {
      this._minX = minBound;        this._maxX = maxBound;
      this._minY = y - DRIFT_RANGE; this._maxY = y + DRIFT_RANGE;
    } else {
      this._minY = minBound;        this._maxY = maxBound;
      this._minX = x - DRIFT_RANGE; this._maxX = x + DRIFT_RANGE;
    }

    // Per-deer randomised timing — each deer has its own rhythm
    this._moveMin  = Phaser.Math.Between(800,  2500);
    this._moveMax  = Phaser.Math.Between(2500, 5500);
    this._standMin = Phaser.Math.Between(1000, 3000);
    this._standMax = Phaser.Math.Between(3500, 7000);

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

    // Stagger so nearby deer don't move in sync
    const initialWait = Phaser.Math.Between(200, this._standMax);
    this._stateTimer = scene.time.delayedCall(initialWait, this._beginMove, [], this);
  }

  _buildParts(scene, x, y) {
    return {
      body:  scene.add.rectangle(x, y, T * 1.5, T * 0.9, 0xb87a4a).setDepth(3),
      head:  scene.add.rectangle(x, y, T * 0.7, T * 0.65, 0xd4a060).setDepth(4),
      earL:  scene.add.rectangle(x, y, T * 0.2, T * 0.38, 0x8b5530).setDepth(4),
      earR:  scene.add.rectangle(x, y, T * 0.2, T * 0.38, 0x8b5530).setDepth(4),
      snout: scene.add.rectangle(x, y, T * 0.3, T * 0.22, 0x8b4c20).setDepth(4),
      tail:  scene.add.rectangle(x, y, T * 0.32, T * 0.32, 0xf0eae0).setDepth(4),
      legs:  Array.from({ length: 4 }, () =>
               scene.add.rectangle(x, y, T * 0.2, T * 0.48, 0x7a4a20).setDepth(3)),
    };
  }

  _getDir() {
    const ax = Math.abs(this._vx), ay = Math.abs(this._vy);
    if (ax === 0 && ay === 0) return this._lastDir;
    return ax >= ay ? (this._vx >= 0 ? 'right' : 'left')
                    : (this._vy >= 0 ? 'down'  : 'up');
  }

  _updateFrame() {
    if (!this._sprite) return;
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
      p.body.setSize(T * 1.5, T * 0.9).setPosition(x, y);
      p.head.setSize(T * 0.7, T * 0.62).setPosition(x + s * T * 1.0, y - T * 0.04);
      p.snout.setSize(T * 0.28, T * 0.2).setPosition(x + s * T * 1.38, y);
      p.earL.setSize(T * 0.2, T * 0.38).setPosition(x + s * T * 0.88, y - T * 0.46);
      p.earR.setSize(T * 0.2, T * 0.38).setPosition(x + s * T * 1.08, y - T * 0.46);
      p.tail.setSize(T * 0.32, T * 0.32).setPosition(x - s * T * 0.88, y - T * 0.08);
      const legXs = [s * T * 0.48, s * T * 0.2, -s * T * 0.2, -s * T * 0.46];
      p.legs.forEach((leg, i) => leg.setSize(T * 0.2, T * 0.48).setPosition(x + legXs[i], y + T * 0.62));
    } else {
      const s = dir === 'down' ? 1 : -1;
      p.body.setSize(T * 0.9, T * 1.5).setPosition(x, y);
      p.head.setSize(T * 0.62, T * 0.7).setPosition(x - T * 0.04, y + s * T * 1.0);
      p.snout.setSize(T * 0.2, T * 0.28).setPosition(x, y + s * T * 1.38);
      p.earL.setSize(T * 0.38, T * 0.2).setPosition(x - T * 0.46, y + s * T * 0.88);
      p.earR.setSize(T * 0.38, T * 0.2).setPosition(x - T * 0.46, y + s * T * 1.08);
      p.tail.setSize(T * 0.32, T * 0.32).setPosition(x - T * 0.08, y - s * T * 0.88);
      const legYs = [s * T * 0.48, s * T * 0.2, -s * T * 0.2, -s * T * 0.46];
      p.legs.forEach((leg, i) => leg.setSize(T * 0.48, T * 0.2).setPosition(x + T * 0.62, y + legYs[i]));
    }
  }

  _beginMove() {
    if (this._bolting) return;
    // Pick a random destination anywhere in the 2D patrol area
    const tx = Phaser.Math.Between(this._minX, this._maxX);
    const ty = Phaser.Math.Between(this._minY, this._maxY);
    const dx = tx - this._x, dy = ty - this._y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ARRIVE_DIST) { this._beginStand(); return; }
    this._targetX = tx; this._targetY = ty;
    this._vx = (dx / dist) * this._speed;
    this._vy = (dy / dist) * this._speed;
    const moveDur = Phaser.Math.Between(this._moveMin, this._moveMax);
    this._stateTimer = this._scene.time.delayedCall(moveDur, this._beginStand, [], this);
  }

  _beginStand() {
    if (this._bolting) return;
    this._vx = 0; this._vy = 0;
    const standDur = Phaser.Math.Between(this._standMin, this._standMax);
    this._stateTimer = this._scene.time.delayedCall(standDur, this._beginMove, [], this);
  }

  update(player) {
    if (this._knockedDown) return;
    const dt = 1 / 60;

    // Arrive at target early if close enough
    if (!this._bolting && (this._vx !== 0 || this._vy !== 0)) {
      const dx = this._targetX - this._x, dy = this._targetY - this._y;
      if (Math.abs(dx) < ARRIVE_DIST && Math.abs(dy) < ARRIVE_DIST) {
        if (this._stateTimer) { this._stateTimer.remove(false); this._stateTimer = null; }
        this._beginStand();
        return;
      }
    }

    this._x += this._vx * dt;
    this._y += this._vy * dt;
    this._x = Phaser.Math.Clamp(this._x, this._minX, this._maxX);
    this._y = Phaser.Math.Clamp(this._y, this._minY, this._maxY);

    if (this._sprite) this._updateFrame();
    else              this._updateParts();

    const dx = Math.abs(player.x - this._x);
    const dy = Math.abs(player.y - this._y);
    if (dx < T * 1.5 && dy < T) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer(10);
        AudioManager.playDeerGrunt(this._scene);
        this._bolting = true;
        if (this._stateTimer) { this._stateTimer.remove(false); this._stateTimer = null; }
        // Bolt directly away from player in 2D
        const bx = this._x - player.x, by = this._y - player.y;
        const bd = Math.sqrt(bx * bx + by * by) || 1;
        this._vx = (bx / bd) * this._speed * 2.5;
        this._vy = (by / bd) * this._speed * 2.5;
        this._scene.time.delayedCall(1200, () => {
          this._bolting = false;
          this._beginStand();
        });
      }
    }
  }

  knockdown() {
    if (this._knockedDown || this._bolting) return;
    this._knockedDown = true;
    AudioManager.playDeerGrunt(this._scene);

    // Stop current movement
    this._vx = 0; this._vy = 0;
    if (this._stateTimer) { this._stateTimer.remove(false); this._stateTimer = null; }

    if (this._sprite) {
      // Tween to 90° (fall over sideways)
      this._scene.tweens.add({
        targets: this._sprite,
        angle: 90,
        duration: 200,
        ease: 'Power2',
        onComplete: () => {
          this._scene.time.delayedCall(1800, () => {
            if (!this._sprite) return; // destroyed during delay
            this._scene.tweens.add({
              targets: this._sprite,
              angle: 0,
              duration: 300,
              ease: 'Back.Out',
              onComplete: () => {
                this._knockedDown = false;
                this._beginStand();
              }
            });
          });
        }
      });
    } else {
      // Parts fallback: squash body flat and fade legs to simulate collapse
      const p = this._parts;
      this._scene.tweens.add({
        targets: [p.body, p.head, p.snout, p.earL, p.earR, p.tail, ...p.legs],
        scaleY: 0.25,
        duration: 180,
        ease: 'Power2',
        onComplete: () => {
          this._scene.time.delayedCall(1800, () => {
            this._scene.tweens.add({
              targets: [p.body, p.head, p.snout, p.earL, p.earR, p.tail, ...p.legs],
              scaleY: 1,
              duration: 250,
              ease: 'Back.Out',
              onComplete: () => {
                this._knockedDown = false;
                this._beginStand();
              }
            });
          });
        }
      });
    }
  }

  setDepth(d) {
    if (this._sprite) this._sprite.setDepth(d);
    else {
      const p = this._parts;
      p.body.setDepth(d); p.head.setDepth(d + 1); p.snout.setDepth(d + 1);
      p.earL.setDepth(d + 1); p.earR.setDepth(d + 1); p.tail.setDepth(d + 1);
      p.legs.forEach(l => l.setDepth(d));
    }
    return this;
  }

  destroy() {
    if (this._stateTimer) this._stateTimer.remove(false);
    if (this._sprite) { this._sprite.destroy(); return; }
    const p = this._parts;
    p.body.destroy(); p.head.destroy(); p.snout.destroy();
    p.earL.destroy(); p.earR.destroy(); p.tail.destroy();
    p.legs.forEach(l => l.destroy());
  }
}
