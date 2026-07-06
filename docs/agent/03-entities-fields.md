# Entities and fields

```yaml
version: 2.0.0
last_updated: 2026-07-02
breaking: "yes"
```

Types are logical; map to PostgreSQL as noted. All primary keys are UUID or ULID strings unless implementation standardizes otherwise.

## Conventions

- **`amount` on `Transaction`:** positive scalar; direction from `type` (`income` / `expense` / `transfer` leg semantics in application layer).
- **Money columns:** `NUMERIC(18,2)` (or equivalent).
- **Timestamps:** `timestamptz` UTC.
- **Soft delete:** prefer `is_active` / `archived_at` on master data (`Account`, `Category`, `Tag`) where applicable.
- **Categorization is user-initiated only:** no system process writes `category_id` on transactions or normalized rows. CSV import creates transactions with `category_id = NULL` (uncategorized); the user categorizes them later on the Transactions page.

---

## Household

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `household_id` | yes | id | PK |
| `name` | yes | string | |
| `base_currency` | yes | string | ISO 4217, single currency v1 |
| `timezone` | yes | string | IANA TZ |
| `created_at` | yes | timestamptz | |
| `description` | no | string | |
| `status` | no | enum | See [05-enums-and-statuses.md](05-enums-and-statuses.md) |

## User

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `user_id` | yes | id | PK |
| `email` | yes | string | unique system-wide |
| `display_name` | yes | string | |
| `created_at` | yes | timestamptz | |
| `phone` | no | string | |
| `avatar_url` | no | string | |
| `last_login_at` | no | timestamptz | |

## HouseholdMember

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `household_member_id` | yes | id | PK |
| `household_id` | yes | id | FK → Household |
| `user_id` | yes | id | FK → User |
| `role` | yes | enum | owner / admin / member / viewer |
| `joined_at` | yes | timestamptz | |
| `status` | yes | enum | active / invited / removed |
| `invited_by` | no | id | FK → User |
| `permissions_override` | no | jsonb | sparse overrides |

## AuditEvent

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `audit_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `actor_user_id` | yes | id | FK → User |
| `action_type` | yes | string | e.g. `transaction.updated` |
| `entity_type` | yes | string | table or aggregate name |
| `entity_id` | yes | id | |
| `created_at` | yes | timestamptz | |
| `before_snapshot` | no | jsonb | truncated acceptable |
| `after_snapshot` | no | jsonb | |
| `ip_address` | no | string | |

---

## Account

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `account_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `name` | yes | string | |
| `type` | yes | enum | checking / savings / cash / credit / other |
| `opening_balance` | yes | money | |
| `current_balance` | yes | money | maintained by app rules |
| `is_active` | yes | boolean | |
| `created_at` | yes | timestamptz | |
| `institution_name` | no | string | |
| `account_mask` | no | string | last4 etc. |
| `credit_limit` | no | money | credit accounts |
| `notes` | no | text | |

## AccountBalanceSnapshot

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `snapshot_id` | yes | id | PK |
| `account_id` | yes | id | FK |
| `as_of_date` | yes | date | or timestamptz if intraday |
| `balance` | yes | money | |
| `source` | no | enum | manual / imported / system |

## ReconciliationSession

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `reconciliation_id` | yes | id | PK |
| `account_id` | yes | id | FK |
| `period_start` | yes | date | |
| `period_end` | yes | date | |
| `statement_ending_balance` | yes | money | from statement |
| `calculated_ending_balance` | yes | money | from ledger |
| `status` | yes | enum | See [05-enums-and-statuses.md](05-enums-and-statuses.md) |
| `created_at` | yes | timestamptz | |
| `resolved_at` | no | timestamptz | |
| `notes` | no | text | |

---

