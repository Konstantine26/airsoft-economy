# External access via Cloudflare Tunnel

No port-forwarding on your home router, no exposed home IP, free TLS. Runs
inside the "app-edge" LXC (202) and reaches the "supabase" LXC (201) over the
internal Proxmox network.

## Prerequisites

- A domain added to a (free) Cloudflare account, with Cloudflare set as the
  domain's nameservers.

## Steps (run inside LXC 202)

```bash
# 1. Install cloudflared - one-liner, from the Proxmox host:
#   pct exec 202 -- bash -c "$(curl -fsSL https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master/deploy/cloudflared/install-cloudflared.sh)"
# (or run the same curl|bash directly if you're already inside the container, e.g. via `pct enter 202`)

# 2. Authenticate (opens a URL - open it on any machine's browser, pick the domain)
cloudflared tunnel login

# 3. Create the tunnel (prints a tunnel ID, writes ~/.cloudflared/<id>.json)
cloudflared tunnel create airsoft-economy

# 4. Copy deploy/cloudflared/config.yml.example to /etc/cloudflared/config.yml,
#    fill in <TUNNEL-ID>, your domain, and LXC 201's IP address.
mkdir -p /etc/cloudflared
cp /opt/airsoft-economy/deploy/cloudflared/config.yml.example /etc/cloudflared/config.yml
$EDITOR /etc/cloudflared/config.yml

# 5. Point DNS at the tunnel for both hostnames
cloudflared tunnel route dns airsoft-economy api.example.com
cloudflared tunnel route dns airsoft-economy app.example.com

# 6. Install as a service
cloudflared service install
systemctl enable --now cloudflared
```

## Result

- `https://api.example.com` -> Supabase's Kong gateway on LXC 201 (this is
  what `EXPO_PUBLIC_SUPABASE_URL` should point to for both the web build and
  the mobile app, see deploy/mobile/README.md).
- `https://app.example.com` -> the static web export on LXC 202 (Caddy).
- Supabase Studio (LXC 201, port 3000) stays unreachable from the internet on
  purpose - it's a full database admin panel. Reach it over LAN, or set up
  Tailscale/WireGuard if you need it while away from home.

## Security note

`supabase/schema.sql` currently ships very permissive RLS policies
(`anon read/write` on core tables) with a comment saying to tighten them
"before shipping real money/inventory tracking". That was a reasonable
shortcut while the project only lived in a private Supabase Cloud project;
once `api.example.com` is reachable from the public internet, those open
policies are the actual security boundary for the in-game economy. Worth
reviewing `supabase/*.sql` for `using (true)` / `with check (true)` policies
before going live with external access.
