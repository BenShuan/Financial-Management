import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  budgetActualsSchema,
  budgetPeriodSchema,
  createBudgetPeriodSchema,
  fromMinorUnits,
  sumMoney,
  toMinorUnits,
  updateBudgetPeriodSchema,
} from "@financial-management/shared";
import { db } from "../db/index.js";
import { budgetLines, budgetPeriods } from "../db/schema.js";
import { emitAuditEvent } from "../lib/audit.js";
import { createRouter } from "../lib/router.js";
import { requireRole } from "../middleware/auth.js";
import { spentOnCategories } from "./dashboard.js";

type PeriodRow = typeof budgetPeriods.$inferSelect;
type LineRow = typeof budgetLines.$inferSelect;

function serializePeriod(period: PeriodRow, lines: LineRow[]) {
  return {
    budgetPeriodId: period.budgetPeriodId,
    householdId: period.householdId,
    year: period.year,
    status: period.status,
    rolloverEnabled: period.rolloverEnabled,
    notes: period.notes,
    lines: lines.map((line) => ({
      budgetLineId: line.budgetLineId,
      budgetPeriodId: line.budgetPeriodId,
      categoryId: line.categoryId,
      plannedAmount: line.plannedAmount,
      rolloverFromPrevious: line.rolloverFromPrevious,
    })),
    createdAt: period.createdAt.toISOString(),
  };
}

async function getHouseholdPeriod(householdId: string, budgetPeriodId: string) {
  const [period] = await db
    .select()
    .from(budgetPeriods)
    .where(
      and(
        eq(budgetPeriods.budgetPeriodId, budgetPeriodId),
        eq(budgetPeriods.householdId, householdId),
      ),
    );
  if (!period) throw new HTTPException(404, { message: "התוכנית לא נמצאה" });
  return period;
}

const periodIdParam = z.object({ budgetPeriodId: z.string().uuid() });

export const budgetsRouter = createRouter();

budgetsRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/budgets",
    tags: ["Budgets"],
    summary: "List budget periods (newest year first)",
    responses: {
      200: {
        description: "Budget periods with lines",
        content: { "application/json": { schema: z.array(budgetPeriodSchema) } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const periods = await db
      .select()
      .from(budgetPeriods)
      .where(eq(budgetPeriods.householdId, auth.householdId))
      .orderBy(desc(budgetPeriods.year));
    const result = [];
    for (const period of periods) {
      const lines = await db
        .select()
        .from(budgetLines)
        .where(eq(budgetLines.budgetPeriodId, period.budgetPeriodId));
      result.push(serializePeriod(period, lines));
    }
    return c.json(result);
  },
);

budgetsRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/budgets",
    tags: ["Budgets"],
    summary: "Create annual plan (admin+); one per household per year",
    request: {
      body: { content: { "application/json": { schema: createBudgetPeriodSchema } } },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: budgetPeriodSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const input = c.req.valid("json");

    const [existing] = await db
      .select({ id: budgetPeriods.budgetPeriodId })
      .from(budgetPeriods)
      .where(
        and(
          eq(budgetPeriods.householdId, auth.householdId),
          eq(budgetPeriods.year, input.year),
        ),
      );
    if (existing) {
      throw new HTTPException(409, { message: `כבר קיימת תוכנית לשנת ${input.year}` });
    }

    const [period] = await db
      .insert(budgetPeriods)
      .values({
        householdId: auth.householdId,
        year: input.year,
        status: "active",
        rolloverEnabled: input.rolloverEnabled,
        notes: input.notes,
      })
      .returning();
    if (!period) throw new HTTPException(500, { message: "יצירת התוכנית נכשלה" });

    const lines = await db
      .insert(budgetLines)
      .values(
        input.lines.map((line) => ({
          budgetPeriodId: period.budgetPeriodId,
          categoryId: line.categoryId,
          plannedAmount: line.plannedAmount,
        })),
      )
      .returning();

    await emitAuditEvent(auth, {
      actionType: "budget_period.created",
      entityType: "budget_period",
      entityId: period.budgetPeriodId,
      after: { year: input.year, lineCount: lines.length },
    });
    return c.json(serializePeriod(period, lines), 201);
  },
);

