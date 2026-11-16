import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db } from "../db/index.js";
import { householdMembers, sessions } from "../db/schema.js";
import type { AuthContext } from "../types.js";

export const SESSION_COOKIE = "fm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Cross-site in production (Vercel web <-> Render API) needs SameSite=None; Secure.
 * Locally both sit on localhost (same site), so Lax works over plain http.
 * CSRF for the None case is covered by the Origin check in middleware/auth.ts.
 */
function cookieOptions(expires?: Date) {
  const prod = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? ("None" as const) : ("Lax" as const),
    path: "/",
    ...(expires ? { expires } : {}),
  };
}

/** First active membership of the user (oldest join first). */
export async function findActiveMembership(userId: string) {
  const [member] = await db
    .select({
      householdId: householdMembers.householdId,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, userId), eq(householdMembers.status, "active")))
    .orderBy(householdMembers.joinedAt)
    .limit(1);
  return member ?? null;
}

export async function createSession(
  c: Context,
  userId: string,
  householdId: string,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, householdId, expiresAt });
  setCookie(c, SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function destroySession(c: Context): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  deleteCookie(c, SESSION_COOKIE, cookieOptions());
}

/**
 * Resolves the request's session to an AuthContext. The role is read from the
 * live membership row, so role changes and removals apply immediately.
 */
export async function resolveSession(c: Context): Promise<AuthContext | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const [row] = await db
    .select({
      userId: sessions.userId,
      householdId: sessions.householdId,
      role: householdMembers.role,
    })
    .from(sessions)
    .innerJoin(
      householdMembers,
      and(
        eq(householdMembers.userId, sessions.userId),
        eq(householdMembers.householdId, sessions.householdId),
        eq(householdMembers.status, "active"),
      ),
    )
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}
