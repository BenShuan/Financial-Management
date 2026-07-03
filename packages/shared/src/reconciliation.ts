import { z } from "zod";
import { reconciliationStatusSchema } from "./enums.js";
import { signedMoneySchema } from "./money.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "יש לבחור תאריך תקין");

export const reconciliationSessionSchema = z.object({
  reconciliationId: z.string().uuid(),
  accountId: z.string().uuid(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  statementEndingBalance: signedMoneySchema,
  calculatedEndingBalance: signedMoneySchema,
  status: reconciliationStatusSchema,
  notes: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ReconciliationSession = z.infer<typeof reconciliationSessionSchema>;

export const createReconciliationSessionSchema = z
  .object({
    accountId: z.string().uuid({ message: "יש לבחור חשבון" }),
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    statementEndingBalance: signedMoneySchema,
    notes: z.string().max(500).optional(),
  })
  .refine((d) => d.periodStart <= d.periodEnd, {
    path: ["periodEnd"],
    message: "תאריך הסיום חייב להיות אחרי תאריך ההתחלה",
  });
export type CreateReconciliationSessionInput = z.infer<
  typeof createReconciliationSessionSchema
>;
