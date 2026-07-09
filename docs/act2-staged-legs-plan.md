# Act 2 (Oregon Trail) — Staged-Legs Pacing Rework

**Status:** IMPLEMENTED (build clean; needs in-browser playtest). Biker-sprite
swap + staged-legs restructure + dead-code cleanup all committed on `main`.
Rollback tag: `pre-act2-staged-legs`. Remaining: playtest tuning (leg count,
LEG_TRAVEL_MS pace feel, per-leg time/stamina/bike cost balance, event frequency).
**Goal (user's words):** more time for decisions, less time-critical/chaotic
gameplay, modeled on the real Oregon Trail's stop-and-decide pacing. User picked
the **Staged legs** option (full restructure) over quick-win tuning.

File: `src/scenes/OregonTrailScene.js` (~1287 lines).

---

## The problem being fixed

Current Act 2 is a **continuous real-time treadmill**:
- `update()` advances `_distance` every frame by `speed*dt`, scrolls scenery.
- Passive drains fire on a hidden `_drainTimer` (every `DRAIN_INTERVAL=4000ms`):
  time −4, per-member stamina + bike.
- Random events fire on `_eventTimer` (`EVENT_INTERVAL=7000 ± 2000`), pausing
  the ride with an (untimed) `EventCard`.
- Stamina/bike **warnings surface as `_showFloat` transient text** that fades in
  ~1.2s → **this is why notifications get missed.**

Decisions themselves are NOT timed (EventCard has no countdown; `_riding=false`
halts drains). The pain is the **ambient real-time pressure between events**:
bars silently draining, warnings blinking past, danger building invisibly until
an event happens to interrupt. Opposite of Oregon Trail (static, readable world;
press "continue" to advance; every event is a clean modal).

---

## New design: Staged Legs

Journey becomes a sequence of discrete **legs**. Each leg = ride a short segment
(scripted animation, no decisions), then arrive at a **stop/camp** where a
**persistent status board** shows everyone's state and ALL decisions happen with
no time pressure. No hidden real-time drift.

### Leg / stop layout
Define an explicit `LEGS` array over `TOTAL_DISTANCE=2000`, anchored on the
existing 4 checkpoints plus intermediate camps. Suggested stops (distance):
`200 camp, 400 SCHOOL(cp), 600 camp, 800 WALMART(cp/shop), 1000 camp,
1200 TIRE(cp), 1400 camp, 1600 PET(cp), 1800 camp, 2000 arrival` → ~10 legs.
Each entry: `{ endDistance, stopType: 'camp'|'checkpoint', checkpointId? }`.

### Per-leg state machine (`_phase`)
1. **TRAVEL** (`_phase='travel'`): fixed-ish short ride (~2.5–3.5s), scenery
   scrolls, bikers pedal, a small "leg progress" fill advances. NO decisions, NO
   hidden events. Duration scales with `_calcSpeedMult()` so a tired/broken group
   travels slower (longer leg = more time cost) — keeps the stamina/bike economy
   meaningful WITHOUT real-time pressure. On completion → `_arriveAtStop()`.
2. **CAMP/ARRIVE** (`_phase='camp'`): scroll stops. Apply the **leg cost ONCE**
   (time + per-member stamina/bike drain, keep the rare "tumble/pothole" rolls but
   SURFACE them on the board, not as fading floats). Check loss (time up /
   exhausted). Then:
   - Checkpoint stop → run existing `_showLocationScene(cp)` (building + location
     event / Walmart shop), THEN show board.
   - Camp stop → optionally draw ONE `EventSystem` act2 event (untimed EventCard),
     THEN show board. One event per stop max = predictable, deliberate cadence.
3. **Status board** (persistent centerpiece, evolve `_buildRestStopUI`):
   - Header: landmark/leg #, distance + ETA as a calm clock (`timeToDisplay`).
   - "What this leg cost" line (e.g. "−8 time · everyone tired · MJ hit a pothole").
   - Per-rider row: name, stamina bar+num, bike bar+num, **persistent ⚠ flags**
     for low stamina/bike (NOT fading). Reuse snack/part/DROP buttons from
     `_buildRestStopRow`.
   - **CONTINUE** button → `_startLeg()` for the next leg.
   - Board does NOT tick time (unlike current rest stop) → decisions truly untimed.
4. Final leg → `_triggerArrival()` (unchanged).

---

## Implementation checklist

**Add:**
- `LEGS` constant (array as above).
- State: `_legIndex`, `_phase` ('travel'|'camp'), `_legTravel` {startDist, endDist,
  elapsed, duration}.
- `_startLeg()` — set phase=travel, compute duration from speedMult, set travel span.
- `_arriveAtStop()` — apply leg cost once, loss check, checkpoint/camp branch, board.
- `_applyLegCost(leg)` — one-shot drains (reuse `_drainAllStamina`/`_drainAllBikes`
  logic but return a summary of what happened for the board; time cost scales w/ leg).
- `_buildStatusBoard()` — evolved rest-stop UI with persistent warn flags +
  CONTINUE button; replaces the always-available rest-stop model.
- `_showLegSummary(summary)` — render the "what just happened" line on the board.

**Rewrite:**
- `update()` — drive ONLY the travel animation (scroll + interpolate `_distance`
  toward leg end; on complete call `_arriveAtStop()`). Remove per-frame drains,
  warnings, checkpoint scan, break scan, random-event timer.

**Keep / reuse (do not rebuild):**
- ResourceSystem / PartySystem / EventSystem, EventCard (untimed modal),
  WalmartShopCard, `_showLocationScene` + `_buildLocationGraphic`, all event pools
  (`LOCATION_EVENTS`, EventSystem act2), fatigue/bike/break/snack/repair/drop
  handlers + `_dropMember`, bikers + sprites (`_makeBiker` already sprite-ified),
  `_buildRestStopRow` snack/part/drop buttons, progress bar, `_calcSpeedMult`.

**Remove / retire:**
- `_drainTimer`, `_eventTimer`, `_resumeRiding` timer resets, per-frame
  `_checkStamina`/`_checkBikes`/`_checkCheckpoints`/`_triggerBreakEvent` calls,
  the always-on `[R] REST` button (folded into the camp board), transient
  `_showFloat` warnings (replace with board flags; may keep `_showFloat` for
  brief positive confirmations only).

**Commit in stages** so WIP survives a compaction.

---

## Reference: current `update()` order (lines ~269–360)
scroll+distance → pace text → ETA text → passive drains (drainTimer) → inv strip →
bar visuals → loss checks → arrival check → `_checkCheckpoints` → break thresholds
→ `_checkStamina` → `_checkBikes` → random event (eventTimer). All of this collapses
into: travel-anim in `update()`, everything else moves into `_arriveAtStop()`/board.

## Key constants (top of file)
`TOTAL_DISTANCE=2000, SCROLL_SPEED=45, DRAIN_INTERVAL=4000, EVENT_INTERVAL=7000,
FATIGUE_WARN=40, FATIGUE_CRIT=15, BIKE_WARN=40, BIKE_CRIT=15, SKILL_USE_COST=18`.
STAMINA_RATES / BIKE_DRAIN_RATES per member. SNACK_STAMINA / BIKE_PART_RESTORE.
CHECKPOINTS[4] (school/walmart/tire/petsupply). `timeToDisplay(t)` clock helper.
