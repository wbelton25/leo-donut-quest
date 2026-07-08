import { EVT_ABILITY_USED } from '../constants.js';
import abilitiesData from '../data/abilities.json';

// AbilitySystem: manages ability availability, cooldowns, and execution.
// Each ability is defined in abilities.json. The system tracks cooldown timers
// and dispatches ability effects when triggered.

export default class AbilitySystem {
  constructor(game, partySystem) {
    this._game = game;
    this._party = partySystem;

    // Cooldown state: maps abilityId → timestamp when it's next available (ms)
    this._cooldowns = {};

    // Temporary cooldown multipliers: maps abilityId → scale (e.g. 0.3 = recharge
    // 3× faster). Set by power-ups like beans; 1 (or absent) means normal.
    this._cooldownScale = {};

    // Registered ability handlers: maps abilityId → function(scene, player)
    this._handlers = {};
  }

  // Temporarily speed up (or slow down) an ability's cooldown. scale of 1 clears it.
  setCooldownScale(abilityId, scale) {
    if (scale === 1) delete this._cooldownScale[abilityId];
    else this._cooldownScale[abilityId] = scale;
  }

  // ── Registration ──────────────────────────────────────────────────────────────

  // Register what actually happens when an ability fires.
  // handler(scene, player) is called by execute().
  register(abilityId, handler) {
    this._handlers[abilityId] = handler;
  }

  // ── Execution ─────────────────────────────────────────────────────────────────

  // Try to use an ability. Returns true if it fired, false if on cooldown or unavailable.
  execute(abilityId, scene, player) {
    if (!this.canUse(abilityId)) return false;

    const ability = abilitiesData[abilityId];
    if (!ability) {
      console.warn(`[AbilitySystem] Unknown ability: ${abilityId}`);
      return false;
    }

    // Check if the team boost requires a full party
    if (ability.requiresFullParty && !this._party.isFullParty()) {
      console.log('[AbilitySystem] Team Boost requires all 4 members.');
      return false;
    }

    // Run the handler
    const handler = this._handlers[abilityId];
    if (handler) handler(scene, player);

    // Set cooldown (scaled by any active power-up multiplier)
    const scale = this._cooldownScale[abilityId] ?? 1;
    this._cooldowns[abilityId] = Date.now() + ability.cooldown * scale;

    this._game.events.emit(EVT_ABILITY_USED, {
      abilityId,
      cooldown: ability.cooldown * scale,
    });

    return true;
  }

  // ── Availability ──────────────────────────────────────────────────────────────

  canUse(abilityId) {
    const ability = abilitiesData[abilityId];
    if (!ability) return false;

    // Check the member who owns this ability is in the party
    if (ability.owner !== 'leo' && ability.owner !== 'team') {
      if (!this._party.hasMember(ability.owner)) return false;
    }

    // Check cooldown
    const nextAvailable = this._cooldowns[abilityId] ?? 0;
    return Date.now() >= nextAvailable;
  }

  // Returns 0–1 representing cooldown progress (1 = ready, 0 = just used)
  getCooldownProgress(abilityId) {
    const ability = abilitiesData[abilityId];
    if (!ability) return 1;
    const nextAvailable = this._cooldowns[abilityId] ?? 0;
    const now = Date.now();
    if (now >= nextAvailable) return 1;
    const remaining = nextAvailable - now;
    const scale = this._cooldownScale[abilityId] ?? 1;
    return 1 - remaining / (ability.cooldown * scale);
  }

  // Returns all ability IDs that are currently available to the player
  getAvailableAbilities() {
    return Object.keys(abilitiesData).filter(id => this.canUse(id));
  }

  // Reset all cooldowns (e.g., between acts)
  resetCooldowns() {
    this._cooldowns = {};
  }
}
