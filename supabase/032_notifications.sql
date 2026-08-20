-- Airsoft Economy: in-app notification feed (no push -- see roadmap notes,
-- this deliberately stops short of expo-notifications/EAS for now).
-- Run after supabase/031_active_game_visibility.sql.
--
-- The bell icon in Dashboard.tsx's header has been an empty, non-
-- interactive slot since Этап 1. This gives it something to show: a
-- notifications table, populated by triggers on the tables that already
-- record the events worth surfacing (tasks, game_participants,
-- personal_transactions) rather than by editing every RPC that can cause
-- them -- a trigger fires no matter which code path made the change, so
-- nothing has to remember to also insert a notification later.
--
-- No insert/select-by-others policy exists for regular users: the trigger
-- functions are security definer (run as the function owner, which
-- bypasses RLS on the write into `notifications`), so a client can never
-- forge a notification for someone else by calling .insert() directly --
-- there's no policy that would let that succeed.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('task_assigned', 'task_reward', 'money_received', 'request_confirmed', 'request_rejected')),
  title text not null,
  body text,
  game_id uuid references games(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table notifications enable row level security;

create policy "read own notifications" on notifications for select to authenticated using (
  profile_id = auth.uid()
);
create policy "mark own notifications read" on notifications for update to authenticated using (
  profile_id = auth.uid()
) with check (
  profile_id = auth.uid()
);
create policy "delete own notifications" on notifications for delete to authenticated using (
  profile_id = auth.uid()
);

-- ============================================================
-- Task assigned -- fires for both claim_task (self) and assign_task
-- (organizer/trader/side-commander), since both just UPDATE
-- assignee_profile_id under the hood. Skips notifying someone about their
-- own claim action.
-- ============================================================

create or replace function public.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_profile_id is not null
     and new.assignee_profile_id is distinct from old.assignee_profile_id
     and new.assignee_profile_id is distinct from auth.uid() then
    insert into notifications (profile_id, kind, title, body, game_id, task_id)
    values (new.assignee_profile_id, 'task_assigned', 'Назначено задание', new.title, new.game_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_task_assigned on tasks;
create trigger trg_notify_task_assigned
  after update on tasks
  for each row execute function public.notify_task_assigned();

-- ============================================================
-- Game participation request confirmed/rejected by the organizer.
-- ============================================================

create or replace function public.notify_participant_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('confirmed', 'rejected') then
    insert into notifications (profile_id, kind, title, body, game_id)
    values (
      new.profile_id,
      case when new.status = 'confirmed' then 'request_confirmed' else 'request_rejected' end,
      case when new.status = 'confirmed' then 'Заявка подтверждена' else 'Заявка отклонена' end,
      null,
      new.game_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_participant_status on game_participants;
create trigger trg_notify_participant_status
  after update on game_participants
  for each row execute function public.notify_participant_status();

-- ============================================================
-- Money landed in your personal balance -- covers deposit, task_reward,
-- trader_charge (the trader is the recipient), and the two participant-
-- facing transfer kinds. Deliberately NOT covering `transactions`
-- (team-to-team): there's no single natural individual recipient there
-- without an extra team-commander lookup, and commanders already see
-- team balance changes on their "Бюджет" tab.
-- ============================================================

create or replace function public.notify_personal_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.to_profile_id is not null then
    insert into notifications (profile_id, kind, title, body, task_id)
    values (
      new.to_profile_id,
      case when new.kind = 'task_reward' then 'task_reward' else 'money_received' end,
      case when new.kind = 'task_reward' then 'Награда за задание' else 'Получен перевод' end,
      format('+%s ₽', new.amount) || coalesce(' — ' || new.note, ''),
      new.task_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_personal_transaction on personal_transactions;
create trigger trg_notify_personal_transaction
  after insert on personal_transactions
  for each row execute function public.notify_personal_transaction();
