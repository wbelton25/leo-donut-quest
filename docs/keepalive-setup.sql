-- Keep-alive heartbeat table. Run once in the Supabase SQL Editor.
--
-- Why this exists: Supabase's free-tier auto-pause does NOT count lightweight
-- anonymous REST *reads* as activity. Our twice-weekly backup GETs were ignored
-- and the project paused anyway (the Aug 9 "inactive >7 days" warning landed
-- three days after a successful backup read). A real *write* is far more likely
-- to register as genuine database activity, so the backup workflow now UPDATEs
-- this table on every run.
--
-- One row, update-only by design: there is no insert or delete policy, so with
-- RLS on, the anon key can touch the single heartbeat row and nothing else — it
-- can't grow the table, wipe it, or reach the score tables. The row's value
-- doesn't matter; the write itself is the point.
--
-- Formatted with no alignment padding (the SQL editor's autocomplete can eat
-- text inside runs of whitespace). Idempotent — safe to run more than once.

create table if not exists public.keepalive (
  id smallint primary key,
  beat_at timestamptz not null default now()
);

-- Seed the single row the workflow will keep touching.
insert into public.keepalive (id) values (1) on conflict (id) do nothing;

alter table public.keepalive enable row level security;

-- Read is allowed so the workflow can confirm the write landed; update is
-- pinned to id = 1 so even the one row's id can't be changed. No insert/delete
-- policy, so those are denied with RLS on.
drop policy if exists "anyone can read keepalive" on public.keepalive;
create policy "anyone can read keepalive" on public.keepalive for select to anon using (true);

drop policy if exists "anyone can touch keepalive" on public.keepalive;
create policy "anyone can touch keepalive" on public.keepalive for update to anon using (id = 1) with check (id = 1);
