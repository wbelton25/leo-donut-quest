# World Leaderboard Setup (Supabase)

The game ships with the world board **switched off**. Until `src/config.js` has
credentials, everything runs local-only: personal bests still work, and the
WORLD tab just says "Not switched on yet!". Nothing else changes.

Turning it on is three steps and takes about ten minutes.

---

## 1. Create the project

1. Sign up at <https://supabase.com> (free tier — no card).
2. **New project**. Name it whatever; pick the region closest to you.
3. Wait ~2 minutes for it to provision.

## 2. Create the table

Open **SQL Editor** → **New query**, paste this, and hit Run:

```sql
create table public.scores (
  id          bigint generated always as identity primary key,
  initials    text        not null,
  score       integer     not null,
  grade       text        not null,
  donuts      integer     not null default 0,
  party_size  integer     not null default 0,
  client_id   text        not null,
  created_at  timestamptz not null default now(),

  -- These bounds are the real anti-cheat. The API key is public by design, so
  -- anyone can POST; these make sure what they POST has to look like a score.
  -- A perfect run lands around 1,900, so 5,000 is generous but not absurd.
  constraint scores_initials_fmt check (initials ~ '^[A-Z?]{3}$'),
  constraint scores_score_range  check (score      between 1 and 5000),
  constraint scores_grade_valid  check (grade      in ('S','A','B','C','D')),
  constraint scores_donuts_range check (donuts     between 0 and 100),
  constraint scores_party_range  check (party_size between 0 and 4),
  constraint scores_client_len   check (char_length(client_id) between 8 and 64)
);

-- Serves the "top 5" query straight from the index.
create index scores_rank_idx on public.scores (score desc, created_at asc);

alter table public.scores enable row level security;

-- Read the board, and add to it. That is all.
create policy "anyone can read scores"
  on public.scores for select to anon using (true);

create policy "anyone can add a score"
  on public.scores for insert to anon with check (true);

-- Note there is deliberately NO update or delete policy. With RLS on, anything
-- without a policy is denied, so a stray API key cannot edit or wipe the board.
```

## 3. Wire up the game

**Project Settings → API**, then copy two values into `src/config.js`:

| Supabase field | Goes into |
|---|---|
| Project URL (`https://xxxx.supabase.co`) | `SUPABASE_URL` |
| `anon` `public` key | `SUPABASE_ANON_KEY` |

```js
export const SUPABASE_URL      = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

Commit and push — Actions redeploys, and the WORLD tab goes live.

> **Use the `anon` key, never the `service_role` key.** The `anon` key is meant
> to be public and is fully constrained by the policies above. The
> `service_role` key bypasses RLS entirely and must never reach the browser.

---

## What this does and doesn't protect against

**Handled.** Nobody can edit or delete existing scores (no policy grants it).
Nobody can plant `score = 999999999` (CHECK constraint). Nobody can put a rude
word in the initials — `src/utils/cleanInitials.js` filters client-side and the
regex constraint backstops it server-side.

**Not handled.** Someone who reads the JS bundle can find the endpoint and POST
a plausible-but-fake score, e.g. 1,850 without playing. Preventing that would
require the server to referee the whole run, which isn't worth it here. If the
board ever does get polluted, you can delete rows by hand from the Supabase
table editor — the browser can't, but you can.

## Turning it back off

Blank out both values in `src/config.js` and redeploy. The game reverts to
local-only with no other changes.

## Housekeeping

Free tier pauses a project after ~1 week of no activity; opening the dashboard
resumes it. If the board is idle for long stretches, a paused project is the
likely reason the WORLD tab reads "BOARD OFFLINE" — the game handles it
gracefully either way.
