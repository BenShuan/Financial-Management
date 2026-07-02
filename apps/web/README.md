# Web (`apps/web`)

Vite, React 19, TypeScript, **React Router** v7, Tailwind CSS, shadcn/ui-style components, TanStack Query, react-hook-form with Zod (shared with the API via `@financial-management/shared`).

## Deployment (SPA)

Client-side routes (e.g. deep links, refresh on a non-root path) require the static host to **serve `index.html` for unknown paths** (SPA fallback). Configure this on **Cloudflare Pages**, **Vercel**, or your CDN so `/some/client/route` does not 404 as a missing file.

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_API_ORIGIN` | Base URL for the HTTP API (default in code: `http://localhost:8787`) |

Set in `.env.local` (gitignored) or your host’s build settings. See root `.env.example`.

## Scripts

- `pnpm dev` — Vite dev server (port 5173)
- `pnpm build` — production build to `dist/`
- `pnpm preview` — preview production build

## shadcn/ui

`components.json` is configured for the official CLI. Add components with:

```bash
pnpm dlx shadcn@latest add dialog
```

(From `apps/web`.)
