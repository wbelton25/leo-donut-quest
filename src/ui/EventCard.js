import { BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';

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

    // Icon chip (top-left) — a glance-read of what KIND of trouble this is, for
    // pre-readers. Only on real events (>1 choice), not the single-button reveal card.
    if (choices.length > 1) {
      const chip = this._chipFor(`${event.title} ${event.id ?? ''}`);
      card.add(this._scene.add.rectangle(-CARD_W / 2 + 13, TITLE_H / 2, 16, 16, chip.bg).setStrokeStyle(1, chip.line));
      card.add(txt(this._scene, -CARD_W / 2 + 13, TITLE_H / 2, chip.glyph, { fontSize: '8px', color: chip.hex }).setOrigin(0.5));
    }

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

  // A short PLAIN hint under each choice — what it does, in kid-readable words.
  // No numbers, no risk tiers; a little luck still decides how it actually turns out.
  // A plain, MAGNITUDE-aware hint for each choice, with a reliable good→bad color so the
  // player can tell options apart: teal = a friend's easy move, green = good/cheap,
  // yellow = a real cost, orange = big cost / risky. (Choices are deterministic, so the
  // hint is exactly what happens.)
  _effectPreview(choice) {
    const e = choice.effects ?? {};
    const timeWord = v => { const a = -v; return a >= 15 ? 'costs a LOT of time' : a >= 7 ? 'costs some time' : 'costs a little time'; };
    const crewWord = v => { const a = -v; return a >= 15 ? 'wears the crew out'  : a >= 7 ? 'tires the crew'  : 'tires the crew a bit'; };
    const bikeWord = v => { const a = -v; return a >= 15 ? 'rough on the bikes'  : a >= 7 ? 'wears the bikes'  : 'scuffs the bikes'; };

    // A friend's skill move — always the quick, low-cost, smart pick. Flag it clearly.
    if (choice.requiresPartyMember) {
      return { text: 'quick + easy (a friend helps)', color: '#6fe0c8' };
    }

    const perks = [], costs = [];
    if (e.time > 0)          perks.push('saves time');
    if (e.bikeCondition > 0) perks.push('fixes bikes');
    if (e.energy > 0 || e.snacks > 0) perks.push('rests the crew');
    if (e.distance > 0)      perks.push('a shortcut!');
    if (e.money > 0)         perks.push('find cash');
    if (e.time < 0)          costs.push(timeWord(e.time));
    if (e.energy < 0)        costs.push(crewWord(e.energy));
    if (e.partyLossRisk)     costs.push('tires the crew');
    if (e.bikeCondition < 0) costs.push(bikeWord(e.bikeCondition));

    const uniq = [...new Set([...perks, ...costs])];
    const text = uniq.length ? uniq.join(', ') : 'safe — no cost';

    // Cost/perk score → reliable color (greener = better, oranger = worse).
    const cost = (e.time < 0 ? -e.time * 0.7 : 0) + (e.energy < 0 ? -e.energy : 0)
               + (e.partyLossRisk ? e.partyLossRisk * 40 : 0) + (e.bikeCondition < 0 ? -e.bikeCondition : 0);
    const perk = (e.bikeCondition > 0 ? e.bikeCondition : 0) + (e.energy > 0 ? e.energy : 0)
               + (e.distance > 0 ? 12 : 0) + (e.money > 0 ? 6 : 0) + (e.time > 0 ? 10 : 0);
    let color;
    if (perk >= cost)   color = '#7ee08a';   // net good — bright green
    else if (cost < 9)  color = '#b6d98a';   // cheap — light green
    else if (cost < 18) color = '#f0c04a';   // a real cost — yellow
    else                color = '#ff8866';   // big cost / risky — orange
    return { text, color };
  }

  // Categorize an event by keyword → a colored ASCII chip. Purely visual shorthand.
  _chipFor(text) {
    const t = text.toLowerCase();
    const has = (...w) => w.some(x => t.includes(x));
    if (has('bike', 'chain', 'tire', 'rim', 'part', 'wheel', 'handlebar', 'brake', 'flat'))
      return { glyph: '%', bg: 0x25252a, line: 0x888899, hex: '#aab0bb' };   // mechanical
    if (has('dog', 'deer', 'squirrel', 'ferret', 'parrot', 'cat', 'animal'))
      return { glyph: '!', bg: 0x3a2410, line: 0xff8844, hex: '#ffaa66' };   // animal
    if (has('rain', 'heat', 'wind', 'storm', 'sun'))
      return { glyph: '~', bg: 0x102a3a, line: 0x4488cc, hex: '#66aadd' };   // weather
    if (has('teacher', 'officer', 'police', 'parent', 'neighbor', 'crossing', 'adult', 'mom'))
      return { glyph: '?', bg: 0x2a1a3a, line: 0x9966cc, hex: '#bb88dd' };   // people
    if (has('shortcut', 'money', 'downhill', 'fountain', 'lucky', 'found', 'coast', 'water'))
      return { glyph: '$', bg: 0x1a3a1a, line: 0x66aa66, hex: '#88cc88' };   // opportunity
    return { glyph: '*', bg: 0x3a3a10, line: 0xccaa33, hex: '#f5e642' };     // misc
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
