import {
  SCENE_OREGON_TRAIL, SCENE_DIALOGUE, SCENE_GAME_OVER, SCENE_DONUT_SHOP,
  BASE_WIDTH, BASE_HEIGHT, txt, MUSIC_NEIGHBORHOOD,
} from '../constants.js';
import AudioManager from '../systems/AudioManager.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import PartySystem from '../systems/PartySystem.js';
import EventSystem from '../systems/EventSystem.js';
import EventCard from '../ui/EventCard.js';
import WalmartShopCard from '../ui/WalmartShopCard.js';
import { registerCharacterAnims } from '../utils/AnimationRegistry.js';
import { classifyChoice, RISK_SPREAD } from '../utils/choiceRisk.js';

// ── Ride constants ─────────────────────────────────────────────────────────────
const TOTAL_DISTANCE  = 2000;
const SCROLL_SPEED    = 45;    // px/s scenery scroll during a leg's travel animation

const FATIGUE_WARN    = 40;    // stamina level that flags a '!' warning on the board
const FATIGUE_CRIT    = 15;    // stamina level that tints a rider red
const BIKE_WARN       = 40;    // bike level that flags a '!' warning on the board
const SKILL_USE_COST  = 18;    // stamina cost when a member uses a skill

// Everyone drains at the same baseline per leg. Who ends up being the weak link
// is randomized PER RUN via per-member multipliers assigned in create() — so no
// rider is inherently weaker, and a different person tends to struggle each game.
const STAMINA_BASE = 4;  // baseline stamina drain per leg
const BIKE_BASE    = 3;  // baseline bike wear per leg

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

// ── Staged legs ────────────────────────────────────────────────────────────────
// The journey is a sequence of short ride segments ("legs") punctuated by stops.
// You ride a leg (scripted animation, no decisions), then arrive at a stop where a
// persistent status board shows everyone's state and ALL decisions happen with no
// time pressure. Checkpoint stops also run their location scene / shop first.
const LEGS = [
  { end:  200, stop: 'camp' },
  { end:  400, stop: 'checkpoint', cp: 'school'    },
  { end:  600, stop: 'camp' },
  { end:  800, stop: 'checkpoint', cp: 'walmart'   },
  { end: 1000, stop: 'camp' },
  { end: 1200, stop: 'checkpoint', cp: 'tire'      },
  { end: 1400, stop: 'camp' },
  { end: 1600, stop: 'checkpoint', cp: 'petsupply' },
  { end: 1800, stop: 'camp' },
  { end: 2000, stop: 'arrival' },
];
const LEG_TRAVEL_MS    = 3000;  // base ride duration per leg (scaled by pace)
const LEG_EVENT_CHANCE = 0.7;   // chance a plain camp leg draws a road event
const CHECKPOINT_BY_ID = Object.fromEntries(CHECKPOINTS.map(c => [c.id, c]));

// ── Pace + terrain (the per-leg strategy layer) ─────────────────────────────────
// PACE is set at each camp for the UPCOMING leg — the classic Oregon Trail trade:
// go EASY to spare the crew but burn the clock, or PUSH to save time and grind
// everyone down. `time` scales the leg's time cost; `drain` scales stamina+bike
// wear; `speed` scales how fast the ride animation plays.
const PACES = {
  easy:   { label: 'EASY',   time: 1.35, drain: 0.55, speed: 0.82, blurb: 'slow, but spares the crew' },
  steady: { label: 'STEADY', time: 1.0,  drain: 1.0,  speed: 1.0,  blurb: 'balanced' },
  push:   { label: 'PUSH',   time: 0.68, drain: 1.7,  speed: 1.35, blurb: 'fast, but grinds everyone down' },
};
const PACE_ORDER = ['easy', 'steady', 'push'];

// TERRAIN is rolled for each leg and PREVIEWED at the camp before it, so pace +
// snack decisions become planning. `stam`/`bike` scale that leg's respective wear;
// `time` scales its time cost. `color` tints the preview by how nasty it is.
const TERRAINS = [
  { id: 'smooth',   name: 'Smooth road',    hint: 'easy going',         time: 0.95, stam: 0.8, bike: 0.8, weight: 3, color: '#8fd694' },
  { id: 'downhill', name: 'Long downhill',  hint: 'a real breather',    time: 0.8,  stam: 0.3, bike: 1.1, weight: 2, color: '#8fd694' },
  { id: 'hill',     name: 'Big hill',       hint: 'brutal on the legs', time: 1.15, stam: 1.9, bike: 0.9, weight: 2, color: '#ffb060' },
  { id: 'headwind', name: 'Headwind',       hint: 'slow and tiring',    time: 1.25, stam: 1.4, bike: 1.0, weight: 2, color: '#ffb060' },
  { id: 'gravel',   name: 'Gravel stretch', hint: 'rough on the bikes', time: 1.1,  stam: 1.0, bike: 2.0, weight: 2, color: '#ff8866' },
  { id: 'rain',     name: 'Rain',           hint: 'slick and grueling', time: 1.15, stam: 1.3, bike: 1.5, weight: 1, color: '#ff8866' },
];

