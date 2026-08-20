-- Airsoft Economy: make clubs/club_admins usable from the admin UI
-- Run after supabase/027_clubs_schema.sql.
--
-- The minimal next slice after the schema-only dark launch: admin can now
-- create/edit/delete clubs and assign club_admins, and can set club_id on
-- projects/polygons. This does NOT add any data isolation between clubs --
-- is_admin() and every existing policy are still untouched, and club_id
-- isn't checked anywhere yet. That's still the separate, riskier follow-up.
--
-- Policies mirror the existing project_organizers pattern exactly
-- (007_scoped_roles.sql): read is open to any authenticated user (club
-- names aren't sensitive), writes are admin-only via the same is_admin().
--
-- projects.club_id / polygons.club_id need no new policy -- both tables
-- are already admin-only write ("admins update projects" from 007,
-- equivalent for polygons), so an admin setting club_id is already
-- covered.

create policy "read clubs" on clubs for select to authenticated using (true);
create policy "admins write clubs" on clubs for insert to authenticated
  with check (is_admin());
create policy "admins update clubs" on clubs for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "admins delete clubs" on clubs for delete to authenticated
  using (is_admin());

create policy "read club_admins" on club_admins for select to authenticated using (true);
create policy "admins write club_admins" on club_admins for insert to authenticated
  with check (is_admin());
create policy "admins delete club_admins" on club_admins for delete to authenticated
  using (is_admin());
