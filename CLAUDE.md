# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Hebrew-language (RTL) household finance app. pnpm + Turborepo monorepo (Node >=20, pnpm 9.15; `.node-version` pins Node 22 for deploys). `AGENTS.md` is the onboarding index; the `.cursor/rules/*.mdc` files hold the detailed conventions summarized below.

## Notion project (do this every session)

Tasks, roadmap and a mirror of the docs live in the **Financial-Management** Notion project (root: https://app.notion.com/p/41a20f5aa25e8169bc13dd845ef777dc). At session start read **Agents → Agent Briefing** and **Task Protocol**, and take work from the **Tasks** database (`Status = Ready`, by `Priority`); create a task first if the request has none. Before finishing, sync any changed `docs/` or agent rules to the matching Notion pages (Knowledge `Source:` line, Decisions Log, Agent Briefing), and update the task (`Status`, `Branch`, `PR / Commit`). The repo wins on conflict. If Notion is unreachable, say so and list the updates still owed. Full procedure: `docs/engineering/notion-workflow.md`.

## Commands

Run from the repo root unless noted. Verification gates: `pnpm lint` (ESLint flat config in `eslint.config.mjs`), `pnpm typecheck` and `pnpm test` (Vitest); CI runs all three plus `build`. Tests in `apps/api/src/**/*.integration.test.ts` need Postgres and run only when `TEST_DATABASE_URL` is set (e.g. `TEST_DATABASE_URL=postgresql://fm:fm@localhost:5432/financial_management pnpm --filter @financial-management/api test` after `docker compose up -d`); otherwise they are skipped.

```bash
pnpm install
docker compose up -d                                   # Postgres 16 (user/pass fm, db financial_management)
pnpm dev                                               # turbo: api (8787) + web (5173)
pnpm typecheck                                         # turbo; depends on ^build, so shared is built first
pnpm build
pnpm --filter @financial-management/api dev            # one app only
pnpm --filter @financial-management/web dev
pnpm --filter @financial-management/api db:generate    # drizzle-kit: SQL migration from src/db/schema.ts
pnpm --filter @financial-management/api db:push        # dev-only schema push
pnpm --filter @financial-management/api db:seed        # REQUIRED: dev auth needs a seeded owner
```

Filter by the full package name (`@financial-management/api`); `.claude/launch.json` uses short names (`--filter api`) which may not match. API env: copy `apps/api/.env.example` (`DATABASE_URL`, `PORT`, `WEB_ORIGIN`); web uses `VITE_API_ORIGIN`.

`packages/shared` (and `api-client`) compile to `dist/` and are consumed through `dist`, so **rebuild `shared` after editing it** (`pnpm --filter @financial-management/shared build`) or the apps won't see the change. Turbo does this for `build`/`typecheck`, not for `dev`.

## Architecture

- `packages/shared` — Zod schemas, types, enums, and money helpers used by both apps. The single contract between API and web; must stay browser-safe (no Node imports). User-facing validation messages are in Hebrew.
- `apps/api` — Hono + `@hono/zod-openapi` + Drizzle (Postgres). `src/app.ts` wires CORS, error handler, middleware, then mounts one router per module in `src/routes/` (accounts, categories, transactions, dashboard, budgets, imports, reconciliation). Routes are declared with `createRoute` so the OpenAPI spec (`/openapi.json`, Swagger at `/api/docs`) is generated from the same Zod schemas — keep them in sync. Always build routers with `createRouter()` (`src/lib/router.ts`), which gives validation failures a uniform `{error:"validation_error", issues}` 400 shape.
- `apps/web` — Vite + React 19 + React Router v7 + TanStack Query + Tailwind/shadcn. `src/api/client.ts` is the fetch wrapper (Zod-parses responses with `shared`), `src/api/hooks.ts` the query hooks. Pages live in `src/pages/<module>/`.
- `packages/api-client` — optional typed fetch helpers (hand-written).

### Cross-cutting rules that span files

- **Server owns the ledger.** Balance math (`apps/api/src/lib/balance.ts`, `recalcAccountBalance`), categorization, and reconciliation live only in the API; the web client must never implement authoritative money logic.
- **Money** is a decimal string end to end (`NUMERIC(18,2)` in DB, `moneySchema` on the wire); never `number`/floats. Amounts are positive scalars, sign derives from transaction `type`. Time is stored UTC.
- **Auth:** real sessions (FM-5). `routes/auth.ts` (`/api/auth/register|login|logout`), `lib/session.ts` (HTTP-only `fm_session` cookie, token hash in the `sessions` table), `lib/password.ts` (scrypt); `sessionAuth` resolves the cookie to the user's active membership (household + live role) per request. Authorization is server-side via `requireRole(auth, minRole)` (viewer < member < admin < owner) — call it in every mutating route. `db:seed` needs `SEED_PASSWORD` (or prints a random one); `db:set-password` sets one for pre-existing users.
- **Audit:** call `emitAuditEvent` (`lib/audit.ts`) for transaction/account/budget/import/member-role operations (list in `docs/agent/06-agent-conventions.md`); keep snapshots small.
- **Migrations** run automatically at API boot (`db/migrate.ts`, folder `apps/api/drizzle/`, committed SQL + `meta/` journal) — so after changing `db/schema.ts`, run `db:generate` and commit the output.

### Docs are the source of truth

Domain: `docs/agent/` (read `00`→`06`). Stack/hosting: `docs/engineering/00-tech-stack.md`, runbook `docs/engineering/deployment.md`. Code and docs must agree in the same change: new entities → `02-domain-model.md` + `03-entities-fields.md`; new enum values → `05-enums-and-statuses.md`; bump the YAML `version`/`last_updated` block in any doc you change. Postponed features (analytics UI, alerts, document vault, rule-based auto-categorization) must not appear as v1 behavior. A new app under `apps/` requires updating the tech-stack doc first.

### Web conventions (`.cursor/rules/web-design-system.mdc` has the full "Hearth" spec)

- UI is **Hebrew, `dir="rtl"`**: use logical Tailwind utilities (`ms/me/ps/pe/text-start/start-*`), never `ml/mr/left/right`; mirror chevrons/arrows in RTL.
- Colors only via semantic tokens from `apps/web/src/index.css` (OKLCH CSS vars; `bg-card`, `text-muted-foreground`, `primary`, `positive`/`negative`…) — no ad-hoc hex. Dark mode follows OS via `html.dark`.
- Format money/dates with shared helpers (`apps/web/src/lib/money.ts`, `he-IL`, default ILS); expenses in `negative`, income in `positive`.

## Deployment

Web on Vercel (`apps/web/vercel.json`, SPA rewrite), API on Render (`render.yaml`, builds shared + api, starts `node apps/api/dist/index.js`), Postgres on Neon. Pushes to `main` deploy.
