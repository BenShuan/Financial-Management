import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  categorizeImportRowsSchema,
  createImportBatchSchema,
  importBatchSchema,
  importColumnMapSchema,
  importMappingTemplateSchema,
  importRowSchema,
} from "@financial-management/shared";
import { db } from "../db/index.js";
import {
  importBatches,
  importMappingTemplates,
  importRowsNormalized,
  importRowsRaw,
  transactions,
} from "../db/schema.js";
import { emitAuditEvent } from "../lib/audit.js";
import { recalcAccountBalance } from "../lib/balance.js";
import { dedupeFingerprint, normalizeRows, parseCsv } from "../lib/csv.js";
import { createRouter } from "../lib/router.js";
import { requireRole } from "../middleware/auth.js";
import { getHouseholdAccount } from "./accounts.js";

type BatchRow = typeof importBatches.$inferSelect;
type NormalizedRow = typeof importRowsNormalized.$inferSelect;

function serializeBatch(row: BatchRow) {
  return {
    importBatchId: row.importBatchId,
    householdId: row.householdId,
    accountId: row.accountId,
    sourceType: row.sourceType,
    fileName: row.fileName,
    status: row.status,
    rowCount: row.rowCount,
    duplicateCount: row.duplicateCount,
    errorCount: row.errorCount,
    importedAt: row.importedAt.toISOString(),
  };
}

function serializeRow(row: NormalizedRow) {
  return {
    normalizedRowId: row.normalizedRowId,
    importBatchId: row.importBatchId,
    transactionDate: row.transactionDate,
    description: row.description,
    merchantName: row.merchantName,
    amount: row.amount,
    flow: row.flow === "income" ? ("income" as const) : ("expense" as const),
    categoryId: row.categoryId,
    isDuplicate: row.isDuplicate,
    promotedTransactionId: row.promotedTransactionId,
  };
}

async function getHouseholdBatch(householdId: string, importBatchId: string) {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.importBatchId, importBatchId),
        eq(importBatches.householdId, householdId),
      ),
    );
  if (!batch) throw new HTTPException(404, { message: "אצוות הייבוא לא נמצאה" });
  return batch;
}

const batchIdParam = z.object({ batchId: z.string().uuid() });

export const importsRouter = createRouter();

importsRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/import-mappings",
    tags: ["Import"],
    summary: "Saved column-mapping templates",
    responses: {
      200: {
        description: "Mapping templates",
        content: {
          "application/json": { schema: z.array(importMappingTemplateSchema) },
        },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await db
      .select()
      .from(importMappingTemplates)
      .where(eq(importMappingTemplates.householdId, auth.householdId))
      .orderBy(asc(importMappingTemplates.name));
    return c.json(
      rows.map((row) => ({
        mappingTemplateId: row.mappingTemplateId,
        householdId: row.householdId,
        name: row.name,
        columnMap: importColumnMapSchema.parse(row.columnMapJson),
        isDefault: row.isDefault,
      })),
    );
  },
);

importsRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/imports",
    tags: ["Import"],
    summary: "List import batches (newest first)",
    responses: {
      200: {
        description: "Batches",
        content: { "application/json": { schema: z.array(importBatchSchema) } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.householdId, auth.householdId))
      .orderBy(desc(importBatches.importedAt));
    return c.json(rows.map(serializeBatch));
  },
);

importsRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/imports",
    tags: ["Import"],
    summary: "Upload CSV: parse, normalize via column map, dedupe (admin+)",
    request: {
      body: { content: { "application/json": { schema: createImportBatchSchema } } },
    },
    responses: {
      201: {
        description: "Batch created and normalized, awaiting categorization",
        content: { "application/json": { schema: importBatchSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const input = c.req.valid("json");
    await getHouseholdAccount(auth.householdId, input.accountId);

    const cells = parseCsv(input.csvText);
    if (cells.length < 2) {
      throw new HTTPException(400, { message: "הקובץ ריק או שאין בו שורות נתונים" });
    }
    const { rows } = normalizeRows(cells, input.columnMap);

    let mappingTemplateId: string | undefined;
    if (input.saveMappingAs) {
      const [template] = await db
        .insert(importMappingTemplates)
        .values({
          householdId: auth.householdId,
          name: input.saveMappingAs,
          columnMapJson: input.columnMap,
        })
        .returning();
      mappingTemplateId = template?.mappingTemplateId;
    }

    const [batch] = await db
      .insert(importBatches)
      .values({
        householdId: auth.householdId,
        accountId: input.accountId,
        sourceType: "csv",
        fileName: input.fileName,
        mappingTemplateId,
        status: "processing",
        rowCount: rows.length,
      })
      .returning();
    if (!batch) throw new HTTPException(500, { message: "יצירת האצווה נכשלה" });

    // Existing-ledger fingerprints for dedupe (same account)
    const existing = await db
      .select({
        transactionDate: transactions.transactionDate,
        amount: transactions.amount,
        type: transactions.type,
        description: transactions.description,
      })
      .from(transactions)
      .where(eq(transactions.accountId, input.accountId));
    const existingFingerprints = new Set(
      existing.map((t) =>
        dedupeFingerprint(input.accountId, t.transactionDate, t.amount, t.type, t.description),
      ),
    );

    let duplicateCount = 0;
    let errorCount = 0;
    const seenInBatch = new Set<string>();
    for (const row of rows) {
      const [rawRow] = await db
        .insert(importRowsRaw)
        .values({
          importBatchId: batch.importBatchId,
          rowIndex: row.rowIndex,
          rawPayloadJson: row.raw,
          parseError: row.parseError,
        })
        .returning();
      if (!rawRow) continue;
      if (row.parseError) {
        errorCount++;
        continue;
      }
      const fingerprint = dedupeFingerprint(
        input.accountId,
        row.transactionDate,
        row.amount,
        row.flow,
        row.description,
      );
      const isDuplicate =
        existingFingerprints.has(fingerprint) || seenInBatch.has(fingerprint);
      seenInBatch.add(fingerprint);
      if (isDuplicate) duplicateCount++;
      await db.insert(importRowsNormalized).values({
        importBatchId: batch.importBatchId,
        rawRowId: rawRow.rawRowId,
        transactionDate: row.transactionDate,
        description: row.description,
        merchantName: row.merchantName,
        amount: row.amount,
        flow: row.flow,
        dedupeFingerprint: fingerprint,
        isDuplicate,
      });
    }

    const [updated] = await db
      .update(importBatches)
      .set({ duplicateCount, errorCount })
      .where(eq(importBatches.importBatchId, batch.importBatchId))
      .returning();
    return c.json(serializeBatch(updated ?? batch), 201);
  },
);

importsRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/imports/{batchId}",
    tags: ["Import"],
    summary: "Batch with normalized rows for review",
    request: { params: batchIdParam },
    responses: {
      200: {
        description: "Batch + rows",
        content: {
          "application/json": {
            schema: z.object({
              batch: importBatchSchema,
              rows: z.array(importRowSchema),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const { batchId } = c.req.valid("param");
    const batch = await getHouseholdBatch(auth.householdId, batchId);
    const rows = await db
      .select()
      .from(importRowsNormalized)
      .where(eq(importRowsNormalized.importBatchId, batchId))
      .orderBy(desc(importRowsNormalized.transactionDate));
    return c.json({ batch: serializeBatch(batch), rows: rows.map(serializeRow) });
  },
);

importsRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/imports/{batchId}/categorize",
    tags: ["Import"],
    summary: "Assign a category to rows (single or bulk) — always user-initiated",
    request: {
      params: batchIdParam,
      body: { content: { "application/json": { schema: categorizeImportRowsSchema } } },
    },
    responses: {
      200: {
        description: "Updated rows",
        content: { "application/json": { schema: z.array(importRowSchema) } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const { batchId } = c.req.valid("param");
    const input = c.req.valid("json");
    await getHouseholdBatch(auth.householdId, batchId);
    const rows = await db
      .update(importRowsNormalized)
      .set({ categoryId: input.categoryId })
      .where(
        and(
          eq(importRowsNormalized.importBatchId, batchId),
          inArray(importRowsNormalized.normalizedRowId, input.rowIds),
          isNull(importRowsNormalized.promotedTransactionId),
        ),
      )
      .returning();
    return c.json(rows.map(serializeRow));
  },
);

importsRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/imports/{batchId}/promote",
    tags: ["Import"],
    summary:
      "Create transactions from categorized, non-duplicate rows; rows without a category are not promoted",
    request: { params: batchIdParam },
    responses: {
      200: {
        description: "Batch after promotion",
        content: { "application/json": { schema: importBatchSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const { batchId } = c.req.valid("param");
    const batch = await getHouseholdBatch(auth.householdId, batchId);
    if (batch.status === "completed") {
      throw new HTTPException(400, { message: "האצווה כבר הוחלה" });
    }

    const rows = await db
      .select()
      .from(importRowsNormalized)
      .where(
        and(
          eq(importRowsNormalized.importBatchId, batchId),
          eq(importRowsNormalized.isDuplicate, false),
          isNull(importRowsNormalized.promotedTransactionId),
        ),
      );

    let promoted = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!row.categoryId) {
        skipped++;
        continue;
      }
      const [txn] = await db
        .insert(transactions)
        .values({
          householdId: auth.householdId,
          accountId: batch.accountId,
          type: row.flow === "income" ? "income" : "expense",
          amount: row.amount,
          transactionDate: row.transactionDate,
          description: row.description,
          merchantName: row.merchantName,
          categoryId: row.categoryId,
          status: "cleared",
          importBatchId: batchId,
          createdBy: auth.userId,
        })
        .returning();
      if (txn) {
        await db
          .update(importRowsNormalized)
          .set({ promotedTransactionId: txn.transactionId })
          .where(eq(importRowsNormalized.normalizedRowId, row.normalizedRowId));
        promoted++;
      }
    }

    const status = skipped > 0 ? "partially_applied" : "completed";
    const [updated] = await db
      .update(importBatches)
      .set({ status })
      .where(eq(importBatches.importBatchId, batchId))
      .returning();

    await recalcAccountBalance(batch.accountId);
    await emitAuditEvent(auth, {
      actionType: "import_batch.applied",
      entityType: "import_batch",
      entityId: batchId,
      after: { promoted, skipped, status },
    });
    return c.json(serializeBatch(updated ?? batch));
  },
);
