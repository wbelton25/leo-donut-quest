import {
  SCENE_OREGON_TRAIL, SCENE_DIALOGUE, SCENE_GAME_OVER, SCENE_DONUT_SHOP,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';
import EventSystem from '../systems/EventSystem.js';
import EventCard from '../ui/EventCard.js';

// ── Oregon Trail constants ────────────────────────────────────────────────────
const TOTAL_DISTANCE  = 1000;   // arbitrary units; progress bar maps this to 100%
const SCROLL_SPEED    = 60;     // px/s for the road layer (foreground)
const DRAIN_INTERVAL  = 5000;   // ms between passive resource drains
const EVENT_INTERVAL  = 9000;   // ms between random events (base)
const EVENT_JITTER    = 3000;   // ±ms randomness added to interval

// Member colors for the biker sprites
const MEMBER_COLORS = {
  warren: 0xe74c3c,
  mj:     0x2ecc71,
  carson: 0x9b59b6,
  justin: 0xf39c12,
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
    this._distance       = 0;
    this._riding         = true;
    this._gameOverFlag   = false;
    this._arrivalTriggered = false;
    this._drainTimer     = DRAIN_INTERVAL;
    this._eventTimer     = EVENT_INTERVAL + (Math.random() * 2 - 1) * EVENT_JITTER;

    // ── Background layers (parallax) ──────────────────────────────────────────
    // Sky
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x87ceeb);
    // Distant trees (slow)
    this._treeline = this._buildTreeline(0x2d5a1b, BASE_HEIGHT * 0.45, 12);
    // Near treeline (faster)
    this._nearTrees = this._buildTreeline(0x1a3a10, BASE_HEIGHT * 0.55, 8);
    // Ground strip
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.7, BASE_WIDTH, BASE_HEIGHT * 0.6, 0x4a7a2a);
    // Road surface
    this._roadStripes = this._buildRoad();

    // ── Biker sprites (Leo + party members) ───────────────────────────────────
    this._bikers = this._buildBikers();

    // ── Progress bar ─────────────────────────────────────────────────────────
    this._buildProgressBar();

    // ── Event card ────────────────────────────────────────────────────────────
    this._eventCard = new EventCard(this);

    // ── Floating text pool ────────────────────────────────────────────────────
    this._floatTexts = [];

    // ── Input — allow snack use with S key while riding ───────────────────────
    this.input.keyboard.on('keydown-S', () => {
      if (!this._riding) return;
      if (this._resources.snacks > 0) {
        this._resources.eatSnack();
        this._showFloat('+25 NRG', BASE_WIDTH / 2, BASE_HEIGHT * 0.55, '#66bb6a');
      } else {
        this._showFloat('NO SNACKS!', BASE_WIDTH / 2, BASE_HEIGHT * 0.55, '#ff4444');
      }
    });

    // Initial resource emit so HUD starts correct
    this._resources.applyChanges({});
    this._party._emit();
  }

  update(time, delta) {
    const dt = delta / 1000;

    if (!this._riding) return;

    // ── Scroll backgrounds ────────────────────────────────────────────────────
    this._scrollLayers(dt);

    // ── Advance distance ──────────────────────────────────────────────────────
    this._distance += SCROLL_SPEED * dt;
    this._updateProgressBar();

    // ── Passive drain ─────────────────────────────────────────────────────────
    this._drainTimer -= delta;
    if (this._drainTimer <= 0) {
      this._resources.applyChanges({ time: -2, energy: -1 });
      this._drainTimer = DRAIN_INTERVAL;
    }

    // ── Loss checks ───────────────────────────────────────────────────────────
    if (!this._gameOverFlag) {
      if (this._resources.isTimeUp()) {
        this._triggerLoss('time');
      } else if (this._resources.isBikeBroken()) {
        this._triggerLoss('bike');
      } else if (this._resources.isExhausted()) {
        this._triggerLoss('energy');
      }
    }

    // ── Arrival ───────────────────────────────────────────────────────────────
    if (!this._arrivalTriggered && this._distance >= TOTAL_DISTANCE) {
      this._triggerArrival();
      return;
    }

    // ── Event timer ───────────────────────────────────────────────────────────
    this._eventTimer -= delta;
    if (this._eventTimer <= 0 && !this._arrivalTriggered) {
      this._triggerEvent();
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  _triggerEvent() {
    this._riding = false;
    const event = this._events.drawEvent('act2');
    if (!event) { this._resumeRiding(); return; }

    this._eventCard.show(event, (choiceIndex) => {
      const result = this._events.applyChoice(event, choiceIndex);

      // Show resource change feedback
      if (result.resourceChanges) {
        Object.entries(result.resourceChanges).forEach(([key, delta]) => {
          const color = delta >= 0 ? '#66bb6a' : '#ff4444';
          const label = key === 'bikeCondition' ? 'BIKE' : key.toUpperCase();
          const sign  = delta >= 0 ? '+' : '';
          this._showFloat(`${sign}${delta} ${label}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 20, color);
        });
      }

      // Party loss feedback
      if (result.partyLoss) {
        const lost = result.partyLoss;
        this._showFloat(`${lost.toUpperCase()} WENT HOME!`, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 40, '#ff8800');
        this._removeBiker(lost);
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
    this.time.delayedCall(520, () => {
      this.scene.start(SCENE_GAME_OVER, { reason });
    });
  }

  _triggerArrival() {
    this._arrivalTriggered = true;
    this._riding = false;
    this.time.delayedCall(800, () => {
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

  _scrollLayers(dt) {
    // Road stripes scroll fastest
    this._roadStripes.forEach(stripe => {
      stripe.x -= SCROLL_SPEED * dt;
      if (stripe.x < -30) stripe.x += BASE_WIDTH + 60;
    });
    // Near trees — medium
    this._nearTrees.forEach(tree => {
      tree.x -= SCROLL_SPEED * 0.55 * dt;
      if (tree.x < -20) tree.x += BASE_WIDTH + 40;
    });
    // Far treeline — slow
    this._treeline.forEach(tree => {
      tree.x -= SCROLL_SPEED * 0.2 * dt;
      if (tree.x < -20) tree.x += BASE_WIDTH + 40;
    });
  }

  _updateProgressBar() {
    const pct = Math.min(1, this._distance / TOTAL_DISTANCE);
    this._progressFill.setSize(Math.max(1, (this._progressBgW - 4) * pct), 5);
  }

  _removeBiker(memberId) {
    const biker = this._bikerMap[memberId];
    if (!biker) return;
    this.tweens.add({
      targets: [biker.body, biker.wheel1, biker.wheel2],
      y: `+=${BASE_HEIGHT}`,
      alpha: 0,
      duration: 800,
    });
    delete this._bikerMap[memberId];
  }

  _showFloat(text, x, y, color = '#ffffff') {
    const t = txt(this, x, y, text, { fontSize: '8px', color }).setOrigin(0.5).setDepth(40);
    this.tweens.add({
      targets: t, y: y - 28, alpha: 0, duration: 1200,
      onComplete: () => t.destroy(),
    });
  }

  // ── Build helpers ─────────────────────────────────────────────────────────────

  _buildTreeline(color, y, count) {
    const trees = [];
    for (let i = 0; i < count; i++) {
      const x = (i / count) * BASE_WIDTH + Math.random() * (BASE_WIDTH / count);
      const h = 20 + Math.random() * 18;
      const w = 8 + Math.random() * 8;
      const tree = this.add.rectangle(x, y, w, h, color);
      trees.push(tree);
    }
    return trees;
  }

  _buildRoad() {
    const roadY = BASE_HEIGHT * 0.62;
    const roadH = BASE_HEIGHT * 0.38;
    // Road surface
    this.add.rectangle(BASE_WIDTH / 2, roadY + roadH / 2, BASE_WIDTH, roadH, 0x4a4a55);
    // Center dashes
    const stripes = [];
    for (let i = 0; i < 12; i++) {
      const stripe = this.add.rectangle(
        i * 50 + 25, roadY + roadH / 2, 28, 3, 0xffff88, 0.35
      );
      stripes.push(stripe);
    }
    return stripes;
  }

  _buildBikers() {
    const party    = this._party.getParty();
    const roadY    = BASE_HEIGHT * 0.62 + 10;
    const totalCount = 1 + party.length; // Leo + party
    const spacing  = 28;
    const startX   = BASE_WIDTH / 2 - ((totalCount - 1) * spacing) / 2;
    this._bikerMap = {};

    const all = [];

    // Leo always first
    all.push({ id: 'leo', color: 0x3b82f6 });
    party.forEach(id => all.push({ id, color: MEMBER_COLORS[id] ?? 0x888888 }));

    return all.map((m, i) => {
      const x = startX + i * spacing;
      return this._makeBiker(x, roadY, m.color, m.id);
    });
  }

  _makeBiker(x, y, color, id) {
    const body   = this.add.rectangle(x, y - 6, 8, 10, color);
    const wheel1 = this.add.circle(x - 5, y,  5, 0x333333);
    const wheel2 = this.add.circle(x + 5, y,  5, 0x333333);
    const biker = { body, wheel1, wheel2 };
    if (id !== 'leo') this._bikerMap[id] = biker;
    // Slight bob animation
    this.tweens.add({
      targets: [body, wheel1, wheel2],
      y: `+=${2}`, yoyo: true, repeat: -1, duration: 250 + Math.random() * 100,
    });
    return biker;
  }

  _buildProgressBar() {
    const barY = BASE_HEIGHT - 14;
    const barW = BASE_WIDTH - 80;
    const barX = 40;
    this._progressBgW = barW;

    txt(this, 4, barY - 4, 'HOME', { fontSize: '8px', color: '#888888' });
    txt(this, BASE_WIDTH - 70, barY - 4, 'DONUTS', { fontSize: '8px', color: '#f5a623' });

    this.add.rectangle(barX + barW / 2, barY, barW, 7, 0x1a1a2a);
    this._progressFill = this.add.rectangle(barX, barY, 1, 5, 0xf5a623).setOrigin(0, 0.5);
    this._progressFill.setPosition(barX, barY);
  }
}
