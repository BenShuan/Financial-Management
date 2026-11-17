import { randomUUID } from "node:crypto";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { HouseholdRole } from "@financial-management/shared";
import type { AppEnv, AuthContext } from "../types.js";

/**
 * Shared setup for Postgres integration tests (`*.integration.test.ts`). Opt-in: suites use
 * `describe.skipIf(!TEST_DATABASE_URL)`. Everything created through the harness is removed in
 * `cleanup()`, so it is safe to point TEST_DATABASE_URL at the local dev database.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export async function createHarness() {
  // db/index.ts reads DATABASE_URL at import time, so set it before the first import.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { db } = await import("../db/index.js");
  const schema = await import("../db/schema.js");
  const { runMigrations } = await import("../db/migrate.js");
  const { createRouter } = await import("../lib/router.js");
  const { HTTPException } = await import("hono/http-exception");
  const { inArray } = await import("drizzle-orm");
  await runMigrations();

  const householdIds: string[] = [];
  const userIds: string[] = [];

  /** Creates a household with one active member of `role`; returns its auth context. */
  async function createHousehold(role: HouseholdRole = "owner"): Promise<AuthContext> {
    const [user] = await db
      .insert(schema.users)
      .values({ email: `test-${randomUUID()}@example.test`, displayName: "בדיקה" })
      .returning();
    const [household] = await db
      .insert(schema.households)
      .values({ name: `test-${randomUUID()}` })
      .returning();
    await db.insert(schema.householdMembers).values({
      householdId: household!.householdId,
      userId: user!.userId,
      role,
      status: "active",
      joinedAt: new Date(),
    });
    householdIds.push(household!.householdId);
    userIds.push(user!.userId);
    return { userId: user!.userId, householdId: household!.householdId, role };
  }

  /** Mounts `router` behind a stub that injects `auth()` — no session cookie needed. */
  function appFor(router: OpenAPIHono<AppEnv>, auth: () => AuthContext) {
    const app = createRouter();
    app.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json({ error: "http_error", message: err.message }, err.status);
      }
      throw err;
    });
    app.use("*", async (c, next) => {
      c.set("auth", auth());
      await next();
    });
    app.route("/", router);
    return app;
  }

  function json(method: string, body?: unknown): RequestInit {
    return {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    };
  }

  async function cleanup() {
    if (householdIds.length > 0) {
      const members = await db
        .select({ userId: schema.householdMembers.userId })
        .from(schema.householdMembers)
        .where(inArray(schema.householdMembers.householdId, householdIds));
      const allUserIds = [...new Set([...userIds, ...members.map((m) => m.userId)])];
      // Children first; transfer links, splits and tags cascade from transactions.
      await db.delete(schema.auditEvents).where(inArray(schema.auditEvents.householdId, householdIds));
      await db.delete(schema.transactions).where(inArray(schema.transactions.householdId, householdIds));
      await db.delete(schema.tags).where(inArray(schema.tags.householdId, householdIds));
      await db.delete(schema.categories).where(inArray(schema.categories.householdId, householdIds));
      await db.delete(schema.accounts).where(inArray(schema.accounts.householdId, householdIds));
      await db.delete(schema.sessions).where(inArray(schema.sessions.householdId, householdIds));
      await db
        .delete(schema.householdMembers)
        .where(inArray(schema.householdMembers.householdId, householdIds));
      await db.delete(schema.households).where(inArray(schema.households.householdId, householdIds));
      if (allUserIds.length > 0) {
        await db.delete(schema.users).where(inArray(schema.users.userId, allUserIds));
      }
    }
    await db.$client.end();
  }

  return { db, schema, createHousehold, appFor, json, cleanup, trackUser: (id: string) => userIds.push(id) };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
