import {
  SCENE_DONUT_SHOP, SCENE_RETURN_JOURNEY, SCENE_HUD,
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

    this._donuts     = 0;
    this._tierQtys   = new Array(DONUT_TIERS.length).fill(0);
    this._refreshFns = [];

    // Hide the HUD — it covers the shop header and isn't needed here
    this.scene.sleep(SCENE_HUD);

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

    // Donut tier rows (stackable +/-)
    this._buildDonutTiers();

    // Order button
    this._buildOrderButton();

    txt(this, BASE_WIDTH / 2, BASE_HEIGHT - 8, 'BUY AS MANY AS YOU WANT  —  THEN CONFIRM', {
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
    const CARD_W = 300;
    const CARD_X = (BASE_WIDTH - CARD_W) / 2;
    const startY = Math.round(BASE_HEIGHT * 0.56);

    // Card background
    this.add.rectangle(
      BASE_WIDTH / 2, startY + DONUT_TIERS.length * 20 / 2,
      CARD_W, DONUT_TIERS.length * 20 + 8, 0x0a0a18,
    );

    DONUT_TIERS.forEach((tier, i) => {
      const rowY      = startY + i * 20;
      const canAfford = () => this._resources.money >= tier.cost;

      this.add.rectangle(BASE_WIDTH / 2, rowY + 9, CARD_W - 4, 18, 0x0a0f1a);
      const lbl  = txt(this, CARD_X + 8,   rowY + 9, tier.label,    { fontSize: '8px', color: '#cccccc' }).setOrigin(0, 0.5);
      const cost = txt(this, CARD_X + 150,  rowY + 9, `$${tier.cost} each`, { fontSize: '8px', color: '#f5a623' }).setOrigin(0, 0.5);

      const minusBtn = this.add.rectangle(CARD_X + CARD_W - 52, rowY + 9, 14, 14, 0x1a1a2a).setInteractive({ useHandCursor: true });
      const minusLbl = txt(this, CARD_X + CARD_W - 52, rowY + 9, '-', { fontSize: '8px', color: '#cccccc' }).setOrigin(0.5);
      const qtyLbl   = txt(this, CARD_X + CARD_W - 36, rowY + 9, '0', { fontSize: '8px', color: '#ffffff' }).setOrigin(0.5);
      const plusBtn  = this.add.rectangle(CARD_X + CARD_W - 20, rowY + 9, 14, 14, 0x1a1a2a).setInteractive({ useHandCursor: true });
      const plusLbl  = txt(this, CARD_X + CARD_W - 20, rowY + 9, '+', { fontSize: '8px', color: '#88ff88' }).setOrigin(0.5);

      const refresh = () => {
        const qty = this._tierQtys[i];
        qtyLbl.setText(String(qty));
        const ok = canAfford();
        plusBtn.setFillStyle(ok ? 0x1a3a1a : 0x111111);
        plusLbl.setColor(ok ? '#88ff88' : '#444444');
        if (ok) plusBtn.setInteractive({ useHandCursor: true });
        else    plusBtn.removeInteractive();
        minusBtn.setFillStyle(qty > 0 ? 0x2a1a1a : 0x111111);
        minusLbl.setColor(qty > 0 ? '#ff8888' : '#444444');
        if (qty > 0) minusBtn.setInteractive({ useHandCursor: true });
        else         minusBtn.removeInteractive();
      };

      plusBtn.on('pointerdown', () => {
        if (!canAfford()) return;
        this._resources.applyChanges({ money: -tier.cost });
        this._tierQtys[i]++;
        this._refreshAll();
      });
      minusBtn.on('pointerdown', () => {
        if (this._tierQtys[i] <= 0) return;
        this._resources.applyChanges({ money: tier.cost }); // refund
        this._tierQtys[i]--;
        this._refreshAll();
      });

      this._refreshFns.push(refresh);
    });
  }

  _buildOrderButton() {
    const bx = BASE_WIDTH / 2;
    const by = BASE_HEIGHT * 0.9;

    this._orderBtn    = this.add.rectangle(bx, by, 220, 22, 0x3a2a1a);
    this._orderBtnLbl = txt(this, bx, by, 'SELECT DONUTS ABOVE', {
      fontSize: '8px', color: '#666666',
    }).setOrigin(0.5);

    this._orderBtn.on('pointerover', () => { if (this._getTotalDonuts() > 0) this._orderBtn.setFillStyle(0xaa5520); });
    this._orderBtn.on('pointerout',  () => { if (this._getTotalDonuts() > 0) this._orderBtn.setFillStyle(0x8b4513); });
    this._orderBtn.on('pointerdown', () => {
      const total = this._getTotalDonuts();
      if (total <= 0) return;
      this._donuts = total;
      this._startReturn();
    });
  }

  _getTotalDonuts() {
    return DONUT_TIERS.reduce((sum, tier, i) => sum + tier.count * this._tierQtys[i], 0);
  }

  _refreshAll() {
    this._refreshFns.forEach(r => r());
    this._moneyDisplay.setText(`MONEY: $${this._resources.money}`);
    const total = this._getTotalDonuts();
    if (total > 0) {
      this._orderBtnLbl.setText(`ORDER ${total} DONUT${total === 1 ? '' : 'S'}  →`).setColor('#f5e642');
      this._orderBtn.setFillStyle(0x8b4513).setInteractive({ useHandCursor: true });
    } else {
      this._orderBtnLbl.setText('SELECT DONUTS ABOVE').setColor('#666666');
      this._orderBtn.setFillStyle(0x3a2a1a).removeInteractive();
    }
  }

  _startReturn() {
    this.scene.wake(SCENE_HUD);
    this.cameras.main.fade(500, 0, 0, 0);
    this.time.delayedCall(520, () => {
      this.scene.start(SCENE_RETURN_JOURNEY, {
        party:     this._party.getParty(),
        donuts:    this._donuts,
        resources: this._resources.getAll(),
      });
    });
  }

  _refreshMoney() {
    this._moneyDisplay.setText(`MONEY: $${this._resources.money}`);
    this._refreshFns.forEach(r => r());
  }
}
