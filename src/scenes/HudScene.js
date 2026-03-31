import {
  SCENE_HUD,
  EVT_RESOURCE_UPDATE,
  EVT_PARTY_UPDATE,
  BASE_WIDTH,
} from '../constants.js';

// HudScene: always runs in parallel on top of the gameplay scene.
// It never reads game state directly — it only listens for events emitted
// by ResourceSystem and PartySystem and updates the display accordingly.
export default class HudScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_HUD });
  }

  create() {
    // Semi-transparent top bar background
    this.add.rectangle(0, 0, BASE_WIDTH, 16, 0x000000, 0.6).setOrigin(0, 0);

    // ── Resource bars (placeholders for Phase 2) ──────────────────────────────
    this._createBar(4, 3, 0x4fc3f7, 'TIME');     // blue  - time remaining
    this._createBar(68, 3, 0xef5350, 'BIKE');    // red   - bike condition
    this._createBar(132, 3, 0x66bb6a, 'ENERGY'); // green - energy

    // Snacks and money (simple counters)
    this._snackText = this.add.text(200, 3, 'SNACKS: 5', {
      fontFamily: 'monospace', fontSize: '6px', color: '#ffffff',
    });
    this._moneyText = this.add.text(255, 3, '$20', {
      fontFamily: 'monospace', fontSize: '6px', color: '#f5a623',
    });

    // ── Party member icons (placeholder dots) ─────────────────────────────────
    this._partyDots = [];
    const partyNames = ['W', 'M', 'C', 'J']; // Warren, MJ, Carsen, Justin
    partyNames.forEach((name, i) => {
      const x = BASE_WIDTH - 4 - (partyNames.length - i) * 14;
      const dot = this.add.circle(x, 8, 4, 0x444444);
      const label = this.add.text(x, 8, name, {
        fontFamily: 'monospace', fontSize: '5px', color: '#888888',
      }).setOrigin(0.5);
      this._partyDots.push({ dot, label, active: false });
    });

    // ── Listen for events from game systems ───────────────────────────────────
    // These are emitted by ResourceSystem (Phase 2) and PartySystem (Phase 3).
    // For now the HUD just shows placeholder values.
    this.game.events.on(EVT_RESOURCE_UPDATE, this._onResourceUpdate, this);
    this.game.events.on(EVT_PARTY_UPDATE, this._onPartyUpdate, this);
  }

  _createBar(x, y, color, label) {
    this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '5px', color: '#cccccc',
    });
    // Bar background
    this.add.rectangle(x, y + 6, 56, 4, 0x333333).setOrigin(0, 0.5);
    // Bar fill (stored so we can update its scaleX on resource events)
    const fill = this.add.rectangle(x, y + 6, 54, 2, color).setOrigin(0, 0.5);
    return fill;
  }

  _onResourceUpdate(resources) {
    // Will be wired up fully in Phase 2 when ResourceSystem is built.
    if (this._snackText) this._snackText.setText('SNACKS: ' + resources.snacks);
    if (this._moneyText) this._moneyText.setText('$' + resources.money);
  }

  _onPartyUpdate(party) {
    // Light up a dot for each recruited member.
    const memberOrder = ['warren', 'mj', 'carsen', 'justin'];
    memberOrder.forEach((id, i) => {
      const recruited = party.includes(id);
      this._partyDots[i].dot.setFillStyle(recruited ? 0xf5a623 : 0x444444);
      this._partyDots[i].label.setColor(recruited ? '#ffffff' : '#888888');
    });
  }

  destroy() {
    this.game.events.off(EVT_RESOURCE_UPDATE, this._onResourceUpdate, this);
    this.game.events.off(EVT_PARTY_UPDATE, this._onPartyUpdate, this);
  }
}
