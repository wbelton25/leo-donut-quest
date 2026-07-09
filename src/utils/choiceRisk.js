// choiceRisk: shared read of an event choice's "risk profile" and what's at stake.
// Used by BOTH the EventCard preview (the vibe shown on the button) and the scene's
// outcome resolver (the actual odds), so the two can never drift apart.

// What resources a choice puts on the line — for the "(time / bikes / …)" hint.
export function stakesOf(choice) {
  const e = choice.effects ?? {};
  const s = [];
  if (e.time)          s.push('time');
  if (e.energy)        s.push('energy');
  if (e.bikeCondition) s.push('bikes');
  if (e.distance)      s.push('a shortcut');
  if (e.money)         s.push('cash');
  if (e.snacks)        s.push('snacks');
  return s;
}

// 'gamble' — a rider might bail (authored partyLossRisk).
// 'skill'  — a party member handles it; usually reliable.
// 'risky'  — flagged risky or carries a real downside; wide swing.
// 'safe'   — steady, modest, low variance.
export function classifyChoice(choice) {
  const e = choice.effects ?? {};
  if (e.partyLossRisk)            return 'gamble';
  if (choice.requiresPartyMember) return 'skill';
  const downside = Math.max(0, -(e.energy || 0)) + Math.max(0, -(e.bikeCondition || 0));
  if (/risk/i.test(choice.text || '') || downside >= 12) return 'risky';
  return 'safe';
}
