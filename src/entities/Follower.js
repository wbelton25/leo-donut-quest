import { TILE_SIZE } from '../constants.js';

// Follower: a party member who trails Leo using a position-history ring buffer.
// Leo's positions are recorded every RECORD_INTERVAL ms.
// Each follower reads from the buffer N steps behind Leo, giving a natural
// snake-like chain when multiple members are following.
//
// Usage:
//   const follower = new Follower(scene, buffer, slotIndex, color);
//   follower.destroy();  // cleans up visuals

const RECORD_INTERVAL = 50;  // ms between position records
const HISTORY_LENGTH  = 200; // enough steps for a full chain of 4 members

export class PositionBuffer {
  // Shared ring buffer that Leo's position is recorded into each interval.
  // One PositionBuffer is created per scene; all Followers share it.
  constructor(scene, target) {
    this._target  = target;
    this._history = [];
    this._timer   = scene.time.addEvent({
      delay: RECORD_INTERVAL,
      loop: true,
      callback: this._record,
      callbackScope: this,
    });
  }

  _record() {
    this._history.push({ x: this._target.x, y: this._target.y });
    if (this._history.length > HISTORY_LENGTH) this._history.shift();
  }

  // Return the position recorded `stepsBack` intervals ago (clamped to oldest).
  getPosition(stepsBack) {
    const idx = this._history.length - 1 - stepsBack;
    return this._history[Math.max(0, idx)] ?? { x: this._target.x, y: this._target.y };
  }

  destroy() {
    this._timer.remove();
  }
}

export default class Follower {
  // slotIndex: 0 = first follower (closest to Leo), 1 = second, etc.
  // Each slot offsets further back in the history buffer.
  constructor(scene, posBuffer, slotIndex, color, label) {
    this._buffer    = posBuffer;
    this._stepsBack = (slotIndex + 1) * 8;  // 8 history steps apart per slot

    const startPos = posBuffer.getPosition(this._stepsBack);

    // Visual: colored rectangle placeholder (same size as player)
    this._visual = scene.add.rectangle(
      startPos.x, startPos.y,
      TILE_SIZE * 2, TILE_SIZE * 2, color
    );

    // Direction indicator dot
    this._dot = scene.add.rectangle(startPos.x, startPos.y - 10, 6, 4, 0xffffff);

    // Name tag above head
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
    const pos = this._buffer.getPosition(this._stepsBack);
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
