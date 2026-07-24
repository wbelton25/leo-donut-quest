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

Supabase renamed its API keys in 2025, so what you see depends on how new the
project is. Either generation works — you want the **browser-safe** one:

| Dashboard label | Older name | Looks like | Use it? |
|---|---|---|---|
| **Publishable key** | `anon` / `public` | `sb_publishable_...` or `eyJhbGciOi...` | ✅ yes |
| **Secret key** | `service_role` | `sb_secret_...` | ❌ **never** |

> **The secret key must never reach the browser.** It bypasses Row Level
> Security completely — anyone who found it could read, rewrite, or drop the
> whole table. The publishable key is designed to be public and is fully
> constrained by the policies above. Under the hood it still authenticates as
> the Postgres `anon` role, which is why the policies in step 2 say `to anon`.

**Finding the Project URL.** In the newer dashboard it lives under
**Project Settings → Data API**, not on the keys page. Failing that, read it out
of your browser's address bar — `.../dashboard/project/<REF>` means your URL is
`https://<REF>.supabase.co`.

**Finding the keys.** **Project Settings → API Keys**.

Then fill in `src/config.js`:

```js
export const SUPABASE_URL      = 'https://abcdefghijklmnop.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_...';   // publishable, NOT secret
```

Commit and push — Actions redeploys, and the WORLD tab goes live.

### Check it worked

From a terminal, with your two values substituted:

```bash
curl -sS "https://<REF>.supabase.co/rest/v1/scores?select=score&limit=1" \
  -H "apikey: <publishable key>"
```

`[]` is success — the table is reachable and empty. An error mentioning JWT or
an API key means the key is wrong; `relation "scores" does not exist` means
step 2 didn't run.

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
