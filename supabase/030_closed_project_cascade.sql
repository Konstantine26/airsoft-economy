-- Airsoft Economy: cascade "closed project" visibility down to game-level
-- tables. Run after supabase/029_club_archival.sql.
--
-- 018_closed_projects.sql deliberately stopped at projects/games: closing
-- a project hides it (and its games) from the project switcher and game
-- lists, but game_sides/game_participants/tasks/game_stages/
-- game_attachments/game_traders/game_trader_sides/task_attachments/
-- transactions/personal_transactions never checked is_closed at all --
-- several of them (game_sides, game_team_sides, game_stages,
-- game_attachments, game_traders, game_trader_sides, transactions) are
-- currently "using (true)", readable by any authenticated user who knows
-- (or guesses) a game_id/task_id, closed or not. This was flagged as an
-- open tail at the time and is now being closed.
--
-- can_view_game() re-queries `games` (safe to call from every table
-- below, all of which are different tables from `games` itself -- never
-- call it from games' own select policy, which already inlines
-- can_view_project(project_id) directly using the row's own column for
-- exactly that reason). is_admin() doesn't need a separate OR anywhere
-- here: can_view_project() -> is_project_organizer() -> is_admin() already
-- covers it transitively (007_scoped_roles.sql).
--
-- Every policy below is the table's existing latest policy, unchanged,
-- with "and public.can_view_game(game_id)" (or can_view_project(project_id)
-- for the two tables that carry project_id directly) added on top -- this
-- narrows access, it never widens it. For a project that isn't closed,
-- can_view_project()/can_view_game() are unconditionally true, so this is
-- a no-op for every project except ones explicitly marked is_closed.

create or replace function public.can_view_game(p_game_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select public.can_view_project(project_id) from games where id = p_game_id),
    false
  );
$$;

grant execute on function public.can_view_game(uuid) to authenticated;

drop policy if exists "read game_sides" on game_sides;
create policy "read game_sides" on game_sides for select to authenticated using (
  public.can_view_game(game_id)
);

drop policy if exists "read game_team_sides" on game_team_sides;
create policy "read game_team_sides" on game_team_sides for select to authenticated using (
  public.can_view_game(game_id)
);

drop policy if exists "read game_stages" on game_stages;
create policy "read game_stages" on game_stages for select to authenticated using (
  public.can_view_game(game_id)
);

drop policy if exists "read game_attachments" on game_attachments;
create policy "read game_attachments" on game_attachments for select to authenticated using (
  public.can_view_game(game_id)
);

drop policy if exists "read game_traders" on game_traders;
create policy "read game_traders" on game_traders for select to authenticated using (
  public.can_view_game(game_id)
);

drop policy if exists "read game_trader_sides" on game_trader_sides;
create policy "read game_trader_sides" on game_trader_sides for select to authenticated using (
  exists (
    select 1 from game_traders gt
    where gt.id = game_trader_sides.game_trader_id and public.can_view_game(gt.game_id)
  )
);

drop policy if exists "read game_participants" on game_participants;
create policy "read game_participants" on game_participants for select to authenticated using (
  (
    is_game_organizer(game_id)
    or is_team_commander(team_id)
    or is_team_member(team_id)
    or commands_side_for_team_game(game_id, team_id)
    or profile_id = auth.uid()
    or (
      public.participant_effective_side(game_id, team_id, side_id) is not null
      and public.participant_effective_side(game_id, team_id, side_id) = public.my_effective_side(game_id)
    )
  )
  and public.can_view_game(game_id)
);

drop policy if exists "read tasks" on tasks;
create policy "read tasks" on tasks for select to authenticated using (
  public.can_view_task_row(game_id, side_id, team_id, visibility, customer_profile_id, created_by, assignee_profile_id)
  and public.can_view_game(game_id)
);

drop policy if exists "read task_attachments" on task_attachments;
create policy "read task_attachments" on task_attachments for select to authenticated using (
  public.can_view_task(task_id)
  and exists (
    select 1 from tasks t where t.id = task_attachments.task_id and public.can_view_game(t.game_id)
  )
);

drop policy if exists "read transactions" on transactions;
create policy "read transactions" on transactions for select to authenticated using (
  public.can_view_project(project_id)
);

drop policy if exists "read own personal_transactions" on personal_transactions;
create policy "read own personal_transactions" on personal_transactions for select to authenticated using (
  (
    is_admin()
    or from_profile_id = auth.uid()
    or to_profile_id = auth.uid()
    or (from_team_id is not null and is_team_commander(from_team_id))
    or (to_team_id is not null and is_team_commander(to_team_id))
  )
  -- can_view_project(null) already resolves to true (project_is_closed(null)
  -- is false), so this correctly stays permissive for pre-008 rows with no
  -- project_id -- no separate null guard needed.
  and public.can_view_project(project_id)
);
