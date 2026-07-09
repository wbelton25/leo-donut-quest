import { BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';
import { classifyChoice, stakesOf } from '../utils/choiceRisk.js';

// EventCard: an event overlay drawn directly into OregonTrailScene.
// Shows an Oregon Trail-style event card with title, description, and choice
// buttons. Everything is measured and laid out to fit — the description and each
// button size to their real (wrapped) text height, and the whole card scales down
// if it would ever run past the screen edges.
//
// Usage:
//   const card = new EventCard(scene);
//   card.show(event, onChoice);   // event = { title, description, choices[] }
//   // onChoice(choiceIndex) called after player picks

const CARD_W   = 300;
const TITLE_H  = 22;   // height of the title bar
const BTN_GAP  = 3;    // gap between buttons
const PAD      = 8;    // inner padding (sides + top/bottom)
const BTN_PAD  = 4;    // padding inside each choice button
const MAX_H    = 264;  // card scales down if it would exceed this (screen is 270)

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

    const choices      = event.choices;
    const showPreviews = choices.some(c => c.effects && Object.keys(c.effects).length > 0);
    const innerW       = CARD_W - PAD * 2;   // text wrap width inside the card
    const localLeft    = -CARD_W / 2 + PAD;  // x of left-aligned text (card is centered at 0)

    // Everything goes in one card container we can position + scale as a unit,
    // leaving the full-screen dimmer (built once, in the root) untouched.
    const card = this._scene.add.container(0, 0);

    // 1. Description — measure its wrapped height.
    const descText = txt(this._scene, localLeft, TITLE_H + PAD, event.description, {
      fontSize: '8px', color: '#cccccc', wordWrap: { width: innerW },
    }).setOrigin(0, 0);
    const descH = descText.height;

    // 2. Build each choice's label (+ preview) and size its button to fit.
    let by = TITLE_H + PAD + descH + PAD;   // running y for button tops
    const btnW = CARD_W - PAD * 2;
    const content = [];                     // button pieces, in bottom-to-top draw order
    choices.forEach((choice, i) => {
      const label = txt(this._scene, localLeft + 4, 0, choice.text, {
        fontSize: '8px', color: '#f5e642', wordWrap: { width: btnW - 8 },
      }).setOrigin(0, 0);

      let preview = null;
      if (showPreviews) {
        const p = this._effectPreview(choice);
        preview = txt(this._scene, localLeft + 4, 0, p.text, {
          fontSize: '8px', color: p.color, wordWrap: { width: btnW - 8 },
        }).setOrigin(0, 0);
      }

      const h = BTN_PAD + label.height + (preview ? 2 + preview.height : 0) + BTN_PAD;
      const bg = this._scene.add.rectangle(0, by + h / 2, btnW, h, 0x1a2a3a)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0x2a4a6a));
      bg.on('pointerout',  () => bg.setFillStyle(0x1a2a3a));
      bg.on('pointerdown', () => this._pick(i));

      label.setPosition(localLeft + 4, by + BTN_PAD);
      if (preview) preview.setPosition(localLeft + 4, by + h - BTN_PAD - preview.height);

      content.push(bg, label);           // bg first so the label draws on top
      if (preview) content.push(preview);
      by += h + BTN_GAP;
    });

    const cardH = by - BTN_GAP + PAD;   // total height (drop the trailing gap, add bottom pad)

    // 3. Assemble bottom-to-top: bg, border, title bar, buttons, description, title.
    const cardBg   = this._scene.add.rectangle(0, cardH / 2, CARD_W, cardH, 0x0a0a1a, 0.97);
    const border   = this._scene.add.rectangle(0, cardH / 2, CARD_W, cardH, 0, 0).setStrokeStyle(2, 0xf5e642);
    const titleBar = this._scene.add.rectangle(0, TITLE_H / 2, CARD_W, TITLE_H, 0x1a3a1a);
    const titleTxt = txt(this._scene, 0, TITLE_H / 2, event.title.toUpperCase(), {
      fontSize: '8px', color: '#88ff88',
    }).setOrigin(0.5);
    card.add([cardBg, border, titleBar, ...content, descText, titleTxt]);

    // 4. Scale down if too tall, and center vertically.
    const scale   = Math.min(1, MAX_H / cardH);
    const scaledH = cardH * scale;
    card.setPosition(BASE_WIDTH / 2, (BASE_HEIGHT - scaledH) / 2).setScale(scale);

    this._container.add(card);
    this._dynamicObjs.push(card);
    this._container.setVisible(true);
  }

  hide() {
    this._clearDynamic();
    this._container.setVisible(false);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  // Risk "vibe" shown under each choice — deliberately no exact numbers. It tells
  // the player how big a gamble the choice is and what's on the line; the real
  // result is rolled and revealed only after they commit.
  _effectPreview(choice) {
    const profile = classifyChoice(choice);
    const stakes  = stakesOf(choice);
    const hint    = stakes.length ? ` (${stakes.slice(0, 3).join(' / ')})` : '';
    switch (profile) {
      case 'gamble': return { text: 'Big gamble - a rider might bail',            color: '#ff5555' };
      case 'risky':  return { text: `Risky - could pay off or backfire${hint}`,   color: '#ffa077' };
      case 'skill':  return { text: `Skilled - usually reliable${hint}`,          color: '#88cc88' };
      default:       return hint
        ? { text: `Safe & steady${hint}`, color: '#99bbaa' }
        : { text: 'Safe & steady - no real cost', color: '#77bb99' };
    }
  }

  _buildStatic() {
    // Dark overlay — always full-screen, always behind the card, never scaled.
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
