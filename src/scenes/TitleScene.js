import { SCENE_TITLE, SCENE_NEIGHBORHOOD, SCENE_HUD, BASE_WIDTH, BASE_HEIGHT } from '../constants.js';

// TitleScene: shows the game title and waits for the player to press a key.
// In Phase 2 it will also offer a "Continue" button if a save exists.
export default class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_TITLE });
  }

  create() {
    const cx = BASE_WIDTH / 2;
    const cy = BASE_HEIGHT / 2;

    // Background
    this.add.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x1a1a2e).setOrigin(0, 0);

    // Donut decoration (simple circle placeholder for now)
    this.add.circle(cx, cy - 60, 30, 0xf5a623);
    this.add.circle(cx, cy - 60, 12, 0x1a1a2e); // donut hole

    // Title text
    this.add.text(cx, cy - 10, "LEO'S DONUT QUEST", {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#f5a623',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(cx, cy + 10, 'A SUBURBAN ADVENTURE', {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // Press start prompt - blinks every 500ms
    const prompt = this.add.text(cx, cy + 40, 'PRESS ANY KEY TO START', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => { prompt.setVisible(!prompt.visible); },
    });

    // Any key or click starts the game
    this.input.keyboard.once('keydown', this._startGame, this);
    this.input.once('pointerdown', this._startGame, this);
  }

  _startGame() {
    // Start the HUD in parallel (it will run alongside every gameplay scene)
    this.scene.launch(SCENE_HUD);
    // Transition to the neighborhood (Act 1)
    this.scene.start(SCENE_NEIGHBORHOOD);
  }
}
