-- Airsoft Economy: allow registering for a game without a team
-- Run after supabase/010_game_details.sql.
--
-- Previously game_participants.team_id was required, which meant only
-- people on a team roster could ever register. Now a profile can register
-- solo: team_id is nullable, and check_game_participant skips the
-- team-membership / team-side checks when there is no team, requiring an
-- explicit side_id instead (there's no team side to inherit).

alter table game_participants alter column team_id drop not null;

create or replace function public.check_game_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is not null then
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
  end if;

  if new.side_id is not null and not exists (
    select 1 from game_sides where id = new.side_id and game_id = new.game_id
  ) then
    raise exception 'side % does not belong to game %', new.side_id, new.game_id;
  end if;

  return new;
end;
$$;

-- A solo (teamless) participant needs to be able to read their own
-- registration row -- the existing policy only covered organizers, team
-- commanders/members and side commanders.
drop policy if exists "read game_participants" on game_participants;
create policy "read game_participants" on game_participants for select to authenticated using (
  is_game_organizer(game_id)
  or is_team_commander(team_id)
  or is_team_member(team_id)
  or commands_side_for_team_game(game_id, team_id)
  or profile_id = auth.uid()
);
