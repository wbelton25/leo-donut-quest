import { txt } from '../constants.js';

// FartGauge: a small, self-updating "is my fart charged?" indicator for the boss scenes.
// Replaces the old control-instruction text (F: FART / WASD: MOVE), which players already
// learned in Act 1. A boss just does `this._fartGauge = new FartGauge(this)` and calls
// `this._fartGauge.trigger(cooldownMs)` each time it farts — the gauge tracks its own time
// off the scene's update event and shows a filling bar + a pulsing "FART READY!".
export default class FartGauge {
  constructor(scene, x = 8, y = 13) {
    this._scene   = scene;
    this._readyAt = 0;
    this._cd      = 1;
    this._w       = 40;

    this._label = txt(scene, x, y - 9, 'FART', { fontSize: '8px', color: '#f5e642' })
      .setScrollFactor(0).setDepth(40);
    scene.add.rectangle(x, y, this._w, 6, 0x2a2a1a).setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x555522).setScrollFactor(0).setDepth(40);
    this._fill = scene.add.rectangle(x, y, this._w, 4, 0xf5e642).setOrigin(0, 0.5)
      .setScrollFactor(0).setDepth(41);

    this._tick = () => this.update();
    scene.events.on('update', this._tick);
    scene.events.once('shutdown', () => scene.events.off('update', this._tick));
    this.update();
  }

  // Call when a fart fires. `cooldownMs` = how long until it's ready again.
  trigger(cooldownMs) {
    this._cd = Math.max(1, cooldownMs);
    this._readyAt = Date.now() + cooldownMs;
  }

  update() {
    const now = Date.now();
    if (now >= this._readyAt) {
      this._fill.width = this._w;
      this._fill.setFillStyle(0xf5e642);
      this._label.setText('FART READY!').setColor(Math.floor(now / 350) % 2 ? '#bfa640' : '#f5e642');
    } else {
      const p = 1 - (this._readyAt - now) / this._cd;
      this._fill.width = Math.max(1, this._w * p);
      this._fill.setFillStyle(0x8a7a20);
      this._label.setText('FART...').setColor('#8a8a6a');
    }
  }
}
