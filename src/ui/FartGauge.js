import { txt } from '../constants.js';

// FartGauge: a small, self-updating "is my fart charged?" indicator for the boss scenes.
// Replaces the old control-instruction text (F: FART / WASD: MOVE), which players already
// learned in Act 1. A boss just does `this._fartGauge = new FartGauge(this)` and calls
// `this._fartGauge.trigger(cooldownMs)` each time it farts — the gauge tracks its own time
// off the scene's update event and shows a label ("GAS BUILDING..." while charging,
// "FART BLAST READY!" when full) over a filling bar.
export default class FartGauge {
  constructor(scene, x = 8, y = 8) {
    this._scene   = scene;
    this._readyAt = 0;
    this._cd      = 1;
    this._w       = 44;

    // Depth 20 (the boss HUD layer) — deliberately BELOW the depth>=40 modal overlays
    // (e.g. the donut-recharge prompt), whose blanket cleanup would otherwise destroy the
    // gauge and then crash on the next update tick.
    this._label = txt(scene, x, y, 'GAS BUILDING...', { fontSize: '8px', color: '#8a8a6a' })
      .setScrollFactor(0).setDepth(20);
    // Bar sits BELOW the label so the text can never overlap the fill.
    scene.add.rectangle(x, y + 13, this._w, 6, 0x2a2a1a).setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x555522).setScrollFactor(0).setDepth(20);
    this._fill = scene.add.rectangle(x, y + 13, this._w, 4, 0xf5e642).setOrigin(0, 0.5)
      .setScrollFactor(0).setDepth(21);

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
    // Crash-proof: if a modal's cleanup destroyed our objects, stop ticking.
    if (!this._fill || !this._fill.active) return;

    const now = Date.now();
    if (now >= this._readyAt) {
      this._fill.width = this._w;
      this._fill.setFillStyle(0xf5e642);
      this._label.setText('FART BLAST READY!').setColor(Math.floor(now / 350) % 2 ? '#bfa640' : '#f5e642');
    } else {
      const p = 1 - (this._readyAt - now) / this._cd;
      this._fill.width = Math.max(1, this._w * p);
      this._fill.setFillStyle(0x8a7a20);
      this._label.setText('GAS BUILDING...').setColor('#8a8a6a');
    }
  }
}
