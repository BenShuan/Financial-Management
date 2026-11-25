# Workflows

```yaml
version: 2.3.0
last_updated: 2026-11-25
breaking: "no"
```

## Household onboarding

1. Create `Household` with `base_currency` and `timezone`.
2. **Seed default `Category` rows** for the new household (list in [03-entities-fields.md](03-entities-fields.md)); user may edit or delete them freely afterward.
3. **Invite members** (admin or owner): enter email, name and role. The system creates a `User` without a password and a `HouseholdMember` with `status = invited`, and returns a one-time link (`/accept-invite?token=…`, valid 7 days) that the inviter sends manually — there is no email delivery. Issuing a new link for the same email replaces the previous one; removing an invited member revokes it.
   - The invitee opens the link, chooses a password and is signed in: `User.password_hash` is set, the member becomes `active` with `joined_at`, and the token is cleared.
   - v1 limits: a user belongs to one household, so an email that already has a registered account cannot be invited.
   - **Roles:** owners manage everyone; admins manage and assign only roles below their own (so only owners touch admins or grant `owner`). Any member can leave; removing a member ends their sessions immediately.
   - The **last active owner** cannot be removed or demoted.
   - Emit `AuditEvent` for `household.member_invited`, `household.invite_accepted`, `household.member_role_changed` and `household.member_removed`.
4. Create initial `Account` rows with `opening_balance` (and optionally first `AccountBalanceSnapshot`).

## Categories and tags

1. Any member (not viewer) can add, rename, recolor, re-parent, archive or restore categories and tags; `kind` cannot change after creation.
2. Removing a category: delete only if unused and childless, otherwise **archive** (the API refuses the delete and says how many rows use it). Archiving a parent archives its children.
3. Tags are assigned on entry and from the transactions list; a tag is unique by name within the household. Deleting a tag detaches it from all transactions.
4. Emit `AuditEvent` for category/tag archive, restore and delete.

## Manual transaction entry

1. User selects `Account`, enters `type` (income/expense/transfer), `amount` (positive scalar), dates, description.
2. For **income/expense**: user **must select a category** (or provide splits covering the full amount) — the transaction cannot be saved without one; the system never assigns it.
3. For **transfer**: create two `Transaction` rows (outflow/inflow) and a `TransferLink` between them; enforce same household and compatible accounts; no category on transfer legs.
4. Optional: `TransactionSplit` lines summing to transaction `amount`; `TransactionTag` associations.
5. Emit `AuditEvent` for create/update/delete according to policy in [06-agent-conventions.md](06-agent-conventions.md).
6. **Editing:** `splits` on update replace all split lines (`[]` removes them); changing `amount` on a split transaction requires sending matching splits in the same request, and a header `category_id` is rejected while splits exist. Changing a transfer leg's `amount` updates both legs. Referenced categories and tags must belong to the household. Writes for one transaction (legs, link, splits, tags) are atomic.

## CSV import

1. User uploads file; create `ImportBatch` for target `Account`.
2. Parse rows into `ImportRowRaw` (`raw_payload_json`, `row_index`).
3. Apply `ImportMappingTemplate` (`column_map_json`) to produce `ImportRowNormalized` (dates, description, amount, `dedupe_fingerprint`).
4. Detect duplicates against existing transactions and within the batch (fingerprint); duplicates are **flagged, not skipped**.
5. Create `Transaction` rows **immediately** from all parseable normalized rows — **uncategorized** (`category_id = NULL`), duplicates included; set `ImportBatch.status = completed` and counts; recalculate account balance.
6. User categorizes later on the **Transactions page** (`/transactions`): inline per-row category select or bulk-assign to selected rows. Categorization stays user-initiated only.

## Bank & card auto-fetch (local app)

