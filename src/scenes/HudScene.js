import {
  SCENE_HUD,
  EVT_RESOURCE_UPDATE, EVT_PARTY_UPDATE, EVT_ABILITY_USED,
  BASE_WIDTH, txt,
} from '../constants.js';

const BAR_W = 60; // wider bars now that we have 480px

export default class HudScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_HUD });
  }

  create() {
    this.add.rectangle(0, 0, BASE_WIDTH, 22, 0x000000, 0.8).setOrigin(0, 0);

    // Resource bars — spread across the wider 480px HUD
    this._timeFill   = this._makeBar(2,   2, BAR_W, 0x4fc3f7, 'TIME');
    this._bikeFill   = this._makeBar(72,  2, BAR_W, 0xef5350, 'BIKE');
    this._energyFill = this._makeBar(142, 2, BAR_W, 0x66bb6a, 'NRG');

    this._snackText = txt(this, 212, 2, 'S:5', { fontSize: '6px', color: '#f5e642' });
    this._moneyText = txt(this, 248, 2, '$20', { fontSize: '6px', color: '#f5a623' });

    // Party icons
    this._partyIcons = [];
    const members = [
      { id: 'warren',  label: 'W', color: 0xe74c3c },
      { id: 'mj',      label: 'M', color: 0x2ecc71 },
      { id: 'carsen',  label: 'C', color: 0x9b59b6 },
      { id: 'justin',  label: 'J', color: 0xf39c12 },
    ];
    members.forEach((m, i) => {
      const x = BASE_WIDTH - 10 - (members.length - i) * 20;
      const dot = this.add.circle(x, 11, 6, 0x333333);
      const t   = txt(this, x, 11, m.label, { fontSize: '6px', color: '#555555' }).setOrigin(0.5);
      this._partyIcons.push({ dot, t, color: m.color });
    });

    this.game.events.on(EVT_RESOURCE_UPDATE, this._onResourceUpdate, this);
    this.game.events.on(EVT_PARTY_UPDATE,    this._onPartyUpdate,    this);
    this.game.events.on(EVT_ABILITY_USED,    this._onAbilityUsed,    this);
  }

  _onResourceUpdate(resources) {
    this._timeFill.scaleX   = resources.time          / 100;
    this._bikeFill.scaleX   = resources.bikeCondition / 100;
    this._energyFill.scaleX = resources.energy        / 100;
    this._snackText.setText('S:' + resources.snacks);
    this._moneyText.setText('$' + resources.money);
    this._timeFill.setFillStyle(resources.time < 20          ? 0xff2222 : 0x4fc3f7);
    this._bikeFill.setFillStyle(resources.bikeCondition < 20 ? 0xff2222 : 0xef5350);
  }

  _onPartyUpdate(party) {
    const order = ['warren', 'mj', 'carsen', 'justin'];
    order.forEach((id, i) => {
      const icon = this._partyIcons[i];
      const active = party.includes(id);
      icon.dot.setFillStyle(active ? icon.color : 0x333333);
      icon.t.setColor(active ? '#ffffff' : '#555555');
    });
  }

  _onAbilityUsed({ abilityId }) {
    // Phase 7: animate cooldown indicator
    console.log(`[Hud] ability: ${abilityId}`);
  }

  _makeBar(x, y, width, color, label) {
    txt(this, x, y, label, { fontSize: '5px', color: '#999999' });
    this.add.rectangle(x, y + 9, width, 4, 0x333333).setOrigin(0, 0.5);
    return this.add.rectangle(x, y + 9, width, 4, color).setOrigin(0, 0.5);
  }

  shutdown() {
    this.game.events.off(EVT_RESOURCE_UPDATE, this._onResourceUpdate, this);
    this.game.events.off(EVT_PARTY_UPDATE,    this._onPartyUpdate,    this);
    this.game.events.off(EVT_ABILITY_USED,    this._onAbilityUsed,    this);
  }
}
