-- Airsoft Economy: organizer broadcasts to a game's registered participants
-- Run after supabase/033_sync_commander_membership.sql.
--
-- Widens notifications.kind to add 'announcement', and adds a security
-- definer RPC that fans out one notification row per recipient. Every
-- existing writer into notifications (032_notifications.sql) is a trigger
-- that fires on a single-row table event and inserts exactly one row --
-- there's no bulk fan-out precedent to copy. Announcements are organizer-
-- initiated, not triggered by a row change, so a plain RPC (not a
-- trigger) is the right shape. No new INSERT policy is added: like every
-- other write into notifications, this goes through a security definer
-- function that bypasses RLS, so a client still can never forge a
-- notification for someone else via a raw .insert() call.
--
-- Deliberately does NOT exclude the organizer from recipients even if
-- they're also a confirmed participant -- this is a broadcast, receiving
-- your own announcement is expected, unlike the self-notify guard in
-- notify_task_assigned.

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (
  kind in ('task_assigned', 'task_reward', 'money_received', 'request_confirmed', 'request_rejected', 'announcement')
);

create or replace function public.send_game_announcement(
  p_game_id uuid,
  p_title text,
  p_body text default null,
  p_side_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_game_organizer(p_game_id) then
    raise exception 'only an organizer of this game can send announcements';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'title is required';
  end if;

  if p_side_id is not null and not exists (
    select 1 from game_sides where id = p_side_id and game_id = p_game_id
  ) then
    raise exception 'side % does not belong to game %', p_side_id, p_game_id;
  end if;

  -- game_participants has a unique (game_id, profile_id), so this select
  -- can't produce duplicate recipients.
  insert into notifications (profile_id, kind, title, body, game_id)
  select gp.profile_id, 'announcement', p_title, p_body, p_game_id
  from game_participants gp
  where gp.game_id = p_game_id
    and gp.status = 'confirmed'
    and (
      p_side_id is null
      or public.participant_effective_side(p_game_id, gp.team_id, gp.side_id) = p_side_id
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.send_game_announcement(uuid, text, text, uuid) to authenticated;
