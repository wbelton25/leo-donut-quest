// Runtime configuration for external services.
//
// SUPABASE_ANON_KEY is *designed* to be public — it ships inside the JS bundle
// no matter where you store it, so committing it here is no less safe than any
// alternative. The real security boundary is the Row Level Security policy on
// the table (read + insert only, no update/delete) plus the CHECK constraints
// that bound what a score is allowed to look like. See docs/leaderboard-setup.md.
//
// Leave these empty and the game simply runs local-only: the world board shows
// an "offline" message and everything else behaves exactly as before.

export const SUPABASE_URL      = 'https://oyxdskjivrpzrbkskarz.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_d7AD22kbgAj9F2aA09y27w_xR4h0zuw';
