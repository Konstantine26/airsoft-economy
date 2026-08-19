-- Airsoft Economy: delete team creation requests once accepted
-- Run after supabase/022_disband_team.sql.
--
-- accept_team_creation_request() used to leave the request row behind
-- with status = 'accepted'. That caused two problems once the resulting
-- team was later disbanded (022_disband_team.sql sets
-- resulting_team_id to null but doesn't touch the request row):
--   1. The player's "Мои заявки" list in PlayerTeamScreen only branches
--      on status === 'pending' vs anything else, so a leftover
--      'accepted' row rendered as "Отклонено" (rejected) -- wrong.
--   2. Its "Отменить" button called delete(), but the RLS delete policy
--      only allows removing 'pending'/'rejected' rows -- an 'accepted'
--      row silently deleted zero rows, so the button appeared broken.
--
-- Fix: once a request is accepted, the team it produced *is* the
-- record of it -- delete the request row instead of keeping it around
-- as history.

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

  update team_join_requests set status = 'rejected'
    where profile_id = v_request.profile_id and status = 'pending';

  v_request.status := 'accepted';
  v_request.resulting_team_id := v_team.id;
  delete from team_creation_requests where id = p_request_id;

  return v_request;
end;
$$;

-- Widen self-delete to any status (was 'pending'/'rejected' only). Going
-- forward an 'accepted' row never outlives the transaction above, but
-- this also lets a player clear out a stray already-accepted row left
-- over from before this migration (e.g. one whose team was since
-- disbanded) via the same "Отменить" button instead of needing SQL
-- access.
drop policy if exists "self withdraws creation request" on team_creation_requests;
create policy "self withdraws creation request" on team_creation_requests for delete to authenticated
  using (profile_id = auth.uid());
