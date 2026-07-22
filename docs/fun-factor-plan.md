# Fun-Factor Plan — Leo's Donut Quest

**Status: NOT STARTED.** This is a handoff-ready plan. Any model (or human) should be able
to execute it top-to-bottom with no other context. Work phase by phase, commit after each
lettered item, and verify with the recipes in §7 before committing.

---

## 1. What this game is

A Phaser 3 + Vite retro pixel-art browser game for kids (the target player is a child —
every mechanic must be readable without numbers or percentages). Three acts:

- **Act 1 — Neighborhood** (`src/scenes/NeighborhoodScene.js`): top-down open map of Tega
  Cay. Leo bikes around, farts (F key) to knock down deer for time bonuses, recruits 4
  friends (Warren, MJ, Carson, Justin) by beating a mini-boss at each friend's house.
  Clock drains only while moving. Exit zone starts Act 2.
- **Act 2 — The Ride** (`src/scenes/OregonTrailScene.js`): Oregon-Trail-style staged
  journey to the Donut House. 10 legs; each leg is a ~3s scripted side-scroll ride, then an
  untimed **camp board** where the player sees TIME/CREW/BIKES bars, a terrain preview,
  picks a pace (EASY/STEADY/PUSH), and uses stash items. Random text events with a hidden
  luck roll. Running out of TIME is the only loss; unlimited retries from the Act-2 start.
- **Act 2.5** — Donut shop purchase (`DonutShopScene`), sunset ride home
  (`ReturnJourneyScene`), then **Act 3 — Boss Gauntlet** (`BossGauntletScene` →
  Nora/Max/Max/Grace sibling fights + Edie finale), then a graded report card
  (`ReportCardScene` + `ScoreSystem`) and a title-screen leaderboard.

Run locally: `npx vite` → http://localhost:5173/leo-donut-quest/ . Build: `npx vite build`.
Base path is `/leo-donut-quest/`. Commit messages end with the Claude co-author line used
in this repo's history (`git log` shows the format).

## 2. Locked design principles (earned through playtests — do not violate)

1. **Plain words, not numbers.** Camp boards and event outcomes use bars + words
   ("worn out!", "ahead!"), never percentages, ranges, or point values. The player is a kid.
2. **Camps are untimed.** The clock only moves while bikes visibly move. Never add time
   pressure to a decision screen.
3. **No risk tiers / stat previews on choices.** Choices show a short plain-language hint
   ("risky — could cost a friend"); outcomes are a hidden luck roll revealed afterward.
   A previous risk-tier system was built and deliberately deleted (`src/utils/choiceRisk.js`).
4. **Only TIME can end the run** in Act 2. Low CREW/BIKES just slows you down.
5. **Font is Press Start 2P, 8px grid, ASCII only.** No emoji in game text. Keep strings
   short — long words run off cards.
6. **The fart is the joy engine.** When in doubt, more fart payoff, not more systems.
7. **Static places, random moments.** Act 1 positions (pickups, secrets, herd homes,
   trails, patrol routes) are FIXED and learnable — mastery-through-knowledge is Act 1's
   replay value. Per-run variance comes from *moments*, not places: deer wander inside
   their boxes, traffic phase is randomized, Act 2 rolls terrain/events/luck, and remix
   modes re-season the rules. Do not "add replayability" by shuffling Act 1 placements —
   that destroys route knowledge and makes secrets meaningless. See 2D edit (vi).
8. **Don't re-add complexity to Act 2.** It was just simplified from per-member bars down
   to 3 group bars (see `docs/act2-simplification-plan.md`). Everything below adds *juice*
   and *moment-to-moment play*, not new resources or numbers.

## 3. Fun diagnosis (why these items, in one paragraph each)

**Act 2's ride legs are dead time.** The strategic layer (pace, terrain, stash) is now
solid, but the actual riding — the part that *looks* like gameplay — is a 3-second
non-interactive scroll that is visually identical whether the leg is "Rain" or "Long
downhill". The single highest-impact change is making the ride itself alive: terrain you
can *see*, and small things to grab while rolling. That converts the game's most frequent
moment from waiting into playing.

**Act 1's map is big and empty between destinations.** The 320×160-tile world looks great
but most riding is uneventful travel between friend houses. The fart/deer combo loop is
genuinely fun but opportunities are scattered. Fix: put rewards *on the roads themselves*
(collectible trails that guide and pay), concentrate deer into comboable herds, and reward
near-misses so dodging traffic becomes thrilling instead of merely punishing.

**Wins don't celebrate enough.** Good luck on an event, arriving at the Donut House, and
finishing the game are all bigger emotional beats than the current presentation gives them.
Cheap fanfare (confetti, stingers, screen shake) multiplies perceived fun.

**The meta-loop hook is buried.** A leaderboard + grade system exists but the title screen
doesn't dare the player to beat their best grade, and scores save with `???` initials —
kids love typing their initials arcade-style.

