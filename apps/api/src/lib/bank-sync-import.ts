import { and, eq, inArray } from "drizzle-orm";
import {
  BANK_SYNC_PROVIDER_LABELS,
  accountNumberLast4,
  type BankSyncProvider,
} from "@financial-management/shared";
import { db } from "../db/index.js";
import {
  importBatches,
  importRowsNormalized,
  importRowsRaw,
  transactions,
} from "../db/schema.js";
import type { AuthContext } from "../types.js";
import { emitAuditEvent } from "./audit.js";
import { recalcAccountBalance } from "./balance.js";
import type { MappedRow } from "./bank-sync-mapper.js";
import { dedupeFingerprint } from "./csv.js";

/** Keeps every multi-row INSERT well under Postgres' 65535 bind-parameter limit. */
const INSERT_CHUNK = 500;

function chunks<T>(items: readonly T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Import batch label: "{provider} • {last 4 digits of the provider account number}". */
export function bankSyncBatchLabel(provider: BankSyncProvider, accountNumber: string): string {
  return `${BANK_SYNC_PROVIDER_LABELS[provider]} • ${accountNumberLast4(accountNumber)}`;
}

export interface ApplyBankSyncAccountInput {
  accountId: string;
  provider: BankSyncProvider;
  accountNumber: string;
  rows: readonly MappedRow[];
}

export interface ApplyBankSyncAccountResult {
  importBatchId: string | null;
  created: number;
  duplicates: number;
}

/**
 * Writes one bank-sync account's mapped rows through the import tables (batch → raw →
 * normalized → transactions). Rows whose `(account_id, external_ref)` already exists are
 * skipped (never re-created). Nothing is written when there is nothing new. Transactions are
 * created cleared and uncategorized; balance is recalculated server-side afterwards.
 */
export async function applyBankSyncAccount(
  auth: AuthContext,
  input: ApplyBankSyncAccountInput,
): Promise<ApplyBankSyncAccountResult> {
  const { accountId, provider, accountNumber, rows } = input;
  if (rows.length === 0) return { importBatchId: null, created: 0, duplicates: 0 };

  const existing = new Set<string>();
  for (const part of chunks(rows.map((r) => r.externalRef))) {
    const found = await db
      .select({ externalRef: transactions.externalRef })
      .from(transactions)
      .where(and(eq(transactions.accountId, accountId), inArray(transactions.externalRef, part)));
    for (const row of found) if (row.externalRef) existing.add(row.externalRef);
  }

  const seen = new Set<string>();
  const classified = rows.map((row) => {
    const isDuplicate = existing.has(row.externalRef) || seen.has(row.externalRef);
    seen.add(row.externalRef);
    return { row, isDuplicate };
  });
  const fresh = classified.filter((c) => !c.isDuplicate).map((c) => c.row);
  let duplicates = rows.length - fresh.length;
  if (fresh.length === 0) return { importBatchId: null, created: 0, duplicates };

  const { batch, created } = await db.transaction(async (tx) => {
    const [batchRow] = await tx
      .insert(importBatches)
      .values({
        householdId: auth.householdId,
        accountId,
        sourceType: "bank_sync",
        fileName: bankSyncBatchLabel(provider, accountNumber),
        status: "completed",
        rowCount: rows.length,
        duplicateCount: duplicates,
        errorCount: 0,
      })
      .returning();
    if (!batchRow) throw new Error("import batch insert returned no row");

    const rawIdByIndex = new Map<number, string>();
    for (const part of chunks(classified.map((c, rowIndex) => ({ ...c, rowIndex })))) {
      const inserted = await tx
        .insert(importRowsRaw)
        .values(
          part.map((c) => ({
            importBatchId: batchRow.importBatchId,
            rowIndex: c.rowIndex,
            rawPayloadJson: c.row.raw,
          })),
        )
        .returning({ rawRowId: importRowsRaw.rawRowId, rowIndex: importRowsRaw.rowIndex });
      for (const r of inserted) rawIdByIndex.set(r.rowIndex, r.rawRowId);
    }

    // Concurrent uploads can race past the pre-check; the unique index decides, losers are duplicates.
    const txnIdByRef = new Map<string, string>();
    for (const part of chunks(fresh)) {
      const inserted = await tx
        .insert(transactions)
        .values(
          part.map((row) => ({
            householdId: auth.householdId,
            accountId,
            type: row.type,
            amount: row.amount,
            transactionDate: row.transactionDate,
            postedDate: row.postedDate,
            description: row.description,
            merchantName: null,
            categoryId: null,
            status: "cleared" as const,
            notes: row.notes,
            importBatchId: batchRow.importBatchId,
            externalRef: row.externalRef,
            createdBy: auth.userId,
          })),
        )
        .onConflictDoNothing({ target: [transactions.accountId, transactions.externalRef] })
        .returning({
          transactionId: transactions.transactionId,
          externalRef: transactions.externalRef,
        });
      for (const r of inserted) if (r.externalRef) txnIdByRef.set(r.externalRef, r.transactionId);
    }

    const raceLosers = fresh.length - txnIdByRef.size;
    if (raceLosers > 0) {
      duplicates += raceLosers;
      await tx
        .update(importBatches)
        .set({ duplicateCount: duplicates })
        .where(eq(importBatches.importBatchId, batchRow.importBatchId));
    }

    const normalized = classified.map((c, rowIndex) => {
      const rawRowId = rawIdByIndex.get(rowIndex);
      if (!rawRowId) throw new Error("raw import row missing");
      const promotedTransactionId = c.isDuplicate ? undefined : txnIdByRef.get(c.row.externalRef);
      return {
        importBatchId: batchRow.importBatchId,
        rawRowId,
        transactionDate: c.row.transactionDate,
        description: c.row.description,
        merchantName: null,
        amount: c.row.amount,
        flow: c.row.type,
        normalizedPayloadJson: {
          externalRef: c.row.externalRef,
          postedDate: c.row.postedDate,
          notes: c.row.notes,
        },
        dedupeFingerprint: dedupeFingerprint(
          accountId,
          c.row.transactionDate,
          c.row.amount,
          c.row.type,
          c.row.description,
        ),
        isDuplicate: promotedTransactionId === undefined,
        promotedTransactionId: promotedTransactionId ?? null,
      };
    });
    for (const part of chunks(normalized)) {
      await tx.insert(importRowsNormalized).values(part);
    }

    return { batch: batchRow, created: txnIdByRef.size };
  });

  if (created > 0) await recalcAccountBalance(accountId);
  await emitAuditEvent(auth, {
    actionType: "import_batch.applied",
    entityType: "import_batch",
    entityId: batch.importBatchId,
    after: { sourceType: "bank_sync", provider, created, duplicates },
  });
  return { importBatchId: batch.importBatchId, created, duplicates };
}
