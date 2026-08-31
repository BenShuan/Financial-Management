ALTER TABLE "categories" ADD COLUMN "code" text;
--> statement-breakpoint
-- Best-effort backfill for the known dev-seed category names (apps/api/src/db/seed.ts),
-- so households seeded before this migration also get codes without a reseed.
-- Income categories get a Hebrew letter, expense categories get a sequential number.
-- Only fills rows that don't already have a code (never overwrites a user's own edit).
UPDATE "categories" SET "code" = 'מ' WHERE "name" = 'משכורת' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = 'ב' WHERE "name" = 'בונוס' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = 'ה' WHERE "name" = 'הכנסות מהשקעות' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = 'כ' WHERE "name" = 'הכנסה אחרת' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '1' WHERE "name" = 'דיור' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '2' WHERE "name" = 'שכירות / משכנתא' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '3' WHERE "name" = 'תחזוקת בית' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '4' WHERE "name" = 'חשבונות ושירותים' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '5' WHERE "name" = 'מכולת' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '6' WHERE "name" = 'תחבורה' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '7' WHERE "name" = 'אוכל בחוץ' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '8' WHERE "name" = 'בריאות' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '9' WHERE "name" = 'ביטוח' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '10' WHERE "name" = 'חינוך וילדים' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '11' WHERE "name" = 'בילויים' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '12' WHERE "name" = 'קניות' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '13' WHERE "name" = 'מנויים' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '14' WHERE "name" = 'נסיעות' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '15' WHERE "name" = 'מתנות ותרומות' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '16' WHERE "name" = 'עמלות' AND "code" IS NULL;
--> statement-breakpoint
UPDATE "categories" SET "code" = '17' WHERE "name" = 'הוצאה אחרת' AND "code" IS NULL;