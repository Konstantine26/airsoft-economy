#!/usr/bin/env bash
# Run this INSIDE the "supabase" LXC (201): pct exec 201 -- bash /root/migrate.sh
#
# Idempotent migration runner: applies supabase/schema.sql then supabase/NNN_*.sql
# (in numeric order) from this project's repo against the self-hosted Postgres,
# skipping files already recorded in the _migrations_applied table.
#
# Safe to re-run any time (e.g. from the auto-update cron) - only new files run.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/airsoft-economy}"
SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase}"

cd "$APP_DIR"
git pull --ff-only

psql_exec() {
  docker compose -f "$SUPABASE_DIR/docker/docker-compose.yml" exec -T db \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

psql_exec -c "create table if not exists public._migrations_applied (filename text primary key, applied_at timestamptz not null default now());"

apply_if_new() {
  local file="$1"
  local name
  name=$(basename "$file")
  local already
  already=$(psql_exec -tAc "select 1 from public._migrations_applied where filename = '${name}';")
  if [ "$already" = "1" ]; then
    echo "skip  $name (already applied)"
    return
  fi
  echo "apply $name"
  psql_exec -f - < "$file"
  psql_exec -c "insert into public._migrations_applied (filename) values ('${name}');"
}

apply_if_new "$APP_DIR/supabase/schema.sql"

# supabase/002_*.sql, 003_*.sql, ... in ascending numeric order
for f in $(ls "$APP_DIR"/supabase/[0-9]*.sql 2>/dev/null | sort -V); do
  apply_if_new "$f"
done

echo "Migrations up to date."
