# Domain model

```yaml
version: 1.0.0
last_updated: 2026-04-04
breaking: "no"
```

## Entity glossary

| Entity | One-line definition |
|--------|---------------------|
| `Household` | Tenant root; owns currency and timezone. |
| `User` | Login identity; can belong to many households via membership. |
| `HouseholdMember` | Join of user to household with role. |
| `AuditEvent` | Lightweight append-only activity log for accountability. |
| `Account` | Financial container (checking, credit, etc.) with balances. |
| `AccountBalanceSnapshot` | Point-in-time balance for history and reconciliation context. |
| `ReconciliationSession` | One reconciliation attempt for an account over a statement period. |
| `Transaction` | Single posting: income, expense, or one leg of a transfer. |
| `TransferLink` | Pairs two transactions as one logical transfer. |
| `TransactionSplit` | Allocates part of one transaction to a category. |
| `TransactionTag` | Many-to-many link transaction ↔ tag. |
| `Category` | Hierarchical classification; budget lines attach here. |
| `Tag` | Cross-cutting label. |
| `CategorizationRule` | Condition/action JSON for auto-categorization. |
| `BudgetPeriod` | Time bucket (e.g. month) for planning. |
| `BudgetLine` | Planned amount per category within a period. |
| `Goal` | Savings or paydown target. |
| `GoalContribution` | Movement toward a goal (manual or linked to transaction). |
| `RecurringTemplate` | Definition of expected recurring cashflow. |
| `RecurringOccurrence` | One expected instance (due date, match state). |
| `RecurringDetectionCandidate` | Suggested template from pattern mining. |
| `ImportBatch` | One upload/import run for an account. |
| `ImportRowRaw` | Unparsed CSV row payload. |
| `ImportRowNormalized` | Parsed row ready for dedupe and promotion. |
| `ImportMappingTemplate` | Saved column mapping for repeat imports. |

## Relationship diagram (ERD)

High-level ownership and foreign keys. Implementation may add indexes and soft-delete columns per [03-entities-fields.md](03-entities-fields.md).

```mermaid
flowchart TD
    Household[Household]
    User[User]
    HouseholdMember[HouseholdMember]
    AuditEvent[AuditEvent]

    Account[Account]
    AccountBalanceSnapshot[AccountBalanceSnapshot]
    ReconciliationSession[ReconciliationSession]

    Transaction[Transaction]
    TransactionSplit[TransactionSplit]
    TransferLink[TransferLink]
    TransactionTag[TransactionTag]

    Category[Category]
    Tag[Tag]
    CategorizationRule[CategorizationRule]

    BudgetPeriod[BudgetPeriod]
    BudgetLine[BudgetLine]
    Goal[Goal]
    GoalContribution[GoalContribution]

    RecurringTemplate[RecurringTemplate]
    RecurringOccurrence[RecurringOccurrence]
    RecurringDetectionCandidate[RecurringDetectionCandidate]

    ImportBatch[ImportBatch]
    ImportRowRaw[ImportRowRaw]
    ImportRowNormalized[ImportRowNormalized]
    ImportMappingTemplate[ImportMappingTemplate]

    Household --> HouseholdMember
    User --> HouseholdMember
    Household --> AuditEvent

    Household --> Account
    Account --> AccountBalanceSnapshot
    Account --> ReconciliationSession

    Household --> Transaction
    Account --> Transaction
    Transaction --> TransactionSplit
    Transaction --> TransactionTag
    Transaction --> TransferLink

    Household --> Category
    Household --> Tag
    Household --> CategorizationRule
    Category --> BudgetLine
    Category --> TransactionSplit

    Household --> BudgetPeriod
    BudgetPeriod --> BudgetLine

    Household --> Goal
    Goal --> GoalContribution

    Household --> RecurringTemplate
    RecurringTemplate --> RecurringOccurrence
    Household --> RecurringDetectionCandidate

    Household --> ImportBatch
    Account --> ImportBatch
    ImportBatch --> ImportRowRaw
    ImportRowRaw --> ImportRowNormalized
    Household --> ImportMappingTemplate
```

## Transaction-centric data flow

```mermaid
flowchart LR
    CsvImport[CSV Import]
    ImportBatch[ImportBatch]
    ImportRowRaw[ImportRowRaw]
    ImportRowNormalized[ImportRowNormalized]
    Rules[CategorizationRule Engine]
    Transaction[Transaction]
    Category[Category]
    Tag[Tag]
    TransactionSplit[TransactionSplit]
    Reconcile[ReconciliationSession]
    BudgetUsage[BudgetPeriod and BudgetLine]
    GoalContribution[GoalContribution]
    AuditEvent[AuditEvent]

    CsvImport --> ImportBatch
    ImportBatch --> ImportRowRaw
    ImportRowRaw --> ImportRowNormalized
    ImportRowNormalized --> Rules
    Rules --> Transaction
    Transaction --> Category
    Transaction --> Tag
    Transaction --> TransactionSplit
    Transaction --> Reconcile
    Transaction --> BudgetUsage
    Transaction --> GoalContribution
    Transaction --> AuditEvent
```

## References

- Field-level spec: [03-entities-fields.md](03-entities-fields.md)
- Enums: [05-enums-and-statuses.md](05-enums-and-statuses.md)
