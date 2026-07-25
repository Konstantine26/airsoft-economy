-- Airsoft Economy: economy scoped per project
-- Run after supabase/007_scoped_roles.sql.
--
-- A project can opt into "Ведение экономики" (economy_enabled). When on,
-- every team and every participant gets their own balance *within that
-- project* -- the same team can have a different balance in project A
-- than in project B. This replaces the old single global teams.balance /
-- profiles.balance columns entirely.

alter table projects add column if not exists economy_enabled boolean not null default false;

-- Projects that already had economy activity keep it turned on so existing
-- test data doesn't go dark after this migration.
update projects set economy_enabled = true;

-- ============================================================
-- Per-project balances
-- ============================================================

create table if not exists project_team_balances (
  project_id uuid not null references projects(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  balance numeric(12, 2) not null default 0,
  primary key (project_id, team_id)
);

create table if not exists project_profile_balances (
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  balance numeric(12, 2) not null default 0,
  primary key (project_id, profile_id)
);

alter table project_team_balances enable row level security;
alter table project_profile_balances enable row level security;

create policy "read project_team_balances" on project_team_balances for select to authenticated using (true);
create policy "read project_profile_balances" on project_profile_balances for select to authenticated using (true);

-- ============================================================
-- Ledgers: tag every transaction with the project it happened in.
-- ============================================================

alter table transactions add column if not exists project_id uuid references projects(id);
alter table personal_transactions add column if not exists project_id uuid references projects(id);

-- ============================================================
-- One-time migration of existing global balances into the (single, at
-- the time of writing) project each team/profile is actually involved
-- in, so the current test data isn't wiped by this refactor. A team or
-- profile linked to more than one project would have its balance seeded
-- into each -- harmless in practice since there is only one project so
-- far, but this is a one-shot seed, not something the app relies on.
-- ============================================================

insert into project_team_balances (project_id, team_id, balance)
select distinct g.project_id, t.id, t.balance
from teams t
join game_team_sides gts on gts.team_id = t.id
join games g on g.id = gts.game_id
where t.balance <> 0
on conflict (project_id, team_id) do nothing;

insert into project_profile_balances (project_id, profile_id, balance)
select distinct g.project_id, p.id, p.balance
from profiles p
join team_members tm on tm.profile_id = p.id
join game_team_sides gts on gts.team_id = tm.team_id
join games g on g.id = gts.game_id
where p.balance <> 0
on conflict (project_id, profile_id) do nothing;

alter table teams drop column if exists balance;
alter table profiles drop column if exists balance;

-- ============================================================
-- Helper: is economy tracking turned on for this project?
-- ============================================================

create or replace function public.project_economy_enabled(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select economy_enabled from projects where id = p_project_id), false);
$$;

grant execute on function public.project_economy_enabled(uuid) to authenticated;

-- ============================================================
-- Money-moving RPCs, all rewritten to take p_project_id and operate on
-- the scoped balance tables. Old signatures are dropped first since
-- Postgres would otherwise keep them around as harmless-looking but
-- unscoped overloads.
-- ============================================================

drop function if exists public.transfer_funds(uuid, uuid, numeric, text);
drop function if exists public.deposit_to_team(uuid, numeric, text);
drop function if exists public.deposit_to_participant(uuid, numeric, text);
drop function if exists public.distribute_to_participant(uuid, uuid, numeric, text);
drop function if exists public.transfer_to_team(uuid, numeric, text);
drop function if exists public.transfer_to_participant(uuid, numeric, text);

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

grant execute on function public.transfer_funds(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.deposit_to_team(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.deposit_to_participant(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.distribute_to_participant(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.transfer_to_team(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.transfer_to_participant(uuid, uuid, numeric, text) to authenticated;
