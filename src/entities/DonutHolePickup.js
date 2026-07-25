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

    // A donut HOLE is a solid ball of fried dough (no center hole) with a light
    // glaze — a "munchkin". Drawn as a filled ball plus a top-left sheen and a
    // couple of sugar specks so it reads as round, not as a ring.
    const c = scene.add.container(x, y).setDepth(5);
    c.add(scene.add.circle(0, 0, 5, 0xc9812f).setStrokeStyle(1, 0x8a5620));  // dough ball
    c.add(scene.add.circle(-1.4, -1.4, 2.4, 0xe6a856));                      // glaze sheen (upper-left)
    c.add(scene.add.circle(-1.8, -1.8, 1, 0xf7d9a0));                        // hot-spot highlight
    c.add(scene.add.circle(2.2, 1.6, 0.7, 0xfff2d8));                        // sugar speck
    c.add(scene.add.circle(0.4, 2.4, 0.6, 0xfff2d8));                        // sugar speck
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