**Nothing persists between runs, so there is no reason for run #3.** Score chasing alone
doesn't hold a kid. The game already owns two perfect (and free) replay assets it isn't
using: a **20-sound fart library** that's fully available from minute one (a reward
economy wasted as ambient noise), and a big Act-1 map that's fully seen in one run.
Phase R below converts these into a persistent collect-a-thon: badges that unlock named
fart sounds, hidden golden donuts, and post-win remix modes. This is the replayability
core of the whole plan.

---

## 4. THE PLAN — ranked by fun-per-effort

### Phase 1 — Act 2: make the ride alive  ★ do this first

#### 1A. Terrain-reactive ride visuals
**File:** `src/scenes/OregonTrailScene.js`. Terrain defs are `TERRAINS` (~line 167); the
per-leg travel state is built in `_startLeg()` (~line 332); the scroll loop is `update()`
(~line 296) + `_scrollLayers()` (~line 890). The upcoming leg's terrain is already stored
in `this._terrain` when the leg starts.

Make each terrain visibly different **during the ride** (all cheap Phaser primitives, no
new assets):

| terrain | visual spec |
|---|---|
| `smooth` | baseline (nothing new) |
| `downhill` | scrollSpeed ×1.6; 3–4 horizontal white "speed line" rectangles (alpha 0.25) streaking right-to-left across the road area; bikers' bob tween faster |
| `hill` | scrollSpeed ×0.6; tint sky slightly warmer; every ~700ms a small sweat-drop rectangle pops above a random biker (reuse `_showFloat` with `'..!'` or a 2×3 blue rect tween) |
| `headwind` | 5–6 small leaf rectangles (green/brown, 3×2) blowing right-to-left FASTER than the road scroll, with sine-wave vertical wobble |
| `gravel` | camera micro-shake: `this.cameras.main.shake(80, 0.0015)` every ~500ms while riding; occasional gray dust puff circles at wheel height |
| `rain` | sky rectangles tinted `0x5a7a9a`; ~20 falling rain streaks (1×6 light-blue rects, alpha 0.5) recycled top-to-bottom; road stripes dimmed |

Implementation shape: add `_buildTerrainFX(terrainId)` called from `_startLeg()` and
`_clearTerrainFX()` called in `_arriveAtStop()`. Keep all FX objects in one array +
one optional looping timer so teardown is a single loop. Scroll-speed multipliers go into
`this._travel.scrollSpeed` (do NOT change `timeCost` — terrain time cost already exists;
this is presentation only).

**Accept when:** a headless screenshot during a rain leg vs a downhill leg (see §7) are
obviously different at a glance; camp board unaffected; no FX objects leak between legs
(ride 3+ legs in a row).

#### 1B. Roadside grab-ems (interactive travel) — ❌ CUT (built, then removed after playtest)
> **Decision (playtest verdict):** implemented and cut. Grabbing pickups during the
> auto-ride fought Act 2's own "the ride is automatic, decisions happen at camp" model,
> had no signposting, and the payoff was invisible in the moment. Do not rebuild. The
> "collect while moving" fantasy lives in Act 1 instead (donut-hole trails, 2A/2D).
> Terrain ambiance (1A) was kept. Original spec preserved below for the record.

Same file. During each leg's travel, spawn 1–3 pickups that scroll with the road
(right edge → left) at biker height ±20px: a **donut hole** (tan circle, +6 CREW), a
**wrench** (gray rect, +6 BIKES), rarely a **clock** (yellow circle, +2 time). The player
grabs one by clicking/tapping it OR pressing SPACE when it overlaps any biker
(generous hitbox, ≥24px — kids). On grab: `FX`-style pop text ("+CREW!", "+BIKES!",
"+2s") and remove. Missed pickups just scroll off — no penalty, no message.

Notes: this scene has no `FX` import; either import `src/systems/FX.js` or reuse the
existing `_showFloat()` (~line 988). SPACE already advances camps (`create()`, ~line 274) —
the camp guard `this._phase === 'camp'` means travel-time SPACE handling won't conflict,
but add the grab handler as its own listener gated on `this._phase === 'travel'`.
Clamp CREW/BIKES to 100. Spawn odds per leg: 100% one, 40% a second, 15% a third;
type weights donut 45 / wrench 35 / clock 20.

**Accept when:** pickups are grabbable by mouse and by SPACE, award correctly, never
appear on camp boards, and never linger after `_arriveAtStop()`.

### Phase 2 — Act 1: reward the riding

#### 2A. Donut-hole trails on the roads
**Files:** `src/scenes/NeighborhoodScene.js` (follow the `BeanPickup` pattern:
`_spawnBeans` ~line 769, `_checkBeanPickups`, persistence via `_collectedSet`/
`_markCollected`), new entity `src/entities/DonutHolePickup.js` (copy
`src/entities/BeanPickup.js`, draw a small tan circle w/ darker center), and
`public/maps/neighborhood_map.json` if you prefer data-driven spots (optional — a
hardcoded SPOTS array like beans is fine and consistent).

