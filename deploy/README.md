# Deploying airsoft-economy on a home Proxmox server

Target hardware assumed: Intel N150 mini PC, 16 GB RAM. Everything here is
meant to be copy-pasted and run by hand - there's no CI/CD, just two LXC
containers that poll their own git repo every 5 minutes and update
themselves.

## Topology

```
Proxmox host
├── LXC 201 "supabase"   (2 vCPU / 6 GB RAM / 32 GB disk)
│     Docker + self-hosted Supabase (Postgres, GoTrue auth, PostgREST,
│     Storage, Realtime, Kong gateway, Studio admin UI)
│     + this repo checked out at /opt/airsoft-economy (just for supabase/*.sql)
│
└── LXC 202 "app-edge"    (2 vCPU / 2 GB RAM / 10 GB disk)
      Node.js + Caddy serving the Expo *web* export (secondary/organizer
      surface)

Your existing nginx LXC/VM (already port-forwarded, already has a domain +
HTTPS) reverse-proxies api.example.com -> LXC 201 and app.example.com ->
LXC 202 - see deploy/nginx/README.md. No tunnel needed on top of that.
```

The mobile app (the primary surface) doesn't live on either container - see
`deploy/mobile/README.md`. It talks directly to `api.example.com` (your
existing nginx, which forwards to LXC 201's Kong gateway) from wherever
players are.

Why two containers instead of one: Supabase's stack is the heaviest, most
stateful piece (the actual database) - keeping it in its own LXC means you
can reboot/rebuild the web-serving container without ever touching the DB,
and vice versa.

## Order of operations

The repo is public specifically so these can be plain `curl | bash`
one-liners, the same pattern as Proxmox VE Community Scripts. Each one both
creates the LXC and fully provisions it - nothing left to configure by hand
inside the container.

1. **Supabase LXC** - on the Proxmox host shell:
   ```bash
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master/deploy/proxmox/install-supabase-lxc.sh)"
   ```
   Prompts for the domain the API will live on (e.g. `api.example.com`) if
   you don't export `API_DOMAIN` beforehand. Creates LXC 201, installs
   Docker, brings up self-hosted Supabase, clones the repo, runs
   `supabase/schema.sql` + every `supabase/NNN_*.sql` migration once
   (idempotently - re-running is safe), and installs `airsoft-migrate.timer`
   so future `supabase/0NN_*.sql` pushes to `master` apply automatically
   within 5 minutes.

   It prints the generated `ANON_KEY` and saves all secrets to
   `/root/supabase-secrets.env` inside the container -
   **copy that file somewhere safe**, it's the only copy:
   ```bash
   pct exec 201 -- cat /root/supabase-secrets.env
   ```

2. **App-edge LXC** - on the Proxmox host shell, once step 1 has printed its
   `ANON_KEY`:
   ```bash
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master/deploy/proxmox/install-app-edge-lxc.sh)"
   ```
   Prompts for the Supabase URL and `ANON_KEY` from step 1 if not exported
   beforehand. Creates LXC 202, installs Node + Caddy, clones the repo,
   builds `expo export --platform web`, serves it, and installs
   `airsoft-update.timer` - future pushes to `master` get pulled, rebuilt,
   and hot-reloaded into Caddy automatically every 5 minutes (plus an OTA
   publish to the mobile app, once EAS is wired up - step 4).

   Non-interactively (e.g. scripting this), export the answers instead:
   ```bash
   SUPABASE_URL=https://api.example.com SUPABASE_ANON_KEY=<paste> \
     bash -c "$(curl -fsSL https://raw.githubusercontent.com/Konstantine26/airsoft-economy/master/deploy/proxmox/install-app-edge-lxc.sh)"
   ```

3. **External access** - follow `deploy/nginx/README.md` (run on your
   existing nginx LXC/VM: two more server blocks + `certbot`, using the IPs
   from steps 1-2). Result: `https://api.example.com` and
   `https://app.example.com` reachable from anywhere, Supabase Studio stays
   LAN-only.

   (`deploy/cloudflared/` is an alternative to this step for setups
   *without* their own port-forwarded reverse proxy + domain - not needed
   here since nginx already covers it.)

4. **Mobile app** - follow `deploy/mobile/README.md` from your dev machine:
   one-time EAS login + first APK build, then drop an `EXPO_TOKEN` into LXC
   202 so the update timer can publish OTA updates automatically going
   forward.

## Day-to-day after this is set up

- Push to `master` -> within 5 minutes: web export rebuilt, OTA update
  published to the mobile app, and any new `supabase/*.sql` migration
  applied. Nothing to do by hand.
- Native mobile changes (new native dependency) still need a manual
  `eas build` (see mobile README) - OTA can't ship those.
- Rotate `/root/supabase-secrets.env` credentials and Supabase Studio's
  dashboard password if this box is ever exposed beyond your control.

### Manual updates

Don't want to wait for the 5-min timer, or want to pick up OS security
patches / newer Supabase Docker images (the timers only handle *this repo's*
code and SQL, not the underlying OS/images)? Enter either container and run
`update`:

```bash
pct enter 201   # supabase
update          # apt upgrade + docker compose pull/up + run pending migrations

pct enter 202   # app-edge
update          # apt upgrade + forced rebuild of the web export/OTA, even with no new commits
```

## Before relying on this for real games

`supabase/schema.sql`'s RLS policies are intentionally wide open
(`using (true)` for anon read/write) with a comment flagging this as a
prototype shortcut. That was fine while Supabase Cloud project URLs weren't
guessable; once `api.example.com` is public, review those policies - this is
called out again in `deploy/nginx/README.md`.
