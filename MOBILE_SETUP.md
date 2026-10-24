# Mobile App Setup Guide

## Prerequisites (one-time setup)

### 1. Install Java JDK 17
- Download from: https://adoptium.net/ (Eclipse Temurin JDK 17)
- Install to default location
- Set environment variable:
  ```
  JAVA_HOME = C:\Program Files\Eclipse Adoptium\jdk-17.x.x.x-hotspot
  ```
  (check the actual folder name after install)

### 2. Install Android Studio
- Download from: https://developer.android.com/studio
- Install with default settings
- Open Android Studio → let it download the Android SDK automatically
- In Android Studio: Settings → Languages & Frameworks → Android SDK
  - Install "Android SDK Platform 34" (or latest)
  - Install "Android SDK Build-Tools 34" (or latest)
- Set environment variable:
  ```
  ANDROID_HOME = %LOCALAPPDATA%\Android\Sdk
  ```

### 3. Verify setup
Open a new terminal and run:
```powershell
java -version
```
You should see Java 17. If not, JAVA_HOME is not set correctly.

---

## Building the APK

### Option A: Build from command line
```powershell
# In the project root:
npm run mobile:build:debug
```

This will:
1. Build the React app (`vite build`)
2. Sync files to Android project (`cap sync android`)
3. Compile the debug APK (`gradlew assembleDebug`)

The APK will be at:
```
android\app\build\outputs\apk\debug\app-debug.apk
```

### Option B: Build from Android Studio
```powershell
npm run mobile:sync
npx cap open android
```
Then in Android Studio:
- Click **Build → Build Bundle(s)/APK(s) → Build APK(s)**
- APK will be in `android\app\build\outputs\apk\debug\`

---

## Installing on Phone

### Method 1: Direct transfer
1. Copy `app-debug.apk` to your phone (USB, Google Drive, WhatsApp, etc.)
2. On the phone, open the APK file
3. Allow "Install from unknown sources" if prompted
4. Install and open

### Method 2: ADB install (if USB debugging enabled)
```powershell
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

---

## First Launch

1. App opens to **Server Setup** screen
2. Enter your server URL:
   - **WiFi (local):** `http://192.168.18.40:5000` (your desktop machine IP + port 5000)
   - **Cloud:** `https://your-domain.com` (if you deployed the server to cloud)
3. Tap **Test Connection** to verify
4. Tap **Save & Continue**
5. You'll be taken to the login screen
6. Login with your normal credentials

To change the server later: Login page → **Change Server Settings** at the bottom

---

## How KOT Printing Works from Mobile

When a waiter creates an order on mobile:
1. Mobile app sends the order to the server API
2. Server saves the sale and generates the KOT
3. Server calls the print route (`/api/print`)
4. Server uses Puppeteer + pdf-to-printer to send to the thermal printer
5. The printer is connected to the **desktop machine** (where the server runs)

**The mobile phone does NOT need a printer.** All printing goes through the server.
This works for both KOT and bill printing.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Desktop Machine (Server)                    │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Express API │  │ MongoDB              │  │
│  │ (port 5000) │  │ (port 27017)         │  │
│  └─────────────┘  └──────────────────────┘  │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Electron App│  │ Thermal Printer      │  │
│  │ (POS UI)    │──│ (KOT + Bill printing)│  │
│  └─────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────┘
           ▲
           │ WiFi / Internet
           ▼
┌─────────────────────────────────────────────┐
│  Mobile App (Capacitor / Android)            │
│  ┌─────────────────────────────────────────┐ │
│  │ React UI (same as desktop, mobile-ready)│ │
│  │ Server URL: configurable in settings    │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

- Desktop runs the server + has the printer
- Mobile app connects to the server over WiFi or internet
- All printing happens server-side (desktop machine)
- Multiple mobile devices can connect simultaneously

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run mobile:sync` | Build React + sync to Android project |
| `npm run mobile:open` | Open Android project in Android Studio |
| `npm run mobile:build:debug` | Full build → debug APK |
| `npm run mobile:build:release` | Full build → release APK (needs signing key) |

---

## Troubleshooting

**"JAVA_HOME is not set"**
→ Install Java JDK 17 and set JAVA_HOME environment variable

**"SDK location not found"**
→ Install Android Studio and set ANDROID_HOME to the SDK path

**App opens but can't connect to server**
→ Make sure the desktop server is running (`npm run dev:server`)
→ Check the IP address is correct (run `ipconfig` on desktop to find IP)
→ Make sure both devices are on the same WiFi network
→ Check Windows Firewall allows port 5000

**KOT not printing from mobile**
→ Printing goes through the server, not the phone
→ Make sure the printer is configured in Settings on the desktop app
→ The server must be running on the desktop machine
