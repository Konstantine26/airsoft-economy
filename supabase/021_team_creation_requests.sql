-- Airsoft Economy: player-initiated team creation requests
-- Run after supabase/020_single_team_join_request.sql.
--
-- A player without a team can also request to CREATE one (below the
-- join-a-team flow from 019/020), instead of only applying to join an
-- existing one. An admin reviews it: accepting creates the team and
-- makes the requester its commander in one transaction; rejecting just
-- marks the request. Like team join requests, only one pending request
-- -- of EITHER kind -- is allowed per player at a time, enforced on both
-- tables so a player can't have a pending join request and a pending
-- creation request at once.

create table if not exists team_creation_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  team_name text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  resulting_team_id uuid references teams(id),
  created_at timestamptz not null default now()
);

alter table team_creation_requests enable row level security;

-- Accepting creates the team, makes the requester its commander, and
-- settles the request in one transaction so the app never sees a
-- request marked accepted without a matching team (same reasoning as
-- accept_team_join_request in 019_team_join_requests.sql).
create or replace function public.accept_team_creation_request(p_request_id uuid)
returns team_creation_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request team_creation_requests;
  v_team teams;
begin
  select * into v_request from team_creation_requests where id = p_request_id;
  if v_request is null then
    raise exception 'creation request not found';
  end if;

  if not public.is_admin() then
    raise exception 'only an admin can accept team creation requests';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'creation request is no longer pending';
  end if;

  if exists (select 1 from team_members where profile_id = v_request.profile_id) then
    raise exception 'player is already on a team';
  end if;

  if exists (select 1 from teams where name = v_request.team_name) then
    raise exception 'a team named "%" already exists', v_request.team_name;
  end if;

  insert into teams (name, commander_id) values (v_request.team_name, v_request.profile_id)
  returning * into v_team;

  insert into team_members (team_id, profile_id) values (v_team.id, v_request.profile_id);

  update team_creation_requests set status = 'accepted', resulting_team_id = v_team.id where id = p_request_id;
  update team_join_requests set status = 'rejected'
    where profile_id = v_request.profile_id and status = 'pending';

  select * into v_request from team_creation_requests where id = p_request_id;
  return v_request;
end;
$$;

grant execute on function public.accept_team_creation_request(uuid) to authenticated;

-- read: the requester sees their own requests; admins see everything so
-- they can review them.
create policy "read team_creation_requests" on team_creation_requests for select to authenticated using (
  profile_id = auth.uid() or is_admin()
);

-- insert: a player requests their own team, only while not already
-- rostered and without another pending request of either kind.
create policy "self requests team creation" on team_creation_requests for insert to authenticated
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and not exists (select 1 from team_members where profile_id = auth.uid())
    and not exists (
      select 1 from team_join_requests where profile_id = auth.uid() and status = 'pending'
    )
    and not exists (
      select 1 from team_creation_requests where profile_id = auth.uid() and status = 'pending'
    )
  );

-- update: only an admin rejects directly; acceptance goes through
-- accept_team_creation_request() so teams/team_members stay in sync
-- (that function runs security definer and bypasses this policy).
create policy "admin rejects creation request" on team_creation_requests for update to authenticated
  using (is_admin() and status = 'pending')
  with check (is_admin() and status = 'rejected');

-- delete: the requester can withdraw their own pending request, or
-- clear a rejected one before resubmitting with a new name.
create policy "self withdraws creation request" on team_creation_requests for delete to authenticated
  using (profile_id = auth.uid() and status in ('pending', 'rejected'));

-- ============================================================
-- team_join_requests: extend the single-active-request rule (020) to
-- also block a new join request while a creation request is pending.
-- ============================================================

drop policy if exists "self requests to join team" on team_join_requests;
create policy "self requests to join team" on team_join_requests for insert to authenticated
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and not exists (select 1 from team_members where profile_id = auth.uid())
    and not exists (
      select 1 from team_join_requests where profile_id = auth.uid() and status = 'pending'
    )
    and not exists (
      select 1 from team_creation_requests where profile_id = auth.uid() and status = 'pending'
    )
  );
