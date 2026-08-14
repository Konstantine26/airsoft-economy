-- Airsoft Economy: fix "new row violates row-level security policy for
-- table tasks" on every task creation (any visibility, any user, any role).
-- Run after supabase/014_optional_task_reward.sql.
--
-- Root cause: the "read tasks" policy's USING clause is can_view_task(id),
-- which re-queries `tasks` by id to look up the row's own columns. PostgREST
-- always does INSERT ... RETURNING *, and Postgres evaluates a table's
-- SELECT policy against the just-inserted row as part of that same INSERT
-- command. Per ordinary MVCC command-visibility rules, a command cannot see
-- rows it is itself in the middle of inserting via a *separate* scan of the
-- same table -- so can_view_task's internal `select ... from tasks where id
-- = p_task_id` always finds zero rows during RETURNING, and the policy
-- always evaluates false, regardless of who's inserting. Confirmed directly:
-- `with ins as (insert ... returning id) select exists(select 1 from tasks
-- where id = ins.id) from ins` returns false even for a superuser, no RLS
-- involved.
--
-- Fix: give `tasks` its own SELECT-policy check that takes the row's
-- columns as arguments instead of re-querying the table, so nothing scans
-- `tasks` during its own RETURNING evaluation. can_view_task(uuid) itself is
-- left untouched -- it's still correct for task_attachments' policies,
-- which look up a *different*, already-committed table's tasks row via a
-- separate top-level request, not the same INSERT command.

create or replace function public.can_view_task_row(
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
    or (p_visibility <> 'personal' and public.is_game_trader_for_side(p_game_id, p_side_id))
    or (p_visibility in ('side', 'claimable') and p_side_id = public.my_effective_side(p_game_id))
    or (
      p_visibility = 'team'
      and p_side_id = public.my_effective_side(p_game_id)
      and p_team_id = (
        select gp.team_id from game_participants gp
        where gp.game_id = p_game_id and gp.profile_id = auth.uid()
        limit 1
      )
    );
$$;

grant execute on function public.can_view_task_row(uuid, uuid, uuid, text, uuid, uuid, uuid) to authenticated;

drop policy if exists "read tasks" on tasks;
create policy "read tasks" on tasks for select to authenticated using (
  public.can_view_task_row(game_id, side_id, team_id, visibility, customer_profile_id, created_by, assignee_profile_id)
);
