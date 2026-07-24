-- Leaderboard hardening. Run once in the Supabase SQL Editor.
-- See docs/leaderboard-setup.md for what this does and why.
--
-- Deliberately formatted with NO column alignment and NO multi-space padding:
-- the SQL editor's autocomplete can fire inside runs of whitespace and eat
-- part of the line. Every statement is independent and idempotent, so this is
-- safe to run again if a previous attempt failed partway through.

delete from public.scores where client_id like 'probe-%' or client_id like 'ordering-%';

alter table public.scores add column if not exists time_points integer not null default 0;
alter table public.scores add column if not exists deer integer not null default 0;
alter table public.scores add column if not exists combo integer not null default 0;
alter table public.scores add column if not exists holes integer not null default 0;
alter table public.scores add column if not exists golden integer not null default 0;

alter table public.scores drop constraint if exists scores_time_range;
alter table public.scores add constraint scores_time_range check (time_points between 0 and 540);

alter table public.scores drop constraint if exists scores_deer_range;
alter table public.scores add constraint scores_deer_range check (deer between 0 and 80);

alter table public.scores drop constraint if exists scores_combo_range;
alter table public.scores add constraint scores_combo_range check (combo between 0 and 12);

alter table public.scores drop constraint if exists scores_holes_range;
alter table public.scores add constraint scores_holes_range check (holes between 0 and 60);

alter table public.scores drop constraint if exists scores_golden_range;
alter table public.scores add constraint scores_golden_range check (golden between 0 and 3);

alter table public.scores drop constraint if exists scores_donuts_min;
alter table public.scores add constraint scores_donuts_min check (donuts between 1 and 30);

-- The important one: the total must equal the sum of its parts. This mirrors
-- ScoreSystem.calculate() exactly. If the scoring formula changes in the game,
-- change it here too or every honest score will be rejected.
alter table public.scores drop constraint if exists scores_math;
alter table public.scores add constraint scores_math check (score = donuts * 20 + party_size * 80 + time_points + deer * 5 + combo * 15 + holes * 3 + golden * 50);
