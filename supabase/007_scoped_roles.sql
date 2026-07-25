-- Airsoft Economy: scoped organizer assignments + participant confirmation
-- Run after supabase/006_polygons.sql.
--
-- Replaces the global "organizer" role with per-project / per-game
-- assignments so a single person can simultaneously be an organizer on
-- some games, a team commander, a side commander and a plain participant.
-- Also adds a pending/confirmed status (and an individual side override)
-- to game_participants so organizers can review rosters instead of team
-- commanders' registrations taking effect instantly.

-- ============================================================
-- Assignment tables
-- ============================================================

create table if not exists project_organizers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, profile_id)
);

create table if not exists game_organizers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, profile_id)
);

alter table project_organizers enable row level security;
alter table game_organizers enable row level security;

-- ============================================================
-- Grandfather existing global organizers into every current project,
-- then collapse profiles.role down to admin/member only.
-- ============================================================

insert into project_organizers (project_id, profile_id)
select p.id, pr.id
from projects p
cross join profiles pr
where pr.role = 'organizer'
on conflict (project_id, profile_id) do nothing;

update profiles set role = 'member' where role = 'organizer';

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'member'));

-- ============================================================
-- Scoped organizer helper functions
-- ============================================================

create or replace function public.is_project_organizer(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from project_organizers where project_id = p_project_id and profile_id = auth.uid()
  );
$$;

create or replace function public.is_game_organizer(p_game_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from game_organizers where game_id = p_game_id and profile_id = auth.uid()
    )
    or public.is_project_organizer((select project_id from games where id = p_game_id));
$$;

grant execute on function public.is_project_organizer(uuid) to authenticated;
grant execute on function public.is_game_organizer(uuid) to authenticated;

-- ============================================================
-- game_participants: confirmation status + individual side override
-- ============================================================

alter table game_participants add column if not exists status text not null default 'pending'
  check (status in ('pending', 'confirmed'));
alter table game_participants add column if not exists side_id uuid references game_sides(id);

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

  if new.side_id is not null and not exists (
    select 1 from game_sides where id = new.side_id and game_id = new.game_id
  ) then
    raise exception 'side % does not belong to game %', new.side_id, new.game_id;
  end if;

  return new;
end;
$$;

-- ============================================================
-- Drop the old blanket "organizer" policies before dropping the
-- role-wide helper function they depended on.
-- ============================================================

drop policy if exists "organizers write projects" on projects;
drop policy if exists "organizers update projects" on projects;

drop policy if exists "organizers write games" on games;
drop policy if exists "organizers update games" on games;

drop policy if exists "organizers write game_sides" on game_sides;
drop policy if exists "organizers update game_sides" on game_sides;
drop policy if exists "admins delete game_sides" on game_sides;

drop policy if exists "organizers write teams" on teams;
drop policy if exists "organizers update teams" on teams;

drop policy if exists "commander sets team side" on game_team_sides;
drop policy if exists "commander updates team side" on game_team_sides;
drop policy if exists "commander removes team side" on game_team_sides;

drop policy if exists "read game_participants" on game_participants;
drop policy if exists "commander registers participants" on game_participants;
drop policy if exists "commander unregisters participants" on game_participants;

drop policy if exists "read own personal_transactions" on personal_transactions;

