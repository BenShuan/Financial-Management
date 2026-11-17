# Engineering — tech stack and monorepo

```yaml
version: 1.11.0
last_updated: 2026-11-17
breaking: "no"
```

This document is the **engineering source of truth** for how we build and run the system. **Domain** scope, entities, and workflows remain in [docs/agent/](../agent/README.md).

## Relationship to product docs

| Topic | Authority |
|--------|-----------|
| What the product does, entities, enums, workflows | `docs/agent/` (`00` → `06`) |
| Runtimes, repos layout, API shape, hosting, CI | This file |

If code contradicts `docs/agent/`, treat as a **documentation bug** until docs or code are aligned with a version bump (see [06-agent-conventions.md](../agent/06-agent-conventions.md)).

## Monorepo layout (target)

Single repository with **pnpm** workspaces (Node 20+) and **Turborepo** for build/typecheck task orchestration and caching.

```
apps/
  api/          # HTTP API only (business rules, authz, persistence)
  web/          # Responsive SPA (mobile + desktop); optional PWA later
packages/
  shared/       # Types, Zod schemas, constants safe for browser + server
  api-client/   # Optional typed fetch helpers; can be replaced by OpenAPI-generated client later
```

**Scaffold order:** `packages/*` → `apps/api` → `apps/web` (web consumes the API contract).

New apps (e.g. `apps/admin`) require an update to this document **before** scaffolding.

## Per-package decisions (locked for v1 scaffold)

| Path | Role | Stack |
|------|------|--------|
| `apps/api` | REST API, OpenAPI 3, PostgreSQL | **Node 20+**, **Hono**, **Drizzle ORM**, migrations in repo |
| `apps/web` | UI, calls API only | **Vite**, **React 19**, **TypeScript**; **React Router** (`react-router-dom` v7) for client-side routing; **Tailwind CSS** + **shadcn/ui** (Radix); **TanStack Query** for server state; **react-hook-form** + **Zod** (`@hookform/resolvers`) aligned with `packages/shared` |
| `packages/shared` | Shared validation and types | **TypeScript**, **Zod**; no Node-only imports |
| `packages/api-client` | Optional HTTP client for the web app | **TypeScript**; hand-written v1, Zod-parse responses using `packages/shared` |

**Auth (v1):** Server-side **sessions** issued by `apps/api` (decision recorded in the Notion Decisions Log). `POST /api/auth/register|login|logout`; passwords hashed with **scrypt** (Node `crypto`, no native addon). The `fm_session` cookie (HTTP-only; `Secure` + `SameSite=None` in production because web and API are on different sites, `Lax` locally) carries an opaque random token whose SHA-256 is stored in the `sessions` table (30-day expiry). Each request resolves the session to the user's **active household membership** (household + live role); there is no "first household" fallback. State-changing requests whose `Origin` is not in `WEB_ORIGIN` are rejected (CSRF), and failed logins are throttled per email. Enforce household roles **only** on the server (`requireRole`); do not trust client-side checks for authorization. Users created before password auth (e.g. the seeded owner) get a password via `pnpm --filter @financial-management/api db:set-password`.

**Contract:** Public HTTP surface documented as **OpenAPI 3** (generated from code or maintained alongside routes). Any breaking API change bumps API version or is documented in this file.

## Cross-cutting implementation rules (aligned with product)

- **IDs:** UUID or ULID consistently ([00-product-scope.md](../agent/00-product-scope.md)).
- **Money:** Decimal in DB (`NUMERIC`); in TS use string or integer minor units—never `number` for persisted amounts.
- **Time:** Store UTC; localize in UI using household timezone from domain model.
- **Audit:** Emit audit events for sensitive operations per [06-agent-conventions.md](../agent/06-agent-conventions.md).

## Local development

- **Database:** PostgreSQL 15+ via **Docker Compose** (recommended) or a cloud dev branch on Neon.
- **Environment:** `.env` / `.env.local` (gitignored); document required keys in each app’s README once scaffolded.
- Typical vars: `DATABASE_URL`, `API_ORIGIN`, `WEB_ORIGIN`, session/JWT secrets.

## Hosting and CI (free-tier friendly)

