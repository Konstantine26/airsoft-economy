-- Airsoft Economy: only one active team join request per player
-- Run after supabase/019_team_join_requests.sql.
--
-- Testing surfaced that a second application while one was already
-- pending silently failed at the DB layer with no clear message (the
-- original insert policy only blocked players already on a team, not
-- players with another pending request). Decided: keep it to one active
-- request at a time -- enforce it in the policy itself (not just the UI)
-- and give the app a precise error to show instead of a raw RLS denial.

drop policy if exists "self requests to join team" on team_join_requests;
create policy "self requests to join team" on team_join_requests for insert to authenticated
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and not exists (select 1 from team_members where profile_id = auth.uid())
    and not exists (
      select 1 from team_join_requests
      where profile_id = auth.uid() and status = 'pending'
    )
  );
