import FX from '../systems/FX.js';

// GoldenDonutPickup: a rare hidden secret (3 on the whole map). Deliberately flashy —
// radiant glow, slow spin, constant sparkle — so finding one feels like a big deal.
// Not marked on the minimap; discovery is the point. Persists per-run once collected.
export default class GoldenDonutPickup {
  constructor(scene, x, y) {
    this._scene    = scene;
    this.x         = x;
    this.y         = y;
    this.collected = false;

    this._glow = scene.add.circle(x, y, 14, 0xffe86a, 0.30).setDepth(4);
    scene.tweens.add({
      targets: this._glow, scale: 1.5, alpha: 0.12,
      duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    const c = scene.add.container(x, y).setDepth(5);
    c.add(scene.add.circle(0, 0, 8, 0xffd23f).setStrokeStyle(2, 0xffb300));  // gold dough
    c.add(scene.add.circle(0, 0, 3, 0x8a5a00));                             // hole
    c.add(scene.add.rectangle(-3, -2, 3, 1.5, 0xffffff).setAngle(30));      // sprinkle
    c.add(scene.add.rectangle(3, 2, 3, 1.5, 0xfff0b0).setAngle(-40));       // sprinkle
    this._c = c;

    scene.tweens.add({ targets: c, y: y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: c, angle: 360, duration: 4000, repeat: -1 });

    this._sparkleTimer = scene.time.addEvent({ delay: 600, loop: true, callback: () => this._sparkle() });
  }

  _sparkle() {
    if (this.collected) return;
    const ang = Math.random() * Math.PI * 2, r = 11;
    const s = this._scene.add.star(
      this.x + Math.cos(ang) * r, this.y + Math.sin(ang) * r - 2,
      4, 1, 3.5, 0xffffff,
    ).setDepth(6);
    this._scene.tweens.add({ targets: s, alpha: 0, scale: 0.2, angle: 120, duration: 550, onComplete: () => s.destroy() });
  }

  collect() {
    if (this.collected) return;
    this.collected = true;
    this._sparkleTimer.remove();
    FX.burst(this._scene, this.x, this.y, {
      count: 22, colors: [0xffd23f, 0xffe86a, 0xffffff, 0xffb300],
      minSpeed: 50, maxSpeed: 160, minSize: 1, maxSize: 4, duration: 620, depth: 8,
    });
    this._c.destroy();
    this._glow.destroy();
  }

  destroy() {
    this._sparkleTimer?.remove();
    this._c?.destroy();
    this._glow?.destroy();
  }
}
