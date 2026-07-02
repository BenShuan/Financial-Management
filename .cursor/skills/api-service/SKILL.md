---
name: api-service
description: >-
  Use when implementing or migrating the HTTP API in apps/api—routes, OpenAPI,
  Drizzle schema, authz, audit events, and alignment with docs/agent entities.
---

# API service

## When to use

- Working under `apps/api/` or designing server-side behavior for the financial app.
- Adding migrations, handlers, middleware, or OpenAPI documentation.

## Instructions

1. Follow `docs/engineering/00-tech-stack.md` (Hono, Drizzle, Node 20+, OpenAPI 3).
2. **Domain:** Cross-check `docs/agent/03-entities-fields.md` and related modules before changing persistence or payloads.
3. **OpenAPI:** Update the public contract whenever request/response shapes or routes change.
4. **Authz:** Every sensitive route checks household membership and role on the server.
5. **Audit:** Emit audit events per `docs/agent/06-agent-conventions.md` for the listed operations.
6. **Errors:** Consistent status codes and client-safe error bodies; no raw stack traces in production responses.

## References

- `.cursor/rules/api-service.mdc`
- `docs/engineering/00-tech-stack.md`
- `docs/agent/03-entities-fields.md`, `docs/agent/06-agent-conventions.md`
