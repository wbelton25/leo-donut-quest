import { txt } from '../constants.js';

// Shared boss-fight HUD widgets so every boss battle matches Grace's screen:
//   • 5 pixel-art hearts + "LEO" label, top-right
//   • a boss HP header bar, top-centre
//
// Both return an `update(fraction)` function (fraction 0..1). Callers invoke it
// whenever the underlying value changes.

// 7×6 pixel-art heart at 3px scale. state: 'full' | 'half' | 'empty'
export function drawHeart(gfx, x, y, state) {
  const S = 3;
  const rows = [
    [0, 1, 1, 0, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 0, 0, 0],
  ];
  gfx.clear();
  gfx.fillStyle(0x330011, 1);
  rows.forEach((row, py) =>
    row.forEach((on, px) => { if (on) gfx.fillRect(x + px * S, y + py * S, S, S); })
  );
  if (state === 'empty') return;
  const maxCol = state === 'full' ? 7 : 4;
  gfx.fillStyle(0xff1155, 1);
  rows.forEach((row, py) =>
    row.forEach((on, px) => { if (on && px < maxCol) gfx.fillRect(x + px * S, y + py * S, S, S); })
  );
}

// 5 Leo hearts + "LEO" label, pinned top-right (Grace's exact layout).
// Returns update(fraction 0..1).
export function createHearts(scene, arenaW) {
  txt(scene, arenaW - 6, 5, 'LEO', { fontSize: '8px', color: '#cccccc' })
    .setOrigin(1, 0).setScrollFactor(0).setDepth(20);

  const gfx = [];
  for (let i = 0; i < 5; i++) gfx.push(scene.add.graphics().setScrollFactor(0).setDepth(20));

  const update = (fraction) => {
    const e = Phaser.Math.Clamp(fraction, 0, 1) * 100;
    const full = Math.floor(e / 20);
    const half = (e % 20) >= 10;
    gfx.forEach((g, i) => {
      const x = arenaW - 120 + i * 23;
      const state = i < full ? 'full' : (i === full && half ? 'half' : 'empty');
      drawHeart(g, x, 14, state);
    });
  };
  update(1);
  return update;
}

// Boss HP header bar, top-centre (Grace's exact layout). Returns update(fraction).
export function createBossBar(scene, arenaW, color = 0xff2222) {
  scene.add.rectangle(arenaW / 2, 16, 160, 8, 0x440000).setScrollFactor(0).setDepth(20);
  const fill = scene.add.rectangle(arenaW / 2 - 78, 16, 156, 6, color)
    .setOrigin(0, 0.5).setScrollFactor(0).setDepth(20);
  const update = (fraction) => {
    const p = Phaser.Math.Clamp(fraction, 0, 1);
    fill.setDisplaySize(156 * p, 6);
    fill.setFillStyle(p > 0.5 ? color : 0xff8800);
  };
  return update;
}
