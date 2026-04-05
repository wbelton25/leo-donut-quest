import { BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';

// WalmartShopCard: mid-ride gear shop overlay shown at the Walmart checkpoint.
// Similar to EventCard but persistent (multiple purchases) until player closes it.
// Time drains 1/sec while shopping to create mild urgency.

const CARD_W = 340;
const CARD_H = 190;
const CARD_X = (BASE_WIDTH - CARD_W) / 2;
const CARD_Y = (BASE_HEIGHT - CARD_H) / 2 - 10;

const WALMART_ITEMS = [
  { id: 'inner_tube', label: 'INNER TUBE',   cost: 8,  effects: { bikeCondition: 35 }, desc: '+35 BIKE'  },
  { id: 'energy_bar', label: 'ENERGY BARS',  cost: 5,  effects: { energy: 20 },        desc: '+20 NRG'   },
  { id: 'water',      label: 'WATER BOTTLE', cost: 3,  effects: { energy: 10 },        desc: '+10 NRG'   },
  { id: 'chain_lube', label: 'CHAIN LUBE',   cost: 6,  effects: { bikeCondition: 15 }, desc: '+15 BIKE'  },
  { id: 'snack_bag',  label: 'SNACK BAG',    cost: 7,  effects: { snacks: 2 },         desc: '+2 SNACKS' },
];

export default class WalmartShopCard {
  constructor(scene, resources) {
    this._scene     = scene;
    this._resources = resources;
    this._purchased = new Set();
    this._onClose   = null;
    this._drainEvent = null;
    this._container = scene.add.container(0, 0).setDepth(30).setVisible(false);
    this._itemRows  = [];
    this._moneyText = null;
    this._build();
  }

  show(onClose) {
    this._onClose   = onClose;
    this._purchased.clear();
    this._container.setVisible(true);
    this._refreshAll();
    // Time drains 1 per second while at Walmart
    this._drainEvent = this._scene.time.addEvent({
      delay: 1000, loop: true,
      callback: () => this._resources.applyChanges({ time: -1 }),
    });
  }

  hide() {
    if (this._drainEvent) { this._drainEvent.remove(); this._drainEvent = null; }
    this._container.setVisible(false);
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  _build() {
    // Overlay
    const overlay = this._scene.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.65);
    // Card bg
    const bg     = this._scene.add.rectangle(BASE_WIDTH / 2, CARD_Y + CARD_H / 2, CARD_W, CARD_H, 0x0a0a1a, 0.97);
    const border = this._scene.add.rectangle(BASE_WIDTH / 2, CARD_Y + CARD_H / 2, CARD_W, CARD_H, 0, 0)
      .setStrokeStyle(2, 0x4488ff);

    // Header bar
    this._scene.add.rectangle(BASE_WIDTH / 2, CARD_Y + 12, CARD_W, 22, 0x001a44);
    const title = txt(this._scene, BASE_WIDTH / 2, CARD_Y + 12, 'WALMART  —  GEAR UP!', {
      fontSize: '8px', color: '#4488ff',
    }).setOrigin(0.5);

    // Money display
    this._moneyText = txt(this._scene, BASE_WIDTH / 2, CARD_Y + 28, '', {
      fontSize: '8px', color: '#f5a623',
    }).setOrigin(0.5);

    this._container.add([overlay, bg, border, title, this._moneyText]);

    // Item rows
    WALMART_ITEMS.forEach((item, i) => {
      const rowY = CARD_Y + 44 + i * 22;
      this._buildItemRow(item, rowY);
    });

    // Continue button
    const contBg = this._scene.add.rectangle(BASE_WIDTH / 2, CARD_Y + CARD_H - 14, 160, 20, 0x1a3a1a)
      .setInteractive({ useHandCursor: true });
    const contLbl = txt(this._scene, BASE_WIDTH / 2, CARD_Y + CARD_H - 14, 'CONTINUE RIDING  →', {
      fontSize: '8px', color: '#88ff88',
    }).setOrigin(0.5);

    contBg.on('pointerover', () => contBg.setFillStyle(0x2a6a2a));
    contBg.on('pointerout',  () => contBg.setFillStyle(0x1a3a1a));
    contBg.on('pointerdown', () => {
      this.hide();
      if (this._onClose) this._onClose();
    });

    this._container.add([contBg, contLbl]);
  }

  _buildItemRow(item, y) {
    const canAfford = () => this._resources.money >= item.cost;
    const bought    = () => this._purchased.has(item.id);

    const rowBg = this._scene.add.rectangle(BASE_WIDTH / 2, y, CARD_W - 16, 18, 0x0f1a2a);

    const label = txt(this._scene, CARD_X + 14, y, item.label, {
      fontSize: '8px', color: '#cccccc',
    }).setOrigin(0, 0.5);

    const desc = txt(this._scene, CARD_X + 130, y, item.desc, {
      fontSize: '8px', color: '#88aacc',
    }).setOrigin(0, 0.5);

    const costLbl = txt(this._scene, CARD_X + 230, y, `$${item.cost}`, {
      fontSize: '8px', color: '#f5a623',
    }).setOrigin(0, 0.5);

    const btn = this._scene.add.rectangle(CARD_X + CARD_W - 36, y, 44, 14, 0x1a3a1a)
      .setInteractive({ useHandCursor: true });
    const btnLbl = txt(this._scene, CARD_X + CARD_W - 36, y, 'BUY', {
      fontSize: '8px', color: '#88ff88',
    }).setOrigin(0.5);

    const refresh = () => {
      const ok = canAfford() && !bought();
      rowBg.setFillStyle(bought() ? 0x0a1a0a : 0x0f1a2a);
      label.setColor(bought() ? '#446644' : '#cccccc');
      btn.setFillStyle(ok ? 0x1a3a1a : 0x111111);
      btnLbl.setText(bought() ? 'GOT IT' : 'BUY');
      btnLbl.setColor(ok ? '#88ff88' : (bought() ? '#446644' : '#444444'));
      if (ok) btn.setInteractive({ useHandCursor: true });
      else    btn.removeInteractive();
      this._moneyText.setText(`MONEY: $${this._resources.money}  (save some for donuts!)`);
    };

    btn.on('pointerover', () => { if (canAfford() && !bought()) btn.setFillStyle(0x2a5a2a); });
    btn.on('pointerout',  () => refresh());
    btn.on('pointerdown', () => {
      if (!canAfford() || bought()) return;
      this._resources.applyChanges({ money: -item.cost, ...item.effects });
      this._purchased.add(item.id);
      this._refreshAll();
    });

    this._container.add([rowBg, label, desc, costLbl, btn, btnLbl]);
    this._itemRows.push(refresh);
  }

  _refreshAll() {
    this._itemRows.forEach(r => r());
    this._moneyText.setText(`MONEY: $${this._resources.money}  (save some for donuts!)`);
  }
}
