import Phaser from 'phaser';
import { BASE_WIDTH, BASE_HEIGHT } from './constants.js';

import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import TitleScene from './scenes/TitleScene.js';
import HudScene from './scenes/HudScene.js';
import NeighborhoodScene from './scenes/NeighborhoodScene.js';

import DialogueScene from './scenes/DialogueScene.js';

// Remaining scenes added in later phases:
// import FriendHouseScene from './scenes/FriendHouseScene.js';
// import BossScene from './scenes/BossScene.js';
// import OregonTrailScene from './scenes/OregonTrailScene.js';
// import DonutShopScene from './scenes/DonutShopScene.js';
// import FinalBossScene from './scenes/FinalBossScene.js';
// import GameOverScene from './scenes/GameOverScene.js';
// import CreditsScene from './scenes/CreditsScene.js';

const config = {
  type: Phaser.AUTO,

  // Internal render resolution - game logic runs at 320x240
  width: BASE_WIDTH,
  height: BASE_HEIGHT,

  backgroundColor: '#1a1a2e',

  // Pixel-perfect scaling: fills the window while keeping integer scale factors
  scale: {
    mode: Phaser.Scale.FIT,
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

  // Scene order: Boot loads first, then Preload, then Title.
  // HudScene and NeighborhoodScene are started manually from within other scenes.
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    HudScene,
    DialogueScene,
    NeighborhoodScene,
  ],
};

new Phaser.Game(config);
