/**
 * Sets (or resets) a user's login password, e.g. for the users created before
 * password auth existed:
 *   EMAIL=dev@hearth.local NEW_PASSWORD='...' pnpm --filter @financial-management/api db:set-password
 * Values come from env so the password never lands in shell history args or git.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { passwordSchema } from "@financial-management/shared";
import { hashPassword } from "../lib/password.js";
import { db } from "./index.js";
import { users } from "./schema.js";

const email = process.env.EMAIL?.trim().toLowerCase();
const parsed = passwordSchema.safeParse(process.env.NEW_PASSWORD);
if (!email || !parsed.success) {
  console.error(
    `Usage: EMAIL=<email> NEW_PASSWORD=<min 10 chars> db:set-password${
      parsed.success ? "" : ` (${parsed.error.issues[0]?.message})`
    }`,
  );
  process.exit(1);
}

const updated = await db
  .update(users)
  .set({ passwordHash: await hashPassword(parsed.data) })
  .where(eq(users.email, email))
  .returning({ userId: users.userId });
console.log(updated.length ? `Password set for ${email}.` : `No user with email ${email}.`);
process.exit(updated.length ? 0 : 1);
