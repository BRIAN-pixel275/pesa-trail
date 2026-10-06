# Pesa Trail

A mobile-friendly, installable money tracker for recording M-PESA transactions, remembering what spending was for, and seeing where money came from.

## What it does

- Track money in and money out, with the sender, payee or a personal note.
- Assign income to sources such as **Parents**, **Small hustle** or your own custom sources.
- Categorize spending and split an expense across more than one source.
- Review monthly or all-time totals, source balances and spending by category.
- Paste M-PESA confirmation messages, review parsed transactions, and save them after checking their details.
- Search and filter transaction history; edit saved transactions at any time.
- Install Pesa Trail as a Progressive Web App (PWA) on supported browsers.
- Export a JSON backup or restore one later.

## Privacy and data

Pesa Trail stores transaction and source data in the browser on your device using IndexedDB (Dexie). Pasted M-PESA messages are parsed in the browser and are not uploaded. There is no account or cloud sync.

Because your data is stored in the browser, it is not automatically shared with other devices and may be lost if the browser's site data is cleared. Use **Download backup** regularly and keep the exported JSON file somewhere safe. A backup contains your transaction history and should be treated as private financial information.

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

## Install on a device

Open the deployed app in a supported browser and select **Install app**. If the browser does not provide an install prompt, use its menu to choose **Install app** or **Add to Home Screen**. On iPhone or iPad, open the app in Safari, tap **Share**, and select **Add to Home Screen**.

The install option requires the app to be served from HTTPS, or from localhost during development. PWA installation availability depends on the browser and device.

## Importing M-PESA messages

Copy one or more M-PESA confirmation messages and paste them into **Import SMS**. Check each detected transaction before saving it:

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

Brian.