| Layer | Choice | Notes |
|-------|--------|--------|
| **CI** | **GitHub Actions** | `.github/workflows/ci.yml` runs on every PR and push to `main`: `pnpm install --frozen-lockfile`, then `lint` (ESLint 9 flat config in `eslint.config.mjs`, one `lint` script per package), `typecheck`, `test`, `build` through Turborepo; the job has a `postgres:16` service container and passes `TEST_DATABASE_URL` so the API integration tests (`*.integration.test.ts`) run against a real database (Node 22, pnpm 9.15.0 — same as `render.yaml`). Deploys stay with Vercel/Render on `main`. Private repos have monthly minute limits; public repos are more generous. |
| **Database** | **Neon** (serverless PostgreSQL) | Free tier with storage/compute limits; fine for early production. Alternative: **Supabase** (Postgres + extras) if you want managed auth/storage later—still update this table if you switch. |
| **API** | **Render** (Web Service) | Free/hobby tiers have cold starts and limits; acceptable for low-traffic personal use. Alternatives: **Fly.io**, **Railway**—document if migrated. |
| **Web** | **Cloudflare Pages** or **Vercel** | Static/Vite build output; set env for API base URL at build time. Pick one provider and document custom domain and preview deployments here when live. |
| **Secrets** | Provider dashboards + GitHub **encrypted secrets** | No paid secrets manager required at small scale. |

Limits and pricing change; verify current quotas on each vendor’s site before going live.

### Deployment (live setup)

- **Web:** **Vercel**, root directory `apps/web`, config in `apps/web/vercel.json` (SPA rewrite for React Router, builds `packages/shared` first). Production deploys from `main`; other branches get preview deploys.
- **API:** **Render** free web service, defined in `render.yaml` (Blueprint, Node pinned to 22). Builds `shared` + `api`; Drizzle migrations run **at boot** (`src/db/migrate.ts`), so the build needs no `DATABASE_URL`. Starts `node apps/api/dist/index.js`. Production deploys from `main`. Full runbook: [deployment.md](deployment.md).
- **Database:** **Neon** free tier; `DATABASE_URL` (with `?sslmode=require`) set in Render. Seed manually with `pnpm --filter @financial-management/api db:seed` against Neon.
- **Env vars:** Render — `DATABASE_URL`, `WEB_ORIGIN` (comma-separated Vercel origin(s), no trailing slash); Vercel — `VITE_API_ORIGIN` (Render URL). Examples in `apps/api/.env.example` and `apps/web/.env.example`.

## What we are not standardizing here

- Additional shadcn components beyond what the app imports (add via CLI as needed).
- PWA manifest/service worker details (deferred until needed).
- Native iOS/Android apps (out of v1 unless product scope changes).

## Changelog

- `1.11.0` (2026-11-17): Category and tag management API (create/update/archive/delete); migration `0005` adds the `categories.parent_category_id` self-FK (orphaned parents are promoted to top level first).
- `1.10.0` (2026-11-17): Household member management API (`/api/household/members`, invite links via `/api/auth/invite-info` and `/api/auth/accept-invite`); migration `0004` adds `household_members.invite_token_hash` / `invite_expires_at`. Added a shared Postgres integration-test harness (`apps/api/src/test/harness.ts`).
- `1.9.0` (2026-11-17): Added API integration tests that run the ledger SQL of `recalcAccountBalance` against Postgres, and a Postgres service container in CI. The suite is opt-in via `TEST_DATABASE_URL` (skipped when unset, so plain `pnpm test` needs no database).
- `1.8.0` (2026-11-17): Added ESLint (flat config, `typescript-eslint`, React Hooks and Fast Refresh rules for `apps/web`) and a `lint` script in every package, so the CI lint step now checks code instead of being a no-op.
- `1.7.0` (2026-11-17): Removed the temporary `ACCESS_SECRET` gate (API middleware, web `AccessGate`, Render env var); session auth is the only access control.
- `1.6.0` (2026-11-16): Real session auth replaces the dev-auth stub: register/login/logout endpoints, scrypt password hashing, DB-backed sessions in an HTTP-only cookie, household context from the authenticated membership, `User.last_login_at` updated on login. The temporary `ACCESS_SECRET` gate remains until removed separately.
- `1.5.0` (2026-11-16): Added GitHub Actions CI (`.github/workflows/ci.yml`) and root `lint`/`test` Turborepo tasks. Packages opt in by defining a `lint`/`test` script; until they do, those steps are no-ops.
- `1.4.0` (2026-07-03): Hardened Render deploy: Node pinned to 22 (`NODE_VERSION` + `.node-version`), migrations moved from build to boot, CORS accepts a normalized comma-separated `WEB_ORIGIN`, added `.env.example` files and [deployment.md](deployment.md) runbook.
- `1.3.0` (2026-07-03): Documented live deployment: Vercel (web), Render (API, `render.yaml`), Neon (DB), temporary `ACCESS_SECRET` gate until real auth.
- `1.2.0` (2026-04-04): Locked client routing to **React Router** (`react-router-dom` v7) for `apps/web`.
- `1.1.0` (2026-04-04): Scaffolded monorepo (Turborepo, `packages/api-client`); locked web stack to React 19, TanStack Query, react-hook-form + Zod, shadcn/ui + Tailwind.
- `1.0.0` (2026-04-04): Initial engineering stack and layout.
