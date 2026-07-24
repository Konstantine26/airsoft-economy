-- Airsoft Economy: initial schema
-- Run this in Supabase SQL Editor (Project -> SQL Editor -> New query).

create extension if not exists "pgcrypto";

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_id uuid references teams(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  from_team_id uuid references teams(id) on delete restrict,
  to_team_id uuid references teams(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now(),
  constraint different_teams check (from_team_id is distinct from to_team_id)
);

-- Atomic transfer: inserts the transaction row and updates both team
-- balances in a single transaction so a client never sees a partial write.
create or replace function transfer_funds(
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
  v_transaction transactions;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  if p_from_team_id = p_to_team_id then
    raise exception 'from_team_id and to_team_id must differ';
  end if;

  perform 1 from teams where id = p_from_team_id for update;
  perform 1 from teams where id = p_to_team_id for update;

  update teams set balance = balance - p_amount where id = p_from_team_id;
  update teams set balance = balance + p_amount where id = p_to_team_id;

  insert into transactions (from_team_id, to_team_id, amount, note)
  values (p_from_team_id, p_to_team_id, p_amount, p_note)
  returning * into v_transaction;

  return v_transaction;
end;
$$;

grant execute on function transfer_funds(uuid, uuid, numeric, text) to anon, authenticated;

-- Row Level Security. No app-level auth yet, so allow anon read/write for
-- this prototype. Tighten before shipping real money/inventory tracking.
alter table teams enable row level security;
alter table users enable row level security;
alter table transactions enable row level security;

create policy "anon read teams" on teams for select using (true);
create policy "anon read users" on users for select using (true);
create policy "anon read transactions" on transactions for select using (true);
create policy "anon insert users" on users for insert with check (true);

-- Seed a couple of teams to see something in the first screen.
insert into teams (name, balance) values
  ('Alpha', 1000),
  ('Bravo', 1000)
on conflict (name) do nothing;
