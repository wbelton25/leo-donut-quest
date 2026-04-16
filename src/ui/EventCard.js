import { BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';

// EventCard: an event overlay drawn directly into OregonTrailScene.
// Shows an Oregon Trail-style event card with title, description, and choice buttons.
// The card height auto-sizes to fit up to 4 choices without text overflow.
//
// Usage:
//   const card = new EventCard(scene);
//   card.show(event, onChoice);   // event = { title, description, choices[] }
//   // onChoice(choiceIndex) called after player picks

const CARD_W       = 300;
const TITLE_H      = 22;   // height of the title bar
const DESC_LINES   = 2;    // max lines reserved for description
const LINE_H       = 11;   // px per text line at 8px font
const BTN_H        = 20;   // height of each choice button
const BTN_GAP      = 3;    // gap between buttons
const PAD          = 8;    // inner padding (sides + top/bottom)

export default class EventCard {
  constructor(scene) {
    this._scene = scene;
    this._container = scene.add.container(0, 0).setDepth(30).setVisible(false);
    this._dynamicObjs = []; // objects rebuilt each show()
    this._onChoice = null;
    this._buildStatic();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  show(event, onChoice) {
    this._onChoice = onChoice;
    this._clearDynamic();

    const choices     = event.choices;
    const choiceCount = choices.length;

    // Compute card height to fit everything
    const descH  = DESC_LINES * LINE_H;
    const btnsH  = choiceCount * BTN_H + (choiceCount - 1) * BTN_GAP;
    const cardH  = TITLE_H + PAD + descH + PAD + btnsH + PAD;
    const cardX  = BASE_WIDTH  / 2;
    const cardY  = BASE_HEIGHT / 2 - cardH / 2;

    // ── Dynamic card background (sized per-show) ──────────────────────────────
    const cardBg = this._scene.add.rectangle(cardX, cardY + cardH / 2, CARD_W, cardH, 0x0a0a1a, 0.97);
    const border = this._scene.add.rectangle(cardX, cardY + cardH / 2, CARD_W, cardH, 0, 0)
      .setStrokeStyle(2, 0xf5e642);
    const titleBar = this._scene.add.rectangle(cardX, cardY + TITLE_H / 2, CARD_W, TITLE_H, 0x1a3a1a);

    const titleText = txt(this._scene, cardX, cardY + TITLE_H / 2, event.title.toUpperCase(), {
      fontSize: '8px', color: '#88ff88',
    }).setOrigin(0.5);

    const descText = txt(this._scene, cardX - CARD_W / 2 + PAD, cardY + TITLE_H + PAD, event.description, {
      fontSize: '8px', color: '#cccccc',
      wordWrap: { width: CARD_W - PAD * 2 },
    }).setOrigin(0, 0);

    this._container.add([cardBg, border, titleBar, titleText, descText]);
    this._dynamicObjs.push(cardBg, border, titleBar, titleText, descText);

    // ── Choice buttons ────────────────────────────────────────────────────────
    const btnAreaTop = cardY + TITLE_H + PAD + descH + PAD;
    const btnW       = CARD_W - PAD * 2;
    const btnLeft    = cardX - CARD_W / 2 + PAD;

    choices.forEach((choice, i) => {
      const by  = btnAreaTop + i * (BTN_H + BTN_GAP);
      const bcy = by + BTN_H / 2;

      const bg = this._scene.add.rectangle(cardX, bcy, btnW, BTN_H, 0x1a2a3a)
        .setInteractive({ useHandCursor: true });

      const label = txt(this._scene, btnLeft + 4, bcy, choice.text, {
        fontSize: '8px', color: '#f5e642',
        wordWrap: { width: btnW - 8 },
      }).setOrigin(0, 0.5);

      bg.on('pointerover', () => bg.setFillStyle(0x2a4a6a));
      bg.on('pointerout',  () => bg.setFillStyle(0x1a2a3a));
      bg.on('pointerdown', () => this._pick(i));

      this._container.add([bg, label]);
      this._dynamicObjs.push(bg, label);
    });

    this._container.setVisible(true);
  }

  hide() {
    this._clearDynamic();
    this._container.setVisible(false);
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  _buildStatic() {
    // Dark overlay — always full-screen, always behind card
    const overlay = this._scene.add.rectangle(
      BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.6,
    );
    this._container.add(overlay);
  }

  _clearDynamic() {
    this._dynamicObjs.forEach(o => o.destroy());
    this._dynamicObjs = [];
  }

  _pick(index) {
    this.hide();
    if (this._onChoice) this._onChoice(index);
  }
}
