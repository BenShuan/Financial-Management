import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, TEST_DATABASE_URL, type Harness } from "../test/harness.js";
import type { AuthContext } from "../types.js";

/** Category hierarchy, archive-vs-delete and tag management (FM-9). */
describe.skipIf(!TEST_DATABASE_URL)("categories and tags API (Postgres)", () => {
  let h: Harness;
  let auth: AuthContext;
  let other: AuthContext;
  let current: AuthContext;
  let app: ReturnType<Harness["appFor"]>;
  let txApp: ReturnType<Harness["appFor"]>;
  let accountId: string;

  type Cat = { categoryId: string; parentCategoryId: string | null; isActive: boolean; name: string; code: string | null };
  type TagRes = { tagId: string; name: string; isActive: boolean; color: string | null };

  const createCat = async (body: object) => app.request("/api/categories", h.json("POST", body));
  const cat = async (body: object): Promise<Cat> => {
    const res = await createCat({ kind: "expense", ...body });
    expect(res.status).toBe(201);
    return (await res.json()) as Cat;
  };
  const patchCat = (id: string, body: object) =>
    app.request(`/api/categories/${id}`, h.json("PATCH", body));
  const deleteCat = (id: string) => app.request(`/api/categories/${id}`, { method: "DELETE" });
  const listCats = async () => (await (await app.request("/api/categories")).json()) as Cat[];
  const createTag = (body: object) => app.request("/api/tags", h.json("POST", body));
  const patchTag = (id: string, body: object) => app.request(`/api/tags/${id}`, h.json("PATCH", body));

  async function audit(entityId: string, actionType: string) {
    const { and, eq } = await import("drizzle-orm");
    return h.db
      .select()
      .from(h.schema.auditEvents)
      .where(and(eq(h.schema.auditEvents.entityId, entityId), eq(h.schema.auditEvents.actionType, actionType)));
  }

  beforeAll(async () => {
    h = await createHarness();
    auth = await h.createHousehold("member");
    other = await h.createHousehold("owner");
    current = auth;
    app = h.appFor((await import("./categories.js")).categoriesRouter, () => current);
    txApp = h.appFor((await import("./transactions.js")).transactionsRouter, () => current);
    const [acc] = await h.db
      .insert(h.schema.accounts)
      .values({ householdId: auth.householdId, name: "test", type: "checking" })
      .returning();
    accountId = acc!.accountId;
  });

  afterAll(async () => {
    if (h) await h.cleanup();
  });

  describe("hierarchy", () => {
    it("creates top-level and child categories", async () => {
      const parent = await cat({ name: "בית", color: "primary" });
      const child = await cat({ name: "שכירות", parentCategoryId: parent.categoryId });
      expect(child.parentCategoryId).toBe(parent.categoryId);
    });

    it("rejects a parent of another kind, a grandchild level, and a foreign parent", async () => {
      const income = await cat({ name: "משכורת", kind: "income" });
      expect((await createCat({ name: "x", kind: "expense", parentCategoryId: income.categoryId })).status).toBe(400);
      const parent = await cat({ name: "רכב" });
      const child = await cat({ name: "דלק", parentCategoryId: parent.categoryId });
      expect((await createCat({ name: "x", kind: "expense", parentCategoryId: child.categoryId })).status).toBe(400);
      current = other;
      const foreign = (await (await createCat({ name: "זר", kind: "expense" })).json()) as Cat;
      current = auth;
      expect((await createCat({ name: "x", kind: "expense", parentCategoryId: foreign.categoryId })).status).toBe(404);
    });

    it("re-parents and promotes, but never makes a parent with children into a child", async () => {
      const a = await cat({ name: "א" });
      const b = await cat({ name: "ב" });
      const aChild = await cat({ name: "א1", parentCategoryId: a.categoryId });
      expect((await patchCat(a.categoryId, { parentCategoryId: b.categoryId })).status).toBe(400);
      expect((await patchCat(a.categoryId, { parentCategoryId: a.categoryId })).status).toBe(400);
      const moved = await patchCat(aChild.categoryId, { parentCategoryId: b.categoryId });
      expect(moved.status).toBe(200);
      expect(((await moved.json()) as Cat).parentCategoryId).toBe(b.categoryId);
      const promoted = await patchCat(aChild.categoryId, { parentCategoryId: null });
      expect(((await promoted.json()) as Cat).parentCategoryId).toBeNull();
    });

    it("renames, recolors and validates input", async () => {
      const c = await cat({ name: "ישן" });
      const res = await patchCat(c.categoryId, { name: "חדש", color: "warning" });
      expect(await res.json()).toMatchObject({ name: "חדש", color: "warning" });
      expect((await patchCat(c.categoryId, { color: "#ff0000" })).status).toBe(400);
      expect((await patchCat(c.categoryId, { name: "" })).status).toBe(400);
    });

    it("keeps shortcut codes unique per kind among active categories", async () => {
      const first = await cat({ name: "קוד1", code: "Q" });
      expect((await createCat({ name: "קוד2", kind: "expense", code: "Q" })).status).toBe(409);
      expect((await createCat({ name: "קוד3", kind: "income", code: "Q" })).status).toBe(201);
      expect((await patchCat(first.categoryId, { isActive: false })).status).toBe(200);
      const second = await cat({ name: "קוד4", code: "Q" });
      // Restoring the first would now collide with the active second
      expect((await patchCat(first.categoryId, { isActive: true })).status).toBe(409);
      expect(second.code).toBe("Q");
    });
  });

  describe("archive and delete", () => {
    it("archiving a parent archives its children and is audited; children cannot be restored alone", async () => {
      const parent = await cat({ name: "פנאי" });
      const child = await cat({ name: "סרטים", parentCategoryId: parent.categoryId });
      expect((await patchCat(parent.categoryId, { isActive: false })).status).toBe(200);
      const all = await listCats();
      expect(all.find((x) => x.categoryId === child.categoryId)?.isActive).toBe(false);
      const [event] = await audit(parent.categoryId, "category.archived");
      expect(event?.afterSnapshot).toMatchObject({ archivedChildren: 1 });
      expect((await patchCat(child.categoryId, { isActive: true })).status).toBe(400);
      expect((await createCat({ name: "x", kind: "expense", parentCategoryId: parent.categoryId })).status).toBe(400);
      expect((await patchCat(parent.categoryId, { isActive: true })).status).toBe(200);
      expect((await patchCat(child.categoryId, { isActive: true })).status).toBe(200);
      expect(await audit(parent.categoryId, "category.restored")).toHaveLength(1);
    });

    it("deletes an unused category and audits it", async () => {
      const c = await cat({ name: "זמני" });
      expect((await deleteCat(c.categoryId)).status).toBe(200);
      expect((await listCats()).some((x) => x.categoryId === c.categoryId)).toBe(false);
      expect(await audit(c.categoryId, "category.deleted")).toHaveLength(1);
    });

    it("refuses to delete a category used by a transaction or a split, or one with children", async () => {
      const used = await cat({ name: "בשימוש" });
      const viaSplit = await cat({ name: "בפיצול" });
      const res = await txApp.request(
        "/api/transactions",
        h.json("POST", {
          accountId,
          type: "expense",
          amount: "10.00",
          transactionDate: "2026-03-01",
          description: "x",
          categoryId: used.categoryId,
        }),
      );
      expect(res.status).toBe(201);
      const split = await txApp.request(
        "/api/transactions",
        h.json("POST", {
          accountId,
          type: "expense",
          amount: "10.00",
          transactionDate: "2026-03-01",
          description: "y",
          splits: [
            { categoryId: viaSplit.categoryId, amount: "4.00" },
            { categoryId: used.categoryId, amount: "6.00" },
          ],
        }),
      );
      expect(split.status).toBe(201);
      const refused = await deleteCat(used.categoryId);
      expect(refused.status).toBe(409);
      expect(((await refused.json()) as { message: string }).message).toContain("(2)");
      expect((await deleteCat(viaSplit.categoryId)).status).toBe(409);

      const parent = await cat({ name: "אב" });
      await cat({ name: "ילד", parentCategoryId: parent.categoryId });
      expect((await deleteCat(parent.categoryId)).status).toBe(409);
    });

    it("404s for another household's category", async () => {
      current = other;
      const foreign = (await (await createCat({ name: "של אחרים", kind: "expense" })).json()) as Cat;
      current = auth;
      expect((await patchCat(foreign.categoryId, { name: "x" })).status).toBe(404);
      expect((await deleteCat(foreign.categoryId)).status).toBe(404);
    });

    it("viewers cannot change categories", async () => {
      const viewer = { ...auth, role: "viewer" as const };
      current = viewer;
      expect((await createCat({ name: "x", kind: "expense" })).status).toBe(403);
      current = auth;
    });
  });

  describe("tags", () => {
    it("creates, renames, recolors and archives tags; names stay unique per household", async () => {
      const created = await createTag({ name: "חופשה", color: "info" });
      expect(created.status).toBe(201);
      const tag = (await created.json()) as TagRes;
      expect((await createTag({ name: "חופשה" })).status).toBe(409);
      current = other;
      expect((await createTag({ name: "חופשה" })).status).toBe(201); // other household is separate
      current = auth;
      await createTag({ name: "עבודה" });
      expect((await patchTag(tag.tagId, { name: "עבודה" })).status).toBe(409);
      const renamed = await patchTag(tag.tagId, { name: "טיול", color: "violet" });
      expect(await renamed.json()).toMatchObject({ name: "טיול", color: "violet" });
      expect((await patchTag(tag.tagId, { isActive: false })).status).toBe(200);
      expect(await audit(tag.tagId, "tag.archived")).toHaveLength(1);
    });

    it("deleting a tag detaches it from transactions and audits the count", async () => {
      const tag = (await (await createTag({ name: "למחיקה" })).json()) as TagRes;
      const food = await cat({ name: "אוכל" });
      const created = await txApp.request(
        "/api/transactions",
        h.json("POST", {
          accountId,
          type: "expense",
          amount: "5.00",
          transactionDate: "2026-03-02",
          description: "z",
          categoryId: food.categoryId,
          tagIds: [tag.tagId],
        }),
      );
      const txn = (await created.json()) as { transactionId: string };
      expect((await app.request(`/api/tags/${tag.tagId}`, { method: "DELETE" })).status).toBe(200);
      const { eq } = await import("drizzle-orm");
      expect(
        await h.db
          .select()
          .from(h.schema.transactionTags)
          .where(eq(h.schema.transactionTags.transactionId, txn.transactionId)),
      ).toHaveLength(0);
      const [event] = await audit(tag.tagId, "tag.deleted");
      expect(event?.beforeSnapshot).toMatchObject({ transactionCount: 1 });
    });
  });
});
