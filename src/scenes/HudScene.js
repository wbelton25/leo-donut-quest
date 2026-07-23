import {
  SCENE_HUD,
  EVT_RESOURCE_UPDATE, EVT_PARTY_UPDATE, EVT_ABILITY_USED,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';
import AudioManager from '../systems/AudioManager.js';

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

    // SPARE bikes (lives) — replaces the old NRG bar, which never changed in Act 1.
    // Pips dim as you use up spare bikes; when you're out, breaking the bike ends the run.
    txt(this, 152, y, 'SPARE', { fontSize: '8px', color: '#8ac6ff' });
    this._lifePips = [];
    for (let i = 0; i < 3; i++) {
      this._lifePips.push(
        this.add.circle(200 + i * 13, y + 4, 4, 0x8ac6ff).setStrokeStyle(1, 0x33556a)
      );
    }

    // ── Fart recharge meter ───────────────────────────────────────────────────
    txt(this, 252, y, 'F', { fontSize: '8px', color: '#f5e642' });
    this.add.rectangle(262, y + 10, 36, 6, 0x3a3a1a).setOrigin(0, 0.5);
    this._fartFill = this.add.rectangle(262, y + 10, 34, 4, 0xf5e642).setOrigin(0, 0.5);
    this._fartCooldown = 0;   // ms; 0 means ready
    this._fartDuration = 0;

    // ── Money counter ─────────────────────────────────────────────────────────
    this._moneyText = txt(this, 308, y, '$50', { fontSize: '8px', color: '#f5a623' });

    // ── Settings button ───────────────────────────────────────────────────────
    this._settingsBtn = txt(this, 362, y, 'OPT', { fontSize: '8px', color: '#778899' })
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._openSettings())
      .on('pointerover', () => this._settingsBtn.setColor('#aabbcc'))
      .on('pointerout',  () => this._settingsBtn.setColor('#778899'));

    this._settingsOpen = false;
    this._settingsObjs = [];

    // Initialise registry defaults on first create.
    if (this.game.registry.get('audio-music') == null)
      this.game.registry.set('audio-music', true);
    if (this.game.registry.get('audio-sfx') == null)
      this.game.registry.set('audio-sfx', true);

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
    // Spare-bike (life) pips — light for available, dark for used.
    if (this._lifePips) {
      const lives = this.game.registry.get('gameState')?.bikeLives ?? 3;
      this._lifePips.forEach((p, i) => p.setFillStyle(i < lives ? 0x8ac6ff : 0x223240));
    }

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

  // ── Settings overlay ──────────────────────────────────────────────────────

  _openSettings() {
    if (this._settingsOpen) return;
    this._settingsOpen = true;
    this._settingsObjs = [];

    const cx = BASE_WIDTH / 2;
    const cy = BASE_HEIGHT - 54; // anchor panel near bottom
    const D  = 105; // panel depth base

    const push = (obj) => { this._settingsObjs.push(obj); return obj; };

    // Dim backdrop — absorbs clicks so they don't reach the game
    push(this.add.rectangle(cx, cy, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.78)
      .setDepth(D).setInteractive());

    // Panel
    push(this.add.rectangle(cx, cy, 176, 96, 0x0d1a26)
      .setDepth(D + 1).setStrokeStyle(1, 0x4fc3f7));

    // Title
    push(txt(this, cx, cy - 36, 'SETTINGS', { fontSize: '8px', color: '#4fc3f7' })
      .setOrigin(0.5).setDepth(D + 2));

    // ── Music row ──
    push(txt(this, cx - 56, cy - 12, 'MUSIC', { fontSize: '8px', color: '#cccccc' })
      .setOrigin(0, 0.5).setDepth(D + 2));

    const musicOn = !!this.game.registry.get('audio-music');
    this._settMusicBtn = push(
      txt(this, cx + 56, cy - 12, musicOn ? 'ON' : 'OFF',
        { fontSize: '8px', color: musicOn ? '#4fc3f7' : '#445566' })
        .setOrigin(1, 0.5).setDepth(D + 2)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this._settToggleMusic())
    );

    // ── SFX row ──
    push(txt(this, cx - 56, cy + 6, 'SFX', { fontSize: '8px', color: '#cccccc' })
      .setOrigin(0, 0.5).setDepth(D + 2));

    const sfxOn = !!this.game.registry.get('audio-sfx');
    this._settSfxBtn = push(
      txt(this, cx + 56, cy + 6, sfxOn ? 'ON' : 'OFF',
        { fontSize: '8px', color: sfxOn ? '#4fc3f7' : '#445566' })
        .setOrigin(1, 0.5).setDepth(D + 2)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this._settToggleSfx())
    );

    // ── Close button ──
    const closeBg = push(this.add.rectangle(cx, cy + 30, 72, 16, 0x1a2e40)
      .setDepth(D + 2).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._closeSettings())
      .on('pointerover', function() { this.setFillStyle(0x2a4e60); })
      .on('pointerout',  function() { this.setFillStyle(0x1a2e40); }));

    push(txt(this, cx, cy + 30, 'CLOSE', { fontSize: '8px', color: '#aaaaaa' })
      .setOrigin(0.5).setDepth(D + 3));
  }

  _closeSettings() {
    this._settingsObjs.forEach(o => o.destroy());
    this._settingsObjs = [];
    this._settingsOpen = false;
  }

  _settToggleMusic() {
    const on = !this.game.registry.get('audio-music');
    this.game.registry.set('audio-music', on);
    AudioManager.setMusicEnabled(this, on);
    this._settMusicBtn.setText(on ? 'ON' : 'OFF').setColor(on ? '#4fc3f7' : '#445566');
  }

  _settToggleSfx() {
    const on = !this.game.registry.get('audio-sfx');
    this.game.registry.set('audio-sfx', on);
    this._settSfxBtn.setText(on ? 'ON' : 'OFF').setColor(on ? '#4fc3f7' : '#445566');
  }

  shutdown() {
    this.game.events.off(EVT_RESOURCE_UPDATE, this._onResourceUpdate, this);
    this.game.events.off(EVT_PARTY_UPDATE,    this._onPartyUpdate,    this);
    this.game.events.off(EVT_ABILITY_USED,    this._onAbilityUsed,    this);
  }
}
