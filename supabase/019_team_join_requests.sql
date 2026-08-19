-- Airsoft Economy: player-initiated team join requests
-- Run after supabase/018_closed_projects.sql.
--
-- A player without a team can search all teams and submit a join
-- request; the team's commander reviews it (Принять/Отклонить) instead
-- of only being able to add members manually. team_members.profile_id
-- is already unique (002_roles_and_games.sql), so a player can only be
-- rostered on one team at a time -- accept_team_join_request() enforces
-- that server-side and auto-rejects the player's other pending requests
-- once one is accepted.

create table if not exists team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (team_id, profile_id)
);

alter table team_join_requests enable row level security;

-- Accepting a request adds the profile to team_members and settles the
-- request's status in one transaction, so the app never observes a
-- request marked accepted without the matching roster row (or vice
-- versa). security definer so it can write team_members on the
-- commander's behalf the same way the commander's own inserts already
-- can (see "commander writes team_members" in 002_roles_and_games.sql).
create or replace function public.accept_team_join_request(p_request_id uuid)
returns team_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request team_join_requests;
begin
  select * into v_request from team_join_requests where id = p_request_id;
  if v_request is null then
    raise exception 'join request not found';
  end if;

  if not public.is_team_commander(v_request.team_id) then
    raise exception 'only the team commander can accept join requests';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'join request is no longer pending';
  end if;

  if exists (select 1 from team_members where profile_id = v_request.profile_id) then
    raise exception 'player is already on a team';
  end if;

  insert into team_members (team_id, profile_id) values (v_request.team_id, v_request.profile_id);

  update team_join_requests set status = 'accepted' where id = p_request_id;
  update team_join_requests set status = 'rejected'
    where profile_id = v_request.profile_id and id <> p_request_id and status = 'pending';

  select * into v_request from team_join_requests where id = p_request_id;
  return v_request;
end;
$$;

grant execute on function public.accept_team_join_request(uuid) to authenticated;

-- read: the requesting player sees their own requests (any status, so
-- they can see it was rejected); the team's commander (or admin) sees
-- every request for their own team.
create policy "read team_join_requests" on team_join_requests for select to authenticated using (
  profile_id = auth.uid() or is_team_commander(team_id)
);

-- insert: a player requests to join a team for themselves, only while
-- not already rostered anywhere.
create policy "self requests to join team" on team_join_requests for insert to authenticated
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and not exists (select 1 from team_members where profile_id = auth.uid())
  );

-- update: the commander rejects directly through this policy; acceptance
-- goes through accept_team_join_request() above so team_members stays
-- in sync (that function runs as security definer and bypasses this
-- policy for its own writes).
create policy "commander rejects join request" on team_join_requests for update to authenticated
  using (is_team_commander(team_id) and status = 'pending')
  with check (is_team_commander(team_id) and status = 'rejected');

-- delete: the requester can withdraw their own pending request, or clear
-- a rejected one to free up (team_id, profile_id) for reapplying.
-- Accepted requests are left in place as history.
create policy "self withdraws join request" on team_join_requests for delete to authenticated
  using (profile_id = auth.uid() and status in ('pending', 'rejected'));
