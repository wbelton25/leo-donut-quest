// ScoreSystem: calculates final run score + grade and manages the leaderboard.
//
// Score = donuts×20 + crew×80 + timeLeft×2 + deer×5 + bestCombo×15  (0 if no donuts)
//   crew = members who reached the Donut House (not counting Leo).
//   timeLeft = the time resource remaining at delivery (0-100ish).
// Grade S/A/B/C/D is bucketed off the total — see grade().
//
// Leaderboard entry: { score, grade, donuts, partySize, initials, date }
// Top 5 entries stored in localStorage under key 'leo-donut-scores'.

const STORAGE_KEY = 'leo-donut-scores';
const MAX_ENTRIES = 5;

export default class ScoreSystem {
  // The integer pieces a score is built from. Split out so the world board can
  // submit them alongside the total and have the database re-check the
  // arithmetic — if these ever drifted from calculate(), honest runs would be
  // rejected server-side, so both must read from here.
  static components({ donuts = 0, party = [], time = 0, deer = 0, combo = 0, holes = 0, golden = 0 }) {
    return {
      donuts,
      partySize:  party.length,
      timePoints: Math.max(0, Math.round(time * 2)),
      deer, combo, holes, golden,
    };
  }

  // Total score from a full run result.
  static calculate(stats) {
    if ((stats?.donuts ?? 0) < 1) return 0;
    const c = ScoreSystem.components(stats);
    return (c.donuts * 20)
         + (c.partySize * 80)
         + c.timePoints
         + (c.deer * 5)
         + (c.combo * 15)
         + (c.holes * 3)
         + (c.golden * 50);
  }

  // Labeled point breakdown for the report card.
  static breakdown({ donuts = 0, party = [], time = 0, deer = 0, combo = 0, holes = 0, golden = 0 }) {
    const rows = [
      { label: 'DONUTS DELIVERED', detail: `${donuts} x 20`,             pts: donuts * 20 },
      { label: 'CREW WHO MADE IT', detail: `${party.length} x 80`,       pts: party.length * 80 },
      { label: 'TIME TO SPARE',    detail: `${Math.round(time)}%`,       pts: Math.max(0, Math.round(time * 2)) },
      { label: 'DEER TOPPLED',     detail: `${deer} x 5`,                pts: deer * 5 },
      { label: 'BEST FART COMBO',  detail: `${combo}x`,                  pts: combo * 15 },
      { label: 'DONUT HOLES',      detail: `${holes} x 3`,               pts: holes * 3 },
    ];
    if (golden > 0) rows.push({ label: 'GOLDEN DONUTS', detail: `${golden} x 50`, pts: golden * 50 });
    return rows;
  }

  // Letter grade bucketed off the total score. Thresholds bumped +60 vs the pre-2A
  // baseline so the new donut-hole/golden points don't inflate grades.
  static grade(total) {
    if (total >= 740) return 'S';
    if (total >= 580) return 'A';
    if (total >= 430) return 'B';
    if (total >= 250) return 'C';
    return 'D';
  }

  // Save a completed run to the leaderboard. Pass `score` to reuse an already-
  // computed total (keeps the board consistent with the report card).
  static saveScore({ donuts, party, time = 0, deer = 0, combo = 0, initials = '???', score }) {
    const finalScore = score ?? ScoreSystem.calculate({ donuts, party, time, deer, combo });
    const entry = {
      score:     finalScore,
      grade:     ScoreSystem.grade(finalScore),
      donuts,
      partySize: party.length,
      initials:  initials.toUpperCase().substring(0, 3).padEnd(3, '?'),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };

    const board = ScoreSystem.getLeaderboard();
    board.push(entry);
    board.sort((a, b) => b.score - a.score);
    const trimmed = board.slice(0, MAX_ENTRIES);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[ScoreSystem] Could not save score:', e);
    }

    return finalScore;
  }

  // Return sorted leaderboard array (best first)
  static getLeaderboard() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // Clear all scores
  static clearBoard() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  // Returns the player's current rank if they just scored `score` (1-based, null if unranked)
  static getRank(score) {
    const board = ScoreSystem.getLeaderboard();
    const idx = board.findIndex(e => e.score === score);
    return idx === -1 ? null : idx + 1;
  }
}