export default class OregonTrailScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_OREGON_TRAIL });
  }

  init(data) {
    this._initData = data ?? {};
  }

  create() {
    AudioManager.playMusic(this, MUSIC_NEIGHBORHOOD);
    // ── Systems ───────────────────────────────────────────────────────────────
    this._resources = new ResourceSystem(this.game);
    this._party     = new PartySystem(this.game);
    if (this._initData.resources) this._resources.restoreFromSave(this._initData.resources);
    if (this._initData.party)     this._initData.party.forEach(id => this._party.addMember(id));
    this.game.registry.set('resources', this._resources);
    this.game.registry.set('party',     this._party);
    this._events = new EventSystem(this._resources, this._party);

    // Snapshot the party + resources AS ARRIVED from Act 1, so a failed ride can be
    // retried unlimited times from this exact starting point (no redoing Act 1).
    this._entryParty     = this._party.getParty();       // member ids (leo is implicit)
    this._entryResources = this._resources.getAll();

    // Per-run random drain multipliers — randomize who becomes the weak link.
    this._staminaMult = {};
    this._bikeMult    = {};
    ['leo', ...this._party.getParty()].forEach(id => {
      this._staminaMult[id] = 0.7 + Math.random() * 0.7;  // 0.7–1.4×
      this._bikeMult[id]    = 0.7 + Math.random() * 0.7;
    });

    // ── Inventory (filled at Walmart, consumed on road) ───────────────────────
    this._snackInv = { gatorade: 0, granola: 0, hotdog: 0 };
    this._bikeInv  = { patch: 0, tire: 0, chain: 0 };

    // ── State ─────────────────────────────────────────────────────────────────
    this._distance          = 0;
    this._riding            = false;  // true only while a leg's travel animation plays
    this._gameOverFlag      = false;
    this._arrivalTriggered  = false;
    this._legIndex          = 0;      // index into LEGS
    this._phase             = 'travel';
    this._travel            = null;   // active leg animation state
    this._lastLegSummary    = null;   // { timeCost, incidents } shown on the camp board
    this._lastEventOutcome  = null;   // { text, color } outcome of this leg's choice
    this._campCp            = null;   // checkpoint being camped at (null for a plain camp)
    this._pace              = 'steady';           // pace chosen for the upcoming leg
    this._terrain           = this._rollTerrain(); // terrain of the upcoming leg (previewed at camps)

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

    // ── Second info strip (leg progress + clock + pace) ──────────────────────
    this.add.rectangle(BASE_WIDTH / 2, 53, BASE_WIDTH, 12, 0x000000, 0.58).setDepth(5);

    // Leg counter (left)
    this._legText = txt(this, 6, 53, '', { fontSize: '8px', color: '#aaaaaa' })
      .setOrigin(0, 0.5).setDepth(7);

    // Clock (center)
    this._etaText = txt(this, BASE_WIDTH / 2, 53, '', { fontSize: '8px', color: '#f5e642' })
      .setOrigin(0.5).setDepth(7);

    // Pace indicator (right)
    this._paceText = txt(this, BASE_WIDTH - 4, 53, '', { fontSize: '8px', color: '#44cc44' })
      .setOrigin(1, 0.5).setDepth(7);

    // ENTER / SPACE advances from a camp status board to the next leg.
    const advance = () => { if (this._phase === 'camp' && this._restStopCon) this._continueFromCamp(); };
    this.input.keyboard.addKey('ENTER').on('down', advance);
    this.input.keyboard.addKey('SPACE').on('down', advance);

    this._restStopCon      = null;  // reused as the camp status-board container
    this._restStopTimerEvt = null;

    // ── Landmark banner ───────────────────────────────────────────────────────
    this._bannerBg  = this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT + 20, BASE_WIDTH, 24, 0x000000, 0.88).setDepth(25);
    this._bannerTxt = txt(this, BASE_WIDTH / 2, BASE_HEIGHT + 20, '', {
      fontSize: '8px', color: '#f5e642',
    }).setOrigin(0.5).setDepth(26);

    this._resources.applyChanges({});
    this._party._emit();
    this._updateInvStrip();
    this._startLeg();
  }

  // ── Main loop: drives ONLY the current leg's travel animation ──────────────────
  // No drains, events, or warnings happen here — those resolve at stops. When the
  // leg's ride completes we hand off to _arriveAtStop().
  update(time, delta) {
    if (!this._riding || !this._travel) return;
    const dt = delta / 1000;
    const t  = this._travel;

    t.elapsed += delta;
    const k = Math.min(1, t.elapsed / t.duration);
    this._distance = t.startDist + (t.endDist - t.startDist) * k;

    // Spend the leg's time cost gradually as the bikes travel, and tick the clock.
    const target = t.timeCost * k;
    if (target > t.timeApplied) {
      this._resources.applyChanges({ time: -(target - t.timeApplied) });
      t.timeApplied = target;
      this._etaText.setText(`TIME ${timeToDisplay(this._resources.time)}`);
    }

    this._scrollLayers(dt, t.scrollSpeed);
    this._updateProgressBar();
    this._updateStaminaBars();
    this._updateBikeBars();

    if (k >= 1) {
      this._riding = false;
      this._arriveAtStop();
    }
  }

  // ── Leg lifecycle ──────────────────────────────────────────────────────────────

  _rollTerrain() {
    const total = TERRAINS.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of TERRAINS) { r -= t.weight; if (r <= 0) return t; }
    return TERRAINS[0];
  }

  _startLeg() {
    const leg = LEGS[this._legIndex];
    if (!leg) { this._triggerArrival(); return; }
    const health   = this._calcSpeedMult();      // healthy group rides faster
    const pace     = PACES[this._pace];
    const terr     = this._terrain;
    const baseTime = 4 / Math.max(0.35, health) + Math.random() * 2;
    this._travel = {
      startDist:   this._distance,
      endDist:     leg.end,
      elapsed:     0,
      duration:    LEG_TRAVEL_MS / Math.max(0.35, health * pace.speed),
      scrollSpeed: SCROLL_SPEED,
      // Time cost accrues gradually WHILE the bikes roll (see update()), then
      // freezes at the stop. Scaled by your pace choice and the leg's terrain.
      timeCost:    Math.max(1, Math.round(baseTime * pace.time * terr.time)),
      timeApplied: 0,
    };
    this._phase  = 'travel';
    this._riding = true;
    this._updatePaceEta();
  }

  _arriveAtStop() {
    const leg = LEGS[this._legIndex];
    this._distance = leg.end;
    this._updateProgressBar();

    // Apply this leg's cost ONCE; remember the summary so the board can show it.
    this._lastLegSummary = this._applyLegCost(leg);
    this._updatePaceEta(this._calcSpeedMult());

    // Loss is checked only at stops now — no per-frame surprises.
    if (!this._gameOverFlag) {
      if (this._resources.isTimeUp())    { this._triggerLoss('time');   return; }
      if (this._resources.isExhausted()) { this._triggerLoss('energy'); return; }
    }

    if (leg.stop === 'arrival') { this._triggerArrival(); return; }

    if (leg.stop === 'checkpoint') {
      const cp = CHECKPOINT_BY_ID[leg.cp];
      if (cp.autoEffect) this._resources.applyChanges(cp.autoEffect);
      this._showLocationScene(cp, () => this._openCamp(cp));
      return;
    }

    // Plain camp: sometimes a single road event, then the status board.
    if (Math.random() < LEG_EVENT_CHANCE) {
      this._triggerCampEvent(() => this._openCamp(null));
    } else {
      this._openCamp(null);
    }
  }

  // Arrival cost: one round of per-member stamina/bike drain (the leg's TIME cost
  // was already spent gradually during travel). Returns a summary for the board.
  _applyLegCost(leg) {
    const pace = PACES[this._pace];
    const terr = this._terrain;
    const incidents = [];
    incidents.push(...this._drainStaminaOnce(pace.drain * terr.stam));
    incidents.push(...this._drainBikesOnce(pace.drain * terr.bike));
    this._syncBikeToHud();

    return { timeCost: this._travel?.timeCost ?? 0, incidents, terrain: terr, pace: this._pace };
  }

  // Draws one Act-2 road event as an untimed card. Picking a choice rolls a
  // hidden optimal/sub-optimal outcome and reveals what actually happened.
  _triggerCampEvent(onDone) {
    const event = this._events.drawEvent('act2');
    if (!event) { onDone(); return; }
    this._eventCard.show(event, (choiceIndex) => {
      this._resolveChoiceAndReveal(event.choices[choiceIndex], onDone);
    });
  }

  // Rolls a CONTINUOUS luck value and scales the choice's effects along its risk
  // spread — so every outcome differs (no flat "nominal" result) and a risky
  // choice swings far more than a safe one. Also returns the best/worst extremes.
  _resolveChoice(choice) {
    const e       = choice.effects ?? {};
    const profile = classifyChoice(choice);
    const { good, bad } = RISK_SPREAD[profile];
    const L = Math.random();   // 0 = luckiest, 1 = unluckiest

    const negMult = good + (bad - good) * L;   // cost multiplier for this roll
    const posMult = 1.3 - 0.8 * L;             // gains shrink as luck worsens
    const scale = (v, nm, pm) => Math.round(v < 0 ? v * nm : v * pm);

    const resolved = {}, best = {}, worst = {};
    for (const k of ['time', 'energy', 'bikeCondition', 'distance', 'money', 'snacks']) {
      if (e[k] === undefined) continue;
      resolved[k] = scale(e[k], negMult, posMult);
      best[k]     = scale(e[k], good, 1.3);
      worst[k]    = scale(e[k], bad, 0.5);
    }

    const quality = L < 0.3 ? 'good' : L > 0.7 ? 'bad' : 'normal';
    let partyLoss = null;
    if (profile === 'gamble' && this._party.getSize() > 0) {
      const p = e.partyLossRisk ?? 0.3;
      if (L > 1 - p) {   // unlucky tail loses a rider, honoring the authored odds
        const party = this._party.getParty();
        partyLoss = party[Math.floor(Math.random() * party.length)];
      }
    }
    return { profile, quality, resolved, best, worst, partyLoss };
  }

  // "X could swing best..worst" for the dominant cost, so the player learns the
  // spread they were gambling against.
  _rangeText(best, worst) {
    let domK = null, domMag = 0;
    for (const k of ['time', 'energy', 'bikeCondition']) {
      const w = worst[k];
      if (w === undefined || w >= 0) continue;
      const mag = Math.abs(w) * (k === 'time' ? 1.2 : 1);
      if (mag > domMag) { domMag = mag; domK = k; }
    }
    if (!domK) return null;
    const label = { time: 'Time', energy: 'Energy', bikeCondition: 'Bikes' }[domK];
    return `${label} could swing ${this._deltaLabel(domK, best[domK])} to ${this._deltaLabel(domK, worst[domK])}`;
  }

  // Resolves + applies a choice, then shows an Oregon-Trail-style result card that
  // reveals what happened. Calls done() when the player dismisses the result.
  _resolveChoiceAndReveal(choice, done) {
    const res = this._resolveChoice(choice);
    this._applyEventEffects(res.resolved);
    if (choice.requiresPartyMember && this._stamina[choice.requiresPartyMember] !== undefined) {
      this._stamina[choice.requiresPartyMember] =
        Math.max(0, this._stamina[choice.requiresPartyMember] - SKILL_USE_COST);
    }
    this._lastEventOutcome = this._formatEventOutcome(res.resolved);

    if (res.partyLoss) {
      this._dropMember(res.partyLoss);
      this._announceMemberLost(res.partyLoss, done);   // the loss notice IS the reveal
      return;
    }

    // Title/blurb frame the roll RELATIVE TO EXPECTATION, so "you still paid
    // something, but less than you feared" reads correctly.
    const effText = this._effectsToText(res.resolved, true);
    const range   = this._rangeText(res.best, res.worst);
    const title   = { good: 'BETTER THAN EXPECTED', normal: 'ABOUT AS EXPECTED', bad: 'WORSE THAN EXPECTED' }[res.quality];
    const blurb   = {
      good:   this._pick(['You got off light.', 'Lucky — could have been worse.', 'That broke your way.']),
      normal: this._pick(['No real surprises.', 'Went about how you figured.', 'Nothing you did not expect.']),
      bad:    this._pick(['That stung more than you hoped.', 'Rough — it cost you.', 'Worse than you wanted.']),
    }[res.quality];
    const lines = [blurb, effText ? `This choice: ${effText}` : 'No harm done.'];
    if (range) lines.push(range);
    this._eventCard.show({
      title,
      description: lines.join('\n\n'),
      choices:     [{ text: 'Continue' }],
    }, () => done());
  }

  // ── Human-readable resource deltas ─────────────────────────────────────────────
  // Time is shown in MINUTES (matches the on-screen clock); energy/bike as % of
  // 100. `withMag` appends a plain size word so the player knows if it's a lot.
  _mag(a, lo, hi) { return a <= lo ? 'minor' : a <= hi ? 'moderate' : 'heavy'; }

  _deltaLabel(key, v, withMag = false) {
    if (!v) return null;
    const sign = v > 0 ? '+' : '-';
    const a    = Math.abs(v);
    let core, mag = null;
    switch (key) {
      case 'time':          { const m = Math.round(a * 1.2); core = `${sign}${m} min`;      mag = this._mag(m, 8, 18); break; }
      case 'energy':        core = `${sign}${a}% energy`;      mag = this._mag(a, 8, 18); break;
      case 'bikeCondition': core = `${sign}${a}% bike`;        mag = this._mag(a, 8, 18); break;
      case 'distance':      core = `${v} closer to donuts`;    break;
      case 'money':         core = `${v > 0 ? '+$' : '-$'}${a}`; break;
      case 'snacks':        core = `${sign}${a} snack${a > 1 ? 's' : ''}`; break;
      default: return null;
    }
    return withMag && mag ? `${core} (${mag})` : core;
  }

  _effectsToText(e, withMag = false) {
    return ['time', 'energy', 'bikeCondition', 'distance', 'money', 'snacks']
      .map(k => (e[k] !== undefined ? this._deltaLabel(k, e[k], withMag) : null))
      .filter(Boolean).join(', ');
  }

  // Blocking notice when a DECISION costs a teammate (an intentional drop already
  // has its own confirm dialog, so this only fires for event-driven losses).
  _announceMemberLost(id, done) {
    const name = MEMBER_NAMES[id] ?? id.toUpperCase();
    this._eventCard.show({
      title:       `${name} LEFT THE GROUP`,
      description: `That choice cost you a teammate — ${name} split off and headed home. The rest of the crew rides on without them.`,
      choices:     [{ text: 'Ride on...' }],
    }, () => done());
  }

  // Recaps your event choice's result on the camp board (labeled 'Your choice:' so
  // it reads as separate from the ride mishaps above it). Returns {text,color}|null.
  _formatEventOutcome(changes) {
    if (!changes) return null;
    const text = this._effectsToText(changes, false);
    if (!text) return null;

    const dmg  = Math.max(0, -(changes.energy || 0)) + Math.max(0, -(changes.bikeCondition || 0));
    const gain = Math.max(0,  (changes.energy || 0)) + Math.max(0,  (changes.bikeCondition || 0));
    const color = gain > dmg ? '#66dd66' : dmg > 0 ? '#ff8866' : '#cccccc';
    return { text: `Your choice: ${text}`, color };
  }

  _openCamp(cp) {
    this._campCp  = cp;
    this._phase   = 'camp';
    this._riding  = false;
    this._terrain = this._rollTerrain();   // roll the UPCOMING leg's terrain (previewed on board)
    this._pace    = 'steady';              // pace resets to steady each camp
    this._updateInvStrip();
    this._updatePaceEta();
    this._buildRestStopUI();  // the status board
  }

  _continueFromCamp() {
    // Any party member still at 0 stamina or 0 bike when you leave the camp has to
    // go home — this is your one chance to feed/fix them. (Leo never leaves.)
    const goingHome = this._party.getParty().filter(
      id => (this._stamina[id] ?? 1) <= 0 || (this._bikeHP[id] ?? 1) <= 0,
    );
    if (goingHome.length > 0) { this._sendMembersHome(goingHome); return; }
    this._advanceLeg();
  }

  _advanceLeg() {
    if (this._restStopCon) { this._restStopCon.destroy(true); this._restStopCon = null; }
    this._campCp = null;
    this._lastEventOutcome = null;  // outcome line belongs to the leg just finished
    this._legIndex++;
    this._startLeg();
  }

  // Drops members who bottomed out, each taking their equal share of the pooled
  // cash home with them (share = current pot / current crew size, Leo included).
  _sendMembersHome(ids) {
    const lines = [];
    ids.forEach(id => {
      const name     = MEMBER_NAMES[id] ?? id.toUpperCase();
      const reason   = (this._stamina[id] ?? 1) <= 0 ? 'too exhausted' : 'bike broke down';
      const crewSize = 1 + this._party.getParty().length;               // Leo + current party
      const share    = Math.floor(this._resources.money / crewSize);
      if (share > 0) this._resources.applyChanges({ money: -share });
      lines.push(`${name} (${reason}) took $${share}`);
      this._dropMember(id);
    });
    this._eventCard.show({
      title:       ids.length > 1 ? 'RIDERS HEADED HOME' : `${MEMBER_NAMES[ids[0]] ?? 'A RIDER'} HEADED HOME`,
      description: `${lines.join('.  ')}.  They each took their share of the pooled cash.`,
      choices:     [{ text: 'Ride on...' }],
    }, () => this._advanceLeg());
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

  // One leg's worth of stamina drain. Returns short incident strings (rare
  // tumbles/cramps) for the camp board to display — no transient floats.
  // `mult` folds in the leg's pace + terrain (e.g. PUSH up a hill drains hard).
  _drainStaminaOnce(mult = 1) {
    const incidents = [];
    const chance = 0.06 * Math.min(2, Math.max(0.6, mult));   // rough legs = more mishaps
    Object.keys(this._stamina).forEach(id => {
      const base = STAMINA_BASE * (this._staminaMult[id] ?? 1) * mult;
      let drain;
      if (Math.random() < chance) {
        drain = 15 + Math.random() * 13;  // flat 15-28 mishap (not base-scaled)
        const name = MEMBER_NAMES[id] ?? id.toUpperCase();
        const what = this._pick([`${name} took a tumble`, `${name} hit a cramp`, `${name} nearly wiped out`]);
        incidents.push(`${what} (-${Math.round(drain)}% energy)`);
      } else {
        drain = base * (0.5 + Math.random() * 1.2);
      }
      this._stamina[id] = Math.max(0, this._stamina[id] - drain);
    });
    return incidents;
  }

  // One leg's worth of bike wear. Returns incident strings for the board.
  _drainBikesOnce(mult = 1) {
    const incidents = [];
    const chance = 0.06 * Math.min(2, Math.max(0.6, mult));
    Object.keys(this._bikeHP).forEach(id => {
      const base = BIKE_BASE * (this._bikeMult[id] ?? 1) * mult;
      let drain;
      if (Math.random() < chance) {
        drain = 14 + Math.random() * 12;  // flat 14-26 mishap (not base-scaled)
        const name = MEMBER_NAMES[id] ?? id.toUpperCase();
        const what = this._pick([`${name} hit a pothole`, `${name}'s chain slipped`, `${name} clipped a curb`]);
        incidents.push(`${what} (-${Math.round(drain)}% bike)`);
      } else {
        drain = base * (0.5 + Math.random() * 1.2);
      }
      this._bikeHP[id] = Math.max(0, this._bikeHP[id] - drain);
    });
    return incidents;
  }

  _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  _updateInvStrip() {
    const s = this._snackInv, b = this._bikeInv;
    this._invText.setText(
      `GATO:${s.gatorade}  GRAN:${s.granola}  DOG:${s.hotdog}    PATCH:${b.patch}  TIRE:${b.tire}  CHAIN:${b.chain}`,
    );
  }

  // Right-hand strip = SCHEDULE status (are you ahead or behind the clock), so the
  // player knows whether to play a leg safe or take a faster/riskier choice.
  _updatePaceEta() {
    this._legText.setText(`LEG ${Math.min(this._legIndex + 1, LEGS.length)}/${LEGS.length}`);
    this._etaText.setText(`TIME ${timeToDisplay(this._resources.time)}`);

    // margin > 0 → spent less time than your share of the trip so far (ahead).
    const f      = this._distance / TOTAL_DISTANCE;
    const margin = f * 100 - (100 - this._resources.time);
    if      (f < 0.05)     this._paceText.setText('ON PACE').setColor('#f5a623');
    else if (margin > 8)   this._paceText.setText('AHEAD').setColor('#44cc44');
    else if (margin < -8)  this._paceText.setText('BEHIND').setColor('#ff3333');
    else                   this._paceText.setText('ON PACE').setColor('#f5a623');
  }

  // Push average bike condition to ResourceSystem so HUD bar stays current
  _syncBikeToHud() {
    const vals = Object.values(this._bikeHP);
    if (vals.length === 0) return;
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    this._resources.applyChanges({ bikeCondition: avg - this._resources.bikeCondition });
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
                // Roll + reveal the outcome, then fade the location back to the ride.
                this._resolveChoiceAndReveal(finalChoices[idx], () => this._fadeOutLocation(locCon, onDone));
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

  // ── Camp status board ──────────────────────────────────────────────────────────
  // Persistent, untimed stop shown between legs. Decisions happen here with no time
  // pressure. Rebuilt in place after any item use.

  _rebuildRestStop() {
    if (this._restStopCon) { this._restStopCon.destroy(true); this._restStopCon = null; }
    this._updateInvStrip();
    this._buildRestStopUI();
  }

  _buildRestStopUI() {
    const members    = ['leo', ...this._party.getParty()];
    const allInc     = this._lastLegSummary?.incidents ?? [];
    const incidents  = allInc.slice(0, 2);           // cap lines so the card fits 270px
    const extraInc   = allInc.length - incidents.length;
    const hasOutcome = !!this._lastEventOutcome;
    const atRisk     = members.filter(
      id => id !== 'leo' && ((this._stamina[id] ?? 1) <= 0 || (this._bikeHP[id] ?? 1) <= 0),
    );
    const terr = this._terrain;
    const lineH = 11;

    // Header: title + leg-cost + incidents (+more) + choice outcome + NEXT terrain.
    const headLines = 2 + incidents.length + (extraInc > 0 ? 1 : 0) + (hasOutcome ? 1 : 0) + 1;
    const headH     = headLines * lineH + 12;
    const paceH     = 16 + 4 + lineH + 8;   // pace buttons + blurb + gaps

    const cardW = 462;
    const cardX = (BASE_WIDTH - cardW) / 2;

    // Fit: shrink member rows only if a big party + lots of content would run off
    // the 270px screen; otherwise keep them comfortable.
    const MAXH  = 264;
    const fixed = headH + 10 + (atRisk.length ? lineH : 0) + paceH + 22 + 8;
    let rowH = 26;
    if (fixed + members.length * rowH > MAXH) {
      rowH = Math.max(20, Math.floor((MAXH - fixed) / members.length));
    }
    const cardH = fixed + members.length * rowH;
    const cardY = (BASE_HEIGHT - cardH) / 2;

    this._restStopCon = this.add.container(0, 0).setDepth(31);
    const overlay = this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.78);
    const bg      = this.add.rectangle(BASE_WIDTH / 2, cardY + cardH / 2, cardW, cardH, 0x06080f, 0.98);
    const border  = this.add.rectangle(BASE_WIDTH / 2, cardY + cardH / 2, cardW, cardH, 0, 0).setStrokeStyle(2, 0xf5a623);
    this._restStopCon.add([overlay, bg, border]);

    const line = (y, s, color, x = BASE_WIDTH / 2, ox = 0.5) => {
      this._restStopCon.add(txt(this, x, y, s, { fontSize: '8px', color }).setOrigin(ox, 0));
    };

    let ly = cardY + 5;
    const landmark = this._campCp ? this._campCp.label : 'REST STOP';
    line(ly, `${landmark}   -   LEG ${this._legIndex + 1}/${LEGS.length}   -   ${timeToDisplay(this._resources.time)}`, '#f5a623');
    ly += lineH;

    const s = this._lastLegSummary;
    const costText = s
      ? `The ${s.terrain?.name ?? 'ride'} cost ~${Math.round(s.timeCost * 1.2)} min` + (incidents.length === 0 ? ', no trouble' : ':')
      : 'Ready to ride.';
    line(ly, costText, '#99aabb'); ly += lineH;
    incidents.forEach(inc => { line(ly, inc, '#ff9966'); ly += lineH; });
    if (extraInc > 0) { line(ly, `(+${extraInc} more mishap${extraInc > 1 ? 's' : ''})`, '#ff9966'); ly += lineH; }
    if (hasOutcome) { line(ly, this._lastEventOutcome.text, this._lastEventOutcome.color); ly += lineH; }
    line(ly, `NEXT LEG:  ${terr.name}  -  ${terr.hint}`, terr.color); ly += lineH;

    // Member rows
    let rowY = cardY + headH;
    members.forEach(id => {
      this._buildRestStopRow(id, cardX + 6, rowY, rowH);
      rowY += rowH;
    });
    rowY += 6;

    // Red alert: riders at 0 will leave (and take their cash) if you continue now.
    if (atRisk.length) {
      const names = atRisk.map(id => MEMBER_NAMES[id] ?? id.toUpperCase()).join(' & ');
      line(rowY, `${names} head home unless you feed/fix them here!`, '#ff4444');
      rowY += lineH;
    }

    // ── Pace selector for the upcoming leg ──────────────────────────────────────
    const btnY = rowY + 8;
    line(btnY, 'PACE', '#8899aa', cardX + 14, 0);
    const bw = 74, gap = 10;
    const groupW = PACE_ORDER.length * bw + (PACE_ORDER.length - 1) * gap;
    let bx = BASE_WIDTH / 2 - groupW / 2 + bw / 2;
    PACE_ORDER.forEach(pid => {
      const sel = this._pace === pid;
      const btn = this.add.rectangle(bx, btnY + 4, bw, 16, sel ? 0x2a5a2a : 0x141420)
        .setStrokeStyle(1, sel ? 0x66cc66 : 0x333344).setInteractive({ useHandCursor: true });
      const lbl = txt(this, bx, btnY + 4, PACES[pid].label, { fontSize: '8px', color: sel ? '#ccffcc' : '#8899aa' }).setOrigin(0.5);
      btn.on('pointerover', () => { if (this._pace !== pid) btn.setFillStyle(0x22223a); });
      btn.on('pointerout',  () => { if (this._pace !== pid) btn.setFillStyle(0x141420); });
      btn.on('pointerdown', () => { this._pace = pid; this._rebuildRestStop(); });
      this._restStopCon.add([btn, lbl]);
      bx += bw + gap;
    });
    rowY += 20;
    line(rowY, `${PACES[this._pace].label}: ${PACES[this._pace].blurb}`, '#8899aa'); rowY += lineH + 4;

    // ── Continue ────────────────────────────────────────────────────────────────
    const contLabel = atRisk.length ? 'CONTINUE (lose riders)  →   [ENTER]' : 'CONTINUE  →   [ENTER]';
    const contBg  = this.add.rectangle(BASE_WIDTH / 2, rowY + 10, 260, 20, atRisk.length ? 0x3a1a1a : 0x1a3a1a).setInteractive({ useHandCursor: true });
    const contLbl = txt(this, BASE_WIDTH / 2, rowY + 10, contLabel, { fontSize: '8px', color: atRisk.length ? '#ffaaaa' : '#88ff88' }).setOrigin(0.5);
    contBg.on('pointerover', () => contBg.setFillStyle(atRisk.length ? 0x5a2a2a : 0x2a6a2a));
    contBg.on('pointerout',  () => contBg.setFillStyle(atRisk.length ? 0x3a1a1a : 0x1a3a1a));
    contBg.on('pointerdown', () => this._continueFromCamp());
    this._restStopCon.add([contBg, contLbl]);
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

    const stam = Math.round(this._stamina[id] ?? 0);
    const bike = Math.round(this._bikeHP[id] ?? 0);
    // A non-Leo rider at 0 stamina or 0 bike goes home on Continue unless fixed here.
    // Use RAW values so this matches the go-home check exactly (no rounding false alarms).
    const atRisk = id !== 'leo' && ((this._stamina[id] ?? 1) <= 0 || (this._bikeHP[id] ?? 1) <= 0);

    // Row background — red when a rider is about to leave
    makeRect(BASE_WIDTH / 2, cy, 462 - 4, rowH - 2, atRisk ? 0x3a0a0a : 0x0a0f1a);

    // Name (4 chars max to fit)
    const name = (MEMBER_NAMES[id] ?? id).substring(0, 4);
    makeText(x, cy, name, { color: atRisk ? '#ff6666' : '#cccccc' }).setOrigin(0, 0.5);

    // Persistent warning flag (stays until the condition clears — no fading text)
    if (atRisk) {
      makeText(x + 30, cy, '!!', { color: '#ff2222' }).setOrigin(0.5);
    } else if (stam < FATIGUE_WARN || bike < BIKE_WARN) {
      makeText(x + 32, cy, '!', { color: '#ff3333' }).setOrigin(0.5);
    }

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

  // ── Loss / arrival ────────────────────────────────────────────────────────────

  _triggerLoss(reason) {
    this._gameOverFlag = true;
    this._riding = false;
    this.cameras.main.fade(500, 0, 0, 0);
    // Retry restarts the ride from the Act-1 finish line (same party + resources),
    // not the whole game — unlimited attempts with the crew you brought.
    this.time.delayedCall(520, () => this.scene.start(SCENE_GAME_OVER, {
      reason,
      retryScene: SCENE_OREGON_TRAIL,
      retryData:  { party: this._entryParty, resources: this._entryResources },
    }));
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
      this._bikerMap[m.id] = this._makeBiker(m.id, x, roadY, m.color);
      this._buildMemberBars(m.id, x, roadY);
    });
  }

  _makeBiker(id, x, y, color) {
    const key = `sprite-${id}`;
    // Real character-on-bike sprite when available; else the colored-rectangle fallback.
    if (this.textures.exists(key)) {
      registerCharacterAnims(this.anims, key);
      const spr = this.add.sprite(x, y - 4, key, 'right-0').setDisplaySize(30, 30).setDepth(6);
      if (this.anims.exists(`${key}-walk-right`)) spr.play(`${key}-walk-right`);
      const tween = this.tweens.add({ targets: spr, y: '-=2', yoyo: true, repeat: -1, duration: 250 + Math.random() * 100 });
      return { body: spr, wheel1: null, wheel2: null, tween, baseColor: color, isSprite: true };
    }
    const body   = this.add.rectangle(x, y - 6, 8, 10, color);
    const wheel1 = this.add.circle(x - 5, y, 5, 0x333333);
    const wheel2 = this.add.circle(x + 5, y, 5, 0x333333);
    const tween  = this.tweens.add({ targets: [body, wheel1, wheel2], y: '+=2', yoyo: true, repeat: -1, duration: 250 + Math.random() * 100 });
    return { body, wheel1, wheel2, tween, baseColor: color, isSprite: false };
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
    this.tweens.add({ targets: [biker.body, biker.wheel1, biker.wheel2].filter(Boolean), y: `+=${BASE_HEIGHT}`, alpha: 0, duration: 800 });
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
        if (biker.isSprite) {
          if (st < FATIGUE_CRIT) biker.body.setTint(0xff5555); else biker.body.clearTint();
        } else {
          biker.body.setFillStyle(st < FATIGUE_CRIT ? 0xff2222 : biker.baseColor);
        }
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
        if (biker.wheel1) { biker.wheel1.setFillStyle(wc); biker.wheel2.setFillStyle(wc); }
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
