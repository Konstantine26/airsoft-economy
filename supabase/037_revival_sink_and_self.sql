-- Airsoft Economy: revival money is destroyed, not paid to the reviver; self-revival allowed
-- Run after supabase/036_paid_revival.sql.
--
-- Two behavioral corrections to revive_participant() from 036, per direct user feedback:
--
-- 1. The charged amount now leaves the economy entirely instead of landing on the
--    trader's/commander's own balance. Reviving someone isn't a sale the reviver
--    profits from -- it's the dead player paying a game-mechanic cost. Modeled the
--    same way 'deposit' models money entering the economy from nowhere (both
--    from_profile_id and from_team_id null): revival_charge now allows to_profile_id
--    and to_team_id both null, and the RPC no longer touches the reviver's balance at
--    all (no insert/lock/credit on project_profile_balances for auth.uid()).
--
-- 2. Removed the "cannot revive yourself" guard. A side commander or trader is also a
--    combat participant and can die like anyone else -- self-revival should be allowed
--    on the same terms as reviving someone else: gated purely by having enough balance
--    to cover the side's revival cost, nothing more.

alter table personal_transactions drop constraint if exists valid_destination;
alter table personal_transactions add constraint valid_destination check (
  (kind = 'participant_to_team' and to_team_id is not null and to_profile_id is null)
  or (
    kind in ('deposit', 'team_to_participant', 'participant_to_participant', 'task_reward', 'trader_charge')
    and to_profile_id is not null and to_team_id is null
  )
  or (kind = 'revival_charge' and to_profile_id is null and to_team_id is null)
);

create or replace function public.revive_participant(
  p_project_id uuid,
  p_game_id uuid,
  p_from_profile_id uuid,
  p_note text default null
)
returns personal_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row personal_transactions;
  v_balance numeric;
  v_side uuid;
  v_cost numeric;
  v_enabled boolean;
begin
  select revival_enabled into v_enabled from games where id = p_game_id;
  if not coalesce(v_enabled, false) then
    raise exception 'paid revival is not enabled for this game';
  end if;

  select public.participant_effective_side(p_game_id, gp.team_id, gp.side_id) into v_side
    from game_participants gp
    where gp.game_id = p_game_id and gp.profile_id = p_from_profile_id
    limit 1;
  if v_side is null or not (
    public.is_game_trader_for_side(p_game_id, v_side) or public.is_side_commander(v_side)
  ) then
    raise exception 'only a trader or commander of this participant''s side can revive them';
  end if;

  select revival_cost into v_cost from game_sides where id = v_side;
  if v_cost is null or v_cost <= 0 then
    raise exception 'revival cost is not configured for this side';
  end if;

  if not public.project_economy_enabled(p_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;
  if public.project_is_archived(p_project_id) then
    raise exception 'this project is archived';
  end if;

  insert into project_profile_balances (project_id, profile_id) values (p_project_id, p_from_profile_id)
    on conflict (project_id, profile_id) do nothing;

  select balance into v_balance from project_profile_balances
    where project_id = p_project_id and profile_id = p_from_profile_id for update;
  if v_balance < v_cost then
    raise exception 'insufficient balance';
  end if;

  update project_profile_balances set balance = balance - v_cost
    where project_id = p_project_id and profile_id = p_from_profile_id;

  insert into personal_transactions (project_id, kind, from_profile_id, to_profile_id, amount, note)
  values (p_project_id, 'revival_charge', p_from_profile_id, null, v_cost, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.revive_participant(uuid, uuid, uuid, text) to authenticated;