Lay **trails of 5–8 donut holes** along the natural routes: Leo's house → Windward Dr →
each friend's house, plus one trail into the golf course and one along the lake road.
~40–60 total. Each collected: `+$1` money, a tiny pop ("+$1"), and increment
`gs.donutHolesCollected` on the persistent gameState (same pattern as `gs.deerToppled`,
see the fart handler ~line 205). Persist collected indices (`'collectedDonutHoles'`) so
they survive boss fights and save/continue.

Wire into scoring: add `holes` to `ScoreSystem.calculate/breakdown`
(`src/systems/ScoreSystem.js` — suggested `holes × 3`, label `'DONUT HOLES'`), pass it
from `ReportCardScene` (reads gameState like `deerToppled`), and bump grade thresholds
by ~+60 across the board so grades don't inflate (S≥740 / A≥580 / B≥430 / C≥250).

**Why it works:** trails double as navigation (breadcrumbs to each friend) and make money
feel earned before the Walmart/donut purchases spend it.

**Accept when:** trails visible on roads, collecting pays $1 + pop, counts persist through
a boss fight, report card shows the new row, and money at Act 2 start reflects pickups.

#### 2B. Deer combo parks
**File:** `public/maps/neighborhood_map.json` → `obstacles` array (loaded by
`_spawnObstaclesFromMap`, NeighborhoodScene ~line 912; format documented ~line 904).
The existing fart knockdown already pays +2s per deer and a combo bonus at 2+ — the
problem is herds dense enough to combo are rare. **Exact herd coordinates, bean pairings,
and the prerequisite park/golf drivability change are specified in 2D — implement 2B and
2D together as one placement pass.**

**Accept when:** a power fart in a cluster reliably triggers a "3x COMBO!" popup.

#### 2C. Close-call bonus
**File:** `src/scenes/NeighborhoodScene.js` + obstacle entities (`CarObstacle`,
`GolfCartObstacle` — both have `_x/_y` and a hit callback). Each obstacle `update()` (or a
scene-level check in `update()`) detects: player within 26px of a *moving* car/cart, no
collision, and no near-miss registered for that obstacle in the last 4s → award `+1s`
time, pop `CLOSE ONE! +1s` in yellow, tiny `FX.shake`. Cap: max ~1 per second globally so
it can't be farmed by hovering.

**Why:** traffic currently only punishes; this makes weaving through it *thrilling* —
risk-seeking gets rewarded, which is the fun of a bike game.

**Accept when:** skimming past a moving car pops the bonus; sitting next to a stopped or
distant car doesn't; collisions still damage as before.

#### 2D. Map placement pass — open the pockets, rebalance spawns  ★ do FIRST within Phase 2
This item is the result of a spatial audit of `public/maps/neighborhood_map.json` +
the hardcoded spawn arrays. It supersedes the vaguer placement notes in 2A/2B/R3 —
use THESE coordinates. Background you must know: **Leo can only ride on road rects.**
`_isRoadChunk()` (NeighborhoodScene ~line 1149) walls everything else, including Runde
Park and the golf course. Deer patrol boxes and pickups placed off-road are unreachable
(though deer within ~5 tiles of a road CAN be hit by fart splash from the road).

**Audit findings (why these edits):**
1. *The opening minute is dead.* Leo starts at (30,142); the ride north up Windward to
   ~r100 contains one bean, one bike kid, zero deer. The joy engine never fires early.
2. *Deer are ambient singles, not herds.* Every main-route deer entry is `count` 1–4
   spread across a huge patrol span. The only combo-able group — obstacle #39, **10 deer
   on the c238 spur** — is on a road most players never ride, and it accidentally sits
   next to the bean at (240,120). Promote that accident to a designed "combo shrine."
3. *The golf course is risk with zero reward.* Golf-ball spawners rake Tega Cay Dr E,
   but there is no reason to ever enter the course. Pure punishment.
4. *Traffic is lopsided.* Tega Cay Dr W (c45–213, the longest ride, toward MJ) has ONE
   car; Justin's southern approach is already the busiest corridor on the map. Near-miss
   bonuses (2C) need moving cars where players actually ride.
5. *Bean→herd pairings don't exist* (beans are dead-end detour rewards — fine — but no
   bean sets up a combo run into a herd, which is the fantasy the power fart deserves).

**Edit (i) — open the park + golf course as drivable pockets** (code, not JSON):
In `_isRoadChunk()`, also return true when the chunk overlaps:
- Park rect widened to meet Windward: cols 19–45, rows 65–91 (fences are drawn on the
  top/left edges only, so entering from the east reads naturally).
- Golf rect extended to meet Tega Cay Dr: cols 220–290, rows 0–46.
Also add the golf rect to `_generateTrees()`'s `onClearArea` exclusions (keep fairways
open) and draw a small green golf rect on the minimap (park is already drawn, ~line 1236).
This one change turns both dead zones into playgrounds: park = safe combo pocket,
golf course = guarded treasure zone. **R3's golden donut #1 depends on it.**

