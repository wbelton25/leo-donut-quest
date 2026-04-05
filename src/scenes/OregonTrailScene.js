import {
  SCENE_OREGON_TRAIL, SCENE_DIALOGUE, SCENE_GAME_OVER, SCENE_DONUT_SHOP,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';
import EventSystem from '../systems/EventSystem.js';
import EventCard from '../ui/EventCard.js';
import WalmartShopCard from '../ui/WalmartShopCard.js';

// ── Ride constants ────────────────────────────────────────────────────────────
const TOTAL_DISTANCE  = 1000;
const SCROLL_SPEED    = 55;    // px/s for road layer
const DRAIN_INTERVAL  = 5000;  // ms between passive drains
const EVENT_INTERVAL  = 9000;  // ms base between random events
const EVENT_JITTER    = 3000;  // ±ms randomness

// Distance thresholds for landmarks (must be in ascending order)
const CHECKPOINTS = [
  { distance: 150, id: 'school',    label: 'TEGA CAY ELEMENTARY', dialogue: 'checkpoint_school', isShop: false },
  { distance: 380, id: 'walmart',   label: 'WALMART',             dialogue: null,                isShop: true  },
  { distance: 580, id: 'tire',      label: 'TIRE STORE',          dialogue: 'checkpoint_tire',   isShop: false },
  { distance: 780, id: 'petsupply', label: 'PET SUPPLY STORE',    dialogue: 'checkpoint_petsupply', isShop: false, autoEffect: { energy: -5 } },
];

const MEMBER_COLORS = {
  warren: 0xe74c3c, mj: 0x2ecc71, carson: 0x9b59b6, justin: 0xf39c12,
};

export default class OregonTrailScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_OREGON_TRAIL });
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
    this._events = new EventSystem(this._resources, this._party);

    // ── State ─────────────────────────────────────────────────────────────────
    this._distance         = 0;
    this._riding           = true;
    this._gameOverFlag     = false;
    this._arrivalTriggered = false;
    this._drainTimer       = DRAIN_INTERVAL;
    this._eventTimer       = EVENT_INTERVAL + (Math.random() * 2 - 1) * EVENT_JITTER;
    this._passedCheckpoints = new Set();

    // ── Background ────────────────────────────────────────────────────────────
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x87ceeb);
    this._treeline  = this._buildTreeline(0x2d5a1b, BASE_HEIGHT * 0.45, 12);
    this._nearTrees = this._buildTreeline(0x1a3a10, BASE_HEIGHT * 0.55, 8);
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.7, BASE_WIDTH, BASE_HEIGHT * 0.6, 0x4a7a2a);
    this._roadStripes = this._buildRoad();

    // ── Bikers ────────────────────────────────────────────────────────────────
    this._bikerMap = {};
    this._buildBikers();

    // ── Progress bar ─────────────────────────────────────────────────────────
    this._buildProgressBar();

    // ── Overlays ─────────────────────────────────────────────────────────────
    this._eventCard   = new EventCard(this);
    this._walmartCard = new WalmartShopCard(this, this._resources);

    // ── Landmark banner (slides up, shows checkpoint name) ────────────────────
    this._bannerBg  = this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT + 20, BASE_WIDTH, 24, 0x000000, 0.85).setDepth(25);
    this._bannerTxt = txt(this, BASE_WIDTH / 2, BASE_HEIGHT + 20, '', {
      fontSize: '8px', color: '#f5e642',
    }).setOrigin(0.5).setDepth(26);

    // ── Snack hint ────────────────────────────────────────────────────────────
    txt(this, BASE_WIDTH / 2, BASE_HEIGHT - 8, 'S: EAT SNACK', {
      fontSize: '8px', color: '#556677',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10);

    this.input.keyboard.on('keydown-S', () => {
      if (!this._riding) return;
      if (this._resources.snacks > 0) {
        this._resources.eatSnack();
        this._showFloat('+25 NRG', BASE_WIDTH / 2, BASE_HEIGHT * 0.5, '#66bb6a');
      } else {
        this._showFloat('NO SNACKS!', BASE_WIDTH / 2, BASE_HEIGHT * 0.5, '#ff4444');
      }
    });

    this._resources.applyChanges({});
    this._party._emit();
  }

  update(time, delta) {
    const dt = delta / 1000;
    if (!this._riding) return;

    this._scrollLayers(dt);
    this._distance += SCROLL_SPEED * dt;
    this._updateProgressBar();

    this._drainTimer -= delta;
    if (this._drainTimer <= 0) {
      this._resources.applyChanges({ time: -2, energy: -1 });
      this._drainTimer = DRAIN_INTERVAL;
    }

    if (!this._gameOverFlag) {
      if (this._resources.isTimeUp())     { this._triggerLoss('time');  return; }
      if (this._resources.isBikeBroken()) { this._triggerLoss('bike');  return; }
      if (this._resources.isExhausted())  { this._triggerLoss('energy'); return; }
    }

    if (!this._arrivalTriggered && this._distance >= TOTAL_DISTANCE) {
      this._triggerArrival();
      return;
    }

    this._checkCheckpoints();

    this._eventTimer -= delta;
    if (this._eventTimer <= 0 && !this._arrivalTriggered) {
      this._triggerEvent();
    }
  }

  // ── Checkpoint logic ──────────────────────────────────────────────────────────

  _checkCheckpoints() {
    for (const cp of CHECKPOINTS) {
      if (this._passedCheckpoints.has(cp.id)) continue;
      if (this._distance < cp.distance) continue;

      this._passedCheckpoints.add(cp.id);
      this._riding = false;

      // Apply any automatic effects (e.g. dog chase at pet supply)
      if (cp.autoEffect) {
        this._resources.applyChanges(cp.autoEffect);
      }

      this._showBanner(cp.label, () => {
        if (cp.isShop) {
          this._walmartCard.show(() => { this._riding = true; });
        } else if (cp.dialogue) {
          this.scene.get(SCENE_DIALOGUE).showScript(cp.dialogue, () => { this._riding = true; });
        } else {
          this._riding = true;
        }
      });
      break; // only one checkpoint per frame
    }
  }

  _showBanner(label, onDone) {
    this._bannerTxt.setText(`📍 ${label}`);
    this.tweens.add({
      targets: [this._bannerBg, this._bannerTxt],
      y: BASE_HEIGHT - 14,
      duration: 300,
      onComplete: () => {
        this.time.delayedCall(1600, () => {
          this.tweens.add({
            targets: [this._bannerBg, this._bannerTxt],
            y: BASE_HEIGHT + 20,
            duration: 300,
            onComplete: onDone,
          });
        });
      },
    });
  }

  // ── Event logic ───────────────────────────────────────────────────────────────

  _triggerEvent() {
    this._riding = false;
    const event = this._events.drawEvent('act2');
    if (!event) { this._resumeRiding(); return; }

    this._eventCard.show(event, (choiceIndex) => {
      const result = this._events.applyChoice(event, choiceIndex);

      if (result.resourceChanges) {
        Object.entries(result.resourceChanges).forEach(([key, delta]) => {
          if (delta === 0) return;
          const color = delta > 0 ? '#66bb6a' : '#ff4444';
          const label = key === 'bikeCondition' ? 'BIKE' : key.toUpperCase();
          const sign  = delta > 0 ? '+' : '';
          this._showFloat(`${sign}${delta} ${label}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 20, color);
        });
      }

      if (result.partyLoss) {
        this._showFloat(`${result.partyLoss.toUpperCase()} WENT HOME!`, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 44, '#ff8800');
        this._removeBiker(result.partyLoss);
      }

      this._resumeRiding();
    });
  }

  _resumeRiding() {
    this._eventTimer = EVENT_INTERVAL + (Math.random() * 2 - 1) * EVENT_JITTER;
    this._riding = true;
  }

  _triggerLoss(reason) {
    this._gameOverFlag = true;
    this._riding = false;
    this.cameras.main.fade(500, 0, 0, 0);
    this.time.delayedCall(520, () => this.scene.start(SCENE_GAME_OVER, { reason }));
  }

  _triggerArrival() {
    this._arrivalTriggered = true;
    this._riding = false;
    this.time.delayedCall(600, () => {
      this.scene.get(SCENE_DIALOGUE).showScript('arrival', () => {
        this.cameras.main.fade(500, 0, 0, 0);
        this.time.delayedCall(520, () => {
          this.scene.start(SCENE_DONUT_SHOP, {
            party:     this._party.getParty(),
            resources: this._resources.getAll(),
          });
        });
      });
    });
  }

  // ── Scroll ────────────────────────────────────────────────────────────────────

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

  // ── Build helpers ─────────────────────────────────────────────────────────────

  _buildTreeline(color, y, count) {
    const trees = [];
    for (let i = 0; i < count; i++) {
      const x = (i / count) * BASE_WIDTH + Math.random() * (BASE_WIDTH / count);
      const h = 20 + Math.random() * 18;
      const w = 8 + Math.random() * 8;
      trees.push(this.add.rectangle(x, y, w, h, color));
    }
    return trees;
  }

  _buildRoad() {
    const roadY = BASE_HEIGHT * 0.62;
    const roadH = BASE_HEIGHT * 0.38;
    this.add.rectangle(BASE_WIDTH / 2, roadY + roadH / 2, BASE_WIDTH, roadH, 0x4a4a55);
    const stripes = [];
    for (let i = 0; i < 12; i++) {
      stripes.push(this.add.rectangle(i * 50 + 25, roadY + roadH / 2, 28, 3, 0xffff88, 0.35));
    }
    return stripes;
  }

  _buildBikers() {
    const party      = this._party.getParty();
    const roadY      = BASE_HEIGHT * 0.62 + 10;
    const totalCount = 1 + party.length;
    const spacing    = 28;
    const startX     = BASE_WIDTH / 2 - ((totalCount - 1) * spacing) / 2;

    const all = [{ id: 'leo', color: 0x3b82f6 }];
    party.forEach(id => all.push({ id, color: MEMBER_COLORS[id] ?? 0x888888 }));

    all.forEach((m, i) => {
      const biker = this._makeBiker(startX + i * spacing, roadY, m.color);
      if (m.id !== 'leo') this._bikerMap[m.id] = biker;
    });
  }

  _makeBiker(x, y, color) {
    const body   = this.add.rectangle(x, y - 6, 8, 10, color);
    const wheel1 = this.add.circle(x - 5, y, 5, 0x333333);
    const wheel2 = this.add.circle(x + 5, y, 5, 0x333333);
    this.tweens.add({
      targets: [body, wheel1, wheel2],
      y: `+=2`, yoyo: true, repeat: -1, duration: 250 + Math.random() * 100,
    });
    return { body, wheel1, wheel2 };
  }

  _removeBiker(memberId) {
    const biker = this._bikerMap[memberId];
    if (!biker) return;
    this.tweens.add({
      targets: [biker.body, biker.wheel1, biker.wheel2],
      y: `+=${BASE_HEIGHT}`, alpha: 0, duration: 800,
    });
    delete this._bikerMap[memberId];
  }

  _buildProgressBar() {
    const barY = BASE_HEIGHT - 26;
    const barW = BASE_WIDTH - 40;
    const barX = 20;
    this._progressBgW = barW;

    txt(this, barX, barY - 4, 'HOME', { fontSize: '8px', color: '#888888' });

    // Checkpoint tick marks
    CHECKPOINTS.forEach(cp => {
      const tickX = barX + (cp.distance / TOTAL_DISTANCE) * barW;
      this.add.rectangle(tickX, barY, 2, 8, 0x4488ff, 0.7);
      txt(this, tickX, barY - 14, cp.label.split(' ')[0], {
        fontSize: '8px', color: '#4488ff',
      }).setOrigin(0.5);
    });

    txt(this, barX + barW, barY - 4, 'DONUTS', { fontSize: '8px', color: '#f5a623' }).setOrigin(1, 0);
    this.add.rectangle(barX + barW / 2, barY, barW, 7, 0x1a1a2a);
    this._progressFill = this.add.rectangle(barX, barY, 1, 5, 0xf5a623).setOrigin(0, 0.5);
  }

  _updateProgressBar() {
    const pct = Math.min(1, this._distance / TOTAL_DISTANCE);
    this._progressFill.setSize(Math.max(1, (this._progressBgW - 4) * pct), 5);
  }

  _showFloat(text, x, y, color = '#ffffff') {
    const t = txt(this, x, y, text, { fontSize: '8px', color }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }
}
