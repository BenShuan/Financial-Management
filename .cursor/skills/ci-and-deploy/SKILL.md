---
name: ci-and-deploy
description: >-
  Use when adding or changing GitHub Actions workflows, deployment to free-tier
  hosts (Render, Cloudflare Pages/Vercel, Neon), secrets, or post-deploy checks.
---

# CI and deploy

## When to use

- Creating or editing `.github/workflows/*`.
- Documenting or automating deploys to Neon, Render, Cloudflare Pages, or Vercel.
- Managing CI secrets and environment promotion.

## Instructions

1. Align with `docs/engineering/00-tech-stack.md` (GitHub Actions, Neon, Render, Cloudflare Pages or Vercel).
2. **CI:** On PRs, run lint, typecheck, tests, and build for affected workspaces once the monorepo exists; fail fast on main branch protection if configured.
3. **Secrets:** Use GitHub **encrypted secrets** and provider dashboards; never commit tokens or production `.env`.
4. **Deploy:** Document which branch triggers production vs preview; note free-tier limits (cold starts, build minutes, DB compute).
5. **Smoke checks:** After deploy, optional HTTP health check or minimal e2e against staging URL.
6. When switching providers, update `docs/engineering/00-tech-stack.md` in the same change.

## References

- `docs/engineering/00-tech-stack.md` (hosting table)
- `.cursor/rules/engineering-standards.mdc` (secrets, no leaks)
