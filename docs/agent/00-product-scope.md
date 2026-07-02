# Product scope

```yaml
version: 1.0.0
last_updated: 2026-04-04
breaking: "no"
```

## Vision

A **home financial management** system for a **shared household**: multiple members collaborate on accounts, transactions, budgets, imports, and reconciliation. **Single base currency** per household in v1. **Semi-automated** operation: CSV import, column mapping, categorization rules, and recurring-pattern detection—not full bank API sync in v1.

## V1 goals

- Trustworthy ledger: accounts, transactions (income/expense/transfer), splits, tags.
- Household membership with roles and a lightweight audit trail.
- Budget periods and lines tied to categories; savings/paydown goals with contributions.
- Recurring templates and occurrences; suggestions from transaction history.
- CSV import pipeline: raw rows → normalized rows → dedupe → rules → transactions; reconciliation sessions against statement periods.

## Explicit non-goals (postponed)

Do **not** implement in v1 unless product scope is revised and this file is version-bumped:

| Area | Rationale |
|------|-----------|
| **Reporting & analytics UI** | Charts/dashboards deferred; data model still supports future reports via SQL. |
| **Alerts & insights** | Push/email/in-app nudges deferred. |
| **Document & metadata vault** | Receipts, file attachments, rich metadata deferred. |
| **Multi-currency** | One `base_currency` per household; no FX in v1. |
| **Bank aggregation APIs** | Out of scope for v1; CSV/manual is the ingestion path. |

## Data store

- **System of record:** relational **SQL** (recommended: **PostgreSQL**).
- **Rationale:** ACID updates, foreign keys, joins for budgets/imports/reconciliation, and ad-hoc queries without a dedicated reporting product yet.
- Optional later: cache (e.g. Redis) for sessions; separate analytics store only if needed—**not** v1.

## Cross-cutting rules

- **IDs:** UUID or ULID consistently.
- **Money:** fixed decimal (e.g. `NUMERIC(18,2)`), never binary floating point for stored amounts.
- **Time:** store timestamps in **UTC**; localize with `household.timezone` in UI.
- **Privacy:** minimize PII in domain tables; user profile fields documented in [03-entities-fields.md](03-entities-fields.md).

## References

- Modules: [01-modules.md](01-modules.md)
- Entities and ERD: [02-domain-model.md](02-domain-model.md), [03-entities-fields.md](03-entities-fields.md)
- Workflows: [04-workflows.md](04-workflows.md)
- Enums: [05-enums-and-statuses.md](05-enums-and-statuses.md)
