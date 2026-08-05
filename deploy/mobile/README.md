# Mobile delivery (Android required, iOS optional)

The Proxmox/self-hosted side (LXC 201 + 202) only covers the backend
(Supabase) and a secondary web build. The app's primary surface is the native
mobile app, and a native binary can't be hot-swapped like a static web
bundle - a Linux mini PC also physically cannot build iOS (Apple only allows
that on macOS). So mobile updates split into two paths:

| Change type                                   | Mechanism            | Where it runs |
|------------------------------------------------|----------------------|----------------|
| JS/business logic/asset changes (most updates)  | EAS Update (OTA)     | Expo's cloud, free tier |
| Native dep added/changed, or first install      | EAS Build -> new APK  | Expo's cloud, free tier |
| iOS (optional)                                  | EAS Build -> TestFlight | Expo's cloud (needs Apple Developer Program, $99/yr) |

This is the one part of the stack that isn't self-hosted, because there's no
practical self-hosted alternative for native builds/signing - EAS's free tier
covers a small club project's usage.

## One-time setup (from your dev machine, in this repo)

```bash
npx eas-cli login                 # free Expo account
npx eas-cli update:configure       # wires up expo-updates + runtime version in app.json
```

Create `eas.json` at the repo root (not committed with secrets, but the file
itself has none):

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  },
  "submit": { "production": {} }
}
```

`distribution: internal` skips the Play Store entirely - EAS gives you a
direct APK download link/QR code, which fits a private club app. Switch to
Play Store submission later if you ever want public distribution.

## Android APK (native rebuild)

Only needed on first install or when native dependencies change:

```bash
npx eas-cli build --platform android --profile preview
```

This runs on Expo's cloud builders (free tier has a monthly build quota,
plenty for infrequent native changes). It prints a download link/QR - share
that with players for sideloading (they'll need "install unknown apps"
enabled for their browser/file manager once).

## OTA updates (JS-only changes) - the main "auto-update from repo" path

Get a non-interactive access token: https://expo.dev/accounts/<you>/settings/access-tokens

On LXC 202, put it in the env file already scaffolded by
`deploy/app/deploy-web.sh`:

```bash
echo 'EXPO_TOKEN=<your token>' > /etc/airsoft-economy/update.env
```

`deploy/app/update.sh` (run every 5 min by the `airsoft-update.timer`
installed earlier) already checks for `EXPO_TOKEN` and, when set, runs:

```bash
eas update --branch production --non-interactive --message "auto-deploy <sha>"
```

Players' installed app checks for a new OTA bundle on launch and applies it
automatically - no reinstall needed, as long as the change didn't touch
native code.

## iOS (optional)

Requires an Apple Developer Program membership. When you have one:

```bash
npx eas-cli build --platform ios --profile preview
npx eas-cli submit --platform ios   # ships to TestFlight
```

There's no path to build or notarize iOS from the Proxmox box - this always
goes through EAS's cloud macOS builders.
