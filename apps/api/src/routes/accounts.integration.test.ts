import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, TEST_DATABASE_URL, type Harness } from "../test/harness.js";
import type { AuthContext } from "../types.js";

/** Account create/edit/archive and opening-balance recalculation (FM-33). */
describe.skipIf(!TEST_DATABASE_URL)("accounts API (Postgres)", () => {
  let h: Harness;
  let admin: AuthContext;
  let member: AuthContext;
  let other: AuthContext;
  let current: AuthContext;
  let app: ReturnType<Harness["appFor"]>;
  let txApp: ReturnType<Harness["appFor"]>;
  let incomeCategoryId: string;

  type Acc = {
    accountId: string;
    name: string;
    isActive: boolean;
    openingBalance: string;
    currentBalance: string;
    institutionName: string | null;
    accountMask: string | null;
    creditLimit: string | null;
    notes: string | null;
  };

  const createAcc = (body: object) => app.request("/api/accounts", h.json("POST", body));
  const acc = async (body: object): Promise<Acc> => {
    const res = await createAcc({ type: "checking", ...body });
    expect(res.status).toBe(201);
    return (await res.json()) as Acc;
  };
  const patchAcc = (id: string, body: object) => app.request(`/api/accounts/${id}`, h.json("PATCH", body));
  const getAcc = async (id: string) => (await (await app.request(`/api/accounts/${id}`)).json()) as Acc;

  async function audit(entityId: string, actionType: string) {
    const { and, eq } = await import("drizzle-orm");
    return h.db
      .select()
      .from(h.schema.auditEvents)
      .where(and(eq(h.schema.auditEvents.entityId, entityId), eq(h.schema.auditEvents.actionType, actionType)));
  }

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.createHousehold("admin");
    member = { ...admin, role: "member" };
    other = await h.createHousehold("owner");
    current = admin;
    app = h.appFor((await import("./accounts.js")).accountsRouter, () => current);
    txApp = h.appFor((await import("./transactions.js")).transactionsRouter, () => current);
    const [cat] = await h.db
      .insert(h.schema.categories)
      .values({ householdId: admin.householdId, name: "הכנסה", kind: "income" })
      .returning();
    incomeCategoryId = cat!.categoryId;
  });

  afterAll(async () => {
    if (h) await h.cleanup();
  });

  it("recalculates currentBalance when openingBalance changes", async () => {
    const a = await acc({ name: "עו״ש", openingBalance: "100" });
    expect(a.currentBalance).toBe("100.00");
    const tx = await txApp.request(
      "/api/transactions",
      h.json("POST", {
        accountId: a.accountId,
        type: "income",
        amount: "50.00",
        transactionDate: "2026-03-01",
        description: "משכורת",
        categoryId: incomeCategoryId,
      }),
    );
    expect(tx.status).toBe(201);
    expect((await getAcc(a.accountId)).currentBalance).toBe("150.00");

    const res = await patchAcc(a.accountId, { openingBalance: "200" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ openingBalance: "200.00", currentBalance: "250.00" });
    expect(await getAcc(a.accountId)).toMatchObject({ openingBalance: "200.00", currentBalance: "250.00" });

    const [event] = await audit(a.accountId, "account.updated");
    expect(event?.beforeSnapshot).toMatchObject({ openingBalance: "100.00", currentBalance: "150.00" });
    expect(event?.afterSnapshot).toMatchObject({ openingBalance: "200.00", currentBalance: "250.00" });
  });

  it("leaves balances unchanged on a name-only PATCH", async () => {
    const a = await acc({ name: "חיסכון", type: "savings", openingBalance: "-20.50" });
    const res = await patchAcc(a.accountId, { name: "חדש" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "חדש", openingBalance: "-20.50", currentBalance: "-20.50" });
  });

  it("clears nullable fields with null and keeps them cleared on later PATCHes", async () => {
    const a = await acc({
      name: "כרטיס",
      type: "credit",
      institutionName: "בנק",
      accountMask: "1234",
      creditLimit: "5000.00",
      notes: "הערה",
    });
    expect(a).toMatchObject({ institutionName: "בנק", accountMask: "1234", creditLimit: "5000.00", notes: "הערה" });
    const cleared = await patchAcc(a.accountId, {
      institutionName: null,
      accountMask: null,
      creditLimit: null,
      notes: null,
    });
    expect(cleared.status).toBe(200);
    const nulls = { institutionName: null, accountMask: null, creditLimit: null, notes: null };
    expect(await cleared.json()).toMatchObject(nulls);
    expect(await (await patchAcc(a.accountId, { name: "כרטיס 2" })).json()).toMatchObject({ name: "כרטיס 2", ...nulls });
  });

  it("archives and restores via isActive, audited; list still includes archived accounts", async () => {
    const a = await acc({ name: "ישן" });
    expect(await (await patchAcc(a.accountId, { isActive: false })).json()).toMatchObject({ isActive: false });
    const list = (await (await app.request("/api/accounts")).json()) as Acc[];
    expect(list.find((x) => x.accountId === a.accountId)?.isActive).toBe(false);
    expect(await (await patchAcc(a.accountId, { isActive: true })).json()).toMatchObject({ isActive: true });
    expect(await audit(a.accountId, "account.updated")).toHaveLength(2);
  });

  it("forbids members from creating or updating accounts", async () => {
    const a = await acc({ name: "מוגן" });
    current = member;
    try {
      expect((await createAcc({ name: "x", type: "cash" })).status).toBe(403);
      expect((await patchAcc(a.accountId, { name: "y" })).status).toBe(403);
    } finally {
      current = admin;
    }
    expect((await getAcc(a.accountId)).name).toBe("מוגן");
  });

  it("returns 404 for an account of another household", async () => {
    current = other;
    const foreign = await acc({ name: "זר" });
    current = admin;
    expect((await patchAcc(foreign.accountId, { name: "x" })).status).toBe(404);
  });

  it("rejects null for non-nullable fields", async () => {
    const a = await acc({ name: "תקין" });
    const res = await patchAcc(a.accountId, { name: null });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation_error" });
  });
});
