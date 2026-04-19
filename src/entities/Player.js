import { PLAYER_SPEED, TILE_SIZE, SPRITE_LEO } from '../constants.js';
import { registerCharacterAnims, velocityToDir } from '../utils/AnimationRegistry.js';

// Player: Leo on his bike.
// Renders as a sprite when sprite-leo atlas is loaded; falls back to a blue
// rectangle + direction indicator when the PNG hasn't been drawn yet.
export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    // Use the real atlas key if loaded, otherwise a placeholder key.
    // Either way the physics body lives on `this` (the Sprite), not on _visual.
    const hasSprite = scene.textures.exists(SPRITE_LEO);
    super(scene, x, y, hasSprite ? SPRITE_LEO : '__placeholder__');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // ── Physics body ─────────────────────────────────────────────────────────
    this.body.setSize(12, 12);
    this.setCollideWorldBounds(false);

    // ── Visuals ───────────────────────────────────────────────────────────────
    if (hasSprite) {
      // Sprite path: register animations, show the atlas frame
      registerCharacterAnims(scene.anims, SPRITE_LEO);
      this.setFrame('down-0');
      this.setDisplaySize(TILE_SIZE * 3, TILE_SIZE * 3); // 48px — bike needs 3 tiles
      this._useSprite = true;
      this._visual = null;
      this._dirIndicator = null;
    } else {
      // Rectangle fallback: invisible Sprite body + visible blue rectangle
      this.setAlpha(0);
      this._useSprite = false;
      this._visual = scene.add.rectangle(x, y, TILE_SIZE * 2, TILE_SIZE * 2, 0x3b82f6);
      this._dirIndicator = scene.add.rectangle(x, y - 8, 6, 4, 0xffffff);
    }

    // ── Input ─────────────────────────────────────────────────────────────────
    this._cursors = scene.input.keyboard.createCursorKeys();
    this._wasd = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this._scene = scene;
    this._facing = 'down';

    // Set externally by NeighborhoodScene based on bikeCondition (0.3–1.0)
    this.speedMultiplier = 1.0;
  }

  update() {
    const cursors = this._cursors;
    const wasd    = this._wasd;

    const left  = cursors.left.isDown  || wasd.left.isDown;
    const right = cursors.right.isDown || wasd.right.isDown;
    const up    = cursors.up.isDown    || wasd.up.isDown;
    const down  = cursors.down.isDown  || wasd.down.isDown;

    let vx = 0;
    let vy = 0;
    if (left)  vx = -PLAYER_SPEED * this.speedMultiplier;
    if (right) vx =  PLAYER_SPEED * this.speedMultiplier;
    if (up)    vy = -PLAYER_SPEED * this.speedMultiplier;
    if (down)  vy =  PLAYER_SPEED * this.speedMultiplier;

    // Normalize diagonal so Leo doesn't go faster at 45°
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    this.setVelocity(vx, vy);

    // Update facing direction
    this._facing = velocityToDir(vx, vy, this._facing);

    if (this._useSprite) {
      // Drive the walk/idle animation
      const moving = vx !== 0 || vy !== 0;
      const animKey = moving
        ? `${SPRITE_LEO}-walk-${this._facing}`
        : `${SPRITE_LEO}-idle-${this._facing}`;
      if (this.anims.currentAnim?.key !== animKey) this.play(animKey);
    } else {
      // Keep rectangle placeholder in sync with physics body
      this._visual.setPosition(this.x, this.y);
      this._updateDirectionIndicator();
    }
  }

  _updateDirectionIndicator() {
    const offsets = { up: { x: 0, y: -10 }, down: { x: 0, y: 10 }, left: { x: -10, y: 0 }, right: { x: 10, y: 0 } };
    const off = offsets[this._facing];
    this._dirIndicator.setPosition(this.x + off.x, this.y + off.y);
  }

  get facing() { return this._facing; }
}
