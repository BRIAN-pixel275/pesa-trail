# Pesa Trail

A mobile-friendly, installable money tracker for recording M-PESA transactions, remembering what spending was for, and seeing where money came from.

## What it does

- Track money in and money out, with the sender, payee or a personal note.
- Assign income to sources such as **Parents**, **Small hustle** or your own custom sources.
- Categorize spending and split an expense across more than one source.
- Review monthly or all-time totals, source balances and spending by category.
- Paste M-PESA confirmation messages, review parsed transactions, and save them after checking their details.
- On Android, read M-PESA confirmation messages straight from the phone's SMS inbox (the last 60 days by default) and review them before saving.
- Run as a native Android app (built with Capacitor) as well as in the browser.
- Search and filter transaction history; edit saved transactions at any time.
- Optionally protect the app screen with a six-digit PIN; the app locks on reload and can be locked manually.
- Install Pesa Trail as a Progressive Web App (PWA) on supported browsers.
- Export transactions as a CSV spreadsheet for Excel or Google Sheets.
- Download and restore a JSON backup to preserve the complete local dataset.

## Privacy and data

Pesa Trail stores transaction and source data in the browser on your device using IndexedDB (Dexie). Pasted M-PESA messages are parsed in the browser and are not uploaded. There is no account or cloud sync.

In the Android app, Pesa Trail asks for permission to read SMS. It only requests messages from the `MPESA` sender, parses them on the device, and never uploads them. Nothing is saved until you review and confirm each transaction. The Android app and the browser version keep separate data, so move data between them with a JSON backup.

Because your data is stored on your device, it is not automatically shared with other devices and may be lost if the browser's site data is cleared or the app is uninstalled. Use **JSON backup** regularly and keep the exported JSON file somewhere safe. A backup contains your transaction history and sources and should be treated as private financial information. **Export CSV** creates a readable transaction spreadsheet; use JSON backups to restore app data.

The optional app PIN is stored as a salted verifier and is a privacy screen, not encryption. It can deter casual viewing but does not prevent someone with access to browser developer tools or the device's browser data from reading the locally stored records. The PIN is not included in JSON backups.

The CSV includes the transaction date and ID, type, description, category, amount, fee, total, source names, and source allocation details for split expenses.

The dashboard totals are based only on transactions recorded in Pesa Trail; they are not a live M-PESA balance.

## Run locally

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To create and preview the production build:

```sh
npm run build
npm run preview
```

## Android app

The Android app wraps the same web app with [Capacitor](https://capacitorjs.com) and adds the ability to read M-PESA messages from the phone.

Requirements: Android Studio (it installs the Android SDK), and an Android phone with USB debugging turned on.

```sh
npm install
npm run build
npx cap sync android
```

Tell Gradle where the Android SDK is by creating `android/local.properties`:

```properties
sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk
```

Build the APK and install it on a connected phone:

```sh
cd android
./gradlew assembleDebug
cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Notes:

- The app needs the `READ_SMS` permission, declared in `android/app/src/main/AndroidManifest.xml`.
- On Samsung phones, turn off **Auto Blocker** while installing from a computer. Android may also restrict the SMS permission for apps installed outside the Play Store; if it is greyed out, open the app's info page and choose **Allow restricted settings**.
- SMS reading uses `capacitor-sms-inbox`, which declares support for Capacitor 7. On this Capacitor 8 project, install it with `npm i capacitor-sms-inbox --legacy-peer-deps`.
- After each code change, run `npm run build` and `npx cap sync android`, then rebuild and reinstall.

## Install on a device

Open the deployed app in a supported browser and select **Install app**. If the browser does not provide an install prompt, use its menu to choose **Install app** or **Add to Home Screen**. On iPhone or iPad, open the app in Safari, tap **Share**, and select **Add to Home Screen**.

The install option requires the app to be served from HTTPS, or from localhost during development. PWA installation availability depends on the browser and device.

## Publishing updates

The Vercel project is connected to this GitHub repository. Push changes to the configured production branch (typically `main`) to trigger a Vercel production deployment. Once deployed, the PWA service worker automatically installs the updated app on supported browsers. The footer displays the app version (for example, `Version v1.0.0`). Increase the `version` in `package.json` for each release (for example, `1.0.0` to `1.1.0`) so the deployed app shows the new version. Preview deployments for other branches do not replace the production deployment.

In the browser, the version is shown inside Pesa Trail. For the Android app, also update `versionName` (and increase `versionCode`) in `android/app/build.gradle` so the new version appears in the phone's **App info** screen.

## Importing M-PESA messages

**On Android**, tap **Read from my phone** to load M-PESA messages from the SMS inbox. It reads the last 60 days (up to 1,000 messages), skips receipts you have already saved, and shows the rest in the same review screen as pasted messages. Messages older than that window are not read, so check at least once a month.

**In any browser**, copy one or more M-PESA confirmation messages and paste them into **Import SMS**.

Check each detected transaction before saving it:

- Confirm the source for incoming money.
- Select the category for expenses.
- Assign expenses to one or more sources. The allocation must equal the transaction amount plus its M-PESA fee.
- Previously imported receipt IDs are skipped.

Import support depends on the wording and format of the M-PESA confirmation. Unsupported messages can be recorded manually.

## Tests

Run the test suite with:

```sh
npm test
```

## Build by

Brian -- founder kreative studio