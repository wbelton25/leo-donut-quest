// GolfBallSpawner: fires golf balls from a fixed position at timed intervals.
// Balls fly in a specified direction and destroy on screen exit or player hit.
//
// Constructor:
//   scene          — Phaser scene
//   x, y           — spawn origin in pixels
//   angle          — direction in degrees (0=right, 90=down, 180=left, 270=up)
//   interval       — ms between shots (default 3000)
//   speed          — ball travel speed in px/s (default 220)
//   damage         — bike damage per hit (default 15)
//   onHitPlayer(damage) — callback

const DEFAULT_SPEED    = 220;
const DEFAULT_DAMAGE   = 15;
const DEFAULT_INTERVAL = 3000;
const BALL_RADIUS      = 4;
const SCREEN_MARGIN    = 100; // destroy ball when this far off-screen

export default class GolfBallSpawner {
  constructor(scene, x, y, angle = 0, interval, speed, damage, onHitPlayer) {
    this._scene       = scene;
    this._x           = x;
    this._y           = y;
    this._onHitPlayer = onHitPlayer;
    this._speed       = speed ?? DEFAULT_SPEED;
    this._damage      = damage ?? DEFAULT_DAMAGE;
    this._balls       = [];

    const rad = (angle * Math.PI) / 180;
    this._dirX = Math.cos(rad);
    this._dirY = Math.sin(rad);

    // Show a small tee marker at the spawn point
    this._marker = scene.add.circle(x, y, 5, 0xffffff, 0.5).setDepth(1);

    this._timer = scene.time.addEvent({
      delay:    interval ?? DEFAULT_INTERVAL,
      loop:     true,
      callback: this._fire,
      callbackScope: this,
    });
  }

  _fire() {
    const ball = this._scene.add.circle(this._x, this._y, BALL_RADIUS, 0xffffff).setDepth(4);
    this._balls.push({
      sprite: ball,
      vx: this._dirX * this._speed,
      vy: this._dirY * this._speed,
      hit: false,
    });
  }

  update(player) {
    const dt = 1 / 60;
    const W  = this._scene.game.config.width;
    const H  = this._scene.game.config.height;

    for (let i = this._balls.length - 1; i >= 0; i--) {
      const b = this._balls[i];
      if (b.hit) { this._balls.splice(i, 1); continue; }

      b.sprite.x += b.vx * dt;
      b.sprite.y += b.vy * dt;

      // Destroy when off-screen (using camera scroll to get world bounds)
      const cam = this._scene.cameras.main;
      if (b.sprite.x < cam.scrollX - SCREEN_MARGIN ||
          b.sprite.x > cam.scrollX + W + SCREEN_MARGIN ||
          b.sprite.y < cam.scrollY - SCREEN_MARGIN ||
          b.sprite.y > cam.scrollY + H + SCREEN_MARGIN) {
        b.sprite.destroy();
        this._balls.splice(i, 1);
        continue;
      }

      // Collision with player
      const dx = Math.abs(player.x - b.sprite.x);
      const dy = Math.abs(player.y - b.sprite.y);
      if (dx < 14 && dy < 14) {
        b.hit = true;
        b.sprite.destroy();
        this._onHitPlayer(this._damage);
        this._scene.cameras.main.flash(80, 255, 255, 100);
        this._balls.splice(i, 1);
      }
    }
  }

  destroy() {
    this._timer.remove();
    this._marker.destroy();
    this._balls.forEach(b => b.sprite.destroy());
    this._balls = [];
  }
}
