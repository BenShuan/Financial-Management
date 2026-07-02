# Workflows

```yaml
version: 2.0.0
last_updated: 2026-07-02
breaking: "yes"
```

## Household onboarding

1. Create `Household` with `base_currency` and `timezone`.
2. **Seed default `Category` rows** for the new household (list in [03-entities-fields.md](03-entities-fields.md)); user may edit or delete them freely afterward.
3. Invite or add `User` records; create `HouseholdMember` with role.
4. Create initial `Account` rows with `opening_balance` (and optionally first `AccountBalanceSnapshot`).

## Manual transaction entry

1. User selects `Account`, enters `type` (income/expense/transfer), `amount` (positive scalar), dates, description.
2. For **income/expense**: user **must select a category** (or provide splits covering the full amount) — the transaction cannot be saved without one; the system never assigns it.
3. For **transfer**: create two `Transaction` rows (outflow/inflow) and a `TransferLink` between them; enforce same household and compatible accounts; no category on transfer legs.
4. Optional: `TransactionSplit` lines summing to transaction `amount`; `TransactionTag` associations.
5. Emit `AuditEvent` for create/update/delete according to policy in [06-agent-conventions.md](06-agent-conventions.md).

## CSV import

1. User uploads file; create `ImportBatch` for target `Account`.
2. Parse rows into `ImportRowRaw` (`raw_payload_json`, `row_index`).
3. Apply `ImportMappingTemplate` (`column_map_json`) to produce `ImportRowNormalized` (dates, description, amount, `dedupe_fingerprint`).
4. Detect duplicates against existing transactions or normalized rows (household/account rules TBD in implementation; fingerprint is the hook).
5. User reviews normalized rows and **assigns a category to each** (bulk-assign to multiple rows is allowed); rows without a category cannot be promoted.
6. User confirms batch; create `Transaction` rows from accepted normalized rows with the **user-assigned categories**; update `ImportBatch.status` and counts.

## Reconciliation

1. User opens `ReconciliationSession` for `Account`, `period_start`/`period_end`, enters `statement_ending_balance`.
2. System computes `calculated_ending_balance` from cleared transactions in range (definition of “cleared” in [05-enums-and-statuses.md](05-enums-and-statuses.md)).
3. Compare; set `status` to `matched` or `mismatch` per [05-enums-and-statuses.md](05-enums-and-statuses.md).
4. On fix: adjust transactions or add missing rows; recalculate; transition to `resolved` then `closed`.
5. Optional: write `AccountBalanceSnapshot` at `period_end` with `source` manual or system.

## Budget period lifecycle (annual)

1. Create `BudgetPeriod` for a **year** (YYYY) in `draft` or `active` — one planning pass per year.
2. Add `BudgetLine` rows: `category_id`, **annual** `planned_amount`, optional year-to-year rollover fields.
3. **Monthly view** shows `planned_amount / 12` per category, derived at read time (rounding is a display concern; nothing stored per month).
4. **Actuals** are derived at read time from `Transaction` / splits in the month or year (not duplicated in budget tables).
5. Close period: set status to `closed` at year end or when household policy requires locking edits.

## Recurring

1. User creates `RecurringTemplate` (frequency, expected amount, start, optional account/category).
2. System generates `RecurringOccurrence` rows for upcoming dues.
3. On import or manual entry, match transaction to occurrence (within tolerance); set `matched_transaction_id`, `status` paid, `variance_amount` if needed.
4. **RecurringDetectionCandidate**: background or on-demand job proposes templates from repeating signatures; user accepts/rejects → creates or ignores template.

## References

- Fields: [03-entities-fields.md](03-entities-fields.md)
- Status enums: [05-enums-and-statuses.md](05-enums-and-statuses.md)
