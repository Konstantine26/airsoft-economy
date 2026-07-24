-- Airsoft Economy: roles, projects/games, sides, rosters
-- Run after supabase/schema.sql in the SQL Editor.
-- Requires real user accounts (Supabase Auth, email+password).

-- ============================================================
-- Profiles (1:1 with auth.users)
-- ============================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'member' check (role in ('admin', 'organizer', 'member')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Creates a profile row automatically whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Old prototype "users" table is superseded by profiles/team_members.
-- ============================================================

drop table if exists users cascade;

-- ============================================================
-- Teams: add a commander
-- ============================================================

alter table teams add column if not exists commander_id uuid references profiles(id);

-- ============================================================
-- Team roster (persistent)
-- ============================================================

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id),
  unique (team_id, profile_id)
);

alter table team_members enable row level security;

-- ============================================================
-- Projects / Games / Polygons / Sides
-- ============================================================

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  polygon text not null,
  starts_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists game_sides (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  name text not null,
  commander_id uuid references profiles(id),
  unique (game_id, name)
);

create table if not exists game_team_sides (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  side_id uuid not null references game_sides(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, team_id)
);

create table if not exists game_participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, profile_id)
);

alter table projects enable row level security;
alter table games enable row level security;
alter table game_sides enable row level security;
alter table game_team_sides enable row level security;
alter table game_participants enable row level security;

-- A participant must belong to the team they're being registered under,
-- and that team must already be assigned to a side for this game.
create or replace function public.check_game_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from team_members
    where team_id = new.team_id and profile_id = new.profile_id
  ) then
    raise exception 'profile % is not a member of team %', new.profile_id, new.team_id;
  end if;

  if not exists (
    select 1 from game_team_sides
    where game_id = new.game_id and team_id = new.team_id
  ) then
    raise exception 'team % is not registered for game %', new.team_id, new.game_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_game_participant on game_participants;
create trigger trg_check_game_participant
  before insert or update on game_participants
  for each row execute function public.check_game_participant();

-- ============================================================
-- Role helper functions (SECURITY DEFINER so RLS policies below
-- can call them without recursing on profiles' own RLS).
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_organizer()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role in ('admin', 'organizer') from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_team_commander(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from teams where id = p_team_id and commander_id = auth.uid()
  );
$$;

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from team_members where team_id = p_team_id and profile_id = auth.uid()
  );
$$;

create or replace function public.is_side_commander(p_side_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from game_sides where id = p_side_id and commander_id = auth.uid()
  );
$$;

create or replace function public.commands_side_for_team_game(p_game_id uuid, p_team_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from game_team_sides gts
    join game_sides gs on gs.id = gts.side_id
    where gts.game_id = p_game_id
      and gts.team_id = p_team_id
      and gs.commander_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_organizer() to authenticated;
grant execute on function public.is_team_commander(uuid) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_side_commander(uuid) to authenticated;
grant execute on function public.commands_side_for_team_game(uuid, uuid) to authenticated;

-- Non-admins can never change their own role, no matter what they submit.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_role on profiles;
create trigger trg_protect_profile_role
  before update on profiles
  for each row execute function public.protect_profile_role();

-- ============================================================
-- RLS policies
-- ============================================================

-- profiles: everyone signed in can read (needed to show rosters/commanders
-- by name); only the owner or an admin can update; inserts happen only via
-- the handle_new_user trigger.
create policy "read profiles" on profiles for select to authenticated using (true);
create policy "update own profile or admin" on profiles for update to authenticated
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

-- projects: readable by everyone signed in; only organizers/admins manage.
create policy "read projects" on projects for select to authenticated using (true);
create policy "organizers write projects" on projects for insert to authenticated
  with check (is_organizer());
create policy "organizers update projects" on projects for update to authenticated
  using (is_organizer()) with check (is_organizer());
create policy "admins delete projects" on projects for delete to authenticated
  using (is_admin());

-- games: same shape as projects.
create policy "read games" on games for select to authenticated using (true);
create policy "organizers write games" on games for insert to authenticated
  with check (is_organizer());
create policy "organizers update games" on games for update to authenticated
  using (is_organizer()) with check (is_organizer());
create policy "admins delete games" on games for delete to authenticated
  using (is_admin());

-- game_sides: organizers create sides and assign a commander to each.
create policy "read game_sides" on game_sides for select to authenticated using (true);
create policy "organizers write game_sides" on game_sides for insert to authenticated
  with check (is_organizer());
create policy "organizers update game_sides" on game_sides for update to authenticated
  using (is_organizer()) with check (is_organizer());
create policy "admins delete game_sides" on game_sides for delete to authenticated
  using (is_admin());

-- teams: readable by everyone signed in; organizers/admins manage the
-- roster of teams and who commands them.
create policy "read teams" on teams for select to authenticated using (true);
create policy "organizers write teams" on teams for insert to authenticated
  with check (is_organizer());
create policy "organizers update teams" on teams for update to authenticated
  using (is_organizer()) with check (is_organizer());

-- team_members: readable by everyone signed in; a team's own commander
-- (or an admin) manages its roster.
create policy "read team_members" on team_members for select to authenticated using (true);
create policy "commander writes team_members" on team_members for insert to authenticated
  with check (is_team_commander(team_id));
create policy "commander deletes team_members" on team_members for delete to authenticated
  using (is_team_commander(team_id));

-- game_team_sides: a team's commander picks which side their team joins
-- for a given game (organizers/admins can also set this up front).
create policy "read game_team_sides" on game_team_sides for select to authenticated using (true);
create policy "commander sets team side" on game_team_sides for insert to authenticated
  with check (is_team_commander(team_id) or is_organizer());
create policy "commander updates team side" on game_team_sides for update to authenticated
  using (is_team_commander(team_id) or is_organizer())
  with check (is_team_commander(team_id) or is_organizer());
create policy "commander removes team side" on game_team_sides for delete to authenticated
  using (is_team_commander(team_id) or is_organizer());

-- game_participants: a team's commander registers which of their own
-- roster members are actually playing. Visible to: admins, organizers,
-- that team's commander/members, and the commander of the side they're
-- playing on.
create policy "read game_participants" on game_participants for select to authenticated using (
  is_admin()
  or is_organizer()
  or is_team_commander(team_id)
  or is_team_member(team_id)
  or commands_side_for_team_game(game_id, team_id)
);
create policy "commander registers participants" on game_participants for insert to authenticated
  with check (is_team_commander(team_id));
create policy "commander unregisters participants" on game_participants for delete to authenticated
  using (is_team_commander(team_id));

-- ============================================================
-- Tighten the earlier prototype's teams/transactions access: it was
-- open to anon reads before real accounts existed. Require login now.
-- ============================================================

drop policy if exists "anon read teams" on teams;
drop policy if exists "anon read transactions" on transactions;

create policy "read transactions" on transactions for select to authenticated using (true);

revoke execute on function transfer_funds(uuid, uuid, numeric, text) from anon;
