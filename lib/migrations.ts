// Source of truth for "which migration files should exist on a healthy
// server". Mirrors supabase/*.sql exactly -- there's no way for the mobile
// client to read the repo's filesystem at runtime, so this list has to be
// kept in sync by hand.
//
// When adding supabase/0NN_something.sql, add its filename here too, or
// AdminMigrationsTab will never show it (it just won't appear as a row --
// nothing breaks, but the monitor stops being trustworthy for that file).
export const EXPECTED_MIGRATIONS: string[] = [
  'schema.sql',
  '002_roles_and_games.sql',
  '003_admin_bootstrap.sql',
  '004_fix_role_trigger.sql',
  '005_personal_wallets.sql',
  '006_polygons.sql',
  '007_scoped_roles.sql',
  '008_project_scoped_economy.sql',
  '009_player_avatars.sql',
  '010_game_details.sql',
  '011_open_registration.sql',
  '012_side_roster_visibility.sql',
  '013_tasks.sql',
  '014_optional_task_reward.sql',
  '015_team_avatars.sql',
  '016_fix_task_returning_rls.sql',
  '017_trader_charge.sql',
  '018_closed_projects.sql',
  '019_team_join_requests.sql',
  '020_single_team_join_request.sql',
  '021_team_creation_requests.sql',
  '022_disband_team.sql',
  '023_creation_request_cleanup.sql',
  '024_migrations_status.sql',
];
