-- Airsoft Economy: forced password change flag for seeded accounts
-- Run after supabase/002_roles_and_games.sql.

alter table profiles add column if not exists must_change_password boolean not null default false;

-- Let a signed-in user clear their own flag once they've changed their
-- password (the general "update own profile" policy from 002 already
-- covers this column, this comment is just documentation).

-- ============================================================
-- One-time bootstrap: after creating the admin account in the Supabase
-- dashboard (Authentication -> Users -> Add user, with "Auto Confirm
-- User" checked so no email verification is required), run this to
-- promote it to admin and force a password change on first login.
-- Replace the email below with the one you actually used.
-- ============================================================

-- update profiles
-- set role = 'admin', must_change_password = true
-- where id = (select id from auth.users where email = 'admin@airsoft-economy.local');
