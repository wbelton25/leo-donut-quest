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
    // Optional retry target: restart THIS scene with THIS data instead of Act 1.
    // Used by Act 2 so a failed ride retries from the Act-1 finish line.
    this._retryScene = data?.retryScene ?? null;
    this._retryData  = data?.retryData ?? null;
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

    // Encouraging kid-toned line + one concrete tip for the specific failure.
    const TIPS = {
      energy:   'TIP: eat a snack at camp when the crew looks tired.',
      bike:     'TIP: fix your bikes at camp before they wear out.',
      time:     'TIP: knock down deer + dodge cars to bank time,\nand take it EASY on the big hills.',
      gauntlet: 'TIP: save a few donuts to recharge between fights!',
    };
    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 8, 'SO CLOSE! GIVE IT ANOTHER GO.', {
      fontSize: '8px', color: '#9fd6a0',
    }).setOrigin(0.5);
    txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 26, TIPS[this._reason] ?? '', {
      fontSize: '8px', color: '#7a90a8', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5);

    // Prompt
    const promptText = this._retryScene ? 'PRESS SPACE TO RETRY THE RIDE' : 'PRESS SPACE TO TRY AGAIN';
    const prompt = txt(this, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 50, promptText, {
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
        if (progress !== 1) return;
        this.scene.stop(SCENE_GAME_OVER);
        if (this._retryScene) {
          // Retry the failed act with the party/resources you brought into it.
          this.scene.start(this._retryScene, this._retryData);
        } else {
          // Full restart from Act 1 — clear saved state.
          this.game.registry.remove('gameState');
          this.scene.start(SCENE_NEIGHBORHOOD);
        }
      });
    });
  }
}
