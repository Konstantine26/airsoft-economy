-- Airsoft Economy: multi-club foundation, schema only -- NOT wired into RLS
-- Run after supabase/026_project_archival.sql.
--
-- Purely additive "dark launch": new clubs/club_admins tables and a
-- nullable club_id on projects/polygons, so the shape exists before more
-- club-shaped features get built on top -- but nothing reads or enforces
-- any of it yet. No existing table, policy, or function is touched.
--
-- Deliberately NOT done here (separate, much riskier follow-up migration):
--   - Any RLS policy on clubs/club_admins -- both tables have RLS enabled
--     with zero policies, which means "nobody, not even authenticated
--     users, can read or write them" until policies are added. That's the
--     safest possible state for a table nothing depends on yet.
--   - Scoping is_admin()/is_project_organizer()/any existing policy to a
--     club. Every current policy keeps working exactly as before.
--   - teams/profiles get NO club_id, on purpose -- see the multi-club
--     roadmap notes: a player or team routinely plays at more than one
--     club, so those stay global, not owned by any single club.
--   - Backfilling club_id for existing projects/polygons -- there's
--     nothing to backfill into yet (no club rows), and doing it is part
--     of the next stage, once there's an actual RLS story to backfill for.

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table clubs enable row level security;

create table if not exists club_admins (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, profile_id)
);

alter table club_admins enable row level security;

alter table projects add column if not exists club_id uuid references clubs(id) on delete cascade;
alter table polygons add column if not exists club_id uuid references clubs(id) on delete cascade;
