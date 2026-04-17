import {
  SCENE_OREGON_TRAIL, SCENE_DIALOGUE, SCENE_GAME_OVER, SCENE_DONUT_SHOP,
  BASE_WIDTH, BASE_HEIGHT, txt,
} from '../constants.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';
import EventSystem from '../systems/EventSystem.js';
import EventCard from '../ui/EventCard.js';
import WalmartShopCard from '../ui/WalmartShopCard.js';

// ── Ride constants ─────────────────────────────────────────────────────────────
const TOTAL_DISTANCE  = 2000;
const SCROLL_SPEED    = 45;    // px/s at full health
const DRAIN_INTERVAL  = 4000;  // ms between passive drains (tighter than before)
const EVENT_INTERVAL  = 7000;  // ms base between random events
const EVENT_JITTER    = 2000;  // ±ms randomness

const FATIGUE_WARN    = 40;    // stamina toast warning threshold
const FATIGUE_CRIT    = 15;    // triggers forced stamina choice card
const BIKE_WARN       = 40;    // bike toast warning threshold
const BIKE_CRIT       = 15;    // triggers forced bike choice card
const SKILL_USE_COST  = 18;    // stamina cost when a member uses a skill

// Per-member stamina drain per passive tick
const STAMINA_RATES = {
  leo:    5,
  warren: 4,   // methodical pacer
  mj:     8,   // explosive but burns out fast
  carson: 3,   // most efficient rider
  justin: 10,  // all-out sprinter, drains quickest
};

// Per-member bike condition drain per passive tick
const BIKE_DRAIN_RATES = {
  leo:    3,
  warren: 2,   // careful, gentle rider
  mj:     5,   // hard on equipment
  carson: 2,   // smooth, low wear
  justin: 7,   // reckless — destroys bikes
};

// Snack effect on stamina (0–100 scale)
const SNACK_STAMINA = { gatorade: 33, granola: 67, hotdog: 100 };
// Bike part effect on bike condition (0–100 scale)
const BIKE_PART_RESTORE = { patch: 33, tire: 67, chain: 100 };

// Convert time resource (0–100) → clock string
// time=100 → 3:00 PM,  time=0 → 5:00 PM (120 minutes window)
function timeToDisplay(t) {
  const minPast = Math.round((100 - t) * 1.2);
  const hour    = 3 + Math.floor(minPast / 60);
  const min     = minPast % 60;
  return `${hour}:${min.toString().padStart(2, '0')} PM`;
}

const CHECKPOINTS = [
  { distance:  400, id: 'school',    label: 'SCHOOL',             tick: 'SCHOOL',    dialogue: 'checkpoint_school',    isShop: false },
  { distance:  800, id: 'walmart',   label: 'WALMART',            tick: 'WALMART',   dialogue: null,                   isShop: true  },
  { distance: 1200, id: 'tire',      label: 'DISCOUNT TIRE',      tick: 'DISC TIRE', dialogue: 'checkpoint_tire',      isShop: false },
  { distance: 1600, id: 'petsupply', label: 'PET SUPPLIES PLUS',  tick: 'PET SUPLS', dialogue: 'checkpoint_petsupply', isShop: false, autoEffect: { energy: -5 } },
];

// Location-specific events fired when reaching each checkpoint
const LOCATION_EVENTS = {
  school: [
    {
      title: 'TEACHER ALERT!',
      description: "Mrs. Peterson spots the crew from the parking lot. \"Aren't you kids supposed to be in class?!\"",
      choices: [
        { text: "Explain it's a real emergency",        effects: { time: -8 } },
        { text: 'Pedal away fast!',                    effects: { energy: -10, time: -4 } },
        { text: 'Carson talks her down  [skill]',      effects: { time: -3 }, requiresPartyMember: 'carson' },
        { text: 'Warren creates a diversion  [skill]', effects: { time: -5 }, requiresPartyMember: 'warren' },
      ],
    },
    {
      title: 'RECESS RACE!',
      description: "Kids at recess block the path and dare the crew to a quick race. \"Scared?!\"",
      choices: [
        { text: "Race them — it'll pump everyone up",  effects: { time: -10, energy: 10 } },
        { text: 'Politely decline and ride on',        effects: { time: -4 } },
        { text: 'Justin destroys them in 20 sec  [skill]', effects: { time: -3, energy: 8 }, requiresPartyMember: 'justin' },
      ],
    },
    {
      title: 'CROSSING GUARD',
      description: "The crossing guard holds the stop sign up. \"Slow down! No bikes on school property!\"",
      choices: [
        { text: 'Wait it out',                         effects: { time: -6 } },
        { text: 'Duck through the back path',          effects: { time: -3, bikeCondition: -8 } },
        { text: 'Warren spots a gap  [skill]',         effects: { time: -2 }, requiresPartyMember: 'warren' },
      ],
    },
  ],
  tire: [
    {
      title: 'FREE TIRE CHECK!',
      description: "\"Hey kids, those bikes look rough. I'll inspect them for free — takes five minutes!\"",
      choices: [
        { text: 'Accept the free check',               effects: { time: -8, bikeCondition: 20 } },
        { text: 'Wave him off — no time',              effects: {} },
        { text: 'Warren evaluates what is critical  [skill]', effects: { time: -4, bikeCondition: 25 }, requiresPartyMember: 'warren' },
      ],
    },
    {
      title: 'DELIVERY TRUCK!',
      description: "A delivery truck is backed across the exit, completely blocking the road.",
      choices: [
        { text: 'Wait for it to move',                 effects: { time: -8 } },
        { text: 'Cut through the gravel lot',          effects: { time: -3, bikeCondition: -12 } },
        { text: 'Justin finds a gap instantly  [skill]', effects: { time: -2 }, requiresPartyMember: 'justin' },
      ],
    },
  ],
  petsupply: [
    {
      title: 'ESCAPED DOG!',
      description: "A massive golden retriever bursts through the pet store door and charges after the crew!",
      choices: [
        { text: 'RIDE FOR YOUR LIVES!',                effects: { energy: -20, time: -5 } },
        { text: 'MJ grabs the leash  [skill]',         effects: { time: -3, energy: -8 }, requiresPartyMember: 'mj' },
        { text: 'Carson lures it away  [skill]',       effects: { time: -2 }, requiresPartyMember: 'carson' },
        { text: 'Justin outruns it easily  [skill]',   effects: { energy: -5 }, requiresPartyMember: 'justin' },
      ],
    },
    {
      title: 'LOOSE FERRET!',
      description: "A ferret escapes and zips between the bikes — MJ nearly swerves into a fence!",
      choices: [
        { text: 'Swerve hard and keep going',          effects: { bikeCondition: -15, time: -3 } },
        { text: 'Stop and catch it carefully',         effects: { time: -10 } },
        { text: 'Carson scoops it up smoothly  [skill]', effects: { time: -2, bikeCondition: -5 }, requiresPartyMember: 'carson' },
      ],
    },
    {
      title: 'SQUAWKING PARROT!',
      description: "A parrot on a perch outside starts yelling your names, drawing stares from everyone nearby.",
      choices: [
        { text: 'Ignore it and pedal hard',            effects: { time: -3 } },
        { text: 'Try to shoo it (bad idea)',           effects: { time: -8, energy: -5 } },
        { text: 'Warren walks past calmly  [skill]',   effects: { time: -1 }, requiresPartyMember: 'warren' },
      ],
    },
  ],
};

