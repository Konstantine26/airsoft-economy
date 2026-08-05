#!/usr/bin/env bash
# Invoked every 5 min by airsoft-update.timer on the "app-edge" LXC (202).
# No-ops unless origin/master has new commits, unless FORCE=1 (used by the
# `update` command - see deploy/app/update-cli.sh).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/airsoft-economy}"
cd "$APP_DIR"

git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)

if [ "$LOCAL" = "$REMOTE" ] && [ "${FORCE:-0}" != "1" ]; then
  exit 0
fi

echo "$(date -u +%FT%TZ) updating $LOCAL -> $REMOTE"
git merge --ff-only origin/master

npm ci
npx expo export --platform web --output-dir dist
systemctl reload caddy

# OTA update for the mobile app (JS/asset-only changes) - see deploy/mobile/README.md
# for how EXPO_TOKEN gets into this environment. Skips quietly if not configured.
if command -v eas >/dev/null 2>&1 && [ -n "${EXPO_TOKEN:-}" ]; then
  eas update --branch production --non-interactive --message "auto-deploy $REMOTE"
else
  echo "EAS not configured - skipping OTA publish (native rebuild still needed for native changes anyway)"
fi

echo "$(date -u +%FT%TZ) update complete"
