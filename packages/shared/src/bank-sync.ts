import { z } from "zod";
import { bankSyncProviderSchema, syncAccountLinkStatusSchema } from "./enums.js";
import { signedMoneySchema } from "./money.js";

/**
 * Bank / credit-card auto-fetch contract (FM-29). The local app `apps/bank-sync` scrapes on the
 * user's computer and uploads completed transactions; the API normalizes them (type from sign,
 * Asia/Jerusalem dates, dedupe key) and owns the ledger. Upload objects are `.strict()` so any
 * credential-like extra key is rejected; the contract never carries credentials.
 */

/** Last 4 characters of a provider account number (labels, masks, audit snapshots). */
export function accountNumberLast4(accountNumber: string): string {
  return accountNumber.slice(-4);
}

/** One scraped transaction as the local app sends it. Amounts are signed decimal STRINGS. */
export const scrapedTransactionSchema = z
  .object({
    /** Provider transaction id; numeric ids are stringified by the client. */
    identifier: z.string().max(200).optional(),
    date: z.string().datetime({ offset: true, message: "תאריך התנועה אינו תקין" }),
    processedDate: z
      .string()
      .datetime({ offset: true, message: "תאריך החיוב אינו תקין" })
      .optional(),
    /** "-123.45" = expense, "200.00" = income. */
    chargedAmount: signedMoneySchema,
    originalAmount: signedMoneySchema.optional(),
    originalCurrency: z.string().max(10).optional(),
    chargedCurrency: z.string().max(10).optional(),
    description: z.string().max(500, "התיאור ארוך מדי"),
    memo: z.string().max(1000).optional(),
    status: z.enum(["completed", "pending"]),
    installments: z
      .object({
        number: z.number().int().min(1),
        total: z.number().int().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ScrapedTransaction = z.infer<typeof scrapedTransactionSchema>;

export const scrapedAccountSchema = z
  .object({
    accountNumber: z.string().trim().min(1, "חסר מספר חשבון").max(64),
    txns: z.array(scrapedTransactionSchema).max(5000, "יותר מדי תנועות בחשבון אחד"),
  })
  .strict();
export type ScrapedAccount = z.infer<typeof scrapedAccountSchema>;

/** Body of `POST /api/sync/uploads`: one request per provider with all its scraped accounts. */
export const bankSyncUploadSchema = z
  .object({
    provider: bankSyncProviderSchema,
    scrapedAt: z.string().datetime({ offset: true, message: "מועד הסנכרון אינו תקין" }),
    /** First day of the scraped window (informational/audit). */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך ההתחלה אינו תקין"),
    agentVersion: z.string().max(40).optional(),
    accounts: z
      .array(scrapedAccountSchema)
      .min(1, "לא התקבלו חשבונות")
      .max(50, "יותר מדי חשבונות"),
  })
  .strict();
export type BankSyncUpload = z.infer<typeof bankSyncUploadSchema>;

/** Why the server did not import a scraped row (pending skipped by design, non-ILS, zero/bad date). */
export const bankSyncSkipReasonSchema = z.enum(["pending", "foreign", "invalid"]);
export type BankSyncSkipReason = z.infer<typeof bankSyncSkipReasonSchema>;

export const bankSyncSkippedRowSchema = z.object({
  /** Index into this account's uploaded `txns` (the server does not echo the row back). */
  index: z.number().int().nonnegative(),
  reason: bankSyncSkipReasonSchema,
});
export type BankSyncSkippedRow = z.infer<typeof bankSyncSkippedRowSchema>;

export const bankSyncUploadAccountResultSchema = z.object({
  accountNumber: z.string(),
  linkId: z.string().uuid(),
  status: syncAccountLinkStatusSchema,
  accountId: z.string().uuid().nullable(),
  /** Null when nothing was created or the account is not linked. */
  importBatchId: z.string().uuid().nullable(),
  received: z.number().int(),
  created: z.number().int(),
  duplicates: z.number().int(),
  skippedPending: z.number().int(),
  skippedInvalid: z.number().int(),
  skippedForeign: z.number().int(),
  /** Which rows were skipped and why (empty for unlinked accounts: they are not mapped). */
  skipped: z.array(bankSyncSkippedRowSchema).default([]),
  /** Hebrew message when applying this account failed; other accounts still apply. */
  error: z.string().nullable(),
});
export type BankSyncUploadAccountResult = z.infer<typeof bankSyncUploadAccountResultSchema>;

export const bankSyncUploadResultSchema = z.object({
  accounts: z.array(bankSyncUploadAccountResultSchema),
});
export type BankSyncUploadResult = z.infer<typeof bankSyncUploadResultSchema>;

/** Server-side mapping of a provider account number to a household account (web-facing). */
export const syncAccountLinkSchema = z.object({
  syncAccountLinkId: z.string().uuid(),
  provider: bankSyncProviderSchema,
  externalAccountNumber: z.string(),
  status: syncAccountLinkStatusSchema,
  accountId: z.string().uuid().nullable(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
});
export type SyncAccountLink = z.infer<typeof syncAccountLinkSchema>;

export const updateSyncAccountLinkSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("linked"),
    accountId: z.string({ required_error: "יש לבחור חשבון" }).uuid("יש לבחור חשבון"),
  }),
  z.object({ status: z.literal("ignored") }),
  z.object({ status: z.literal("unmapped") }),
]);
export type UpdateSyncAccountLinkInput = z.infer<typeof updateSyncAccountLinkSchema>;
