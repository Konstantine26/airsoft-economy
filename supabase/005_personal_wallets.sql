-- Airsoft Economy: personal wallets for participants
-- Run after supabase/004_fix_role_trigger.sql.
--
-- Adds a personal balance per profile, a short human-typeable
-- participant number (for QR/manual entry), and a personal_transactions
-- ledger covering four kinds of money movement:
--   deposit               : admin/organizer mints money into a wallet
--   team_to_participant   : a team commander distributes team funds
--   participant_to_team   : a participant funds their own team
--   participant_to_participant : peer-to-peer transfer

alter table profiles add column if not exists balance numeric(12, 2) not null default 0;
alter table profiles add column if not exists participant_number bigint generated always as identity unique;

create table if not exists personal_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('deposit', 'team_to_participant', 'participant_to_team', 'participant_to_participant')),
  from_profile_id uuid references profiles(id),
  from_team_id uuid references teams(id),
  to_profile_id uuid references profiles(id),
  to_team_id uuid references teams(id),
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now(),
  constraint valid_source check (
    (kind = 'deposit' and from_profile_id is null and from_team_id is null)
    or (kind in ('participant_to_team', 'participant_to_participant') and from_profile_id is not null and from_team_id is null)
    or (kind = 'team_to_participant' and from_team_id is not null and from_profile_id is null)
  ),
  constraint valid_destination check (
    (kind = 'participant_to_team' and to_team_id is not null and to_profile_id is null)
    or (kind in ('deposit', 'team_to_participant', 'participant_to_participant') and to_profile_id is not null and to_team_id is null)
  ),
  constraint no_self_transfer check (from_profile_id is distinct from to_profile_id)
);

alter table personal_transactions enable row level security;

create policy "read own personal_transactions" on personal_transactions for select to authenticated using (
  is_admin()
  or is_organizer()
  or from_profile_id = auth.uid()
  or to_profile_id = auth.uid()
  or (from_team_id is not null and is_team_commander(from_team_id))
  or (to_team_id is not null and is_team_commander(to_team_id))
);

-- ============================================================
-- RPCs. All SECURITY DEFINER, all take the acting participant from
-- auth.uid() rather than a parameter so nobody can move money out of
-- someone else's wallet. Row locks avoid double-spend races.
-- ============================================================

create or replace function public.deposit_to_participant(
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
  if not public.is_organizer() then
    raise exception 'only organizers or admins can deposit funds';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  perform 1 from profiles where id = p_to_profile_id for update;

  update profiles set balance = balance + p_amount where id = p_to_profile_id;

  insert into personal_transactions (kind, to_profile_id, amount, note)
  values ('deposit', p_to_profile_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.distribute_to_participant(
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
begin
  if not public.is_team_commander(p_from_team_id) then
    raise exception 'only that team''s commander can distribute its funds';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  perform 1 from teams where id = p_from_team_id for update;
  perform 1 from profiles where id = p_to_profile_id for update;

  update teams set balance = balance - p_amount where id = p_from_team_id;
  update profiles set balance = balance + p_amount where id = p_to_profile_id;

  insert into personal_transactions (kind, from_team_id, to_profile_id, amount, note)
  values ('team_to_participant', p_from_team_id, p_to_profile_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.transfer_to_team(
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
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select balance into v_balance from profiles where id = auth.uid() for update;
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;

  perform 1 from teams where id = p_to_team_id for update;

  update profiles set balance = balance - p_amount where id = auth.uid();
  update teams set balance = balance + p_amount where id = p_to_team_id;

  insert into personal_transactions (kind, from_profile_id, to_team_id, amount, note)
  values ('participant_to_team', auth.uid(), p_to_team_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.transfer_to_participant(
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
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select balance into v_balance from profiles where id = auth.uid() for update;
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;

  perform 1 from profiles where id = p_to_profile_id for update;

  update profiles set balance = balance - p_amount where id = auth.uid();
  update profiles set balance = balance + p_amount where id = p_to_profile_id;

  insert into personal_transactions (kind, from_profile_id, to_profile_id, amount, note)
  values ('participant_to_participant', auth.uid(), p_to_profile_id, p_amount, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.deposit_to_participant(uuid, numeric, text) to authenticated;
grant execute on function public.distribute_to_participant(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.transfer_to_team(uuid, numeric, text) to authenticated;
grant execute on function public.transfer_to_participant(uuid, numeric, text) to authenticated;
