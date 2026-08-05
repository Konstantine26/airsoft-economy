-- Airsoft Economy: tasks may be posted without a monetary reward
-- Run after supabase/013_tasks.sql.
--
-- Some tasks are just favors/roleplay, not paid contracts. reward becomes
-- nullable (still must be positive when set -- no ambiguous zero); when
-- null, complete_task skips the economy check and the wallet transfer
-- entirely and just marks the task done, recording who received it.

alter table tasks alter column reward drop not null;
alter table tasks drop constraint if exists tasks_reward_check;
alter table tasks add constraint tasks_reward_check check (reward is null or reward > 0);

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

grant execute on function public.complete_task(uuid, uuid) to authenticated;
