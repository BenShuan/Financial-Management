import { createRoute } from "@hono/zod-openapi";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  dashboardSummarySchema,
  fromMinorUnits,
  sumMoney,
  toMinorUnits,
} from "@financial-management/shared";
import { db } from "../db/index.js";
import {
  accounts,
  budgetLines,
  budgetPeriods,
  recurringOccurrences,
  recurringTemplates,
  transactions,
  transactionSplits,
} from "../db/schema.js";
import { createRouter } from "../lib/router.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Month spend on budgeted categories: header-categorized expenses plus split
 * amounts, restricted to the given category set and date range.
 */
export async function spentOnCategories(
  householdId: string,
  categoryIds: string[],
  from: string,
  to: string,
): Promise<string> {
  if (categoryIds.length === 0) return "0.00";
  const headerResult = await db
    .select({ total: sql<string | null>`SUM(${transactions.amount})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, "expense"),
        inArray(transactions.categoryId, categoryIds),
        gte(transactions.transactionDate, from),
        lte(transactions.transactionDate, to),
      ),
    );
  const splitResult = await db
    .select({ total: sql<string | null>`SUM(${transactionSplits.amount})` })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactions.transactionId, transactionSplits.transactionId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.type, "expense"),
        inArray(transactionSplits.categoryId, categoryIds),
        gte(transactions.transactionDate, from),
        lte(transactions.transactionDate, to),
      ),
    );
  return sumMoney([headerResult[0]?.total ?? "0.00", splitResult[0]?.total ?? "0.00"]);
}

export const dashboardRouter = createRouter();

dashboardRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/dashboard",
    tags: ["Dashboard"],
    summary: "Home screen summary: net worth, accounts, month budget, upcoming",
    responses: {
      200: {
        description: "Dashboard summary",
        content: { "application/json": { schema: dashboardSummarySchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStart = isoDate(new Date(Date.UTC(year, now.getMonth(), 1)));
    const monthEnd = isoDate(new Date(Date.UTC(year, now.getMonth() + 1, 0)));

    const accountRows = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, auth.householdId), eq(accounts.isActive, true)))
      .orderBy(asc(accounts.type), asc(accounts.createdAt));
    const netWorth = sumMoney(accountRows.map((a) => a.currentBalance));

    // Net-worth delta this month = income − expense (transfers cancel out)
    const flowTotals = await db
      .select({
        type: transactions.type,
        total: sql<string | null>`SUM(${transactions.amount})`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, auth.householdId),
          gte(transactions.transactionDate, monthStart),
          lte(transactions.transactionDate, monthEnd),
        ),
      )
      .groupBy(transactions.type);
    const income = flowTotals.find((r) => r.type === "income")?.total ?? "0.00";
    const expense = flowTotals.find((r) => r.type === "expense")?.total ?? "0.00";
    const netWorthMonthDelta = fromMinorUnits(toMinorUnits(income) - toMinorUnits(expense));

    // Active annual plan for the current year; monthly view derived (annual ÷ 12)
    const [period] = await db
      .select()
      .from(budgetPeriods)
      .where(
        and(
          eq(budgetPeriods.householdId, auth.householdId),
          eq(budgetPeriods.year, year),
          eq(budgetPeriods.status, "active"),
        ),
      );
    let monthBudget = null;
    if (period) {
      const lines = await db
        .select()
        .from(budgetLines)
        .where(eq(budgetLines.budgetPeriodId, period.budgetPeriodId));
      const plannedAnnual = sumMoney(lines.map((l) => l.plannedAmount));
      const plannedMonthly = fromMinorUnits(toMinorUnits(plannedAnnual) / 12n);
      const spentMonth = await spentOnCategories(
        auth.householdId,
        lines.map((l) => l.categoryId),
        monthStart,
        monthEnd,
      );
      monthBudget = {
        budgetPeriodId: period.budgetPeriodId,
        year,
        month,
        plannedMonthly,
        plannedAnnual,
        spentMonth,
      };
    }

    const upcoming = await db
      .select({
        occurrenceId: recurringOccurrences.occurrenceId,
        recurringId: recurringOccurrences.recurringId,
        dueDate: recurringOccurrences.dueDate,
        expectedAmount: recurringOccurrences.expectedAmount,
        status: recurringOccurrences.status,
        matchedTransactionId: recurringOccurrences.matchedTransactionId,
        templateName: recurringTemplates.name,
        flowType: recurringTemplates.flowType,
      })
      .from(recurringOccurrences)
      .innerJoin(
        recurringTemplates,
        eq(recurringTemplates.recurringId, recurringOccurrences.recurringId),
      )
      .where(
        and(
          eq(recurringTemplates.householdId, auth.householdId),
          eq(recurringOccurrences.status, "upcoming"),
        ),
      )
      .orderBy(asc(recurringOccurrences.dueDate))
      .limit(5);

    return c.json({
      netWorth,
      netWorthMonthDelta,
      accounts: accountRows.map((a) => ({
        accountId: a.accountId,
        name: a.name,
        type: a.type,
        currentBalance: a.currentBalance,
      })),
      monthBudget,
      upcoming,
    });
  },
);
