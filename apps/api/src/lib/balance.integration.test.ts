import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real ledger SQL of `recalcAccountBalance` against Postgres (the unit tests in
 * balance.test.ts mock the db). Opt-in: set TEST_DATABASE_URL (CI does; locally
 * `docker compose up -d` and point it at the dev database — every row created here is
 * removed afterwards). Without it the suite is skipped, so `pnpm test` never touches a db.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("recalcAccountBalance (Postgres)", () => {
  type Db = typeof import("../db/index.js").db;
  let db: Db;
  let schema: typeof import("../db/schema.js");
  let recalcAccountBalance: typeof import("./balance.js").recalcAccountBalance;
  let householdId: string;

  async function newAccount(openingBalance: string): Promise<string> {
    const [row] = await db
      .insert(schema.accounts)
      .values({ householdId, name: "test", type: "checking", openingBalance })
      .returning({ id: schema.accounts.accountId });
    return row.id;
  }

  async function newTxn(
    accountId: string,
    type: "income" | "expense" | "transfer",
    amount: string,
    status: "cleared" | "pending" = "cleared",
  ): Promise<string> {
    const [row] = await db
      .insert(schema.transactions)
      .values({
        householdId,
        accountId,
        type,
        amount,
        status,
        transactionDate: "2026-01-15",
        description: "test",
      })
      .returning({ id: schema.transactions.transactionId });
    return row.id;
  }

  async function storedBalance(accountId: string): Promise<string> {
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ b: schema.accounts.currentBalance })
      .from(schema.accounts)
      .where(eq(schema.accounts.accountId, accountId));
    return row.b;
  }

  beforeAll(async () => {
    // db/index.ts reads DATABASE_URL at import time, so set it before the first import.
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    ({ db } = await import("../db/index.js"));
    schema = await import("../db/schema.js");
    ({ recalcAccountBalance } = await import("./balance.js"));
    const { runMigrations } = await import("../db/migrate.js");
    await runMigrations();
    const [h] = await db
      .insert(schema.households)
      .values({ name: `balance-test-${randomUUID()}` })
      .returning({ id: schema.households.householdId });
    householdId = h.id;
  });

  afterAll(async () => {
    if (!db) return;
    const { eq } = await import("drizzle-orm");
    // transfer_links cascade from transactions; transactions must go before accounts.
    await db.delete(schema.transactions).where(eq(schema.transactions.householdId, householdId));
    await db.delete(schema.accounts).where(eq(schema.accounts.householdId, householdId));
    await db.delete(schema.households).where(eq(schema.households.householdId, householdId));
    await db.$client.end();
  });

  it("returns the opening balance for an account with no transactions", async () => {
    const id = await newAccount("100.00");
    await expect(recalcAccountBalance(id)).resolves.toBe("100.00");
  });

  it("adds income and subtracts expenses to the cent, and persists the result", async () => {
    const id = await newAccount("1000.00");
    await newTxn(id, "income", "2500.50");
    await newTxn(id, "expense", "300.25");
    await expect(recalcAccountBalance(id)).resolves.toBe("3200.25");
    await expect(storedBalance(id)).resolves.toBe("3200.25");
  });

  it("has no floating-point drift (0.10 + 0.20 = 0.30)", async () => {
    const id = await newAccount("0.00");
    await newTxn(id, "income", "0.10");
    await newTxn(id, "income", "0.20");
    await expect(recalcAccountBalance(id)).resolves.toBe("0.30");
  });

  it("returns negative balances as signed decimal strings", async () => {
    const id = await newAccount("0.00");
    await newTxn(id, "expense", "80.05");
    await expect(recalcAccountBalance(id)).resolves.toBe("-80.05");
  });

  it("includes pending transactions", async () => {
    const id = await newAccount("50.00");
    await newTxn(id, "income", "10.00", "pending");
    await expect(recalcAccountBalance(id)).resolves.toBe("60.00");
  });

  it("moves money out of the source and into the destination account on a transfer", async () => {
    const from = await newAccount("500.00");
    const to = await newAccount("100.00");
    const outLeg = await newTxn(from, "transfer", "200.10");
    const inLeg = await newTxn(to, "transfer", "200.10");
    await db
      .insert(schema.transferLinks)
      .values({ fromTransactionId: outLeg, toTransactionId: inLeg });
    await expect(recalcAccountBalance(from)).resolves.toBe("299.90");
    await expect(recalcAccountBalance(to)).resolves.toBe("300.10");
  });

  it("ignores transfer legs that are not linked", async () => {
    const id = await newAccount("10.00");
    await newTxn(id, "transfer", "5.00");
    await expect(recalcAccountBalance(id)).resolves.toBe("10.00");
  });

  it("does not mix in other accounts' transactions", async () => {
    const a = await newAccount("0.00");
    const b = await newAccount("0.00");
    await newTxn(a, "income", "40.00");
    await newTxn(b, "income", "7.00");
    await expect(recalcAccountBalance(a)).resolves.toBe("40.00");
  });

  it("falls back to 0.00 for an unknown account", async () => {
    await expect(recalcAccountBalance(randomUUID())).resolves.toBe("0.00");
  });
});
