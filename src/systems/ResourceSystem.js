import { DEFAULT_GAME_STATE, EVT_RESOURCE_UPDATE } from '../constants.js';

// ResourceSystem: the single source of truth for all five resources.
// Any code that changes a resource calls a method here.
// After every change it emits EVT_RESOURCE_UPDATE so HudScene can react.
//
// Resources:
//   time          - percentage of time left before donut shop closes (0–100)
//   bikeCondition - bike health percentage (0–100). Hitting 0 = game over
//   energy        - party energy percentage (0–100). Low energy = slower
//   snacks        - count of snack items (used to restore energy)
//   money         - dollars (spent at Donut House shop)

export default class ResourceSystem {
  constructor(game) {
    // Store a reference to the Phaser game instance so we can emit on game.events
    this._game = game;

    // Load from saved state if one exists, otherwise use defaults
    const saved = this._loadFromGameState();
    this._resources = { ...saved };
  }

  // ── Getters ──────────────────────────────────────────────────────────────────

  get time() { return this._resources.time; }
  get bikeCondition() { return this._resources.bikeCondition; }
  get energy() { return this._resources.energy; }
  get snacks() { return this._resources.snacks; }
  get money() { return this._resources.money; }

  // Returns a plain copy — safe to pass around without mutation risk
  getAll() {
    return { ...this._resources };
  }

  // ── Modifiers ─────────────────────────────────────────────────────────────────
  // All modifications go through _apply() to guarantee the emit happens.

  applyChanges(delta) {
    // delta is an object like: { time: -10, bikeCondition: 5, snacks: -1 }
    // Only keys present in delta are changed.
    const r = this._resources;
    if (delta.time !== undefined)          r.time = Math.max(0, r.time + delta.time); // no upper cap; starts at 270
    if (delta.bikeCondition !== undefined) r.bikeCondition = this._clamp(r.bikeCondition + delta.bikeCondition);
    if (delta.energy !== undefined)        r.energy = this._clamp(r.energy + delta.energy);
    if (delta.snacks !== undefined)        r.snacks = Math.max(0, r.snacks + delta.snacks);
    if (delta.money !== undefined)         r.money = Math.max(0, r.money + delta.money);
    this._emit();
  }

  // Convenience: eat a snack to restore energy
  eatSnack() {
    if (this._resources.snacks <= 0) return false;
    this.applyChanges({ snacks: -1, energy: 25 });
    return true;
  }

  // Reset to defaults (new game)
  reset() {
    this._resources = { ...DEFAULT_GAME_STATE.resources };
    this._emit();
  }

  // Restore from a saved state object
  restoreFromSave(savedResources) {
    this._resources = { ...savedResources };
    this._emit();
  }

  // ── Loss conditions ───────────────────────────────────────────────────────────

  isTimeUp() { return this._resources.time <= 0; }
  isBikeBroken() { return this._resources.bikeCondition <= 0; }
  isExhausted() { return this._resources.energy <= 0; }

  // ── Internal ──────────────────────────────────────────────────────────────────

  _clamp(value) {
    return Math.max(0, Math.min(100, value));
  }

  _emit() {
    this._game.events.emit(EVT_RESOURCE_UPDATE, this.getAll());
  }

  _loadFromGameState() {
    // In Phase 2, SaveSystem will manage this. For now use defaults.
    return { ...DEFAULT_GAME_STATE.resources };
  }
}
