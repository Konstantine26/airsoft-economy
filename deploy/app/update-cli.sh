#!/usr/bin/env bash
# Installed as `/usr/local/bin/update` inside the "app-edge" LXC (202) by
# deploy-web.sh. Run it any time - e.g. `pct enter 202` then `update` - to
# force an OS patch + rebuild, instead of waiting for the 5-min timer.
set -euo pipefail

echo "== OS packages =="
apt-get update && apt-get upgrade -y

echo "== App rebuild (forced, even with no new commits) =="
FORCE=1 /opt/airsoft-economy/deploy/app/update.sh

echo "Done."
