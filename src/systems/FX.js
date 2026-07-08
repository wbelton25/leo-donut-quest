// FX — reusable "juice" helpers: screen shake, hit-stop, particle bursts,
// punchy floating text, and squash/stretch pops. All effects are self-cleaning
// (they destroy their own game objects) so callers can fire-and-forget.
//
// Everything is built from primitive circles + tweens rather than Phaser's
// particle emitter so it renders reliably under WebGL pixelArt mode and needs
// no texture atlas.

export default class FX {
  // Camera shake. intensity is a fraction of the viewport (0.005 = subtle,
  // 0.02 = heavy). Safe to call every frame — Phaser ignores overlapping shakes
  // of equal-or-lower intensity.
  static shake(scene, duration = 200, intensity = 0.008) {
    scene.cameras.main.shake(duration, intensity);
  }

  // Hit-stop / freeze-frame. Sets scene._fxFrozen for `ms`; a scene's update()
  // must check `if (this._fxFrozen) return;` for this to actually pause the sim.
  // Camera shake keeps running during the freeze, which is what sells the impact.
  static freeze(scene, ms = 55) {
    scene._fxFrozen = true;
    scene.time.delayedCall(ms, () => { scene._fxFrozen = false; });
  }

  // Radial burst of small particles flying outward from (x, y). Great for
  // impacts, farts, dust, splashes. `opts.scrollFactor` = 0 pins to the camera.
  static burst(scene, x, y, opts = {}) {
    const {
      count = 8,
      colors = [0xffffff],
      minSpeed = 40,
      maxSpeed = 110,
      minSize = 1,
      maxSize = 3,
      duration = 380,
      depth = 40,
      gravity = 0,
      spreadFrom = 0,       // base angle in radians
      spreadArc = Math.PI * 2, // full circle by default
      scrollFactor = 1,
    } = opts;

    for (let i = 0; i < count; i++) {
      const ang = spreadFrom + (Math.random() - 0.5) * spreadArc;
      const spd = Phaser.Math.Between(minSpeed, maxSpeed);
      const size = Phaser.Math.Between(minSize, maxSize);
      const color = colors[Phaser.Math.Between(0, colors.length - 1)];
      const p = scene.add.circle(x, y, size, color)
        .setDepth(depth)
        .setScrollFactor(scrollFactor);
      const life = duration * Phaser.Math.FloatBetween(0.7, 1.1);
      scene.tweens.add({
        targets: p,
        x: x + Math.cos(ang) * spd,
        y: y + Math.sin(ang) * spd + gravity,
        alpha: 0,
        scale: 0.2,
        duration: life,
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      });
    }
  }

  // Punchy floating text that pops up in scale, drifts up, then fades.
  static popText(scene, x, y, message, opts = {}) {
    const {
      color = '#ffffff',
      fontSize = '10px',
      rise = 26,
      duration = 650,
      depth = 45,
      scrollFactor = 1,
    } = opts;

    const label = scene.add.text(x, y, message, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize,
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(depth).setScrollFactor(scrollFactor).setScale(0.3);

    scene.tweens.add({
      targets: label,
      scale: 1,
      duration: 140,
      ease: 'Back.Out',
    });
    scene.tweens.add({
      targets: label,
      y: y - rise,
      alpha: 0,
      duration,
      delay: 120,
      ease: 'Quad.In',
      onComplete: () => label.destroy(),
    });
  }

  // Squash-and-stretch "pop" on any game object with setScale. Briefly
  // overshoots scale then springs back — reads as an impact hit on the target.
  // Captures the object's current scale so it works on sized sprites/images.
  static pop(scene, target, amount = 0.35, duration = 160) {
    if (!target || target.scaleX === undefined) return;
    const baseX = target.scaleX;
    const baseY = target.scaleY;
    scene.tweens.add({
      targets: target,
      scaleX: baseX * (1 + amount),
      scaleY: baseY * (1 - amount * 0.6),
      duration: duration * 0.4,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => { target.setScale(baseX, baseY); },
    });
  }
}
