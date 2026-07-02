# Workflows

```yaml
version: 1.0.0
last_updated: 2026-04-04
breaking: "no"
```

## Household onboarding

1. Create `Household` with `base_currency` and `timezone`.
2. Invite or add `User` records; create `HouseholdMember` with role.
3. Create initial `Account` rows with `opening_balance` (and optionally first `AccountBalanceSnapshot`).

## Manual transaction entry

1. User selects `Account`, enters `type` (income/expense/transfer), `amount` (positive scalar), dates, description.
2. For **transfer**: create two `Transaction` rows (outflow/inflow) and a `TransferLink` between them; enforce same household and compatible accounts.
3. Optional: `TransactionSplit` lines summing to transaction `amount`; `TransactionTag` associations.
4. Emit `AuditEvent` for create/update/delete according to policy in [06-agent-conventions.md](06-agent-conventions.md).

## CSV import

1. User uploads file; create `ImportBatch` for target `Account`.
2. Parse rows into `ImportRowRaw` (`raw_payload_json`, `row_index`).
3. Apply `ImportMappingTemplate` (`column_map_json`) to produce `ImportRowNormalized` (dates, description, amount, `dedupe_fingerprint`).
4. Detect duplicates against existing transactions or normalized rows (household/account rules TBD in implementation; fingerprint is the hook).
5. Run enabled `CategorizationRule` set in priority order; attach suggested `category_id` / tags on normalized row or promoted transaction.
6. User confirms batch; create `Transaction` rows from accepted normalized rows; update `ImportBatch.status` and counts.

## Reconciliation

1. User opens `ReconciliationSession` for `Account`, `period_start`/`period_end`, enters `statement_ending_balance`.
2. System computes `calculated_ending_balance` from cleared transactions in range (definition of “cleared” in [05-enums-and-statuses.md](05-enums-and-statuses.md)).
3. Compare; set `status` to `matched` or `mismatch` per [05-enums-and-statuses.md](05-enums-and-statuses.md).
4. On fix: adjust transactions or add missing rows; recalculate; transition to `resolved` then `closed`.
5. Optional: write `AccountBalanceSnapshot` at `period_end` with `source` manual or system.

## Budget period lifecycle

1. Create `BudgetPeriod` for month (YYYY-MM) in `draft` or `active`.
2. Add `BudgetLine` rows: `category_id`, `planned_amount`, optional rollover fields.
3. **Actuals** are derived at read time from `Transaction` / splits in that period (not duplicated in budget tables).
4. Close period: set status to `closed` when household policy requires locking edits.

## Recurring

1. User creates `RecurringTemplate` (frequency, expected amount, start, optional account/category).
2. System generates `RecurringOccurrence` rows for upcoming dues.
3. On import or manual entry, match transaction to occurrence (within tolerance); set `matched_transaction_id`, `status` paid, `variance_amount` if needed.
4. **RecurringDetectionCandidate**: background or on-demand job proposes templates from repeating signatures; user accepts/rejects → creates or ignores template.

## References

- Fields: [03-entities-fields.md](03-entities-fields.md)
- Status enums: [05-enums-and-statuses.md](05-enums-and-statuses.md)
