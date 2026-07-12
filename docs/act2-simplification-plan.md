# Act 2 Simplification — "The Ride" (full rework)

**Status:** CORE DONE (2026-07-12). Group bars + clean camp board (commit
"Act 2 rework 1/2") and plain event hints/reveals (commit "2/2") shipped +
screenshot-verified. Remaining polish (optional): slim the Walmart shop UI to 2
items (it still sells 6 types that just stack into SNACKS/KITS totals — works
fine), a first-camp tutorial tip, and playtest balance of CREW_DRAIN/BIKE_DRAIN
+ pace/terrain multipliers. Original plan below.

User approved the full rework (2026-07-12) to fix Act 2
being too busy/confusing — especially for kids. Goal: Oregon-Trail-simple +
popular kid-game readability. File: `src/scenes/OregonTrailScene.js` (+ EventCard,
choiceRisk, WalmartShopCard).

## The problem
Too much tracked at once: per-rider stamina AND bike for up to 5 riders (10 bars),
3 snack + 3 part types, money, pace × terrain (6), events with 4 risk tiers +
hidden roll + reveal + range, incidents, at-risk warnings, and walls of % / minute
numbers. Readable for an adult; homework for a kid.

## The target: 3 bars, 1 lever, plain events

### Group resources (replace all per-member tracking)
- **TIME** — the deadline (keep `_resources.time`, shown as the clock). Running out
  = the ONLY hard game-over ("donut shop closed").
- **CREW** — one group energy bar 0-100 (`this._crew`). Low = slow (burns TIME) and
  can trigger a friend turning back (rare, via events).
- **BIKES** — one group condition bar 0-100 (`this._bikes`). Low = slow (burns TIME)
  and risks a breakdown (time penalty).
- The clock is the master resource; CREW/BIKES bottoming out cause SETBACKS (slower
  = more TIME spent), not instant loss. Kinder + clearer.

### Camp board (the whole UI)
```
CAMP / <LANDMARK>                 3:58 PM
  TIME   [########--]
  CREW   [######----]  getting tired
  BIKES  [########--]  holding up

  The big hill wore the crew down.        <- last-leg recap, in WORDS
  NEXT: Big hill (tough on the crew)      <- terrain heads-up
  PACE:  [EASY] [STEADY] [PUSH]           <- the one lever

  [ Snack +CREW (x2) ]  [ Fix bikes +BIKES (x1) ]   <- shared stash
  [ CONTINUE -> ]
```
Bars + words only. No %, no minutes-as-numbers, no per-rider rows.

### Pace = the lever (keep), terrain = flavor (keep, simplified)
EASY (slow, saves crew) / STEADY / PUSH (fast, tires crew + bikes). Terrain is a
one-word heads-up that makes the pace choice matter. Both feed the group bars.

### Events go plain (Oregon Trail modals)
- Situation + 2-3 choices IN WORDS. Each choice states its effect simply, shown as a
  bar nudging: "Wait it out (costs time)", "Push through (tires the crew)",
  "Warren knows a shortcut (saves time)".
- Reuse existing event data (act2-events.json, LOCATION_EVENTS). Map effects to bars:
  energy→CREW, bikeCondition→BIKES, time→TIME, distance→time saved.
- Keep a LITTLE luck: sometimes "It worked!" / "Bad luck!" — but DROP risk tiers,
  hidden-roll, %-reveal, and ranges. Apply + one-line word result.
- Friend loss: only via specific events (parent-call type) or reckless pushing —
  a rare dramatic moment, not bar micromanagement.

### Shop (Walmart) → shared stash
Buy snacks (→ CREW refills) and repair kits (→ BIKES refills) into ONE shared stash,
not per-member. 2 counts, not 6.

## Remove
- `_stamina`/`_bikeHP` per-member, `_staminaMult`/`_bikeMult`, per-member camp rows,
  snack/part/drop grid, go-home-at-0-per-member, at-risk red rows.
- `describeChoice`/risk tiers, `_resolveChoice` continuous roll + `_rangeText`,
  `_effectsToText` with (minor/moderate/heavy) magnitudes, % + minute labels.
- `_calcSpeedMult` based on per-member min → recompute from CREW/BIKES.

## Keep
- Leg travel animation + biker sprites; LEGS + checkpoints + location scenes;
  terrain; pace; report card (still reads party/donuts/time); TIME loss; retry
  snapshot.

## Build order (commit each)
1. **Core state + drains + loss:** `_crew`/`_bikes` replace per-member; `_applyLegCost`
   + pace/terrain drain the 2 group bars; `_calcSpeedMult` from CREW/BIKES; TIME-out
   loss; remove per-member loss.
2. **Camp board:** 3 bars (bar + word), terrain heads-up, pace buttons, 2 stash
   buttons, continue. Delete per-member rows + grid.
3. **Shop:** WalmartShopCard → shared snack/repair counts.
4. **Events:** plain choices + bar effects + light luck; strip risk tiers / reveal /
   ranges. Simplify EventCard preview + reveal.
5. **Polish:** word thresholds ("fresh/tired/worn out"), recap wording, tutorial tip
   on first camp.

## Bar → word thresholds (draft)
CREW: >66 "fresh", >33 "getting tired", else "worn out (slowing you down)".
BIKES: >66 "holding up", >33 "getting rough", else "barely rolling".
