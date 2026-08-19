-- Airsoft Economy: team commander can disband their own team
-- Run after supabase/021_team_creation_requests.sql.
--
-- Previously only an admin could delete a team (AdminTeamsTab.tsx).
-- Adds disband_team(): a team's own commander (or an admin) can delete
-- it too. team_members, project_team_balances/project_profile_balances*,
-- game_team_sides, project_allowed_teams and team_join_requests all
-- already cascade on teams(id), so this alone removes every member and
-- every project balance the team had -- matching the warning shown in
-- the app ("все участники будут исключены, бюджет будет потерян").
-- *project_profile_balances references profiles, not teams -- unrelated.
--
-- Four other tables reference teams(id) WITHOUT cascade and would block
-- a plain delete for any team with real transaction/task history
-- (the realistic case): transactions, personal_transactions, tasks, and
-- team_creation_requests.resulting_team_id. Those are money/task ledgers
-- and audit trails, not team membership -- deleting those ROWS would be
-- worse than the team-not-deletable error, so switch their FK to
-- ON DELETE SET NULL instead: history stays, just detached from the now
-- -gone team.

alter table transactions drop constraint if exists transactions_from_team_id_fkey;
alter table transactions add constraint transactions_from_team_id_fkey
  foreign key (from_team_id) references teams(id) on delete set null;

alter table transactions drop constraint if exists transactions_to_team_id_fkey;
alter table transactions add constraint transactions_to_team_id_fkey
  foreign key (to_team_id) references teams(id) on delete set null;

alter table personal_transactions drop constraint if exists personal_transactions_from_team_id_fkey;
alter table personal_transactions add constraint personal_transactions_from_team_id_fkey
  foreign key (from_team_id) references teams(id) on delete set null;

alter table personal_transactions drop constraint if exists personal_transactions_to_team_id_fkey;
alter table personal_transactions add constraint personal_transactions_to_team_id_fkey
  foreign key (to_team_id) references teams(id) on delete set null;

alter table tasks drop constraint if exists tasks_team_id_fkey;
alter table tasks add constraint tasks_team_id_fkey
  foreign key (team_id) references teams(id) on delete set null;

alter table team_creation_requests drop constraint if exists team_creation_requests_resulting_team_id_fkey;
alter table team_creation_requests add constraint team_creation_requests_resulting_team_id_fkey
  foreign key (resulting_team_id) references teams(id) on delete set null;

-- security definer so the commander's own delete can go through despite
-- the "admins delete teams" policy on the table itself (007_scoped_roles.sql)
-- -- same shape as accept_team_join_request/accept_team_creation_request.
create or replace function public.disband_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team_commander(p_team_id) then
    raise exception 'only that team''s commander can disband it';
  end if;

  delete from teams where id = p_team_id;
end;
$$;

grant execute on function public.disband_team(uuid) to authenticated;
