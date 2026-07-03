CREATE TYPE "public"."account_type" AS ENUM('checking', 'savings', 'cash', 'credit', 'other');--> statement-breakpoint
CREATE TYPE "public"."balance_snapshot_source" AS ENUM('manual', 'imported', 'system');--> statement-breakpoint
CREATE TYPE "public"."budget_period_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense', 'transfer_neutral');--> statement-breakpoint
CREATE TYPE "public"."detection_candidate_status" AS ENUM('suggested', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."goal_contribution_source" AS ENUM('manual', 'transaction_link', 'allocation');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('savings', 'paydown');--> statement-breakpoint
CREATE TYPE "public"."household_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."household_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'partially_applied');--> statement-breakpoint
CREATE TYPE "public"."import_source_type" AS ENUM('csv', 'manual');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'invited', 'removed');--> statement-breakpoint
CREATE TYPE "public"."occurrence_status" AS ENUM('upcoming', 'paid', 'missed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('open', 'matched', 'mismatch', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."recurring_flow_type" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'monthly', 'yearly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('cleared', 'pending');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
CREATE TABLE "account_balance_snapshots" (
	"snapshot_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"as_of_date" date NOT NULL,
	"balance" numeric(18, 2) NOT NULL,
	"source" "balance_snapshot_source" DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"account_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"institution_name" text,
	"account_mask" text,
	"opening_balance" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"current_balance" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"credit_limit" numeric(18, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"audit_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"budget_line_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_period_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"planned_amount" numeric(18, 2) NOT NULL,
	"rollover_from_previous" numeric(18, 2),
	"carryover_adjustment" numeric(18, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_periods" (
	"budget_period_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"status" "budget_period_status" DEFAULT 'draft' NOT NULL,
	"rollover_enabled" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"category_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"parent_category_id" uuid,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"contribution_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"contribution_date" date NOT NULL,
	"source_type" "goal_contribution_source" DEFAULT 'manual' NOT NULL,
	"transaction_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"goal_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"goal_type" "goal_type" NOT NULL,
	"target_amount" numeric(18, 2) NOT NULL,
	"target_date" date,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"linked_account_id" uuid,
	"linked_category_id" uuid,
	"priority" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"household_member_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "household_role" NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone,
	"invited_by" uuid
);
--> statement-breakpoint
CREATE TABLE "households" (
	"household_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_currency" text DEFAULT 'ILS' NOT NULL,
	"timezone" text DEFAULT 'Asia/Jerusalem' NOT NULL,
	"status" "household_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"import_batch_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source_type" "import_source_type" DEFAULT 'csv' NOT NULL,
	"file_name" text,
	"mapping_template_id" uuid,
	"status" "import_batch_status" DEFAULT 'pending' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_mapping_templates" (
	"mapping_template_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"column_map_json" jsonb NOT NULL,
	"sample_header_json" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows_normalized" (
	"normalized_row_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"raw_row_id" uuid NOT NULL,
	"transaction_date" date NOT NULL,
	"description" text NOT NULL,
	"merchant_name" text,
	"amount" numeric(18, 2) NOT NULL,
	"flow" "transaction_type" NOT NULL,
	"normalized_payload_json" jsonb,
	"dedupe_fingerprint" text NOT NULL,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"category_id" uuid,
	"promoted_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows_raw" (
	"raw_row_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"raw_payload_json" jsonb NOT NULL,
	"parse_error" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_sessions" (
	"reconciliation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"statement_ending_balance" numeric(18, 2) NOT NULL,
	"calculated_ending_balance" numeric(18, 2) DEFAULT '0.00' NOT NULL,
	"status" "reconciliation_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_detection_candidates" (
	"candidate_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"signature_hash" text NOT NULL,
	"confidence_score" numeric(4, 3),
	"suggested_rule_json" jsonb,
	"status" "detection_candidate_status" DEFAULT 'suggested' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_occurrences" (
	"occurrence_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"expected_amount" numeric(18, 2) NOT NULL,
	"status" "occurrence_status" DEFAULT 'upcoming' NOT NULL,
	"matched_transaction_id" uuid,
	"matched_at" timestamp with time zone,
	"actual_amount" numeric(18, 2),
	"variance_amount" numeric(18, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_templates" (
	"recurring_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"flow_type" "recurring_flow_type" NOT NULL,
	"amount_expected" numeric(18, 2) NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"start_date" date NOT NULL,
	"day_of_month" integer,
	"rrule" text,
	"tolerance_amount" numeric(18, 2),
	"account_id" uuid,
	"category_id" uuid,
	"merchant_name" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"tag_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"split_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "transaction_tags" (
	"transaction_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"transaction_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"transaction_date" date NOT NULL,
	"posted_date" date,
	"description" text NOT NULL,
	"merchant_name" text,
	"category_id" uuid,
	"status" "transaction_status" DEFAULT 'cleared' NOT NULL,
	"notes" text,
	"import_batch_id" uuid,
	"is_recurring_candidate" boolean DEFAULT false NOT NULL,
	"external_ref" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_links" (
	"transfer_link_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_transaction_id" uuid NOT NULL,
	"to_transaction_id" uuid NOT NULL,
	"fx_rate" numeric(18, 8),
	CONSTRAINT "transfer_links_from_transaction_id_unique" UNIQUE("from_transaction_id"),
	CONSTRAINT "transfer_links_to_transaction_id_unique" UNIQUE("to_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account_balance_snapshots" ADD CONSTRAINT "account_balance_snapshots_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_period_id_budget_periods_budget_period_id_fk" FOREIGN KEY ("budget_period_id") REFERENCES "public"."budget_periods"("budget_period_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_categories_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_periods" ADD CONSTRAINT "budget_periods_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_goals_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("goal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_transaction_id_transactions_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_linked_account_id_accounts_account_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_linked_category_id_categories_category_id_fk" FOREIGN KEY ("linked_category_id") REFERENCES "public"."categories"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_invited_by_users_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_mapping_template_id_import_mapping_templates_mapping_template_id_fk" FOREIGN KEY ("mapping_template_id") REFERENCES "public"."import_mapping_templates"("mapping_template_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_mapping_templates" ADD CONSTRAINT "import_mapping_templates_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows_normalized" ADD CONSTRAINT "import_rows_normalized_import_batch_id_import_batches_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("import_batch_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows_normalized" ADD CONSTRAINT "import_rows_normalized_raw_row_id_import_rows_raw_raw_row_id_fk" FOREIGN KEY ("raw_row_id") REFERENCES "public"."import_rows_raw"("raw_row_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows_normalized" ADD CONSTRAINT "import_rows_normalized_category_id_categories_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows_normalized" ADD CONSTRAINT "import_rows_normalized_promoted_transaction_id_transactions_transaction_id_fk" FOREIGN KEY ("promoted_transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows_raw" ADD CONSTRAINT "import_rows_raw_import_batch_id_import_batches_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("import_batch_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_sessions" ADD CONSTRAINT "reconciliation_sessions_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_detection_candidates" ADD CONSTRAINT "recurring_detection_candidates_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_recurring_id_recurring_templates_recurring_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_templates"("recurring_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_matched_transaction_id_transactions_transaction_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_category_id_categories_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_transactions_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_categories_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transaction_id_transactions_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_tag_id_tags_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("tag_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_links" ADD CONSTRAINT "transfer_links_from_transaction_id_transactions_transaction_id_fk" FOREIGN KEY ("from_transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_links" ADD CONSTRAINT "transfer_links_to_transaction_id_transactions_transaction_id_fk" FOREIGN KEY ("to_transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_lines_period_category_ux" ON "budget_lines" USING btree ("budget_period_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_periods_household_year_ux" ON "budget_periods" USING btree ("household_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_household_user_ux" ON "household_members" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_household_name_ux" ON "tags" USING btree ("household_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_tags_ux" ON "transaction_tags" USING btree ("transaction_id","tag_id");