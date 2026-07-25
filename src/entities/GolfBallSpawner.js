// GolfBallSpawner: a golfer who tees off, firing golf balls at Leo on a timer.
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

const GOLFER_KEY = 'sprite-golfer';
const BALL_KEY   = 'sprite-golfball';

export default class GolfBallSpawner {
  constructor(scene, x, y, angle = 0, interval, speed, damage, onHitPlayer) {
    this._scene       = scene;
    this._x           = x;
    this._y           = y;
    this._onHitPlayer = onHitPlayer;
    this._speed       = speed ?? DEFAULT_SPEED;
    this._damage      = damage ?? DEFAULT_DAMAGE;
    this._balls       = [];
    this._destroyed   = false;

    const rad = (angle * Math.PI) / 180;
    this._dirX = Math.cos(rad);
    this._dirY = Math.sin(rad);

    // Golfer sprite (animated swing) when the art is loaded; else a tee marker.
    if (scene.textures.exists(GOLFER_KEY)) {
      this._registerAnims();
      this._golfer = scene.add.sprite(x, y, GOLFER_KEY, 5)
        .setDisplaySize(30, 38).setOrigin(0.5, 0.97).setDepth(3); // smaller; feet at (x,y)
      if (this._dirX < -0.1) this._golfer.setFlipX(true); // face the way he hits
      this._golfer.play('golfer-idle');
      this._marker = null;
    } else {
      this._golfer = null;
      this._marker = scene.add.circle(x, y, 5, 0xffffff, 0.5).setDepth(3);
    }

    // Random startAt phase-shifts each golfer so they don't all swing in unison.
    const period = interval ?? DEFAULT_INTERVAL;
    this._timer = scene.time.addEvent({
      delay:    period,
      startAt:  Phaser.Math.Between(0, period - 1),
      loop:     true,
      callback: this._fire,
      callbackScope: this,
    });
  }

  _registerAnims() {
    const a = this._scene.anims;
    if (!a.exists('golfer-idle')) {
      a.create({ key: 'golfer-idle',  frames: a.generateFrameNumbers(GOLFER_KEY, { frames: [4, 5, 6, 7] }), frameRate: 4,  repeat: -1 });
    }
    if (!a.exists('golfer-swing')) {
      a.create({ key: 'golfer-swing', frames: a.generateFrameNumbers(GOLFER_KEY, { frames: [0, 1, 2, 3] }), frameRate: 14, repeat: 0 });
    }
  }

  _fire() {
    if (this._destroyed) return;
    if (this._golfer) {
      // Swing, spawn the ball at contact, then settle back to idle
      this._golfer.play('golfer-swing');
      this._golfer.once('animationcomplete-golfer-swing', () => {
        if (this._golfer && this._golfer.active) this._golfer.play('golfer-idle');
      });
      this._scene.time.delayedCall(170, () => this._spawnBall());
    } else {
      this._spawnBall();
    }
  }

  _spawnBall(dirX = this._dirX, dirY = this._dirY, speed = this._speed) {
    if (this._destroyed) return;
    let sprite;
    if (this._scene.textures.exists(BALL_KEY)) {
      sprite = this._scene.add.image(this._x, this._y - 4, BALL_KEY).setDisplaySize(11, 11).setDepth(4);
    } else {
      sprite = this._scene.add.circle(this._x, this._y, BALL_RADIUS, 0xffffff).setDepth(4);
    }
    this._balls.push({
      sprite,
      vx: dirX * speed,
      vy: dirY * speed,
      hit: false,
    });
  }

  // Spooked by a nearby fart: the golfer shanks a wild burst of balls, aimed
  // roughly at (px,py) but with a big random spread — erratic and hard to dodge.
  // Called by NeighborhoodScene when Leo farts near this golfer.
  startle(px, py) {
    if (this._destroyed || this._startled) return;
    this._startled = true;
    // Brief immunity so a fart-spam can't chain infinite sprays.
    this._scene.time.delayedCall(1400, () => { this._startled = false; });

    if (this._golfer) {
      this._golfer.play('golfer-swing');
      this._golfer.once('animationcomplete-golfer-swing', () => {
        if (this._golfer && this._golfer.active) this._golfer.play('golfer-idle');
      });
    }

    const baseAng = Math.atan2(py - this._y, px - this._x);
    const n = Phaser.Math.Between(3, 5);
    for (let k = 0; k < n; k++) {
      this._scene.time.delayedCall(k * 85, () => {
        if (this._destroyed) return;
        const ang   = baseAng + Phaser.Math.FloatBetween(-1.15, 1.15); // ~±66° spread
        const speed = this._speed * Phaser.Math.FloatBetween(0.85, 1.35);
        this._spawnBall(Math.cos(ang), Math.sin(ang), speed);
      });
    }
  }

  update(player) {
    const dt = 1 / 60;
    const W  = this._scene.game.config.width;
    const H  = this._scene.game.config.height;
    const cam = this._scene.cameras.main;

    for (let i = this._balls.length - 1; i >= 0; i--) {
      const b = this._balls[i];
      if (b.hit) { this._balls.splice(i, 1); continue; }

      b.sprite.x += b.vx * dt;
      b.sprite.y += b.vy * dt;
      b.sprite.angle += 14; // spin in flight

      if (b.sprite.x < cam.scrollX - SCREEN_MARGIN ||
          b.sprite.x > cam.scrollX + W + SCREEN_MARGIN ||
          b.sprite.y < cam.scrollY - SCREEN_MARGIN ||
          b.sprite.y > cam.scrollY + H + SCREEN_MARGIN) {
        b.sprite.destroy();
        this._balls.splice(i, 1);
        continue;
      }

      const dx = Math.abs(player.x - b.sprite.x);
      const dy = Math.abs(player.y - b.sprite.y);
      if (dx < 12 && dy < 12) {
        b.hit = true;
        b.sprite.destroy();
        this._onHitPlayer(this._damage);
        this._scene.cameras.main.flash(80, 255, 255, 100);
        this._balls.splice(i, 1);
      }
    }
  }

  destroy() {
    this._destroyed = true;
    this._timer.remove();
    if (this._marker) this._marker.destroy();
    if (this._golfer) this._golfer.destroy();
    this._balls.forEach(b => b.sprite.destroy());
    this._balls = [];
  }
}
