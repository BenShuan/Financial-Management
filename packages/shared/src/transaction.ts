import { z } from "zod";
import { transactionStatusSchema, transactionTypeSchema } from "./enums.js";
import { moneyEquals, positiveMoneySchema, sumMoney } from "./money.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "יש לבחור תאריך תקין");

export const transactionSplitSchema = z.object({
  splitId: z.string().uuid(),
  transactionId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: positiveMoneySchema,
  note: z.string().nullable(),
});
export type TransactionSplit = z.infer<typeof transactionSplitSchema>;

export const transactionSchema = z.object({
  transactionId: z.string().uuid(),
  householdId: z.string().uuid(),
  accountId: z.string().uuid(),
  type: transactionTypeSchema,
  amount: positiveMoneySchema,
  transactionDate: isoDateSchema,
  postedDate: isoDateSchema.nullable(),
  description: z.string(),
  merchantName: z.string().nullable(),
  categoryId: z.string().uuid().nullable(),
  status: transactionStatusSchema,
  notes: z.string().nullable(),
  importBatchId: z.string().uuid().nullable(),
  transferPeerAccountId: z.string().uuid().nullable(),
  /** For transfer legs: whether this leg sends ("out") or receives ("in") the money. */
  transferDirection: z.enum(["in", "out"]).nullable(),
  splits: z.array(transactionSplitSchema),
  tagIds: z.array(z.string().uuid()),
  createdAt: z.string(),
});
export type Transaction = z.infer<typeof transactionSchema>;

const splitInputSchema = z.object({
  categoryId: z.string().uuid({ message: "יש לבחור קטגוריה לכל פיצול" }),
  amount: positiveMoneySchema,
  note: z.string().max(200).optional(),
});
export type SplitInput = z.infer<typeof splitInputSchema>;

/**
 * Invariant (docs/agent/03, #5): income/expense require a user-chosen category
 * or splits covering the full amount; transfers carry no category and need a peer account.
 */
export const createTransactionSchema = z
  .object({
    accountId: z.string().uuid({ message: "יש לבחור חשבון" }),
    type: transactionTypeSchema,
    amount: positiveMoneySchema,
    transactionDate: isoDateSchema,
    description: z.string().trim().min(1, "יש להזין תיאור"),
    merchantName: z.string().trim().max(120).optional(),
    categoryId: z.string().uuid().optional(),
    status: transactionStatusSchema.default("cleared"),
    notes: z.string().max(500).optional(),
    splits: z.array(splitInputSchema).max(20).optional(),
    tagIds: z.array(z.string().uuid()).max(20).optional(),
    /** Required for transfers: the receiving peer account. */
    transferPeerAccountId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "transfer") {
      if (!data.transferPeerAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferPeerAccountId"],
          message: "יש לבחור חשבון יעד להעברה",
        });
      } else if (data.transferPeerAccountId === data.accountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferPeerAccountId"],
          message: "לא ניתן להעביר לאותו חשבון",
        });
      }
      if (data.categoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categoryId"],
          message: "העברה אינה מקבלת קטגוריה",
        });
      }
      return;
    }
    const splits = data.splits ?? [];
    if (splits.length > 0) {
      const total = sumMoney(splits.map((s) => s.amount));
      if (!moneyEquals(total, data.amount)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["splits"],
          message: "סכום הפיצולים חייב להיות שווה לסכום התנועה",
        });
      }
    } else if (!data.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: "יש לבחור קטגוריה — הקטגוריה נבחרת על ידך ולעולם לא אוטומטית",
      });
    }
  });
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z.object({
  amount: positiveMoneySchema.optional(),
  transactionDate: isoDateSchema.optional(),
  description: z.string().trim().min(1).optional(),
  merchantName: z.string().trim().max(120).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  status: transactionStatusSchema.optional(),
  notes: z.string().max(500).nullable().optional(),
  tagIds: z.array(z.string().uuid()).max(20).optional(),
});
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const listTransactionsQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  search: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
