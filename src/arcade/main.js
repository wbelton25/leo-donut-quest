// Donut Rain — standalone mobile arcade prototype.
//
// A separate Phaser game from the desktop adventure (src/main.js): portrait,
// touch-first, Scale.FIT so it fills any phone aspect ratio. It shares the repo's
// assets and a few systems (FX) but none of the adventure's scenes or state.
//
// The job of this build is to answer one question: is the catch-and-dodge loop
// fun to thumb on a phone? Everything here is tuned for that verdict.

import Phaser from 'phaser';
import BootArcadeScene from './scenes/BootArcadeScene.js';
import DonutRainScene from './scenes/DonutRainScene.js';

// Portrait design resolution. 360×640 is a clean 9:16 — the game lays out to this
// virtual canvas and Scale.FIT letterboxes it onto the real screen.
export const ARCADE_WIDTH = 360;
export const ARCADE_HEIGHT = 640;

const config = {
  type: Phaser.AUTO,
  width: ARCADE_WIDTH,
  height: ARCADE_HEIGHT,
  backgroundColor: '#8ec7ff', // daytime sky — donuts rain from it

  // FIT (not INTEGER_FIT): phones come in every aspect ratio, so we scale to fit
  // and letterbox rather than demanding whole-number multiples. Parent is the
  // #game div (sized to 100dvh), so we fit the *visible* viewport — not the taller
  // area hidden behind Safari's toolbar.
  scale: {
    parent: 'game',
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  render: {
    pixelArt: true,
    antialias: false,
  },

  scene: [BootArcadeScene, DonutRainScene],
};

const game = new Phaser.Game(config);

// Re-fit when the visible viewport changes — iOS Safari growing/shrinking its
// toolbar fires visualViewport 'resize' (not always window 'resize'), so listen
// to both plus orientation. Keeps the whole game on-screen with no bottom cutoff.
const refit = () => game.scale.refresh();
window.addEventListener('resize', refit);
window.addEventListener('orientationchange', () => setTimeout(refit, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);

// Exposed for headless smoke tests; harmless in production.
if (typeof window !== 'undefined') window.__arcade = game;
