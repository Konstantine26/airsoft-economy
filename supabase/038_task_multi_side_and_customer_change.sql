-- Airsoft Economy: multi-side tasks + reassignable customer
-- Run after supabase/037_revival_sink_and_self.sql.
--
-- Two independent additions to the task system from 013_tasks.sql:
--
-- 1. A new "sides" visibility -- a task posted to two or more sides at
--    once. Completion still pays exactly one chosen recipient, same as
--    the existing "side" visibility already does; only the pool of
--    eligible recipients (and viewers) widens from one side to several.
--    The sides a task belongs to live in the new task_sides join table;
--    tasks.side_id stays the single source of truth for the other four
--    visibilities and is simply NULL for "sides" tasks.
--
--    Creating a "sides" task is restricted to game organizers. A plain
--    participant only has authority over their own side, and a trader is
--    scoped to specific sides rather than the game as a whole, so neither
--    is a natural fit for a task spanning multiple sides -- only an
--    organizer's authority already covers all of them.
--
-- 2. change_task_customer() -- lets the current customer or the game's
--    organizer reassign who is footing the bill, mirroring cancel_task()'s
--    permission check. Blocked once a task is completed, since the reward
--    ledger already recorded the payer at that point.

-- ============================================================
-- task_sides
-- ============================================================

create table if not exists task_sides (
  task_id uuid not null references tasks(id) on delete cascade,
  side_id uuid not null references game_sides(id) on delete cascade,
  primary key (task_id, side_id)
);

alter table tasks alter column side_id drop not null;

alter table tasks drop constraint if exists tasks_visibility_check;
alter table tasks add constraint tasks_visibility_check
  check (visibility in ('side', 'team', 'personal', 'claimable', 'sides'));

alter table task_sides enable row level security;

create policy "read task_sides" on task_sides for select to authenticated using (
  public.can_view_task(task_id)
);

create policy "task authors write task_sides" on task_sides for insert to authenticated with check (
  exists (
    select 1 from tasks t where t.id = task_id
    and t.customer_profile_id = auth.uid()
    and t.visibility = 'sides'
    and (public.is_game_organizer(t.game_id) or public.is_game_trader_for_side(t.game_id, side_id))
  )
);

-- ============================================================
-- check_task(): admit visibility = 'sides' (side_id null, sides tracked
-- in task_sides) alongside the four existing side_id-based visibilities.
-- ============================================================

create or replace function public.check_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_side uuid;
  v_assignee_side uuid;
  v_assignee_team uuid;
begin
  if new.visibility = 'sides' then
    if new.side_id is not null then
      raise exception 'side_id must be null when visibility is sides -- use task_sides instead';
    end if;
  else
    if new.side_id is null or not exists (select 1 from game_sides where id = new.side_id and game_id = new.game_id) then
      raise exception 'side % does not belong to game %', new.side_id, new.game_id;
    end if;
  end if;

  if new.visibility = 'team' then
    if new.team_id is null then
      raise exception 'team_id is required for team-visibility tasks';
    end if;
    select side_id into v_team_side from game_team_sides
      where game_id = new.game_id and team_id = new.team_id;
    if v_team_side is null or v_team_side <> new.side_id then
      raise exception 'team % is not part of side % in game %', new.team_id, new.side_id, new.game_id;
    end if;
  elsif new.team_id is not null then
    raise exception 'team_id must be null unless visibility is team';
  end if;

  if new.visibility = 'personal' then
    if new.assignee_profile_id is null then
      raise exception 'assignee_profile_id is required for personal tasks';
    end if;
  else
    if tg_op = 'INSERT' and new.assignee_profile_id is not null then
      raise exception 'assignee_profile_id must be set later, not at creation, for this visibility';
    end if;
  end if;

  if new.assignee_profile_id is not null then
    select public.participant_effective_side(new.game_id, gp.team_id, gp.side_id), gp.team_id
      into v_assignee_side, v_assignee_team
      from game_participants gp
      where gp.game_id = new.game_id and gp.profile_id = new.assignee_profile_id
      limit 1;

    if new.visibility = 'sides' then
      if v_assignee_side is null or not exists (
        select 1 from task_sides ts where ts.task_id = new.id and ts.side_id = v_assignee_side
      ) then
        raise exception 'assignee % is not part of any side assigned to this task', new.assignee_profile_id;
      end if;
    else
      if v_assignee_side is null or v_assignee_side <> new.side_id then
        raise exception 'assignee % is not part of side % in game %', new.assignee_profile_id, new.side_id, new.game_id;
      end if;
      if new.visibility = 'team' and v_assignee_team is distinct from new.team_id then
        raise exception 'assignee % is not on team % in game %', new.assignee_profile_id, new.team_id, new.game_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================
