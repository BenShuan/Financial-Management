# Agent conventions

```yaml
version: 1.2.0
last_updated: 2026-11-25
breaking: "no"
```

Rules for Cursor agents (and humans) when changing the system or generating code from these documents.

## Authority

1. **`docs/agent/`** is the **source of truth** for domain scope, entities, enums, and workflows until code exists; after code exists, **docs and code must agree**.
2. If implementation diverges, **fix docs or code** in the same change set; do not leave silent drift.

## Notion project

Tasks, roadmap, and a mirror of these docs live in the **Financial-Management** Notion project. Every session starts there (Agent Briefing, then the Tasks database), and before finishing, any change to `docs/` or to agent rules must be synced to the matching Notion pages and the task updated. The repo wins on conflict. Full procedure and links: [../engineering/notion-workflow.md](../engineering/notion-workflow.md).

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
- Budget period create/update/close
- Import batch apply (`import_batch.applied`, also for `bank_sync` batches: counts only, never descriptions or account numbers)
- Bank-sync account link change (`sync_account_link.updated`: status, account id, last 4 digits)
- Household member invite, invite acceptance, role change and removal
- Category and tag archive, restore and delete

Exact payload shape is implementation detail; keep snapshots **small** (truncate lists).

## Bank sync

- No API endpoint, table, log or audit snapshot may accept or store bank/card credentials. They live only in the local app's encrypted vault (`apps/bank-sync`).
- Scraping (`israeli-bank-scrapers-core`) happens only in `apps/bank-sync`; never add a scraper or browser dependency to `apps/api`.
- The local app uploads near-raw rows (signed decimal strings); it must not implement balance, categorization, dedupe or type logic. The API owns mapping, dedupe and balances.
- The local app binds `127.0.0.1` only, checks the `Host` header and a per-launch token, and never logs credentials or the session token.

## SQL and migrations

- Use relational schema aligned with [03-entities-fields.md](03-entities-fields.md).
- Foreign keys and `NOT NULL` should match **Required** columns unless a deliberate phased migration is documented in a version bump.

## Questions

If requirements are ambiguous, prefer the **narrower** interpretation that stays within [00-product-scope.md](00-product-scope.md) v1 scope, then propose a doc PR for expansion.
