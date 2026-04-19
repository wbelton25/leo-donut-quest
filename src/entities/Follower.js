import { TILE_SIZE, PIXEL_FONT, TEXT_RES } from '../constants.js';
import { registerCharacterAnims } from '../utils/AnimationRegistry.js';

// Follower: trails Leo using a per-frame position history ring buffer.
// Recording every frame (not on a timer) means the follower always has a
// fresh position to read — no discrete 50ms jumps, perfectly smooth.
//
// Each slot reads further back in the buffer, creating a natural chain.
//
// Renders as a sprite when the atlas for spriteKey is loaded; falls back to
// a colored rectangle + direction dot when the PNG hasn't been drawn yet.

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
  // spriteKey: optional atlas key (e.g. 'sprite-warren'). If the texture is not
  // loaded yet, the follower renders as a colored rectangle (color param).
  constructor(scene, posBuffer, slotIndex, color, label, spriteKey, displaySize = TILE_SIZE * 3) {
    this._buffer     = posBuffer;
    this._framesBack = (slotIndex + 1) * FRAMES_PER_SLOT;

    const startPos   = posBuffer.getPosition(this._framesBack);
    const hasSprite  = spriteKey && scene.textures.exists(spriteKey);

    if (hasSprite) {
      registerCharacterAnims(scene.anims, spriteKey);
      this._visual    = scene.add.sprite(startPos.x, startPos.y, spriteKey, 'down-0');
      this._visual.setDisplaySize(displaySize, displaySize);
      this._spriteKey = spriteKey;
      this._dot       = null;
    } else {
      this._visual    = scene.add.rectangle(startPos.x, startPos.y, TILE_SIZE * 2, TILE_SIZE * 2, color);
      this._dot       = scene.add.rectangle(startPos.x, startPos.y - 10, 6, 4, 0xffffff);
      this._spriteKey = null;
    }

    if (label) {
      this._label = scene.add.text(startPos.x, startPos.y - 22, label, {
        fontFamily: PIXEL_FONT,
        fontSize: '6px',
        color: '#ffffff',
        resolution: TEXT_RES,
      }).setOrigin(0.5);
    }

    this._lastPos = null;
    this._lastDir = 'down';
  }

  update() {
    const pos = this._buffer.getPosition(this._framesBack);
    this._visual.setPosition(pos.x, pos.y);

    if (this._spriteKey) {
      // Derive facing direction from movement delta
      const dx      = pos.x - (this._lastPos?.x ?? pos.x);
      const dy      = pos.y - (this._lastPos?.y ?? pos.y);
      const moving  = Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3;

      if (moving) {
        if (Math.abs(dx) >= Math.abs(dy)) this._lastDir = dx > 0 ? 'right' : 'left';
        else this._lastDir = dy > 0 ? 'down' : 'up';
        const animKey = `${this._spriteKey}-walk-${this._lastDir}`;
        if (this._visual.anims?.currentAnim?.key !== animKey) this._visual.play(animKey);
      } else {
        const idleKey = `${this._spriteKey}-idle-${this._lastDir}`;
        if (this._visual.anims?.currentAnim?.key !== idleKey) this._visual.play(idleKey);
      }
      this._lastPos = { x: pos.x, y: pos.y };
    } else {
      this._dot.setPosition(pos.x, pos.y - 10);
    }

    if (this._label) this._label.setPosition(pos.x, pos.y - 22);
  }

  destroy() {
    this._visual.destroy();
    if (this._dot)   this._dot.destroy();
    if (this._label) this._label.destroy();
  }
}
