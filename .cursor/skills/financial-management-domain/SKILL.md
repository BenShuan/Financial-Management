---
name: financial-management-domain
description: >-
  Use when changing product behavior, data model, enums, workflows, or agent docs
  for the home financial management system. Ensures docs/agent is read in order
  and v1 scope and conventions are respected.
---

# Financial management domain

## When to use

- Adding or changing entities, fields, enums, or workflows.
- Implementing features that must match `docs/agent/` or updating those docs.
- Deciding whether a feature is in v1 scope or postponed.

## Instructions

1. Read `docs/agent/README.md` for the index, then files **00 → 06** in order for the affected area.
2. **V1 vs postponed:** Honor explicit non-goals in `docs/agent/00-product-scope.md` (e.g. reporting UI, alerts, multi-currency, bank APIs) unless the user has approved a scope change and version bump.
3. **Changing the model:** Do not add entities in code without `02-domain-model.md` and `03-entities-fields.md`. Do not add enum values without `05-enums-and-statuses.md`.
4. **Version blocks:** When changing numbered agent docs, bump `version` / `last_updated` and set `breaking` per `06-agent-conventions.md`.
5. **Invariants:** IDs (UUID/ULID), money (`NUMERIC` / no float storage), UTC storage, household timezone in UI—per `00-product-scope.md`.
6. **Audit:** Plan or implement `AuditEvent` for money- and security-sensitive operations per `06-agent-conventions.md`.

## References

- `docs/agent/00-product-scope.md`
- `docs/agent/06-agent-conventions.md`
- Engineering stack (orthogonal): `docs/engineering/00-tech-stack.md`