-- can_view_task(): add the sides-visibility branch.
-- ============================================================

create or replace function public.can_view_task(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from tasks t
    where t.id = p_task_id
    and (
      public.is_game_organizer(t.game_id)
      or t.customer_profile_id = auth.uid()
      or t.created_by = auth.uid()
      or t.assignee_profile_id = auth.uid()
      or (t.visibility not in ('personal', 'sides') and public.is_game_trader_for_side(t.game_id, t.side_id))
      or (t.visibility in ('side', 'claimable') and t.side_id = public.my_effective_side(t.game_id))
      or (
        t.visibility = 'team'
        and t.side_id = public.my_effective_side(t.game_id)
        and t.team_id = (
          select gp.team_id from game_participants gp
          where gp.game_id = t.game_id and gp.profile_id = auth.uid()
          limit 1
        )
      )
      or (
        t.visibility = 'sides'
        and exists (
          select 1 from task_sides ts
          where ts.task_id = t.id
          and (
            ts.side_id = public.my_effective_side(t.game_id)
            or public.is_game_trader_for_side(t.game_id, ts.side_id)
          )
        )
      )
    )
  );
$$;

-- ============================================================
-- tasks insert policy: sides-visibility restricted to organizers.
-- ============================================================

drop policy if exists "participants create tasks" on tasks;
create policy "participants create tasks" on tasks for insert to authenticated with check (
  customer_profile_id = auth.uid()
  and created_by = auth.uid()
  and (
    is_game_organizer(game_id)
    or (
      visibility <> 'sides'
      and (
        is_game_trader_for_side(game_id, side_id)
        or (
          side_id = public.my_effective_side(game_id)
          and (
            visibility <> 'team'
            or team_id = (
              select gp.team_id from game_participants gp
              where gp.game_id = tasks.game_id and gp.profile_id = auth.uid()
              limit 1
            )
          )
        )
      )
    )
  )
);

-- ============================================================
-- complete_task(): recipient must belong to one of the task's sides when
-- visibility = 'sides', instead of matching a single side_id. The money
-- movement itself (already common to every visibility) is untouched.
-- ============================================================

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
  if not public.project_economy_enabled(v_project_id) then
    raise exception 'economy is not enabled for this project';
  end if;

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

    if v_task.visibility = 'sides' then
      if v_recipient_side is null or not exists (
        select 1 from task_sides where task_id = v_task.id and side_id = v_recipient_side
      ) then
        raise exception 'chosen recipient is not part of any side assigned to this task';
      end if;
    else
      if v_recipient_side is null or v_recipient_side <> v_task.side_id then
        raise exception 'chosen recipient is not part of this task''s side';
      end if;
      if v_task.visibility = 'team' and v_recipient_team is distinct from v_task.team_id then
        raise exception 'chosen recipient is not on this task''s team';
      end if;
    end if;

    v_recipient := p_recipient_profile_id;
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

  update tasks
  set status = 'completed', assignee_profile_id = v_recipient, completed_at = now(), completed_by = auth.uid()
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

-- ============================================================
-- change_task_customer(): lets the current customer or the game's
-- organizer reassign who is paying for a task.
-- ============================================================

create or replace function public.change_task_customer(p_task_id uuid, p_new_customer_profile_id uuid)
returns tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks;
begin
  select * into v_task from tasks where id = p_task_id for update;
  if v_task.id is null then
    raise exception 'task not found';
  end if;
  if v_task.status = 'completed' then
    raise exception 'cannot change the customer of a completed task';
  end if;
  if not (v_task.customer_profile_id = auth.uid() or public.is_game_organizer(v_task.game_id)) then
    raise exception 'only the customer or an organizer can change who ordered this task';
  end if;
  if p_new_customer_profile_id is null then
    raise exception 'new customer is required';
  end if;

  update tasks set customer_profile_id = p_new_customer_profile_id
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

grant execute on function public.change_task_customer(uuid, uuid) to authenticated;
