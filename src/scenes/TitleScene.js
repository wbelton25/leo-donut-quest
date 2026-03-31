import {
  SCENE_TITLE, SCENE_NEIGHBORHOOD, SCENE_HUD, SCENE_DIALOGUE,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';
import SaveSystem from '../systems/SaveSystem.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_TITLE });
  }

  create() {
    const cx = BASE_WIDTH / 2;
    const cy = BASE_HEIGHT / 2;

    this.add.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x1a1a2e).setOrigin(0, 0);

    // Donut graphic (placeholder)
    this.add.circle(cx, cy - 65, 30, 0xf5a623);
    this.add.circle(cx, cy - 65, 12, 0x1a1a2e);
    [[-8, -8], [10, -12], [-12, 5], [8, 10], [0, -16]].forEach(([dx, dy]) => {
      this.add.rectangle(cx + dx, cy - 65 + dy, 4, 2, 0xe74c3c)
        .setAngle(Math.random() * 90 - 45);
    });

    // Title — 10px gives a bold, readable headline at this resolution
    txt(this, cx, cy - 22, "LEO'S DONUT QUEST", {
      fontSize: '10px',
      color: '#f5a623',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    txt(this, cx, cy - 4, 'A SUBURBAN ADVENTURE', {
      fontSize: '6px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    txt(this, cx, cy + 10, 'TEGA CAY, SC', {
      fontSize: '6px',
      color: '#667788',
    }).setOrigin(0.5);

    // Buttons
    this._addButton(cx, cy + 30, 'NEW GAME', () => this._startNewGame());
    if (SaveSystem.hasSave()) {
      this._addButton(cx, cy + 48, 'CONTINUE', () => this._continueGame());
    }

    // Blinking prompt
    const prompt = txt(this, cx, cy + 66, 'PRESS ANY KEY', {
      fontSize: '6px',
      color: '#555577',
    }).setOrigin(0.5);
    this.time.addEvent({ delay: 600, loop: true, callback: () => prompt.setVisible(!prompt.visible) });

    txt(this, BASE_WIDTH - 4, BASE_HEIGHT - 6, 'v0.2', {
      fontSize: '6px',
      color: '#334455',
    }).setOrigin(1, 1);
  }

  _addButton(x, y, label, callback) {
    const bg = this.add.rectangle(x, y, 110, 16, 0x2a2a4a).setInteractive({ cursor: 'pointer' });
    const t = txt(this, x, y, label, { fontSize: '8px' }).setOrigin(0.5);

    bg.on('pointerover', () => { bg.setFillStyle(0x4444aa); t.setColor('#f5a623'); });
    bg.on('pointerout',  () => { bg.setFillStyle(0x2a2a4a); t.setColor('#ffffff'); });
    bg.on('pointerdown', callback);
  }

  _startNewGame() {
    this.game.registry.set('gameState', SaveSystem.newGame());
    this._launchGameplay();
  }

  _continueGame() {
    const saved = SaveSystem.load();
    this.game.registry.set('gameState', saved ?? SaveSystem.newGame());
    this._launchGameplay();
  }

  _launchGameplay() {
    this.scene.launch(SCENE_HUD);
    this.scene.launch(SCENE_DIALOGUE);
    this.scene.start(SCENE_NEIGHBORHOOD);
  }
}
