---
name: web-client
description: >-
  Use when building or changing the Vite React app in apps/web—responsive UI,
  API integration, and avoiding duplicated business rules from the server.
---

# Web client

## When to use

- Working under `apps/web/` (components, routes, styling, data fetching).
- Connecting UI to the API or improving mobile/desktop layouts.

## Instructions

1. Follow `docs/engineering/00-tech-stack.md` (Vite, React, TypeScript).
2. **Responsive:** Mobile-first; readable tables and forms on narrow viewports; adequate touch targets.
3. **Data:** Use typed or generated API clients; server state via TanStack Query or the project’s chosen library once scaffolded.
4. **No authoritative rules on client:** Ledger math, categorization rules, reconciliation logic, and permission decisions live in `apps/api`; the web app displays and submits data only.
5. **A11y:** Semantic HTML, labels, keyboard use, focus visibility.
6. **Design system:** Follow `.cursor/rules/web-design-system.mdc` and token definitions in `apps/web/src/index.css` (warm household palette, semantic colors including `positive` / `negative` / `warning`).
7. **Hebrew + RTL:** Root `lang="he"` and `dir="rtl"`; use logical spacing/alignment utilities (`ms`/`me`, `text-start`/`end`, etc.); user-facing copy in Hebrew; use `Intl` / `he-IL` for displayed numbers and currency when implementing money UI.
8. **Config:** API base URL from env/build config; never ship secrets in client bundles.

## References

- `.cursor/rules/web-design-system.mdc`
- `.cursor/rules/web-client.mdc`
- `docs/engineering/00-tech-stack.md`
- `docs/agent/` for field meanings and workflows when implementing screens
