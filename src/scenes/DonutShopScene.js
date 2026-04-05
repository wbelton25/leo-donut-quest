import {
  SCENE_DONUT_SHOP, SCENE_RETURN_JOURNEY,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';

// Donut pricing tiers
const DONUT_TIERS = [
  { count: 1,  cost: 3,  label: '1 DONUT',        color: 0xf5a623 },
  { count: 3,  cost: 8,  label: '3 DONUTS',        color: 0xf5a623 },
  { count: 6,  cost: 14, label: 'BOX  (6)',         color: 0xff8800 },
  { count: 12, cost: 24, label: 'DOZEN  (12)',      color: 0xff4400 },
];

const MEMBER_COLORS = { warren: 0xe74c3c, mj: 0x2ecc71, carson: 0x9b59b6, justin: 0xf39c12 };
const MEMBER_NAMES  = { warren: 'WARREN', mj: 'MJ', carson: 'CARSON', justin: 'JUSTIN' };

export default class DonutShopScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_DONUT_SHOP });
  }

  init(data) {
    this._initData = data ?? {};
  }

  create() {
    this._resources = new ResourceSystem(this.game);
    this._party     = new PartySystem(this.game);
    if (this._initData.resources) this._resources.restoreFromSave(this._initData.resources);
    if (this._initData.party)     this._initData.party.forEach(id => this._party.addMember(id));
    this.game.registry.set('resources', this._resources);
    this.game.registry.set('party',     this._party);

    this._donuts = 0;

    // ── Background ────────────────────────────────────────────────────────────
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x2a1a0a);
    // Counter
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.45, BASE_WIDTH * 0.7, 18, 0x8b4513);
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.45 - 10, BASE_WIDTH * 0.7, 4, 0xa0522d);
    // Display cases
    for (let i = 0; i < 5; i++) {
      const cx = 80 + i * 70;
      this.add.rectangle(cx, BASE_HEIGHT * 0.3, 50, 40, 0x1a0a00);
      this.add.rectangle(cx, BASE_HEIGHT * 0.3, 46, 36, 0x2a1500).setStrokeStyle(1, 0x8b4513);
      for (let j = 0; j < 3; j++) {
        this.add.circle(cx - 14 + j * 14, BASE_HEIGHT * 0.3 + 4, 5, 0xf5a623);
        this.add.circle(cx - 14 + j * 14, BASE_HEIGHT * 0.3 + 4, 2, 0xd4420a);
      }
    }
    txt(this, BASE_WIDTH / 2, 10, 'DONUT HOUSE', { fontSize: '16px', color: '#f5a623' }).setOrigin(0.5);
    txt(this, BASE_WIDTH / 2, 28, 'TEGA CAY, SC', { fontSize: '8px', color: '#888888' }).setOrigin(0.5);

    // Party members along the wall
    this._drawParty();

    // Money display
    this._moneyDisplay = txt(this, BASE_WIDTH / 2, BASE_HEIGHT * 0.52, '', {
      fontSize: '8px', color: '#f5a623',
    }).setOrigin(0.5);

    // Donut tier buttons
    this._buildDonutTiers();

    // Selection summary (updates as player picks)
    this._selectionText = txt(this, BASE_WIDTH / 2, BASE_HEIGHT * 0.82, 'SELECT YOUR ORDER', {
      fontSize: '8px', color: '#888888',
    }).setOrigin(0.5);

    // Order button (disabled until a tier selected)
    this._buildOrderButton();

    txt(this, BASE_WIDTH / 2, BASE_HEIGHT - 8, 'PICK AN ORDER, THEN CONFIRM', {
      fontSize: '8px', color: '#445566',
    }).setOrigin(0.5);

    this._refreshMoney();
    this._resources.applyChanges({});
    this._party._emit();
  }

  // ── Build helpers ─────────────────────────────────────────────────────────────

  _drawParty() {
    const party = this._party.getParty();
    const allMembers = ['warren', 'mj', 'carson', 'justin'];
    allMembers.forEach((id, i) => {
      const x = 60 + i * 95;
      const y = BASE_HEIGHT * 0.75;
      const inParty  = party.includes(id);
      const color    = inParty ? (MEMBER_COLORS[id] ?? 0x888888) : 0x333333;
      const alpha    = inParty ? 1 : 0.25;
      this.add.rectangle(x, y - 6,  10, 14, color).setAlpha(alpha);
      this.add.circle(x, y - 18, 6, color).setAlpha(alpha);
      txt(this, x, y + 6, MEMBER_NAMES[id], {
        fontSize: '8px', color: inParty ? '#ffffff' : '#444444',
      }).setOrigin(0.5);
    });
  }

  _buildDonutTiers() {
    this._tierBtns = [];
    DONUT_TIERS.forEach((tier, i) => {
      const bx = 60 + i * 100;
      const by = BASE_HEIGHT * 0.63;

      const canAfford = () => this._resources.money >= tier.cost;

      const bg = this.add.rectangle(bx, by, 88, 32, 0x1a1a2a)
        .setInteractive({ useHandCursor: true });
      const lbl = txt(this, bx, by - 8, tier.label, {
        fontSize: '8px', color: '#cccccc',
      }).setOrigin(0.5);
      const costLbl = txt(this, bx, by + 6, `$${tier.cost}`, {
        fontSize: '8px', color: '#f5a623',
      }).setOrigin(0.5);

      const refresh = () => {
        const ok = canAfford();
        bg.setFillStyle(ok ? 0x1a2a3a : 0x111111);
        lbl.setColor(ok ? '#ffffff' : '#444444');
        costLbl.setColor(ok ? '#f5a623' : '#333333');
        if (ok) bg.setInteractive({ useHandCursor: true });
        else    bg.removeInteractive();
      };

      bg.on('pointerover', () => { if (canAfford()) bg.setFillStyle(0x2a3a5a); });
      bg.on('pointerout',  () => refresh());
      bg.on('pointerdown', () => {
        if (!canAfford()) return;
        this._donuts = tier.count;
        this._selectionText.setText(`ORDER: ${tier.label}  for $${tier.cost}`);
        this._selectionText.setColor('#f5e642');
        this._orderBtn.setFillStyle(0x8b4513);
        this._orderBtn.setInteractive({ useHandCursor: true });
        this._orderBtnLbl.setColor('#f5e642');
        this._selectedTier = tier;
        // Highlight selected
        this._tierBtns.forEach(b => b.bg.setStrokeStyle(0, 0));
        bg.setStrokeStyle(2, 0xf5e642);
      });

      this._tierBtns.push({ bg, lbl, costLbl, refresh });
    });
  }

  _buildOrderButton() {
    const bx = BASE_WIDTH / 2;
    const by = BASE_HEIGHT * 0.9;

    this._orderBtn = this.add.rectangle(bx, by, 180, 22, 0x3a2a1a);
    this._orderBtnLbl = txt(this, bx, by, 'CONFIRM ORDER  →', {
      fontSize: '8px', color: '#666666',
    }).setOrigin(0.5);

    this._orderBtn.on('pointerover', () => { if (this._donuts > 0) this._orderBtn.setFillStyle(0xaa5520); });
    this._orderBtn.on('pointerout',  () => { if (this._donuts > 0) this._orderBtn.setFillStyle(0x8b4513); });
    this._orderBtn.on('pointerdown', () => {
      if (!this._donuts || !this._selectedTier) return;
      this._resources.applyChanges({ money: -this._selectedTier.cost });
      this._startReturn();
    });
  }

  _startReturn() {
    this.cameras.main.fade(500, 0, 0, 0);
    this.time.delayedCall(520, () => {
      this.scene.get(SCENE_DIALOGUE)?.showScript('return_journey', () => {
        this.cameras.main.fade(400, 0, 0, 0);
        this.time.delayedCall(420, () => {
          this.scene.start(SCENE_RETURN_JOURNEY, {
            party:     this._party.getParty(),
            donuts:    this._donuts,
            resources: this._resources.getAll(),
          });
        });
      });
    });
  }

  _refreshMoney() {
    this._moneyDisplay.setText(`YOUR MONEY: $${this._resources.money}  —  SPEND WISELY`);
    this._tierBtns?.forEach(b => b.refresh());
  }
}