budgetsRouter.openapi(
  createRoute({
    method: "patch",
    path: "/api/budgets/{budgetPeriodId}",
    tags: ["Budgets"],
    summary: "Update plan or its lines (admin+); closing follows draft→active→closed",
    request: {
      params: periodIdParam,
      body: { content: { "application/json": { schema: updateBudgetPeriodSchema } } },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: budgetPeriodSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const { budgetPeriodId } = c.req.valid("param");
    const input = c.req.valid("json");
    const before = await getHouseholdPeriod(auth.householdId, budgetPeriodId);

    if (input.status) {
      const allowed: Record<string, string[]> = {
        draft: ["active"],
        active: ["closed"],
        closed: [],
      };
      if (input.status !== before.status && !allowed[before.status]?.includes(input.status)) {
        throw new HTTPException(400, {
          message: `לא ניתן לעבור מסטטוס ${before.status} ל-${input.status}`,
        });
      }
    }
    if (before.status === "closed") {
      throw new HTTPException(400, { message: "תוכנית סגורה אינה ניתנת לעריכה" });
    }

    const [period] = await db
      .update(budgetPeriods)
      .set({
        status: input.status,
        rolloverEnabled: input.rolloverEnabled,
        notes: input.notes,
      })
      .where(eq(budgetPeriods.budgetPeriodId, budgetPeriodId))
      .returning();
    if (!period) throw new HTTPException(500, { message: "עדכון התוכנית נכשל" });

    if (input.lines) {
      await db.delete(budgetLines).where(eq(budgetLines.budgetPeriodId, budgetPeriodId));
      await db.insert(budgetLines).values(
        input.lines.map((line) => ({
          budgetPeriodId,
          categoryId: line.categoryId,
          plannedAmount: line.plannedAmount,
        })),
      );
    }
    const lines = await db
      .select()
      .from(budgetLines)
      .where(eq(budgetLines.budgetPeriodId, budgetPeriodId));

    if (input.status === "closed") {
      await emitAuditEvent(auth, {
        actionType: "budget_period.closed",
        entityType: "budget_period",
        entityId: budgetPeriodId,
        before: { status: before.status },
      });
    }
    return c.json(serializePeriod(period, lines));
  },
);

budgetsRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/budgets/{budgetPeriodId}/actuals",
    tags: ["Budgets"],
    summary: "Read-time actuals per line: month + YTD spend vs derived monthly plan",
    request: {
      params: periodIdParam,
      query: z.object({ month: z.coerce.number().int().min(1).max(12).optional() }),
    },
    responses: {
      200: {
        description: "Actuals (derived, never stored)",
        content: { "application/json": { schema: budgetActualsSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const { budgetPeriodId } = c.req.valid("param");
    const { month: monthParam } = c.req.valid("query");
    const period = await getHouseholdPeriod(auth.householdId, budgetPeriodId);

    const now = new Date();
    const month = monthParam ?? (period.year === now.getFullYear() ? now.getMonth() + 1 : 12);
    const monthStart = `${period.year}-${String(month).padStart(2, "0")}-01`;
    const monthEndDate = new Date(Date.UTC(period.year, month, 0));
    const monthEnd = monthEndDate.toISOString().slice(0, 10);
    const yearStart = `${period.year}-01-01`;
    const yearEnd = `${period.year}-12-31`;

    const lines = await db
      .select()
      .from(budgetLines)
      .where(eq(budgetLines.budgetPeriodId, budgetPeriodId));

    const lineActuals = [];
    for (const line of lines) {
      const [spentMonth, spentYearToDate] = await Promise.all([
        spentOnCategories(auth.householdId, [line.categoryId], monthStart, monthEnd),
        spentOnCategories(auth.householdId, [line.categoryId], yearStart, yearEnd),
      ]);
      lineActuals.push({
        budgetLineId: line.budgetLineId,
        categoryId: line.categoryId,
        plannedAnnual: line.plannedAmount,
        plannedMonthly: fromMinorUnits(toMinorUnits(line.plannedAmount) / 12n),
        spentMonth,
        spentYearToDate,
      });
    }

    const plannedAnnual = sumMoney(lineActuals.map((l) => l.plannedAnnual));
    return c.json({
      budgetPeriodId,
      year: period.year,
      month,
      totals: {
        plannedAnnual,
        plannedMonthly: fromMinorUnits(toMinorUnits(plannedAnnual) / 12n),
        spentMonth: sumMoney(lineActuals.map((l) => l.spentMonth)),
        spentYearToDate: sumMoney(lineActuals.map((l) => l.spentYearToDate)),
      },
      lines: lineActuals,
    });
  },
);