## Transaction

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `transaction_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `account_id` | yes | id | FK |
| `type` | yes | enum | income / expense / transfer |
| `amount` | yes | money | positive |
| `transaction_date` | yes | date | |
| `posted_date` | yes | date | may equal transaction_date |
| `description` | yes | string | |
| `status` | yes | enum | cleared / pending |
| `created_at` | yes | timestamptz | |
| `merchant_name` | no | string | |
| `category_id` | no | id | FK → Category; optional for `income`/`expense` — NULL = uncategorized (e.g. freshly imported); manual entry still requires a category or splits (see invariant 5); NULL for `transfer` legs; **user-assigned only** |
| `notes` | no | text | |
| `import_batch_id` | no | id | FK |
| `is_recurring_candidate` | no | boolean | hint from pipeline |
| `external_ref` | no | string | bank/import id |

## TransferLink

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `transfer_link_id` | yes | id | PK |
| `from_transaction_id` | yes | id | FK outflow leg |
| `to_transaction_id` | yes | id | FK inflow leg |
| `fx_rate` | no | decimal | reserved; unused v1 single currency |

## TransactionSplit

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `split_id` | yes | id | PK |
| `transaction_id` | yes | id | FK |
| `category_id` | yes | id | FK |
| `amount` | yes | money | sum of splits = transaction.amount |
| `note` | no | text | |

## TransactionTag (join)

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `transaction_id` | yes | id | FK |
| `tag_id` | yes | id | FK |

---

## Category

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `category_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `name` | yes | string | |
| `kind` | yes | enum | income / expense / transfer_neutral |
| `is_active` | yes | boolean | |
| `created_at` | yes | timestamptz | |
| `parent_category_id` | no | id | self-FK |
| `icon` | no | string | |
| `color` | no | string | |
| `sort_order` | no | int | |

### Default categories (seed data)

Seeded per household **at household creation**. After seeding they are plain `Category` rows — the user may rename, re-parent, archive, or delete any of them and add new ones. No system behavior depends on a specific default surviving.

| Kind | Default categories |
|------|--------------------|
| `income` | Salary, Bonus, Investment Income, Other Income |
| `expense` | Housing (children: Rent/Mortgage, Home Maintenance), Utilities, Groceries, Transportation, Dining Out, Health, Insurance, Education & Childcare, Entertainment, Shopping, Subscriptions, Travel, Gifts & Donations, Fees & Charges, Other Expense |

## Tag

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `tag_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `name` | yes | string | unique per household |
| `created_at` | yes | timestamptz | |
| `color` | no | string | |
| `is_active` | no | boolean | default true |

---

## BudgetPeriod

Budgets are planned **once per year**; the monthly view is derived, never stored.

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `budget_period_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `year` | yes | string | YYYY; unique per household |
| `status` | yes | enum | draft / active / closed |
| `created_at` | yes | timestamptz | |
| `rollover_enabled` | no | boolean | year-to-year carryover |
| `notes` | no | text | |

## BudgetLine

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `budget_line_id` | yes | id | PK |
| `budget_period_id` | yes | id | FK |
| `category_id` | yes | id | FK |
| `planned_amount` | yes | money | **annual** planned amount for the category; monthly figure derived at read time as `planned_amount / 12` (rounding is a display concern), never stored |
| `rollover_from_previous` | no | money | from previous **year** |
| `carryover_adjustment` | no | money | |

## Goal

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `goal_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `name` | yes | string | |
| `goal_type` | yes | enum | savings / paydown |
| `target_amount` | yes | money | |
| `target_date` | yes | date | |
| `status` | yes | enum | active / completed / cancelled |
| `created_at` | yes | timestamptz | |
| `linked_account_id` | no | id | FK |
| `linked_category_id` | no | id | FK |
| `priority` | no | int | |
| `notes` | no | text | |

## GoalContribution

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `contribution_id` | yes | id | PK |
| `goal_id` | yes | id | FK |
| `amount` | yes | money | |
| `contribution_date` | yes | date | |
| `source_type` | yes | enum | manual / transaction_link / allocation |
| `transaction_id` | no | id | FK when linked |
| `note` | no | text | |

---

## RecurringTemplate

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `recurring_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `name` | yes | string | |
| `flow_type` | yes | enum | expense / income |
| `amount_expected` | yes | money | |
| `frequency` | yes | enum | weekly / monthly / yearly / custom |
| `start_date` | yes | date | |
| `is_active` | yes | boolean | |
| `created_at` | yes | timestamptz | |
| `account_id` | no | id | FK |
| `category_id` | no | id | FK |
| `merchant_name` | no | string | |
| `day_of_month` | no | int | |
| `rrule` | no | string | RFC 5545 if used |
| `tolerance_amount` | no | money | match window |
| `notes` | no | text | |

