import { z } from "zod";
import {
  budgetPeriodStatusSchema,
  goalContributionSourceSchema,
  goalStatusSchema,
  goalTypeSchema,
} from "./enums.js";
import { moneySchema, positiveMoneySchema } from "./money.js";

export const budgetLineSchema = z.object({
  budgetLineId: z.string().uuid(),
  budgetPeriodId: z.string().uuid(),
  categoryId: z.string().uuid(),
  /** Annual planned amount; the monthly view is derived (annual / 12), never stored. */
  plannedAmount: moneySchema,
  rolloverFromPrevious: moneySchema.nullable(),
});
export type BudgetLine = z.infer<typeof budgetLineSchema>;

export const budgetPeriodSchema = z.object({
  budgetPeriodId: z.string().uuid(),
  householdId: z.string().uuid(),
  year: z.number().int(),
  status: budgetPeriodStatusSchema,
  rolloverEnabled: z.boolean(),
  notes: z.string().nullable(),
  lines: z.array(budgetLineSchema),
  createdAt: z.string(),
});
export type BudgetPeriod = z.infer<typeof budgetPeriodSchema>;

export const createBudgetPeriodSchema = z.object({
  year: z
    .number({ invalid_type_error: "יש לבחור שנה" })
    .int()
    .min(2000, "שנה לא תקינה")
    .max(2100, "שנה לא תקינה"),
  rolloverEnabled: z.boolean().default(false),
  notes: z.string().max(500).optional(),
  lines: z
    .array(
      z.object({
        categoryId: z.string().uuid({ message: "יש לבחור קטגוריה" }),
        plannedAmount: positiveMoneySchema,
      }),
    )
    .min(1, "יש להוסיף לפחות קטגוריה אחת לתוכנית"),
});
export type CreateBudgetPeriodInput = z.infer<typeof createBudgetPeriodSchema>;

export const updateBudgetPeriodSchema = z.object({
  status: budgetPeriodStatusSchema.optional(),
  rolloverEnabled: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
  lines: createBudgetPeriodSchema.shape.lines.optional(),
});
export type UpdateBudgetPeriodInput = z.infer<typeof updateBudgetPeriodSchema>;

/** Read-time actuals for a budget line (spent = cleared + pending expense transactions). */
export const budgetLineActualsSchema = z.object({
  budgetLineId: z.string().uuid(),
  categoryId: z.string().uuid(),
  plannedAnnual: moneySchema,
  /** plannedAnnual / 12, rounded for display - derived, never stored. */
  plannedMonthly: moneySchema,
  spentMonth: moneySchema,
  spentYearToDate: moneySchema,
});
export type BudgetLineActuals = z.infer<typeof budgetLineActualsSchema>;

export const budgetActualsSchema = z.object({
  budgetPeriodId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  totals: z.object({
    plannedAnnual: moneySchema,
    plannedMonthly: moneySchema,
    spentMonth: moneySchema,
    spentYearToDate: moneySchema,
  }),
  lines: z.array(budgetLineActualsSchema),
});
export type BudgetActuals = z.infer<typeof budgetActualsSchema>;

export const goalSchema = z.object({
  goalId: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string(),
  goalType: goalTypeSchema,
  targetAmount: positiveMoneySchema,
  targetDate: z.string().nullable(),
  status: goalStatusSchema,
  linkedAccountId: z.string().uuid().nullable(),
  contributedTotal: moneySchema,
  createdAt: z.string(),
});
export type Goal = z.infer<typeof goalSchema>;

export const createGoalSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם יעד"),
  goalType: goalTypeSchema,
  targetAmount: positiveMoneySchema,
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  linkedAccountId: z.string().uuid().optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const createGoalContributionSchema = z.object({
  amount: positiveMoneySchema,
  contributionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceType: goalContributionSourceSchema.default("manual"),
  note: z.string().max(200).optional(),
});
export type CreateGoalContributionInput = z.infer<typeof createGoalContributionSchema>;
