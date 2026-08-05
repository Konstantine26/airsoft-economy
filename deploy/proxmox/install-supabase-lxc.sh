#!/usr/bin/env bash
# One-liner install, run ON THE PROXMOX HOST shell:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master/deploy/proxmox/install-supabase-lxc.sh)"
#
# Creates the "supabase" LXC (self-hosted Postgres + Auth + Storage + PostgREST
# + Kong + Studio), provisions it, runs the project's SQL migrations once, and
# installs a timer that auto-applies any new supabase/*.sql on future git pushes.
#
# Override any of these by exporting them before running the one-liner, e.g.:
#   CTID=211 API_DOMAIN=api.mydomain.com bash -c "$(curl -fsSL .../install-supabase-lxc.sh)"
set -euo pipefail

CTID="${CTID:-201}"
HOSTNAME_LXC="${HOSTNAME_LXC:-supabase}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"
CORES="${CORES:-2}"
MEMORY="${MEMORY:-6144}"
DISK_GB="${DISK_GB:-32}"
GIT_URL="${GIT_URL:-https://github.com/Konstantine26/airsoft-economy.git}"
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master}"

if [ -z "${API_DOMAIN:-}" ]; then
  read -rp "Domain the Supabase API will be reachable on (e.g. api.example.com): " API_DOMAIN
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

echo "--- Fetching and running setup.sh inside the container ---"
curl -fsSL "${RAW_BASE}/deploy/supabase/setup.sh" -o /tmp/airsoft-supabase-setup.sh
pct push "$CTID" /tmp/airsoft-supabase-setup.sh /root/setup.sh
pct exec "$CTID" -- bash -c "GIT_URL='${GIT_URL}' API_DOMAIN='${API_DOMAIN}' bash /root/setup.sh"

echo
echo "=== Done ==="
echo "LXC $CTID IP: ${IP:-unknown} - point ${API_DOMAIN} at it (see deploy/cloudflared/README.md)."
echo "ANON_KEY and other secrets are in /root/supabase-secrets.env inside LXC $CTID - copy them somewhere safe:"
echo "  pct exec $CTID -- cat /root/supabase-secrets.env"
echo
echo "Next: install the app-edge LXC with"
echo '  bash -c "$(curl -fsSL '"${RAW_BASE}"'/deploy/proxmox/install-app-edge-lxc.sh)"'
