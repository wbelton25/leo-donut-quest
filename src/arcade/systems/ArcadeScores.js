// ArcadeScores — device-local best score for Donut Rain (v1).
//
// Deliberately tiny and self-contained: no network, no Supabase. Mirrors the
// simple get/set shape of the adventure's ScoreSystem but keeps its own storage
// key so the two games never collide. A global arcade leaderboard is a later
// phase; when it lands, it wraps this rather than replacing it.

const KEY = 'donut-rain-best';

export default class ArcadeScores {
  // Highest score this device has recorded, or 0 if none / storage unavailable.
  static best() {
    try {
      return Math.max(0, parseInt(localStorage.getItem(KEY) || '0', 10) || 0);
    } catch (e) {
      return 0;
    }
  }

  // Record a finished run. Returns true if it beat the stored best (new record).
  static submit(score) {
    const s = Math.max(0, Math.round(Number(score) || 0));
    try {
      if (s > ArcadeScores.best()) {
        localStorage.setItem(KEY, String(s));
        return true;
      }
    } catch (e) {
      /* private mode / storage disabled — the run just isn't saved */
    }
    return false;
  }
}
