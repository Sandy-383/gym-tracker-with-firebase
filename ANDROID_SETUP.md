# Installing Gym Tracker on a phone over USB

The web app at https://sandy-383.github.io/gym-tracker-with-firebase/ is already
installable straight from Chrome, and needs none of this. Use this document when
you want a **real Android app** — its own entry in the app drawer, not a browser
window.

Two ways to get it onto a phone:

- **Cable** — phone plugged into the computer, one command, app installs and
  launches. Best when the phone is in front of you.
- **APK file** — build once, send the file. Best when it is not.

Both need the toolchain in step 1.

---

## 1. One-time: install the toolchain

You need three things. Check what you already have:

```bash
node --version     # need v22 or newer
java -version      # need 21 exactly
adb --version      # part of the Android SDK platform-tools
```

### Node.js
**v22 minimum.** `@capacitor/cli` declares `engines.node >= 22.0.0`, and on Node
20 `npx cap sync` fails rather than warning. If `node --version` says 20 or
lower, update from https://nodejs.org (LTS) before anything else — this is the
first thing to check when the build misbehaves.

### JDK 21
This project builds with Gradle 8.14.3 against `compileSdk 36`, which needs
**JDK 21**. JDK 17 will fail, and so will 24.

Easiest source is https://adoptium.net (Temurin 21, `.msi` on Windows). During
install, tick **Set JAVA_HOME**. Then in a *new* terminal:

```bash
java -version          # should say 21.x
echo $JAVA_HOME        # PowerShell: echo $env:JAVA_HOME
```

### Android SDK
You do not need all of Android Studio, but it is by far the least painful way to
get a correct SDK. Install it from https://developer.android.com/studio, open it
once, and let it finish the first-run download.

Then set `ANDROID_HOME` so Gradle can find the SDK. Default locations:

| OS | Path |
|---|---|
| Windows | `%LOCALAPPDATA%\Android\Sdk` |
| macOS | `~/Library/Android/sdk` |
| Linux | `~/Android/Sdk` |

PowerShell, permanently:

```powershell
[Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
```

Add `platform-tools` to your `PATH` too, so `adb` works from anywhere. Open a new
terminal and confirm:

```bash
adb --version
```

> Instead of `ANDROID_HOME` you can create `android/local.properties` containing
> `sdk.dir=C\:\\Users\\YOU\\AppData\\Local\\Android\\Sdk`. It is gitignored, so it
> stays on your machine. `ANDROID_HOME` is less fuss.

### Project dependencies

From the repo root, once:

```bash
npm install
```

---

## 2. One-time: turn on USB debugging on the phone

This is per phone, and it applies to your friend's phone too.

1. **Settings → About phone** → tap **Build number** seven times. It says
   "You are now a developer".
2. **Settings → System → Developer options** → turn on **USB debugging**.
3. Plug the phone into the computer with a data cable. Charge-only cables will
   not work.
4. The phone shows **"Allow USB debugging?"** — tick *Always allow* and accept.
   If no dialog appears, pull down the USB notification and switch the mode from
   *Charging* to **File transfer (MTP)**, then unplug and replug.

Confirm the computer can see it:

```bash
adb devices
```

You want a line ending in `device`:

```
List of devices attached
R58M1234ABC     device
```

- `unauthorized` → the dialog on the phone has not been accepted yet.
- Empty list → cable, port, or MTP mode. Try a different cable first; it is
  usually the cable.

---

## 3. Install over the cable

```bash
npm run android:install
```

That copies the web files into `www/`, runs `npx cap sync android` to generate
the Capacitor glue, builds a debug APK, installs it, and launches it. First run
downloads Gradle and the Android build tools, so expect several minutes; later
runs take well under one.

If more than one device is connected it will ask which to use. To see the list
yourself:

```bash
npm run android:devices
```

---

## 4. Or build an APK to send

```bash
npm run android:apk
```

Prints the path to the built file, which is:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Send it however you like. On the receiving phone, opening it triggers
**"install unknown apps"** — that permission is granted per *source* app, so they
grant it to whatever they opened the file from (Files, Drive, WhatsApp), not to
Gym Tracker itself. No USB debugging needed on their side.

---

## After changing the web app

`android/` contains no copy of the site; it is generated. So after editing
`index.html`, `script.js`, `styles.css` or anything else at the repo root:

```bash
npm run android:install     # re-syncs and reinstalls
```

Editing files under `android/app/src/main/assets/public/` directly is pointless —
`cap sync` overwrites that folder every time.

---

## Notes

**Sign-in works in the APK.** Capacitor serves the app from `https://localhost`
inside the WebView, and `localhost` is already in the Firebase authorised-domains
list, so email/password sign-in behaves exactly as it does on the web. Your
allowlist and your data are the same — this is the same Firebase project
(`gym-tracker-c1754`), not a separate copy.

**No CDN needed.** Chart.js and the Firebase SDKs are served from `vendor/` in
the repo, so they are packaged inside the APK. The app opens on a phone with no
signal, and gym basement Wi-Fi cannot break it.

**These are debug builds.** Fine for installing on your own and your friend's
phones, and the debug signing key is generated automatically. Two consequences:

- Android will refuse to install a debug build over a release build of the same
  app, or a build signed with a different key. Uninstall first if it complains
  about signatures.
- Debug APKs are larger and slower than release builds. Only worth caring about
  if you later want to put this on Google Play, which needs a real keystore and a
  developer account.

**Updating people who have the APK.** There is no store, so nothing notifies
them. Either re-run the cable install, or send them a new APK. The repo also
contains an unused hook for this — see `gymTracker/appVersion` in
`database.rules.json` on the friend's branch — but it is not wired up here.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `npx cap sync` fails, often with no clear reason | Node older than 22. Check `node --version` first — this is the most common cause and the error it gives is unhelpful. |
| `SDK location not found` | `ANDROID_HOME` unset and no `android/local.properties`. See step 1. |
| `Unsupported class file major version` / toolchain errors | Wrong JDK. Needs 21; check `java -version`. |
| `adb devices` empty | Cable is charge-only, or phone is not in File transfer mode. |
| `adb devices` says `unauthorized` | Accept the USB debugging prompt on the phone. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | An existing install is signed with a different key. Uninstall Gym Tracker on the phone, then retry. |
| `cap: command not found` | `npm install` has not been run. |
| App opens but shows "Can't reach the server" | Firebase could not initialise. Almost always no network on first launch — the SDKs themselves are bundled, but auth needs to reach Google. |
| Web changes are not showing in the app | `npm run android:install` again. Editing `assets/public/` by hand does nothing. |
