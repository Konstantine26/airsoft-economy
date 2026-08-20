-- Airsoft Economy: expose the migrations ledger to admins for the in-app
-- "Миграции" monitor (AdminMigrationsTab.tsx).
-- Run after supabase/023_creation_request_cleanup.sql.
--
-- deploy/supabase/migrate.sh already creates and maintains
-- public._migrations_applied on the self-hosted instance (inserting a row
-- for every supabase/NNN_*.sql file it successfully applies, every 5
-- minutes via airsoft-migrate.timer). This migration:
--   1. Creates the same table on any environment that doesn't have it yet
--      (e.g. the cloud test project, which has no migrate.sh timer and has
--      always been updated by hand via the SQL Editor).
--   2. Adds RLS so admins can read it from the app, plus insert/delete so
--      an admin can mark a migration as applied by hand (needed on
--      environments like the cloud project, where a file applied via the
--      SQL Editor never gets an automatic ledger row).
--
-- Note for whoever writes migration 025+: add its filename to
-- EXPECTED_MIGRATIONS in lib/migrations.ts, or the monitor will show it as
-- an "unknown ledger entry" once applied instead of a normal green row.

create table if not exists public._migrations_applied (
  filename text primary key,
  applied_at timestamptz not null default now()
);

alter table public._migrations_applied enable row level security;

drop policy if exists "admin reads migrations ledger" on public._migrations_applied;
create policy "admin reads migrations ledger" on public._migrations_applied
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admin marks migration applied" on public._migrations_applied;
create policy "admin marks migration applied" on public._migrations_applied
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admin unmarks migration applied" on public._migrations_applied;
create policy "admin unmarks migration applied" on public._migrations_applied
  for delete to authenticated
  using (public.is_admin());

-- This migration's own row won't exist yet the first time it runs (the
-- ledger insert in migrate.sh happens right after this file executes
-- successfully), which is fine -- the monitor shows it the same as any
-- other row once that insert lands.
