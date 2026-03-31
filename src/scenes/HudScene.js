import {
  SCENE_HUD,
  EVT_RESOURCE_UPDATE,
  EVT_PARTY_UPDATE,
  EVT_ABILITY_USED,
  BASE_WIDTH,
} from '../constants.js';

// HudScene: always runs in parallel on top of the gameplay scene.
// Listens for events emitted by ResourceSystem, PartySystem, and AbilitySystem.
// Never reads game state directly — only reacts to events.

const BAR_W = 48; // width of each resource bar in pixels

export default class HudScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_HUD });
  }

  create() {
    // Semi-transparent top bar background
    this.add.rectangle(0, 0, BASE_WIDTH, 18, 0x000000, 0.75).setOrigin(0, 0);

    // ── Resource bars ─────────────────────────────────────────────────────────
    this._timeFill    = this._makeBar(2,  3, BAR_W, 0x4fc3f7, 'TIME');
    this._bikeFill    = this._makeBar(56, 3, BAR_W, 0xef5350, 'BIKE');
    this._energyFill  = this._makeBar(110, 3, BAR_W, 0x66bb6a, 'NRG');

    // Snacks and money counters
    this._snackText = this.add.text(165, 3, '🍪5', {
      fontFamily: 'monospace', fontSize: '6px', color: '#f5e642',
    });
    this._moneyText = this.add.text(192, 3, '$20', {
      fontFamily: 'monospace', fontSize: '6px', color: '#f5a623',
    });

    // ── Party icons ───────────────────────────────────────────────────────────
    this._partyIcons = [];
    const members = [
      { id: 'warren',  label: 'W', color: 0xe74c3c },
      { id: 'mj',     label: 'M', color: 0x2ecc71 },
      { id: 'carsen', label: 'C', color: 0x9b59b6 },
      { id: 'justin', label: 'J', color: 0xf39c12 },
    ];
    members.forEach((m, i) => {
      const x = BASE_WIDTH - 6 - (members.length - i) * 14;
      const dot  = this.add.circle(x, 9, 5, 0x333333);
      const text = this.add.text(x, 9, m.label, {
        fontFamily: 'monospace', fontSize: '5px', color: '#555555',
      }).setOrigin(0.5);
      this._partyIcons.push({ dot, text, color: m.color });
    });

    // ── Event listeners ───────────────────────────────────────────────────────
    this.game.events.on(EVT_RESOURCE_UPDATE, this._onResourceUpdate, this);
    this.game.events.on(EVT_PARTY_UPDATE,    this._onPartyUpdate,    this);
    this.game.events.on(EVT_ABILITY_USED,    this._onAbilityUsed,    this);
  }

  // ── Event handlers ────────────────────────────────────────────────────────────

  _onResourceUpdate(resources) {
    // Scale bars between 0 and full width based on 0–100 value
    this._timeFill.scaleX   = resources.time          / 100;
    this._bikeFill.scaleX   = resources.bikeCondition / 100;
    this._energyFill.scaleX = resources.energy        / 100;

    this._snackText.setText('🍪' + resources.snacks);
    this._moneyText.setText('$' + resources.money);

    // Flash bar red when critically low
    if (resources.time < 20) this._timeFill.setFillStyle(0xff2222);
    else this._timeFill.setFillStyle(0x4fc3f7);

    if (resources.bikeCondition < 20) this._bikeFill.setFillStyle(0xff2222);
    else this._bikeFill.setFillStyle(0xef5350);
  }

  _onPartyUpdate(party) {
    const order = ['warren', 'mj', 'carsen', 'justin'];
    order.forEach((id, i) => {
      const icon = this._partyIcons[i];
      const active = party.includes(id);
      icon.dot.setFillStyle(active ? icon.color : 0x333333);
      icon.text.setColor(active ? '#ffffff' : '#555555');
    });
  }

  _onAbilityUsed({ abilityId, cooldown }) {
    // Phase 7 will add animated cooldown indicators here
    console.log(`[HudScene] Ability used: ${abilityId}, cooldown: ${cooldown}ms`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  _makeBar(x, y, width, color, label) {
    // Label
    this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '5px', color: '#aaaaaa',
    });
    // Track (gray background)
    this.add.rectangle(x, y + 7, width, 4, 0x333333).setOrigin(0, 0.5);
    // Fill — origin at left edge so scaleX shrinks it from the right
    const fill = this.add.rectangle(x, y + 7, width, 4, color).setOrigin(0, 0.5);
    return fill;
  }

  // Clean up listeners when scene is destroyed
  shutdown() {
    this.game.events.off(EVT_RESOURCE_UPDATE, this._onResourceUpdate, this);
    this.game.events.off(EVT_PARTY_UPDATE,    this._onPartyUpdate,    this);
    this.game.events.off(EVT_ABILITY_USED,    this._onAbilityUsed,    this);
  }
}
