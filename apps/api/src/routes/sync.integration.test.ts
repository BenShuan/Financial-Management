import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, TEST_DATABASE_URL, type Harness } from "../test/harness.js";
import type { AuthContext } from "../types.js";

/** Bank / credit-card auto-fetch upload, account linking and dedupe (FM-29). */
describe.skipIf(!TEST_DATABASE_URL)("bank sync API (Postgres)", () => {
  let h: Harness;
  let admin: AuthContext;
  let other: AuthContext;
  let current: AuthContext;
  let app: ReturnType<Harness["appFor"]>;
  let checkingId: string;
  let cardId: string;
  let foreignAccountId: string;

  type LinkRes = {
    syncAccountLinkId: string;
    provider: string;
    externalAccountNumber: string;
    status: string;
    accountId: string | null;
  };
  type AccountResult = {
    accountNumber: string;
    linkId: string;
    status: string;
    accountId: string | null;
    importBatchId: string | null;
    received: number;
    created: number;
    duplicates: number;
    skippedPending: number;
    skippedInvalid: number;
    skippedForeign: number;
    error: string | null;
  };

  // Mocked scraper result in the upload contract shape.
  const discountUpload = () => ({
    provider: "discount",
    scrapedAt: "2024-05-03T10:00:00.000Z",
    startDate: "2024-02-01",
    agentVersion: "test",
    accounts: [
      {
        accountNumber: "0123-456789",
        txns: [
          {
            identifier: "a1",
            date: "2024-05-01T21:00:00.000Z",
            chargedAmount: "-45.90",
            description: "סופר",
            status: "completed",
          },
          {
            identifier: "a2",
            date: "2024-05-02T08:00:00.000Z",
            chargedAmount: "120.00",
            description: "החזר",
            status: "completed",
          },
          {
            date: "2024-05-02T09:00:00.000Z",
            chargedAmount: "-10.00",
            description: "קפה",
            status: "completed",
          },
          {
            identifier: "a4",
            date: "2024-05-03T09:00:00.000Z",
            chargedAmount: "-99.00",
            description: "ממתין",
            status: "pending",
          },
        ],
      },
    ],
  });
  const maxUpload = () => ({
    provider: "max",
    scrapedAt: "2024-05-03T10:00:00.000Z",
    startDate: "2024-02-01",
    accounts: [
      {
        accountNumber: "1111",
        txns: [
          {
            identifier: "m1",
            date: "2024-04-10T10:00:00.000Z",
            chargedAmount: "-30.00",
            description: "דלק",
            status: "completed",
            installments: { number: 1, total: 3 },
          },
        ],
      },
      { accountNumber: "2222", txns: [] },
    ],
  });

  const upload = async (body: object) => {
    const res = await app.request("/api/sync/uploads", h.json("POST", body));
    return { res, body: res.status === 200 ? ((await res.json()) as { accounts: AccountResult[] }) : null };
  };
  const listLinks = async () =>
    (await (await app.request("/api/sync/account-links")).json()) as LinkRes[];
  const patchLink = (id: string, body: object) =>
    app.request(`/api/sync/account-links/${id}`, h.json("PATCH", body));

  async function dbHelpers() {
    const { and, eq } = await import("drizzle-orm");
    return { and, eq };
  }
  async function txnsOf(accountId: string) {
    const { eq } = await dbHelpers();
    return h.db.select().from(h.schema.transactions).where(eq(h.schema.transactions.accountId, accountId));
  }
  async function balanceOf(accountId: string) {
    const { eq } = await dbHelpers();
    const [row] = await h.db
      .select({ currentBalance: h.schema.accounts.currentBalance })
      .from(h.schema.accounts)
      .where(eq(h.schema.accounts.accountId, accountId));
    return row!.currentBalance;
  }
  async function audit(entityId: string, actionType: string) {
    const { and, eq } = await dbHelpers();
    return h.db
      .select()
      .from(h.schema.auditEvents)
      .where(and(eq(h.schema.auditEvents.entityId, entityId), eq(h.schema.auditEvents.actionType, actionType)));
  }
  async function linkFor(number: string) {
    const link = (await listLinks()).find((l) => l.externalAccountNumber === number);
    expect(link).toBeDefined();
    return link!;
  }

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.createHousehold("admin");
    other = await h.createHousehold("owner");
    current = admin;
    app = h.appFor((await import("./sync.js")).syncRouter, () => current);
    const inserted = await h.db
      .insert(h.schema.accounts)
      .values([
        {
          householdId: admin.householdId,
          name: "עו״ש",
          type: "checking",
          openingBalance: "1000.00",
          currentBalance: "1000.00",
        },
        { householdId: admin.householdId, name: "מקס", type: "credit" },
        { householdId: other.householdId, name: "זר", type: "checking" },
      ])
      .returning();
    checkingId = inserted[0]!.accountId;
    cardId = inserted[1]!.accountId;
    foreignAccountId = inserted[2]!.accountId;
  });

  afterAll(async () => {
    if (h) await h.cleanup();
  });

  it("first upload discovers accounts as unmapped and imports nothing", async () => {
    const d = await upload(discountUpload());
    expect(d.res.status).toBe(200);
    expect(d.body!.accounts).toHaveLength(1);
    expect(d.body!.accounts[0]).toMatchObject({
      accountNumber: "0123-456789",
      status: "unmapped",
      accountId: null,
      importBatchId: null,
      received: 4,
      created: 0,
    });
    const m = await upload(maxUpload());
    expect(m.body!.accounts.map((a) => a.status)).toEqual(["unmapped", "unmapped"]);

    const links = await listLinks();
    expect(links).toHaveLength(3);
    expect(new Set(links.map((l) => l.status))).toEqual(new Set(["unmapped"]));
    expect(await txnsOf(checkingId)).toHaveLength(0);
  });

  it("enforces roles and household scoping on link updates and uploads", async () => {
    const link = await linkFor("0123-456789");
    for (const role of ["viewer", "member"] as const) {
      current = { ...admin, role };
      expect((await patchLink(link.syncAccountLinkId, { status: "ignored" })).status).toBe(403);
      expect((await upload(discountUpload())).res.status).toBe(403);
      // Any member can read the links.
      expect((await app.request("/api/sync/account-links")).status).toBe(200);
    }
    current = admin;
    expect(
      (await patchLink(link.syncAccountLinkId, { status: "linked", accountId: foreignAccountId }))
        .status,
    ).toBe(404);
    current = other;
    expect((await patchLink(link.syncAccountLinkId, { status: "ignored" })).status).toBe(404);
    current = admin;
    expect((await patchLink(link.syncAccountLinkId, { status: "linked" })).status).toBe(400);

    const res = await patchLink(link.syncAccountLinkId, { status: "linked", accountId: checkingId });
    expect(res.status).toBe(200);
    expect((await res.json()) as LinkRes).toMatchObject({ status: "linked", accountId: checkingId });
    const events = await audit(link.syncAccountLinkId, "sync_account_link.updated");
    expect(events).toHaveLength(1);
    expect(events[0]!.afterSnapshot).toEqual({ status: "linked", accountId: checkingId, last4: "6789" });
  });

  it("imports a linked account through the pipeline", async () => {
    const { body } = await upload(discountUpload());
    const result = body!.accounts[0]!;
    expect(result).toMatchObject({
      status: "linked",
      accountId: checkingId,
      received: 4,
      created: 3,
      duplicates: 0,
      skippedPending: 1,
      error: null,
    });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe("pending");
    expect(result.importBatchId).toBeTruthy();

    const { eq } = await dbHelpers();
    const [batch] = await h.db
      .select()
      .from(h.schema.importBatches)
      .where(eq(h.schema.importBatches.importBatchId, result.importBatchId!));
    expect(batch).toMatchObject({
      sourceType: "bank_sync",
      fileName: "דיסקונט • 6789",
      status: "completed",
      rowCount: 3,
      duplicateCount: 0,
    });

    const txns = await txnsOf(checkingId);
    expect(txns).toHaveLength(3);
    for (const t of txns) {
      expect(t.status).toBe("cleared");
      expect(t.categoryId).toBeNull();
      expect(t.externalRef).toMatch(/^bs1:/);
      expect(t.importBatchId).toBe(result.importBatchId);
    }
    const supermarket = txns.find((t) => t.description === "סופר")!;
    expect(supermarket).toMatchObject({ type: "expense", amount: "45.90", transactionDate: "2024-05-02" });
    expect(txns.find((t) => t.description === "החזר")).toMatchObject({ type: "income", amount: "120.00" });
    expect(txns.some((t) => t.description === "ממתין")).toBe(false);
    expect(await balanceOf(checkingId)).toBe("1064.10");

    const events = await audit(result.importBatchId!, "import_batch.applied");
    expect(events).toHaveLength(1);
    expect(events[0]!.afterSnapshot).toEqual({
      sourceType: "bank_sync",
      provider: "discount",
      created: 3,
      duplicates: 0,
    });
  });

  it("re-uploading the same scrape creates no duplicates and no batch", async () => {
    const { body } = await upload(discountUpload());
    expect(body!.accounts[0]).toMatchObject({ created: 0, duplicates: 3, importBatchId: null });
    expect(await txnsOf(checkingId)).toHaveLength(3);
    expect(await balanceOf(checkingId)).toBe("1064.10");
  });

  it("imports two identical same-day transactions as separate rows", async () => {
    const card = await linkFor("1111");
    expect((await patchLink(card.syncAccountLinkId, { status: "linked", accountId: cardId })).status).toBe(200);
    const twin = {
      date: "2024-04-11T10:00:00.000Z",
      chargedAmount: "-12.00",
      description: "חניה",
      status: "completed",
    };
    const body = maxUpload();
    body.accounts[0]!.txns.push(twin as never, twin as never);
    const first = await upload(body);
    expect(first.body!.accounts[0]).toMatchObject({ created: 3, duplicates: 0 });
    const parking = (await txnsOf(cardId)).filter((t) => t.description === "חניה");
    expect(parking).toHaveLength(2);
    expect(parking.some((t) => t.externalRef!.endsWith("#2"))).toBe(true);
    expect((await txnsOf(cardId)).find((t) => t.description === "דלק")!.notes).toBe("תשלום 1 מתוך 3");

    const again = await upload(body);
    expect(again.body!.accounts[0]).toMatchObject({ created: 0, duplicates: 3 });
    // The empty, still-unmapped card is reported but blocks nothing.
    expect(again.body!.accounts[1]).toMatchObject({ accountNumber: "2222", status: "unmapped", received: 0 });
  });

  it("does not import ignored accounts", async () => {
    const card = await linkFor("1111");
    const res = await patchLink(card.syncAccountLinkId, { status: "ignored" });
    expect(res.status).toBe(200);
    expect((await res.json()) as LinkRes).toMatchObject({ status: "ignored", accountId: null });
    const before = (await txnsOf(cardId)).length;
    const body = maxUpload();
    body.accounts[0]!.txns[0]!.identifier = "m-new";
    const { body: result } = await upload(body);
    expect(result!.accounts[0]).toMatchObject({ status: "ignored", created: 0, importBatchId: null });
    expect(await txnsOf(cardId)).toHaveLength(before);
  });

  it("reports an inactive linked account per account without failing the upload", async () => {
    const card = await linkFor("1111");
    expect((await patchLink(card.syncAccountLinkId, { status: "linked", accountId: cardId })).status).toBe(200);
    const { eq } = await dbHelpers();
    await h.db.update(h.schema.accounts).set({ isActive: false }).where(eq(h.schema.accounts.accountId, cardId));
    const { res, body } = await upload(maxUpload());
    expect(res.status).toBe(200);
    expect(body!.accounts[0]!.error).toBeTruthy();
    expect(body!.accounts[1]!.error).toBeNull();
    expect((await patchLink(card.syncAccountLinkId, { status: "linked", accountId: cardId })).status).toBe(400);
  });

  it("rejects float amounts and credential keys with validation_error", async () => {
    const float = discountUpload() as { accounts: { txns: Record<string, unknown>[] }[] };
    float.accounts[0]!.txns[0]!.chargedAmount = -45.9;
    const r1 = await upload(float);
    expect(r1.res.status).toBe(400);
    expect(((await r1.res.json()) as { error: string }).error).toBe("validation_error");

    const r2 = await upload({ ...discountUpload(), password: "secret" });
    expect(r2.res.status).toBe(400);
    expect(((await r2.res.json()) as { error: string }).error).toBe("validation_error");
  });
});