**Edit (ii) — deer herds** (append to `obstacles` in `neighborhood_map.json`):
```json
{ "type": "deer", "col": 45,  "row": 104, "w": 11, "h": 4,  "count": 3 },
{ "type": "deer", "col": 24,  "row": 70,  "w": 16, "h": 16, "count": 5 },
{ "type": "deer", "col": 255, "row": 20,  "w": 20, "h": 10, "count": 4 },
{ "type": "deer", "col": 150, "row": 50,  "w": 20, "h": 5,  "count": 4 }
```
In order: a **starter pod** on lower Windward (first fart target ~15s from Leo's door);
the **park herd** (needs edit i); the **golf rough herd** (needs edit i — guarded by ball
fire, near golden donut #1); a **median herd** in the grass strip between Tega Cay Dr's
two lanes (r50–54 — off-road but within fart range from either lane, which teaches that
farts work at range). Leave obstacle #39 (the 10-deer c238 spur) exactly as is — it's
now the combo shrine where TOOTNADO (5x badge) is earned; do not thin it.

**Edit (iii) — beans that set up combos** (add to `SPOTS` in `_spawnBeans`, ~line 771):
`[46,114]` (grab it riding north → starter pod 6 rows later), `[43,78]` (park entrance →
park herd), `[224,47]` (golf entrance → golf herd). Keep all 7 existing beans; document
in a comment that (240,120) intentionally pairs with the c238 shrine.

**Edit (iv) — traffic where the ride is dull** (append to `obstacles`):
```json
{ "type": "car", "col": 100, "row": 46, "w": 60, "h": 3 },
{ "type": "car", "col": 45,  "row": 95, "w": 4,  "h": 25 }
```
One patroller on the long dull Tega Cay W stretch, one on lower Windward so the opening
has something to dodge (and a 2C near-miss to earn). Do NOT add traffic to Justin's
southern approach (c311/r152) — it's already the densest corridor.

**Edit (v) — donut-hole trail routes for 2A** (exact breadcrumb lines, ~43 holes):
Windward c46, r128→r100 every 4 rows (8) · Tega Cay W r47, c60→c120 every 8 cols (8) ·
Tara Tea r64, c60→c124 every 8 (8) · Tega Cay E r56, c214→c270 every 8 (7) ·
c311, r84→r120 every 6 (6) · park interior loop, 6 holes (needs edit i).

**Edit (vi) — randomize the moments, not the places** (see design principle #7).
In `_spawnObstaclesFromMap()` (~line 912), obstacles currently spawn at deterministic
evenly-spaced points, so every run opens frame-identical. Add per-spawn jitter: offset
each spawn position by a random ±30% of its share of the patrol range (clamped inside
`minB..maxB`), and start each patroller moving in a random direction. Do NOT randomize
which roads obstacles live on, and do NOT randomize any pickup/secret/trail position —
those stay fixed forever so route knowledge compounds across runs.

**Edit (vii, optional) — the roaming herd** (a variance valve that respects principle
#7): one extra 4-deer herd per run spawns in ONE of three fixed candidate homes, chosen
at random each run: the park (needs edit i), the golf rough, or the Mariana Ln dead-end
(c60–84, r83–91 area). Kids learn the three spots and check them like fishing holes —
"where's the herd today?" is a learnable ritual, not noise. Skip if effort-constrained.

**Accept when:** riding north from Leo's house, within ~20 seconds the player passes a
bean, meets the starter pod, and can dodge the Windward car; Leo can physically ride
into the park and the golf course; a fart from Tega Cay Dr topples median deer;
the golf herd/donut cannot be reached without crossing golf-ball fire.

### Phase 3 — Act 2 event juice

#### 3A. Luck-reveal fanfare
**File:** `src/scenes/OregonTrailScene.js`, `_resolveChoiceAndReveal()` (~line 419) — the
reveal card titles are `THAT WENT WELL!` / `BAD LUCK!` / `OKAY THEN...`.
- Good: green/yellow confetti burst behind the card (import `FX.burst`), a short bright
  sfx if one fits from `public/assets/audio/sfx/` (optional — skip rather than force it).
- Bad: `this.cameras.main.shake(200, 0.008)` + brief red flash.
- Neutral: nothing (contrast is the point).
Also fire a small confetti burst when a `[skill]` choice resolves — using a friend should
feel cool.

#### 3B. Event icon chips
**File:** `src/ui/EventCard.js`. Add a 20×20 colored chip in the card's top-left with a
1–2 char ASCII glyph, chosen by keyword match on the event title/id (no per-event data
needed): bike/chain/tire/rim/part → `%` gray "mechanical"; dog/deer/squirrel/ferret/
parrot → `!` orange "animal"; rain/heat/wind → `~` blue "weather"; teacher/officer/
parent/neighbor → `?` purple "people"; shortcut/money/downhill/fountain → `$` green
"opportunity". Fallback: yellow `*`. Purpose: pre-readers get an instant read on what
kind of trouble this is.

**Accept when (3A+3B):** headless screenshot of an event card shows the chip; good-luck
reveal shows confetti; bad-luck shows shake/flash (verify by eye in dev server).

#### 3C. Dialogue + event copy punch-up (kid-slang pass)
**Files:** `src/data/dialogue/act1.json` (28 scripts: intros, joins, checkpoints,
gauntlet taunts + win lines), `src/data/dialogue/act2-events.json` (event descriptions +
choice text), and the hardcoded `LOCATION_EVENTS` in `src/scenes/OregonTrailScene.js`
(~lines 45–126). The writing already lands "bro" naturally; this pass leans in further.

**The comedy engine — two slang registers, assigned by role:**
- **The crew** (Warren, MJ, Carson, Justin) get light, current slang: *cooked, no cap,
  lock in, fr, bet, ate, lowkey, W / L, mid, crash out, aura.* Season, don't drench.
- **The sibling bosses** (Grace, Nora, both Maxes, Edie) get **deliberately dead/fading
  slang played for cringe** — *6-7, skibidi, rizz, sigma.* The joke is that the annoying
  siblings use expired memes with total confidence and the crew visibly suffers.
  Example shape (write your own, this is the template): Grace: "You can't beat me.
  I have SIGMA pool-noodle aura. Six... SEVEN!" / Leo: "That meme died a year ago,
  Grace." / Warren: "Bro I can't do this." Leo is the straight man — he almost never
  uses slang, which is what makes everyone else's land.

**Hard budget rules (cringe is a spice, not a sauce):**
- Max ONE dead-slang gag per script, and only in sibling-boss scripts (gauntlet taunts,
  boss meets, Edie). Not every boss script needs one — 3–4 total across the game is right.
- Current slang: at most ~1 word per 2–3 dialogue lines; never two slang words in the
  same sentence.
- NEVER slang-ify instructional or UI text: camp boards, buttons, choice hints, tips,
  and the departure overlay stay in plain words. Event *descriptions* may take light
  slang; event *choice text* stays clear (a kid deciding needs clarity, not jokes).
- Keep every existing joke that works; this is a punch-up, not a rewrite. Lines must
  stay short (dialogue box wraps at ~440px of 8px font), ASCII only.
- Slang dates fast by design — treat this as a re-runnable seasoning pass. Where a line
  could age badly, prefer the crew reacting to cringe over the cringe itself (reactions
  stay funny after the meme is forgotten).

**Accept when:** the user reads the gauntlet scripts and laughs; no slang appears in any
instructional/UI string; at most 3–4 dead-slang gags exist game-wide; Leo stays the
straight man throughout.

### Phase 4 — Presentation & meta-loop

#### 4A. Hide dev cheats behind `?debug=1`
**File:** `src/scenes/NeighborhoodScene.js` (~lines 534–603): keys 2/3/4/5–9 and the two
on-screen hint lines (`BOSS TEST ...`, `... 2: ACT 2  3: GAUNTLET`). Gate ALL of it on
`new URLSearchParams(location.search).has('debug')`. Keep WASD/F/SPACE hints visible but
reword to just `WASD: MOVE   F: FART`. Kids reading "BOSS TEST 5:GRACE" is confusing
noise, and a stray keypress skipping acts looks like a bug.

#### 4B. Donut House arrival celebration
**File:** `src/scenes/DonutShopScene.js` `create()`. On entry: ~12 donut sprites (circles)
rain from the top with rotation over ~1.5s, `YOU MADE IT!` banner tween-in, and party
member rectangles do a little hop tween. Reaching the shop is the mid-game victory — it
currently just... shows a menu.

#### 4C. Arcade initials + "beat your grade" hook
**Files:** `src/scenes/ReportCardScene.js`, `src/scenes/TitleScene.js` (~line 41),
`src/systems/ScoreSystem.js` (saveScore already accepts `initials`).
- Report card: after the grade reveal, a 3-slot initials entry (A–Z per slot; up/down
  arrows or click to cycle, ENTER confirms — keyboard `addKey` pattern is everywhere in
  the codebase). Save via `ScoreSystem.saveScore({ ..., initials })`.
- Title screen: under START GAME, if a leaderboard exists show
  `BEST: <grade> (<initials>) — BEAT IT!` in gold. Grade is already stored per entry.

#### 4D. Game-over encouragement (small)
**File:** `src/scenes/GameOverScene.js`. Read it first. Ensure the Act-2 time-out message
is encouraging, kid-toned, and gives one concrete tip chosen from the run state passed in
(e.g. lost with low CREW → "Try an EASY pace after a big hill"). One line, plain words.

### Phase 5 — Already-planned polish + balance pass (from `docs/act2-simplification-plan.md`)

- **5A. Walmart slim-down:** `src/ui/WalmartShopCard.js` sells 6 item types that stack
  into two totals anyway. Reduce UI to two buttons: `SNACK $3` and `REPAIR KIT $4`
  (map internally to granola/tire so `SNACK_STAMINA`/`BIKE_PART_RESTORE` in
  OregonTrailScene keep working, or simplify those tables too).
- **5B. First-camp tip:** one-time line on the first camp board: `Pick a pace, grab a
  snack if the crew is tired, then CONTINUE.` Gate on `this._legIndex === 0`.
- **5C. Balance playtest.** Knobs, all in `src/scenes/OregonTrailScene.js` unless noted:
  `CREW_DRAIN`/`BIKE_DRAIN` (~line 20), `PACES` multipliers (~157), `TERRAINS` (~167),
  `LEG_EVENT_CHANCE` (~149), luck thresholds in `_resolveChoiceAndReveal` (~422), grade
  thresholds in `ScoreSystem.grade`. Target feel: a first-time kid playing all-STEADY and
  ignoring the stash should *barely* lose or barely win; using pace+stash should win with
  room to spare; PUSH-everywhere should bottom out CREW and cost more time than it saves.

---

### Phase R — THE REPLAY ENGINE  ★ the "one more run" core — do right after Phase 1

Everything above makes one run more fun. Phase R is what makes a kid start run #2, #3,
and #6. Design: **badges you earn by playing in different ways → each badge unlocks a
named fart sound → a visible shelf of empty slots on the title screen dares you to fill
it.** Plus secrets that only a repeat explorer finds, and remix modes that make later runs
*feel* different, not just re-rolled.

All persistence is `localStorage` (same pattern as `ScoreSystem`, key per system).
Never store it on the per-run gameState — badges must survive "START GAME".

#### R1. Badge system + award toasts
**New file:** `src/systems/BadgeSystem.js` (static class, localStorage key
`'leo-donut-badges'`, shape `{ earned: { badgeId: 'Jul 22' }, seenToasts: [...] }`).
API: `award(id)` (idempotent, returns true if newly earned), `has(id)`, `all()` (defs +
earned state), `unlockedFarts()` (see R2).

Badge definitions (id / name / hint / where the check lives). Deliberately mixed
difficulty — a first run should earn 2–3 so the shelf hook lands immediately:

| id | name | earn condition | check location |
|---|---|---|---|
| `first_delivery` | FIRST DELIVERY | finish the game once | `ReportCardScene` |
| `full_crew` | FULL CREW | all 4 friends reach the Donut House | `DonutShopScene.create` (party.length===4) |
| `solo_rider` | LONE WOLF | reach the Donut House with zero friends | `DonutShopScene.create` |
| `fart_storm` | FART STORM | 3x deer combo | fart handler, `NeighborhoodScene` (`knocked>=3`) |
| `tootnado` | TOOTNADO | 5x deer combo | same (`knocked>=5`) |
| `deer_whisperer` | DEER WHISPERER | 15 deer toppled in one run | same (`gs.deerToppled>=15`) |
| `early_bird` | EARLY BIRD | arrive at Donut House with TIME still "ahead" | `OregonTrailScene._triggerArrival` (reuse `_scheduleWord()`) |
| `survivor` | SURVIVOR | win the run after CREW hit "worn out!" (<34) | set `gs.crewWasWornOut` flag in `_applyLegCost`, check at `ReportCardScene` |
| `big_spender` | DOZEN DOWN | buy 12+ donuts in one order | `DonutShopScene._startReturn` |
| `close_call_king` | CLOSE CALL KING | 5 near-misses in one run (needs 2C) | near-miss handler (`gs.nearMisses>=5`) |
| `golden_glaze` | GOLDEN GLAZE | find all 3 golden donuts (needs R3) | golden-donut collect |
| `s_rank` | S-RANK RIDER | earn grade S | `ReportCardScene` |

Award moment matters: call a shared toast the instant it's earned —
`BadgeSystem.toast(scene, name)` → slide-in banner top-center, `BADGE EARNED: FART STORM!`
gold on dark, ~2s, plus an `FX.burst` if the scene imports FX. Never queue-block gameplay.

#### R2. Fart rewards — ⚠️ REDESIGN (sound-only unlocking shipped; pivot to fart ABILITIES)
> **Decision (playtest verdict):** the sound-unlock system was built (BadgeSystem +
> `playFart` filtering to `unlockedFarts()`, starting pool 6 of 20, toast plays the new
> fart). It works but delivers little fun: the 20 sounds were added at random, so one
> isn't "better" than another — earning a different *noise* has no impact. The current
> code can STAY (harmless, still a small collectible), but the real reward should be
> **mechanical fart TYPES, not sounds.** A specific fart does something another can't.
>
> **Design target (future work — not yet built):** a small set of distinct fart abilities,
> each with its own sound, that the player can trigger/select. Sketch (refine before
> building):
> - **BLAST** (default) — the current power fart: knock down deer + rocket-boost forward.
> - **DIRECTED / STEERING fart** — aim the shove (up/down as well as forward) to line up
>   a deer herd or dodge — turns the fart into a movement tool.
> - **LINGERING GAS CLOUD** — a cloud that stays for a few seconds, protecting Leo /
>   knocking anything that enters it (greater protection for a window of time).
> - **SILENT-BUT-DEADLY** — no boost, but a huge radius (crowd-clear a whole herd).
>
> Open questions for the user before building: are these unlocked by badges (replay hook)
> or found in Act 1? Does Leo pick ONE loadout or cycle them with a key? Keep it kid-simple
> — probably 3 types max, cycled with one button, each obviously different on screen.
> Original sound-only spec preserved below for the record.

**Files:** `src/systems/AudioManager.js` (`playFart` filters to `BadgeSystem.unlockedFarts()`),
`BadgeSystem`, `TitleScene`.

- Fart sounds carry fun display names in `BadgeSystem.FART_NAMES` (THE CLASSIC, THE
  SQUEAKER, THE TROMBONE, …, THE GRAND FINALE).
- **Starting pool: farts 1–6.** Each badge unlocks 1–2 more (badge→fart map in `BADGES`).
- `AudioManager.playFart` filters `_fartKeys` to the unlocked set, falling back to all
  loaded farts if unavailable (never let a bug silence farts).
- On badge award, the toast shows `NEW FART: <NAME>!` and immediately plays it once.
- Title screen badge shelf (R4) shows the `FARTS x/20` count.

#### R3. Golden donuts (secrets for repeat explorers)
**Files:** `NeighborhoodScene` (clone the `BeanPickup` spawn/check/persist pattern,
~line 769), new `src/entities/GoldenDonutPickup.js` (gold circle + darker ring + slow
sparkle tween — make it obviously special), `ScoreSystem`, `ReportCardScene`.

Three hidden spots, chosen from the 2D spatial audit (IMPORTANT: Leo can only ride
where `_isRoadChunk` permits — spot 1 requires 2D edit (i), which makes the golf course
drivable; the other two sit on existing but rarely-visited roads):
1. **(258, 12)** — deep in the golf course, behind the golf-ball fire line (requires 2D
   edit i; pairs with the golf rough herd),
2. **(11, 146)** — the dead-end marina road stub by Lake Wylie, SW of Leo's house
   (already drivable, genuinely obscure),
3. **(313, 153)** — the far SE corner where the south shore road meets Justin's street.

Each: +$5, big fanfare (`GOLDEN DONUT!` + sparkle burst), `gs.goldenDonuts++`, persists
per-run via `_markCollected('collectedGoldenDonuts', i)`. Score: `golden × 50` row on the
report card ("GOLDEN DONUTS"). All 3 in one run → `golden_glaze` badge. Do NOT mark them
on the minimap — secret means secret; the badge hint ("hidden around the neighborhood...")
is the only clue.

#### R4. Title-screen badge shelf
**File:** `src/scenes/TitleScene.js`. The right panel (~line 56) is the leaderboard;
add a toggle at its top: `[SCORES] [BADGES]` (two small tabs, same panel area).
Badges view: 12 slots in a 3×4 grid — earned = gold square + name below on selection;
unearned = dark slot with `?`. Clicking a slot prints name+hint (or `???` + hint for
unearned) at the panel bottom. Below the grid: `FARTS: 8/20 UNLOCKED`. The
partially-empty shelf IS the replay pitch — make sure a fresh browser shows 0/12 and
6/20, not an empty panel.

#### R5. Remix modes (post-win challenge runs)
**Files:** `TitleScene`, `src/constants.js` (or a tiny `src/systems/ChallengeSystem.js`),
touched scenes read a `challenge` id from `this.game.registry.get('challenge')`.

After `first_delivery` is earned, the title screen shows a `CHALLENGES` button →
pick one modifier for the whole run (plain-words description, one per run):

- **RUSH HOUR** — "The streets are packed!" Act 1: double car/golf-cart `count` at spawn
  time (multiply in `_spawnObstaclesFromMap`, no map edits); near-miss pays +2s.
- **DEER STAMPEDE** — "Deer. Deer everywhere." Triple deer counts; fart cooldown scale
  0.5 (via `AbilitySystem.setCooldownScale`); combos are the run's whole economy.
- **STORM RIDE** — "Worst weather all year." Act 2 terrain table reweighted (smooth/
  downhill weight 1, rain weight 4, headwind 3); travel grab-ems (1B) spawn twice as
  often as compensation.

Each remix has its own win badge if you want 3 more badges (`rush_hour_win` etc.) —
optional, only if the badge grid is expanded to fit. Implementation rule: a challenge may
ONLY tweak existing constants/spawn counts at scene start — no new mechanics, no new UI
beyond a small `CHALLENGE: RUSH HOUR` label under the Act 1 HUD.

#### R6 (stretch, optional). Act 2 route fork
The strongest *structural* replay lever if there's appetite for more content: at the
Walmart camp (leg 4), a one-time choice — **HIGHWAY** (remaining legs bias
gravel/headwind, time costs ×0.85, checkpoint stays DISCOUNT TIRE) vs **PARK TRAIL**
(time costs ×1.15, terrain biases smooth/downhill, and the leg-6 checkpoint becomes an
**ICE CREAM STAND** with 2–3 new location events written in the existing
`LOCATION_EVENTS` format — snack-flavored, e.g. brain-freeze dares and a free-cone
sample rush). Routes converge at leg 8. Two runs now have genuinely different middles.
Implement by swapping the `LEGS`/checkpoint entries for indices 5–7 at choice time.
Skip this item if effort is constrained — R1–R5 stand alone.

**Accept Phase R when:** a fresh browser profile earns 2+ badges and hears a new fart
unlock during one normal run; badges/farts survive `START GAME` (new run) AND a full page
reload; the shelf shows correct counts; a remix run visibly differs in its first 30
seconds; no badge can be earned twice.

---

## 5. Suggested commit sequence

One commit per lettered item, message style `Act 2: terrain-reactive ride visuals (1A)`.
Phases are independent; items within a phase are ordered. **Recommended order:
Phase 1 → Phase R (R1–R4) → Phase 2 → 3 → 4 → 5 → R5 → R6.** If a session is short,
Phase 1 makes one run fun; Phase R makes the next run happen. Dependencies to respect:
R1 before R2/R3/R4/R5 (they all hang off BadgeSystem); 2D before 2A/2B placements and
before R3 (golden donut #1 needs the golf course drivable); 2C before the
`close_call_king` badge check; 1B before STORM RIDE's grab-em compensation.

### Review gates — do NOT implement everything in one pass

The user playtests with the target player (a kid). Feel can't be verified by screenshots,
so implementation must PAUSE at these gates and wait for the user's verdict before
continuing. Executing model: stop at each gate, summarize what's ready to test and how
to reach it (dev-server URL + any `?debug=1` shortcut keys), then end your session.

- **GATE 1 — after Phase 1 (1A+1B).** The riskiest feel-work in the plan: do terrain
  legs read differently, and are grab-ems fun or fiddly for small hands? A miss here is
  cheap to fix now and expensive later (STORM RIDE in R5 builds on grab-ems). Test: ride
  5+ Act 2 legs at mixed paces (`?debug=1` + key `2`, once 4A exists).
- **GATE 2 — after Phase R (R1–R4). The thesis gate.** One full normal run in a fresh
  browser profile: did 2–3 badges land with toasts, did a new fart unlock make the kid
  laugh, does the title-screen shelf create "one more run"? If yes, the plan's core is
  validated and Phases 2–5 are safe to batch. If no, STOP — rebalance badge difficulty
  or unlock pacing before building anything else on top.
- **GATE 3 — after Phase 2 (2D+2A+2B+2C).** Placement is subjective. Test: the opening
  minute from Leo's house (bean → starter pod → dodging the Windward car), ride into the
  park and golf course, hunt one golden donut. Density too crowded or still too empty is
  a JSON-tweak fix — get the verdict while it's fresh.
- **Phases 3, 4, 5 may then be implemented in one batch** — they're lower-risk polish
  with objective acceptance criteria. R5/R6 last, only if Gate 2 validated the loop.
- **FINAL REVIEW:** after everything, hand back to the planning model for a full
  diff-vs-plan review, headless screenshot verification, and the 5C balance audit.

One more standing rule for the executing model: if an item's acceptance criteria can't
be met without violating a §2 principle or the §6 don't-do list, STOP and surface the
conflict to the user instead of improvising a resolution.

## 6. Don't-do list

- No new resource bars, numbers, percentages, or risk labels anywhere in Act 2.
- No timers on camp boards or event cards.
- Don't touch the music loop files (`music_level_intro/loop`) — a carefully bar-aligned
  cut was chosen after much iteration (candidates kept in `scripts/finalize-loop.js`).
- Don't rename `justin`/`justinmax` code ids — "Max" is display-only
  (see `DialogueBox.showLine` DISPLAY map).
- Don't make farts damage or scare people/cars (deer + the bike kid only).

## 7. Verification toolkit

- **Dev server:** `npx vite` → http://localhost:5173/leo-donut-quest/ (hard-reload after
  asset changes). Reaching Act 2 quickly: `?debug=1` + key `2` (after 4A; before 4A the
  cheats are always on). Key `4` → donut shop, `3` → gauntlet.
- **Build check before every commit:** `npx vite build` must pass.
- **Headless screenshots** (the game needs WebGL; Canvas breaks text rendering):
  ```
  "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new \
    --hide-scrollbars --use-gl=angle --use-angle=swiftshader \
    --enable-unsafe-swiftshader --ignore-gpu-blocklist \
    --window-size=960,540 --virtual-time-budget=8000 \
    --screenshot=OUT.png URL
  ```
  For UI states you can't reach by URL, write a small HTML harness in the scratchpad that
  imports the scene class, subclasses it, mocks the `_*` fields the build method reads,
  and calls the method directly — this pattern was used successfully for the camp board,
  event card, and report card. Inline the Press Start 2P font as a base64 data-URI
  `@font-face` and gate rendering on `document.fonts.ready`.
- **Manual playtest focus:** after Phase 1, ride 5+ legs switching paces and confirm each
  terrain reads differently and grab-ems feel generous; after Phase 2, walk the route
  Leo's house → Warren's collecting a trail and comboing a deer cluster.
