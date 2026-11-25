-- FM-29 bank sync. Idempotent: every statement is safe to re-run on a database that already has these objects.
-- New enum value is added in its own statement and is not used in this migration.
ALTER TYPE "public"."import_source_type" ADD VALUE IF NOT EXISTS 'bank_sync';--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."bank_sync_provider" AS ENUM('discount', 'isracard', 'max');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."sync_account_link_status" AS ENUM('unmapped', 'linked', 'ignored');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_account_links" (
	"sync_account_link_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" "bank_sync_provider" NOT NULL,
	"external_account_number" text NOT NULL,
	"account_id" uuid,
	"status" "sync_account_link_status" DEFAULT 'unmapped' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sync_account_links" ADD CONSTRAINT "sync_account_links_household_id_households_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("household_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sync_account_links" ADD CONSTRAINT "sync_account_links_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_account_links_household_provider_number_ux" ON "sync_account_links" USING btree ("household_id","provider","external_account_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_account_external_ref_ux" ON "transactions" USING btree ("account_id","external_ref");
