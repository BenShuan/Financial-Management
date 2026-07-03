# Deployment Runbook

Live setup: **Vercel** (web) + **Render** (API) + **Neon** (Postgres). Production deploys from `main`.

## Render — API (`render.yaml` Blueprint)

- Free web service, built from the repo root (pnpm workspace install requires it — no `rootDir`).
- **Node is pinned to 22.16.0** via `NODE_VERSION` in the blueprint (plus a root `.node-version` for local tooling). Do not loosen this to a range: Render resolves `engines: ">=20"` to the newest Node, and Node 25 removed corepack, which breaks the build's first step.
- Build: corepack + `pnpm@9.15.0`, install with `--prod=false` (Render sets `NODE_ENV=production`, which would skip the devDependencies needed to compile), then build `shared` and `api`.
- **Migrations run at boot**, not at build: `apps/api/src/index.ts` awaits `runMigrations()` (drizzle-orm's programmatic migrator over the committed `apps/api/drizzle/` folder) before listening. A bad/unreachable `DATABASE_URL` exits non-zero, so the deploy fails fast and the previous version keeps serving. The build itself needs no `DATABASE_URL`.
- Start: `node apps/api/dist/index.js` — no pnpm/corepack at runtime.
- Health check: `GET /api/health`. Deliberately shallow (no DB ping): Render polls it constantly and free-tier Neon auto-suspends, so a DB-dependent check would flap the service. Boot-time migration already proves the DB was reachable at startup.

### Environment variables (Render dashboard, all `sync: false`)

| Var | Value |
| --- | --- |
| `DATABASE_URL` | Neon connection string — **must include `?sslmode=require`** (there is no code-level ssl config; `pg` reads it from the URL) |
| `WEB_ORIGIN` | Vercel origin(s), comma-separated, no trailing slash, e.g. `https://your-app.vercel.app` |
| `ACCESS_SECRET` | Temporary bearer-token gate for all `/api/*` except `/api/health` |

### If a deploy fails

Use **Manual Deploy → Clear build cache & deploy** — this also rules out a stale corepack/pnpm cache from earlier failed builds.

## Neon — database

- Free tier; the API applies migrations automatically at boot.
- **One-time seed** (fresh database only) — run locally against Neon:

  ```sh
  DATABASE_URL='<neon-url-with-sslmode=require>' pnpm --filter @financial-management/api db:seed
  ```

  Until the seed runs, every `/api/*` route except `/api/health` returns **503** ("run pnpm db:seed") because the dev-auth stub needs a seeded owner. The API self-heals the moment the seed lands — no restart needed. The seed is idempotent (skips if the dev user exists) but inserts sample data; that's fine for this personal deployment, don't auto-run it in code.

## Vercel — web

- Root directory `apps/web`, config in `apps/web/vercel.json` (SPA rewrite, builds `packages/shared` first).
- Env var (build-time): `VITE_API_ORIGIN` = the Render service URL, no trailing slash. It is baked into the bundle — **redeploy the web app after changing it**. If unset, the deployed app silently calls `localhost:8787`.

## Post-deploy smoke test

```sh
curl https://<service>.onrender.com/api/health                        # 200
curl -H "Authorization: Bearer $ACCESS_SECRET" \
     https://<service>.onrender.com/api/me                            # 200 after seed; 503 before
```

Then open the Vercel app, enter the access key, and confirm the dashboard loads (exercises CORS + gate end-to-end). First request after idle is slow — the free Render instance spins down.
