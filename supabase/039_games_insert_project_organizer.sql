-- Airsoft Economy: let project organizers create games, not just admins
-- Run after supabase/038_task_multi_side_and_customer_change.sql.
--
-- The game-creation screen (035_game_creation_fields.sql) is built for a
-- project's organizers to use, and the client already gates it on
-- project_organizers / game_organizers membership via capabilities.isOrganizer
-- (hooks/useCapabilities.ts). But the games INSERT policy from
-- 007_scoped_roles.sql was left at admins-only ("admins write games"), so any
-- non-admin project organizer hit "new row violates row-level security policy
-- for table games" when creating an event. is_project_organizer(project_id)
-- already covers admins too (it's `is_admin() or exists (project_organizers...)`),
-- so this simply replaces the admin-only check with the scoped one.

drop policy if exists "admins write games" on games;
create policy "organizers write games" on games for insert to authenticated
  with check (is_project_organizer(project_id));
