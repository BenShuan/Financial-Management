import { z } from "zod";

/** Enum values mirror docs/agent/05-enums-and-statuses.md exactly (lowercase snake_case). */

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const TRANSACTION_STATUSES = ["cleared", "pending"] as const;
export const transactionStatusSchema = z.enum(TRANSACTION_STATUSES);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export const CATEGORY_KINDS = ["income", "expense", "transfer_neutral"] as const;
export const categoryKindSchema = z.enum(CATEGORY_KINDS);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

export const ACCOUNT_TYPES = ["checking", "savings", "cash", "credit", "other"] as const;
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const HOUSEHOLD_ROLES = ["owner", "admin", "member", "viewer"] as const;
export const householdRoleSchema = z.enum(HOUSEHOLD_ROLES);
export type HouseholdRole = z.infer<typeof householdRoleSchema>;

export const MEMBER_STATUSES = ["active", "invited", "removed"] as const;
export const memberStatusSchema = z.enum(MEMBER_STATUSES);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

export const HOUSEHOLD_STATUSES = ["active", "archived"] as const;
export const householdStatusSchema = z.enum(HOUSEHOLD_STATUSES);
export type HouseholdStatus = z.infer<typeof householdStatusSchema>;

export const BUDGET_PERIOD_STATUSES = ["draft", "active", "closed"] as const;
export const budgetPeriodStatusSchema = z.enum(BUDGET_PERIOD_STATUSES);
export type BudgetPeriodStatus = z.infer<typeof budgetPeriodStatusSchema>;

export const GOAL_TYPES = ["savings", "paydown"] as const;
export const goalTypeSchema = z.enum(GOAL_TYPES);
export type GoalType = z.infer<typeof goalTypeSchema>;

export const GOAL_STATUSES = ["active", "completed", "cancelled"] as const;
export const goalStatusSchema = z.enum(GOAL_STATUSES);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const GOAL_CONTRIBUTION_SOURCES = ["manual", "transaction_link", "allocation"] as const;
export const goalContributionSourceSchema = z.enum(GOAL_CONTRIBUTION_SOURCES);
export type GoalContributionSource = z.infer<typeof goalContributionSourceSchema>;

export const RECURRING_FLOW_TYPES = ["expense", "income"] as const;
export const recurringFlowTypeSchema = z.enum(RECURRING_FLOW_TYPES);
export type RecurringFlowType = z.infer<typeof recurringFlowTypeSchema>;

export const RECURRING_FREQUENCIES = ["weekly", "monthly", "yearly", "custom"] as const;
export const recurringFrequencySchema = z.enum(RECURRING_FREQUENCIES);
export type RecurringFrequency = z.infer<typeof recurringFrequencySchema>;

export const OCCURRENCE_STATUSES = ["upcoming", "paid", "missed", "skipped"] as const;
export const occurrenceStatusSchema = z.enum(OCCURRENCE_STATUSES);
export type OccurrenceStatus = z.infer<typeof occurrenceStatusSchema>;

export const DETECTION_CANDIDATE_STATUSES = ["suggested", "accepted", "rejected"] as const;
export const detectionCandidateStatusSchema = z.enum(DETECTION_CANDIDATE_STATUSES);
export type DetectionCandidateStatus = z.infer<typeof detectionCandidateStatusSchema>;

export const IMPORT_SOURCE_TYPES = ["csv", "manual", "bank_sync"] as const;
export const importSourceTypeSchema = z.enum(IMPORT_SOURCE_TYPES);
export type ImportSourceType = z.infer<typeof importSourceTypeSchema>;

export const IMPORT_BATCH_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "partially_applied",
] as const;
export const importBatchStatusSchema = z.enum(IMPORT_BATCH_STATUSES);
export type ImportBatchStatus = z.infer<typeof importBatchStatusSchema>;

export const RECONCILIATION_STATUSES = [
  "open",
  "matched",
  "mismatch",
  "resolved",
  "closed",
] as const;
export const reconciliationStatusSchema = z.enum(RECONCILIATION_STATUSES);
export type ReconciliationStatus = z.infer<typeof reconciliationStatusSchema>;

export const BALANCE_SNAPSHOT_SOURCES = ["manual", "imported", "system"] as const;
export const balanceSnapshotSourceSchema = z.enum(BALANCE_SNAPSHOT_SOURCES);
export type BalanceSnapshotSource = z.infer<typeof balanceSnapshotSourceSchema>;

/** Providers supported by the local bank-sync app (apps/bank-sync); no OTP providers in v1. */
export const BANK_SYNC_PROVIDERS = ["discount", "isracard", "max"] as const;
export const bankSyncProviderSchema = z.enum(BANK_SYNC_PROVIDERS);
export type BankSyncProvider = z.infer<typeof bankSyncProviderSchema>;

export const BANK_SYNC_PROVIDER_LABELS: Record<BankSyncProvider, string> = {
  discount: "דיסקונט",
  isracard: "ישראכרט",
  max: "מקס",
};

export const BANK_SYNC_PROVIDER_KINDS: Record<BankSyncProvider, "bank" | "card"> = {
  discount: "bank",
  isracard: "card",
  max: "card",
};

export const SYNC_ACCOUNT_LINK_STATUSES = ["unmapped", "linked", "ignored"] as const;
export const syncAccountLinkStatusSchema = z.enum(SYNC_ACCOUNT_LINK_STATUSES);
export type SyncAccountLinkStatus = z.infer<typeof syncAccountLinkStatusSchema>;
