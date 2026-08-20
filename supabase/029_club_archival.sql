-- Airsoft Economy: archive a club
-- Run after supabase/028_clubs_admin_ui.sql.
--
-- Same pattern as projects.archived_at (026_project_archival.sql): a soft
-- flag before the harder, cascading delete. No new RLS needed -- clubs is
-- already admin-only write via "admins update clubs" (028).
--
-- Deliberately does NOT cascade into projects.archived_at -- archiving a
-- club and archiving one of its projects are separate, explicit admin
-- actions, same as is_closed/archived_at were kept orthogonal for
-- projects. And since club_id isn't checked by any RLS yet (no data
-- isolation between clubs exists), archived_at on a club is bookkeeping/
-- a UI label for now, not an access-control mechanism.

alter table clubs add column if not exists archived_at timestamptz;
