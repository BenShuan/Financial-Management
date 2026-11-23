# Product scope

```yaml
version: 2.1.0
last_updated: 2026-11-23
breaking: "no"
```

## Vision

A **home financial management** system for a **shared household**: multiple members collaborate on accounts, transactions, budgets, imports, and reconciliation. **Single base currency** per household in v1. **Semi-automated** operation: CSV import, column mapping, automatic fetch from Israeli banks and credit card providers (via [israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers)), and recurring-pattern detection. **Categorization is manual by design:** the user assigns every category; the system never categorizes automatically.

## V1 goals

- Trustworthy ledger: accounts, transactions (income/expense/transfer), splits, tags.
- Household membership with roles and a lightweight audit trail.
- Categories seeded from a **default list** per household, fully user-editable; **category is mandatory** on income/expense transactions and always assigned by the user.
- **Annual budget planning**: one planning pass per year with a planned amount per category for the whole year; monthly view derived as annual ÷ 12. Savings/paydown goals with contributions.
- Recurring templates and occurrences; suggestions from transaction history.
- CSV import pipeline: raw rows → normalized rows → dedupe → user categorization → transactions; reconciliation sessions against statement periods.
- **Bank and credit card auto-fetch**: household-configured connections to Israeli providers via `israeli-bank-scrapers` (credentials encrypted at rest; admin/owner only). Fetched transactions enter the same import pipeline (dedupe → user categorization → transactions); the server stays the owner of the ledger and categorization stays manual.

## Explicit non-goals (postponed)

Do **not** implement in v1 unless product scope is revised and this file is version-bumped:

| Area | Rationale |
|------|-----------|
| **Reporting & analytics UI** | Charts/dashboards deferred; data model still supports future reports via SQL. |
| **Alerts & insights** | Push/email/in-app nudges deferred. |
| **Document & metadata vault** | Receipts, file attachments, rich metadata deferred. |
| **Multi-currency** | One `base_currency` per household; no FX in v1. |
| **Third-party bank aggregation APIs** | Paid/licensed aggregators (open-banking providers) stay out of v1; v1 ingests via CSV, manual entry, and `israeli-bank-scrapers` (see V1 goals). |
| **Rule-based auto-categorization** | Deferred; manual categorization by the user is the v1 path. The data model may reintroduce rules later. |

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
