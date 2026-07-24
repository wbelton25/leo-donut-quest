// GlobalScores — the shared world leaderboard (Supabase REST).
//
// This is the ONLY part of the game that talks to a network, so the guiding
// rule is: it must never be able to break anything. Every method swallows its
// own errors and resolves to a miss (`null` / `false`) instead of throwing, and
// every request is wrapped in an abort timeout so a hanging connection can't
// leave the UI stuck on "LOADING...". If SUPABASE_URL is blank, or the player
// is offline, or the service is down, the game plays exactly as it did before —
// only the world panel notices.
//
// Personal bests live in ScoreSystem (localStorage) and are completely
// independent of this. A finished run writes to both.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import cleanInitials from '../utils/cleanInitials.js';

const TABLE      = 'scores';
const CLIENT_KEY = 'leo-donut-client-id';
const TIMEOUT_MS = 6000;

// Mirrors the CHECK constraints on the table — reject junk before it flies.
const MAX_SCORE = 5000;

export default class GlobalScores {
  // False when no credentials are configured; callers use this to show an
  // "offline" panel instead of a pointless spinner.
  static get enabled() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  // A stable random id for this browser, so we can mark "that row is you" on a
  // board full of strangers. Not an identity — it's a per-device scribble, and
  // clearing site data mints a new one.
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
      // Private mode / storage disabled: fall back to a per-session id. The
      // player just won't get their rows highlighted.
      if (!GlobalScores._ephemeralId) {
        GlobalScores._ephemeralId = `s${Math.random().toString(36).slice(2, 14)}`;
      }
      return GlobalScores._ephemeralId;
    }
  }

  static async _fetch(path, init = {}) {
    if (!GlobalScores.enabled) return null;

    // AbortController gives us a hard ceiling on how long the UI can wait.
    const ctl   = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      // `apikey` alone authenticates both key generations. The legacy anon key
      // is a JWT and is additionally accepted as a bearer token; the newer
      // sb_publishable_* keys are not JWTs, so only send Authorization when the
      // key actually looks like one.
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
        console.warn(`[GlobalScores] ${res.status} ${res.statusText}`);
        return null;
      }
      return res;
    } catch (e) {
      console.warn('[GlobalScores] unreachable:', e.name === 'AbortError' ? 'timed out' : e.message);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Post a finished run. Resolves true on success, false on any failure —
  // callers should not care much either way, since the local board already has it.
  static async submit({ initials, score, grade, donuts = 0, partySize = 0 }) {
    const s = Math.round(Number(score) || 0);
    if (s <= 0 || s > MAX_SCORE) return false;   // don't bother the server with junk

    const res = await GlobalScores._fetch(TABLE, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        initials:   cleanInitials(initials),
        score:      s,
        grade:      String(grade ?? '?').slice(0, 1),
        donuts:     Math.max(0, Math.round(Number(donuts) || 0)),
        party_size: Math.max(0, Math.round(Number(partySize) || 0)),
        client_id:  GlobalScores.clientId(),
      }),
    });
    return !!res;
  }

  // Top `limit` rows, best first. Returns null when the board is unreachable —
  // deliberately distinct from [] (reachable but empty), because those two
  // states need different messages on screen.
  static async top(limit = 5) {
    const q = `${TABLE}?select=initials,score,grade,donuts,party_size,client_id,created_at`
            + `&order=score.desc,created_at.asc&limit=${Math.max(1, Math.min(50, limit))}`;
    const res = await GlobalScores._fetch(q);
    if (!res) return null;
    try {
      const rows = await res.json();
      if (!Array.isArray(rows)) return null;
      const me = GlobalScores.clientId();
      return rows.map(r => ({
        initials:  r.initials ?? '???',
        score:     r.score ?? 0,
        grade:     r.grade ?? '?',
        donuts:    r.donuts ?? 0,
        partySize: r.party_size ?? 0,
        isMe:      r.client_id === me,
        date:      GlobalScores._shortDate(r.created_at),
      }));
    } catch (e) {
      console.warn('[GlobalScores] bad payload:', e.message);
      return null;
    }
  }

  // Where this score would land on the world board (1-based), or null if we
  // can't reach it. Counts strictly-better scores, so it works without paging
  // the whole table.
  static async rankFor(score) {
    const s = Math.round(Number(score) || 0);
    if (s <= 0) return null;
    const res = await GlobalScores._fetch(`${TABLE}?select=id&score=gt.${s}`, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact', Range: '0-0' },
    });
    if (!res) return null;
    // content-range comes back as "0-0/<total>" (or "*/<total>" on an empty set).
    const total = Number(res.headers.get('content-range')?.split('/')?.[1]);
    return Number.isFinite(total) ? total + 1 : null;
  }

  static _shortDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }
}
