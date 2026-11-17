import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { HouseholdRole } from "@financial-management/shared";
import { isAllowedOrigin } from "../lib/origins.js";
import { resolveSession } from "../lib/session.js";
import type { AppEnv, AuthContext } from "../types.js";

/**
 * Session auth: resolves the HTTP-only session cookie to the user's household
 * membership (household + live role). Replaces the old dev-auth stub.
 */
export const sessionAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = await resolveSession(c);
  if (!auth) throw new HTTPException(401, { message: "נדרשת התחברות" });
  c.set("auth", auth);
  await next();
});

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defense for cookie auth. The production cookie is SameSite=None (web and
 * API are on different sites), so state-changing requests must come from an
 * allowed web origin. Non-browser clients send no Origin and are not CSRF-able.
 */
export const csrfOriginCheck = createMiddleware<AppEnv>(async (c, next) => {
  const origin = c.req.header("origin");
  if (!SAFE_METHODS.has(c.req.method) && origin && !isAllowedOrigin(origin)) {
    throw new HTTPException(403, { message: "מקור הבקשה אינו מורשה" });
  }
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
