import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { HouseholdRole } from "@financial-management/shared";
import { db } from "../db/index.js";
import { householdMembers } from "../db/schema.js";
import type { AppEnv, AuthContext } from "../types.js";

/**
 * Deployment gate until real auth lands: when ACCESS_SECRET is set, every request
 * must carry `Authorization: Bearer <secret>`. No-op in local dev (secret unset).
 */
export const accessGate = createMiddleware<AppEnv>(async (c, next) => {
  const secret = process.env.ACCESS_SECRET;
  if (!secret) return next();
  if (c.req.header("authorization") !== `Bearer ${secret}`) {
    throw new HTTPException(401, { message: "נדרש קוד גישה" });
  }
  await next();
});

let cachedDevAuth: AuthContext | null = null;

/**
 * Dev auth stub: every request acts as the seeded owner of the first household.
 * Replace with real session resolution when auth lands; role checks below stay as-is.
 */
export const devAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!cachedDevAuth) {
    const [member] = await db
      .select({
        userId: householdMembers.userId,
        householdId: householdMembers.householdId,
        role: householdMembers.role,
      })
      .from(householdMembers)
      .where(
        and(eq(householdMembers.role, "owner"), eq(householdMembers.status, "active")),
      )
      .limit(1);
    if (!member) {
      throw new HTTPException(503, {
        message: "לא נמצא משתמש מפתח — יש להריץ pnpm db:seed",
      });
    }
    cachedDevAuth = member;
  }
  c.set("auth", cachedDevAuth);
  await next();
});

const ROLE_RANK: Record<HouseholdRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/** Server-side authorization: requires the current member to be at least `minRole`. */
export function requireRole(auth: AuthContext, minRole: HouseholdRole): void {
  if (ROLE_RANK[auth.role] < ROLE_RANK[minRole]) {
    throw new HTTPException(403, { message: "אין לך הרשאה לבצע פעולה זו" });
  }
}
