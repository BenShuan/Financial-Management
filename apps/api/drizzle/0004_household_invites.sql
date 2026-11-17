ALTER TABLE "household_members" ADD COLUMN IF NOT EXISTS "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "household_members" ADD COLUMN IF NOT EXISTS "invite_expires_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "household_members" ADD CONSTRAINT "household_members_invite_token_hash_unique" UNIQUE("invite_token_hash");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;