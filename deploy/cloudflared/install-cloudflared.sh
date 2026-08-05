#!/usr/bin/env bash
# Installs the cloudflared package only. Run INSIDE the "app-edge" LXC (202)
# from the Proxmox host:
#
#   pct exec 202 -- bash -c "$(curl -fsSL https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master/deploy/cloudflared/install-cloudflared.sh)"
#
# The remaining steps (tunnel login, create, DNS, config.yml) need an
# interactive browser login and can't be one-lined - see deploy/cloudflared/README.md.
set -euo pipefail

# The stock Debian 12 LXC template ships without curl/gnupg/lsb-release.
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release

curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" > /etc/apt/sources.list.d/cloudflared.list
apt-get update
apt-get install -y cloudflared

echo
echo "cloudflared installed. Continue with deploy/cloudflared/README.md from 'cloudflared tunnel login' onward."
