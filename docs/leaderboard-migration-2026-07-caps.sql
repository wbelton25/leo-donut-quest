-- Leaderboard cap raise — run once in the Supabase SQL Editor.
--
-- A legit 1,301 run was silently rejected because its combo/deer exceeded the
-- old per-component ceilings (combo 12, deer 80). These raise the ceilings well
-- above real play. The game clamps every component to these same numbers
-- (SCORE_CAPS in src/systems/ScoreSystem.js), so the two must stay in sync.
--
-- Only the changed constraints are here; everything else in leaderboard-hardening.sql
-- is unchanged. Each statement is idempotent (drop-then-add), safe to re-run.

alter table public.scores drop constraint if exists scores_combo_range;
alter table public.scores add constraint scores_combo_range check (combo between 0 and 40);

alter table public.scores drop constraint if exists scores_deer_range;
alter table public.scores add constraint scores_deer_range check (deer between 0 and 300);

alter table public.scores drop constraint if exists scores_holes_range;
alter table public.scores add constraint scores_holes_range check (holes between 0 and 99);

alter table public.scores drop constraint if exists scores_donuts_min;
alter table public.scores add constraint scores_donuts_min check (donuts between 1 and 50);
