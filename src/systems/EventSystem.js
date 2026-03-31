import act2Events from '../data/dialogue/act2-events.json';

// EventSystem: the Oregon Trail random event engine.
// Draws events from weighted tables, checks party conditions,
// and applies resource consequences through ResourceSystem.
//
// Usage:
//   const eventSystem = new EventSystem(resourceSystem, partySystem);
//   const event = eventSystem.drawEvent('act2');
//   // show the event card UI with event.title, event.description, event.choices
//   // when player picks a choice:
//   eventSystem.applyChoice(event, choiceIndex);

export default class EventSystem {
  constructor(resourceSystem, partySystem) {
    this._resources = resourceSystem;
    this._party = partySystem;

    // Event tables keyed by act
    this._tables = {
      act2: act2Events.events,
      act4: act2Events.events, // Phase 6 will add harder act4-events.json
    };
  }

  // Draw a random event for the given act, respecting weights.
  // Returns the event object (with choices filtered for current party).
  drawEvent(act = 'act2') {
    const table = this._tables[act];
    if (!table || table.length === 0) return null;

    const event = this._weightedRandom(table);
    // Filter choices to only show ones the party can actually take
    const filteredChoices = event.choices.filter(choice => {
      if (!choice.requiresPartyMember) return true;
      return this._party.hasMember(choice.requiresPartyMember);
    });

    return {
      ...event,
      choices: filteredChoices.length > 0 ? filteredChoices : [event.choices[0]],
    };
  }

  // Apply the effects of the player's chosen option.
  // Returns an object describing what changed (for the UI to display).
  applyChoice(event, choiceIndex) {
    const choice = event.choices[choiceIndex];
    if (!choice) return;

    const effects = choice.effects ?? {};
    const changes = {};

    // Apply resource deltas
    const resourceKeys = ['time', 'bikeCondition', 'energy', 'snacks', 'money'];
    resourceKeys.forEach(key => {
      if (effects[key] !== undefined) {
        changes[key] = effects[key];
      }
    });

    if (Object.keys(changes).length > 0) {
      this._resources.applyChanges(changes);
    }

    // Party loss risk (e.g., ignoring a parent call)
    if (effects.partyLossRisk && this._party.getSize() > 0) {
      if (Math.random() < effects.partyLossRisk) {
        const party = this._party.getParty();
        const victim = party[Math.floor(Math.random() * party.length)];
        this._party.removeMember(victim);
        return { resourceChanges: changes, partyLoss: victim };
      }
    }

    return { resourceChanges: changes, partyLoss: null };
  }

  // Register a custom event table (used in Phase 6 for harder Act 4 events)
  registerTable(key, events) {
    this._tables[key] = events;
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  // Weighted random selection: events with higher weight values appear more often
  _weightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + (item.weight ?? 1), 0);
    let roll = Math.random() * totalWeight;
    for (const item of items) {
      roll -= item.weight ?? 1;
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }
}
