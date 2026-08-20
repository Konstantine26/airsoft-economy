-- Airsoft Economy: archive a project and freeze its economy
-- Run after supabase/025_reject_game_participant.sql.
--
-- projects.archived_at is deliberately separate from is_closed
-- (018_closed_projects.sql): is_closed is about who can SEE the project,
-- archived_at is about whether it's still a live/active project. Read
-- access to everything (balances, transaction history) is unaffected --
-- archiving only blocks NEW economy activity, and balances are never
-- zeroed out by this migration or by archiving itself; they stay exactly
-- as they are, as a permanent historical snapshot.
--
-- Same admin-only write as the rest of `projects` (007_scoped_roles.sql's
-- "admins update projects") -- no new RLS policy needed, archived_at is
-- just another column on a row only admins can update.
--
-- Every money-moving RPC already guards on public.project_economy_enabled()
-- (008_project_scoped_economy.sql) right at the top; this adds a second,
-- identically-shaped guard next to it in each one, rather than new RLS on
-- transactions/personal_transactions.

alter table projects add column if not exists archived_at timestamptz;

create or replace function public.project_is_archived(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select archived_at is not null from projects where id = p_project_id), false);
$$;

grant execute on function public.project_is_archived(uuid) to authenticated;

-- ============================================================
-- Re-guard every money-moving RPC. Bodies are unchanged except for the
-- new "project is archived" check placed right after the existing
-- "economy is not enabled" check.
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
begin
  if not public.project_economy_enabled(p_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;
  if public.project_is_archived(p_project_id) then
    raise exception 'this project is archived';
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

  perform 1 from project_team_balances where project_id = p_project_id and team_id = p_from_team_id for update;
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

create or replace function public.deposit_to_team(
  p_project_id uuid,
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
begin
  if not public.is_admin() then
    raise exception 'only admins can deposit funds';
  end if;
  if not public.project_economy_enabled(p_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;
  if public.project_is_archived(p_project_id) then
    raise exception 'this project is archived';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into project_team_balances (project_id, team_id) values (p_project_id, p_to_team_id)
    on conflict (project_id, team_id) do nothing;

  perform 1 from project_team_balances where project_id = p_project_id and team_id = p_to_team_id for update;

  update project_team_balances set balance = balance + p_amount
    where project_id = p_project_id and team_id = p_to_team_id;

  insert into transactions (project_id, to_team_id, amount, note)
  values (p_project_id, p_to_team_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.deposit_to_participant(
  p_project_id uuid,
  p_to_profile_id uuid,
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
begin
  if not public.is_admin() then
    raise exception 'only admins can deposit funds';
  end if;
  if not public.project_economy_enabled(p_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;
  if public.project_is_archived(p_project_id) then
    raise exception 'this project is archived';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into project_profile_balances (project_id, profile_id) values (p_project_id, p_to_profile_id)
    on conflict (project_id, profile_id) do nothing;

  perform 1 from project_profile_balances where project_id = p_project_id and profile_id = p_to_profile_id for update;

  update project_profile_balances set balance = balance + p_amount
    where project_id = p_project_id and profile_id = p_to_profile_id;

  insert into personal_transactions (project_id, kind, to_profile_id, amount, note)
  values (p_project_id, 'deposit', p_to_profile_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.distribute_to_participant(
  p_project_id uuid,
  p_from_team_id uuid,
  p_to_profile_id uuid,
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
begin
  if not public.is_team_commander(p_from_team_id) then
    raise exception 'only that team''s commander can distribute its funds';
  end if;
  if not public.project_economy_enabled(p_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;
  if public.project_is_archived(p_project_id) then
    raise exception 'this project is archived';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into project_team_balances (project_id, team_id) values (p_project_id, p_from_team_id)
    on conflict (project_id, team_id) do nothing;
  insert into project_profile_balances (project_id, profile_id) values (p_project_id, p_to_profile_id)
    on conflict (project_id, profile_id) do nothing;

  select balance into v_balance from project_team_balances
    where project_id = p_project_id and team_id = p_from_team_id for update;
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;
  perform 1 from project_profile_balances where project_id = p_project_id and profile_id = p_to_profile_id for update;

  update project_team_balances set balance = balance - p_amount
    where project_id = p_project_id and team_id = p_from_team_id;
  update project_profile_balances set balance = balance + p_amount
    where project_id = p_project_id and profile_id = p_to_profile_id;

  insert into personal_transactions (project_id, kind, from_team_id, to_profile_id, amount, note)
  values (p_project_id, 'team_to_participant', p_from_team_id, p_to_profile_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.transfer_to_team(
  p_project_id uuid,
  p_to_team_id uuid,
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
begin
  if not public.is_team_member(p_to_team_id) then
    raise exception 'you can only fund your own team';
  end if;
  if not public.project_economy_enabled(p_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;
  if public.project_is_archived(p_project_id) then
    raise exception 'this project is archived';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into project_profile_balances (project_id, profile_id) values (p_project_id, auth.uid())
    on conflict (project_id, profile_id) do nothing;
  insert into project_team_balances (project_id, team_id) values (p_project_id, p_to_team_id)
    on conflict (project_id, team_id) do nothing;

  select balance into v_balance from project_profile_balances
    where project_id = p_project_id and profile_id = auth.uid() for update;
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;
  perform 1 from project_team_balances where project_id = p_project_id and team_id = p_to_team_id for update;

  update project_profile_balances set balance = balance - p_amount
    where project_id = p_project_id and profile_id = auth.uid();
  update project_team_balances set balance = balance + p_amount
    where project_id = p_project_id and team_id = p_to_team_id;

  insert into personal_transactions (project_id, kind, from_profile_id, to_team_id, amount, note)
  values (p_project_id, 'participant_to_team', auth.uid(), p_to_team_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.transfer_to_participant(
  p_project_id uuid,
  p_to_profile_id uuid,
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
begin
  if p_to_profile_id = auth.uid() then
    raise exception 'cannot send money to yourself';
  end if;
  if not public.project_economy_enabled(p_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;
  if public.project_is_archived(p_project_id) then
    raise exception 'this project is archived';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into project_profile_balances (project_id, profile_id) values (p_project_id, auth.uid())
    on conflict (project_id, profile_id) do nothing;
  insert into project_profile_balances (project_id, profile_id) values (p_project_id, p_to_profile_id)
    on conflict (project_id, profile_id) do nothing;

  select balance into v_balance from project_profile_balances
    where project_id = p_project_id and profile_id = auth.uid() for update;
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;
  perform 1 from project_profile_balances where project_id = p_project_id and profile_id = p_to_profile_id for update;

  update project_profile_balances set balance = balance - p_amount
    where project_id = p_project_id and profile_id = auth.uid();
  update project_profile_balances set balance = balance + p_amount
    where project_id = p_project_id and profile_id = p_to_profile_id;

  insert into personal_transactions (project_id, kind, from_profile_id, to_profile_id, amount, note)
  values (p_project_id, 'participant_to_participant', auth.uid(), p_to_profile_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

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
  if public.project_is_archived(p_project_id) then
    raise exception 'this project is archived';
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
  if public.project_is_archived(p_project_id) then
    raise exception 'this project is archived';
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

create or replace function public.complete_task(p_task_id uuid, p_recipient_profile_id uuid default null)
returns tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks;
  v_project_id uuid;
  v_recipient uuid;
  v_recipient_side uuid;
  v_recipient_team uuid;
  v_balance numeric;
begin
  select * into v_task from tasks where id = p_task_id for update;
  if v_task.id is null then
    raise exception 'task not found';
  end if;
  if v_task.status = 'completed' then
    raise exception 'task already completed';
  end if;
  if v_task.status = 'cancelled' then
    raise exception 'task was cancelled';
  end if;
  if v_task.customer_profile_id <> auth.uid() and not public.is_admin() then
    raise exception 'only the customer can confirm this task';
  end if;

  select project_id into v_project_id from games where id = v_task.game_id;

  if v_task.assignee_profile_id is not null then
    if p_recipient_profile_id is not null and p_recipient_profile_id <> v_task.assignee_profile_id then
      raise exception 'this task is already assigned to a different participant';
    end if;
    v_recipient := v_task.assignee_profile_id;
  else
    if p_recipient_profile_id is null then
      raise exception 'a recipient must be selected for this task';
    end if;

    select public.participant_effective_side(v_task.game_id, gp.team_id, gp.side_id), gp.team_id
      into v_recipient_side, v_recipient_team
      from game_participants gp
      where gp.game_id = v_task.game_id and gp.profile_id = p_recipient_profile_id
      limit 1;

    if v_recipient_side is null or v_recipient_side <> v_task.side_id then
      raise exception 'chosen recipient is not part of this task''s side';
    end if;
    if v_task.visibility = 'team' and v_recipient_team is distinct from v_task.team_id then
      raise exception 'chosen recipient is not on this task''s team';
    end if;

    v_recipient := p_recipient_profile_id;
  end if;

  if v_task.reward is not null and v_task.reward > 0 then
    if not public.project_economy_enabled(v_project_id) then
      raise exception 'economy is not enabled for this project';
    end if;
    if public.project_is_archived(v_project_id) then
      raise exception 'this project is archived';
    end if;

    insert into project_profile_balances (project_id, profile_id) values (v_project_id, v_task.customer_profile_id)
      on conflict (project_id, profile_id) do nothing;
    insert into project_profile_balances (project_id, profile_id) values (v_project_id, v_recipient)
      on conflict (project_id, profile_id) do nothing;

    select balance into v_balance from project_profile_balances
      where project_id = v_project_id and profile_id = v_task.customer_profile_id for update;
    if v_balance < v_task.reward then
      raise exception 'insufficient balance';
    end if;
    perform 1 from project_profile_balances where project_id = v_project_id and profile_id = v_recipient for update;

    update project_profile_balances set balance = balance - v_task.reward
      where project_id = v_project_id and profile_id = v_task.customer_profile_id;
    update project_profile_balances set balance = balance + v_task.reward
      where project_id = v_project_id and profile_id = v_recipient;

    insert into personal_transactions (project_id, kind, from_profile_id, to_profile_id, amount, note, task_id)
    values (v_project_id, 'task_reward', v_task.customer_profile_id, v_recipient, v_task.reward, v_task.title, v_task.id);
  end if;

  update tasks
  set status = 'completed', assignee_profile_id = v_recipient, completed_at = now(), completed_by = auth.uid()
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;
