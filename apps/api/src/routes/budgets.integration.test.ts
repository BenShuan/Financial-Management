import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, TEST_DATABASE_URL, type Harness } from "../test/harness.js";
import type { AuthContext } from "../types.js";

/** Budget income + expense planning, actuals and profit. */
describe.skipIf(!TEST_DATABASE_URL)("budgets API with income (Postgres)", () => {
  let h: Harness;
  let auth: AuthContext;
  let app: ReturnType<Harness["appFor"]>;
  let txApp: ReturnType<Harness["appFor"]>;
  let accountId: string;
  let incomeCat: string;
  let expenseCat: string;
  let transferCat: string;

  const YEAR = 2026;

  async function makeCategory(kind: string, name: string) {
    const [row] = await h.db
      .insert(h.schema.categories)
      .values({ householdId: auth.householdId, name, kind: kind as "income" })
      .returning();
    return row!.categoryId;
  }

  const postTx = (body: object) =>
    txApp.request("/api/transactions", h.json("POST", { accountId, description: "t", ...body }));

  beforeAll(async () => {
    h = await createHarness();
    auth = await h.createHousehold("admin");
    app = h.appFor((await import("./budgets.js")).budgetsRouter, () => auth);
    txApp = h.appFor((await import("./transactions.js")).transactionsRouter, () => auth);
    const [acc] = await h.db
      .insert(h.schema.accounts)
      .values({ householdId: auth.householdId, name: "test", type: "checking" })
      .returning();
    accountId = acc!.accountId;
    incomeCat = await makeCategory("income", "משכורת");
    expenseCat = await makeCategory("expense", "מכולת");
    transferCat = await makeCategory("transfer_neutral", "העברה");
  });

  afterAll(async () => {
    if (h) {
      const { eq } = await import("drizzle-orm");
      // Lines/periods reference categories, which the harness cleanup deletes.
      const periods = await h.db
        .select({ id: h.schema.budgetPeriods.budgetPeriodId })
        .from(h.schema.budgetPeriods)
        .where(eq(h.schema.budgetPeriods.householdId, auth.householdId));
      for (const p of periods) {
        await h.db.delete(h.schema.budgetLines).where(eq(h.schema.budgetLines.budgetPeriodId, p.id));
        await h.db.delete(h.schema.budgetPeriods).where(eq(h.schema.budgetPeriods.budgetPeriodId, p.id));
      }
      await h.cleanup();
    }
  });

  it("rejects transfer categories in a plan", async () => {
    const res = await app.request(
      "/api/budgets",
      h.json("POST", {
        year: 2030,
        lines: [{ categoryId: transferCat, plannedAmount: "100.00" }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("plans income and expense, and derives profit from actuals", async () => {
    const created = await app.request(
      "/api/budgets",
      h.json("POST", {
        year: YEAR,
        lines: [
          { categoryId: incomeCat, plannedAmount: "120000.00" },
          { categoryId: expenseCat, plannedAmount: "72000.00" },
        ],
      }),
    );
    expect(created.status).toBe(201);
    const period = (await created.json()) as { budgetPeriodId: string };

    expect(
      (await postTx({ type: "income", amount: "10000.00", transactionDate: `${YEAR}-03-05`, categoryId: incomeCat })).status,
    ).toBe(201);
    expect(
      (await postTx({ type: "expense", amount: "4000.00", transactionDate: `${YEAR}-03-10`, categoryId: expenseCat })).status,
    ).toBe(201);

    const res = await app.request(`/api/budgets/${period.budgetPeriodId}/actuals?month=3`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totals: { plannedAnnual: string; spentMonth: string };
      income: { plannedAnnual: string; plannedMonthly: string; actualMonth: string; actualYearToDate: string };
      profit: { plannedAnnual: string; plannedMonthly: string; actualMonth: string; actualYearToDate: string };
      lines: { categoryId: string; kind: string }[];
    };
    expect(body.totals.plannedAnnual).toBe("72000.00");
    expect(body.totals.spentMonth).toBe("4000.00");
    expect(body.income.plannedAnnual).toBe("120000.00");
    expect(body.income.plannedMonthly).toBe("10000.00");
    expect(body.income.actualMonth).toBe("10000.00");
    expect(body.profit.plannedAnnual).toBe("48000.00");
    expect(body.profit.plannedMonthly).toBe("4000.00");
    expect(body.profit.actualMonth).toBe("6000.00");
    expect(body.profit.actualYearToDate).toBe("6000.00");
    expect(body.lines.find((l) => l.categoryId === incomeCat)?.kind).toBe("income");
    expect(body.lines.find((l) => l.categoryId === expenseCat)?.kind).toBe("expense");
  });

  it("edits a plan in place: keeps line ids and rollover, adds and removes lines", async () => {
    const list = (await (await app.request("/api/budgets")).json()) as {
      budgetPeriodId: string;
      year: number;
      lines: { budgetLineId: string; categoryId: string; plannedAmount: string }[];
    }[];
    const period = list.find((p) => p.year === YEAR)!;
    const expenseLine = period.lines.find((l) => l.categoryId === expenseCat)!;
    await h.db
      .update(h.schema.budgetLines)
      .set({ rolloverFromPrevious: "50.00" })
      .where((await import("drizzle-orm")).eq(h.schema.budgetLines.budgetLineId, expenseLine.budgetLineId));

    const extraCat = await makeCategory("expense", "בילויים");
    const res = await app.request(
      `/api/budgets/${period.budgetPeriodId}`,
      h.json("PATCH", {
        lines: [
          { categoryId: expenseCat, plannedAmount: "96000.00" },
          { categoryId: extraCat, plannedAmount: "1200.00" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as {
      lines: { budgetLineId: string; categoryId: string; plannedAmount: string; rolloverFromPrevious: string | null }[];
    };
    expect(updated.lines).toHaveLength(2);
    const kept = updated.lines.find((l) => l.categoryId === expenseCat)!;
    expect(kept.budgetLineId).toBe(expenseLine.budgetLineId);
    expect(kept.plannedAmount).toBe("96000.00");
    expect(kept.rolloverFromPrevious).toBe("50.00");
    expect(updated.lines.some((l) => l.categoryId === incomeCat)).toBe(false);
    expect(updated.lines.some((l) => l.categoryId === extraCat)).toBe(true);
  });
});
