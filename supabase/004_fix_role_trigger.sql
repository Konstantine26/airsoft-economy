-- Airsoft Economy: fix protect_profile_role
-- Run after supabase/003_admin_bootstrap.sql.
--
-- Bug: auth.uid() is NULL for direct SQL (SQL Editor, service role), not
-- just for anonymous PostgREST requests. The original trigger treated
-- "auth.uid() is null" the same as "not admin" and silently reverted any
-- role change made from the SQL Editor -- including the admin bootstrap
-- UPDATE. Only revert when the change actually came through PostgREST as
-- a non-admin authenticated user (auth.uid() is not null).

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  return new;
end;
$$;

-- Re-run the bootstrap now that the trigger no longer blocks it.
update profiles
set role = 'admin', must_change_password = false
where id = (select id from auth.users where email = 'admin@airsoft-economy.local');
