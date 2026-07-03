import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  createReconciliationSessionSchema,
  moneyEquals,
  reconciliationSessionSchema,
} from "@financial-management/shared";
import { db } from "../db/index.js";
import { accountBalanceSnapshots, reconciliationSessions, transactions } from "../db/schema.js";
import { emitAuditEvent } from "../lib/audit.js";
import { createRouter } from "../lib/router.js";
import { requireRole } from "../middleware/auth.js";
import { getHouseholdAccount } from "./accounts.js";

type SessionRow = typeof reconciliationSessions.$inferSelect;

function serializeSession(row: SessionRow) {
  return {
    reconciliationId: row.reconciliationId,
    accountId: row.accountId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    statementEndingBalance: row.statementEndingBalance,
    calculatedEndingBalance: row.calculatedEndingBalance,
    status: row.status,
    notes: row.notes,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Cleared-only ending balance: opening + cleared income − expense ± transfers up to period end. */
async function calculateEndingBalance(accountId: string, periodEnd: string): Promise<string> {
  const result = await db.execute(sql`
    SELECT (
      a.opening_balance
      + COALESCE((SELECT SUM(t.amount) FROM transactions t
          WHERE t.account_id = a.account_id AND t.type = 'income'
            AND t.status = 'cleared' AND t.transaction_date <= ${periodEnd}), 0)
      - COALESCE((SELECT SUM(t.amount) FROM transactions t
          WHERE t.account_id = a.account_id AND t.type = 'expense'
            AND t.status = 'cleared' AND t.transaction_date <= ${periodEnd}), 0)
      + COALESCE((SELECT SUM(t.amount) FROM transactions t
          JOIN transfer_links l ON l.to_transaction_id = t.transaction_id
          WHERE t.account_id = a.account_id
            AND t.status = 'cleared' AND t.transaction_date <= ${periodEnd}), 0)
      - COALESCE((SELECT SUM(t.amount) FROM transactions t
          JOIN transfer_links l ON l.from_transaction_id = t.transaction_id
          WHERE t.account_id = a.account_id
            AND t.status = 'cleared' AND t.transaction_date <= ${periodEnd}), 0)
    )::numeric(18,2) AS balance
    FROM accounts a
    WHERE a.account_id = ${accountId}
  `);
  return (result.rows[0]?.balance as string | undefined) ?? "0.00";
}

/** State machine (docs/agent/05): open→matched|mismatch, mismatch→resolved|open, →closed. */
async function recalcSession(session: SessionRow): Promise<SessionRow> {
  const calculated = await calculateEndingBalance(session.accountId, session.periodEnd);
  const balanced = moneyEquals(calculated, session.statementEndingBalance);
  let status = session.status;
  if (session.status === "open" || session.status === "matched") {
    status = balanced ? "matched" : "mismatch";
  } else if (session.status === "mismatch") {
    // Zero tolerance: mismatch returns to matched-track only via resolve
    status = balanced ? "mismatch" : "mismatch";
  }
  const [updated] = await db
    .update(reconciliationSessions)
    .set({ calculatedEndingBalance: calculated, status })
    .where(eq(reconciliationSessions.reconciliationId, session.reconciliationId))
    .returning();
  return updated ?? session;
}

async function getSession(householdId: string, reconciliationId: string) {
  const [session] = await db
    .select()
    .from(reconciliationSessions)
    .where(eq(reconciliationSessions.reconciliationId, reconciliationId));
  if (!session) throw new HTTPException(404, { message: "סשן ההתאמה לא נמצא" });
  await getHouseholdAccount(householdId, session.accountId); // household scoping
  return session;
}

const sessionIdParam = z.object({ reconciliationId: z.string().uuid() });

const clearedTransactionsSchema = z.array(
  z.object({
    transactionId: z.string().uuid(),
    description: z.string(),
    transactionDate: z.string(),
    amount: z.string(),
    type: z.enum(["income", "expense", "transfer"]),
  }),
);

export const reconciliationRouter = createRouter();

reconciliationRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/reconciliations",
    tags: ["Reconciliation"],
    summary: "List reconciliation sessions",
    request: { query: z.object({ accountId: z.string().uuid().optional() }) },
    responses: {
      200: {
        description: "Sessions",
        content: {
          "application/json": { schema: z.array(reconciliationSessionSchema) },
        },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const { accountId } = c.req.valid("query");
    if (accountId) await getHouseholdAccount(auth.householdId, accountId);
    const rows = await db
      .select({ session: reconciliationSessions })
      .from(reconciliationSessions)
      .orderBy(desc(reconciliationSessions.createdAt));
    const filtered = [];
    for (const { session } of rows) {
      if (accountId && session.accountId !== accountId) continue;
      try {
        await getHouseholdAccount(auth.householdId, session.accountId);
        filtered.push(serializeSession(session));
      } catch {
        // other household's session — skip
      }
    }
    return c.json(filtered);
  },
);

reconciliationRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/reconciliations",
    tags: ["Reconciliation"],
    summary: "Open a session; computes calculated balance and matched/mismatch (admin+)",
    request: {
      body: {
        content: { "application/json": { schema: createReconciliationSessionSchema } },
      },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: reconciliationSessionSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const input = c.req.valid("json");
    await getHouseholdAccount(auth.householdId, input.accountId);
    const [session] = await db
      .insert(reconciliationSessions)
      .values({
        accountId: input.accountId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        statementEndingBalance: input.statementEndingBalance,
        notes: input.notes,
        status: "open",
      })
      .returning();
    if (!session) throw new HTTPException(500, { message: "פתיחת הסשן נכשלה" });
    const updated = await recalcSession(session);
    return c.json(serializeSession(updated), 201);
  },
);

reconciliationRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/reconciliations/{reconciliationId}",
    tags: ["Reconciliation"],
    summary: "Session with its cleared transactions",
    request: { params: sessionIdParam },
    responses: {
      200: {
        description: "Session + cleared transactions in range",
        content: {
          "application/json": {
            schema: z.object({
              session: reconciliationSessionSchema,
              cleared: clearedTransactionsSchema,
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const { reconciliationId } = c.req.valid("param");
    const session = await getSession(auth.householdId, reconciliationId);
    const cleared = await db
      .select({
        transactionId: transactions.transactionId,
        description: transactions.description,
        transactionDate: transactions.transactionDate,
        amount: transactions.amount,
        type: transactions.type,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, session.accountId),
          eq(transactions.status, "cleared"),
          lte(transactions.transactionDate, session.periodEnd),
          sql`${transactions.transactionDate} >= ${session.periodStart}`,
        ),
      )
      .orderBy(desc(transactions.transactionDate));
    return c.json({ session: serializeSession(session), cleared });
  },
);

reconciliationRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/reconciliations/{reconciliationId}/recalculate",
    tags: ["Reconciliation"],
    summary: "Recompute after ledger edits; open/mismatch re-evaluated (admin+)",
    request: { params: sessionIdParam },
    responses: {
      200: {
        description: "Recomputed session",
        content: { "application/json": { schema: reconciliationSessionSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const { reconciliationId } = c.req.valid("param");
    const session = await getSession(auth.householdId, reconciliationId);
    if (session.status === "closed") {
      throw new HTTPException(400, { message: "סשן סגור — יש לפתוח סשן חדש" });
    }
    // Re-open a mismatch before recalc so the state machine can settle again
    if (session.status === "mismatch") {
      await db
        .update(reconciliationSessions)
        .set({ status: "open" })
        .where(eq(reconciliationSessions.reconciliationId, reconciliationId));
      session.status = "open";
    }
    const updated = await recalcSession(session);
    return c.json(serializeSession(updated));
  },
);

reconciliationRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/reconciliations/{reconciliationId}/resolve",
    tags: ["Reconciliation"],
    summary: "Mark a balanced mismatch as resolved (admin+)",
    request: { params: sessionIdParam },
    responses: {
      200: {
        description: "Resolved session",
        content: { "application/json": { schema: reconciliationSessionSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const { reconciliationId } = c.req.valid("param");
    const session = await getSession(auth.householdId, reconciliationId);
    if (session.status !== "mismatch") {
      throw new HTTPException(400, { message: "רק סשן עם אי-התאמה ניתן לסמן כפתור" });
    }
    const calculated = await calculateEndingBalance(session.accountId, session.periodEnd);
    if (!moneyEquals(calculated, session.statementEndingBalance)) {
      throw new HTTPException(400, {
        message: "היתרות עדיין לא תואמות — יש לתקן את התנועות תחילה",
      });
    }
    const [updated] = await db
      .update(reconciliationSessions)
      .set({
        status: "resolved",
        calculatedEndingBalance: calculated,
        resolvedAt: new Date(),
      })
      .where(eq(reconciliationSessions.reconciliationId, reconciliationId))
      .returning();
    return c.json(serializeSession(updated!));
  },
);

reconciliationRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/reconciliations/{reconciliationId}/close",
    tags: ["Reconciliation"],
    summary: "Close a matched/resolved session and snapshot the balance (admin+)",
    request: { params: sessionIdParam },
    responses: {
      200: {
        description: "Closed session",
        content: { "application/json": { schema: reconciliationSessionSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const { reconciliationId } = c.req.valid("param");
    const session = await getSession(auth.householdId, reconciliationId);
    if (session.status !== "matched" && session.status !== "resolved") {
      throw new HTTPException(400, {
        message: "ניתן לסגור רק סשן תואם או פתור",
      });
    }
    const [updated] = await db
      .update(reconciliationSessions)
      .set({ status: "closed" })
      .where(eq(reconciliationSessions.reconciliationId, reconciliationId))
      .returning();
    await db.insert(accountBalanceSnapshots).values({
      accountId: session.accountId,
      asOfDate: session.periodEnd,
      balance: session.calculatedEndingBalance,
      source: "system",
    });
    await emitAuditEvent(auth, {
      actionType: "reconciliation.closed",
      entityType: "reconciliation_session",
      entityId: reconciliationId,
      after: { periodEnd: session.periodEnd, balance: session.calculatedEndingBalance },
    });
    return c.json(serializeSession(updated!));
  },
);
