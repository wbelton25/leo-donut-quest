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

## 4. Hardening (run this once, after step 3)

This makes the database re-derive every score from its parts, so a submission
has to be *internally consistent* and inside every per-component bound — not
just "a number under 5000".

Paste into **SQL Editor** and Run. It deletes the test row first, because the
new constraint validates existing rows and that row predates these columns:

**Copy this from [`leaderboard-hardening.sql`](./leaderboard-hardening.sql), not
from the block below.** The Supabase SQL editor runs Monaco with autocomplete
on, and it can fire inside runs of whitespace and swallow part of a pasted line.
The `.sql` file is formatted defensively against that — no column alignment, no
tabs, one statement per line, nothing that depends on a comma surviving the trip.

Every statement is also idempotent, so it's safe to run again if an earlier
attempt failed partway through.

If a paste still comes out mangled, run the statements **one at a time** — they
are independent by design.

```sql
-- Any test rows would fail the arithmetic check below. No-op if none exist.
delete from public.scores where client_id like 'probe-%' or client_id like 'ordering-%';

-- New columns. `if not exists` makes each line safe to re-run.
alter table public.scores add column if not exists time_points integer not null default 0;
alter table public.scores add column if not exists deer        integer not null default 0;
alter table public.scores add column if not exists combo       integer not null default 0;
alter table public.scores add column if not exists holes       integer not null default 0;
alter table public.scores add column if not exists golden      integer not null default 0;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each is dropped first.
-- Per-component ceilings: comfortably above a great run, far below what
-- someone inventing numbers would reach for.
alter table public.scores drop constraint if exists scores_time_range;
alter table public.scores add  constraint scores_time_range check (time_points between 0 and 540);

alter table public.scores drop constraint if exists scores_deer_range;
alter table public.scores add  constraint scores_deer_range check (deer between 0 and 300);

alter table public.scores drop constraint if exists scores_combo_range;
alter table public.scores add  constraint scores_combo_range check (combo between 0 and 40);

alter table public.scores drop constraint if exists scores_holes_range;
alter table public.scores add  constraint scores_holes_range check (holes between 0 and 99);

alter table public.scores drop constraint if exists scores_golden_range;
alter table public.scores add  constraint scores_golden_range check (golden between 0 and 3);

alter table public.scores drop constraint if exists scores_donuts_min;
alter table public.scores add  constraint scores_donuts_min check (donuts between 1 and 50);

-- The important one: the total must actually equal its parts. Mirrors
-- ScoreSystem.calculate() exactly — if you change the scoring formula in the
-- game, change it here too or every honest score gets rejected.
alter table public.scores drop constraint if exists scores_math;
alter table public.scores add  constraint scores_math check (
  score = donuts * 20
        + party_size * 80
        + time_points
        + deer * 5
        + combo * 15
        + holes * 3
        + golden * 50
);
```

With these in place the highest *possible* score is about 4,410 (still under the
5,000 `scores_score_range` ceiling), and reaching even that requires claiming a
maxed-out run in every category at once. Caps were raised in 2026-07 after a real
1,301 run exceeded the old combo/deer limits and got silently rejected; the game
now also clamps every component to these same numbers (see `SCORE_CAPS` in
`src/systems/ScoreSystem.js`) so an honest run can't be dropped.

## What this does and doesn't protect against

**Handled.** Nobody can edit or delete existing scores (no policy grants it).
Nobody can plant `score = 999999999`, or any total that doesn't equal the sum of
its parts, or any run with impossible component values (CHECK constraints).
Nobody can put a rude word in the initials — `cleanInitials.js` filters
client-side and the regex constraint backstops it server-side.

**Not handled.** Someone who reads the deployed JS can find the endpoint and
POST a *plausible* fake — a self-consistent ~2,000-point run they never played.

### Why a secret key in the game wouldn't fix that

The obvious next move is to have the game sign each submission with a key, and
reject unsigned inserts. It doesn't work, for the same reason the publishable
key is already public: **the game runs entirely on the player's machine, so
anything it knows, they can read.** Extract the key from the bundle, sign your
own fake, and the signature check passes. Obfuscation raises the effort but
never the ceiling — the client can always be made to lie.

This is not specific to Supabase. Moving the insert behind an Edge Function
holding a server-only secret doesn't change it either: the client still has to
be able to call that function, so an attacker just calls it the same way. It
buys real rate limiting and one place to enforce rules, but not authenticity.

The only complete fix is to stop trusting the client: submit the run's inputs
(seed plus the sequence of actions), have the server replay the game and compute
the score itself. That's genuinely secure and wildly disproportionate here — it
means maintaining a second, headless copy of the game's rules.

So the realistic goal isn't "impossible to fake", it's **"not worth faking, and
harmless when someone does."** The constraints above already force a forger to
understand the scoring formula and stay inside every bound. That's well past
the effort a kid poking at devtools will spend, and there's no prize on the
line. If the board does get polluted, delete rows from the Supabase table editor
— the browser can't, but you can.

## Turning it back off

Blank out both values in `src/config.js` and redeploy. The game reverts to
local-only with no other changes.

## Housekeeping

Free tier pauses a project after ~1 week of no activity; opening the dashboard
resumes it. If the board is idle for long stretches, a paused project is the
likely reason the WORLD tab reads "BOARD OFFLINE" — the game handles it
gracefully either way.
