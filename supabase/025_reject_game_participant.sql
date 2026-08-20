-- Airsoft Economy: add a real "rejected" status for game participation requests
-- Run after supabase/024_migrations_status.sql.
--
-- Until now, an organizer rejecting a pending request just deleted the
-- game_participants row -- indistinguishable from "never applied", and no
-- history. This widens the status check constraint to allow 'rejected' as
-- a real terminal state alongside 'pending'/'confirmed'.
--
-- Deliberately NOT adding any new RLS policy: the existing "organizer
-- updates participants" UPDATE policy (007_scoped_roles.sql) already lets
-- an organizer set status to any value on a game they organize, and
-- re-applying after rejection is handled client-side as delete-then-insert
-- (self-delete already works on a row in any status via "commander or self
-- unregisters participant", 010_game_details.sql), so no reactivation-via-
-- UPDATE path is needed for players/commanders either.

alter table game_participants drop constraint if exists game_participants_status_check;
alter table game_participants add constraint game_participants_status_check
  check (status in ('pending', 'confirmed', 'rejected'));
