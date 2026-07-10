// choiceRisk: shared read of an event choice's risk. Used by BOTH the EventCard
// preview (the label on the button) and the scene's outcome resolver (the actual
// odds + swing), so the shown risk and the real risk can never drift apart.

// Outcome spread by profile: how much a 'good' roll shrinks costs / a 'bad' roll
// grows them. The scene rolls against this; the preview sizes stakes against it.
export const RISK_SPREAD = {
  safe:   { good: 0.75, bad: 1.25 },
  skill:  { good: 0.55, bad: 1.30 },
  risky:  { good: 0.40, bad: 1.85 },
  gamble: { good: 0.45, bad: 1.85 },
};

// 'gamble' — a rider might bail (authored partyLossRisk).
// 'skill'  — a party member handles it; reliable, low swing.
// 'risky'  — flagged risky or carries a real downside; wide swing.
// 'safe'   — steady, predictable.
export function classifyChoice(choice) {
  const e = choice.effects ?? {};
  if (e.partyLossRisk)            return 'gamble';
  if (choice.requiresPartyMember) return 'skill';
  const downside = Math.max(0, -(e.energy || 0)) + Math.max(0, -(e.bikeCondition || 0));
  if (/risk/i.test(choice.text || '') || downside >= 12) return 'risky';
  return 'safe';
}

const CATEGORY = {
  safe:   { label: 'SAFE',    color: '#7ac77a' },
  skill:  { label: 'SKILLED', color: '#6fc9b0' },
  risky:  { label: 'RISKY',   color: '#ffa04d' },
  gamble: { label: 'GAMBLE',  color: '#ff5555' },
};

const DOMAIN = {
  time: 'time', energy: 'energy', bikeCondition: 'bikes',
  distance: 'a shortcut', money: 'cash', snacks: 'snacks',
};

// Worst-case size of a COST (negative delta) in a common scale — time in minutes,
// energy/bike as %. Gains aren't "stakes"; only what you can lose counts.
function costPoints(key, v, badMult) {
  const a = Math.abs(v) * badMult;
  switch (key) {
    case 'time':          return a * 1.2;
    case 'energy':        return a;
    case 'bikeCondition': return a;
    case 'money':         return a * 2;
    case 'snacks':        return a * 8;
    default:              return 0;   // distance is only ever a gain
  }
}

// Button label: a comparable risk tier + how big a hit it could be, and to what.
// Only downside counts toward "stakes". No exact numbers — the real result is
// rolled and revealed on pick.
export function describeChoice(choice) {
  const e       = choice.effects ?? {};
  const profile = classifyChoice(choice);
  const cat     = CATEGORY[profile];

  if (profile === 'gamble') {
    return { text: 'GAMBLE - a rider might bail', color: cat.color };
  }

  const badMult = RISK_SPREAD[profile].bad;
  const scored = Object.keys(e)
    .filter(k => k !== 'partyLossRisk' && e[k] < 0)   // costs only
    .map(k => ({ k, pts: costPoints(k, e[k], badMult) }))
    .sort((a, b) => b.pts - a.pts);

  if (scored.length === 0) return { text: `${cat.label} - no real downside`, color: cat.color };

  const top     = scored[0].pts;
  const tier    = top <= 10 ? 'minor' : top <= 24 ? 'moderate' : 'heavy';
  const domains = scored.slice(0, 2).map(s => DOMAIN[s.k]).join(', ');
  return { text: `${cat.label} - ${tier} hit to ${domains}`, color: cat.color };
}
