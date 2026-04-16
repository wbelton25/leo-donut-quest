import { BASE_WIDTH, BASE_HEIGHT, txt } from '../constants.js';

// WalmartShopCard: mid-ride gear shop at the Walmart checkpoint.
// Two sections: SNACKS and BIKE PARTS. Items are stackable (buy multiples).
// Purchases go into an inventory object — they are NOT applied immediately.
// The scene applies them when the player uses them (S key or critical repair card).
//
// Inventory shape (passed in by reference from OregonTrailScene):
//   snackInv:  { gatorade: N, granola: N, hotdog: N }
//   bikeInv:   { patch: N, tire: N, chain: N }

const CARD_W = 300;
const CARD_X = (BASE_WIDTH - CARD_W) / 2;
const CARD_Y = 34; // sits just below the HUD strip

const SNACK_ITEMS = [
  { id: 'gatorade', label: 'GATORADE',    cost: 1, desc: '+33 STAMINA', inv: 'snackInv' },
  { id: 'granola',  label: 'GRANOLA BAR', cost: 2, desc: '+67 STAMINA', inv: 'snackInv' },
  { id: 'hotdog',   label: 'HOT DOG',     cost: 3, desc: 'FULL STAMINA', inv: 'snackInv' },
];

const BIKE_ITEMS = [
  { id: 'patch', label: 'TIRE PATCH', cost: 1, desc: '+33 BIKE', inv: 'bikeInv' },
  { id: 'tire',  label: 'NEW TIRE',   cost: 2, desc: '+67 BIKE', inv: 'bikeInv' },
  { id: 'chain', label: 'NEW CHAIN',  cost: 3, desc: 'FULL BIKE', inv: 'bikeInv' },
];

export default class WalmartShopCard {
  constructor(scene, resources, snackInv, bikeInv) {
    this._scene     = scene;
    this._resources = resources;
    this._snackInv  = snackInv;
    this._bikeInv   = bikeInv;
    this._onClose   = null;
    this._drainEvent = null;

    this._container  = scene.add.container(0, 0).setDepth(30).setVisible(false);
    this._refreshFns = [];
    this._moneyText  = null;
    this._build();
  }

  show(onClose) {
    this._onClose = onClose;
    this._container.setVisible(true);
    this._refreshAll();
    // Time drains 2 per second while shopping — mild pressure to not linger
    this._drainEvent = this._scene.time.addEvent({
      delay: 1000, loop: true,
      callback: () => this._resources.applyChanges({ time: -2 }),
    });
  }

  hide() {
    if (this._drainEvent) { this._drainEvent.remove(); this._drainEvent = null; }
    this._container.setVisible(false);
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  _build() {
    // money(16) + gap(8) + 3 snack rows(60) + gap(8) + 3 bike rows(60) + gap(8) + footer(20) + padding(8)
    const cardH = 16 + 8 + 60 + 8 + 60 + 8 + 20 + 8;

    // Dark overlay
    const overlay = this._scene.add.rectangle(
      BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.72,
    );
    // Card bg + border
    const bg     = this._scene.add.rectangle(BASE_WIDTH / 2, CARD_Y + cardH / 2, CARD_W, cardH, 0x080c18, 0.98);
    const border = this._scene.add.rectangle(BASE_WIDTH / 2, CARD_Y + cardH / 2, CARD_W, cardH, 0, 0)
      .setStrokeStyle(2, 0x4488ff);

    // Money
    this._moneyText = txt(this._scene, BASE_WIDTH / 2, CARD_Y + 10, '', { fontSize: '8px', color: '#f5a623' }).setOrigin(0.5);

    this._container.add([overlay, bg, border]);

    // ── SNACKS rows ───────────────────────────────────────────────────────────
    let curY = CARD_Y + 24;
    SNACK_ITEMS.forEach(item => {
      this._buildRow(item, curY, this._snackInv);
      curY += 20;
    });

    curY += 8;

    // ── BIKE PARTS rows ───────────────────────────────────────────────────────
    BIKE_ITEMS.forEach(item => {
      this._buildRow(item, curY, this._bikeInv);
      curY += 20;
    });

    curY += 8;

    // ── Continue button ───────────────────────────────────────────────────────
    const contBg = this._scene.add.rectangle(BASE_WIDTH / 2, curY + 10, 180, 20, 0x1a3a1a)
      .setInteractive({ useHandCursor: true });
    const contLbl = txt(this._scene, BASE_WIDTH / 2, curY + 10, 'CONTINUE RIDING  →', {
      fontSize: '8px', color: '#88ff88',
    }).setOrigin(0.5);

    contBg.on('pointerover', () => contBg.setFillStyle(0x2a6a2a));
    contBg.on('pointerout',  () => contBg.setFillStyle(0x1a3a1a));
    contBg.on('pointerdown', () => { this.hide(); if (this._onClose) this._onClose(); });
    this._container.add([contBg, contLbl, this._moneyText]);
  }

  _buildRow(item, y, inv) {
    const canAfford = () => this._resources.money >= item.cost;

    const rowBg  = this._scene.add.rectangle(BASE_WIDTH / 2, y + 9, CARD_W - 4, 18, 0x0a0f1a);
    const lbl    = txt(this._scene, CARD_X + 8,   y + 9, item.label, { fontSize: '8px', color: '#cccccc' }).setOrigin(0, 0.5);
    const desc   = txt(this._scene, CARD_X + 110,  y + 9, item.desc,  { fontSize: '8px', color: '#778899' }).setOrigin(0, 0.5);
    const cost   = txt(this._scene, CARD_X + 200,  y + 9, `$${item.cost}`, { fontSize: '8px', color: '#f5a623' }).setOrigin(0, 0.5);

    // Minus / qty / plus
    const minusBtn = this._scene.add.rectangle(CARD_X + CARD_W - 52, y + 9, 14, 14, 0x1a1a2a).setInteractive({ useHandCursor: true });
    const minusLbl = txt(this._scene, CARD_X + CARD_W - 52, y + 9, '-', { fontSize: '8px', color: '#cccccc' }).setOrigin(0.5);
    const qtyLbl   = txt(this._scene, CARD_X + CARD_W - 36, y + 9, '0', { fontSize: '8px', color: '#ffffff' }).setOrigin(0.5);
    const plusBtn  = this._scene.add.rectangle(CARD_X + CARD_W - 20, y + 9, 14, 14, 0x1a1a2a).setInteractive({ useHandCursor: true });
    const plusLbl  = txt(this._scene, CARD_X + CARD_W - 20, y + 9, '+', { fontSize: '8px', color: '#88ff88' }).setOrigin(0.5);

    const refresh = () => {
      const qty = inv[item.id] ?? 0;
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
      this._moneyText.setText(`MONEY: $${this._resources.money}  (save some for donuts!)`);
    };

    plusBtn.on('pointerdown', () => {
      if (!canAfford()) return;
      this._resources.applyChanges({ money: -item.cost });
      inv[item.id] = (inv[item.id] ?? 0) + 1;
      this._refreshAll();
    });
    minusBtn.on('pointerdown', () => {
      if ((inv[item.id] ?? 0) <= 0) return;
      this._resources.applyChanges({ money: item.cost }); // refund
      inv[item.id] -= 1;
      this._refreshAll();
    });

    this._container.add([rowBg, lbl, desc, cost, minusBtn, minusLbl, qtyLbl, plusBtn, plusLbl]);
    this._refreshFns.push(refresh);
  }

  _refreshAll() {
    this._refreshFns.forEach(r => r());
    this._moneyText?.setText(`MONEY: $${this._resources.money}  (save some for donuts!)`);
  }
}
