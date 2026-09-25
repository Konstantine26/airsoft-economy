-- Airsoft Economy: players can see multi-side ("sides") tasks
-- Run after supabase/039_games_insert_project_organizer.sql.
--
-- 038_task_multi_side_and_customer_change.sql added the "sides" visibility
-- and taught can_view_task(uuid) about it, but the tasks SELECT policy
-- doesn't use can_view_task -- since 016_fix_task_returning_rls.sql it uses
-- can_view_task_row(...), which only looks at tasks.side_id. A "sides" task
-- has side_id = NULL (its sides live in task_sides), so every branch but
-- organizer/customer/creator/assignee evaluated to false and ordinary
-- participants and side traders never saw these tasks at all.
--
-- can_view_task_row needs the task id to look up task_sides, so it gains a
-- p_task_id parameter. Reading task_sides here is safe for the INSERT ...
-- RETURNING case 016 was about: it's a different table, and the only
-- inserter of a "sides" task (an organizer) is already admitted by
-- is_game_organizer() before task_sides rows exist.

create or replace function public.can_view_task_row(
  p_task_id uuid,
  p_game_id uuid,
  p_side_id uuid,
  p_team_id uuid,
  p_visibility text,
  p_customer_profile_id uuid,
  p_created_by uuid,
  p_assignee_profile_id uuid
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.is_game_organizer(p_game_id)
    or p_customer_profile_id = auth.uid()
    or p_created_by = auth.uid()
    or p_assignee_profile_id = auth.uid()
    or (p_visibility not in ('personal', 'sides') and public.is_game_trader_for_side(p_game_id, p_side_id))
    or (p_visibility in ('side', 'claimable') and p_side_id = public.my_effective_side(p_game_id))
    or (
      p_visibility = 'team'
      and p_side_id = public.my_effective_side(p_game_id)
      and p_team_id = (
        select gp.team_id from game_participants gp
        where gp.game_id = p_game_id and gp.profile_id = auth.uid()
        limit 1
      )
    )
    or (
      p_visibility = 'sides'
      and exists (
        select 1 from task_sides ts
        where ts.task_id = p_task_id
        and (
          ts.side_id = public.my_effective_side(p_game_id)
          or public.is_game_trader_for_side(p_game_id, ts.side_id)
        )
      )
    );
$$;

grant execute on function public.can_view_task_row(uuid, uuid, uuid, uuid, text, uuid, uuid, uuid) to authenticated;

drop policy if exists "read tasks" on tasks;
create policy "read tasks" on tasks for select to authenticated using (
  public.can_view_task_row(id, game_id, side_id, team_id, visibility, customer_profile_id, created_by, assignee_profile_id)
  and public.can_view_game(game_id)
);

drop function if exists public.can_view_task_row(uuid, uuid, uuid, text, uuid, uuid, uuid);
