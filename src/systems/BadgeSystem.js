// BadgeSystem — the replay engine (Phase R).
//
// Badges are earned by playing in different ways; each badge unlocks one or more
// named fart sounds (the reward economy). Everything persists in localStorage —
// INDEPENDENT of the per-run gameState/SaveSystem — so badges and unlocked farts
// survive "START GAME" and a full page reload.
//
// This module is imported by AudioManager (to filter playFart to unlocked sounds)
// and by any scene that awards a badge. It does NOT import AudioManager back — the
// unlock-reveal fart is played directly via scene.sound to avoid a circular import.

import { txt, BASE_WIDTH } from '../constants.js';

const STORAGE_KEY = 'leo-donut-badges';

// Fun display names for each fart file (sfx-fart-1 .. sfx-fart-20), 1-indexed.
const FART_NAMES = [
  'THE CLASSIC', 'THE SQUEAKER', 'THE TROMBONE', 'THE FOGHORN', 'THE BUBBLER',
  'THE ZIPPER', 'THE WHOOPEE', 'THE RASPBERRY', 'THE THUNDERCLAP', 'THE DUCK',
  'THE MOTORBIKE', 'THE BALLOON', 'THE KAZOO', 'THE DRUM SOLO', 'THE GURGLER',
  'THE AIR HORN', 'THE SNEAKER', 'THE TUBA', 'THE ESPRESSO', 'THE GRAND FINALE',
];

// Farts 1-6 are free from the start; the other 14 are locked behind badges.
const BASE_FARTS = [1, 2, 3, 4, 5, 6];

// Badge definitions. `farts` = fart indices this badge unlocks.
// Order here is the display order on the title-screen shelf (R4).
const BADGES = [
  { id: 'first_delivery',  name: 'FIRST DELIVERY', hint: 'Deliver the donuts once.',                 farts: [7] },
  { id: 'full_crew',       name: 'FULL CREW',      hint: 'Reach the Donut House with all 4 friends.', farts: [8] },
  { id: 'solo_rider',      name: 'LONE WOLF',      hint: 'Reach the Donut House with no friends.',    farts: [9] },
  { id: 'fart_storm',      name: 'FART STORM',     hint: 'Knock down 3 deer with one fart.',           farts: [10] },
  { id: 'tootnado',        name: 'TOOTNADO',       hint: 'Knock down 5 deer with one fart.',           farts: [11, 12] },
  { id: 'deer_whisperer',  name: 'DEER WHISPERER', hint: 'Topple 15 deer in a single run.',            farts: [13, 17] },
  { id: 'early_bird',      name: 'EARLY BIRD',     hint: 'Reach the Donut House ahead of schedule.',   farts: [14] },
  { id: 'survivor',        name: 'SURVIVOR',       hint: 'Win a run after the crew was worn out.',     farts: [15] },
  { id: 'big_spender',     name: 'DOZEN DOWN',     hint: 'Buy 12 or more donuts in one order.',        farts: [16, 18] },
  { id: 'golden_glaze',    name: 'GOLDEN GLAZE',   hint: 'Find all 3 hidden golden donuts.',           farts: [19] },
  { id: 's_rank',          name: 'S-RANK RIDER',   hint: 'Earn a grade of S.',                         farts: [20] },
];

const BADGE_BY_ID = Object.fromEntries(BADGES.map(b => [b.id, b]));

let _activeToasts = 0;   // for stacking simultaneous toasts

export default class BadgeSystem {
  static get BADGES()     { return BADGES; }
  static get FART_NAMES() { return FART_NAMES; }
  static get TOTAL_FARTS() { return FART_NAMES.length; }

  static _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const s = raw ? JSON.parse(raw) : null;
      return s && typeof s === 'object' ? { earned: s.earned ?? {} } : { earned: {} };
    } catch (e) {
      return { earned: {} };
    }
  }

  static _save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* private-mode / quota — badges just won't persist */ }
  }

  static has(id) {
    return !!BadgeSystem._load().earned[id];
  }

  // Mark a badge earned. Returns true only if it was NEWLY earned (idempotent).
  static award(id) {
    if (!BADGE_BY_ID[id]) return false;
    const state = BadgeSystem._load();
    if (state.earned[id]) return false;
    state.earned[id] = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    BadgeSystem._save(state);
    return true;
  }

  // All badge defs with earned state (for the title-screen shelf).
  static all() {
    const earned = BadgeSystem._load().earned;
    return BADGES.map(b => ({ ...b, earned: !!earned[b.id], earnedDate: earned[b.id] ?? null }));
  }

  static earnedCount() {
    const earned = BadgeSystem._load().earned;
    return BADGES.filter(b => earned[b.id]).length;
  }

  // Fart indices currently unlocked (base pool + every earned badge's farts).
  static unlockedFarts() {
    const earned = BadgeSystem._load().earned;
    const set = new Set(BASE_FARTS);
    BADGES.forEach(b => { if (earned[b.id]) b.farts.forEach(f => set.add(f)); });
    return [...set].sort((a, b) => a - b);
  }

  static fartName(index) { return FART_NAMES[index - 1] ?? `FART ${index}`; }

  // Award + celebrate in one call. Safe to call every time a condition is met —
  // it no-ops (no toast) if the badge is already earned. Returns true if newly earned.
  static awardAndToast(scene, id) {
    if (!BadgeSystem.award(id)) return false;
    BadgeSystem.toast(scene, id);
    return true;
  }

  // Slide-in banner, top-center: "BADGE EARNED: <NAME>" + a fart-unlock line.
  // Plays the first newly-unlocked fart once — the payoff moment.
  static toast(scene, id) {
    const badge = BADGE_BY_ID[id];
    if (!badge || !scene?.add) return;

    const slot   = _activeToasts++;
    const yShown = 24 + slot * 34;
    const width  = 300, height = badge.farts?.length ? 30 : 20;
    const cx     = BASE_WIDTH / 2;

    const con = scene.add.container(cx, -40).setScrollFactor(0).setDepth(200);
    con.add(scene.add.rectangle(0, 0, width, height, 0x120d05, 0.96).setStrokeStyle(2, 0xf5c542));
    con.add(txt(scene, 0, badge.farts?.length ? -6 : 0, `BADGE EARNED: ${badge.name}`,
      { fontSize: '8px', color: '#f5c542' }).setOrigin(0.5));
    if (badge.farts?.length) {
      con.add(txt(scene, 0, 7, `NEW FART: ${BadgeSystem.fartName(badge.farts[0])}!`,
        { fontSize: '8px', color: '#c6e37b' }).setOrigin(0.5));
    }

    scene.tweens.add({
      targets: con, y: yShown, duration: 300, ease: 'Back.Out',
      onComplete: () => {
        scene.time.delayedCall(2000, () => {
          scene.tweens.add({
            targets: con, y: -40, alpha: 0, duration: 250,
            onComplete: () => { con.destroy(); _activeToasts = Math.max(0, _activeToasts - 1); },
          });
        });
      },
    });

    // Play the freshly-unlocked fart once (the funny reward). Direct scene.sound
    // call — no AudioManager import, so there's no circular dependency.
    const fartIdx = badge.farts?.[0];
    if (fartIdx && scene.game?.registry?.get('audio-sfx')) {
      const key = `sfx-fart-${fartIdx}`;
      if (scene.cache?.audio?.exists(key)) {
        scene.time.delayedCall(200, () => scene.sound.play(key, { volume: 0.85 }));
      }
    }
  }
}
