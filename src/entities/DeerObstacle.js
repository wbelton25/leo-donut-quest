import { TILE_SIZE } from '../constants.js';

// DeerObstacle: a deer that wanders back and forth along a road segment.
// Colliding with a deer drains bike condition and sends the deer skittering.

const DEER_SPEED   = 40;
const HIT_COOLDOWN = 2000; // ms between damage ticks so one collision isn't fatal

export default class DeerObstacle {
  constructor(scene, col, row, patrolCols, onHitPlayer) {
    this._scene       = scene;
    this._onHitPlayer = onHitPlayer;
    this._lastHit     = 0;

    // World-pixel position
    this._x = col * TILE_SIZE + TILE_SIZE / 2;
    this._y = row * TILE_SIZE + TILE_SIZE / 2;

    // Patrol bounds in world-pixels
    this._minX = patrolCols[0] * TILE_SIZE;
    this._maxX = patrolCols[1] * TILE_SIZE;

    this._vx = DEER_SPEED * (Math.random() < 0.5 ? 1 : -1);

    // Body (brown rectangle — Phase 7 will swap in sprite)
    this._body = scene.add.rectangle(this._x, this._y, TILE_SIZE * 1.5, TILE_SIZE, 0x8b5e3c);
    // Ear nubs
    this._earL = scene.add.rectangle(this._x - 4, this._y - 6, 3, 5, 0x6b3a1f);
    this._earR = scene.add.rectangle(this._x + 4, this._y - 6, 3, 5, 0x6b3a1f);

    // Occasionally pause to graze
    scene.time.addEvent({
      delay: Phaser.Math.Between(3000, 7000),
      loop: true,
      callback: this._graze,
      callbackScope: this,
    });
  }

  update(player) {
    // Move
    this._x += this._vx * (1 / 60);  // approximate dt
    if (this._x <= this._minX || this._x >= this._maxX) {
      this._vx *= -1;
      this._x = Phaser.Math.Clamp(this._x, this._minX, this._maxX);
    }

    // Sync visuals
    this._body.setPosition(this._x, this._y);
    this._earL.setPosition(this._x - 4, this._y - 6);
    this._earR.setPosition(this._x + 4, this._y - 6);

    // Flip ears on direction
    this._body.setFillStyle(this._vx > 0 ? 0x8b5e3c : 0x7a5230);

    // Collision check with player (simple AABB)
    const dx = Math.abs(player.x - this._x);
    const dy = Math.abs(player.y - this._y);
    if (dx < TILE_SIZE * 1.5 && dy < TILE_SIZE) {
      const now = Date.now();
      if (now - this._lastHit > HIT_COOLDOWN) {
        this._lastHit = now;
        this._onHitPlayer();
        // Deer bolts in opposite direction
        this._vx = (player.x < this._x ? 1 : -1) * DEER_SPEED * 2.5;
        this._scene.time.delayedCall(800, () => { this._vx = DEER_SPEED * (this._vx > 0 ? 1 : -1); });
      }
    }
  }

  _graze() {
    const wasMoving = this._vx !== 0;
    this._vx = 0;
    this._scene.time.delayedCall(Phaser.Math.Between(800, 2000), () => {
      this._vx = DEER_SPEED * (Math.random() < 0.5 ? 1 : -1);
    });
  }

  destroy() {
    this._body.destroy();
    this._earL.destroy();
    this._earR.destroy();
  }
}
