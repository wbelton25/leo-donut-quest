// ScoreSystem: calculates final run score and manages the localStorage leaderboard.
//
// Score formula: donuts × (party_size + 1) × 10
//   +1 so solo-Leo runs still score. Max possible: 12 donuts × 5 × 10 = 600 pts.
//
// Leaderboard entry: { score, donuts, partySize, date }
// Top 5 entries stored in localStorage under key 'leo-donut-scores'.

const STORAGE_KEY = 'leo-donut-scores';
const MAX_ENTRIES = 5;

export default class ScoreSystem {
  // Calculate score from run result
  static calculate({ donuts = 0, party = [] }) {
    return donuts * (party.length + 1) * 10;
  }

  // Save a completed run to the leaderboard
  static saveScore({ donuts, party }) {
    const score = ScoreSystem.calculate({ donuts, party });
    const entry = {
      score,
      donuts,
      partySize: party.length,
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

    return score;
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
