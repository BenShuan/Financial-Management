# API (`apps/api`)

Node 20+, Hono, Drizzle ORM, PostgreSQL, OpenAPI 3.

## Environment

Copy `.env.example` from the repository root (or create `.env`):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (default matches `docker-compose.yml` at repo root) |
| `PORT` | HTTP port (default `8787`) |
| `WEB_ORIGIN` | Allowed browser origin for CORS (default `http://localhost:5173`) |

## Scripts

- `pnpm dev` — watch mode with `tsx`
- `pnpm build` — compile to `dist/`
- `pnpm db:generate` — generate SQL migrations from `src/db/schema.ts`
- `pnpm db:push` — push schema to DB (dev)
- `pnpm db:migrate` — run migrations

## Database

Start Postgres locally:

```bash
docker compose up -d
```

Then run `pnpm db:push` or apply migrations from `drizzle/`.
