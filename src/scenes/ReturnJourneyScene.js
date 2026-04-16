import {
  SCENE_RETURN_JOURNEY, SCENE_BOSS_GAUNTLET, SCENE_DIALOGUE,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';

// ReturnJourneyScene: sunset cutscene — the crew rides home with donuts.
// No events, no input. Pure visual with auto-transition after RIDE_DURATION ms.

const RIDE_DURATION  = 7000;  // ms total ride length
const SCROLL_SPEED   = 70;    // slightly faster than outbound — urgency

const MEMBER_COLORS = {
  warren: 0xe74c3c, mj: 0x2ecc71, carson: 0x9b59b6, justin: 0xf39c12,
};

export default class ReturnJourneyScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_RETURN_JOURNEY });
  }

  init(data) {
    this._initData = data ?? {};
  }

  create() {
    const party   = this._initData.party   ?? [];
    const donuts  = this._initData.donuts  ?? 0;
    const elapsed = { ms: 0 };

    // ── Sunset sky ────────────────────────────────────────────────────────────
    // Gradient effect via two overlapping rectangles
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.3, BASE_WIDTH, BASE_HEIGHT * 0.6, 0xff7b35);
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.15, BASE_WIDTH, BASE_HEIGHT * 0.3, 0xffb347, 0.6);
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.6, BASE_WIDTH, BASE_HEIGHT * 0.4 + 4, 0x4a7a2a);

    // ── Silhouette treeline ────────────────────────────────────────────────────
    this._treeline  = this._buildTreeline(0x1a1a0a, BASE_HEIGHT * 0.44, 14);
    this._nearTrees = this._buildTreeline(0x111108, BASE_HEIGHT * 0.54, 9);

    // ── Road ──────────────────────────────────────────────────────────────────
    const roadY = BASE_HEIGHT * 0.62;
    const roadH = BASE_HEIGHT * 0.38;
    this.add.rectangle(BASE_WIDTH / 2, roadY + roadH / 2, BASE_WIDTH, roadH, 0x3a3a44);
    this._roadStripes = this._buildRoadStripes(roadY, roadH);

    // ── Bikers ────────────────────────────────────────────────────────────────
    this._buildBikers(party, donuts);

    // ── Progress bar (reversed: DONUT HOUSE → HOME) ───────────────────────────
    const barY = BASE_HEIGHT - 26;
    const barW = BASE_WIDTH - 40;
    txt(this, 20, barY - 4, 'DONUT HOUSE', { fontSize: '8px', color: '#f5a623' });
    txt(this, 20 + barW, barY - 4, 'HOME', { fontSize: '8px', color: '#888888' }).setOrigin(1, 0);
    this.add.rectangle(20 + barW / 2, barY, barW, 7, 0x1a1a2a);
    this._progressFill = this.add.rectangle(20 + barW, barY, 1, 5, 0xe74c3c).setOrigin(1, 0.5);
    this._barW = barW;

    // ── Auto-transition ───────────────────────────────────────────────────────
    this._elapsed = 0;
    this._done    = false;
    this._riding  = false;

    // Show return_journey dialogue, then start the ride
    this.time.delayedCall(200, () => {
      this.scene.get(SCENE_DIALOGUE).showScript('return_journey', () => {
        this._riding = true;
      });
    });
  }

  update(time, delta) {
    if (this._done || !this._riding) return;
    const dt = delta / 1000;
    this._elapsed += delta;

    this._scrollLayers(dt);

    const pct = Math.min(1, this._elapsed / RIDE_DURATION);
    this._progressFill.setSize(Math.max(1, (this._barW - 4) * (1 - pct)), 5);

    if (this._elapsed >= RIDE_DURATION) {
      this._done = true;
      this.cameras.main.fade(600, 0, 0, 0);
      this.time.delayedCall(620, () => {
        this.scene.start(SCENE_BOSS_GAUNTLET, {
          party:     this._initData.party   ?? [],
          donuts:    this._initData.donuts  ?? 0,
          resources: this._initData.resources ?? {},
        });
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  _scrollLayers(dt) {
    this._roadStripes.forEach(s => {
      s.x -= SCROLL_SPEED * dt;
      if (s.x < -30) s.x += BASE_WIDTH + 60;
    });
    this._nearTrees.forEach(t => {
      t.x -= SCROLL_SPEED * 0.55 * dt;
      if (t.x < -20) t.x += BASE_WIDTH + 40;
    });
    this._treeline.forEach(t => {
      t.x -= SCROLL_SPEED * 0.2 * dt;
      if (t.x < -20) t.x += BASE_WIDTH + 40;
    });
  }

  _buildTreeline(color, y, count) {
    const trees = [];
    for (let i = 0; i < count; i++) {
      const x = (i / count) * BASE_WIDTH + Math.random() * (BASE_WIDTH / count);
      const h = 22 + Math.random() * 18;
      const w = 9 + Math.random() * 8;
      trees.push(this.add.rectangle(x, y, w, h, color));
    }
    return trees;
  }

  _buildRoadStripes(roadY, roadH) {
    const stripes = [];
    for (let i = 0; i < 12; i++) {
      stripes.push(this.add.rectangle(i * 50 + 25, roadY + roadH / 2, 28, 3, 0xffcc44, 0.2));
    }
    return stripes;
  }

  _buildBikers(party, donuts) {
    const roadY      = BASE_HEIGHT * 0.62 + 10;
    const totalCount = 1 + party.length;
    const spacing    = 28;
    const startX     = BASE_WIDTH / 2 - ((totalCount - 1) * spacing) / 2;

    const all = [{ id: 'leo', color: 0x3b82f6 }];
    party.forEach(id => all.push({ id, color: MEMBER_COLORS[id] ?? 0x888888 }));

    all.forEach((m, i) => {
      const x = startX + i * spacing;
      const body   = this.add.rectangle(x, roadY - 6, 8, 10, m.color);
      const wheel1 = this.add.circle(x - 5, roadY, 5, 0x222222);
      const wheel2 = this.add.circle(x + 5, roadY, 5, 0x222222);
      this.tweens.add({ targets: [body, wheel1, wheel2], y: `+=2`, yoyo: true, repeat: -1, duration: 240 + Math.random() * 80 });
    });

    // Donut bag on Leo's back
    if (donuts > 0) {
      const leoX = startX;
      const bag = this.add.rectangle(leoX + 6, roadY - 8, 6, 6, 0xf5a623);
      txt(this, leoX + 6, roadY - 16, `×${donuts}`, { fontSize: '8px', color: '#f5a623' }).setOrigin(0.5);
    }
  }
}
