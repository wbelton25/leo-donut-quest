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
    this._spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this._scene = scene;
    this._facing = 'down';

    // Set externally by NeighborhoodScene based on bikeCondition (0.3–1.0)
    this.speedMultiplier = 1.0;

    // Set to true by NeighborhoodScene when a prompt/dialogue is active
    this.jumpBlocked = false;

    // ── Jump state ────────────────────────────────────────────────────────────
    this._isJumping       = false;
    this._jumpElapsed     = 0;
    this._jumpDuration    = 420;  // ms
    this._jumpHeight      = 0;   // current visual lift in px (positive = up)
    this._jumpCooldownEnd = 0;

    this._padFartJustPressed = false;

    // Store base body offsets so we can restore them when grounded
    this._baseOffsetX = this.body.offset.x;
    this._baseOffsetY = this.body.offset.y;

    // Shadow ellipse drawn below Leo on the ground
    this._shadow = scene.add.ellipse(x, y, 22, 7, 0x000000, 0.28).setDepth(1);
  }

  update() {
    const cursors = this._cursors;
    const wasd    = this._wasd;

    // ── Gamepad support — read raw browser API to avoid Phaser abstraction issues ──
    const rawPads = navigator.getGamepads?.() ?? [];
    const gp = rawPads[0] ?? null;
    const DEAD = 0.25;

    let padVx = 0, padVy = 0;
    if (gp) {
      // Analog stick (axes 0/1 — works on all controllers)
      const lx = gp.axes[0] ?? 0, ly = gp.axes[1] ?? 0;
      if (Math.abs(lx) > DEAD) padVx = lx;
      if (Math.abs(ly) > DEAD) padVy = ly;

      // D-pad: standard = buttons 12–15; Nintendo hat-switch = axes 6/7
      const hatX = gp.axes[6] ?? 0, hatY = gp.axes[7] ?? 0;
      if ((gp.buttons[12]?.pressed) || hatY < -0.5) padVy = -1;
      if ((gp.buttons[13]?.pressed) || hatY >  0.5) padVy =  1;
      if ((gp.buttons[14]?.pressed) || hatX < -0.5) padVx = -1;
      if ((gp.buttons[15]?.pressed) || hatX >  0.5) padVx =  1;

      // Diagnostic: log any button press with its index so we can map Jump/Fart
      if (!this._dbgBtn) this._dbgBtn = {};
      gp.buttons.forEach((btn, i) => {
        if (btn.pressed && !this._dbgBtn[i]) {
          console.log(`[Gamepad] btn[${i}] pressed | axes: [${Array.from(gp.axes).map(a=>a.toFixed(2)).join(', ')}] | id: "${gp.id}"`);
        }
        this._dbgBtn[i] = btn.pressed;
      });
    }

    // Jump = btn 0 (Xbox A / PS Cross). Fart = btn 1 (Xbox B / PS Circle).
    // Update these indices based on the diagnostic log output for your controller.
    const gpJumpJustDown = gp ? (gp.buttons[0]?.pressed && !this._gpPrevJump) : false;
    this._padFartJustPressed = gp ? (gp.buttons[1]?.pressed && !this._gpPrevFart) : false;
    if (gp) { this._gpPrevJump = gp.buttons[0]?.pressed; this._gpPrevFart = gp.buttons[1]?.pressed; }

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

    // Analog pad overrides keyboard when stick/dpad is active
    if (padVx !== 0 || padVy !== 0) {
      vx = padVx * PLAYER_SPEED * this.speedMultiplier;
      vy = padVy * PLAYER_SPEED * this.speedMultiplier;
    }

    // Normalize diagonal so Leo doesn't go faster at 45°
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    this.setVelocity(vx, vy);

    // ── Jump ──────────────────────────────────────────────────────────────────
    const now = Date.now();
    if ((Phaser.Input.Keyboard.JustDown(this._spaceKey) || gpJumpJustDown) &&
        !this._isJumping && !this.jumpBlocked && now >= this._jumpCooldownEnd) {
      this._isJumping    = true;
      this._jumpElapsed  = 0;
      this._jumpCooldownEnd = now + 700;
    }

    if (this._isJumping) {
      this._jumpElapsed += this.scene.game.loop.delta;
      const t = Math.min(this._jumpElapsed / this._jumpDuration, 1);
      this._jumpHeight = Math.round(15 * 4 * t * (1 - t)); // parabola 0→15→0
      if (t >= 1) { this._isJumping = false; this._jumpHeight = 0; }
    }

    // Shift sprite up via body offset — body stays on the ground, sprite lifts
    this.body.setOffset(this._baseOffsetX, this._baseOffsetY + this._jumpHeight);

    // Shadow stays at ground level
    this._shadow.setPosition(this.x, this.y + this._jumpHeight + 8);

    // ── Facing + animation ────────────────────────────────────────────────────
    this._facing = velocityToDir(vx, vy, this._facing);

    if (this._useSprite) {
      const moving = vx !== 0 || vy !== 0;
      const animKey = moving
        ? `${SPRITE_LEO}-walk-${this._facing}`
        : `${SPRITE_LEO}-idle-${this._facing}`;
      if (this.anims.currentAnim?.key !== animKey) this.play(animKey);
    } else {
      this._visual.setPosition(this.x, this.y - this._jumpHeight);
      this._updateDirectionIndicator();
    }
  }

  get isJumping() { return this._isJumping; }
  get fartJustPressed() { return this._padFartJustPressed; }

  _updateDirectionIndicator() {
    const offsets = { up: { x: 0, y: -10 }, down: { x: 0, y: 10 }, left: { x: -10, y: 0 }, right: { x: 10, y: 0 } };
    const off = offsets[this._facing];
    this._dirIndicator.setPosition(this.x + off.x, this.y + off.y);
  }

  get facing() { return this._facing; }
}