const MEMBER_COLORS = { warren: 0xe74c3c, mj: 0x2ecc71, carson: 0x9b59b6, justin: 0xf39c12 };
const MEMBER_NAMES  = { leo: 'LEO', warren: 'WARREN', mj: 'MJ', carson: 'CARSON', justin: 'JUSTIN' };

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
    if (this._initData.resources) this._resources.restoreFromSave(this._initData.resources);
    if (this._initData.party)     this._initData.party.forEach(id => this._party.addMember(id));
    this.game.registry.set('resources', this._resources);
    this.game.registry.set('party',     this._party);
    this._events = new EventSystem(this._resources, this._party);

    // ── Inventory (filled at Walmart, consumed on road) ───────────────────────
    this._snackInv = { gatorade: 0, granola: 0, hotdog: 0 };
    this._bikeInv  = { patch: 0, tire: 0, chain: 0 };

    // ── State ─────────────────────────────────────────────────────────────────
    this._distance          = 0;
    this._riding            = true;
    this._gameOverFlag      = false;
    this._arrivalTriggered  = false;
    this._drainTimer        = DRAIN_INTERVAL;
    this._eventTimer        = EVENT_INTERVAL + (Math.random() * 2 - 1) * EVENT_JITTER;
    this._passedCheckpoints = new Set();
    this._breakThresholds   = [600, 1400];
    this._breakOffered      = new Set();

    // Stamina tracking
    this._stamina        = { leo: 100 };
    this._warnedStamina  = new Set();
    this._fatigueTriggered = new Set();

    // Per-member bike condition tracking
    this._bikeHP         = { leo: 100 };
    this._warnedBike     = new Set();
    this._bikeTriggered  = new Set();

    (this._initData.party ?? []).forEach(id => {
      this._stamina[id] = 100;
      this._bikeHP[id]  = 100;
    });

    // ── Background ────────────────────────────────────────────────────────────
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.3,  BASE_WIDTH, BASE_HEIGHT * 0.6, 0x87ceeb);
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.08, BASE_WIDTH, BASE_HEIGHT * 0.16, 0xb8e8f8, 0.5);
    this._treeline  = this._buildTreeline(0x2d5a1b, BASE_HEIGHT * 0.45, 12);
    this._nearTrees = this._buildTreeline(0x1a3a10, BASE_HEIGHT * 0.55, 8);
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.7, BASE_WIDTH, BASE_HEIGHT * 0.6, 0x4a7a2a);
    this._roadStripes = this._buildRoad();

    // ── Bikers + per-member bars ──────────────────────────────────────────────
    this._bikerMap    = {};
    this._staminaBars = {};
    this._bikeBars    = {};
    this._buildBikers();

    // ── Progress bar ──────────────────────────────────────────────────────────
    this._buildProgressBar();

    // ── Overlays ──────────────────────────────────────────────────────────────
    this._eventCard   = new EventCard(this);
    this._walmartCard = new WalmartShopCard(this, this._resources, this._snackInv, this._bikeInv);
    this._snackPicker = null; // built on demand

    // ── Inventory strip (just below HUD) ─────────────────────────────────────
    this.add.rectangle(BASE_WIDTH / 2, 38, BASE_WIDTH, 14, 0x000000, 0.70).setDepth(4);
    this._invText = txt(this, BASE_WIDTH / 2, 35, '', {
      fontSize: '8px', color: '#aaaaaa',
    }).setOrigin(0.5, 0).setDepth(5);

    // ── Second info strip (pace, ETA, rest stop button) ──────────────────────
    this.add.rectangle(BASE_WIDTH / 2, 53, BASE_WIDTH, 12, 0x000000, 0.58).setDepth(5);

    // REST STOP button
    const restBtnBg = this.add.rectangle(36, 53, 68, 12, 0x1a1a2a).setDepth(6)
      .setInteractive({ useHandCursor: true });
    this._restBtnLbl = txt(this, 36, 53, '[R] REST', { fontSize: '8px', color: '#aaaaaa' })
      .setOrigin(0.5).setDepth(7);
    restBtnBg.on('pointerover', () => restBtnBg.setFillStyle(0x2a2a3a));
    restBtnBg.on('pointerout',  () => restBtnBg.setFillStyle(0x1a1a2a));
    restBtnBg.on('pointerdown', () => this._openRestStop());

    // ETA text (center)
    this._etaText = txt(this, BASE_WIDTH / 2, 53, '', { fontSize: '8px', color: '#44cc44' })
      .setOrigin(0.5).setDepth(7);

    // Pace indicator (right)
    this._paceText = txt(this, BASE_WIDTH - 4, 53, '', { fontSize: '8px', color: '#44cc44' })
      .setOrigin(1, 0.5).setDepth(7);

    // R key: open rest stop when riding, close it when it's open
    this.input.keyboard.addKey('R').on('down', () => {
      if (this._restStopCon) this._closeRestStop();
      else this._openRestStop();
    });

    this._restStopCon      = null;
    this._restStopTimerEvt = null;

    // ── Landmark banner ───────────────────────────────────────────────────────
    this._bannerBg  = this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT + 20, BASE_WIDTH, 24, 0x000000, 0.88).setDepth(25);
    this._bannerTxt = txt(this, BASE_WIDTH / 2, BASE_HEIGHT + 20, '', {
      fontSize: '8px', color: '#f5e642',
    }).setOrigin(0.5).setDepth(26);

    this._resources.applyChanges({});
    this._party._emit();
  }

  update(time, delta) {
    if (!this._riding) return;
    const dt = delta / 1000;

    const speedMult = this._calcSpeedMult();
    const speed = SCROLL_SPEED * speedMult;
    this._scrollLayers(dt, speed);
    this._distance += speed * dt;
    this._updateProgressBar();

    // ── Pace indicator ────────────────────────────────────────────────────────
    if (speedMult >= 0.85)       { this._paceText.setText('PACE: FAST').setColor('#44cc44'); }
    else if (speedMult >= 0.60)  { this._paceText.setText('PACE: OK').setColor('#f5a623'); }
    else                         { this._paceText.setText('PACE: SLOW').setColor('#ff3333'); }

    // ── ETA indicator ─────────────────────────────────────────────────────────
    {
      const distRemaining = TOTAL_DISTANCE - this._distance;
      const currentSpeed  = SCROLL_SPEED * speedMult;
      if (currentSpeed > 0 && distRemaining > 0) {
        const secsToArrive = distRemaining / currentSpeed;
        // Time drains 1 unit/sec passively; project what time resource will be at arrival
        const projectedTime = this._resources.time - secsToArrive;
        const minsPast = Math.round((100 - Math.max(0, projectedTime)) * 1.2);
        const h = 3 + Math.floor(minsPast / 60);
        const m = (minsPast % 60).toString().padStart(2, '0');
        const etaColor = projectedTime > 15 ? '#44cc44' : projectedTime > 0 ? '#f5a623' : '#ff3333';
        this._etaText.setText(`ARR: ${h}:${m}PM`).setColor(etaColor);
      }
    }

    // ── Passive drains ────────────────────────────────────────────────────────
    this._drainTimer -= delta;
    if (this._drainTimer <= 0) {
      // Global time drain — tighter: -4 per tick
      this._resources.applyChanges({ time: -4 });
      this._drainAllStamina();
      this._drainAllBikes();
      this._syncBikeToHud();
      this._drainTimer = DRAIN_INTERVAL;
    }

    // ── Inventory strip ───────────────────────────────────────────────────────
    const s = this._snackInv, b = this._bikeInv;
    this._invText.setText(
      `GATO:${s.gatorade}  GRAN:${s.granola}  DOG:${s.hotdog}    PATCH:${b.patch}  TIRE:${b.tire}  CHAIN:${b.chain}`,
    );

    // ── Per-member bar visuals ────────────────────────────────────────────────
    this._updateStaminaBars();
    this._updateBikeBars();

    // ── Loss conditions ───────────────────────────────────────────────────────
    if (!this._gameOverFlag) {
      if (this._resources.isTimeUp())    { this._triggerLoss('time');   return; }
      if (this._resources.isExhausted()) { this._triggerLoss('energy'); return; }
    }

    if (!this._arrivalTriggered && this._distance >= TOTAL_DISTANCE) {
      this._triggerArrival();
      return;
    }

    // ── Checkpoints ───────────────────────────────────────────────────────────
    this._checkCheckpoints();
    if (!this._riding) return;

    // ── Break opportunities ────────────────────────────────────────────────────
    for (const threshold of this._breakThresholds) {
      if (this._distance >= threshold && !this._breakOffered.has(threshold)) {
        this._breakOffered.add(threshold);
        this._riding = false;
        this._triggerBreakEvent();
        return;
      }
    }
    if (!this._riding) return;

    // ── Stamina / bike warnings & critical events ─────────────────────────────
    this._checkStamina();
    if (!this._riding) return;
    this._checkBikes();
    if (!this._riding) return;

    // ── Random events ─────────────────────────────────────────────────────────
    this._eventTimer -= delta;
    if (this._eventTimer <= 0 && !this._arrivalTriggered) {
      this._triggerEvent();
    }
  }

  // ── Speed modulation ──────────────────────────────────────────────────────────

  _calcSpeedMult() {
    const minStam = Math.min(...Object.values(this._stamina));
    const minBike = Math.min(...Object.values(this._bikeHP));
    // Stamina: full speed at ≥60, linear decay to 0.5× at 0
    const sM = 0.5 + 0.5 * Math.min(1, minStam / 60);
    // Bike: full speed at ≥50, linear decay to 0.4× at 0
    const bM = 0.4 + 0.6 * Math.min(1, minBike / 50);
    // Worst factor wins — one struggling member drags the whole group
    return Math.max(0.30, Math.min(sM, bM));
  }

  // ── Passive drains ────────────────────────────────────────────────────────────

  _drainAllStamina() {
    Object.keys(this._stamina).forEach(id => {
      const base = STAMINA_RATES[id] ?? 5;
      const roll = Math.random();
      let drain;
      if (roll < 0.03) {
        // Rare incident: fall / stumble / cramp
        drain = base * (5 + Math.random() * 4);
        const name = MEMBER_NAMES[id] ?? id.toUpperCase();
        const msgs = [`${name} TOOK A TUMBLE!`, `${name} HIT A CRAMP!`, `${name} ALMOST WIPED OUT!`];
        this._showFloat(msgs[Math.floor(Math.random() * msgs.length)], BASE_WIDTH / 2, BASE_HEIGHT * 0.42, '#ff4444');
      } else {
        // Normal variation: 0.4× to 1.8×
        drain = base * (0.4 + Math.random() * 1.4);
      }
      this._stamina[id] = Math.max(0, this._stamina[id] - drain);
    });
  }

  _drainAllBikes() {
    Object.keys(this._bikeHP).forEach(id => {
      const base = BIKE_DRAIN_RATES[id] ?? 3;
      const roll = Math.random();
      let drain;
      if (roll < 0.03) {
        // Rare incident: pothole / curb clip / chain slip
        drain = base * (6 + Math.random() * 5);
        const name = MEMBER_NAMES[id] ?? id.toUpperCase();
        const msgs = [`${name} HIT A POTHOLE!`, `${name}'S CHAIN SLIPPED!`, `${name} CLIPPED A CURB!`];
        this._showFloat(msgs[Math.floor(Math.random() * msgs.length)], BASE_WIDTH / 2, BASE_HEIGHT * 0.46, '#ef5350');
      } else {
        drain = base * (0.4 + Math.random() * 1.4);
      }
      this._bikeHP[id] = Math.max(0, this._bikeHP[id] - drain);
    });
  }

  // Push average bike condition to ResourceSystem so HUD bar stays current
  _syncBikeToHud() {
    const vals = Object.values(this._bikeHP);
    if (vals.length === 0) return;
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    this._resources.applyChanges({ bikeCondition: avg - this._resources.bikeCondition });
  }

  // ── Stamina check ─────────────────────────────────────────────────────────────

  _checkStamina() {
    for (const [id, st] of Object.entries(this._stamina)) {
      if (st <= FATIGUE_WARN && !this._warnedStamina.has(id)) {
        this._warnedStamina.add(id);
        const name = MEMBER_NAMES[id] ?? id.toUpperCase();
        const msgs = [`${name} is slowing down...`, `${name}: "I need a break..."`, `${name} is struggling!`];
        this._showFloat(msgs[Math.floor(Math.random() * msgs.length)], BASE_WIDTH / 2, BASE_HEIGHT * 0.42, '#f5a623');
      }
      if (st <= FATIGUE_CRIT && !this._fatigueTriggered.has(id)) {
        this._fatigueTriggered.add(id);
        this._riding = false;
        this._triggerFatigueEvent(id);
        return;
      }
    }
  }

  _triggerFatigueEvent(memberId) {
    const name = MEMBER_NAMES[memberId] ?? memberId.toUpperCase();
    const choices = [];

    // Snack options from inventory
    if (this._snackInv.gatorade > 0) choices.push({ text: `Gatorade → ${name}  [+33 STAMINA]`,    _action: 'snack', _snack: 'gatorade', _id: memberId });
    if (this._snackInv.granola  > 0) choices.push({ text: `Granola Bar → ${name}  [+67 STAMINA]`, _action: 'snack', _snack: 'granola',  _id: memberId });
    if (this._snackInv.hotdog   > 0) choices.push({ text: `Hot Dog → ${name}  [FULL STAMINA]`,    _action: 'snack', _snack: 'hotdog',   _id: memberId });

    choices.push({ text: `Make ${name} tough it out  [−10 NRG, small reprieve]`, _action: 'toughit', _id: memberId });
    if (memberId !== 'leo') choices.push({ text: `Leave ${name} behind  [keeps group moving]`, _action: 'drop', _id: memberId });
    if (memberId !== 'mj'     && this._party.hasMember('mj'))     choices.push({ text: `MJ pushes their bike a stretch`, _action: 'mj_carry', _id: memberId });
    if (memberId !== 'carson' && this._party.hasMember('carson')) choices.push({ text: `Carson slips them a secret boost`, _action: 'carson_boost', _id: memberId });
    if (choices.length === 0) choices.push({ text: 'Dig deep — push through', _action: 'toughit', _id: memberId });

    this._eventCard.show({
      title:       `${name} IS FALLING BEHIND!`,
      description: `${name} is running on empty. Use a snack from your bag, or make a tough call.`,
      choices,
    }, (idx) => this._applyFatigueChoice(choices[idx]));
  }

  _applyFatigueChoice(choice) {
    const id   = choice._id;
    const name = MEMBER_NAMES[id] ?? id.toUpperCase();
    switch (choice._action) {
      case 'snack': {
        const snackId = choice._snack;
        const boost   = SNACK_STAMINA[snackId] ?? 33;
        this._snackInv[snackId]--;
        this._stamina[id] = Math.min(100, this._stamina[id] + boost);
        this._fatigueTriggered.delete(id);
        this._warnedStamina.delete(id);
        this._showFloat(`${name}: +${boost} STAMINA`, BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#66bb6a');
        break;
      }
      case 'toughit':
        this._applyEventEffects({ energy: -10 });
        this._stamina[id] = Math.min(100, this._stamina[id] + 20);
        this._showFloat('PUSH THROUGH IT!', BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#f5a623');
        break;
      case 'drop':
        this._showFloat(`${name} TURNED BACK!`, BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#ff8800');
        this._dropMember(id);
        break;
      case 'mj_carry':
        this._stamina[id] = Math.min(100, this._stamina[id] + 60);
        this._stamina['mj'] = Math.max(0, (this._stamina['mj'] ?? 100) - 15);
        this._fatigueTriggered.delete(id);
        this._warnedStamina.delete(id);
        this._showFloat('MJ GIVES A PUSH!', BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#2ecc71');
        break;
      case 'carson_boost':
        this._stamina[id] = Math.min(100, this._stamina[id] + 55);
        this._fatigueTriggered.delete(id);
        this._warnedStamina.delete(id);
        this._showFloat(`CARSON SLIPS ${name} SOMETHING...`, BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#9b59b6');
        break;
    }
    this._resumeRiding();
  }

  // ── Bike check ────────────────────────────────────────────────────────────────

  _checkBikes() {
    for (const [id, hp] of Object.entries(this._bikeHP)) {
      if (hp <= BIKE_WARN && !this._warnedBike.has(id)) {
        this._warnedBike.add(id);
        const name = MEMBER_NAMES[id] ?? id.toUpperCase();
        this._showFloat(`${name}'s bike is struggling!`, BASE_WIDTH / 2, BASE_HEIGHT * 0.46, '#ef5350');
      }
      if (hp <= BIKE_CRIT && !this._bikeTriggered.has(id)) {
        this._bikeTriggered.add(id);
        this._riding = false;
        this._triggerBikeEvent(id);
        return;
      }
    }
  }

  _triggerBikeEvent(memberId) {
    const name = MEMBER_NAMES[memberId] ?? memberId.toUpperCase();
    const choices = [];

    if (this._bikeInv.patch > 0) choices.push({ text: `Tire Patch on ${name}'s bike  [+33 BIKE]`, _action: 'repair', _part: 'patch', _id: memberId });
    if (this._bikeInv.tire  > 0) choices.push({ text: `New Tire on ${name}'s bike  [+67 BIKE]`,   _action: 'repair', _part: 'tire',  _id: memberId });
    if (this._bikeInv.chain > 0) choices.push({ text: `New Chain on ${name}'s bike  [FULL BIKE]`, _action: 'repair', _part: 'chain', _id: memberId });

    choices.push({ text: `${name} limps along  [very slow, risky]`, _action: 'limp', _id: memberId });
    if (memberId !== 'leo') choices.push({ text: `Leave ${name} behind`, _action: 'drop', _id: memberId });
    if (choices.length === 0) choices.push({ text: `${name} limps along`, _action: 'limp', _id: memberId });

    this._eventCard.show({
      title:       `${name}'S BIKE IS WRECKED!`,
      description: `${name}'s bike is barely rolling. Use a part from your bag or make a hard choice.`,
      choices,
    }, (idx) => this._applyBikeChoice(choices[idx]));
  }

  _applyBikeChoice(choice) {
    const id   = choice._id;
    const name = MEMBER_NAMES[id] ?? id.toUpperCase();
    switch (choice._action) {
      case 'repair': {
        const partId  = choice._part;
        const restore = BIKE_PART_RESTORE[partId] ?? 33;
        this._bikeInv[partId]--;
        this._bikeHP[id] = Math.min(100, this._bikeHP[id] + restore);
        this._bikeTriggered.delete(id);
        this._warnedBike.delete(id);
        this._syncBikeToHud();
        this._showFloat(`${name}'s BIKE: +${restore}`, BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#4fc3f7');
        break;
      }
      case 'limp':
        // Limping: bike stays low — heavy speed penalty already applied by _calcSpeedMult
        this._showFloat(`${name} LIMPING ON...`, BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#ffaa00');
        break;
      case 'drop':
        this._showFloat(`${name} TURNED BACK!`, BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#ff8800');
        this._dropMember(id);
        break;
    }
    this._resumeRiding();
  }

  // ── Shared drop helper ────────────────────────────────────────────────────────

  _dropMember(id) {
    const multBefore = this._calcSpeedMult();
    this._removeBiker(id);
    this._party.removeMember(id);
    delete this._stamina[id];
    delete this._bikeHP[id];
    this._syncBikeToHud();
    const multAfter = this._calcSpeedMult();
    if (multAfter > multBefore + 0.05) {
      this._showFloat('GROUP SPEED UP!', BASE_WIDTH / 2, BASE_HEIGHT * 0.34, '#44cc44');
    }
  }

  // ── Event effect helpers ──────────────────────────────────────────────────────

  // Applies effects to BOTH ResourceSystem (HUD) AND per-member stamina/bikeHP.
  // `distance` effects advance the progress bar directly — never sent to ResourceSystem.
  _applyEventEffects(effects) {
    const { distance: _d, ...resEffects } = effects;
    this._resources.applyChanges(resEffects);
    this._applyPerMemberEffects(effects);
  }

  // Bridges resource deltas to per-member values only (no ResourceSystem call).
  // Use this when ResourceSystem was already updated (e.g. via EventSystem).
  _applyPerMemberEffects(effects) {
    if (effects.energy) {
      const delta = effects.energy;
      Object.keys(this._stamina).forEach(id => {
        this._stamina[id] = Math.max(0, Math.min(100, this._stamina[id] + delta));
        if (delta > 0) { this._warnedStamina.delete(id); this._fatigueTriggered.delete(id); }
      });
    }
    if (effects.bikeCondition) {
      const delta = effects.bikeCondition;
      Object.keys(this._bikeHP).forEach(id => {
        this._bikeHP[id] = Math.max(0, Math.min(100, this._bikeHP[id] + delta));
        if (delta > 0) { this._warnedBike.delete(id); this._bikeTriggered.delete(id); }
      });
      this._syncBikeToHud();
    }
    if (effects.distance) {
      // Advance the progress bar — shortcuts/downhills move you forward, not backward in time
      this._distance = Math.min(TOTAL_DISTANCE - 10, this._distance + effects.distance);
    }
  }

  // ── Break events ──────────────────────────────────────────────────────────────

  _triggerBreakEvent() {
    const choices = [
      { text: "Push through — no time to stop", _action: 'skip' },
      { text: "Take a 5-min break  [time: -4, all +30 STAM]", _action: 'break' },
    ];
    if (this._party.hasMember('mj')) {
      choices.push({ text: "MJ rallies the group  [time: -2, all +20 STAM]", _action: 'mj_rally' });
    }
    const hasSnacks = this._snackInv.gatorade > 0 || this._snackInv.granola > 0;
    if (this._party.hasMember('carson') && hasSnacks) {
      choices.push({ text: "Carson slips someone a snack  [pick member, uses 1]", _action: 'carson_snacks' });
    }
    this._eventCard.show({
      title:       'TAKE A BREAK?',
      description: "The crew is looking tired. A quick rest could help everyone push through to the end.",
      choices,
    }, (idx) => this._applyBreakChoice(choices[idx]));
  }

  _applyBreakChoice(choice) {
    switch (choice._action) {
      case 'break':
        this._resources.applyChanges({ time: -4 });
        Object.keys(this._stamina).forEach(id => {
          this._stamina[id] = Math.min(100, this._stamina[id] + 30);
          this._warnedStamina.delete(id);
          this._fatigueTriggered.delete(id);
        });
        this._showFloat('EVERYONE CATCHES THEIR BREATH!', BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#66bb6a');
        break;
      case 'mj_rally':
        this._resources.applyChanges({ time: -2 });
        Object.keys(this._stamina).forEach(id => {
          this._stamina[id] = Math.min(100, this._stamina[id] + 20);
          this._warnedStamina.delete(id);
          this._fatigueTriggered.delete(id);
        });
        this._showFloat('MJ RALLIES THE GROUP!', BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#2ecc71');
        break;
      case 'carson_snacks': {
        // Pick the best available snack
        const snackKey = this._snackInv.granola > 0 ? 'granola'
          : this._snackInv.gatorade > 0 ? 'gatorade' : null;
        if (!snackKey) { this._resumeRiding(); return; }
        const boost = SNACK_STAMINA[snackKey];
        // Show a member picker — inventory item targets one person only
        const memberIds = Object.keys(this._stamina);
        const pickerChoices = memberIds.map(id => ({
          text: `${MEMBER_NAMES[id] ?? id.toUpperCase()}  (STAM: ${Math.round(this._stamina[id])})`,
          _memberId: id,
        }));
        this._eventCard.show({
          title:       'WHO GETS THE SNACK?',
          description: `Carson has a ${snackKey} (+${boost} STAMINA). Pick one member.`,
          choices:     pickerChoices,
        }, (idx) => {
          const targetId = pickerChoices[idx]._memberId;
          this._snackInv[snackKey]--;
          this._stamina[targetId] = Math.min(100, this._stamina[targetId] + boost);
          this._warnedStamina.delete(targetId);
          this._fatigueTriggered.delete(targetId);
          const name = MEMBER_NAMES[targetId] ?? targetId.toUpperCase();
          this._showFloat(`${name}: +${boost} STAMINA`, BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#9b59b6');
          this._resumeRiding();
        });
        return; // resumeRiding is called inside the picker callback above
      }
      // 'skip': no effect
    }
    this._resumeRiding();
  }

  // ── Checkpoint logic ──────────────────────────────────────────────────────────

  _checkCheckpoints() {
    for (const cp of CHECKPOINTS) {
      if (this._passedCheckpoints.has(cp.id)) continue;
      if (this._distance < cp.distance) continue;

      this._passedCheckpoints.add(cp.id);
      this._riding = false;
      if (cp.autoEffect) this._resources.applyChanges(cp.autoEffect);

      this._showLocationScene(cp, () => { this._riding = true; });
      break;
    }
  }

  // ── Location scenes ────────────────────────────────────────────────────────

  _showLocationScene(cp, onDone) {
    // Build building graphic container
    const objs = this._buildLocationGraphic(cp.id, cp.label);
    const locCon = this.add.container(0, 0).setDepth(22).setAlpha(0);
    objs.forEach(o => locCon.add(o));

    // Fade in building
    this.tweens.add({
      targets: locCon, alpha: 1, duration: 450,
      onComplete: () => {
        this.time.delayedCall(700, () => {
          if (cp.isShop) {
            // Walmart: open shop with building visible in background
            this._walmartCard.show(() => {
              this._fadeOutLocation(locCon, onDone);
            });
          } else {
            // Show location-specific event
            const pool = LOCATION_EVENTS[cp.id];
            if (pool && pool.length > 0) {
              const evt = pool[Math.floor(Math.random() * pool.length)];
              const choices = evt.choices.filter(c => !c.requiresPartyMember || this._party.hasMember(c.requiresPartyMember));
              const finalChoices = choices.length > 0 ? choices : [evt.choices[0]];
              this._eventCard.show({ title: evt.title, description: evt.description, choices: finalChoices }, (idx) => {
                const choice = finalChoices[idx];
                if (choice.effects && Object.keys(choice.effects).length > 0) {
                  this._applyEventEffects(choice.effects);
                }
                if (choice.requiresPartyMember && this._stamina[choice.requiresPartyMember] !== undefined) {
                  this._stamina[choice.requiresPartyMember] = Math.max(0, this._stamina[choice.requiresPartyMember] - SKILL_USE_COST);
                }
                this._fadeOutLocation(locCon, onDone);
              });
            } else {
              this.time.delayedCall(1200, () => this._fadeOutLocation(locCon, onDone));
            }
          }
        });
      },
    });
  }

  _fadeOutLocation(container, onDone) {
    this.tweens.add({
      targets: container, alpha: 0, duration: 350,
      onComplete: () => { container.destroy(true); onDone(); },
    });
  }

  _buildLocationGraphic(type, label) {
    const cx = BASE_WIDTH / 2;
    const cy = 118;  // center of building area (below inv strip, above road)
    const r  = (x, y, w, h, c, a = 1) => this.add.rectangle(x, y, w, h, c, a);
    const c  = (x, y, rad, col)        => this.add.circle(x, y, rad, col);
    const t  = (x, y, s, col, sz = '8px') => txt(this, x, y, s, { fontSize: sz, color: col }).setOrigin(0.5);

    // Full-screen overlay first
    const overlay = r(cx, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.72);

    switch (type) {
      case 'school': return [
        overlay,
        r(cx, cy + 58, BASE_WIDTH, 28, 0x2a5a1a),           // lawn
        r(cx, cy + 5, 230, 88, 0xe8d5a3),                   // main building
        r(cx, cy - 44, 242, 18, 0x8b5e3c),                  // roof
        r(cx - 70, cy - 16, 3, 62, 0xaaaaaa),               // flagpole
        r(cx - 60, cy - 44, 22, 12, 0xff2222),              // flag
        // windows top row
        r(cx - 80, cy - 8, 22, 20, 0x87ceeb), r(cx - 40, cy - 8, 22, 20, 0x87ceeb),
        r(cx,      cy - 8, 22, 20, 0x87ceeb), r(cx + 40, cy - 8, 22, 20, 0x87ceeb),
        r(cx + 80, cy - 8, 22, 20, 0x87ceeb),
        // windows bottom row (flanking door)
        r(cx - 80, cy + 28, 22, 20, 0x87ceeb), r(cx + 80, cy + 28, 22, 20, 0x87ceeb),
        r(cx, cy + 36, 18, 30, 0x6b3a2a),                   // door
        t(cx, cy - 58, 'TEGA CAY ELEMENTARY', '#ffe88a'),
      ];

      case 'walmart': return [
        overlay,
        r(cx, cy + 58, BASE_WIDTH, 28, 0x555555),           // parking lot
        r(cx, cy + 10, 320, 80, 0x5a6a7a),                  // main building
        r(cx, cy - 30, 320, 22, 0x004aad),                  // blue band
        t(cx, cy - 31, 'WALMART', '#f5e642', '16px'),        // Walmart sign
        // sliding doors
        r(cx - 30, cy + 30, 40, 32, 0x334455),
        r(cx + 30, cy + 30, 40, 32, 0x334455),
        r(cx, cy + 30, 4, 32, 0x222233),                    // door gap
        // parking lot lines
        r(cx - 80, cy + 66, 3, 20, 0xffffff, 0.3),
        r(cx - 40, cy + 66, 3, 20, 0xffffff, 0.3),
        r(cx,      cy + 66, 3, 20, 0xffffff, 0.3),
        r(cx + 40, cy + 66, 3, 20, 0xffffff, 0.3),
        r(cx + 80, cy + 66, 3, 20, 0xffffff, 0.3),
        t(cx, cy + 46, 'ALWAYS LOW PRICES', '#aaaaaa'),
      ];

      case 'tire': return [
        overlay,
        r(cx, cy + 58, BASE_WIDTH, 28, 0x444444),           // ground
        r(cx, cy + 10, 220, 80, 0xf0e0c0),                  // building
        r(cx, cy - 30, 220, 22, 0xcc2222),                  // red band
        t(cx, cy - 31, 'DISCOUNT TIRE', '#ffffff'),
        // garage bays
        r(cx - 50, cy + 22, 72, 52, 0x222222),
        r(cx + 50, cy + 22, 72, 52, 0x222222),
        // bay door lines
        r(cx - 50, cy + 10, 70, 3, 0x444444), r(cx - 50, cy + 20, 70, 3, 0x444444),
        r(cx + 50, cy + 10, 70, 3, 0x444444), r(cx + 50, cy + 20, 70, 3, 0x444444),
        // tires displayed on wall
        c(cx - 88, cy - 8, 14, 0x222222), c(cx - 88, cy - 8, 8, 0x888888),
        c(cx + 88, cy - 8, 14, 0x222222), c(cx + 88, cy - 8, 8, 0x888888),
        c(cx,      cy - 8, 14, 0x222222), c(cx,      cy - 8, 8, 0x888888),
      ];

      case 'petsupply': return [
        overlay,
        r(cx, cy + 58, BASE_WIDTH, 28, 0x2a4a2a),           // ground
        r(cx, cy + 10, 210, 80, 0xd4e8a4),                  // building (green)
        r(cx, cy - 30, 214, 22, 0x8844cc),                  // purple band
        t(cx, cy - 31, 'PET SUPPLIES PLUS', '#ffffff'),
        // awning stripes
        r(cx - 60, cy - 10, 16, 20, 0xff8844), r(cx - 30, cy - 10, 16, 20, 0xff8844),
        r(cx,      cy - 10, 16, 20, 0xff8844), r(cx + 30, cy - 10, 16, 20, 0xff8844),
        r(cx + 60, cy - 10, 16, 20, 0xff8844),
        // window
        r(cx, cy + 22, 120, 44, 0x87ceeb),
        // pet silhouettes in window (simple shapes)
        c(cx - 30, cy + 18, 12, 0xf5c842),  // cat head
        r(cx - 30, cy + 34, 18, 10, 0xf5c842),  // cat body
        c(cx + 30, cy + 18, 10, 0xcc8844),  // dog head
        r(cx + 30, cy + 34, 22, 12, 0xcc8844),  // dog body
        // door
        r(cx, cy + 36, 18, 30, 0x6644aa),
      ];

      default: return [overlay, t(cx, cy, label, '#ffffff', '16px')];
    }
  }

  // ── Rest stop ─────────────────────────────────────────────────────────────────

  _openRestStop() {
    if (!this._riding) return; // another event is already showing
    this._riding = false;
    this._restStopTimerEvt = this.time.addEvent({
      delay: 3000, loop: true,
      callback: () => this._resources.applyChanges({ time: -1 }),
    });
    this._buildRestStopUI();
  }

  _rebuildRestStop() {
    if (this._restStopTimerEvt) { this._restStopTimerEvt.remove(); this._restStopTimerEvt = null; }
    if (this._restStopCon)      { this._restStopCon.destroy(true); this._restStopCon = null; }
    this._restStopTimerEvt = this.time.addEvent({
      delay: 3000, loop: true,
      callback: () => this._resources.applyChanges({ time: -1 }),
    });
    this._buildRestStopUI();
  }

  _buildRestStopUI() {
    const members = ['leo', ...this._party.getParty()];
    const rowH  = 26;
    const cardH = 20 + members.length * rowH + 10 + 22 + 8;
    const cardW = 462;
    const cardX = (BASE_WIDTH - cardW) / 2;
    const cardY = (BASE_HEIGHT - cardH) / 2;

    this._restStopCon = this.add.container(0, 0).setDepth(31);

    const overlay = this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.78);
    const bg      = this.add.rectangle(BASE_WIDTH / 2, cardY + cardH / 2, cardW, cardH, 0x06080f, 0.98);
    const border  = this.add.rectangle(BASE_WIDTH / 2, cardY + cardH / 2, cardW, cardH, 0, 0).setStrokeStyle(2, 0xf5a623);
    const title   = txt(this, BASE_WIDTH / 2, cardY + 6, 'REST STOP  —  time ticks while stopped, [R] to resume', {
      fontSize: '8px', color: '#f5a623',
    }).setOrigin(0.5, 0);
    this._restStopCon.add([overlay, bg, border, title]);

    let rowY = cardY + 22;
    members.forEach(id => {
      this._buildRestStopRow(id, cardX + 6, rowY, rowH);
      rowY += rowH;
    });

    rowY += 8;
    const resumeBg  = this.add.rectangle(BASE_WIDTH / 2, rowY + 10, 210, 20, 0x1a3a1a).setInteractive({ useHandCursor: true });
    const resumeLbl = txt(this, BASE_WIDTH / 2, rowY + 10, 'RESUME RIDING  →', { fontSize: '8px', color: '#88ff88' }).setOrigin(0.5);
    resumeBg.on('pointerover', () => resumeBg.setFillStyle(0x2a6a2a));
    resumeBg.on('pointerout',  () => resumeBg.setFillStyle(0x1a3a1a));
    resumeBg.on('pointerdown', () => this._closeRestStop());
    this._restStopCon.add([resumeBg, resumeLbl]);
  }

  _buildRestStopRow(id, x, rowY, rowH) {
    const objs = [];
    const makeRect = (rx, ry, w, h, c, a = 1) => {
      const o = this.add.rectangle(rx, ry, w, h, c, a);
      objs.push(o);
      return o;
    };
    const makeText = (tx, ty, s, style = {}) => {
      const o = txt(this, tx, ty, s, { fontSize: '8px', color: '#cccccc', ...style });
      objs.push(o);
      return o;
    };
    const cy = rowY + rowH / 2;

    // Row background
    makeRect(BASE_WIDTH / 2, cy, 462 - 4, rowH - 2, 0x0a0f1a);

    // Name (4 chars max to fit)
    const name = (MEMBER_NAMES[id] ?? id).substring(0, 4);
    makeText(x, cy, name, { color: '#cccccc' }).setOrigin(0, 0.5);

    const stam = Math.round(this._stamina[id] ?? 0);
    const bike = Math.round(this._bikeHP[id] ?? 0);

    // Stamina bar
    const sBarX = x + 40;
    const sW    = Math.max(1, Math.round(40 * stam / 100));
    const sCol  = stam > 50 ? 0x44cc44 : stam > 25 ? 0xf5a623 : 0xff3333;
    makeRect(sBarX + 20, cy, 40, 5, 0x111111);
    makeRect(sBarX, cy, sW, 4, sCol).setOrigin(0, 0.5);
    makeText(sBarX + 44, cy, String(stam), { color: '#667788' }).setOrigin(0, 0.5);

    // Bike bar
    const bBarX = x + 110;
    const bW    = Math.max(1, Math.round(40 * bike / 100));
    const bCol  = bike > 25 ? 0xef5350 : 0xff3333;
    makeRect(bBarX + 20, cy, 40, 5, 0x111111);
    makeRect(bBarX, cy, bW, 4, bCol).setOrigin(0, 0.5);
    makeText(bBarX + 44, cy, String(bike), { color: '#667788' }).setOrigin(0, 0.5);

    // ── Snack buttons ─────────────────────────────────────────────────────────
    const snacks = [
      { key: 'gatorade', label: 'GAT', boost: SNACK_STAMINA.gatorade },
      { key: 'granola',  label: 'GRN', boost: SNACK_STAMINA.granola  },
      { key: 'hotdog',   label: 'DOG', boost: SNACK_STAMINA.hotdog   },
    ];
    let btnX = x + 180;
    snacks.forEach(sn => {
      const avail = this._snackInv[sn.key] > 0;
      const bg    = makeRect(btnX + 14, cy, 28, rowH - 4, avail ? 0x1a3a1a : 0x111111);
      makeText(btnX + 14, cy, sn.label, { color: avail ? '#88ff88' : '#333333' }).setOrigin(0.5);
      if (avail) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setFillStyle(0x2a5a2a));
        bg.on('pointerout',  () => bg.setFillStyle(0x1a3a1a));
        bg.on('pointerdown', () => {
          this._snackInv[sn.key]--;
          this._stamina[id] = Math.min(100, (this._stamina[id] ?? 0) + sn.boost);
          this._warnedStamina.delete(id);
          this._fatigueTriggered.delete(id);
          this._rebuildRestStop();
        });
      }
      btnX += 30;
    });

    // ── Bike part buttons ─────────────────────────────────────────────────────
    const parts = [
      { key: 'patch', label: 'PAT', restore: BIKE_PART_RESTORE.patch },
      { key: 'tire',  label: 'TIR', restore: BIKE_PART_RESTORE.tire  },
      { key: 'chain', label: 'CHN', restore: BIKE_PART_RESTORE.chain  },
    ];
    btnX += 6;
    parts.forEach(pt => {
      const avail = this._bikeInv[pt.key] > 0;
      const bg    = makeRect(btnX + 14, cy, 28, rowH - 4, avail ? 0x0a1a2a : 0x111111);
      makeText(btnX + 14, cy, pt.label, { color: avail ? '#88ccff' : '#333333' }).setOrigin(0.5);
      if (avail) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setFillStyle(0x1a2a3a));
        bg.on('pointerout',  () => bg.setFillStyle(0x0a1a2a));
        bg.on('pointerdown', () => {
          this._bikeInv[pt.key]--;
          this._bikeHP[id] = Math.min(100, (this._bikeHP[id] ?? 0) + pt.restore);
          this._bikeTriggered.delete(id);
          this._warnedBike.delete(id);
          this._syncBikeToHud();
          this._rebuildRestStop();
        });
      }
      btnX += 30;
    });

    // ── DROP button (not available for Leo) ───────────────────────────────────
    if (id !== 'leo') {
      btnX += 8;
      const dropBg = makeRect(btnX + 20, cy, 40, rowH - 4, 0x2a0808);
      makeText(btnX + 20, cy, 'DROP', { color: '#ff5555' }).setOrigin(0.5);
      dropBg.setInteractive({ useHandCursor: true });
      dropBg.on('pointerover', () => dropBg.setFillStyle(0x4a0808));
      dropBg.on('pointerout',  () => dropBg.setFillStyle(0x2a0808));
      dropBg.on('pointerdown', () => this._confirmDropMember(id));
    }

    this._restStopCon.add(objs);
  }

  _closeRestStop() {
    if (this._restStopTimerEvt) { this._restStopTimerEvt.remove(); this._restStopTimerEvt = null; }
    if (this._restStopCon)      { this._restStopCon.destroy(true); this._restStopCon = null; }
    this._resumeRiding();
  }

  // Tears down the rest stop UI without resuming — used when showing a sub-dialog.
  _tearDownRestStop() {
    if (this._restStopTimerEvt) { this._restStopTimerEvt.remove(); this._restStopTimerEvt = null; }
    if (this._restStopCon)      { this._restStopCon.destroy(true); this._restStopCon = null; }
    // _riding stays false — we're still paused
  }

  _confirmDropMember(id) {
    const name = MEMBER_NAMES[id] ?? id.toUpperCase();
    this._tearDownRestStop();
    const choices = [
      { text: `YES — leave ${name} behind`, _action: 'confirm' },
      { text: 'NO — keep them in the group', _action: 'cancel' },
    ];
    this._eventCard.show({
      title:       `DROP ${name}?`,
      description: `${name} will be left behind and cannot rejoin. Make sure you want to do this.`,
      choices,
    }, (idx) => {
      if (choices[idx]._action === 'confirm') {
        this._showFloat(`${name} STAYED BEHIND.`, BASE_WIDTH / 2, BASE_HEIGHT * 0.38, '#ff8800');
        this._dropMember(id);
      }
      // Return to rest stop either way — if only Leo remains it'll show just him
      this._rebuildRestStop();
    });
  }

  _showBanner(label, onDone) {
    this._bannerTxt.setText(`>> ${label} <<`);
    this.tweens.add({
      targets: [this._bannerBg, this._bannerTxt],
      y: BASE_HEIGHT - 14, duration: 300,
      onComplete: () => {
        this.time.delayedCall(1600, () => {
          this.tweens.add({
            targets: [this._bannerBg, this._bannerTxt],
            y: BASE_HEIGHT + 20, duration: 300,
            onComplete: onDone,
          });
        });
      },
    });
  }

  // ── Random events ─────────────────────────────────────────────────────────────

  _triggerEvent() {
    this._riding = false;
    const event = this._events.drawEvent('act2');
    if (!event) { this._resumeRiding(); return; }

    this._eventCard.show(event, (choiceIndex) => {
      const result = this._events.applyChoice(event, choiceIndex);

      if (result.resourceChanges) {
        // EventSystem already called _resources.applyChanges — bridge to per-member values too
        this._applyPerMemberEffects(result.resourceChanges);
        Object.entries(result.resourceChanges).forEach(([key, delta]) => {
          if (delta === 0) return;
          const color = delta > 0 ? '#66bb6a' : '#ff4444';
          const label = key === 'bikeCondition' ? 'BIKE' : key.toUpperCase();
          this._showFloat(`${delta > 0 ? '+' : ''}${delta} ${label}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 20, color);
        });
      }

      // Drain stamina from the member who used their skill
      if (result.usedMember && this._stamina[result.usedMember] !== undefined) {
        const mName = MEMBER_NAMES[result.usedMember] ?? result.usedMember.toUpperCase();
        this._stamina[result.usedMember] = Math.max(0, this._stamina[result.usedMember] - SKILL_USE_COST);
        this._showFloat(`${mName}: -${SKILL_USE_COST} STAMINA`, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 10, '#f5a623');
      }

      if (result.partyLoss) {
        this._showFloat(`${result.partyLoss.toUpperCase()} WENT HOME!`, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 44, '#ff8800');
        this._dropMember(result.partyLoss);
      }

      this._resumeRiding();
    });
  }

  _resumeRiding() {
    this._eventTimer = EVENT_INTERVAL + (Math.random() * 2 - 1) * EVENT_JITTER;
    this._riding = true;
  }

  // ── Loss / arrival ────────────────────────────────────────────────────────────

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

  // ── Scrolling ─────────────────────────────────────────────────────────────────

  _scrollLayers(dt, speed) {
    this._roadStripes.forEach(s => { s.x -= speed * dt; if (s.x < -30) s.x += BASE_WIDTH + 60; });
    this._nearTrees.forEach(t  => { t.x -= speed * 0.55 * dt; if (t.x < -20) t.x += BASE_WIDTH + 40; });
    this._treeline.forEach(t   => { t.x -= speed * 0.2  * dt; if (t.x < -20) t.x += BASE_WIDTH + 40; });
  }

  // ── Build helpers ─────────────────────────────────────────────────────────────

  _buildTreeline(color, y, count) {
    const trees = [];
    for (let i = 0; i < count; i++) {
      const x = (i / count) * BASE_WIDTH + Math.random() * (BASE_WIDTH / count);
      trees.push(this.add.rectangle(x, y, 8 + Math.random() * 8, 20 + Math.random() * 18, color));
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
      const x = startX + i * spacing;
      this._bikerMap[m.id] = this._makeBiker(x, roadY, m.color);
      this._buildMemberBars(m.id, x, roadY);
    });
  }

  _makeBiker(x, y, color) {
    const body   = this.add.rectangle(x, y - 6, 8, 10, color);
    const wheel1 = this.add.circle(x - 5, y, 5, 0x333333);
    const wheel2 = this.add.circle(x + 5, y, 5, 0x333333);
    const tween  = this.tweens.add({ targets: [body, wheel1, wheel2], y: `+=2`, yoyo: true, repeat: -1, duration: 250 + Math.random() * 100 });
    return { body, wheel1, wheel2, tween, baseColor: color };
  }

  _buildMemberBars(id, x, roadY) {
    // Two thin bars stacked: stamina (green) above, bike (blue) below
    const stamY = roadY + 13;
    const bikeY = roadY + 20;

    const sBg   = this.add.rectangle(x, stamY, 16, 4, 0x111111);
    const sFill = this.add.rectangle(x - 7, stamY, 14, 3, 0x44cc44).setOrigin(0, 0.5);
    const bBg   = this.add.rectangle(x, bikeY, 16, 4, 0x111111);
    const bFill = this.add.rectangle(x - 7, bikeY, 14, 3, 0xef5350).setOrigin(0, 0.5);

    const shortName = (MEMBER_NAMES[id] ?? id).substring(0, 2);
    txt(this, x, bikeY + 8, shortName, { fontSize: '8px', color: '#555566' }).setOrigin(0.5);

    this._staminaBars[id] = { bg: sBg, fill: sFill };
    this._bikeBars[id]    = { bg: bBg, fill: bFill };
  }

  _removeBiker(memberId) {
    const biker = this._bikerMap[memberId];
    if (!biker) return;
    biker.tween?.stop();
    this.tweens.add({ targets: [biker.body, biker.wheel1, biker.wheel2], y: `+=${BASE_HEIGHT}`, alpha: 0, duration: 800 });
    const sb = this._staminaBars[memberId];
    const bb = this._bikeBars[memberId];
    if (sb) this.tweens.add({ targets: [sb.bg, sb.fill], alpha: 0, duration: 400 });
    if (bb) this.tweens.add({ targets: [bb.bg, bb.fill], alpha: 0, duration: 400 });
    delete this._bikerMap[memberId];
  }

  // ── Per-member bar visuals ────────────────────────────────────────────────────

  _updateStaminaBars() {
    Object.entries(this._staminaBars).forEach(([id, bars]) => {
      const st = this._stamina[id];
      if (st === undefined) return;
      bars.fill.setSize(Math.max(1, 14 * (st / 100)), 3);
      bars.fill.setFillStyle(st > 50 ? 0x44cc44 : st > 25 ? 0xf5a623 : 0xff3333);
      const biker = this._bikerMap[id];
      if (biker) {
        biker.body.setFillStyle(st < FATIGUE_CRIT ? 0xff2222 : st >= FATIGUE_WARN ? biker.baseColor : biker.baseColor);
      }
    });
  }

  _updateBikeBars() {
    Object.entries(this._bikeBars).forEach(([id, bars]) => {
      const hp = this._bikeHP[id];
      if (hp === undefined) return;
      bars.fill.setSize(Math.max(1, 14 * (hp / 100)), 3);
      bars.fill.setFillStyle(hp > 25 ? 0xef5350 : 0xff3333);
      // Wheel color per biker reflects their own bike condition
      const biker = this._bikerMap[id];
      if (biker) {
        const wc = hp < 25 ? 0x881111 : hp < 50 ? 0x664422 : 0x333333;
        biker.wheel1.setFillStyle(wc);
        biker.wheel2.setFillStyle(wc);
      }
    });
  }

  // ── Progress bar ─────────────────────────────────────────────────────────────

  _buildProgressBar() {
    const barY = BASE_HEIGHT - 10;  // near the very bottom edge
    const barW = BASE_WIDTH - 40;
    const barX = 20;
    this._progressBgW = barW;

    // Draw bar background FIRST so all labels render on top
    this.add.rectangle(barX + barW / 2, barY, barW, 7, 0x1a1a2a);
    this._progressFill = this.add.rectangle(barX, barY, 1, 5, 0xf5a623).setOrigin(0, 0.5);

    // HOME / DONUTS end labels — sit above the bar
    txt(this, barX,        barY - 12, 'HOME',   { fontSize: '8px', color: '#888888' });
    txt(this, barX + barW, barY - 12, 'DONUTS', { fontSize: '8px', color: '#f5a623' }).setOrigin(1, 0);

    // Checkpoint tick marks + location names
    CHECKPOINTS.forEach(cp => {
      const tickX = barX + (cp.distance / TOTAL_DISTANCE) * barW;
      this.add.rectangle(tickX, barY - 4, 2, 8, 0x4488ff, 0.7);
      txt(this, tickX, barY - 24, cp.tick ?? cp.label.split(' ')[0], { fontSize: '8px', color: '#4488ff' }).setOrigin(0.5);
    });
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
