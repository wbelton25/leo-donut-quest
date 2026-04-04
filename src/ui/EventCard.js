import { BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';

// EventCard: an event overlay drawn directly into OregonTrailScene.
// Shows an Oregon Trail-style event card with title, description, and choice buttons.
// Usage:
//   const card = new EventCard(scene);
//   card.show(event, onChoice);   // event = { title, description, choices[] }
//   // onChoice(choiceIndex, result) called after player picks

const CARD_W = 320;
const CARD_H = 150;
const CARD_X = (BASE_WIDTH - CARD_W) / 2;
const CARD_Y = (BASE_HEIGHT - CARD_H) / 2;

export default class EventCard {
  constructor(scene) {
    this._scene = scene;
    this._container = scene.add.container(0, 0).setDepth(30).setVisible(false);
    this._buttons = [];
    this._onChoice = null;
    this._build();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  show(event, onChoice) {
    this._onChoice = onChoice;
    this._clearButtons();

    // Update text
    this._titleText.setText(event.title.toUpperCase());
    this._descText.setText(event.description);

    // Build choice buttons
    const choices = event.choices;
    const btnH = 20;
    const btnStartY = CARD_Y + CARD_H - (choices.length * (btnH + 4)) - 8;

    choices.forEach((choice, i) => {
      const by = btnStartY + i * (btnH + 4);
      const bg = this._scene.add.rectangle(BASE_WIDTH / 2, by + btnH / 2, CARD_W - 20, btnH, 0x1a2a3a)
        .setInteractive({ useHandCursor: true });
      const label = txt(this._scene, BASE_WIDTH / 2, by + btnH / 2, choice.text, {
        fontSize: '8px', color: '#f5e642',
      }).setOrigin(0.5);

      bg.on('pointerover', () => bg.setFillStyle(0x2a4a6a));
      bg.on('pointerout',  () => bg.setFillStyle(0x1a2a3a));
      bg.on('pointerdown', () => this._pick(i));

      this._container.add([bg, label]);
      this._buttons.push(bg, label);
    });

    this._container.setVisible(true);
  }

  hide() {
    this._clearButtons();
    this._container.setVisible(false);
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  _build() {
    // Dark overlay behind card
    const overlay = this._scene.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.6);

    // Card background
    const cardBg = this._scene.add.rectangle(BASE_WIDTH / 2, CARD_Y + CARD_H / 2, CARD_W, CARD_H, 0x0a0a1a, 0.97);
    const border  = this._scene.add.rectangle(BASE_WIDTH / 2, CARD_Y + CARD_H / 2, CARD_W, CARD_H, 0, 0)
      .setStrokeStyle(2, 0xf5e642);

    // Title bar
    const titleBar = this._scene.add.rectangle(BASE_WIDTH / 2, CARD_Y + 12, CARD_W, 22, 0x1a3a1a);

    this._titleText = txt(this._scene, BASE_WIDTH / 2, CARD_Y + 12, '', {
      fontSize: '8px', color: '#88ff88',
    }).setOrigin(0.5);

    this._descText = txt(this._scene, CARD_X + 10, CARD_Y + 30, '', {
      fontSize: '8px', color: '#cccccc',
      wordWrap: { width: CARD_W - 20 },
    });

    this._container.add([overlay, cardBg, border, titleBar, this._titleText, this._descText]);
  }

  _clearButtons() {
    this._buttons.forEach(b => b.destroy());
    this._buttons = [];
  }

  _pick(index) {
    this.hide();
    if (this._onChoice) this._onChoice(index);
  }
}
