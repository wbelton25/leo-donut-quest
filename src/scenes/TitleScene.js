import {
  SCENE_TITLE, SCENE_NEIGHBORHOOD, SCENE_HUD, SCENE_DIALOGUE,
  BASE_WIDTH, BASE_HEIGHT,
} from '../constants.js';
import SaveSystem from '../systems/SaveSystem.js';

// TitleScene: title screen with New Game and Continue options.
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
    // Sprinkles
    [[-8, -8], [10, -12], [-12, 5], [8, 10], [0, -16]].forEach(([dx, dy]) => {
      this.add.rectangle(cx + dx, cy - 65 + dy, 4, 2, 0xe74c3c)
        .setAngle(Math.random() * 90 - 45);
    });

    this.add.text(cx, cy - 18, "LEO'S DONUT QUEST", {
      fontFamily: 'monospace', fontSize: '14px', color: '#f5a623',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 2, 'A SUBURBAN ADVENTURE', {
      fontFamily: 'monospace', fontSize: '7px', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 14, 'TEGA CAY, SC', {
      fontFamily: 'monospace', fontSize: '6px', color: '#667788',
    }).setOrigin(0.5);

    // ── Buttons ───────────────────────────────────────────────────────────────
    this._addButton(cx, cy + 36, 'NEW GAME', () => this._startNewGame());

    if (SaveSystem.hasSave()) {
      this._addButton(cx, cy + 52, 'CONTINUE', () => this._continueGame());
    }

    // Version / phase indicator
    this.add.text(BASE_WIDTH - 4, BASE_HEIGHT - 6, 'v0.2', {
      fontFamily: 'monospace', fontSize: '5px', color: '#334455',
    }).setOrigin(1, 1);
  }

  _addButton(x, y, label, callback) {
    const bg = this.add.rectangle(x, y, 90, 14, 0x2a2a4a)
      .setInteractive({ cursor: 'pointer' });
    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '8px', color: '#ffffff',
    }).setOrigin(0.5);

    bg.on('pointerover', () => { bg.setFillStyle(0x4444aa); text.setColor('#f5a623'); });
    bg.on('pointerout',  () => { bg.setFillStyle(0x2a2a4a); text.setColor('#ffffff'); });
    bg.on('pointerdown', callback);
  }

  _startNewGame() {
    // Store a fresh game state on the game registry so all scenes can access it
    this.game.registry.set('gameState', SaveSystem.newGame());
    this._launchGameplay();
  }

  _continueGame() {
    const saved = SaveSystem.load();
    if (saved) {
      this.game.registry.set('gameState', saved);
    } else {
      this.game.registry.set('gameState', SaveSystem.newGame());
    }
    this._launchGameplay();
  }

  _launchGameplay() {
    this.scene.launch(SCENE_HUD);
    this.scene.launch(SCENE_DIALOGUE);
    this.scene.start(SCENE_NEIGHBORHOOD);
  }
}
