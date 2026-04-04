import {
  SCENE_DONUT_SHOP, SCENE_DIALOGUE, SCENE_TITLE,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';

// ── Shop prices ───────────────────────────────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'snack',  label: 'BUY SNACK',   cost: 5,  effects: { snacks: 1 },              desc: '+1 Snack' },
  { id: 'repair', label: 'PATCH BIKE',  cost: 10, effects: { bikeCondition: 30 },       desc: '+30 Bike' },
  { id: 'energy', label: 'ENERGY DRINK',cost: 8,  effects: { energy: 25 },              desc: '+25 NRG'  },
];

export default class DonutShopScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_DONUT_SHOP });
  }

  init(data) {
    this._initData = data ?? {};
  }

  create() {
    // ── Systems ───────────────────────────────────────────────────────────────
    this._resources = new ResourceSystem(this.game);
    this._party     = new PartySystem(this.game);
    if (this._initData.resources) {
      this._resources.restoreFromSave(this._initData.resources);
    }
    if (this._initData.party) {
      this._initData.party.forEach(id => this._party.addMember(id));
    }
    this.game.registry.set('resources', this._resources);
    this.game.registry.set('party',     this._party);

    // ── Background — shop interior ────────────────────────────────────────────
    // Floor
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x2a1a0a);
    // Counter
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.45, BASE_WIDTH * 0.7, 18, 0x8b4513);
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.45 - 10, BASE_WIDTH * 0.7, 4, 0xa0522d);
    // Donut display cases behind counter
    for (let i = 0; i < 5; i++) {
      const cx = 80 + i * 70;
      this.add.rectangle(cx, BASE_HEIGHT * 0.3, 50, 40, 0x1a0a00);
      this.add.rectangle(cx, BASE_HEIGHT * 0.3, 46, 36, 0x2a1500).setStrokeStyle(1, 0x8b4513);
      // Donuts inside case
      for (let j = 0; j < 3; j++) {
        this.add.circle(cx - 14 + j * 14, BASE_HEIGHT * 0.3 + 4, 5, 0xf5a623);
        this.add.circle(cx - 14 + j * 14, BASE_HEIGHT * 0.3 + 4, 2, 0xd4420a);
      }
    }
    txt(this, BASE_WIDTH / 2, 12, "DONUT HOUSE", {
      fontSize: '16px', color: '#f5a623',
    }).setOrigin(0.5);
    txt(this, BASE_WIDTH / 2, 32, "TEGA CAY, SC", {
      fontSize: '8px', color: '#888888',
    }).setOrigin(0.5);

    // ── Party members along the wall ──────────────────────────────────────────
    this._drawParty();

    // ── Shop buttons ──────────────────────────────────────────────────────────
    this._btnObjects = [];
    this._buildShopButtons();

    // ── Order button ──────────────────────────────────────────────────────────
    this._buildOrderButton();

    // ── Controls hint ─────────────────────────────────────────────────────────
    txt(this, BASE_WIDTH / 2, BASE_HEIGHT - 10, 'CLICK TO BUY  •  ORDER DONUTS TO CONTINUE', {
      fontSize: '8px', color: '#556677',
    }).setOrigin(0.5);

    // Emit so HUD reflects arrival state
    this._resources.applyChanges({});
    this._party._emit();
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  _drawParty() {
    const party = this._party.getParty();
    const MEMBER_COLORS = {
      warren: 0xe74c3c, mj: 0x2ecc71, carson: 0x9b59b6, justin: 0xf39c12,
    };
    const MEMBER_NAMES = {
      warren: 'WARREN', mj: 'MJ', carson: 'CARSON', justin: 'JUSTIN',
    };
    const allMembers = ['warren', 'mj', 'carson', 'justin'];
    allMembers.forEach((id, i) => {
      const x = 60 + i * 95;
      const y = BASE_HEIGHT * 0.75;
      const color   = party.includes(id) ? (MEMBER_COLORS[id] ?? 0x888888) : 0x333333;
      const opacity = party.includes(id) ? 1 : 0.3;
      this.add.rectangle(x, y - 6,  10, 14, color).setAlpha(opacity);
      this.add.circle(x, y - 18, 6, color).setAlpha(opacity);
      txt(this, x, y + 6, MEMBER_NAMES[id], { fontSize: '8px', color: party.includes(id) ? '#ffffff' : '#444444' })
        .setOrigin(0.5);
    });
  }

  _buildShopButtons() {
    SHOP_ITEMS.forEach((item, i) => {
      const bx = BASE_WIDTH / 2 - 80 + i * 90;
      const by = BASE_HEIGHT * 0.58;
      this._makeShopButton(bx, by, item, i);
    });
  }

  _makeShopButton(x, y, item, index) {
    const canAfford = () => this._resources.money >= item.cost;

    const bg = this.add.rectangle(x, y, 80, 36, canAfford() ? 0x1a3a1a : 0x1a1a1a)
      .setInteractive({ useHandCursor: true });

    const label = txt(this, x, y - 10, item.label, {
      fontSize: '8px', color: canAfford() ? '#88ff88' : '#444444',
    }).setOrigin(0.5);

    const costLabel = txt(this, x, y + 2, `-$${item.cost}  ${item.desc}`, {
      fontSize: '8px', color: canAfford() ? '#f5a623' : '#333333',
    }).setOrigin(0.5);

    const refresh = () => {
      const ok = canAfford();
      bg.setFillStyle(ok ? 0x1a3a1a : 0x1a1a1a);
      label.setColor(ok ? '#88ff88' : '#444444');
      costLabel.setColor(ok ? '#f5a623' : '#333333');
      bg.setInteractive(ok ? { useHandCursor: true } : {});
    };

    bg.on('pointerover', () => { if (canAfford()) bg.setFillStyle(0x2a5a2a); });
    bg.on('pointerout',  () => refresh());
    bg.on('pointerdown', () => {
      if (!canAfford()) return;
      this._resources.applyChanges({ money: -item.cost, ...item.effects });
      this._showFloat(item.desc, x, y - 30);
      // Refresh all buttons since money changed
      this._btnObjects.forEach(r => r());
    });

    this._btnObjects.push(refresh);
  }

  _buildOrderButton() {
    const bx = BASE_WIDTH / 2;
    const by = BASE_HEIGHT * 0.88;

    const bg = this.add.rectangle(bx, by, 180, 24, 0x8b4513)
      .setInteractive({ useHandCursor: true });
    txt(this, bx, by, 'ORDER DONUTS  →', {
      fontSize: '8px', color: '#f5e642',
    }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0xaa5520));
    bg.on('pointerout',  () => bg.setFillStyle(0x8b4513));
    bg.on('pointerdown', () => {
      this.cameras.main.fade(500, 0, 0, 0);
      this.time.delayedCall(520, () => {
        // Phase 6 will replace this with FinalBossScene
        this.scene.start(SCENE_TITLE);
      });
    });
  }

  _showFloat(text, x, y) {
    const t = txt(this, x, y, text, { fontSize: '8px', color: '#88ff88' }).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: t, y: y - 24, alpha: 0, duration: 1000,
      onComplete: () => t.destroy(),
    });
  }
}
