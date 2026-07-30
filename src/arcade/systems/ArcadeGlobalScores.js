// ArcadeGlobalScores — the Donut Rain world board (Supabase REST).
//
// Same fail-open contract as the adventure's GlobalScores: every method swallows
// its own errors and resolves to a miss (null/false) instead of throwing, and
// every request has an abort timeout. If the table doesn't exist yet, the creds
// are blank, or the network is down, the game plays exactly as before — only the
// board notices. Targets its own `arcade_scores` table (see docs/arcade-leaderboard.sql).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config.js';
import cleanInitials from '../../utils/cleanInitials.js';

const TABLE = 'arcade_scores';
const CLIENT_KEY = 'leo-donut-client-id'; // shared with the adventure so "you" is consistent
const TIMEOUT_MS = 6000;
const MAX_SCORE = 1000000;

export default class ArcadeGlobalScores {
  static get enabled() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  // Stable per-device id, so we can mark "that row is you" on a board of strangers.
  static clientId() {
    try {
      let id = localStorage.getItem(CLIENT_KEY);
      if (!id) {
        id = (crypto?.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(36).slice(2)}`)
          .replace(/-/g, '').slice(0, 32);
        localStorage.setItem(CLIENT_KEY, id);
      }
      return id;
    } catch (e) {
      if (!ArcadeGlobalScores._ephemeralId) {
        ArcadeGlobalScores._ephemeralId = `s${Math.random().toString(36).slice(2, 14)}`;
      }
      return ArcadeGlobalScores._ephemeralId;
    }
  }

  static async _fetch(path, init = {}) {
    if (!ArcadeGlobalScores.enabled) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      // `apikey` authenticates both key generations; only the legacy JWT anon key
      // is also accepted as a bearer token.
      const isJwt = SUPABASE_ANON_KEY.startsWith('eyJ');
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        signal: ctl.signal,
        headers: {
          apikey: SUPABASE_ANON_KEY,
          ...(isJwt ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      if (!res.ok) {
        console.warn(`[ArcadeGlobalScores] ${res.status} ${res.statusText}`);
        return null;
      }
      return res;
    } catch (e) {
      console.warn('[ArcadeGlobalScores] unreachable:', e.name === 'AbortError' ? 'timed out' : e.message);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Post a finished run. Resolves true on success, false on any failure.
  static async submit({ initials, score }) {
    const s = Math.round(Number(score) || 0);
    if (s <= 0 || s > MAX_SCORE) return false;
    const res = await ArcadeGlobalScores._fetch(TABLE, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        initials: cleanInitials(initials),
        score: s,
        client_id: ArcadeGlobalScores.clientId(),
      }),
    });
    return !!res;
  }

  // Top `limit` rows, best first. null when unreachable (distinct from [] = empty).
  static async top(limit = 5) {
    const q = `${TABLE}?select=initials,score,client_id,created_at`
            + `&order=score.desc,created_at.asc&limit=${Math.max(1, Math.min(50, limit))}`;
    const res = await ArcadeGlobalScores._fetch(q);
    if (!res) return null;
    try {
      const rows = await res.json();
      if (!Array.isArray(rows)) return null;
      const me = ArcadeGlobalScores.clientId();
      return rows.map(r => ({
        initials: r.initials ?? '???',
        score: r.score ?? 0,
        isMe: r.client_id === me,
      }));
    } catch (e) {
      console.warn('[ArcadeGlobalScores] bad payload:', e.message);
      return null;
    }
  }

  // Where `score` would land (1-based), or null if unreachable. Counts strictly
  // better scores, so it works without paging the whole table.
  static async rankFor(score) {
    const s = Math.round(Number(score) || 0);
    if (s <= 0) return null;
    const res = await ArcadeGlobalScores._fetch(`${TABLE}?select=id&score=gt.${s}`, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact', Range: '0-0' },
    });
    if (!res) return null;
    const total = Number(res.headers.get('content-range')?.split('/')?.[1]);
    return Number.isFinite(total) ? total + 1 : null;
  }
}
