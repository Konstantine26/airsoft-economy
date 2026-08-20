-- Airsoft Economy: keep team_members in sync when an admin sets a
-- commander directly (AdminTeamsTab.tsx setCommander()).
-- Run after supabase/032_notifications.sql.
--
-- Every player-facing screen (WalletScreen/SendMoneyModal, PlayerTeamScreen)
-- decides "am I on a team" purely from useCapabilities().ownMembership,
-- which comes from team_members -- NOT from teams.commander_id. The
-- self-service flow (accept_team_creation_request, 021) already inserts
-- both the team and its team_members row together. But AdminTeamsTab's
-- commander chip picker only ever does `update teams set commander_id =
-- ...`, so a commander appointed that way ends up commander_id on their
-- team while the app still treats them as teamless everywhere else --
-- "Вы не в команде" in the send-money sheet, "Вы пока не состоите ни в
-- одной команде" on Моя команда, etc.
--
-- Fix: a trigger that adds the new commander to team_members whenever
-- commander_id is set, same as the self-service path already does. Skips
-- silently if that profile already has a team_members row anywhere --
-- profile_id is globally unique on that table (002_roles_and_games.sql),
-- so we never fight that constraint; an admin reassigning a commander who
-- is already rostered elsewhere still needs to move them by hand.
-- Also backfills every team that's already in this broken state today.

create or replace function public.sync_team_commander_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.commander_id is not null
     and (tg_op = 'INSERT' or new.commander_id is distinct from old.commander_id)
     and not exists (select 1 from team_members where profile_id = new.commander_id)
  then
    insert into team_members (team_id, profile_id) values (new.id, new.commander_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_team_commander_membership on teams;
create trigger trg_sync_team_commander_membership
  after insert or update of commander_id on teams
  for each row execute function public.sync_team_commander_membership();

-- Backfill: any existing team whose commander isn't rostered yet.
insert into team_members (team_id, profile_id)
select t.id, t.commander_id
from teams t
where t.commander_id is not null
  and not exists (select 1 from team_members tm where tm.profile_id = t.commander_id);
