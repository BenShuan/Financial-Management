import { createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  loginInputSchema,
  logoutResponseSchema,
  registerInputSchema,
  sessionContextSchema,
} from "@financial-management/shared";
import { db } from "../db/index.js";
import { householdMembers, households, users } from "../db/schema.js";
import { emitAuditEvent } from "../lib/audit.js";
import { insertDefaultCategories } from "../lib/default-categories.js";
import { clearFailures, isThrottled, recordFailure } from "../lib/login-throttle.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createRouter } from "../lib/router.js";
import { createSession, destroySession, findActiveMembership } from "../lib/session.js";
import type { AuthContext } from "../types.js";
import { buildSessionContext } from "./session-context.js";

export const authRouter = createRouter();

const json = <T extends z.ZodTypeAny>(schema: T) => ({ "application/json": { schema } });
const errorSchema = z.object({ error: z.string(), message: z.string().optional() });

// Verified against this when the email is unknown, so timing doesn't reveal which emails exist.
const DUMMY_HASH = await hashPassword("dummy-password-for-timing");

const EMAIL_TAKEN = "כתובת האימייל כבר רשומה";

const registerRoute = createRoute({
  method: "post",
  path: "/api/auth/register",
  tags: ["Auth"],
  summary: "Create a user and a new household they own, then sign in",
  request: { body: { content: json(registerInputSchema), required: true } },
  responses: {
    201: { description: "Registered and signed in", content: json(sessionContextSchema) },
    409: { description: "Email already registered", content: json(errorSchema) },
  },
});

authRouter.openapi(registerRoute, async (c) => {
  const input = c.req.valid("json");
  const [existing] = await db.select().from(users).where(eq(users.email, input.email));
  if (existing) throw new HTTPException(409, { message: EMAIL_TAKEN });

  const passwordHash = await hashPassword(input.password);
  const created = await db
    .transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          lastLoginAt: new Date(),
        })
        .returning();
      const [household] = await tx
        .insert(households)
        .values({ name: input.householdName })
        .returning();
      if (!user || !household) throw new Error("failed to create user/household");
      await tx.insert(householdMembers).values({
        householdId: household.householdId,
        userId: user.userId,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
      });
      return { user, household };
    })
    .catch((err: unknown) => {
      // Concurrent registration with the same email loses on the unique index.
      if ((err as { code?: string }).code === "23505") {
        throw new HTTPException(409, { message: EMAIL_TAKEN });
      }
      throw err;
    });

  const auth: AuthContext = {
    userId: created.user.userId,
    householdId: created.household.householdId,
    role: "owner",
  };
  await insertDefaultCategories(auth.householdId);
  await emitAuditEvent(auth, {
    actionType: "household.created",
    entityType: "household",
    entityId: auth.householdId,
    after: { name: created.household.name, ownerUserId: auth.userId },
  });
  await createSession(c, auth.userId, auth.householdId);
  return c.json(await buildSessionContext(auth), 201);
});

const loginRoute = createRoute({
  method: "post",
  path: "/api/auth/login",
  tags: ["Auth"],
  summary: "Sign in with email and password (sets the session cookie)",
  request: { body: { content: json(loginInputSchema), required: true } },
  responses: {
    200: { description: "Signed in", content: json(sessionContextSchema) },
    401: { description: "Invalid credentials", content: json(errorSchema) },
    429: { description: "Too many failed attempts", content: json(errorSchema) },
  },
});

authRouter.openapi(loginRoute, async (c) => {
  const { email, password } = c.req.valid("json");
  if (isThrottled(email)) {
    throw new HTTPException(429, { message: "יותר מדי ניסיונות. נסו שוב בעוד מספר דקות" });
  }
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  const membership = user && ok ? await findActiveMembership(user.userId) : null;
  if (!user || !user.passwordHash || !ok || !membership) {
    recordFailure(email);
    throw new HTTPException(401, { message: "אימייל או סיסמה שגויים" });
  }
  clearFailures(email);

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.userId, user.userId));
  await createSession(c, user.userId, membership.householdId);
  return c.json(
    await buildSessionContext({
      userId: user.userId,
      householdId: membership.householdId,
      role: membership.role,
    }),
    200,
  );
});

const logoutRoute = createRoute({
  method: "post",
  path: "/api/auth/logout",
  tags: ["Auth"],
  summary: "Destroy the current session",
  responses: { 200: { description: "Signed out", content: json(logoutResponseSchema) } },
});

authRouter.openapi(logoutRoute, async (c) => {
  await destroySession(c);
  return c.json({ ok: true as const }, 200);
});
