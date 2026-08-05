-- Airsoft Economy: tasks/quests, and a new per-game "trader" role
-- Run after supabase/012_side_roster_visibility.sql.
--
-- A task ("задание") belongs to one game and is posted by a "customer"
-- (заказчик) -- any confirmed participant, including the new trader role
-- added here. Depending on its visibility it is either:
--   side       -- announced to a whole side; the customer picks the
--                 recipient by hand when they confirm completion.
--   team       -- same, but scoped to one team within that side.
--   personal   -- pre-assigned to one specific participant at creation.
--   claimable  -- open pool a player can take themselves, or that a
--                 trader/organizer can hand-assign to a specific player.
-- Confirming a task atomically debits the customer's wallet and credits
-- the recipient's, reusing the project-scoped balance tables and the
-- lock-then-update-then-ledger pattern from 008_project_scoped_economy.sql.
--
-- Traders are a brand-new role, assigned per game (not per project) and
-- tied to one or more sides within that game -- mirrors game_organizers,
-- but scoped further down to specific sides.

-- ============================================================
-- Traders
-- ============================================================

create table if not exists game_traders (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, profile_id)
);

create table if not exists game_trader_sides (
  game_trader_id uuid not null references game_traders(id) on delete cascade,
  side_id uuid not null references game_sides(id) on delete cascade,
  primary key (game_trader_id, side_id)
);

create or replace function public.is_game_trader_for_side(p_game_id uuid, p_side_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from game_traders gt
    join game_trader_sides gts on gts.game_trader_id = gt.id
    where gt.game_id = p_game_id and gt.profile_id = auth.uid() and gts.side_id = p_side_id
  );
$$;

grant execute on function public.is_game_trader_for_side(uuid, uuid) to authenticated;

alter table game_traders enable row level security;
alter table game_trader_sides enable row level security;

create policy "read game_traders" on game_traders for select to authenticated using (true);
create policy "organizers write game_traders" on game_traders for insert to authenticated
  with check (is_game_organizer(game_id));
create policy "organizers delete game_traders" on game_traders for delete to authenticated
  using (is_game_organizer(game_id));

create policy "read game_trader_sides" on game_trader_sides for select to authenticated using (true);
create policy "organizers write game_trader_sides" on game_trader_sides for insert to authenticated
  with check (is_game_organizer((select game_id from game_traders where id = game_trader_id)));
create policy "organizers delete game_trader_sides" on game_trader_sides for delete to authenticated
  using (is_game_organizer((select game_id from game_traders where id = game_trader_id)));

-- ============================================================
-- Tasks
-- ============================================================

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  title text not null,
  description text,
  visibility text not null check (visibility in ('side', 'team', 'personal', 'claimable')),
  side_id uuid not null references game_sides(id),
  team_id uuid references teams(id),
  assignee_profile_id uuid references profiles(id),
  customer_profile_id uuid not null references profiles(id),
  reward numeric(12, 2) not null check (reward > 0),
  status text not null default 'open' check (status in ('open', 'claimed', 'completed', 'cancelled')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references profiles(id)
);

create table if not exists task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  kind text not null check (kind in ('file', 'image', 'audio')),
  storage_path text not null,
  file_name text not null,
  content_type text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Validation trigger: side/team/assignee consistency.
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
  if not exists (select 1 from game_sides where id = new.side_id and game_id = new.game_id) then
    raise exception 'side % does not belong to game %', new.side_id, new.game_id;
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

    if v_assignee_side is null or v_assignee_side <> new.side_id then
      raise exception 'assignee % is not part of side % in game %', new.assignee_profile_id, new.side_id, new.game_id;
    end if;

    if new.visibility = 'team' and v_assignee_team is distinct from new.team_id then
      raise exception 'assignee % is not on team % in game %', new.assignee_profile_id, new.team_id, new.game_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists task_checks on tasks;
create trigger task_checks
before insert or update on tasks
for each row execute function public.check_task();

-- ============================================================
-- Visibility: who can see a given task. Reused by both tasks' own
-- select policy and task_attachments' select policy.
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
      or (t.visibility <> 'personal' and public.is_game_trader_for_side(t.game_id, t.side_id))
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
    )
  );
$$;

grant execute on function public.can_view_task(uuid) to authenticated;

alter table tasks enable row level security;
alter table task_attachments enable row level security;

create policy "read tasks" on tasks for select to authenticated using (public.can_view_task(id));

