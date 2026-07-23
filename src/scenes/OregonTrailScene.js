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
import FX from '../systems/FX.js';
import { registerCharacterAnims } from '../utils/AnimationRegistry.js';

// ── Ride constants ─────────────────────────────────────────────────────────────
const TOTAL_DISTANCE  = 2000;
const SCROLL_SPEED    = 45;    // px/s scenery scroll during a leg's travel animation

// Baseline drain of the two GROUP bars per leg at STEADY pace on neutral terrain
// (pace + terrain scale these). Tuned so a careless run bottoms out and needs the
// stash, while smart pacing/resting keeps the crew going.
const CREW_DRAIN = 9;   // crew-energy points per leg
const BIKE_DRAIN = 7;   // bike-condition points per leg

// Snack effect on stamina (0–100 scale)
const SNACK_STAMINA = { gatorade: 33, granola: 67, hotdog: 100 };
// Bike part effect on bike condition (0–100 scale)
const BIKE_PART_RESTORE = { patch: 33, tire: 67, chain: 100 };

// Display metadata + best-first order so the camp stash button can NAME the exact item
// it will use and its size (lg/md/sm) — making the Walmart tiers visible + showing the
// finite stock depleting as you consume it (feature 3).
const SNACK_ORDER = ['hotdog', 'granola', 'gatorade'];
const PART_ORDER  = ['chain', 'tire', 'patch'];
const SNACK_META  = { hotdog: ['HOT DOG', 'lg'], granola: ['GRANOLA', 'md'], gatorade: ['GATORADE', 'sm'] };
const PART_META   = { chain: ['CHAIN', 'lg'], tire: ['TIRE', 'md'], patch: ['PATCH', 'sm'] };

