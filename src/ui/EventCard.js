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

    // Taller buttons (with a second "cost / risk" preview line) whenever any choice
    // actually carries effects — so the player can weigh safe vs. fast/risky.
    const showPreviews = choices.some(c => c.effects && Object.keys(c.effects).length > 0);
    const btnH = showPreviews ? 34 : BTN_H;

    // Compute card height to fit everything
    const descH  = DESC_LINES * LINE_H;
    const btnsH  = choiceCount * btnH + (choiceCount - 1) * BTN_GAP;
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
      const by  = btnAreaTop + i * (btnH + BTN_GAP);
      const bcy = by + btnH / 2;

      const bg = this._scene.add.rectangle(cardX, bcy, btnW, btnH, 0x1a2a3a)
        .setInteractive({ useHandCursor: true });
      this._container.add(bg);
      this._dynamicObjs.push(bg);

      if (showPreviews) {
        // Choice text at the top, cost/risk preview at the bottom.
        const label = txt(this._scene, btnLeft + 4, by + 3, choice.text, {
          fontSize: '8px', color: '#f5e642', wordWrap: { width: btnW - 8 },
        }).setOrigin(0, 0);
        const preview = this._effectPreview(choice);
        const prev = txt(this._scene, btnLeft + 4, by + btnH - 3, preview.text, {
          fontSize: '8px', color: preview.color, wordWrap: { width: btnW - 8 },
        }).setOrigin(0, 1);
        this._container.add([label, prev]);
        this._dynamicObjs.push(label, prev);
      } else {
        const label = txt(this._scene, btnLeft + 4, bcy, choice.text, {
          fontSize: '8px', color: '#f5e642', wordWrap: { width: btnW - 8 },
        }).setOrigin(0, 0.5);
        this._container.add(label);
        this._dynamicObjs.push(label);
      }

      bg.on('pointerover', () => bg.setFillStyle(0x2a4a6a));
      bg.on('pointerout',  () => bg.setFillStyle(0x1a2a3a));
      bg.on('pointerdown', () => this._pick(i));
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

  // Compact "what this choice costs / risks" line shown under each choice, so the
  // player can weigh a safe option against a faster/riskier one.
  _effectPreview(choice) {
    const e = choice.effects ?? {};
    const parts = [];
    if (e.time)          parts.push(`${e.time} time`);                              // time is a cost (<=0)
    if (e.energy)        parts.push(`${e.energy > 0 ? '+' : ''}${e.energy} energy`);
    if (e.bikeCondition) parts.push(`${e.bikeCondition > 0 ? '+' : ''}${e.bikeCondition} bike`);
    if (e.distance)      parts.push(`+${e.distance} ahead`);
    if (e.money)         parts.push(`${e.money > 0 ? '+$' : '-$'}${Math.abs(e.money)}`);
    if (e.snacks)        parts.push(`${e.snacks > 0 ? '+' : ''}${e.snacks} snack`);

    if (e.partyLossRisk) {
      const pct = Math.round(e.partyLossRisk * 100);
      const lead = parts.length ? parts.join(', ') + '   ' : '';
      return { text: `${lead}RISK ${pct}%: may lose a rider`, color: '#ff5555' };
    }
    if (parts.length === 0) return { text: 'safe - no cost', color: '#77bb99' };

    const good = (e.energy > 0 ? e.energy : 0) + (e.bikeCondition > 0 ? e.bikeCondition : 0)
               + (e.distance || 0) / 20 + (e.money > 0 ? e.money : 0);
    const bad  = (e.energy < 0 ? -e.energy : 0) + (e.bikeCondition < 0 ? -e.bikeCondition : 0);
    const color = bad > good ? '#ffa077' : good > 0 ? '#88cc88' : '#99aabb';
    return { text: parts.join(', '), color };
  }

  _pick(index) {
    this.hide();
    if (this._onChoice) this._onChoice(index);
  }
}
