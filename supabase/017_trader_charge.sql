-- Airsoft Economy: traders can charge a participant or a team directly
-- Run after supabase/016_fix_task_returning_rls.sql.
--
-- A trader "sells" something in-game and gets paid for it: money moves
-- from the buyer's balance (a participant or their whole team) straight
-- into the trader's own project_profile_balances row -- the trader is
-- just another profile, so this is a transfer like any other, not money
-- leaving the economy. Authorization: the buyer's side (resolved
-- server-side, never trusted from the client) must be one the calling
-- trader is registered for via is_game_trader_for_side().
--
-- Side-effect fix while touching these constraints: valid_source/
-- valid_destination (from 005_personal_wallets.sql) were never updated
-- when 'task_reward' was added to the kind enum in 013_tasks.sql -- every
-- complete_task() call with a positive reward has been violating one of
-- these CHECK constraints on the personal_transactions insert ever since.
-- Fixed here alongside the new 'trader_charge' kind.

alter table personal_transactions drop constraint if exists personal_transactions_kind_check;
alter table personal_transactions add constraint personal_transactions_kind_check check (
  kind in (
    'deposit', 'team_to_participant', 'participant_to_team',
    'participant_to_participant', 'task_reward', 'trader_charge'
  )
);

alter table personal_transactions drop constraint if exists valid_source;
alter table personal_transactions add constraint valid_source check (
  (kind = 'deposit' and from_profile_id is null and from_team_id is null)
  or (kind in ('participant_to_team', 'participant_to_participant') and from_profile_id is not null and from_team_id is null)
  or (kind = 'team_to_participant' and from_team_id is not null and from_profile_id is null)
  or (
    kind in ('task_reward', 'trader_charge')
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
    kind in ('deposit', 'team_to_participant', 'participant_to_participant', 'task_reward', 'trader_charge')
    and to_profile_id is not null and to_team_id is null
  )
);

-- ============================================================
-- Charge RPCs
-- ============================================================

create or replace function public.trader_charge_participant(
  p_project_id uuid,
  p_game_id uuid,
  p_from_profile_id uuid,
  p_amount numeric,
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
begin
  select public.participant_effective_side(p_game_id, gp.team_id, gp.side_id) into v_side
    from game_participants gp
    where gp.game_id = p_game_id and gp.profile_id = p_from_profile_id
    limit 1;
  if v_side is null or not public.is_game_trader_for_side(p_game_id, v_side) then
    raise exception 'only a trader for this participant''s side can charge them';
  end if;
  if not public.project_economy_enabled(p_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_from_profile_id = auth.uid() then
    raise exception 'cannot charge yourself';
  end if;

  insert into project_profile_balances (project_id, profile_id) values (p_project_id, p_from_profile_id)
    on conflict (project_id, profile_id) do nothing;
  insert into project_profile_balances (project_id, profile_id) values (p_project_id, auth.uid())
    on conflict (project_id, profile_id) do nothing;

  select balance into v_balance from project_profile_balances
    where project_id = p_project_id and profile_id = p_from_profile_id for update;
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;
  perform 1 from project_profile_balances where project_id = p_project_id and profile_id = auth.uid() for update;

  update project_profile_balances set balance = balance - p_amount
    where project_id = p_project_id and profile_id = p_from_profile_id;
  update project_profile_balances set balance = balance + p_amount
    where project_id = p_project_id and profile_id = auth.uid();

  insert into personal_transactions (project_id, kind, from_profile_id, to_profile_id, amount, note)
  values (p_project_id, 'trader_charge', p_from_profile_id, auth.uid(), p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.trader_charge_team(
  p_project_id uuid,
  p_game_id uuid,
  p_from_team_id uuid,
  p_amount numeric,
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
begin
  select side_id into v_side from game_team_sides
    where game_id = p_game_id and team_id = p_from_team_id;
  if v_side is null or not public.is_game_trader_for_side(p_game_id, v_side) then
    raise exception 'only a trader for this team''s side can charge them';
  end if;
  if not public.project_economy_enabled(p_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into project_team_balances (project_id, team_id) values (p_project_id, p_from_team_id)
    on conflict (project_id, team_id) do nothing;
  insert into project_profile_balances (project_id, profile_id) values (p_project_id, auth.uid())
    on conflict (project_id, profile_id) do nothing;

  select balance into v_balance from project_team_balances
    where project_id = p_project_id and team_id = p_from_team_id for update;
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;
  perform 1 from project_profile_balances where project_id = p_project_id and profile_id = auth.uid() for update;

  update project_team_balances set balance = balance - p_amount
    where project_id = p_project_id and team_id = p_from_team_id;
  update project_profile_balances set balance = balance + p_amount
    where project_id = p_project_id and profile_id = auth.uid();

  insert into personal_transactions (project_id, kind, from_team_id, to_profile_id, amount, note)
  values (p_project_id, 'trader_charge', p_from_team_id, auth.uid(), p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.trader_charge_participant(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.trader_charge_team(uuid, uuid, uuid, numeric, text) to authenticated;