// Convert the time resource → clock string. `time` is minutes remaining until the
// 5:00 PM deadline (270 = 12:30 PM start, 120 = 3:00 PM, 0 = 5:00 PM). The clock is
// therefore 5:00 PM minus `time` minutes. (The old formula assumed a 0–100 scale and
// produced negative minutes like "2:-7 PM" once time went past 100.)
function timeToDisplay(t) {
  const totalMin = 17 * 60 - Math.max(0, Math.round(t));   // minutes since midnight
  const hour24   = Math.floor(totalMin / 60);
  const min      = ((totalMin % 60) + 60) % 60;
  const ampm     = hour24 >= 12 ? 'PM' : 'AM';
  let   h12      = hour24 % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${min.toString().padStart(2, '0')} ${ampm}`;
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

    // The ride's time BUDGET = minutes-until-5PM when we set out. The TIME bar and the
    // ahead/behind check are measured as a fraction of this, so leaving Act 1 earlier
    // (a bigger budget) genuinely buys a more relaxed ride.
    this._timeMax = Math.max(1, this._resources.time);
    this.game.registry.set('resources', this._resources);
    this.game.registry.set('party',     this._party);
    this._events = new EventSystem(this._resources, this._party);

    // Snapshot the party + resources AS ARRIVED from Act 1, so a failed ride can be
    // retried unlimited times from this exact starting point (no redoing Act 1).
    this._entryParty     = this._party.getParty();       // member ids (leo is implicit)
    this._entryResources = this._resources.getAll();

    // ── Shared stash (filled at Walmart, consumed on the road) ────────────────
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
    this._lastLegSummary    = null;   // { recap } shown on the camp board
    this._lastEventOutcome  = null;   // { text, color } outcome of this leg's choice
    this._campCp            = null;   // checkpoint being camped at (null for a plain camp)
    this._pace              = 'steady';           // pace chosen for the upcoming leg
    this._terrain           = this._rollTerrain(); // terrain of the upcoming leg (previewed at camps)

    // Two GROUP bars (0-100) — the whole crew as a unit, Oregon-Trail style.
    // TIME is the master resource (this._resources.time / the clock).
    this._crew  = 100;   // crew energy/morale
    this._bikes = 100;   // fleet bike condition

    // Terrain-reactive ride FX (1A) — built per leg, torn down at stops.
    this._terrainFX       = [];
    this._terrainFXTweens = [];
    this._terrainFXTimer  = null;

    // ── Background ────────────────────────────────────────────────────────────
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.3,  BASE_WIDTH, BASE_HEIGHT * 0.6, 0x87ceeb);
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.08, BASE_WIDTH, BASE_HEIGHT * 0.16, 0xb8e8f8, 0.5);
    this._treeline  = this._buildTreeline(0x2d5a1b, BASE_HEIGHT * 0.45, 12);
    this._nearTrees = this._buildTreeline(0x1a3a10, BASE_HEIGHT * 0.55, 8);
    this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.7, BASE_WIDTH, BASE_HEIGHT * 0.6, 0x4a7a2a);
    this._roadStripes = this._buildRoad();

    // ── Bikers ────────────────────────────────────────────────────────────────
    this._bikerMap    = {};
    this._buildBikers();

    // ── Progress bar ──────────────────────────────────────────────────────────
    this._buildProgressBar();

    // ── Overlays ──────────────────────────────────────────────────────────────
    this._eventCard   = new EventCard(this);
    this._walmartCard = new WalmartShopCard(this, this._resources, this._snackInv, this._bikeInv);
    this._snackPicker = null; // built on demand

    // ── Group-bar strip: the two things you manage, always visible ────────────
    this.add.rectangle(BASE_WIDTH / 2, 38, BASE_WIDTH, 14, 0x000000, 0.70).setDepth(4);
    const mkBar = (labelX, label, color) => {
      txt(this, labelX, 38, label, { fontSize: '8px', color: '#ccd' }).setOrigin(0, 0.5).setDepth(6);
      const bx = labelX + (label.length * 8) + 6;
      this.add.rectangle(bx, 38, 60, 6, 0x222233).setOrigin(0, 0.5).setDepth(5);
      const fill = this.add.rectangle(bx + 1, 38, 58, 4, color).setOrigin(0, 0.5).setDepth(6);
      return { fill, w: 58 };
    };
    this._crewBar  = mkBar(8,   'CREW',  0x66cc66);
    this._bikesBar = mkBar(150, 'BIKES', 0xef5350);
    this._invText  = txt(this, BASE_WIDTH - 6, 38, '', { fontSize: '8px', color: '#8899aa' })
      .setOrigin(1, 0.5).setDepth(6);

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
    this._updateGroupHud();
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
    this._updateGroupHud();

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
    this._buildTerrainFX();   // 1A — visual weather/terrain for this leg
  }

  _arriveAtStop() {
    this._clearTerrainFX();   // 1A — tear down this leg's ride FX
    const leg = LEGS[this._legIndex];
    this._distance = leg.end;
    this._updateProgressBar();

    // Apply this leg's cost ONCE; remember the summary so the board can show it.
    this._lastLegSummary = this._applyLegCost(leg);
    this._updatePaceEta();

    // TIME running out is the only hard loss — a low crew/bikes bar just slows
    // you down (burning more time), it doesn't end the run.
    if (!this._gameOverFlag && this._resources.isTimeUp()) { this._triggerLoss('time'); return; }

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

  // Arrival cost: drain the two GROUP bars by this leg's pace + terrain (the TIME
  // cost was already spent gradually during travel). Returns a plain word recap.
  _applyLegCost(leg) {
    const pace = PACES[this._pace];
    const terr = this._terrain;
    const crewHit = Math.round(CREW_DRAIN * pace.drain * terr.stam * (0.7 + Math.random() * 0.6));
    const bikeHit = Math.round(BIKE_DRAIN * pace.drain * terr.bike * (0.7 + Math.random() * 0.6));
    this._crew  = Math.max(0, this._crew  - crewHit);
    this._bikes = Math.max(0, this._bikes - bikeHit);
    // Bank a run flag for the SURVIVOR badge (win after the crew was worn out).
    if (this._crew < 34) {
      const gs = this.game.registry.get('gameState') ?? {};
      gs.crewWasWornOut = true;
      this.game.registry.set('gameState', gs);
    }
    return { recap: this._legRecap(terr, crewHit, bikeHit), terrain: terr };
  }

  // One friendly sentence about how the leg went — no numbers.
  _legRecap(terr, crewHit, bikeHit) {
    const t = terr.name.toLowerCase();
    if (crewHit + bikeHit <= 6)  return 'Smooth going — barely a scratch.';
    if (crewHit >= 14)           return `That ${t} really wore the crew down.`;
    if (bikeHit >= 13)           return `The ${t} was rough on the bikes.`;
    return `You pushed through the ${t}.`;
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

  // Applies a chosen option to the GROUP bars + clock, then shows a plain, wordy
  // result card (Oregon-Trail style — no %, no ranges, no risk tiers). A little
  // luck softens or worsens the cost so it isn't fully solved up front.
  _resolveChoiceAndReveal(choice, done) {
    const e    = choice.effects ?? {};
    const roll = Math.random();
    const luck = roll < 0.25 ? 'good' : roll > 0.80 ? 'bad' : 'normal';
    const mul  = luck === 'good' ? 0.5 : luck === 'bad' ? 1.6 : 1;   // scales the COSTS only

    const applied = {};
    for (const k of ['time', 'energy', 'bikeCondition', 'distance', 'money', 'snacks']) {
      if (e[k] === undefined) continue;
      applied[k] = Math.round(e[k] < 0 ? e[k] * mul : e[k]);
    }
    this._applyEventEffects(applied);
    if (choice.requiresPartyMember) this._crew = Math.max(0, this._crew - 6);  // a helper tires the crew a bit
    this._lastEventOutcome = this._formatEventOutcome(applied);

    // Rare friend loss (only choices flagged risky), on bad luck.
    if (e.partyLossRisk && this._party.getSize() > 0 && Math.random() < e.partyLossRisk) {
      const p = this._party.getParty();
      const lost = p[Math.floor(Math.random() * p.length)];
      this._dropMember(lost);
      this._announceMemberLost(lost, done);
      return;
    }

    // Reveal fanfare (3A): good luck → confetti; bad luck → shake + red flash; a friend's
    // skill move → a cool sparkle. Neutral gets nothing — the contrast is the point.
    const cx = BASE_WIDTH / 2, cy = BASE_HEIGHT / 2 - 44;
    if (luck === 'good') {
      FX.burst(this, cx, cy, { count: 26, colors: [0x66dd66, 0xf5e642, 0x8fd694, 0xffffff],
        minSpeed: 60, maxSpeed: 190, minSize: 2, maxSize: 4, duration: 900, depth: 33, gravity: 45 });
    } else if (luck === 'bad') {
      this.cameras.main.shake(220, 0.008);
      this.cameras.main.flash(180, 120, 0, 0);
    }
    if (choice.requiresPartyMember) {
      FX.burst(this, cx, cy, { count: 14, colors: [0x7fd6c0, 0x8ac6ff, 0xffffff],
        minSpeed: 40, maxSpeed: 130, minSize: 1, maxSize: 3, duration: 700, depth: 33 });
    }

    const title = luck === 'good' ? 'THAT WENT WELL!' : luck === 'bad' ? 'BAD LUCK!' : 'OKAY THEN...';
    this._eventCard.show({
      title,
      description: this._plainOutcomeLine(applied),
      choices:     [{ text: 'Continue' }],
    }, () => done());
  }

  // Apply resource deltas to the group bars + clock (energy→CREW, bikeCondition→
  // BIKES, time→clock, distance→progress). Shared by road + checkpoint events.
  _applyEventEffects(e) {
    const clamp = v => Math.max(0, Math.min(100, v));
    if (e.time)          this._resources.applyChanges({ time: e.time });
    if (e.money)         this._resources.applyChanges({ money: e.money });
    if (e.energy)        this._crew  = clamp(this._crew  + e.energy);
    if (e.bikeCondition) this._bikes = clamp(this._bikes + e.bikeCondition);
    if (e.snacks)        this._crew  = clamp(this._crew  + e.snacks * 8);   // a snack ~ a crew boost
    if (e.distance)      this._distance = Math.min(TOTAL_DISTANCE - 10, this._distance + e.distance);
    this._updateGroupHud();
  }

  // Turn resource deltas into a plain sentence — no numbers, just what happened.
  _plainOutcomeLine(e) {
    const parts = [];
    if (e.time < 0)          parts.push('lost some time');
    if (e.time > 0)          parts.push('saved some time');
    if (e.distance > 0)      parts.push('gained ground toward the donuts');
    if (e.energy > 0 || e.snacks > 0) parts.push('the crew feels better');
    if (e.energy < 0)        parts.push('tired the crew out');
    if (e.bikeCondition > 0) parts.push('patched up the bikes');
    if (e.bikeCondition < 0) parts.push('wore the bikes down');
    if (e.money > 0)         parts.push('found a little cash');
    if (e.money < 0)         parts.push('spent a little cash');
    if (parts.length === 0)  return 'No harm done.';
    const s = parts.join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  // Blocking notice when a decision costs a teammate.
  _announceMemberLost(id, done) {
    const name = MEMBER_NAMES[id] ?? id.toUpperCase();
    this._eventCard.show({
      title:       `${name} HEADED HOME`,
      description: `${name} split off and rode home. The rest of the crew keeps going without them.`,
      choices:     [{ text: 'Ride on...' }],
    }, () => done());
  }

  // Camp-board recap line for the choice you just made (plain words).
  _formatEventOutcome(changes) {
    if (!changes) return null;
    const text = this._plainOutcomeLine(changes);
    if (text === 'No harm done.') return null;
    const dmg  = Math.max(0, -(changes.energy || 0)) + Math.max(0, -(changes.bikeCondition || 0));
    const gain = Math.max(0,  (changes.energy || 0)) + Math.max(0,  (changes.bikeCondition || 0));
    const color = gain > dmg ? '#66dd66' : dmg > 0 ? '#ff8866' : '#cccccc';
    return { text: `Your choice: ${text.toLowerCase()}`, color };
  }

  _openCamp(cp) {
    this._campCp  = cp;
    this._phase   = 'camp';
    this._riding  = false;
    this._terrain = this._rollTerrain();   // roll the UPCOMING leg's terrain (previewed on board)
    this._pace    = 'steady';              // pace resets to steady each camp
    this._updateGroupHud();
    this._updatePaceEta();
    this._buildRestStopUI();  // the status board
  }

  _continueFromCamp() {
    this._advanceLeg();
  }

  _advanceLeg() {
    if (this._restStopCon) { this._restStopCon.destroy(true); this._restStopCon = null; }
    this._campCp = null;
    this._lastEventOutcome = null;  // outcome line belongs to the leg just finished
    this._legIndex++;
    this._startLeg();
  }

  // ── Speed modulation ──────────────────────────────────────────────────────────
  // Low CREW or BIKES slows the group, which burns more TIME — the natural penalty.
  _calcSpeedMult() {
    const sM = 0.5 + 0.5 * Math.min(1, this._crew  / 60);
    const bM = 0.4 + 0.6 * Math.min(1, this._bikes / 50);
    // Whichever bar is lower drags the group.
    return Math.max(0.30, Math.min(sM, bM));
  }

  // One leg's worth of stamina drain. Returns short incident strings (rare
  _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Refresh the top CREW/BIKES bars + the stash count.
  _updateGroupHud() {
    if (this._crewBar)  this._crewBar.fill.setSize(Math.max(1, this._crewBar.w  * this._crew  / 100), 4);
    if (this._bikesBar) this._bikesBar.fill.setSize(Math.max(1, this._bikesBar.w * this._bikes / 100), 4);
    if (this._invText)  this._invText.setText(`SNACKS x${this._snackTotal()}   KITS x${this._repairTotal()}`);
  }

  _snackTotal()  { const s = this._snackInv; return s.gatorade + s.granola + s.hotdog; }
  _repairTotal() { const b = this._bikeInv;  return b.patch + b.tire + b.chain; }

  // Best-first item ids currently in the pack (null if empty) — for the camp button labels.
  _bestSnackId()  { return SNACK_ORDER.find(id => this._snackInv[id] > 0) ?? null; }
  _bestRepairId() { return PART_ORDER.find(id => this._bikeInv[id]  > 0) ?? null; }

  // Use a SPECIFIC snack the player picked → refill CREW by that item's amount.
  _useSnackType(id) {
    if (!this._snackInv[id] || this._snackInv[id] <= 0) return false;
    this._snackInv[id]--;
    this._crew = Math.min(100, this._crew + (SNACK_STAMINA[id] ?? 0));
    return true;
  }

  // Use a SPECIFIC bike part the player picked → refill BIKES by that part's amount.
  _useRepairType(id) {
    if (!this._bikeInv[id] || this._bikeInv[id] <= 0) return false;
    this._bikeInv[id]--;
    this._bikes = Math.min(100, this._bikes + (BIKE_PART_RESTORE[id] ?? 0));
    return true;
  }

  // A little overlay that lists the specific items you own so you can CHOOSE which one
  // to spend (they restore different amounts). Tapping one uses it and rebuilds the camp.
  _openSupplyPicker(kind) {
    const isSnack = kind === 'snack';
    const order   = isSnack ? SNACK_ORDER : PART_ORDER;
    const inv     = isSnack ? this._snackInv : this._bikeInv;
    const meta    = isSnack ? SNACK_META : PART_META;
    const DESC    = { lg: isSnack ? 'fills crew' : 'full fix', md: isSnack ? 'big boost' : 'big fix', sm: isSnack ? 'small boost' : 'small fix' };
    const owned   = order.filter(id => inv[id] > 0);
    if (owned.length === 0) return;

    const con = this.add.container(0, 0).setDepth(34);
    const rowH = 18, gap = 4, w = 250;
    const h = 30 + owned.length * (rowH + gap) + 22;
    const px = BASE_WIDTH / 2, py = BASE_HEIGHT / 2;
    con.add(this.add.rectangle(px, py, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.6).setInteractive());
    con.add(this.add.rectangle(px, py, w, h, 0x06080f, 0.99).setStrokeStyle(2, isSnack ? 0x66cc66 : 0xef5350));
    con.add(txt(this, px, py - h / 2 + 12, isSnack ? 'CHOOSE A SNACK' : 'CHOOSE A BIKE PART',
      { fontSize: '8px', color: isSnack ? '#8fd694' : '#ff9999' }).setOrigin(0.5));

    let ry = py - h / 2 + 28;
    owned.forEach(id => {
      const [name, sz] = meta[id];
      const label = `${name} - ${DESC[sz]}   x${inv[id]}`;
      const btn = con.add(this.add.rectangle(px, ry + rowH / 2, w - 20, rowH, 0x14261a)
        .setStrokeStyle(1, 0x2f6a3a).setInteractive({ useHandCursor: true }));
      con.add(txt(this, px, ry + rowH / 2, label, { fontSize: '8px', color: '#cde3d0' }).setOrigin(0.5));
      btn.on('pointerover', () => btn.setFillStyle(0x224a2e));
      btn.on('pointerout',  () => btn.setFillStyle(0x14261a));
      btn.on('pointerdown', () => {
        if (isSnack) this._useSnackType(id); else this._useRepairType(id);
        con.destroy(true);
        this._rebuildRestStop();
      });
      ry += rowH + gap;
    });

    const cancel = con.add(this.add.rectangle(px, ry + 9, 90, 16, 0x2a1a1a)
      .setStrokeStyle(1, 0x5a2a2a).setInteractive({ useHandCursor: true }));
    con.add(txt(this, px, ry + 9, 'CANCEL', { fontSize: '8px', color: '#ff9999' }).setOrigin(0.5));
    cancel.on('pointerdown', () => con.destroy(true));
  }

  // Right-hand strip = SCHEDULE status (are you ahead or behind the clock), so the
  // player knows whether to play a leg safe or take a faster/riskier choice.
  _updatePaceEta() {
    this._legText.setText(`LEG ${Math.min(this._legIndex + 1, LEGS.length)}/${LEGS.length}`);
    this._etaText.setText(`TIME ${timeToDisplay(this._resources.time)}`);

    // Ahead when you've covered more of the trip than you've spent of your time budget.
    const f      = this._distance / TOTAL_DISTANCE;
    const used   = (this._timeMax - this._resources.time) / this._timeMax;
    const margin = f - used;
    if      (f < 0.05)      this._paceText.setText('ON PACE').setColor('#f5a623');
    else if (margin > 0.08) this._paceText.setText('AHEAD').setColor('#44cc44');
    else if (margin < -0.08) this._paceText.setText('BEHIND').setColor('#ff3333');
    else                    this._paceText.setText('ON PACE').setColor('#f5a623');
  }

  // ── Shared drop helper ────────────────────────────────────────────────────────

  _dropMember(id) {
    this._removeBiker(id);
    this._party.removeMember(id);
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
    this._updateGroupHud();
    this._buildRestStopUI();
  }

  // Word + color for a group bar's level (kept short so it never runs off the card).
  _crewWord()  { return this._crew  > 66 ? ['fresh', '#8fd694'] : this._crew  > 33 ? ['tiring', '#ffcc66'] : ['worn out!', '#ff6666']; }
  _bikesWord() { return this._bikes > 66 ? ['good', '#8fd694'] : this._bikes > 33 ? ['rough', '#ffcc66'] : ['failing!', '#ff6666']; }

  // The whole camp UI: 3 bars, a heads-up, the pace lever, and two stash buttons.
  _buildRestStopUI() {
    const hasOutcome = !!this._lastEventOutcome;
    const terr  = this._terrain;
    const cardW = 300, cardX = (BASE_WIDTH - cardW) / 2;
    const cardH = 210 + (hasOutcome ? 12 : 0);
    const cardY = (BASE_HEIGHT - cardH) / 2;

    this._restStopCon = this.add.container(0, 0).setDepth(31);
    const add = o => { this._restStopCon.add(o); return o; };
    add(this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.8));
    add(this.add.rectangle(BASE_WIDTH / 2, cardY + cardH / 2, cardW, cardH, 0x06080f, 0.98));
    add(this.add.rectangle(BASE_WIDTH / 2, cardY + cardH / 2, cardW, cardH, 0, 0).setStrokeStyle(2, 0xf5a623));

    const line = (y, s, color, x = BASE_WIDTH / 2, ox = 0.5) =>
      add(txt(this, x, y, s, { fontSize: '8px', color }).setOrigin(ox, 0.5));

    // A labeled bar: NAME [====----] word
    const bar = (y, label, value, fillColor, word, wordColor) => {
      line(y, label, '#ccddee', cardX + 14, 0);
      add(this.add.rectangle(cardX + 70, y, 110, 8, 0x222233).setOrigin(0, 0.5));
      add(this.add.rectangle(cardX + 71, y, Math.max(1, 108 * value / 100), 6, fillColor).setOrigin(0, 0.5));
      if (word) line(y, word, wordColor, cardX + 188, 0);
    };

    let y = cardY + 13;
    const landmark = this._campCp ? this._campCp.label : 'REST STOP';
    line(y, landmark, '#f5a623'); y += 15;

    if (this._lastLegSummary) { line(y, this._lastLegSummary.recap, '#99aabb'); y += 12; }
    if (hasOutcome)           { line(y, this._lastEventOutcome.text, this._lastEventOutcome.color); y += 12; }
    y += 5;

    // Three bars. TIME is shown as a fraction of the ride's starting budget (0-100%).
    const timeWord = this._scheduleWord();
    const timePct  = Math.max(0, Math.min(100, this._resources.time / this._timeMax * 100));
    bar(y, 'TIME',  timePct, 0xf5e642, timeToDisplay(this._resources.time), timeWord[1]); y += 15;
    const cw = this._crewWord();  bar(y, 'CREW',  this._crew,  0x66cc66, cw[0], cw[1]); y += 15;
    const bw = this._bikesWord(); bar(y, 'BIKES', this._bikes, 0xef5350, bw[0], bw[1]); y += 18;

    // Terrain heads-up.
    line(y, `NEXT: ${terr.name} (${terr.hint})`, terr.color); y += 16;

    // Pace lever.
    line(y, 'SET YOUR PACE:', '#8899aa'); y += 16;
    const pw = 88, gap = 6;
    let bx = BASE_WIDTH / 2 - (PACE_ORDER.length * pw + (PACE_ORDER.length - 1) * gap) / 2 + pw / 2;
    PACE_ORDER.forEach(pid => {
      const sel = this._pace === pid;
      const btn = add(this.add.rectangle(bx, y, pw, 16, sel ? 0x2a5a2a : 0x141420)
        .setStrokeStyle(1, sel ? 0x66cc66 : 0x333344).setInteractive({ useHandCursor: true }));
      add(txt(this, bx, y, PACES[pid].label, { fontSize: '8px', color: sel ? '#ccffcc' : '#8899aa' }).setOrigin(0.5));
      btn.on('pointerover', () => { if (this._pace !== pid) btn.setFillStyle(0x22223a); });
      btn.on('pointerout',  () => { if (this._pace !== pid) btn.setFillStyle(0x141420); });
      btn.on('pointerdown', () => { this._pace = pid; this._rebuildRestStop(); });
      bx += pw + gap;
    });
    y += 21;
    line(y, PACES[this._pace].blurb, '#8899aa'); y += 16;

    // Two buttons that open an item PICKER, so you choose exactly which snack / part to
    // spend (they restore different amounts) — not an auto-pick. Count = total in the pack.
    const stashBtn = (cx2, label, enabled, handler) => {
      const btn = add(this.add.rectangle(cx2, y, 132, 16, enabled ? 0x1a3a2a : 0x1a1a22)
        .setStrokeStyle(1, enabled ? 0x4a8a5a : 0x2a2a33));
      add(txt(this, cx2, y, label, { fontSize: '8px', color: enabled ? '#aaf0c0' : '#556' }).setOrigin(0.5));
      if (enabled) {
        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerover', () => btn.setFillStyle(0x2a5a3a));
        btn.on('pointerout',  () => btn.setFillStyle(0x1a3a2a));
        btn.on('pointerdown', handler);
      }
    };
    const snacks = this._snackTotal(), kits = this._repairTotal();
    stashBtn(BASE_WIDTH / 2 - 70, `EAT A SNACK (x${snacks})`, snacks > 0 && this._crew < 100,
      () => this._openSupplyPicker('snack'));
    stashBtn(BASE_WIDTH / 2 + 70, `FIX A BIKE (x${kits})`, kits > 0 && this._bikes < 100,
      () => this._openSupplyPicker('part'));
    y += 23;

    // Continue.
    const contBg = add(this.add.rectangle(BASE_WIDTH / 2, y, 200, 18, 0x1a3a1a).setInteractive({ useHandCursor: true }));
    add(txt(this, BASE_WIDTH / 2, y, 'CONTINUE  →   [ENTER]', { fontSize: '8px', color: '#88ff88' }).setOrigin(0.5));
    contBg.on('pointerover', () => contBg.setFillStyle(0x2a6a2a));
    contBg.on('pointerout',  () => contBg.setFillStyle(0x1a3a1a));
    contBg.on('pointerdown', () => this._continueFromCamp());

    // First-stop tutorial tip (5B) — one line at the very bottom, only on the first camp.
    if (this._legIndex === 0) {
      add(txt(this, BASE_WIDTH / 2, BASE_HEIGHT - 9,
        'FIRST STOP! Set your pace, eat/fix if low, then CONTINUE.',
        { fontSize: '8px', color: '#ffcc66' }).setOrigin(0.5));
    }
  }

  // AHEAD / ON PACE / BEHIND word + color for the TIME bar.
  _scheduleWord() {
    const f      = this._distance / TOTAL_DISTANCE;
    const used   = (this._timeMax - this._resources.time) / this._timeMax;
    const margin = f - used;
    if (f < 0.05)        return ['on pace', '#f5a623'];
    if (margin > 0.08)   return ['ahead!',  '#44cc44'];
    if (margin < -0.08)  return ['behind!', '#ff3333'];
    return ['on pace', '#f5a623'];
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
    // Bank a run flag for the EARLY BIRD badge (arrived ahead of schedule).
    if (this._scheduleWord()[0] === 'ahead!') {
      const gs = this.game.registry.get('gameState') ?? {};
      gs.arrivedAhead = true;
      this.game.registry.set('gameState', gs);
    }
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

  // ── Terrain-reactive ride FX (1A) ───────────────────────────────────────────────
  // Cheap primitive visuals that make each terrain read at a glance DURING the ride.
  // Built when a leg starts, torn down when it arrives. Presentation only — never
  // touches time cost or the group bars. All objects live in this._terrainFX (+ tweens
  // and one optional timer) so teardown is a single loop.
  _buildTerrainFX() {
    this._clearTerrainFX();
    this._terrainFX       = [];
    this._terrainFXTweens = [];
    const id  = this._terrain?.id;
    const t   = this._travel;
    const add = (o, depth) => { o.setDepth(depth); this._terrainFX.push(o); return o; };
    const tw  = (cfg) => { const x = this.tweens.add(cfg); this._terrainFXTweens.push(x); return x; };
    const roadTop = BASE_HEIGHT * 0.64, roadBot = BASE_HEIGHT - 8;
    const bikerY  = BASE_HEIGHT * 0.62 + 6;
    const randY   = () => roadTop + Math.random() * (roadBot - roadTop);
    const randBiker = () => {
      const ids = Object.keys(this._bikerMap ?? {});
      return ids.length ? this._bikerMap[ids[Math.floor(Math.random() * ids.length)]] : null;
    };

    if (id === 'downhill') {
      if (t) t.scrollSpeed *= 1.6;                    // whipping downhill
      for (let i = 0; i < 4; i++) {
        const line = add(this.add.rectangle(BASE_WIDTH + 60, randY(), 52, 2, 0xffffff, 0.25), 8);
        tw({ targets: line, x: -60, duration: 420, repeat: -1, delay: i * 130,
             onRepeat: () => { line.y = randY(); } });
      }
      this._setBikerBobScale(1.8);                    // legs pumping faster
    } else if (id === 'hill') {
      if (t) t.scrollSpeed *= 0.6;                    // grinding uphill
      add(this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.2, BASE_WIDTH, BASE_HEIGHT * 0.4, 0xffaa55, 0.12), 3);
      this._terrainFXTimer = this.time.addEvent({ delay: 700, loop: true, callback: () => {
        const b = randBiker(); if (!b) return;
        const bx = b.body?.x ?? BASE_WIDTH / 2;
        const drop = this.add.rectangle(bx + (Math.random() * 8 - 4), bikerY - 14, 2, 3, 0x8ac6ff).setDepth(9);
        this.tweens.add({ targets: drop, y: drop.y - 16, alpha: 0, duration: 600, onComplete: () => drop.destroy() });
      }});
    } else if (id === 'headwind') {
      const cols = [0x8fae5a, 0xb5883f, 0x6f9440];
      for (let i = 0; i < 6; i++) {
        const leaf = add(this.add.rectangle(BASE_WIDTH + 20, randY(), 3, 2, cols[i % cols.length]), 8);
        tw({ targets: leaf, x: -20, duration: 620 + Math.random() * 160, repeat: -1, delay: i * 90,
             onRepeat: () => { leaf.y = randY(); } });
        tw({ targets: leaf, y: '+=6', duration: 380, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    } else if (id === 'gravel') {
      this._terrainFXTimer = this.time.addEvent({ delay: 500, loop: true, callback: () => {
        this.cameras.main.shake(80, 0.0015);
        const b = randBiker(); if (!b) return;
        const bx = b.body?.x ?? BASE_WIDTH / 2;
        for (let i = 0; i < 3; i++) {
          const p = this.add.circle(bx + (Math.random() * 10 - 5), bikerY + 6, 1 + Math.random() * 2, 0x9a8f7a, 0.7).setDepth(9);
          this.tweens.add({ targets: p, y: p.y - 8 - Math.random() * 6, alpha: 0, duration: 420, onComplete: () => p.destroy() });
        }
      }});
    } else if (id === 'rain') {
      add(this.add.rectangle(BASE_WIDTH / 2, BASE_HEIGHT * 0.2, BASE_WIDTH, BASE_HEIGHT * 0.4, 0x5a7a9a, 0.25), 3);
      this._roadStripes?.forEach(s => s.setAlpha(0.15));
      for (let i = 0; i < 20; i++) {
        const x0 = Math.random() * (BASE_WIDTH + 40) - 20;
        const drop = add(this.add.rectangle(x0, roadTop - 20, 1, 6, 0xaad4ff, 0.5), 9);
        tw({ targets: drop, y: roadBot + 10, duration: 480 + Math.random() * 260, repeat: -1, delay: i * 30 });
      }
    }
    // 'smooth' → no FX (baseline calm).
  }

  _setBikerBobScale(scale) {
    Object.values(this._bikerMap ?? {}).forEach(b => { if (b.tween) b.tween.timeScale = scale; });
  }

  _clearTerrainFX() {
    (this._terrainFXTweens ?? []).forEach(t => t.stop());
    this._terrainFXTweens = [];
    (this._terrainFX ?? []).forEach(o => o.destroy());
    this._terrainFX = [];
    if (this._terrainFXTimer) { this._terrainFXTimer.remove(); this._terrainFXTimer = null; }
    this._setBikerBobScale(1);
    this._roadStripes?.forEach(s => s.setAlpha(0.35));
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

  _removeBiker(memberId) {
    const biker = this._bikerMap[memberId];
    if (!biker) return;
    biker.tween?.stop();
    this.tweens.add({ targets: [biker.body, biker.wheel1, biker.wheel2].filter(Boolean), y: `+=${BASE_HEIGHT}`, alpha: 0, duration: 800 });
    delete this._bikerMap[memberId];
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
