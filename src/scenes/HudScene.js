import {
  SCENE_HUD,
  EVT_RESOURCE_UPDATE, EVT_PARTY_UPDATE, EVT_ABILITY_USED,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';

// HudScene: persistent parallel scene, always on top.
// All text is 8px minimum — Press Start 2P is an 8px-grid font, smaller sizes blur.
// Layout: thin resource bar strip across the bottom edge of the screen.

const HUD_H  = 28;
const HUD_Y  = 0; // anchored to top

export default class HudScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_HUD });
  }

  create() {
    // ── Background strip ──────────────────────────────────────────────────────
    this.add.rectangle(0, HUD_Y, BASE_WIDTH, HUD_H, 0x000000, 0.85).setOrigin(0, 0);
    // Bottom border line
    this.add.rectangle(0, HUD_Y + HUD_H - 1, BASE_WIDTH, 1, 0x334455, 1).setOrigin(0, 0);

    const y = HUD_Y + 5; // top of text/bars inside the strip

    // ── Resource bars with 8px labels ────────────────────────────────────────
    // TIME — clock label only, no bar
    this._timeLabel = txt(this, 4, y, '3:00P', { fontSize: '8px', color: '#4fc3f7' });

    // BIKE bar (shifted left into the space the time bar used to occupy)
    txt(this, 52, y, 'BIKE', { fontSize: '8px', color: '#ef5350' });
    this.add.rectangle(88, y + 10, 56, 6, 0x4a1a1a).setOrigin(0, 0.5);
    this._bikeFill = this.add.rectangle(88, y + 10, 54, 4, 0xef5350).setOrigin(0, 0.5);

    // NRG bar
    txt(this, 152, y, 'NRG', { fontSize: '8px', color: '#66bb6a' });
    this.add.rectangle(188, y + 10, 56, 6, 0x1a3a1a).setOrigin(0, 0.5);
    this._energyFill = this.add.rectangle(188, y + 10, 54, 4, 0x66bb6a).setOrigin(0, 0.5);

    // ── Fart recharge meter ───────────────────────────────────────────────────
    txt(this, 252, y, 'F', { fontSize: '8px', color: '#f5e642' });
    this.add.rectangle(262, y + 10, 36, 6, 0x3a3a1a).setOrigin(0, 0.5);
    this._fartFill = this.add.rectangle(262, y + 10, 34, 4, 0xf5e642).setOrigin(0, 0.5);
    this._fartCooldown = 0;   // ms; 0 means ready
    this._fartDuration = 0;

    // ── Money counter ─────────────────────────────────────────────────────────
    this._moneyText = txt(this, 308, y, '$50', { fontSize: '8px', color: '#f5a623' });

    // ── Party member dots ─────────────────────────────────────────────────────
    // Four circles near the right edge — light up when that member joins
    this._partyIcons = [];
    const members = [
      { id: 'warren', color: 0xe74c3c },
      { id: 'mj',     color: 0x2ecc71 },
      { id: 'carson', color: 0x9b59b6 },
      { id: 'justin', color: 0xf39c12 },
    ];
    members.forEach((m, i) => {
      const x = BASE_WIDTH - 12 - (members.length - 1 - i) * 16;
      const dot = this.add.circle(x, HUD_Y + HUD_H / 2, 5, 0x222222);
      this._partyIcons.push({ dot, color: m.color, id: m.id });
    });

    // ── Event listeners ───────────────────────────────────────────────────────
    this.game.events.on(EVT_RESOURCE_UPDATE, this._onResourceUpdate, this);
    this.game.events.on(EVT_PARTY_UPDATE,    this._onPartyUpdate,    this);
    this.game.events.on(EVT_ABILITY_USED,    this._onAbilityUsed,    this);
  }

  _onResourceUpdate(r) {
    const clamp01 = v => Math.max(0, Math.min(1, v / 100));
    this._bikeFill.scaleX   = clamp01(r.bikeCondition);
    this._energyFill.scaleX = clamp01(r.energy);
    this._moneyText.setText('$' + r.money);

    // Clock: time=270 → 12:30 PM, time=120 → 3:00 PM (Act 1 hard stop), time=0 → 5:00 PM
    const minPast  = Math.round(270 - r.time);
    const totalMin = 12 * 60 + 30 + minPast;   // base: 12:30 PM in absolute minutes
    const h    = Math.floor(totalMin / 60);
    const m    = totalMin % 60;
    const h12  = h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? 'P' : 'A';
    const label = `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
    this._timeLabel.setText(label);

    const bikeColor  = r.bikeCondition < 25 ? 0xff3333 : 0xef5350;
    this._bikeFill.setFillStyle(bikeColor);
    // Red < 3:30 PM (time < 90), orange < 4:00 PM (time < 150), blue otherwise
    this._timeLabel.setColor(r.time < 90 ? '#ff3333' : r.time < 150 ? '#ffaa00' : '#4fc3f7');
  }

  _onPartyUpdate(party) {
    this._partyIcons.forEach(icon => {
      icon.dot.setFillStyle(party.includes(icon.id) ? icon.color : 0x222222);
    });
  }

  _onAbilityUsed({ abilityId, cooldown }) {
    if (abilityId === 'lightning_fart') {
      this._fartCooldown = Date.now() + cooldown;
      this._fartDuration = cooldown;
    }
  }

  update() {
    if (this._fartDuration > 0) {
      const remaining = this._fartCooldown - Date.now();
      const progress = remaining > 0 ? 1 - remaining / this._fartDuration : 1;
      this._fartFill.scaleX = Math.min(1, Math.max(0, progress));
      // Flash yellow when fully recharged
      if (progress >= 1) {
        this._fartFill.setFillStyle(0xf5e642);
      } else {
        this._fartFill.setFillStyle(0xa09020);
      }
    }
  }

  shutdown() {
    this.game.events.off(EVT_RESOURCE_UPDATE, this._onResourceUpdate, this);
    this.game.events.off(EVT_PARTY_UPDATE,    this._onPartyUpdate,    this);
    this.game.events.off(EVT_ABILITY_USED,    this._onAbilityUsed,    this);
  }
}
