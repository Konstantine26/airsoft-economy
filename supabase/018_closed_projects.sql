-- Airsoft Economy: closed ("invite-only") projects
-- Run after supabase/017_trader_charge.sql.
--
-- A project can be marked is_closed: it disappears from every "list of
-- projects" screen (admin picker, project switcher, cross-project game
-- lists) for everyone except admins, that project's organizers (project-
-- or game-scoped), and the teams/players explicitly allow-listed via the
-- two new junction tables below. Organizers and admins manage that
-- allow-list; only admins can flip is_closed itself (projects already
-- being admin-only write, see 007_scoped_roles.sql).

alter table projects add column if not exists is_closed boolean not null default false;

create table if not exists project_allowed_teams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, team_id)
);

create table if not exists project_allowed_players (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, profile_id)
);

alter table project_allowed_teams enable row level security;
alter table project_allowed_players enable row level security;

-- ============================================================
-- Helper functions
-- ============================================================
--
-- IMPORTANT: project_is_closed()/can_view_project() both re-query
-- `projects` by id. They are safe to call from OTHER tables' RLS
-- policies (e.g. games, below) but must NEVER be called from
-- `projects`' own select policy -- PostgREST sends INSERT/UPDATE ...
-- RETURNING *, and Postgres checks the target table's select policy
-- against the just-written row as part of that same command. A
-- security-definer function re-querying that same table by id during
-- RETURNING always finds zero rows (MVCC: a command can't see its own
-- not-yet-complete write via a separate scan) and the check silently,
-- permanently evaluates false. Hit this exact bug on `tasks` already --
-- see 016_fix_task_returning_rls.sql. `projects`' policy below reads
-- only its own row columns (is_closed, id) to avoid repeating it.

create or replace function public.project_is_closed(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_closed from projects where id = p_project_id), false);
$$;

create or replace function public.can_view_project(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    not public.project_is_closed(p_project_id)
    or public.is_project_organizer(p_project_id)
    or exists (
      select 1 from project_allowed_players
      where project_id = p_project_id and profile_id = auth.uid()
    )
    or exists (
      select 1 from project_allowed_teams pat
      where pat.project_id = p_project_id
        and (public.is_team_commander(pat.team_id) or public.is_team_member(pat.team_id))
    );
$$;

grant execute on function public.project_is_closed(uuid) to authenticated;
grant execute on function public.can_view_project(uuid) to authenticated;

-- ============================================================
-- project_allowed_teams / project_allowed_players policies
-- ============================================================
-- Read: the project's organizers (who manage the list) plus whoever the
-- row is actually about (the team's own commander/members, or the
-- player themselves) -- so the app can tell an allowed team/player they
-- have access. Write: project organizers or admin only.

drop policy if exists "read project_allowed_teams" on project_allowed_teams;
create policy "read project_allowed_teams" on project_allowed_teams for select to authenticated using (
  is_project_organizer(project_id) or is_team_commander(team_id) or is_team_member(team_id)
);
drop policy if exists "organizers write project_allowed_teams" on project_allowed_teams;
create policy "organizers write project_allowed_teams" on project_allowed_teams for insert to authenticated
  with check (is_project_organizer(project_id));
drop policy if exists "organizers delete project_allowed_teams" on project_allowed_teams;
create policy "organizers delete project_allowed_teams" on project_allowed_teams for delete to authenticated
  using (is_project_organizer(project_id));

drop policy if exists "read project_allowed_players" on project_allowed_players;
create policy "read project_allowed_players" on project_allowed_players for select to authenticated using (
  is_project_organizer(project_id) or profile_id = auth.uid()
);
drop policy if exists "organizers write project_allowed_players" on project_allowed_players;
create policy "organizers write project_allowed_players" on project_allowed_players for insert to authenticated
  with check (is_project_organizer(project_id));
drop policy if exists "organizers delete project_allowed_players" on project_allowed_players;
create policy "organizers delete project_allowed_players" on project_allowed_players for delete to authenticated
  using (is_project_organizer(project_id));

-- ============================================================
-- projects: closed projects are invisible to everyone not covered above.
-- ============================================================

drop policy if exists "read projects" on projects;
create policy "read projects" on projects for select to authenticated using (
  not is_closed
  or is_project_organizer(id)
  or exists (
    select 1 from project_allowed_players
    where project_id = projects.id and profile_id = auth.uid()
  )
  or exists (
    select 1 from project_allowed_teams pat
    where pat.project_id = projects.id
      and (is_team_commander(pat.team_id) or is_team_member(pat.team_id))
  )
);

-- ============================================================
-- games: same visibility as their parent project, plus a game's own
-- organizer even if they aren't a project-wide organizer. Inlined
-- rather than calling is_game_organizer(id) -- that function re-queries
-- `games` by id internally, which is the same RETURNING self-scan trap
-- described above, just one hop further out.
-- ============================================================

drop policy if exists "read games" on games;
create policy "read games" on games for select to authenticated using (
  is_admin()
  or exists (select 1 from game_organizers where game_id = games.id and profile_id = auth.uid())
  or can_view_project(project_id)
);