1. A household **admin/owner** starts the local app `apps/bank-sync` on their computer, unlocks its local vault (master passphrase), signs in to the API with their normal account (only the session token is kept, in the vault) and saves credentials for Discount, Isracard and/or Max. Credentials never leave that computer.
2. User presses **"סנכרן עכשיו"**. The app re-checks the live role via `GET /api/me` (admin/owner required) and scrapes each provider sequentially, once (no retry on a wrong password). Window: first run `lookbackDays` (default 90) back; afterwards the last successful sync minus `overlapDays` (default 14).
3. Per provider, the app uploads all scraped accounts in one `POST /api/sync/uploads` (signed decimal strings, no credentials, no raw provider payload).
4. The API upserts a `SyncAccountLink` per account number. For `linked` accounts with an active `Account` it maps rows (skips pending, zero and foreign-currency rows; `type` from sign; Asia/Jerusalem date; `bs1:` `external_ref`), skips rows whose `(account_id, external_ref)` already exists, writes one `ImportBatch` (`source_type = bank_sync`, only if something new), creates **uncategorized, cleared** transactions, recalculates the balance and emits `import_batch.applied`. `unmapped`/`ignored` accounts import nothing.
5. In the web app (**עוד > סנכרון בנקים**, `/sync`) an admin links each new account number to a household account, or hides it.
6. The local app advances its per-provider cursor only when the scrape and upload succeeded and no account came back `unmapped` or with an error, so the next sync re-scans the window and imports rows of newly linked accounts. Re-syncing never duplicates (unique `external_ref`).
7. Categorization stays manual on `/transactions`. Note: the first sync can overlap transactions imported earlier by CSV (no cross-source dedupe); set the first lookback to start after the last CSV import.

## Reconciliation

1. User opens `ReconciliationSession` for `Account`, `period_start`/`period_end`, enters `statement_ending_balance`.
2. System computes `calculated_ending_balance` from cleared transactions in range (definition of “cleared” in [05-enums-and-statuses.md](05-enums-and-statuses.md)).
3. Compare; set `status` to `matched` or `mismatch` per [05-enums-and-statuses.md](05-enums-and-statuses.md).
4. On fix: adjust transactions or add missing rows; recalculate; transition to `resolved` then `closed`.
5. Optional: write `AccountBalanceSnapshot` at `period_end` with `source` manual or system.

## Budget period lifecycle (annual)

1. Create `BudgetPeriod` for a **year** (YYYY) in `draft` or `active` — one planning pass per year.
2. Add `BudgetLine` rows for **income and expense** categories: `category_id`, **annual** `planned_amount`, optional year-to-year rollover fields. The plan summary shows planned income, planned expenses and expected profit (income − expenses).
3. **Monthly view** shows `planned_amount / 12` per category, derived at read time (rounding is a display concern; nothing stored per month).
4. **Actuals** are derived at read time from `Transaction` / splits in the month or year (not duplicated in budget tables); income lines track received income, and the budget screen shows income vs expenses and expected vs current profit.
   When planning a new year, the new-budget screen shows each category's **previous-year planned** amount (from that year's `BudgetLine`, if a period exists) and **previous-year actual** (derived from income/expense transactions and splits in that calendar year; transfers excluded, uncategorized not attributed) via `GET /api/budgets/category-history?year=`. Nothing is stored; rollover fields are separate.
5. **Edit** an open (non-closed) period: change planned amounts, add or remove lines, toggle rollover (admin+). Existing lines keep their id and rollover fields; the year is fixed.
6. Close period: set status to `closed` at year end or when household policy requires locking edits.

## Recurring

1. User creates `RecurringTemplate` (frequency, expected amount, start, optional account/category).
2. System generates `RecurringOccurrence` rows for upcoming dues.
3. On import or manual entry, match transaction to occurrence (within tolerance); set `matched_transaction_id`, `status` paid, `variance_amount` if needed.
4. **RecurringDetectionCandidate**: background or on-demand job proposes templates from repeating signatures; user accepts/rejects → creates or ignores template.

## References

- Fields: [03-entities-fields.md](03-entities-fields.md)
- Status enums: [05-enums-and-statuses.md](05-enums-and-statuses.md)
