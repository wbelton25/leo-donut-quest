import FX from '../systems/FX.js';

// DonutHolePickup: a small collectible donut hole laid in trails along the roads.
// Grabbing one pays $1 and pops a tiny "+$1". Kept deliberately lightweight (no
// glow/sparkle timers) because there are ~40+ of them on the map at once.
export default class DonutHolePickup {
  constructor(scene, x, y) {
    this._scene    = scene;
    this.x         = x;
    this.y         = y;
    this.collected = false;

    const c = scene.add.container(x, y).setDepth(5);
    c.add(scene.add.circle(0, 0, 5, 0xdca444).setStrokeStyle(1, 0x9a6a24));  // dough ring
    c.add(scene.add.circle(0, 0, 2, 0x3a2a14));                              // hole
    this._c = c;

    scene.tweens.add({
      targets: c, y: y - 2,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      delay: (x + y) % 400,   // desync the bob across the trail
    });
  }

  collect() {
    if (this.collected) return;
    this.collected = true;
    FX.burst(this._scene, this.x, this.y, {
      count: 6, colors: [0xdca444, 0xf5e6c0, 0xffe08a],
      minSpeed: 30, maxSpeed: 80, minSize: 1, maxSize: 2, duration: 360, depth: 8,
    });
    this._c.destroy();
  }

  destroy() {
    this._c?.destroy();
  }
}
