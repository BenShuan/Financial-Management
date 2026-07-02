# Agent source of truth — Home Financial Management

**Read order:** `00` → `06` (numbered files). This README is the index only.

**Engineering / stack:** Monorepo layout, runtimes, OpenAPI, hosting, and CI are in [../engineering/00-tech-stack.md](../engineering/00-tech-stack.md).

| Order | File | Purpose |
|-------|------|---------|
| 00 | [00-product-scope.md](00-product-scope.md) | Product scope, v1 vs postponed, data store |
| 01 | [01-modules.md](01-modules.md) | Module responsibilities |
| 02 | [02-domain-model.md](02-domain-model.md) | Entities, relationships, ERD (mermaid) |
| 03 | [03-entities-fields.md](03-entities-fields.md) | Per-entity fields, types, invariants |
| 04 | [04-workflows.md](04-workflows.md) | User and system workflows |
| 05 | [05-enums-and-statuses.md](05-enums-and-statuses.md) | Enums, statuses, reconciliation state machine |
| 06 | [06-agent-conventions.md](06-agent-conventions.md) | How agents must extend and reference these docs |

**V1 in scope:** household access, accounts/ledger, transactions, categories/tags (seeded defaults, **manual categorization by the user**), annual budgets/goals, recurring, import/reconciliation.

**Postponed:** reporting/analytics UI, alerts/insights, document vault, rule-based auto-categorization.

When implementing code, treat conflicts between code and these docs as a **documentation bug** until the docs are updated with a version bump (see `06-agent-conventions.md`).
