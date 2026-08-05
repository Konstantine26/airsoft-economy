# External access via your existing nginx

You already have nginx running in its own LXC/VM on this Proxmox host, with
80/443 forwarded on the router and a real domain + HTTPS. That replaces
`deploy/cloudflared/` entirely - no need for a tunnel, just two more server
blocks pointing at the two LXCs created by `deploy/proxmox/install-*.sh`.

## Steps (run on your existing nginx LXC/VM)

```bash
# 1. Copy the two templates from the airsoft-economy repo and fill in
#    your real domain + the two LXCs' internal IPs (pct list / ip a on each).
curl -fsSL https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master/deploy/nginx/api.example.com.conf.example -o /etc/nginx/sites-available/api.example.com
curl -fsSL https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master/deploy/nginx/app.example.com.conf.example -o /etc/nginx/sites-available/app.example.com
$EDITOR /etc/nginx/sites-available/api.example.com   # set server_name + proxy_pass IP
$EDITOR /etc/nginx/sites-available/app.example.com   # same

# 2. Enable both sites
ln -s /etc/nginx/sites-available/api.example.com /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/app.example.com /etc/nginx/sites-enabled/
nginx -t

# 3. Get certs (adjust to however you already issue certs for other sites -
#    this assumes certbot's nginx plugin, matching a typical setup)
certbot --nginx -d api.example.com
certbot --nginx -d app.example.com

systemctl reload nginx
```

## Result

- `https://api.example.com` -> Supabase's Kong gateway on the `supabase` LXC.
  This is what `EXPO_PUBLIC_SUPABASE_URL` should point to, for both the web
  build and the mobile app (see `deploy/mobile/README.md`). If you already
  ran `deploy/proxmox/install-supabase-lxc.sh` with a different
  `API_DOMAIN`, re-run it with the real one, or just edit
  `SITE_URL` / `API_EXTERNAL_URL` / `SUPABASE_PUBLIC_URL` in
  `/opt/supabase/docker/.env` on the supabase LXC and `docker compose up -d`
  to apply.
- `https://app.example.com` -> the static web export on the `app-edge` LXC.
- Supabase Studio (port 3000 on the supabase LXC) stays off nginx on
  purpose - it's a full database admin panel. Reach it over LAN, or add a
  third server block gated behind nginx's own auth/IP allowlist if you want
  it reachable remotely too.

## Security note

`supabase/schema.sql` currently ships very permissive RLS policies
(`anon read/write` on core tables) with a comment saying to tighten them
"before shipping real money/inventory tracking". That was a reasonable
shortcut while the project only lived in a private Supabase Cloud project;
once `api.example.com` is reachable from the public internet through your
nginx, those open policies are the actual security boundary for the in-game
economy. Worth reviewing `supabase/*.sql` for `using (true)` /
`with check (true)` policies before going live with external access.
