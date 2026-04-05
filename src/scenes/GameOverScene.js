import { SCENE_GAME_OVER, SCENE_NEIGHBORHOOD, SCENE_TITLE, BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';

// GameOverScene: shown when energy, bike condition, or time hits 0.
// Displays reason, then lets player retry from the neighborhood.

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_GAME_OVER });
  }

  init(data) {
    // data.reason: 'energy' | 'bike' | 'time'
    this._reason = data?.reason ?? 'energy';
  }

  create() {
    // Dark overlay
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.92);

    // Flashing "GAME OVER" title
    const title = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 60, 'GAME OVER', {
      fontSize: '16px', color: '#ff3333',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      alpha: 0.2,
      yoyo: true,
      repeat: -1,
      duration: 600,
    });

    // Reason sub-text
    const reasonMap = {
      energy:   "YOU RAN OUT OF ENERGY",
      bike:     "YOUR BIKE BROKE DOWN",
      time:     "DONUT HOUSE IS CLOSED",
      gauntlet: "THE SIBLINGS GOT YOUR DONUTS",
    };
    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 20, reasonMap[this._reason] ?? "YOU GAVE UP", {
      fontSize: '8px', color: '#ffaa44',
    }).setOrigin(0.5);

    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 10, 'NO DONUTS TODAY.', {
      fontSize: '8px', color: '#888888',
    }).setOrigin(0.5);

    // Prompt
    const prompt = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 50, 'PRESS SPACE TO TRY AGAIN', {
      fontSize: '8px', color: '#ffffff',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0,
      yoyo: true,
      repeat: -1,
      duration: 500,
    });

    // Input
    this.input.keyboard.once('keydown-SPACE', () => {
      this.cameras.main.fade(400, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          // Clear saved state so they restart fresh
          this.game.registry.remove('gameState');
          this.scene.stop(SCENE_GAME_OVER);
          this.scene.start(SCENE_NEIGHBORHOOD);
        }
      });
    });
  }
}
