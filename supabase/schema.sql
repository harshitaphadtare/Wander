-- Wander cloud sync schema.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run.

create table if not exists public.records (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  table_name        text not null check (table_name in ('places', 'visits', 'walks', 'picks', 'lists')),
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

-- ---------------------------------------------------------------------------
-- Encryption (added Oct 2026).
-- The app encrypts each row's `data` with AES-256-GCM before upload. Each user's
-- key is an HMAC of their user id under a root secret stored in Supabase Vault
-- (encrypted at rest, never in this table or in backups of it). Only a signed-in
-- user can fetch their own key, through data_key() below.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'wander_data_key_root') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'wander_data_key_root',
      'Root secret for Wander per-user encryption keys. Never rotate or delete: data encrypted with it would become unreadable.'
    );
  end if;
end $$;

create or replace function public.data_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  root text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select decrypted_secret into root from vault.decrypted_secrets where name = 'wander_data_key_root';
  if root is null then
    raise exception 'encryption root secret is missing';
  end if;
  return encode(extensions.hmac(uid::text, root, 'sha256'), 'base64');
end $$;

revoke all on function public.data_key() from public, anon;
grant execute on function public.data_key() to authenticated;

-- Reject plaintext from now on. NOT VALID skips rows written before encryption;
-- the app re-uploads those encrypted the next time each device syncs.
alter table public.records drop constraint if exists records_data_encrypted;
alter table public.records add constraint records_data_encrypted
  check (data ? 'iv' and data ? 'ct' and (data ->> 'v') = '1') not valid;

-- ---------------------------------------------------------------------------
-- Lists (added Oct 2026): allow the new synced table. Safe to re-run.
-- ---------------------------------------------------------------------------
alter table public.records drop constraint if exists records_table_name_check;
alter table public.records add constraint records_table_name_check
  check (table_name in ('places', 'visits', 'walks', 'picks', 'lists'));

-- ---------------------------------------------------------------------------
-- Photos across devices (added Oct 2026). Safe to re-run.
-- A private bucket; each account can only touch files under its own folder
-- (<user id>/...). The app encrypts every photo before upload, so the bucket
-- only ever holds ciphertext. Free plan: 1 GB of storage, roughly 2,000 photos.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('photos', 'photos', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;

drop policy if exists "wander photos: select own" on storage.objects;
drop policy if exists "wander photos: insert own" on storage.objects;
drop policy if exists "wander photos: update own" on storage.objects;
drop policy if exists "wander photos: delete own" on storage.objects;

create policy "wander photos: select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "wander photos: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "wander photos: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "wander photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
