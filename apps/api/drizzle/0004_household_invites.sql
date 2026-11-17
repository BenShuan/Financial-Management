ALTER TABLE "household_members" ADD COLUMN "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "household_members" ADD COLUMN "invite_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_invite_token_hash_unique" UNIQUE("invite_token_hash");