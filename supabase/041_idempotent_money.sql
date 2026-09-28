-- Airsoft Economy: money RPCs that are safe to retry
-- Run after supabase/040_task_row_visibility_sides.sql.
--
-- On a weak polygon connection a transfer can succeed on the server while
-- the response never reaches the phone. Retrying it (automatically, or by
-- the player tapping again) would charge twice, which is why lib/retry.ts
-- has so far been kept away from every money call.
--
-- Each money RPC gets a *_once twin taking a client-generated request id.
-- The twin records (caller, request id) in money_requests and then calls the
-- original function -- all in the one transaction PostgREST opens per RPC:
--
--   * first call: the key is inserted and the money moves; both commit;
--   * a repeat with the same key: the insert conflicts, nothing moves, and
--     the call returns NULL instead of a new transaction row;
--   * a failed call (insufficient funds, archived project...) rolls back the
--     key together with everything else, so fixing the problem and retrying
--     with the same key works;
--   * two concurrent calls with the same key: the second insert waits on the
--     first's row lock and then either conflicts (first committed) or goes
--     ahead (first rolled back).
--
-- The originals are left exactly as they are: nothing is redefined, older
-- app builds keep calling them, and the twins inherit every check the
-- originals make. The twins are SECURITY INVOKER on purpose -- the
-- originals are SECURITY DEFINER and do their own auth.uid() checks, and a
-- definer wrapper would add privilege without adding anything else.

create table if not exists public.money_requests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null,
  function_name text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, request_id)
);

-- No policies: only claim_money_request() (SECURITY DEFINER) touches it.
alter table public.money_requests enable row level security;

create or replace function public.claim_money_request(p_request_id uuid, p_function_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_request_id is null then
    raise exception 'request id is required';
  end if;

  insert into money_requests (profile_id, request_id, function_name)
  values (auth.uid(), p_request_id, p_function_name)
  on conflict (profile_id, request_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

revoke execute on function public.claim_money_request(uuid, text) from public, anon;
grant execute on function public.claim_money_request(uuid, text) to authenticated;

-- Participant → participant
create or replace function public.transfer_to_participant_once(
  p_request_id uuid,
  p_project_id uuid,
  p_to_profile_id uuid,
  p_amount numeric,
  p_note text default null
)
returns personal_transactions
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.claim_money_request(p_request_id, 'transfer_to_participant') then
    return null;
  end if;
  return public.transfer_to_participant(p_project_id, p_to_profile_id, p_amount, p_note);
end;
$$;

-- Participant → team
create or replace function public.transfer_to_team_once(
  p_request_id uuid,
  p_project_id uuid,
  p_to_team_id uuid,
  p_amount numeric,
  p_note text default null
)
returns personal_transactions
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.claim_money_request(p_request_id, 'transfer_to_team') then
    return null;
  end if;
  return public.transfer_to_team(p_project_id, p_to_team_id, p_amount, p_note);
end;
$$;

-- Team → team (organizer)
create or replace function public.transfer_funds_once(
  p_request_id uuid,
  p_project_id uuid,
  p_from_team_id uuid,
  p_to_team_id uuid,
  p_amount numeric,
  p_note text default null
)
returns transactions
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.claim_money_request(p_request_id, 'transfer_funds') then
    return null;
  end if;
  return public.transfer_funds(p_project_id, p_from_team_id, p_to_team_id, p_amount, p_note);
end;
$$;

-- Revival (trader / side commander)
create or replace function public.revive_participant_once(
  p_request_id uuid,
  p_project_id uuid,
  p_game_id uuid,
  p_from_profile_id uuid,
  p_note text default null
)
returns personal_transactions
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.claim_money_request(p_request_id, 'revive_participant') then
    return null;
  end if;
  return public.revive_participant(p_project_id, p_game_id, p_from_profile_id, p_note);
end;
$$;

-- Trader charges a participant
create or replace function public.trader_charge_participant_once(
  p_request_id uuid,
  p_project_id uuid,
  p_game_id uuid,
  p_from_profile_id uuid,
  p_amount numeric,
  p_note text default null
)
returns personal_transactions
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.claim_money_request(p_request_id, 'trader_charge_participant') then
    return null;
  end if;
  return public.trader_charge_participant(p_project_id, p_game_id, p_from_profile_id, p_amount, p_note);
end;
$$;

-- Trader charges a team
create or replace function public.trader_charge_team_once(
  p_request_id uuid,
  p_project_id uuid,
  p_game_id uuid,
  p_from_team_id uuid,
  p_amount numeric,
  p_note text default null
)
returns personal_transactions
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.claim_money_request(p_request_id, 'trader_charge_team') then
    return null;
  end if;
  return public.trader_charge_team(p_project_id, p_game_id, p_from_team_id, p_amount, p_note);
end;
$$;

-- Team commander pays a member
create or replace function public.distribute_to_participant_once(
  p_request_id uuid,
  p_project_id uuid,
  p_from_team_id uuid,
  p_to_profile_id uuid,
  p_amount numeric,
  p_note text default null
)
returns personal_transactions
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.claim_money_request(p_request_id, 'distribute_to_participant') then
    return null;
  end if;
  return public.distribute_to_participant(p_project_id, p_from_team_id, p_to_profile_id, p_amount, p_note);
end;
$$;

-- Organizer deposits to a team
create or replace function public.deposit_to_team_once(
  p_request_id uuid,
  p_project_id uuid,
  p_to_team_id uuid,
  p_amount numeric,
  p_note text default null
)
returns transactions
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.claim_money_request(p_request_id, 'deposit_to_team') then
    return null;
  end if;
  return public.deposit_to_team(p_project_id, p_to_team_id, p_amount, p_note);
end;
$$;

-- Organizer deposits to a participant
create or replace function public.deposit_to_participant_once(
  p_request_id uuid,
  p_project_id uuid,
  p_to_profile_id uuid,
  p_amount numeric,
  p_note text default null
)
returns personal_transactions
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.claim_money_request(p_request_id, 'deposit_to_participant') then
    return null;
  end if;
  return public.deposit_to_participant(p_project_id, p_to_profile_id, p_amount, p_note);
end;
$$;

revoke execute on function public.transfer_to_participant_once(uuid, uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.transfer_to_team_once(uuid, uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.transfer_funds_once(uuid, uuid, uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.revive_participant_once(uuid, uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.trader_charge_participant_once(uuid, uuid, uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.trader_charge_team_once(uuid, uuid, uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.distribute_to_participant_once(uuid, uuid, uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.deposit_to_team_once(uuid, uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.deposit_to_participant_once(uuid, uuid, uuid, numeric, text) from public, anon;

grant execute on function public.transfer_to_participant_once(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.transfer_to_team_once(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.transfer_funds_once(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.revive_participant_once(uuid, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.trader_charge_participant_once(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.trader_charge_team_once(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.distribute_to_participant_once(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.deposit_to_team_once(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.deposit_to_participant_once(uuid, uuid, uuid, numeric, text) to authenticated;
