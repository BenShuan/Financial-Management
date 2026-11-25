import { z } from "zod";
import { accountTypeSchema } from "./enums.js";
import { moneySchema, signedMoneySchema } from "./money.js";

export const accountSchema = z.object({
  accountId: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string(),
  type: accountTypeSchema,
  institutionName: z.string().nullable(),
  accountMask: z.string().nullable(),
  openingBalance: signedMoneySchema,
  currentBalance: signedMoneySchema,
  creditLimit: moneySchema.nullable(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type Account = z.infer<typeof accountSchema>;

const accountName = z.string().trim().min(1, "יש להזין שם חשבון");
const institutionName = z.string().trim().max(120, "שם המוסד ארוך מדי");
const accountMask = z.string().trim().max(12, "ספרות החשבון ארוכות מדי");
const accountNotes = z.string().max(500, "ההערות ארוכות מדי");

export const createAccountSchema = z.object({
  name: accountName,
  type: accountTypeSchema,
  institutionName: institutionName.optional(),
  accountMask: accountMask.optional(),
  openingBalance: signedMoneySchema.default("0.00"),
  creditLimit: moneySchema.optional(),
  notes: accountNotes.optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

/**
 * PATCH body: `undefined` = leave unchanged, `null` = clear (nullable fields only).
 * No defaults, so a partial update never resets openingBalance.
 */
export const updateAccountSchema = z.object({
  name: accountName.optional(),
  type: accountTypeSchema.optional(),
  institutionName: institutionName.nullable().optional(),
  accountMask: accountMask.nullable().optional(),
  openingBalance: signedMoneySchema.optional(),
  creditLimit: moneySchema.nullable().optional(),
  notes: accountNotes.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
