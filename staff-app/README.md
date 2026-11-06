# Staff Portal App

A staff self-service app served by the POS backend at **`/staff`** (no separate
build or hosting needed — it lives in `server/public/staff/`).

Staff can sign in with their name + a PIN that a manager sets on their staff
record (Staff → Add/Edit → "Staff App PIN"). They see their own attendance,
staff purchases, advances, earnings, and salary slips.

It works **online** (over your hosted URL) and **offline on LAN** (over
`http://<server-ip>:5000/staff`). The installed app caches the last loaded
month so it still opens when the network is flaky — but the LAN/server must be
reachable for fresh data.

---

## Install (no app store needed) — works today

On the staff member's phone:

| Platform | Steps |
|----------|-------|
| **Android** | Open `http://<server-ip>:5000/staff` (or your domain) in **Chrome** → menu ⋮ → **Install app** / **Add to Home screen** |
| **iPhone / iPad** | Open the URL in **Safari** → Share → **Add to Home Screen** |
| **Desktop** | Open the URL in **Chrome/Edge** → install icon in the address bar |

The app then launches full-screen like a native app and uses the same URL, so
LAN installs keep working offline (no internet needed as long as the POS
server is running).

---

## Real APK file (Android)

Two options once the app is served on a reachable URL:

### Option A — Bubblewrap / TWA (recommended for hosted deployments)

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR-SERVER/staff/manifest.webmanifest
bubblewrap build        # produces app-release-signed.apk
```

Distribute the APK directly to staff phones. TWA apps render the live URL, so
they always show the current app — no rebuild needed for code changes.

**Automatic download on the login page:** rename the built APK to
`staff-portal.apk` and drop it into `server/public/staff/`. The Android button
on the staff login page then downloads it directly. If the file is missing,
the button falls back to the browser's PWA install prompt.

### Option B — Capacitor

The `capacitor.config.json` in this folder points `server.url` at the live
staff URL. Update `url` and `appId`, then:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap sync
npx cap open android    # opens Android Studio → Build → Build APK
```

> For **offline LAN** deployments, use the PWA install instead of an APK —
> a packaged app must be pointed at one fixed URL, while each LAN site has a
> different server IP.

---

## iOS

Apple does not allow installing apps outside the App Store. For iPhone staff:

- **PWA (Add to Home Screen)** — works today, no Mac or developer account.
- **Real iOS build** — `npx cap add ios` then build in **Xcode on a Mac**,
  which requires an Apple Developer account ($99/yr) for device installs.

---

## Desktop

- PWA install from Chrome/Edge (address-bar install button), or
- wrap the `/staff` URL in the existing Electron setup the POS already uses.
