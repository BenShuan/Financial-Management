import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ACCOUNT_TYPES,
  BALANCE_SNAPSHOT_SOURCES,
  BUDGET_PERIOD_STATUSES,
  CATEGORY_KINDS,
  DETECTION_CANDIDATE_STATUSES,
  GOAL_CONTRIBUTION_SOURCES,
  GOAL_STATUSES,
  GOAL_TYPES,
  HOUSEHOLD_ROLES,
  HOUSEHOLD_STATUSES,
  IMPORT_BATCH_STATUSES,
  IMPORT_SOURCE_TYPES,
  MEMBER_STATUSES,
  OCCURRENCE_STATUSES,
  RECONCILIATION_STATUSES,
  RECURRING_FLOW_TYPES,
  RECURRING_FREQUENCIES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "@financial-management/shared";

/** Money columns are NUMERIC(18,2); drizzle maps them to/from strings — never floats. */
const money = (name: string) => numeric(name, { precision: 18, scale: 2 });

export const householdStatusEnum = pgEnum("household_status", HOUSEHOLD_STATUSES);
export const householdRoleEnum = pgEnum("household_role", HOUSEHOLD_ROLES);
export const memberStatusEnum = pgEnum("member_status", MEMBER_STATUSES);
export const accountTypeEnum = pgEnum("account_type", ACCOUNT_TYPES);
export const categoryKindEnum = pgEnum("category_kind", CATEGORY_KINDS);
export const transactionTypeEnum = pgEnum("transaction_type", TRANSACTION_TYPES);
export const transactionStatusEnum = pgEnum("transaction_status", TRANSACTION_STATUSES);
export const budgetPeriodStatusEnum = pgEnum("budget_period_status", BUDGET_PERIOD_STATUSES);
export const goalTypeEnum = pgEnum("goal_type", GOAL_TYPES);
export const goalStatusEnum = pgEnum("goal_status", GOAL_STATUSES);
export const goalContributionSourceEnum = pgEnum(
  "goal_contribution_source",
  GOAL_CONTRIBUTION_SOURCES,
);
export const recurringFlowTypeEnum = pgEnum("recurring_flow_type", RECURRING_FLOW_TYPES);
export const recurringFrequencyEnum = pgEnum("recurring_frequency", RECURRING_FREQUENCIES);
export const occurrenceStatusEnum = pgEnum("occurrence_status", OCCURRENCE_STATUSES);
export const detectionCandidateStatusEnum = pgEnum(
  "detection_candidate_status",
  DETECTION_CANDIDATE_STATUSES,
);
export const importSourceTypeEnum = pgEnum("import_source_type", IMPORT_SOURCE_TYPES);
export const importBatchStatusEnum = pgEnum("import_batch_status", IMPORT_BATCH_STATUSES);
export const reconciliationStatusEnum = pgEnum(
  "reconciliation_status",
  RECONCILIATION_STATUSES,
);
export const balanceSnapshotSourceEnum = pgEnum(
  "balance_snapshot_source",
  BALANCE_SNAPSHOT_SOURCES,
);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable("users", {
  userId: uuid("user_id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const households = pgTable("households", {
  householdId: uuid("household_id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("ILS"),
  timezone: text("timezone").notNull().default("Asia/Jerusalem"),
  status: householdStatusEnum("status").notNull().default("active"),
  createdAt: createdAt(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdMemberId: uuid("household_member_id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.householdId),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId),
    role: householdRoleEnum("role").notNull(),
    status: memberStatusEnum("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    invitedBy: uuid("invited_by").references(() => users.userId),
  },
  (t) => [uniqueIndex("household_members_household_user_ux").on(t.householdId, t.userId)],
);

export const accounts = pgTable("accounts", {
  accountId: uuid("account_id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.householdId),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  institutionName: text("institution_name"),
  accountMask: text("account_mask"),
  openingBalance: money("opening_balance").notNull().default("0.00"),
  currentBalance: money("current_balance").notNull().default("0.00"),
  creditLimit: money("credit_limit"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const categories = pgTable("categories", {
  categoryId: uuid("category_id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.householdId),
  name: text("name").notNull(),
  kind: categoryKindEnum("kind").notNull(),
  parentCategoryId: uuid("parent_category_id"),
  icon: text("icon"),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const tags = pgTable(
  "tags",
  {
    tagId: uuid("tag_id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.householdId),
    name: text("name").notNull(),
    color: text("color"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_household_name_ux").on(t.householdId, t.name)],
);

export const transactions = pgTable("transactions", {
  transactionId: uuid("transaction_id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.householdId),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.accountId),
  type: transactionTypeEnum("type").notNull(),
  /** Positive scalar; direction comes from `type` (and transfer legs). */
  amount: money("amount").notNull(),
  transactionDate: date("transaction_date").notNull(),
  postedDate: date("posted_date"),
  description: text("description").notNull(),
  merchantName: text("merchant_name"),
  /** User-assigned only (docs invariant 5); null for transfer legs or when splits exist. */
  categoryId: uuid("category_id").references(() => categories.categoryId),
  status: transactionStatusEnum("status").notNull().default("cleared"),
  notes: text("notes"),
  importBatchId: uuid("import_batch_id"),
  isRecurringCandidate: boolean("is_recurring_candidate").notNull().default(false),
  externalRef: text("external_ref"),
  createdBy: uuid("created_by").references(() => users.userId),
  createdAt: createdAt(),
});

export const transactionSplits = pgTable("transaction_splits", {
  splitId: uuid("split_id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.transactionId, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.categoryId),
  amount: money("amount").notNull(),
  note: text("note"),
});

export const transferLinks = pgTable("transfer_links", {
  transferLinkId: uuid("transfer_link_id").defaultRandom().primaryKey(),
  fromTransactionId: uuid("from_transaction_id")
    .notNull()
    .unique()
    .references(() => transactions.transactionId, { onDelete: "cascade" }),
  toTransactionId: uuid("to_transaction_id")
    .notNull()
    .unique()
    .references(() => transactions.transactionId, { onDelete: "cascade" }),
  /** Reserved for future multi-currency; unused in v1. */
  fxRate: numeric("fx_rate", { precision: 18, scale: 8 }),
});

export const transactionTags = pgTable(
  "transaction_tags",
  {
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.transactionId, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.tagId, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("transaction_tags_ux").on(t.transactionId, t.tagId)],
);

export const budgetPeriods = pgTable(
  "budget_periods",
  {
    budgetPeriodId: uuid("budget_period_id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.householdId),
    year: integer("year").notNull(),
    status: budgetPeriodStatusEnum("status").notNull().default("draft"),
    rolloverEnabled: boolean("rollover_enabled").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budget_periods_household_year_ux").on(t.householdId, t.year)],
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    budgetLineId: uuid("budget_line_id").defaultRandom().primaryKey(),
    budgetPeriodId: uuid("budget_period_id")
      .notNull()
      .references(() => budgetPeriods.budgetPeriodId, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.categoryId),
    /** Annual planned amount; monthly view derived at read time (never stored). */
    plannedAmount: money("planned_amount").notNull(),
    rolloverFromPrevious: money("rollover_from_previous"),
    carryoverAdjustment: money("carryover_adjustment"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budget_lines_period_category_ux").on(t.budgetPeriodId, t.categoryId)],
);

export const goals = pgTable("goals", {
  goalId: uuid("goal_id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.householdId),
  name: text("name").notNull(),
  goalType: goalTypeEnum("goal_type").notNull(),
  targetAmount: money("target_amount").notNull(),
  targetDate: date("target_date"),
  status: goalStatusEnum("status").notNull().default("active"),
  linkedAccountId: uuid("linked_account_id").references(() => accounts.accountId),
  linkedCategoryId: uuid("linked_category_id").references(() => categories.categoryId),
  priority: integer("priority"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const goalContributions = pgTable("goal_contributions", {
  contributionId: uuid("contribution_id").defaultRandom().primaryKey(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.goalId, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  contributionDate: date("contribution_date").notNull(),
  sourceType: goalContributionSourceEnum("source_type").notNull().default("manual"),
  transactionId: uuid("transaction_id").references(() => transactions.transactionId),
  note: text("note"),
  createdAt: createdAt(),
});

export const recurringTemplates = pgTable("recurring_templates", {
  recurringId: uuid("recurring_id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.householdId),
  name: text("name").notNull(),
  flowType: recurringFlowTypeEnum("flow_type").notNull(),
  amountExpected: money("amount_expected").notNull(),
  frequency: recurringFrequencyEnum("frequency").notNull(),
  startDate: date("start_date").notNull(),
  dayOfMonth: integer("day_of_month"),
  rrule: text("rrule"),
  toleranceAmount: money("tolerance_amount"),
  accountId: uuid("account_id").references(() => accounts.accountId),
  categoryId: uuid("category_id").references(() => categories.categoryId),
  merchantName: text("merchant_name"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const recurringOccurrences = pgTable("recurring_occurrences", {
  occurrenceId: uuid("occurrence_id").defaultRandom().primaryKey(),
  recurringId: uuid("recurring_id")
    .notNull()
    .references(() => recurringTemplates.recurringId, { onDelete: "cascade" }),
  dueDate: date("due_date").notNull(),
  expectedAmount: money("expected_amount").notNull(),
  status: occurrenceStatusEnum("status").notNull().default("upcoming"),
  matchedTransactionId: uuid("matched_transaction_id").references(
    () => transactions.transactionId,
  ),
  matchedAt: timestamp("matched_at", { withTimezone: true }),
  actualAmount: money("actual_amount"),
  varianceAmount: money("variance_amount"),
  createdAt: createdAt(),
});

export const recurringDetectionCandidates = pgTable("recurring_detection_candidates", {
  candidateId: uuid("candidate_id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.householdId),
  signatureHash: text("signature_hash").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }),
  suggestedRuleJson: jsonb("suggested_rule_json"),
  status: detectionCandidateStatusEnum("status").notNull().default("suggested"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
});

export const importMappingTemplates = pgTable("import_mapping_templates", {
  mappingTemplateId: uuid("mapping_template_id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.householdId),
  name: text("name").notNull(),
  columnMapJson: jsonb("column_map_json").notNull(),
  sampleHeaderJson: jsonb("sample_header_json"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: createdAt(),
});

export const importBatches = pgTable("import_batches", {
  importBatchId: uuid("import_batch_id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.householdId),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.accountId),
  sourceType: importSourceTypeEnum("source_type").notNull().default("csv"),
  fileName: text("file_name"),
  mappingTemplateId: uuid("mapping_template_id").references(
    () => importMappingTemplates.mappingTemplateId,
  ),
  status: importBatchStatusEnum("status").notNull().default("pending"),
  rowCount: integer("row_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
});

export const importRowsRaw = pgTable("import_rows_raw", {
  rawRowId: uuid("raw_row_id").defaultRandom().primaryKey(),
  importBatchId: uuid("import_batch_id")
    .notNull()
    .references(() => importBatches.importBatchId, { onDelete: "cascade" }),
  rowIndex: integer("row_index").notNull(),
  rawPayloadJson: jsonb("raw_payload_json").notNull(),
  parseError: text("parse_error"),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
});

export const importRowsNormalized = pgTable("import_rows_normalized", {
  normalizedRowId: uuid("normalized_row_id").defaultRandom().primaryKey(),
  importBatchId: uuid("import_batch_id")
    .notNull()
    .references(() => importBatches.importBatchId, { onDelete: "cascade" }),
  rawRowId: uuid("raw_row_id")
    .notNull()
    .references(() => importRowsRaw.rawRowId, { onDelete: "cascade" }),
  transactionDate: date("transaction_date").notNull(),
  description: text("description").notNull(),
  merchantName: text("merchant_name"),
  /** Positive scalar; flow captured separately from the mapping sign convention. */
  amount: money("amount").notNull(),
  flow: transactionTypeEnum("flow").notNull(),
  normalizedPayloadJson: jsonb("normalized_payload_json"),
  dedupeFingerprint: text("dedupe_fingerprint").notNull(),
  isDuplicate: boolean("is_duplicate").notNull().default(false),
  /** Assigned by the user during review; required before promotion. */
  categoryId: uuid("category_id").references(() => categories.categoryId),
  promotedTransactionId: uuid("promoted_transaction_id").references(
    () => transactions.transactionId,
    { onDelete: "set null" },
  ),
  createdAt: createdAt(),
});

export const reconciliationSessions = pgTable("reconciliation_sessions", {
  reconciliationId: uuid("reconciliation_id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.accountId),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  statementEndingBalance: money("statement_ending_balance").notNull(),
  calculatedEndingBalance: money("calculated_ending_balance").notNull().default("0.00"),
  status: reconciliationStatusEnum("status").notNull().default("open"),
  notes: text("notes"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditEvents = pgTable("audit_events", {
  auditId: uuid("audit_id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.householdId),
  actorUserId: uuid("actor_user_id").references(() => users.userId),
  actionType: text("action_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  beforeSnapshot: jsonb("before_snapshot"),
  afterSnapshot: jsonb("after_snapshot"),
  ipAddress: text("ip_address"),
  createdAt: createdAt(),
});

export const accountBalanceSnapshots = pgTable("account_balance_snapshots", {
  snapshotId: uuid("snapshot_id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.accountId),
  asOfDate: date("as_of_date").notNull(),
  balance: money("balance").notNull(),
  source: balanceSnapshotSourceEnum("source").notNull().default("system"),
  createdAt: createdAt(),
});
