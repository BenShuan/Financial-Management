import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, ne, notExists, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  bulkCategorizeSchema,
  createTransactionSchema,
  listTransactionsQuerySchema,
  transactionSchema,
  updateTransactionSchema,
} from "@financial-management/shared";
import { db } from "../db/index.js";
import {
  categories,
  importRowsNormalized,
  transactionSplits,
  transactionTags,
  transactions,
  transferLinks,
} from "../db/schema.js";
import { emitAuditEvent } from "../lib/audit.js";
import { recalcAccountBalance } from "../lib/balance.js";
import { createRouter } from "../lib/router.js";
import { requireRole } from "../middleware/auth.js";
import { getHouseholdAccount } from "./accounts.js";

type TransactionRow = typeof transactions.$inferSelect;

/** Loads splits, tags, and transfer-peer info for a set of transactions. */
async function hydrateTransactions(rows: TransactionRow[]) {
  const ids = rows.map((r) => r.transactionId);
  if (ids.length === 0) return [];

  const [splits, tagRows, links] = await Promise.all([
    db.select().from(transactionSplits).where(inArray(transactionSplits.transactionId, ids)),
    db.select().from(transactionTags).where(inArray(transactionTags.transactionId, ids)),
    db
      .select()
      .from(transferLinks)
      .where(
        or(
          inArray(transferLinks.fromTransactionId, ids),
          inArray(transferLinks.toTransactionId, ids),
        ),
      ),
  ]);

  // Peer account + direction per transfer leg
  const peerTxnIdByTxnId = new Map<string, string>();
  const directionByTxnId = new Map<string, "in" | "out">();
  for (const link of links) {
    peerTxnIdByTxnId.set(link.fromTransactionId, link.toTransactionId);
    peerTxnIdByTxnId.set(link.toTransactionId, link.fromTransactionId);
    directionByTxnId.set(link.fromTransactionId, "out");
    directionByTxnId.set(link.toTransactionId, "in");
  }
  const peerIds = [...new Set(peerTxnIdByTxnId.values())].filter(
    (id) => !rows.some((r) => r.transactionId === id),
  );
  const peerRows =
    peerIds.length > 0
      ? await db
          .select({
            transactionId: transactions.transactionId,
            accountId: transactions.accountId,
          })
          .from(transactions)
          .where(inArray(transactions.transactionId, peerIds))
      : [];
  const accountByTxnId = new Map<string, string>();
  for (const r of rows) accountByTxnId.set(r.transactionId, r.accountId);
  for (const r of peerRows) accountByTxnId.set(r.transactionId, r.accountId);

  return rows.map((row) => {
    const peerTxnId = peerTxnIdByTxnId.get(row.transactionId);
    return {
      transactionId: row.transactionId,
      householdId: row.householdId,
      accountId: row.accountId,
      type: row.type,
      amount: row.amount,
      transactionDate: row.transactionDate,
      postedDate: row.postedDate,
      description: row.description,
      merchantName: row.merchantName,
      categoryId: row.categoryId,
      status: row.status,
      notes: row.notes,
      importBatchId: row.importBatchId,
      transferPeerAccountId: peerTxnId ? (accountByTxnId.get(peerTxnId) ?? null) : null,
      transferDirection: directionByTxnId.get(row.transactionId) ?? null,
      splits: splits
        .filter((s) => s.transactionId === row.transactionId)
        .map((s) => ({
          splitId: s.splitId,
          transactionId: s.transactionId,
          categoryId: s.categoryId,
          amount: s.amount,
          note: s.note,
        })),
      tagIds: tagRows
        .filter((t) => t.transactionId === row.transactionId)
        .map((t) => t.tagId),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

async function getHouseholdTransaction(householdId: string, transactionId: string) {
  const [row] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.transactionId, transactionId),
        eq(transactions.householdId, householdId),
      ),
    );
  if (!row) throw new HTTPException(404, { message: "התנועה לא נמצאה" });
  return row;
}

const transactionIdParam = z.object({ transactionId: z.string().uuid() });

export const transactionsRouter = createRouter();

transactionsRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/transactions",
    tags: ["Transactions"],
    summary: "List transactions (filter by account, category, dates, search)",
    request: { query: listTransactionsQuerySchema },
    responses: {
      200: {
        description: "Transactions, newest first",
        content: { "application/json": { schema: z.array(transactionSchema) } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const q = c.req.valid("query");
    const conditions = [eq(transactions.householdId, auth.householdId)];
    if (q.accountId) conditions.push(eq(transactions.accountId, q.accountId));
    if (q.uncategorized) {
      // Transfers and split headers carry a null categoryId by design — not "uncategorized"
      conditions.push(isNull(transactions.categoryId));
      conditions.push(ne(transactions.type, "transfer"));
      conditions.push(
        notExists(
          db
            .select({ splitId: transactionSplits.splitId })
            .from(transactionSplits)
            .where(eq(transactionSplits.transactionId, transactions.transactionId)),
        ),
      );
    } else if (q.categoryId) {
      conditions.push(eq(transactions.categoryId, q.categoryId));
    }
    if (q.importBatchId) conditions.push(eq(transactions.importBatchId, q.importBatchId));
    if (q.from) conditions.push(gte(transactions.transactionDate, q.from));
    if (q.to) conditions.push(lte(transactions.transactionDate, q.to));
    if (q.search) {
      const pattern = `%${q.search}%`;
      const searchCond = or(
        ilike(transactions.description, pattern),
        ilike(transactions.merchantName, pattern),
      );
      if (searchCond) conditions.push(searchCond);
    }
    const rows = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
      .limit(q.limit)
      .offset(q.offset);
    return c.json(await hydrateTransactions(rows));
  },
);

transactionsRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/transactions/bulk-categorize",
    tags: ["Transactions"],
    summary: "Assign one category to many transactions (member+); transfers are skipped",
    request: {
      body: { content: { "application/json": { schema: bulkCategorizeSchema } } },
    },
    responses: {
      200: {
        description: "Updated transactions",
        content: { "application/json": { schema: z.array(transactionSchema) } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const input = c.req.valid("json");

    const [category] = await db
      .select({ categoryId: categories.categoryId })
      .from(categories)
      .where(
        and(
          eq(categories.categoryId, input.categoryId),
          eq(categories.householdId, auth.householdId),
        ),
      );
    if (!category) throw new HTTPException(404, { message: "הקטגוריה לא נמצאה" });

    const rows = await db
      .update(transactions)
      .set({ categoryId: input.categoryId })
      .where(
        and(
          inArray(transactions.transactionId, input.transactionIds),
          eq(transactions.householdId, auth.householdId),
          ne(transactions.type, "transfer"),
        ),
      )
      .returning();

    await emitAuditEvent(auth, {
      actionType: "transaction.bulk_categorized",
      entityType: "transaction",
      entityId: input.categoryId,
      after: { count: rows.length, categoryId: input.categoryId },
    });
    return c.json(await hydrateTransactions(rows));
  },
);

transactionsRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/transactions",
    tags: ["Transactions"],
    summary: "Create transaction (member+); transfers create two legs + link",
    request: {
      body: { content: { "application/json": { schema: createTransactionSchema } } },
    },
    responses: {
      201: {
        description: "Created (the primary/outflow leg for transfers)",
        content: { "application/json": { schema: transactionSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const input = c.req.valid("json");

    // Household scoping of referenced accounts
    await getHouseholdAccount(auth.householdId, input.accountId);
    if (input.type === "transfer" && input.transferPeerAccountId) {
      await getHouseholdAccount(auth.householdId, input.transferPeerAccountId);
    }

    const base = {
      householdId: auth.householdId,
      accountId: input.accountId,
      amount: input.amount,
      transactionDate: input.transactionDate,
      description: input.description,
      merchantName: input.merchantName,
      status: input.status,
      notes: input.notes,
      createdBy: auth.userId,
    };

    let created: TransactionRow;
    if (input.type === "transfer") {
      const [fromLeg] = await db
        .insert(transactions)
        .values({ ...base, type: "transfer" })
        .returning();
      const [toLeg] = await db
        .insert(transactions)
        .values({ ...base, type: "transfer", accountId: input.transferPeerAccountId! })
        .returning();
      if (!fromLeg || !toLeg) throw new HTTPException(500, { message: "יצירת ההעברה נכשלה" });
      await db.insert(transferLinks).values({
        fromTransactionId: fromLeg.transactionId,
        toTransactionId: toLeg.transactionId,
      });
      await recalcAccountBalance(input.transferPeerAccountId!);
      created = fromLeg;
    } else {
      const hasSplits = (input.splits?.length ?? 0) > 0;
      const [row] = await db
        .insert(transactions)
        .values({
          ...base,
          type: input.type,
          // Splits supersede the header category (invariant 5)
          categoryId: hasSplits ? null : input.categoryId,
        })
        .returning();
      if (!row) throw new HTTPException(500, { message: "יצירת התנועה נכשלה" });
      if (hasSplits) {
        await db.insert(transactionSplits).values(
          input.splits!.map((s) => ({
            transactionId: row.transactionId,
            categoryId: s.categoryId,
            amount: s.amount,
            note: s.note,
          })),
        );
      }
      created = row;
    }

    if (input.tagIds && input.tagIds.length > 0) {
      await db.insert(transactionTags).values(
        input.tagIds.map((tagId) => ({ transactionId: created.transactionId, tagId })),
      );
    }

    await recalcAccountBalance(input.accountId);
    await emitAuditEvent(auth, {
      actionType: "transaction.created",
      entityType: "transaction",
      entityId: created.transactionId,
      after: { type: input.type, amount: input.amount, accountId: input.accountId },
    });

    const [hydrated] = await hydrateTransactions([created]);
    return c.json(hydrated!, 201);
  },
);

transactionsRouter.openapi(
  createRoute({
    method: "patch",
    path: "/api/transactions/{transactionId}",
    tags: ["Transactions"],
    summary: "Update transaction (member+)",
    request: {
      params: transactionIdParam,
      body: { content: { "application/json": { schema: updateTransactionSchema } } },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: transactionSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const { transactionId } = c.req.valid("param");
    const input = c.req.valid("json");
    const before = await getHouseholdTransaction(auth.householdId, transactionId);

    // Invariant 5: null categoryId = uncategorized, a legitimate state (e.g. imports)
    if (before.type === "transfer" && input.categoryId) {
      throw new HTTPException(400, { message: "העברה אינה מקבלת קטגוריה" });
    }

    const [row] = await db
      .update(transactions)
      .set({
        amount: input.amount,
        transactionDate: input.transactionDate,
        description: input.description,
        merchantName: input.merchantName,
        categoryId: input.categoryId,
        status: input.status,
        notes: input.notes,
      })
      .where(eq(transactions.transactionId, transactionId))
      .returning();
    if (!row) throw new HTTPException(500, { message: "עדכון התנועה נכשל" });

    if (input.tagIds) {
      await db
        .delete(transactionTags)
        .where(eq(transactionTags.transactionId, transactionId));
      if (input.tagIds.length > 0) {
        await db
          .insert(transactionTags)
          .values(input.tagIds.map((tagId) => ({ transactionId, tagId })));
      }
    }

    // Amount changes on a transfer leg must keep both legs equal
    if (before.type === "transfer" && input.amount && input.amount !== before.amount) {
      const [link] = await db
        .select()
        .from(transferLinks)
        .where(
          or(
            eq(transferLinks.fromTransactionId, transactionId),
            eq(transferLinks.toTransactionId, transactionId),
          ),
        );
      if (link) {
        const peerId =
          link.fromTransactionId === transactionId
            ? link.toTransactionId
            : link.fromTransactionId;
        const [peer] = await db
          .update(transactions)
          .set({ amount: input.amount })
          .where(eq(transactions.transactionId, peerId))
          .returning();
        if (peer) await recalcAccountBalance(peer.accountId);
      }
    }

    await recalcAccountBalance(row.accountId);
    await emitAuditEvent(auth, {
      actionType: "transaction.updated",
      entityType: "transaction",
      entityId: transactionId,
      before: { amount: before.amount, categoryId: before.categoryId },
      after: { amount: row.amount, categoryId: row.categoryId },
    });

    const [hydrated] = await hydrateTransactions([row]);
    return c.json(hydrated!);
  },
);

transactionsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/api/transactions/{transactionId}",
    tags: ["Transactions"],
    summary: "Delete transaction (member+); removes both transfer legs",
    request: { params: transactionIdParam },
    responses: {
      200: {
        description: "Deleted",
        content: {
          "application/json": { schema: z.object({ deleted: z.boolean() }) },
        },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const { transactionId } = c.req.valid("param");
    const row = await getHouseholdTransaction(auth.householdId, transactionId);

    const affectedAccountIds = new Set<string>([row.accountId]);
    if (row.type === "transfer") {
      const [link] = await db
        .select()
        .from(transferLinks)
        .where(
          or(
            eq(transferLinks.fromTransactionId, transactionId),
            eq(transferLinks.toTransactionId, transactionId),
          ),
        );
      if (link) {
        const peerId =
          link.fromTransactionId === transactionId
            ? link.toTransactionId
            : link.fromTransactionId;
        const [peer] = await db
          .select()
          .from(transactions)
          .where(eq(transactions.transactionId, peerId));
        if (peer) affectedAccountIds.add(peer.accountId);
        await db.delete(transactions).where(eq(transactions.transactionId, peerId));
      }
    }
    // Imported transactions are referenced from their normalized import row — detach first
    await db
      .update(importRowsNormalized)
      .set({ promotedTransactionId: null })
      .where(eq(importRowsNormalized.promotedTransactionId, transactionId));
    await db.delete(transactions).where(eq(transactions.transactionId, transactionId));

    for (const accountId of affectedAccountIds) {
      await recalcAccountBalance(accountId);
    }
    await emitAuditEvent(auth, {
      actionType: "transaction.deleted",
      entityType: "transaction",
      entityId: transactionId,
      before: { type: row.type, amount: row.amount, accountId: row.accountId },
    });
    return c.json({ deleted: true });
  },
);
