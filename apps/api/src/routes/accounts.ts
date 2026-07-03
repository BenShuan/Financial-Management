import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  accountSchema,
  createAccountSchema,
  updateAccountSchema,
} from "@financial-management/shared";
import { createRouter } from "../lib/router.js";
import { db } from "../db/index.js";
import { accounts } from "../db/schema.js";
import { emitAuditEvent } from "../lib/audit.js";
import { requireRole } from "../middleware/auth.js";

type AccountRow = typeof accounts.$inferSelect;

export function serializeAccount(row: AccountRow) {
  return {
    accountId: row.accountId,
    householdId: row.householdId,
    name: row.name,
    type: row.type,
    institutionName: row.institutionName,
    accountMask: row.accountMask,
    openingBalance: row.openingBalance,
    currentBalance: row.currentBalance,
    creditLimit: row.creditLimit,
    isActive: row.isActive,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getHouseholdAccount(householdId: string, accountId: string) {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.accountId, accountId), eq(accounts.householdId, householdId)));
  if (!row) throw new HTTPException(404, { message: "החשבון לא נמצא" });
  return row;
}

const accountIdParam = z.object({ accountId: z.string().uuid() });

export const accountsRouter = createRouter();

accountsRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/accounts",
    tags: ["Accounts"],
    summary: "List household accounts",
    responses: {
      200: {
        description: "Accounts",
        content: { "application/json": { schema: z.array(accountSchema) } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.householdId, auth.householdId))
      .orderBy(asc(accounts.type), asc(accounts.createdAt));
    return c.json(rows.map(serializeAccount));
  },
);

accountsRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/accounts/{accountId}",
    tags: ["Accounts"],
    summary: "Get one account",
    request: { params: accountIdParam },
    responses: {
      200: {
        description: "Account",
        content: { "application/json": { schema: accountSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const { accountId } = c.req.valid("param");
    const row = await getHouseholdAccount(auth.householdId, accountId);
    return c.json(serializeAccount(row));
  },
);

accountsRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/accounts",
    tags: ["Accounts"],
    summary: "Create account (admin+)",
    request: {
      body: { content: { "application/json": { schema: createAccountSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: accountSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const input = c.req.valid("json");
    const [row] = await db
      .insert(accounts)
      .values({
        householdId: auth.householdId,
        name: input.name,
        type: input.type,
        institutionName: input.institutionName,
        accountMask: input.accountMask,
        openingBalance: input.openingBalance,
        currentBalance: input.openingBalance,
        creditLimit: input.creditLimit,
        notes: input.notes,
      })
      .returning();
    if (!row) throw new HTTPException(500, { message: "יצירת החשבון נכשלה" });
    await emitAuditEvent(auth, {
      actionType: "account.created",
      entityType: "account",
      entityId: row.accountId,
      after: { name: row.name, type: row.type },
    });
    return c.json(serializeAccount(row), 201);
  },
);

accountsRouter.openapi(
  createRoute({
    method: "patch",
    path: "/api/accounts/{accountId}",
    tags: ["Accounts"],
    summary: "Update account (admin+)",
    request: {
      params: accountIdParam,
      body: { content: { "application/json": { schema: updateAccountSchema } } },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: accountSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const { accountId } = c.req.valid("param");
    const input = c.req.valid("json");
    const before = await getHouseholdAccount(auth.householdId, accountId);
    const [row] = await db
      .update(accounts)
      .set({
        name: input.name,
        type: input.type,
        institutionName: input.institutionName,
        accountMask: input.accountMask,
        openingBalance: input.openingBalance,
        creditLimit: input.creditLimit,
        notes: input.notes,
        isActive: input.isActive,
      })
      .where(eq(accounts.accountId, accountId))
      .returning();
    if (!row) throw new HTTPException(500, { message: "עדכון החשבון נכשל" });
    await emitAuditEvent(auth, {
      actionType: "account.updated",
      entityType: "account",
      entityId: accountId,
      before: { name: before.name, isActive: before.isActive },
      after: { name: row.name, isActive: row.isActive },
    });
    return c.json(serializeAccount(row));
  },
);
