#!/usr/bin/env bash
# Installed as `/usr/local/bin/update` inside the "supabase" LXC (201) by
# setup.sh. Run it any time - e.g. `pct enter 201` then `update` - to force
# an OS patch + refresh the Supabase Docker images + apply any pending
# migrations, instead of waiting for the 5-min migration timer.
set -euo pipefail

SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase}"

echo "== OS packages =="
apt-get update && apt-get upgrade -y

echo "== Supabase docker images =="
cd "$SUPABASE_DIR/docker"
docker compose pull
docker compose up -d

echo "== App repo + SQL migrations =="
/opt/airsoft-economy/deploy/supabase/migrate.sh

echo "Done."
