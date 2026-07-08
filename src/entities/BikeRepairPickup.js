import FX from '../systems/FX.js';

// BikeRepairPickup: a collectible toolbox that instantly restores Leo's bike to
// full condition — the "get unstuck" lifeline when too many obstacle hits have
// slowed him to a crawl. Bobs, glows blue, and sparkles like the bean pickup.
// Self-cleaning on collect() / destroy().
export default class BikeRepairPickup {
  constructor(scene, x, y) {
    this._scene    = scene;
    this.x         = x;
    this.y         = y;
    this.collected = false;

    // Pulsing blue glow behind the toolbox
    this._glow = scene.add.circle(x, y, 11, 0x8ad4ff, 0.28).setDepth(4);
    scene.tweens.add({
      targets: this._glow, scale: 1.35, alpha: 0.1,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // Toolbox drawn as a small container so it bobs as one piece
    const box = scene.add.container(x, y).setDepth(5);
    const body   = scene.add.rectangle(0, 3, 16, 10, 0xd23b3b).setStrokeStyle(1, 0x7b1e1e);
    const lid    = scene.add.rectangle(0, -2, 16, 4, 0xb02a2a).setStrokeStyle(1, 0x7b1e1e);
    const handle = scene.add.rectangle(0, -6, 8, 3, 0x9aa0a6).setStrokeStyle(1, 0x6b7075);
    // A little wrench on the lid so it reads as "repair"
    const wrench1 = scene.add.rectangle(-1, 3, 2, 7, 0xe8eef2).setAngle(35);
    const wrench2 = scene.add.rectangle(-3, 0, 4, 3, 0xe8eef2);
    box.add([handle, lid, body, wrench2, wrench1]);
    this._box = box;

    scene.tweens.add({
      targets: box, y: y - 4,
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
    const r   = 9;
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
      count: 16, colors: [0x8ad4ff, 0xd23b3b, 0xe8eef2, 0xffffff],
      minSpeed: 40, maxSpeed: 130, minSize: 1, maxSize: 3, duration: 480, depth: 8,
    });
    this._box.destroy();
    this._glow.destroy();
  }

  destroy() {
    this._sparkleTimer?.remove();
    this._box?.destroy();
    this._glow?.destroy();
  }
}
