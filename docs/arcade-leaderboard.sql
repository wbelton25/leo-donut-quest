-- Donut Rain (mobile arcade) world board — run once in the Supabase SQL Editor.
--
-- Separate from the adventure's `scores` table on purpose: an arcade run is a
-- single endless score with none of the adventure's components (donuts, deer,
-- combo, ...), and it can climb past that table's 5,000 ceiling. Same shape and
-- same RLS pattern as `scores`, just simpler.
--
-- Formatted with no alignment padding (the SQL editor's autocomplete can eat
-- text inside runs of whitespace). Safe to run once; idempotent guards included.

create table if not exists public.arcade_scores (
  id bigint generated always as identity primary key,
  initials text not null,
  score integer not null,
  client_id text not null,
  created_at timestamptz not null default now()
);

alter table public.arcade_scores drop constraint if exists arcade_initials_fmt;
alter table public.arcade_scores add constraint arcade_initials_fmt check (initials ~ '^[A-Z?]{3}$');

alter table public.arcade_scores drop constraint if exists arcade_score_range;
alter table public.arcade_scores add constraint arcade_score_range check (score between 1 and 1000000);

alter table public.arcade_scores drop constraint if exists arcade_client_len;
alter table public.arcade_scores add constraint arcade_client_len check (char_length(client_id) between 8 and 64);

create index if not exists arcade_scores_rank_idx on public.arcade_scores (score desc, created_at asc);

alter table public.arcade_scores enable row level security;

-- Read the board and add to it. No update or delete policy, so with RLS on those
-- are denied — a stray key can't edit or wipe the board.
drop policy if exists "anyone can read arcade scores" on public.arcade_scores;
create policy "anyone can read arcade scores" on public.arcade_scores for select to anon using (true);

drop policy if exists "anyone can add an arcade score" on public.arcade_scores;
create policy "anyone can add an arcade score" on public.arcade_scores for insert to anon with check (true);
