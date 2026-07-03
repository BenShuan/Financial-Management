import { z } from "zod";
import { accountTypeSchema } from "./enums.js";
import { moneySchema, signedMoneySchema } from "./money.js";
import { recurringOccurrenceSchema } from "./recurring.js";

/** GET /api/dashboard - everything the home screen needs in one call. */
export const dashboardSummarySchema = z.object({
  netWorth: signedMoneySchema,
  netWorthMonthDelta: signedMoneySchema,
  accounts: z.array(
    z.object({
      accountId: z.string().uuid(),
      name: z.string(),
      type: accountTypeSchema,
      currentBalance: signedMoneySchema,
    }),
  ),
  /** Null when no active budget period covers the current year. */
  monthBudget: z
    .object({
      budgetPeriodId: z.string().uuid(),
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      plannedMonthly: moneySchema,
      plannedAnnual: moneySchema,
      spentMonth: moneySchema,
    })
    .nullable(),
  upcoming: z.array(recurringOccurrenceSchema),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
