import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { SessionContext } from "@financial-management/shared";
import { db } from "../db/index.js";
import { households, users } from "../db/schema.js";
import type { AuthContext } from "../types.js";

/** User + household + role payload shared by /api/me and the auth endpoints. */
export async function buildSessionContext(auth: AuthContext): Promise<SessionContext> {
  const [user] = await db.select().from(users).where(eq(users.userId, auth.userId));
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.householdId, auth.householdId));
  if (!user || !household) {
    throw new HTTPException(500, { message: "חסר הקשר משתמש" });
  }
  return {
    user: {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    },
    household: {
      householdId: household.householdId,
      name: household.name,
      baseCurrency: household.baseCurrency,
      timezone: household.timezone,
      status: household.status,
      createdAt: household.createdAt.toISOString(),
    },
    role: auth.role,
  };
}
