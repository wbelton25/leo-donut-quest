import { TILE_SIZE } from '../constants.js';

// Follower: trails Leo using a per-frame position history ring buffer.
// Recording every frame (not on a timer) means the follower always has a
// fresh position to read — no discrete 50ms jumps, perfectly smooth.
//
// Each slot reads further back in the buffer, creating a natural chain.

const HISTORY_LENGTH = 600; // frames of history (~10s at 60fps — plenty for 4 members)
const FRAMES_PER_SLOT = 18; // frames between each follower in the chain

export class PositionBuffer {
  constructor(target) {
    this._target  = target;
    this._history = [];
  }

  // Call once per frame from the scene's update().
  record() {
    this._history.push({ x: this._target.x, y: this._target.y });
    if (this._history.length > HISTORY_LENGTH) this._history.shift();
  }

  // Return the position framesBack frames ago (clamped to oldest entry).
  getPosition(framesBack) {
    const idx = this._history.length - 1 - framesBack;
    return this._history[Math.max(0, idx)] ?? { x: this._target.x, y: this._target.y };
  }

  destroy() {
    // Nothing to clean up — no timer
  }
}

export default class Follower {
  constructor(scene, posBuffer, slotIndex, color, label) {
    this._buffer     = posBuffer;
    this._framesBack = (slotIndex + 1) * FRAMES_PER_SLOT;

    const startPos = posBuffer.getPosition(this._framesBack);

    this._visual = scene.add.rectangle(
      startPos.x, startPos.y,
      TILE_SIZE * 2, TILE_SIZE * 2, color
    );

    this._dot = scene.add.rectangle(startPos.x, startPos.y - 10, 6, 4, 0xffffff);

    if (label) {
      this._label = scene.add.text(startPos.x, startPos.y - 22, label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '6px',
        color: '#ffffff',
        resolution: 4,
      }).setOrigin(0.5);
    }
  }

  update() {
    const pos = this._buffer.getPosition(this._framesBack);
    this._visual.setPosition(pos.x, pos.y);
    this._dot.setPosition(pos.x, pos.y - 10);
    if (this._label) this._label.setPosition(pos.x, pos.y - 22);
  }

  destroy() {
    this._visual.destroy();
    this._dot.destroy();
    if (this._label) this._label.destroy();
  }
}
