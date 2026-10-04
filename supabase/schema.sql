-- Wander cloud sync schema.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run.

create table if not exists public.records (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  table_name        text not null check (table_name in ('places', 'visits', 'walks', 'picks')),
  data              jsonb not null,
  updated_at        bigint not null,          -- client ms timestamp, used for last-write-wins
  deleted           boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp()  -- pull cursor, set by server
);

create index if not exists records_user_cursor on public.records (user_id, server_updated_at);

-- Always stamp server time on write, whatever the client sends.
create or replace function public.records_touch()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.records_touch();

-- Row-level security: each signed-in user can only see and change their own rows.
alter table public.records enable row level security;

drop policy if exists "own rows: select" on public.records;
drop policy if exists "own rows: insert" on public.records;
drop policy if exists "own rows: update" on public.records;
drop policy if exists "own rows: delete" on public.records;

create policy "own rows: select" on public.records
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.records
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.records
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.records
  for delete to authenticated using ((select auth.uid()) = user_id);
