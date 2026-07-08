import FX from '../systems/FX.js';

// BeanPickup: a collectible can of beans that grants Leo a temporary "power fart"
// buff (bigger cloud + faster recharge). Bobs, glows, and sparkles so it reads as
// a power-up from across the map. Self-cleaning on collect() / destroy().
export default class BeanPickup {
  constructor(scene, x, y) {
    this._scene    = scene;
    this.x         = x;
    this.y         = y;
    this.collected = false;

    // Pulsing glow behind the can
    this._glow = scene.add.circle(x, y, 11, 0xffe08a, 0.28).setDepth(4);
    scene.tweens.add({
      targets: this._glow, scale: 1.35, alpha: 0.1,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // The can itself, drawn as a small container so it bobs as one piece
    const can = scene.add.container(x, y).setDepth(5);
    const body  = scene.add.rectangle(0, 1, 12, 15, 0xc0392b).setStrokeStyle(1, 0x7b241c);
    const label = scene.add.rectangle(0, 2, 12, 6, 0xf5e6c0);
    const rim   = scene.add.rectangle(0, -6, 12, 3, 0x9aa0a6).setStrokeStyle(1, 0x6b7075);
    const bean1 = scene.add.ellipse(-2, -6, 5, 3, 0x6b3f1d);
    const bean2 = scene.add.ellipse(3, -7, 5, 3, 0x8a5a2b);
    can.add([body, label, rim, bean1, bean2]);
    this._can = can;

    scene.tweens.add({
      targets: can, y: y - 4,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // Occasional twinkle
    this._sparkleTimer = scene.time.addEvent({
      delay: 1100, loop: true, callback: () => this._sparkle(),
    });
  }

  _sparkle() {
    if (this.collected) return;
    const ang = Math.random() * Math.PI * 2;
    const r   = 8;
    const s = this._scene.add.star(
      this.x + Math.cos(ang) * r, this.y + Math.sin(ang) * r - 2,
      4, 1, 3, 0xffffff,
    ).setDepth(6);
    this._scene.tweens.add({
      targets: s, alpha: 0, scale: 0.2, angle: 90,
      duration: 500, onComplete: () => s.destroy(),
    });
  }

  collect() {
    if (this.collected) return;
    this.collected = true;
    this._sparkleTimer.remove();
    FX.burst(this._scene, this.x, this.y, {
      count: 14, colors: [0x6b3f1d, 0x8a5a2b, 0xf5e6c0, 0xffe08a],
      minSpeed: 40, maxSpeed: 120, minSize: 1, maxSize: 3, duration: 460, depth: 8,
    });
    this._can.destroy();
    this._glow.destroy();
  }

  destroy() {
    this._sparkleTimer?.remove();
    this._can?.destroy();
    this._glow?.destroy();
  }
}
