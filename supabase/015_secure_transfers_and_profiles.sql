-- Airsoft Economy: close two access-control gaps found in a security review.
-- Run after supabase/014_optional_task_reward.sql.
--
-- 1) transfer_funds had no authorization check at all (every other
--    money-moving RPC checks is_admin/is_team_commander/is_team_member) and
--    never verified the source team had enough balance, so any signed-in
--    participant could drain any team into any other team, including into
--    a negative balance.
-- 2) profiles was readable in full (name, avatar photo, participant number)
--    by every signed-in user regardless of which project they're in, and
--    signup is open/self-service -- so anyone could register an account and
--    harvest every player's name+photo. Several screens legitimately need
--    to browse *all* users by name to invite them onto a team/side/game
--    they don't share yet (TeamCommanderScreen, GameManageScreen,
--    TasksSection), so instead of scoping profiles reads down to
--    "same project only" (which would break that discovery flow), we keep
--    a name-only public directory view for discovery and scope the full
--    profile row (avatar, participant number, role) to admins, the owner,
--    and people who actually share a project with that profile.

-- ============================================================
-- transfer_funds: require the caller to be an admin or an organizer of
-- the project, and require the source team to actually have the funds.
-- ============================================================

create or replace function public.transfer_funds(
  p_project_id uuid,
  p_from_team_id uuid,
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
  v_balance numeric;
begin
  if not (public.is_admin() or public.is_project_organizer(p_project_id)) then
    raise exception 'only an admin or project organizer can transfer funds between teams';
  end if;
  if not public.project_economy_enabled(p_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_from_team_id = p_to_team_id then
    raise exception 'from_team_id and to_team_id must differ';
  end if;

  insert into project_team_balances (project_id, team_id) values (p_project_id, p_from_team_id)
    on conflict (project_id, team_id) do nothing;
  insert into project_team_balances (project_id, team_id) values (p_project_id, p_to_team_id)
    on conflict (project_id, team_id) do nothing;

  select balance into v_balance from project_team_balances
    where project_id = p_project_id and team_id = p_from_team_id for update;
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;
  perform 1 from project_team_balances where project_id = p_project_id and team_id = p_to_team_id for update;

  update project_team_balances set balance = balance - p_amount
    where project_id = p_project_id and team_id = p_from_team_id;
  update project_team_balances set balance = balance + p_amount
    where project_id = p_project_id and team_id = p_to_team_id;

  insert into transactions (project_id, from_team_id, to_team_id, amount, note)
  values (p_project_id, p_from_team_id, p_to_team_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================
-- profiles: figure out which projects a profile actually touches (as
-- organizer, game organizer, team member, participant, team commander,
-- side commander, or trader), then only expose the full row to admins,
-- the profile's own owner, or someone who shares a project with them.
-- ============================================================

create or replace function public.profile_project_ids(p_profile_id uuid)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select project_id from project_organizers where profile_id = p_profile_id
  union
  select g.project_id from game_organizers go join games g on g.id = go.game_id where go.profile_id = p_profile_id
  union
  select g.project_id
  from team_members tm
  join game_team_sides gts on gts.team_id = tm.team_id
  join games g on g.id = gts.game_id
  where tm.profile_id = p_profile_id
  union
  select g.project_id
  from game_participants gp
  join games g on g.id = gp.game_id
  where gp.profile_id = p_profile_id
  union
  select g.project_id
  from teams t
  join game_team_sides gts on gts.team_id = t.id
  join games g on g.id = gts.game_id
  where t.commander_id = p_profile_id
  union
  select g.project_id
  from game_sides gs
  join games g on g.id = gs.game_id
  where gs.commander_id = p_profile_id
  union
  select g.project_id
  from game_traders gtd
  join games g on g.id = gtd.game_id
  where gtd.profile_id = p_profile_id;
$$;

grant execute on function public.profile_project_ids(uuid) to authenticated;

create or replace function public.profile_visible_to_caller(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    p_profile_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.profile_project_ids(auth.uid()) as mine(project_id)
      where mine.project_id in (select project_id from public.profile_project_ids(p_profile_id))
    );
$$;

grant execute on function public.profile_visible_to_caller(uuid) to authenticated;

drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select to authenticated
  using (public.profile_visible_to_caller(id));

-- Name-only directory so "add anyone to my team/side" pickers keep working
-- for people who don't share a project with the caller yet. Created without
-- security_invoker, so it reads through the view owner's access (bypassing
-- the tightened RLS above) while only ever exposing id + full_name -- no
-- avatar photo, participant number, or role.
create or replace view public.profile_directory as
  select id, full_name from public.profiles;

grant select on public.profile_directory to authenticated;
