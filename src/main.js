import Phaser from 'phaser';
import { BASE_WIDTH, BASE_HEIGHT } from './constants.js';

import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import TitleScene from './scenes/TitleScene.js';
import HudScene from './scenes/HudScene.js';
import NeighborhoodScene from './scenes/NeighborhoodScene.js';

import DialogueScene from './scenes/DialogueScene.js';
import GraceBossScene from './scenes/GraceBossScene.js';
import MaxBossScene from './scenes/MaxBossScene.js';
import NoraBossScene from './scenes/NoraBossScene.js';
import JustinMaxBossScene from './scenes/JustinMaxBossScene.js';
import OregonTrailScene from './scenes/OregonTrailScene.js';
import DonutShopScene from './scenes/DonutShopScene.js';
import CreditsScene from './scenes/CreditsScene.js';
import GameOverScene from './scenes/GameOverScene.js';

// Remaining scenes added in later phases:
// import FriendHouseScene from './scenes/FriendHouseScene.js';
// import BossScene from './scenes/BossScene.js';
// import OregonTrailScene from './scenes/OregonTrailScene.js';
// import DonutShopScene from './scenes/DonutShopScene.js';
// import FinalBossScene from './scenes/FinalBossScene.js';
// import CreditsScene from './scenes/CreditsScene.js';

const config = {
  type: Phaser.AUTO,

  // Internal render resolution - game logic runs at 320x240
  width: BASE_WIDTH,
  height: BASE_HEIGHT,

  backgroundColor: '#1a1a2e',

  // Pixel-perfect scaling: INTEGER_FIT only uses whole-number scale factors (1×, 2×, 3×…)
  // This prevents sub-pixel blurring that FIT causes on non-integer screen sizes.
  scale: {
    mode: Phaser.Scale.INTEGER_FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  // Arcade physics: simple AABB + circle collision, runs at 60fps easily
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 }, // top-down game, no gravity
      debug: false,       // set to true to see hitboxes while developing
    },
  },

  // Pixel art rendering - prevents blurry scaled sprites
  render: {
    pixelArt: true,
    antialias: false,
  },

  // Scene render order matters: Phaser draws scenes in array order (index 0 = bottom).
  // Gameplay scenes go first; HudScene and DialogueScene go last so they render on top.
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    NeighborhoodScene,
    GraceBossScene,
    MaxBossScene,
    NoraBossScene,
    JustinMaxBossScene,
    OregonTrailScene,
    DonutShopScene,
    CreditsScene,
    GameOverScene,
    HudScene,      // renders above gameplay scenes
    DialogueScene, // renders above HudScene
  ],
};

new Phaser.Game(config);
