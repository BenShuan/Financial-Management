# Modules

```yaml
version: 2.0.0
last_updated: 2026-07-02
breaking: "yes"
```

Each module maps to a bounded area of the product. Implementation may split across services or packages later; the **domain boundaries** below stay stable.

## Household & Access Control

Household profile (`base_currency`, `timezone`), member invitations and roles, and a **lightweight** `AuditEvent` log (who changed what, when—not full event sourcing). Enables shared-family use with accountability.

## Account & Balance Ledger

Account types (checking, savings, cash, credit, other), opening/current balance maintenance, optional **balance snapshots** over time, and **reconciliation sessions** tied to statement periods.

## Transaction Engine

Authoritative record of **income**, **expense**, and **transfer** postings. Supports splits, tags, optional top-level category, links between transfer legs, and linkage to import batches and recurring matches.

## Categories & Tags

Hierarchical categories (income/expense kinds) **seeded from a default list** at household creation and fully user-editable (rename, re-parent, archive, delete), plus free-form tags. **Categorization is manual:** the user assigns every category; the system never auto-categorizes.

## Budgeting & Goals

**Annual budget periods**: one planning pass per year with **budget lines** per category holding the **annual planned amount** (optional year-to-year rollover fields). The **monthly view is derived** as annual ÷ 12 at read time. **Goals** (savings or paydown) with **contributions** linked manually or to transactions where applicable.

## Recurring Payments & Income

**Recurring templates** (frequency, expected amount, account/category hints), generated **occurrences** (due dates, match status), and **detection candidates** mined from history with confidence scores.

## Import, Normalization & Reconciliation

**Import batches** per account; **raw** then **normalized** rows; **mapping templates** for CSV columns; dedupe fingerprints; promotion to `Transaction` after the **user assigns a category to each row**. **Reconciliation** compares statement ending balance to calculated ledger balance for a date range.

## References

- Scope: [00-product-scope.md](00-product-scope.md)
- Model: [02-domain-model.md](02-domain-model.md)
