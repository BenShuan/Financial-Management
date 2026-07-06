import { createRoute, z } from "@hono/zod-openapi";
import { asc, count, desc, eq, isNotNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  createImportBatchSchema,
  importBatchSchema,
  importColumnMapSchema,
  importMappingTemplateSchema,
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

function serializeBatch(row: BatchRow, transactionCount: number) {
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
    transactionCount,
    importedAt: row.importedAt.toISOString(),
  };
}

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
    const counts = await db
      .select({
        importBatchId: importRowsNormalized.importBatchId,
        transactionCount: count(importRowsNormalized.promotedTransactionId),
      })
      .from(importRowsNormalized)
      .where(isNotNull(importRowsNormalized.promotedTransactionId))
      .groupBy(importRowsNormalized.importBatchId);
    const countByBatch = new Map(
      counts.map((row) => [row.importBatchId, row.transactionCount]),
    );
    return c.json(
      rows.map((row) => serializeBatch(row, countByBatch.get(row.importBatchId) ?? 0)),
    );
  },
);

importsRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/imports",
    tags: ["Import"],
    summary:
      "Upload CSV: parse, normalize via column map, create uncategorized transactions immediately (admin+)",
    request: {
      body: { content: { "application/json": { schema: createImportBatchSchema } } },
    },
    responses: {
      201: {
        description: "Batch applied; transactions created without categories",
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

    const errorCount = rows.filter((row) => row.parseError).length;
    let duplicateCount = 0;
    const seenInBatch = new Set<string>();
    const okRows = rows
      .filter((row) => !row.parseError)
      .map((row) => {
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
        return { ...row, fingerprint, isDuplicate };
      });

    const batch = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(importBatches)
        .values({
          householdId: auth.householdId,
          accountId: input.accountId,
          sourceType: "csv",
          fileName: input.fileName,
          mappingTemplateId,
          status: "completed",
          rowCount: rows.length,
          duplicateCount,
          errorCount,
        })
        .returning();
      if (!created) throw new HTTPException(500, { message: "יצירת האצווה נכשלה" });

      const rawRows = await tx
        .insert(importRowsRaw)
        .values(
          rows.map((row) => ({
            importBatchId: created.importBatchId,
            rowIndex: row.rowIndex,
            rawPayloadJson: row.raw,
            parseError: row.parseError,
          })),
        )
        .returning();
      const rawRowIdByIndex = new Map(rawRows.map((row) => [row.rowIndex, row.rawRowId]));

      if (okRows.length > 0) {
        // All parseable rows become transactions immediately — uncategorized,
        // duplicates included (flagged on the normalized row, never skipped).
        const createdTxns = await tx
          .insert(transactions)
          .values(
            okRows.map((row) => ({
              householdId: auth.householdId,
              accountId: input.accountId,
              type: row.flow,
              amount: row.amount,
              transactionDate: row.transactionDate,
              description: row.description,
              merchantName: row.merchantName,
              categoryId: null,
              status: "cleared" as const,
              importBatchId: created.importBatchId,
              createdBy: auth.userId,
            })),
          )
          .returning({ transactionId: transactions.transactionId });
        await tx.insert(importRowsNormalized).values(
          okRows.map((row, i) => {
            const rawRowId = rawRowIdByIndex.get(row.rowIndex);
            const promotedTransactionId = createdTxns[i]?.transactionId;
            if (!rawRowId || !promotedTransactionId) {
              throw new HTTPException(500, { message: "שמירת שורות הייבוא נכשלה" });
            }
            return {
              importBatchId: created.importBatchId,
              rawRowId,
              transactionDate: row.transactionDate,
              description: row.description,
              merchantName: row.merchantName,
              amount: row.amount,
              flow: row.flow,
              dedupeFingerprint: row.fingerprint,
              isDuplicate: row.isDuplicate,
              promotedTransactionId,
            };
          }),
        );
      }
      return created;
    });

    await recalcAccountBalance(input.accountId);
    await emitAuditEvent(auth, {
      actionType: "import_batch.applied",
      entityType: "import_batch",
      entityId: batch.importBatchId,
      after: { created: okRows.length, duplicates: duplicateCount, errors: errorCount },
    });
    return c.json(serializeBatch(batch, okRows.length), 201);
  },
);
