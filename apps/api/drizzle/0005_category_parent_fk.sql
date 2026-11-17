-- Orphaned parent references (pointing at a deleted row) would make the FK fail at boot; promote them to top level.
UPDATE "categories" SET "parent_category_id" = NULL WHERE "parent_category_id" IS NOT NULL AND "parent_category_id" NOT IN (SELECT "category_id" FROM "categories");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_categories_category_id_fk" FOREIGN KEY ("parent_category_id") REFERENCES "public"."categories"("category_id") ON DELETE no action ON UPDATE no action;
