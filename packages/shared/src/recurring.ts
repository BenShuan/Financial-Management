import { z } from "zod";
import {
  occurrenceStatusSchema,
  recurringFlowTypeSchema,
  recurringFrequencySchema,
} from "./enums.js";
import { positiveMoneySchema } from "./money.js";

export const recurringTemplateSchema = z.object({
  recurringId: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string(),
  flowType: recurringFlowTypeSchema,
  amountExpected: positiveMoneySchema,
  frequency: recurringFrequencySchema,
  startDate: z.string(),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  accountId: z.string().uuid().nullable(),
  categoryId: z.string().uuid().nullable(),
  merchantName: z.string().nullable(),
  isActive: z.boolean(),
});
export type RecurringTemplate = z.infer<typeof recurringTemplateSchema>;

export const recurringOccurrenceSchema = z.object({
  occurrenceId: z.string().uuid(),
  recurringId: z.string().uuid(),
  dueDate: z.string(),
  expectedAmount: positiveMoneySchema,
  status: occurrenceStatusSchema,
  matchedTransactionId: z.string().uuid().nullable(),
  /** Denormalized for dashboard display. */
  templateName: z.string(),
  flowType: recurringFlowTypeSchema,
});
export type RecurringOccurrence = z.infer<typeof recurringOccurrenceSchema>;
