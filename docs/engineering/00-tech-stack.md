# Engineering — tech stack and monorepo

```yaml
version: 1.2.0
last_updated: 2026-04-04
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

**Auth (v1):** Issue **sessions** (HTTP-only cookie) or **JWT** from `apps/api`; enforce household roles **only** on the server. Do not trust client-side checks for authorization.

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
| **CI** | **GitHub Actions** | Lint, typecheck, test, build on PR; deploy workflow on `main` or tags as you prefer. Private repos have monthly minute limits; public repos are more generous. |
| **Database** | **Neon** (serverless PostgreSQL) | Free tier with storage/compute limits; fine for early production. Alternative: **Supabase** (Postgres + extras) if you want managed auth/storage later—still update this table if you switch. |
| **API** | **Render** (Web Service) | Free/hobby tiers have cold starts and limits; acceptable for low-traffic personal use. Alternatives: **Fly.io**, **Railway**—document if migrated. |
| **Web** | **Cloudflare Pages** or **Vercel** | Static/Vite build output; set env for API base URL at build time. Pick one provider and document custom domain and preview deployments here when live. |
| **Secrets** | Provider dashboards + GitHub **encrypted secrets** | No paid secrets manager required at small scale. |

Limits and pricing change; verify current quotas on each vendor’s site before going live.

## What we are not standardizing here

- Additional shadcn components beyond what the app imports (add via CLI as needed).
- PWA manifest/service worker details (deferred until needed).
- Native iOS/Android apps (out of v1 unless product scope changes).

## Changelog

- `1.2.0` (2026-04-04): Locked client routing to **React Router** (`react-router-dom` v7) for `apps/web`.
- `1.1.0` (2026-04-04): Scaffolded monorepo (Turborepo, `packages/api-client`); locked web stack to React 19, TanStack Query, react-hook-form + Zod, shadcn/ui + Tailwind.
- `1.0.0` (2026-04-04): Initial engineering stack and layout.