-- deposit_to_participant referenced is_organizer() in its body (a text
-- reference, not a hard dependency) -- repoint it to admin-only before
-- the function disappears.
create or replace function public.deposit_to_participant(
  p_to_profile_id uuid,
  p_amount numeric,
  p_note text default null
)
returns personal_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row personal_transactions;
begin
  if not public.is_admin() then
    raise exception 'only admins can deposit funds';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  perform 1 from profiles where id = p_to_profile_id for update;

  update profiles set balance = balance + p_amount where id = p_to_profile_id;

  insert into personal_transactions (kind, to_profile_id, amount, note)
  values ('deposit', p_to_profile_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.deposit_to_team(
  p_to_team_id uuid,
  p_amount numeric,
  p_note text default null
)
returns transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row transactions;
begin
  if not public.is_admin() then
    raise exception 'only admins can deposit funds';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  perform 1 from teams where id = p_to_team_id for update;

  update teams set balance = balance + p_amount where id = p_to_team_id;

  insert into transactions (to_team_id, amount, note)
  values (p_to_team_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.deposit_to_team(uuid, numeric, text) to authenticated;

drop function if exists public.is_organizer();

-- ============================================================
-- New scoped policies
-- ============================================================

create policy "read project_organizers" on project_organizers for select to authenticated using (true);
create policy "admins write project_organizers" on project_organizers for insert to authenticated
  with check (is_admin());
create policy "admins delete project_organizers" on project_organizers for delete to authenticated
  using (is_admin());

create policy "read game_organizers" on game_organizers for select to authenticated using (true);
create policy "admins write game_organizers" on game_organizers for insert to authenticated
  with check (is_admin());
create policy "admins delete game_organizers" on game_organizers for delete to authenticated
  using (is_admin());

-- projects: only admins create/edit now (was: any global organizer).
create policy "admins write projects" on projects for insert to authenticated
  with check (is_admin());
create policy "admins update projects" on projects for update to authenticated
  using (is_admin()) with check (is_admin());

-- games: admins create; admins or the game's assigned organizer edit the card.
create policy "admins write games" on games for insert to authenticated
  with check (is_admin());
create policy "organizers update games" on games for update to authenticated
  using (is_game_organizer(id)) with check (is_game_organizer(id));

-- game_sides: managing a game's sides is part of running that game.
create policy "organizers write game_sides" on game_sides for insert to authenticated
  with check (is_game_organizer(game_id));
create policy "organizers update game_sides" on game_sides for update to authenticated
  using (is_game_organizer(game_id)) with check (is_game_organizer(game_id));
create policy "organizers delete game_sides" on game_sides for delete to authenticated
  using (is_game_organizer(game_id));

-- teams: admin-only CRUD.
create policy "admins write teams" on teams for insert to authenticated
  with check (is_admin());
create policy "admins update teams" on teams for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "admins delete teams" on teams for delete to authenticated
  using (is_admin());

-- game_team_sides: a team's commander, or the game's organizer/admin.
create policy "commander sets team side" on game_team_sides for insert to authenticated
  with check (is_team_commander(team_id) or is_game_organizer(game_id));
create policy "commander updates team side" on game_team_sides for update to authenticated
  using (is_team_commander(team_id) or is_game_organizer(game_id))
  with check (is_team_commander(team_id) or is_game_organizer(game_id));
create policy "commander removes team side" on game_team_sides for delete to authenticated
  using (is_team_commander(team_id) or is_game_organizer(game_id));

-- game_participants: commanders register (always pending); only the
-- game's organizer/admin confirms, deletes anyone's entry, or moves a
-- participant to a different side via the side_id override.
create policy "read game_participants" on game_participants for select to authenticated using (
  is_game_organizer(game_id)
  or is_team_commander(team_id)
  or is_team_member(team_id)
  or commands_side_for_team_game(game_id, team_id)
);
create policy "commander registers participants" on game_participants for insert to authenticated
  with check (is_team_commander(team_id) and (status is null or status = 'pending'));
create policy "organizer updates participants" on game_participants for update to authenticated
  using (is_game_organizer(game_id)) with check (is_game_organizer(game_id));
create policy "commander unregisters participants" on game_participants for delete to authenticated
  using (is_team_commander(team_id) or is_game_organizer(game_id));

-- personal_transactions: admins see everything; everyone else sees only
-- what touches them or a team they command.
create policy "read own personal_transactions" on personal_transactions for select to authenticated using (
  is_admin()
  or from_profile_id = auth.uid()
  or to_profile_id = auth.uid()
  or (from_team_id is not null and is_team_commander(from_team_id))
  or (to_team_id is not null and is_team_commander(to_team_id))
);
