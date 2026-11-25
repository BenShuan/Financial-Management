# Bank sync (local app)

Fetches transactions from Israeli bank and credit-card websites on **your own computer** and uploads them to the Financial-Management API. Your bank credentials are stored encrypted on this computer only and are never sent to the server. This app is never deployed.

Supported in v1: **Discount** (bank), **Isracard** and **Max** (cards). Providers that need an SMS/OTP code are not supported.

## Requirements

- Node **22.22.2 or newer** (checked at startup).
- Google Chrome or Microsoft Edge installed (no browser is downloaded). If it is not found, set `FM_BROWSER_PATH` to the browser executable.
- A household account with role **admin** or **owner** in the web app.

## Run

From the repo root:

```sh
pnpm install
pnpm --filter @financial-management/shared build
pnpm --filter @financial-management/bank-sync local    # runs from source with tsx
# or: pnpm --filter @financial-management/bank-sync build && pnpm --filter @financial-management/bank-sync start
```

The app prints a URL like `http://127.0.0.1:5199/?t=...` and opens it in your browser. Keep the terminal open while you use it; press Ctrl+C to stop (this also locks the vault).

## Use

1. **כספת מקומית:** create a vault passphrase (first run) or unlock it. The passphrase is not stored and cannot be recovered; if you lose it, delete `vault.enc.json` and start over.
2. **חיבור לשרת:** enter the API URL (for production, the Render URL), your email and app password. Only the session token (valid 30 days) is kept, inside the vault.
3. **פרטי כניסה:** save credentials for each provider you use.
4. **סנכרן עכשיו:** scrapes each provider once and uploads the results.
5. New account/card numbers appear in the web app under **עוד > סנכרון בנקים** (`/sync`). Link each one to an app account (or hide it), then sync again: the app re-scans the same window until every account is linked, so nothing is lost.

The first sync looks back 90 days (setting "ימים לסריקה בסנכרון ראשון"); later syncs start 14 days before the last successful one. Re-syncing never creates duplicates. If you imported CSV files earlier, set the first lookback so it starts after your last CSV import: bank sync does not dedupe against CSV rows.

## Data and environment

Local data (encrypted `vault.enc.json`, non-secret `config.json`) lives in:

- Windows: `%APPDATA%\fm-bank-sync`
- macOS: `~/Library/Application Support/fm-bank-sync`
- Linux: `~/.config/fm-bank-sync`

Optional env vars: `FM_SYNC_PORT` (default 5199; a free port is used if busy), `FM_BROWSER_PATH`, `FM_SHOW_BROWSER=1` (show the browser window, e.g. to debug a provider), `FM_BANK_SYNC_DIR` (data dir override), `FM_API_ORIGIN` (default API URL on the page).

## Security model

- The server listens on `127.0.0.1` only, rejects other `Host` headers, and requires a per-launch token on every API call from the page.
- Credentials are write-only: the page only shows whether they are saved.
- Credentials and the session token are never logged. The scraper runs without debug output or screenshots.
- The app does no money logic: it sends signed amounts as decimal strings and the API decides type, dates, dedupe and balances.

## Development

```sh
pnpm --filter @financial-management/bank-sync typecheck
pnpm --filter @financial-management/bank-sync test   # scraper is mocked; no browser or bank login
pnpm --filter @financial-management/bank-sync lint
```
