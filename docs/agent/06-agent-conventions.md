# Agent conventions

```yaml
version: 1.0.0
last_updated: 2026-04-04
breaking: "no"
```

Rules for Cursor agents (and humans) when changing the system or generating code from these documents.

## Authority

1. **`docs/agent/`** is the **source of truth** for domain scope, entities, enums, and workflows until code exists; after code exists, **docs and code must agree**.
2. If implementation diverges, **fix docs or code** in the same change set; do not leave silent drift.

## Read order

Follow [README.md](README.md): `00` → `06`.

## Changing the model

1. **Do not add entities** in application code without adding them to [02-domain-model.md](02-domain-model.md) and [03-entities-fields.md](03-entities-fields.md).
2. **Do not add enum values** without updating [05-enums-and-statuses.md](05-enums-and-statuses.md).
3. **Postponed features** from [00-product-scope.md](00-product-scope.md) must not appear as required v1 behavior in code or migrations.

## Version blocks

Every numbered doc starts with a YAML block:

```yaml
version: 1.0.0
last_updated: YYYY-MM-DD
breaking: "yes" | "no"
```

- **Patch** bump: typos, clarifications, no behavior change.
- **Minor** bump: new optional fields, new enum values, backward compatible.
- **Major** bump: removed/renamed fields, changed enum meanings, workflow breaking changes—set `breaking: "yes"`.

## Cross-references

- Link by **filename** (e.g. `[03-entities-fields.md](03-entities-fields.md)`), not by line number.
- Prefer one canonical section per concept; avoid duplicating full field tables in multiple files.

## Audit events

Emit `AuditEvent` for security- and money-sensitive operations at minimum:

- Transaction create/update/delete
- Account create/update/archive
- Budget period close
- Import batch apply
- Household member role change

Exact payload shape is implementation detail; keep snapshots **small** (truncate lists).

## SQL and migrations

- Use relational schema aligned with [03-entities-fields.md](03-entities-fields.md).
- Foreign keys and `NOT NULL` should match **Required** columns unless a deliberate phased migration is documented in a version bump.

## Questions

If requirements are ambiguous, prefer the **narrower** interpretation that stays within [00-product-scope.md](00-product-scope.md) v1 scope, then propose a doc PR for expansion.
