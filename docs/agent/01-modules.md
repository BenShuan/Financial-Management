# Modules

```yaml
version: 1.0.0
last_updated: 2026-04-04
breaking: "no"
```

Each module maps to a bounded area of the product. Implementation may split across services or packages later; the **domain boundaries** below stay stable.

## Household & Access Control

Household profile (`base_currency`, `timezone`), member invitations and roles, and a **lightweight** `AuditEvent` log (who changed what, when—not full event sourcing). Enables shared-family use with accountability.

## Account & Balance Ledger

Account types (checking, savings, cash, credit, other), opening/current balance maintenance, optional **balance snapshots** over time, and **reconciliation sessions** tied to statement periods.

## Transaction Engine

Authoritative record of **income**, **expense**, and **transfer** postings. Supports splits, tags, optional top-level category, links between transfer legs, and linkage to import batches and recurring matches.

## Categories, Tags & Rules

Hierarchical categories (income/expense kinds), free-form tags, and **categorization rules** (conditions + actions, priority, enable/disable) to drive semi-automation after import.

## Budgeting & Goals

**Budget periods** (e.g. monthly) with **budget lines** per category (planned amounts, optional rollover fields). **Goals** (savings or paydown) with **contributions** linked manually or to transactions where applicable.

## Recurring Payments & Income

**Recurring templates** (frequency, expected amount, account/category hints), generated **occurrences** (due dates, match status), and **detection candidates** mined from history with confidence scores.

## Import, Normalization & Reconciliation

**Import batches** per account; **raw** then **normalized** rows; **mapping templates** for CSV columns; dedupe fingerprints; promotion to `Transaction` after rules. **Reconciliation** compares statement ending balance to calculated ledger balance for a date range.

## References

- Scope: [00-product-scope.md](00-product-scope.md)
- Model: [02-domain-model.md](02-domain-model.md)
