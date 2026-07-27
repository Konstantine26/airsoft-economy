-- Airsoft Economy: let teammates on the same side see each other
-- Run after supabase/011_open_registration.sql.
--
-- The briefing screen shows the roster of the side a participant is
-- playing for, which can span several teams. The existing
-- game_participants read policy only let you see your own team's rows
-- (plus organizers/commanders); this adds visibility across teams that
-- share the same effective side.

create or replace function public.participant_effective_side(p_game_id uuid, p_team_id uuid, p_side_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    p_side_id,
    (select gts.side_id from game_team_sides gts where gts.game_id = p_game_id and gts.team_id = p_team_id)
  );
$$;

create or replace function public.my_effective_side(p_game_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select public.participant_effective_side(p_game_id, gp.team_id, gp.side_id)
  from game_participants gp
  where gp.game_id = p_game_id and gp.profile_id = auth.uid()
  limit 1;
$$;

grant execute on function public.participant_effective_side(uuid, uuid, uuid) to authenticated;
grant execute on function public.my_effective_side(uuid) to authenticated;

drop policy if exists "read game_participants" on game_participants;
create policy "read game_participants" on game_participants for select to authenticated using (
  is_game_organizer(game_id)
  or is_team_commander(team_id)
  or is_team_member(team_id)
  or commands_side_for_team_game(game_id, team_id)
  or profile_id = auth.uid()
  or (
    public.participant_effective_side(game_id, team_id, side_id) is not null
    and public.participant_effective_side(game_id, team_id, side_id) = public.my_effective_side(game_id)
  )
);
