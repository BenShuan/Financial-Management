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

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם חשבון"),
  type: accountTypeSchema,
  institutionName: z.string().trim().max(120).optional(),
  accountMask: z.string().trim().max(12).optional(),
  openingBalance: signedMoneySchema.default("0.00"),
  creditLimit: moneySchema.optional(),
  notes: z.string().max(500).optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = createAccountSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
