import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, TEST_DATABASE_URL, type Harness } from "../test/harness.js";
import type { AuthContext } from "../types.js";

/** Splits, transfer legs, tags, household scoping and audit for /api/transactions (FM-10). */
describe.skipIf(!TEST_DATABASE_URL)("transactions API (Postgres)", () => {
  let h: Harness;
  let auth: AuthContext;
  let other: AuthContext;
  let app: ReturnType<Harness["appFor"]>;
  let checking: string;
  let savings: string;
  let foodCat: string;
  let funCat: string;
  let tagId: string;
  let otherCat: string;
  let otherTag: string;

  const post = (body: unknown) => app.request("/api/transactions", h.json("POST", body));
  const patch = (id: string, body: unknown) =>
    app.request(`/api/transactions/${id}`, h.json("PATCH", body));

  async function account(householdId: string, openingBalance = "0.00") {
    const [row] = await h.db
      .insert(h.schema.accounts)
      .values({ householdId, name: "test", type: "checking", openingBalance })
      .returning();
    return row!.accountId;
  }
  async function category(householdId: string, name: string) {
    const [row] = await h.db
      .insert(h.schema.categories)
      .values({ householdId, name, kind: "expense" })
      .returning();
    return row!.categoryId;
  }
  async function balance(accountId: string) {
    const { eq } = await import("drizzle-orm");
    const [row] = await h.db
      .select({ b: h.schema.accounts.currentBalance })
      .from(h.schema.accounts)
      .where(eq(h.schema.accounts.accountId, accountId));
    return row!.b;
  }
  async function rows(table: "transactions" | "transactionSplits" | "transferLinks", id: string) {
    const { eq, or } = await import("drizzle-orm");
    if (table === "transactions") {
      return h.db.select().from(h.schema.transactions).where(eq(h.schema.transactions.accountId, id));
    }
    if (table === "transactionSplits") {
      return h.db
        .select()
        .from(h.schema.transactionSplits)
        .where(eq(h.schema.transactionSplits.transactionId, id));
    }
    return h.db
      .select()
      .from(h.schema.transferLinks)
      .where(
        or(
          eq(h.schema.transferLinks.fromTransactionId, id),
          eq(h.schema.transferLinks.toTransactionId, id),
        ),
      );
  }
  async function audit(entityId: string, actionType: string) {
    const { and, eq } = await import("drizzle-orm");
    return h.db
      .select()
      .from(h.schema.auditEvents)
      .where(
        and(
          eq(h.schema.auditEvents.entityId, entityId),
          eq(h.schema.auditEvents.actionType, actionType),
        ),
      );
  }
  const expense = (accountId: string, amount: string, extra: object = {}) => ({
    accountId,
    type: "expense",
    amount,
    transactionDate: "2026-02-01",
    description: "קנייה",
    ...extra,
  });

  beforeAll(async () => {
    h = await createHarness();
    auth = await h.createHousehold("member");
    other = await h.createHousehold("owner");
    app = h.appFor((await import("./transactions.js")).transactionsRouter, () => auth);
    checking = await account(auth.householdId, "1000.00");
    savings = await account(auth.householdId, "0.00");
    foodCat = await category(auth.householdId, "food");
    funCat = await category(auth.householdId, "fun");
    otherCat = await category(other.householdId, "foreign");
    [{ tagId }] = await h.db
      .insert(h.schema.tags)
      .values({ householdId: auth.householdId, name: "t1" })
      .returning();
    [{ tagId: otherTag }] = await h.db
      .insert(h.schema.tags)
      .values({ householdId: other.householdId, name: "t2" })
      .returning();
  });

  afterAll(async () => {
    if (h) await h.cleanup();
  });

  describe("create", () => {
    it("stores splits with a NULL header category and tags, and audits the create", async () => {
      const res = await post(
        expense(checking, "100.00", {
          splits: [
            { categoryId: foodCat, amount: "60.00" },
            { categoryId: funCat, amount: "40.00" },
          ],
          tagIds: [tagId],
        }),
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { transactionId: string; categoryId: string | null; tagIds: string[] };
      expect(body.categoryId).toBeNull();
      expect(body.tagIds).toEqual([tagId]);
      expect(await rows("transactionSplits", body.transactionId)).toHaveLength(2);
      const [event] = await audit(body.transactionId, "transaction.created");
      expect(event?.afterSnapshot).toMatchObject({ splitCount: 2, tagCount: 1 });
    });

    it("rejects splits that do not sum to the amount", async () => {
      const res = await post(
        expense(checking, "100.00", {
          splits: [
            { categoryId: foodCat, amount: "60.00" },
            { categoryId: funCat, amount: "30.00" },
          ],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("requires a category or splits for manual income/expense", async () => {
      expect((await post(expense(checking, "5.00"))).status).toBe(400);
    });

    it("creates a transfer as two legs, a link and no category, moving the balances", async () => {
      const res = await post({
        accountId: checking,
        type: "transfer",
        amount: "250.50",
        transactionDate: "2026-02-02",
        description: "העברה",
        transferPeerAccountId: savings,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { transactionId: string; categoryId: string | null };
      expect(body.categoryId).toBeNull();
      expect(await rows("transferLinks", body.transactionId)).toHaveLength(1);
      expect(await balance(savings)).toBe("250.50");
    });

    it("rejects a transfer to the same account or with a category", async () => {
      const base = {
        accountId: checking,
        type: "transfer",
        amount: "1.00",
        transactionDate: "2026-02-02",
        description: "x",
      };
      expect((await post({ ...base, transferPeerAccountId: checking })).status).toBe(400);
      expect(
        (await post({ ...base, transferPeerAccountId: savings, categoryId: foodCat })).status,
      ).toBe(400);
    });

    it("rejects another household's category or tag and writes nothing", async () => {
      const before = (await rows("transactions", checking)).length;
      expect((await post(expense(checking, "9.00", { categoryId: otherCat }))).status).toBe(404);
      expect(
        (await post(expense(checking, "9.00", { categoryId: foodCat, tagIds: [otherTag] }))).status,
      ).toBe(404);
      expect(
        (
          await post(
            expense(checking, "9.00", {
              splits: [
                { categoryId: foodCat, amount: "4.00" },
                { categoryId: otherCat, amount: "5.00" },
              ],
            }),
          )
        ).status,
      ).toBe(404);
      expect((await rows("transactions", checking)).length).toBe(before);
    });

    it("rejects an account from another household", async () => {
      const foreign = await account(other.householdId);
      expect((await post(expense(foreign, "1.00", { categoryId: foodCat }))).status).toBe(404);
    });
  });

  describe("update", () => {
    async function splitTxn() {
      const res = await post(
        expense(checking, "100.00", {
          splits: [
            { categoryId: foodCat, amount: "70.00" },
            { categoryId: funCat, amount: "30.00" },
          ],
        }),
      );
      return ((await res.json()) as { transactionId: string }).transactionId;
    }

    it("rejects an amount change that leaves the splits out of sync", async () => {
      const id = await splitTxn();
      expect((await patch(id, { amount: "120.00" })).status).toBe(400);
    });

    it("accepts an amount change together with matching splits and audits it", async () => {
      const id = await splitTxn();
      const res = await patch(id, {
        amount: "120.00",
        splits: [
          { categoryId: foodCat, amount: "80.00" },
          { categoryId: funCat, amount: "40.00" },
        ],
      });
      expect(res.status).toBe(200);
      expect(await rows("transactionSplits", id)).toHaveLength(2);
      const [event] = await audit(id, "transaction.updated");
      expect(event?.beforeSnapshot).toMatchObject({ amount: "100.00", splitCount: 2 });
      expect(event?.afterSnapshot).toMatchObject({ amount: "120.00", splitCount: 2 });
    });

    it("refuses a header category while splits exist", async () => {
      const id = await splitTxn();
      expect((await patch(id, { categoryId: foodCat })).status).toBe(400);
    });

    it("removes splits with [] and then allows a header category", async () => {
      const id = await splitTxn();
      expect((await patch(id, { splits: [] })).status).toBe(200);
      expect(await rows("transactionSplits", id)).toHaveLength(0);
      const res = await patch(id, { categoryId: foodCat });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { categoryId: string }).categoryId).toBe(foodCat);
    });

    it("rejects foreign categories/tags on update", async () => {
      const id = await splitTxn();
      expect((await patch(id, { tagIds: [otherTag] })).status).toBe(404);
      expect(
        (
          await patch(id, {
            splits: [
              { categoryId: otherCat, amount: "50.00" },
              { categoryId: funCat, amount: "50.00" },
            ],
          })
        ).status,
      ).toBe(404);
    });

    it("keeps both transfer legs equal when the amount changes, and rejects categories/splits", async () => {
      const from = await account(auth.householdId, "500.00");
      const to = await account(auth.householdId, "0.00");
      const created = (await (
        await post({
          accountId: from,
          type: "transfer",
          amount: "100.00",
          transactionDate: "2026-02-03",
          description: "העברה",
          transferPeerAccountId: to,
        })
      ).json()) as { transactionId: string };
      expect((await patch(created.transactionId, { categoryId: foodCat })).status).toBe(400);
      expect(
        (
          await patch(created.transactionId, {
            splits: [{ categoryId: foodCat, amount: "100.00" }],
          })
        ).status,
      ).toBe(400);
      expect((await patch(created.transactionId, { amount: "40.00" })).status).toBe(200);
      expect(await balance(from)).toBe("460.00");
      expect(await balance(to)).toBe("40.00");
    });
  });

  describe("bulk categorize and delete", () => {
    it("skips split transactions and transfers when bulk categorizing", async () => {
      const split = (await (
        await post(
          expense(checking, "10.00", {
            splits: [
              { categoryId: foodCat, amount: "4.00" },
              { categoryId: funCat, amount: "6.00" },
            ],
          }),
        )
      ).json()) as { transactionId: string };
      const plain = (await (await post(expense(checking, "3.00", { categoryId: foodCat }))).json()) as {
        transactionId: string;
      };
      const res = await app.request(
        "/api/transactions/bulk-categorize",
        h.json("POST", { transactionIds: [split.transactionId, plain.transactionId], categoryId: funCat }),
      );
      expect(res.status).toBe(200);
      const updated = (await res.json()) as { transactionId: string }[];
      expect(updated.map((t) => t.transactionId)).toEqual([plain.transactionId]);
      expect(await rows("transactionSplits", split.transactionId)).toHaveLength(2);
    });

    it("deletes both legs of a transfer, restores balances and audits it", async () => {
      const from = await account(auth.householdId, "300.00");
      const to = await account(auth.householdId, "0.00");
      const created = (await (
        await post({
          accountId: from,
          type: "transfer",
          amount: "75.00",
          transactionDate: "2026-02-04",
          description: "העברה",
          transferPeerAccountId: to,
        })
      ).json()) as { transactionId: string };
      expect(await balance(to)).toBe("75.00");
      const res = await app.request(`/api/transactions/${created.transactionId}`, { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(await rows("transactions", from)).toHaveLength(0);
      expect(await rows("transactions", to)).toHaveLength(0);
      expect(await balance(from)).toBe("300.00");
      expect(await balance(to)).toBe("0.00");
      expect(await audit(created.transactionId, "transaction.deleted")).toHaveLength(1);
    });
  });
});