## RecurringOccurrence

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `occurrence_id` | yes | id | PK |
| `recurring_id` | yes | id | FK |
| `due_date` | yes | date | |
| `expected_amount` | yes | money | |
| `status` | yes | enum | upcoming / paid / missed / skipped |
| `matched_transaction_id` | no | id | FK |
| `matched_at` | no | timestamptz | |
| `actual_amount` | no | money | |
| `variance_amount` | no | money | |

## RecurringDetectionCandidate

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `candidate_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `signature_hash` | yes | string | stable hash of pattern |
| `confidence_score` | yes | decimal | 0–1 |
| `first_seen_at` | yes | timestamptz | |
| `last_seen_at` | yes | timestamptz | |
| `status` | yes | enum | suggested / accepted / rejected |
| `suggested_rule_json` | no | jsonb | |

---

## ImportBatch

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `import_batch_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `account_id` | yes | id | FK |
| `source_type` | yes | enum | csv / manual |
| `file_name` | yes | string | |
| `imported_at` | yes | timestamptz | |
| `row_count` | yes | int | |
| `status` | yes | enum | See [05-enums-and-statuses.md](05-enums-and-statuses.md) |
| `mapping_template_id` | no | id | FK |
| `error_count` | no | int | |
| `duplicate_count` | no | int | |

## ImportRowRaw

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `raw_row_id` | yes | id | PK |
| `import_batch_id` | yes | id | FK |
| `row_index` | yes | int | |
| `raw_payload_json` | yes | jsonb | |
| `ingested_at` | yes | timestamptz | |
| `parse_error` | no | text | |

## ImportRowNormalized

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `normalized_row_id` | yes | id | PK |
| `import_batch_id` | yes | id | FK |
| `raw_row_id` | yes | id | FK |
| `transaction_date` | yes | date | |
| `description` | yes | string | |
| `amount` | yes | money | positive; sign from account column mapping |
| `normalized_payload_json` | yes | jsonb | |
| `dedupe_fingerprint` | yes | string | |
| `merchant_name` | no | string | |
| `category_id` | no | id | FK → Category; legacy field from the removed review step — promotion is now immediate and uncategorized, so new rows keep this NULL |

## ImportMappingTemplate

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `mapping_template_id` | yes | id | PK |
| `household_id` | yes | id | FK |
| `name` | yes | string | |
| `column_map_json` | yes | jsonb | |
| `is_default` | yes | boolean | per household or account; clarify in impl |
| `created_at` | yes | timestamptz | |
| `sample_header_json` | no | jsonb | |

---

## Invariants (implementation must enforce)

1. **Splits:** For a given `transaction_id`, sum(`TransactionSplit.amount`) equals `Transaction.amount` when one or more splits exist; if no splits, top-level `category_id` may apply.
2. **Transfer:** `TransferLink` references two transactions on different accounts (or same account only if product explicitly allows—default **disallow** same account both legs).
3. **Household scope:** Every child row’s `household_id` (where present) matches parent (`Account.household_id` = `Transaction.household_id` for that account).
4. **Budget actuals:** Derived from transactions in period; do not duplicate spend totals in `BudgetLine`.
5. **User-initiated categorization:** `category_id` on `income`/`expense` is optional — NULL means uncategorized (e.g. freshly imported). Manual entry still requires a category or at least one `TransactionSplit` covering the full amount; when splits exist the header `category_id` is NULL. `transfer` legs never carry a category. Categorization is user-initiated only — no system process ever writes `category_id`.
6. **Annual budgeting:** Budget amounts are planned annually per category. Monthly breakdowns (`planned_amount / 12`) and actuals are derived at read time, never persisted per month.

## References

- Enums: [05-enums-and-statuses.md](05-enums-and-statuses.md)
- Flows: [04-workflows.md](04-workflows.md)
