import { EVT_PARTY_UPDATE } from '../constants.js';
import partyData from '../data/party-members.json';

// PartySystem: manages who is in the group, passive bonuses, and party loss.
// Party members join in Act 1 and can be lost during the Oregon Trail.

export default class PartySystem {
  constructor(game) {
    this._game = game;
    this._party = [];      // IDs of currently active members
    this._lost = [];       // IDs of members lost during Oregon Trail
  }

  // ── Membership ────────────────────────────────────────────────────────────────

  // Add a member to the party (called after defeating a sibling boss)
  addMember(memberId) {
    if (this._party.includes(memberId)) return;
    this._party.push(memberId);
    console.log(`[PartySystem] ${memberId} joined the party!`);
    this._emit();
  }

  // Remove a member (lost during Oregon Trail event)
  removeMember(memberId) {
    const index = this._party.indexOf(memberId);
    if (index === -1) return;
    this._party.splice(index, 1);
    this._lost.push(memberId);
    console.log(`[PartySystem] ${memberId} had to go home.`);
    this._emit();
  }

  hasMember(memberId) {
    return this._party.includes(memberId);
  }

  getParty() {
    return [...this._party]; // copy so callers can't mutate
  }

  getLost() {
    return [...this._lost];
  }

  getSize() {
    return this._party.length;
  }

  isFullParty() {
    return this._party.length === 4; // Warren, MJ, Carson, Justin
  }

  // ── Passive Bonuses ───────────────────────────────────────────────────────────
  // Returns the total speed multiplier from all party members' passive bonuses.

  getSpeedMultiplier() {
    let bonus = 1.0;
    this._party.forEach(id => {
      const member = partyData[id];
      if (member?.passiveBonus?.type === 'movement_speed') {
        bonus += member.passiveBonus.value / 100;
      }
    });
    return bonus;
  }

  // Returns true if Carson is in the party (unlocks stealth event options)
  hasStealthOption() {
    return this.hasMember('carson');
  }

  // Returns the damage bonus from Warren's slingshot passive
  getRangedDamageBonus() {
    const warren = partyData['warren'];
    if (!this.hasMember('warren')) return 0;
    return warren?.passiveBonus?.value ?? 0;
  }

  // Returns the obstacle resistance bonus from MJ
  getObstacleResistance() {
    const mj = partyData['mj'];
    if (!this.hasMember('mj')) return 0;
    return mj?.passiveBonus?.value ?? 0;
  }

  // ── Save / Load ───────────────────────────────────────────────────────────────

  getState() {
    return { party: [...this._party], lostMembers: [...this._lost] };
  }

  restoreFromSave(state) {
    this._party = [...(state.party ?? [])];
    this._lost = [...(state.lostMembers ?? [])];
    this._emit();
  }

  reset() {
    this._party = [];
    this._lost = [];
    this._emit();
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  _emit() {
    this._game.events.emit(EVT_PARTY_UPDATE, this.getParty());
  }
}
