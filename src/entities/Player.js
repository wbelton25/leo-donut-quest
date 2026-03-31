import { PLAYER_SPEED, TILE_SIZE } from '../constants.js';

// Player: Leo on his bike.
// Phase 1: rectangle placeholder, 8-directional movement, arcade physics body.
// Phase 7: replace placeholder with real animated spritesheet.
export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    // In Phase 7: super(scene, x, y, SPRITE_LEO);
    // For now we call super with a placeholder key that doesn't exist,
    // then draw a colored rectangle on top of the invisible sprite.
    super(scene, x, y, '__placeholder__');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // ── Visual placeholder ────────────────────────────────────────────────────
    // A blue rectangle representing Leo (32x32 like the final sprite will be)
    this._visual = scene.add.rectangle(x, y, TILE_SIZE * 2, TILE_SIZE * 2, 0x3b82f6);

    // Direction indicator so we can see which way Leo is facing
    this._dirIndicator = scene.add.rectangle(x, y - 8, 6, 4, 0xffffff);

    // ── Physics body ─────────────────────────────────────────────────────────
    // Slightly smaller than visual so it doesn't catch on corners
    this.body.setSize(12, 12);
    this.setCollideWorldBounds(false); // world bounds handled by wall tiles

    // ── Input ─────────────────────────────────────────────────────────────────
    this._cursors = scene.input.keyboard.createCursorKeys();
    this._wasd = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // Store reference to scene for use in update
    this._scene = scene;

    // Direction: 'up' | 'down' | 'left' | 'right'
    this._facing = 'down';
  }

  update() {
    const cursors = this._cursors;
    const wasd = this._wasd;

    const left = cursors.left.isDown || wasd.left.isDown;
    const right = cursors.right.isDown || wasd.right.isDown;
    const up = cursors.up.isDown || wasd.up.isDown;
    const down = cursors.down.isDown || wasd.down.isDown;

    // Velocity
    let vx = 0;
    let vy = 0;
    if (left) vx = -PLAYER_SPEED;
    if (right) vx = PLAYER_SPEED;
    if (up) vy = -PLAYER_SPEED;
    if (down) vy = PLAYER_SPEED;

    // Normalize diagonal movement so you don't go faster diagonally
    if (vx !== 0 && vy !== 0) {
      vx *= 0.707;
      vy *= 0.707;
    }

    this.setVelocity(vx, vy);

    // Track facing direction for animations (Phase 7)
    if (left) this._facing = 'left';
    else if (right) this._facing = 'right';
    else if (up) this._facing = 'up';
    else if (down) this._facing = 'down';

    // Keep the placeholder visuals in sync with the physics body
    this._visual.setPosition(this.x, this.y);
    this._updateDirectionIndicator();
  }

  _updateDirectionIndicator() {
    // Move the white dot to show which way Leo is facing
    const offsets = {
      up: { x: 0, y: -10 },
      down: { x: 0, y: 10 },
      left: { x: -10, y: 0 },
      right: { x: 10, y: 0 },
    };
    const off = offsets[this._facing];
    this._dirIndicator.setPosition(this.x + off.x, this.y + off.y);
  }

  get facing() {
    return this._facing;
  }
}
