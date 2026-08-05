#!/usr/bin/env bash
# One-liner install, run ON THE PROXMOX HOST shell (after install-supabase-lxc.sh):
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master/deploy/proxmox/install-app-edge-lxc.sh)"
#
# Creates the "app-edge" LXC: Node.js + Caddy serving the Expo web export
# (secondary/organizer surface), plus a timer that rebuilds and OTA-publishes
# on every future push to the repo. Needs the ANON_KEY printed by
# install-supabase-lxc.sh.
#
# Override any of these by exporting them before running the one-liner, e.g.:
#   CTID=212 bash -c "$(curl -fsSL .../install-app-edge-lxc.sh)"
set -euo pipefail

CTID="${CTID:-202}"
HOSTNAME_LXC="${HOSTNAME_LXC:-app-edge}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"
CORES="${CORES:-2}"
MEMORY="${MEMORY:-2048}"
DISK_GB="${DISK_GB:-10}"
GIT_URL="${GIT_URL:-https://github.com/Konstantine26/airsoft-economy.git}"
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master}"

if [ -z "${SUPABASE_URL:-}" ]; then
  read -rp "Supabase API URL from the other LXC (e.g. https://api.example.com): " SUPABASE_URL
fi
if [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  read -rp "ANON_KEY (from /root/supabase-secrets.env on the supabase LXC): " SUPABASE_ANON_KEY
fi

if pct status "$CTID" >/dev/null 2>&1; then
  echo "CTID $CTID already exists (pct status). Pick a different CTID= or remove it first." >&2
  exit 1
fi

echo "--- Preparing Debian 12 template ---"
pveam update
TEMPLATE=$(pveam available --section system | grep debian-12-standard | awk '{print $2}' | sort -V | tail -1)
pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"

echo "--- Creating LXC $CTID ($HOSTNAME_LXC) ---"
pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "$HOSTNAME_LXC" \
  --cores "$CORES" \
  --memory "$MEMORY" \
  --swap 512 \
  --rootfs "${STORAGE}:${DISK_GB}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --features "nesting=1,keyctl=1" \
  --unprivileged 1 \
  --onboot 1

pct start "$CTID"
echo "Waiting for network..."
for _ in $(seq 1 30); do
  IP=$(pct exec "$CTID" -- ip -4 -o addr show eth0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 || true)
  [ -n "$IP" ] && break
  sleep 2
done
echo "LXC $CTID IP: ${IP:-unknown}"

echo "--- Fetching and running deploy-web.sh inside the container ---"
curl -fsSL "${RAW_BASE}/deploy/app/deploy-web.sh" -o /tmp/airsoft-deploy-web.sh
pct push "$CTID" /tmp/airsoft-deploy-web.sh /root/deploy-web.sh
pct exec "$CTID" -- bash -c "GIT_URL='${GIT_URL}' SUPABASE_URL='${SUPABASE_URL}' SUPABASE_ANON_KEY='${SUPABASE_ANON_KEY}' bash /root/deploy-web.sh"

echo
echo "=== Done ==="
echo "LXC $CTID IP: ${IP:-unknown} - web export served by Caddy on port 80."
echo
echo "Next: external access."
echo "Already have your own port-forwarded nginx + domain? See deploy/nginx/README.md"
echo "(two server blocks: this LXC's IP for the web app, the supabase LXC's IP for the API)."
echo "Otherwise, deploy/cloudflared/README.md sets up a tunnel instead - install one-liner:"
echo '  bash -c "$(curl -fsSL '"${RAW_BASE}"'/deploy/cloudflared/install-cloudflared.sh)"'
