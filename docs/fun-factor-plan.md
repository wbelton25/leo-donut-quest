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
7. **Don't re-add complexity to Act 2.** It was just simplified from per-member bars down
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

#### 1B. Roadside grab-ems (interactive travel)
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
Add 2–3 tight clusters of 4–6 deer (`count` on a small patrol rect) placed just off the
main routes — e.g. in Runde Park, on the golf course fairways, near the lake docks. The
existing fart knockdown already pays +2s per deer and a combo bonus at 2+ — the problem is
herds dense enough to combo are rare. Keep clusters off roads so they're a *detour choice*.

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

## 5. Suggested commit sequence

One commit per lettered item, message style `Act 2: terrain-reactive ride visuals (1A)`.
Phases are independent; items within a phase are ordered. If a session is short, Phase 1
alone is the biggest win.

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
