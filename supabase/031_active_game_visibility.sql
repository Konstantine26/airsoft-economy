-- Airsoft Economy: let an organizer see who has already checked in
-- Run after supabase/030_closed_project_cascade.sql.
--
-- "Активная игра" (lib/activeGameStorage.ts) has been a purely local,
-- per-device AsyncStorage flag since it shipped -- the organizer running
-- a game has had no way to see who has actually tapped "Приступить к
-- игре" versus who's still on their way. This adds a single current-state
-- column instead of a check-in history table: only "am I checked in right
-- now, and into which game" is asked for, not a log of past sessions.
--
-- No new RLS needed: "read profiles" is already `using (true)`
-- (002_roles_and_games.sql), and "update own profile or admin" already
-- lets a profile write any column on its own row (id = auth.uid()), which
-- covers active_game_id same as it already covers full_name/avatar_url.

alter table profiles add column if not exists active_game_id uuid references games(id) on delete set null;
