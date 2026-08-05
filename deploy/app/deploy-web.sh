#!/usr/bin/env bash
# Run this INSIDE the "app-edge" LXC (202): pct exec 202 -- bash /root/deploy-web.sh
#
# One-time setup: Node.js, Caddy, clones the repo, builds the Expo *web* export
# and serves it. This is the secondary/admin surface (organizers on a laptop);
# the primary surface is the mobile app - see deploy/mobile/README.md.
set -euo pipefail

GIT_URL="${GIT_URL:-https://github.com/Konstantine26/airsoft-economy.git}"
APP_DIR="/opt/airsoft-economy"
SUPABASE_URL="${SUPABASE_URL:?set SUPABASE_URL=https://api.example.com}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY=<ANON_KEY from supabase-secrets.env>}"

# --- Base packages ---------------------------------------------------------
# The stock Debian 12 LXC template ships without curl/git.
apt-get update
apt-get install -y ca-certificates curl gnupg git

# --- Node.js 20 ------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# --- Caddy -------------------------------------------------------------
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# --- App checkout + build -----------------------------------------------
if [ ! -d "$APP_DIR" ]; then
  git clone "$GIT_URL" "$APP_DIR"
fi
cd "$APP_DIR"

cat > .env <<EOF
EXPO_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
EOF

npm ci
npx expo export --platform web --output-dir dist

# --- Caddy config --------------------------------------------------------
# Use the copies inside the freshly-cloned repo, not wherever this script was
# pushed from - that's the version that stays in sync via git pull.
cp "$APP_DIR/deploy/app/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

# --- Auto-update timer ----------------------------------------------------
mkdir -p /etc/airsoft-economy
[ -f /etc/airsoft-economy/update.env ] || cat > /etc/airsoft-economy/update.env <<'EOF'
# Uncomment and fill in once EAS is set up (see deploy/mobile/README.md)
# to enable OTA publishing from the auto-update timer.
#EXPO_TOKEN=
EOF
chmod +x "$APP_DIR/deploy/app/update.sh"
cp "$APP_DIR/deploy/app/airsoft-update.service" /etc/systemd/system/
cp "$APP_DIR/deploy/app/airsoft-update.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now airsoft-update.timer

# --- `update` command for manual on-demand updates ------------------------
install -m 755 "$APP_DIR/deploy/app/update-cli.sh" /usr/local/bin/update

echo "Web build served by Caddy from ${APP_DIR}/dist. Update timer installed (every 5 min)."
echo "Type 'update' inside this container any time to force an OS + rebuild refresh."