create policy "participants create tasks" on tasks for insert to authenticated with check (
  customer_profile_id = auth.uid()
  and created_by = auth.uid()
  and (
    is_game_organizer(game_id)
    or is_game_trader_for_side(game_id, side_id)
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
);

create policy "delete open tasks" on tasks for delete to authenticated using (
  status = 'open' and (customer_profile_id = auth.uid() or is_game_organizer(game_id))
);

create policy "read task_attachments" on task_attachments for select to authenticated using (
  public.can_view_task(task_id)
);

create policy "task authors write task_attachments" on task_attachments for insert to authenticated with check (
  exists (
    select 1 from tasks t where t.id = task_id
    and (t.customer_profile_id = auth.uid() or t.created_by = auth.uid() or is_game_organizer(t.game_id))
  )
);

create policy "task authors delete task_attachments" on task_attachments for delete to authenticated using (
  exists (
    select 1 from tasks t where t.id = task_id
    and (t.customer_profile_id = auth.uid() or t.created_by = auth.uid() or is_game_organizer(t.game_id))
  )
);

insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', true)
on conflict (id) do nothing;

create policy "read task-attachments files" on storage.objects for select
  using (bucket_id = 'task-attachments');

create policy "task authors upload task-attachments files" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from tasks t where t.id = (storage.foldername(name))[1]::uuid
      and (t.customer_profile_id = auth.uid() or t.created_by = auth.uid() or is_game_organizer(t.game_id))
    )
  );

create policy "task authors delete task-attachments files" on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from tasks t where t.id = (storage.foldername(name))[1]::uuid
      and (t.customer_profile_id = auth.uid() or t.created_by = auth.uid() or is_game_organizer(t.game_id))
    )
  );

-- ============================================================
-- Ledger: a new transaction kind for task rewards, tagged with the task.
-- ============================================================

alter table personal_transactions add column if not exists task_id uuid references tasks(id);

alter table personal_transactions drop constraint if exists personal_transactions_kind_check;
alter table personal_transactions add constraint personal_transactions_kind_check check (
  kind in ('deposit', 'team_to_participant', 'participant_to_team', 'participant_to_participant', 'task_reward')
);

-- ============================================================
-- Mutation RPCs. Status/assignee transitions only ever happen through
-- these (there is no generic client-side update policy on tasks), so the
-- money movement in complete_task can never be bypassed by a raw update.
-- ============================================================

create or replace function public.claim_task(p_task_id uuid)
returns tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks;
  v_side uuid;
begin
  select * into v_task from tasks where id = p_task_id for update;
  if v_task.id is null then
    raise exception 'task not found';
  end if;
  if v_task.visibility <> 'claimable' then
    raise exception 'only claimable tasks can be taken';
  end if;
  if v_task.status <> 'open' or v_task.assignee_profile_id is not null then
    raise exception 'task is already taken';
  end if;

  v_side := public.my_effective_side(v_task.game_id);
  if v_side is null or v_side <> v_task.side_id then
    raise exception 'you are not part of this task''s side';
  end if;

  update tasks set assignee_profile_id = auth.uid(), status = 'claimed'
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

create or replace function public.assign_task(p_task_id uuid, p_profile_id uuid)
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
  if v_task.visibility <> 'claimable' then
    raise exception 'only claimable tasks can be assigned';
  end if;
  if v_task.status <> 'open' or v_task.assignee_profile_id is not null then
    raise exception 'task is already taken';
  end if;
  if not (public.is_game_organizer(v_task.game_id) or public.is_game_trader_for_side(v_task.game_id, v_task.side_id)) then
    raise exception 'only an organizer or trader for this side can assign this task';
  end if;

  update tasks set assignee_profile_id = p_profile_id, status = 'claimed'
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

create or replace function public.cancel_task(p_task_id uuid)
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
    raise exception 'task already completed';
  end if;
  if v_task.status = 'cancelled' then
    raise exception 'task already cancelled';
  end if;
  if not (v_task.customer_profile_id = auth.uid() or public.is_game_organizer(v_task.game_id)) then
    raise exception 'only the customer or an organizer can cancel this task';
  end if;

  update tasks set status = 'cancelled' where id = p_task_id returning * into v_task;
  return v_task;
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

    if v_recipient_side is null or v_recipient_side <> v_task.side_id then
      raise exception 'chosen recipient is not part of this task''s side';
    end if;
    if v_task.visibility = 'team' and v_recipient_team is distinct from v_task.team_id then
      raise exception 'chosen recipient is not on this task''s team';
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

grant execute on function public.claim_task(uuid) to authenticated;
grant execute on function public.assign_task(uuid, uuid) to authenticated;
grant execute on function public.cancel_task(uuid) to authenticated;
grant execute on function public.complete_task(uuid, uuid) to authenticated;
