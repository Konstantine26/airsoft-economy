-- Airsoft Economy: paid revival (organizer toggle + per-side cost + revive RPC)
-- Run after supabase/035_game_creation_fields.sql.
--
-- Organizer turns on "paid revival" for a whole game (games.revival_enabled) and sets a
-- revival price per side (game_sides.revival_cost, null = not configured yet). When on,
-- a trader or that side's own commander scans/looks up a dead player and charges them
-- the price -- money moves from the player's personal balance straight into the
-- reviver's own balance, the exact same mechanism as trader_charge_participant
-- (017/026): the reviver is "selling" a revival service, not a sink, so this reuses the
-- single-profile source/destination shape and just adds a new personal_transactions
-- kind so wallet history reads distinctly from an ordinary trader purchase.

alter table games add column if not exists revival_enabled boolean not null default false;

alter table game_sides add column if not exists revival_cost numeric;
alter table game_sides drop constraint if exists game_sides_revival_cost_check;
alter table game_sides add constraint game_sides_revival_cost_check check (revival_cost is null or revival_cost >= 0);

alter table personal_transactions drop constraint if exists personal_transactions_kind_check;
alter table personal_transactions add constraint personal_transactions_kind_check check (
  kind in (
    'deposit', 'team_to_participant', 'participant_to_team',
    'participant_to_participant', 'task_reward', 'trader_charge', 'revival_charge'
  )
);

alter table personal_transactions drop constraint if exists valid_source;
alter table personal_transactions add constraint valid_source check (
  (kind = 'deposit' and from_profile_id is null and from_team_id is null)
  or (kind in ('participant_to_team', 'participant_to_participant') and from_profile_id is not null and from_team_id is null)
  or (kind = 'team_to_participant' and from_team_id is not null and from_profile_id is null)
  or (
    kind in ('task_reward', 'trader_charge', 'revival_charge')
    and (
      (from_profile_id is not null and from_team_id is null)
      or (from_team_id is not null and from_profile_id is null)
    )
  )
);

alter table personal_transactions drop constraint if exists valid_destination;
alter table personal_transactions add constraint valid_destination check (
  (kind = 'participant_to_team' and to_team_id is not null and to_profile_id is null)
  or (
    kind in ('deposit', 'team_to_participant', 'participant_to_participant', 'task_reward', 'trader_charge', 'revival_charge')
    and to_profile_id is not null and to_team_id is null
  )
);

-- ============================================================
-- Revive RPC
-- ============================================================

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
  if p_from_profile_id = auth.uid() then
    raise exception 'cannot revive yourself';
  end if;

  insert into project_profile_balances (project_id, profile_id) values (p_project_id, p_from_profile_id)
    on conflict (project_id, profile_id) do nothing;
  insert into project_profile_balances (project_id, profile_id) values (p_project_id, auth.uid())
    on conflict (project_id, profile_id) do nothing;

  select balance into v_balance from project_profile_balances
    where project_id = p_project_id and profile_id = p_from_profile_id for update;
  if v_balance < v_cost then
    raise exception 'insufficient balance';
  end if;
  perform 1 from project_profile_balances where project_id = p_project_id and profile_id = auth.uid() for update;

  update project_profile_balances set balance = balance - v_cost
    where project_id = p_project_id and profile_id = p_from_profile_id;
  update project_profile_balances set balance = balance + v_cost
    where project_id = p_project_id and profile_id = auth.uid();

  insert into personal_transactions (project_id, kind, from_profile_id, to_profile_id, amount, note)
  values (p_project_id, 'revival_charge', p_from_profile_id, auth.uid(), v_cost, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.revive_participant(uuid, uuid, uuid, text) to authenticated;
