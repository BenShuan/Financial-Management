import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, count, eq, max, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  categorySchema,
  createCategorySchema,
  createTagSchema,
  deletedResultSchema,
  tagSchema,
  updateCategorySchema,
  updateTagSchema,
  type Category,
  type Tag,
} from "@financial-management/shared";
import { createRouter } from "../lib/router.js";
import { db } from "../db/index.js";
import {
  budgetLines,
  categories,
  goals,
  importRowsNormalized,
  recurringTemplates,
  tags,
  transactionSplits,
  transactionTags,
  transactions,
} from "../db/schema.js";
import { emitAuditEvent } from "../lib/audit.js";
import { requireRole } from "../middleware/auth.js";

const categoryIdParam = z.object({ categoryId: z.string().uuid() });
const tagIdParam = z.object({ tagId: z.string().uuid() });
const json = <T extends z.ZodTypeAny>(schema: T) => ({ "application/json": { schema } });

type CategoryRow = typeof categories.$inferSelect;
type TagRow = typeof tags.$inferSelect;

const isFkViolation = (err: unknown) => (err as { code?: string }).code === "23503";
const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === "23505";

function serializeCategory(row: CategoryRow): Category {
  return {
    categoryId: row.categoryId,
    householdId: row.householdId,
    name: row.name,
    kind: row.kind,
    parentCategoryId: row.parentCategoryId,
    color: row.color,
    icon: row.icon,
    code: row.code,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function serializeTag(row: TagRow): Tag {
  return {
    tagId: row.tagId,
    householdId: row.householdId,
    name: row.name,
    color: row.color,
    isActive: row.isActive,
  };
}

async function getCategory(householdId: string, categoryId: string): Promise<CategoryRow> {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.householdId, householdId), eq(categories.categoryId, categoryId)));
  if (!row) throw new HTTPException(404, { message: "הקטגוריה לא נמצאה" });
  return row;
}

async function getTag(householdId: string, tagId: string): Promise<TagRow> {
  const [row] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.householdId, householdId), eq(tags.tagId, tagId)));
  if (!row) throw new HTTPException(404, { message: "התגית לא נמצאה" });
  return row;
}

async function childCount(categoryId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(categories)
    .where(eq(categories.parentCategoryId, categoryId));
  return row?.n ?? 0;
}

/** Every row that references the category; a category with any of these is archived, not deleted. */
async function categoryUsage(categoryId: string): Promise<number> {
  const counts = await Promise.all([
    db.select({ n: count() }).from(transactions).where(eq(transactions.categoryId, categoryId)),
    db.select({ n: count() }).from(transactionSplits).where(eq(transactionSplits.categoryId, categoryId)),
    db.select({ n: count() }).from(budgetLines).where(eq(budgetLines.categoryId, categoryId)),
    db.select({ n: count() }).from(goals).where(eq(goals.linkedCategoryId, categoryId)),
    db.select({ n: count() }).from(recurringTemplates).where(eq(recurringTemplates.categoryId, categoryId)),
    db.select({ n: count() }).from(importRowsNormalized).where(eq(importRowsNormalized.categoryId, categoryId)),
  ]);
  return counts.reduce((sum, [row]) => sum + (row?.n ?? 0), 0);
}

/** Two-level hierarchy: the parent is a top-level category of the same kind in this household. */
async function assertValidParent(
  householdId: string,
  parentId: string,
  kind: CategoryRow["kind"],
  selfId?: string,
): Promise<CategoryRow> {
  if (parentId === selfId) {
    throw new HTTPException(400, { message: "קטגוריה אינה יכולה להיות אב של עצמה" });
  }
  const parent = await getCategory(householdId, parentId);
  if (parent.parentCategoryId) {
    throw new HTTPException(400, { message: "ניתן לשייך רק לקטגוריה ראשית (שתי רמות בלבד)" });
  }
  if (parent.kind !== kind) {
    throw new HTTPException(400, { message: "קטגוריית האב חייבת להיות מאותו סוג" });
  }
  return parent;
}

/** Shortcut codes are unique per kind among active categories. */
async function assertCodeFree(
  householdId: string,
  kind: CategoryRow["kind"],
  code: string,
  selfId?: string,
) {
  const [conflict] = await db
    .select({ categoryId: categories.categoryId })
    .from(categories)
    .where(
      and(
        eq(categories.householdId, householdId),
        eq(categories.kind, kind),
        eq(categories.isActive, true),
        eq(categories.code, code),
        ...(selfId ? [ne(categories.categoryId, selfId)] : []),
      ),
    );
  if (conflict) throw new HTTPException(409, { message: "הקוד הזה כבר בשימוש בקטגוריה אחרת" });
}

export const categoriesRouter = createRouter();

categoriesRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/categories",
    tags: ["Categories"],
    summary: "List household categories (active and archived)",
    responses: { 200: { description: "Categories", content: json(z.array(categorySchema)) } },
  }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.householdId, auth.householdId))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    return c.json(rows.map(serializeCategory));
  },
);

categoriesRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/categories",
    tags: ["Categories"],
    summary: "Create category (member+)",
    request: { body: { content: json(createCategorySchema), required: true } },
    responses: { 201: { description: "Created", content: json(categorySchema) } },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const input = c.req.valid("json");

    if (input.parentCategoryId) {
      const parent = await assertValidParent(auth.householdId, input.parentCategoryId, input.kind);
      if (!parent.isActive) {
        throw new HTTPException(400, { message: "לא ניתן להוסיף תת-קטגוריה לקטגוריה בארכיון" });
      }
    }
    if (input.code) await assertCodeFree(auth.householdId, input.kind, input.code);

    const [last] = await db
      .select({ sortOrder: max(categories.sortOrder) })
      .from(categories)
      .where(eq(categories.householdId, auth.householdId));
    const [row] = await db
      .insert(categories)
      .values({
        householdId: auth.householdId,
        name: input.name,
        kind: input.kind,
        parentCategoryId: input.parentCategoryId ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        code: input.code ?? null,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      })
      .returning();
    if (!row) throw new HTTPException(500, { message: "יצירת הקטגוריה נכשלה" });
    return c.json(serializeCategory(row), 201);
  },
);

categoriesRouter.openapi(
  createRoute({
    method: "patch",
    path: "/api/categories/{categoryId}",
    tags: ["Categories"],
    summary: "Rename, re-parent, recolor, reorder, archive or restore a category (member+)",
    request: {
      params: categoryIdParam,
      body: { content: json(updateCategorySchema), required: true },
    },
    responses: { 200: { description: "Updated", content: json(categorySchema) } },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const { categoryId } = c.req.valid("param");
    const input = c.req.valid("json");
    const before = await getCategory(auth.householdId, categoryId);

    const nextParentId =
      input.parentCategoryId !== undefined ? input.parentCategoryId : before.parentCategoryId;
    const nextActive = input.isActive ?? before.isActive;
    const nextCode = input.code !== undefined ? input.code : before.code;

    let parent: CategoryRow | null = null;
    if (input.parentCategoryId) {
      parent = await assertValidParent(auth.householdId, input.parentCategoryId, before.kind, categoryId);
      if (input.parentCategoryId !== before.parentCategoryId && (await childCount(categoryId)) > 0) {
        throw new HTTPException(400, {
          message: "לקטגוריה יש תתי-קטגוריות, ולכן היא לא יכולה להפוך לתת-קטגוריה",
        });
      }
    } else if (nextParentId) {
      parent = await getCategory(auth.householdId, nextParentId);
    }
    if (nextActive && parent && !parent.isActive) {
      throw new HTTPException(400, { message: "יש לשחזר קודם את קטגוריית האב מהארכיון" });
    }
    if (nextActive && nextCode && (nextCode !== before.code || !before.isActive)) {
      await assertCodeFree(auth.householdId, before.kind, nextCode, categoryId);
    }

    const changes = Object.fromEntries(
      Object.entries({
        name: input.name,
        parentCategoryId: input.parentCategoryId,
        color: input.color,
        icon: input.icon,
        code: input.code,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      }).filter(([, value]) => value !== undefined),
    );

    const { row, archivedChildren } = await db.transaction(async (tx) => {
      const [updated] =
        Object.keys(changes).length > 0
          ? await tx
              .update(categories)
              .set(changes)
              .where(eq(categories.categoryId, categoryId))
              .returning()
          : [before];
      if (!updated) throw new HTTPException(500, { message: "עדכון הקטגוריה נכשל" });
      // Archiving a parent archives its children too, so nothing active hangs off an archived parent.
      let archivedChildren = 0;
      if (before.isActive && input.isActive === false) {
        const children = await tx
          .update(categories)
          .set({ isActive: false })
          .where(and(eq(categories.parentCategoryId, categoryId), eq(categories.isActive, true)))
          .returning({ id: categories.categoryId });
        archivedChildren = children.length;
      }
      return { row: updated, archivedChildren };
    });

    if (before.isActive !== row.isActive) {
      await emitAuditEvent(auth, {
        actionType: row.isActive ? "category.restored" : "category.archived",
        entityType: "category",
        entityId: categoryId,
        after: { name: row.name, ...(archivedChildren > 0 ? { archivedChildren } : {}) },
      });
    }
    return c.json(serializeCategory(row));
  },
);

categoriesRouter.openapi(
  createRoute({
    method: "delete",
    path: "/api/categories/{categoryId}",
    tags: ["Categories"],
    summary: "Delete an unused category without children (member+); in-use categories are archived instead",
    request: { params: categoryIdParam },
    responses: { 200: { description: "Deleted", content: json(deletedResultSchema) } },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const { categoryId } = c.req.valid("param");
    const row = await getCategory(auth.householdId, categoryId);

    if ((await childCount(categoryId)) > 0) {
      throw new HTTPException(409, { message: "יש למחוק או להעביר קודם את תתי-הקטגוריות" });
    }
    const usage = await categoryUsage(categoryId);
    if (usage > 0) {
      throw new HTTPException(409, {
        message: `הקטגוריה בשימוש (${usage}) ולכן לא ניתן למחוק אותה — אפשר להעביר אותה לארכיון`,
      });
    }
    try {
      await db.delete(categories).where(eq(categories.categoryId, categoryId));
    } catch (err) {
      // A row started referencing it between the check and the delete.
      if (isFkViolation(err)) {
        throw new HTTPException(409, { message: "הקטגוריה בשימוש — אפשר להעביר אותה לארכיון" });
      }
      throw err;
    }
    await emitAuditEvent(auth, {
      actionType: "category.deleted",
      entityType: "category",
      entityId: categoryId,
      before: { name: row.name, kind: row.kind },
    });
    return c.json({ deleted: true as const });
  },
);

categoriesRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/tags",
    tags: ["Categories"],
    summary: "List household tags (active and archived)",
    responses: { 200: { description: "Tags", content: json(z.array(tagSchema)) } },
  }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await db
      .select()
      .from(tags)
      .where(eq(tags.householdId, auth.householdId))
      .orderBy(asc(tags.name));
    return c.json(rows.map(serializeTag));
  },
);

categoriesRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/tags",
    tags: ["Categories"],
    summary: "Create tag (member+)",
    request: { body: { content: json(createTagSchema), required: true } },
    responses: { 201: { description: "Created", content: json(tagSchema) } },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const input = c.req.valid("json");
    const [row] = await db
      .insert(tags)
      .values({ householdId: auth.householdId, name: input.name, color: input.color ?? null })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new HTTPException(409, { message: "תגית בשם זה כבר קיימת" });
    return c.json(serializeTag(row), 201);
  },
);

categoriesRouter.openapi(
  createRoute({
    method: "patch",
    path: "/api/tags/{tagId}",
    tags: ["Categories"],
    summary: "Rename, recolor, archive or restore a tag (member+)",
    request: { params: tagIdParam, body: { content: json(updateTagSchema), required: true } },
    responses: { 200: { description: "Updated", content: json(tagSchema) } },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const { tagId } = c.req.valid("param");
    const input = c.req.valid("json");
    const before = await getTag(auth.householdId, tagId);

    const changes = Object.fromEntries(
      Object.entries({ name: input.name, color: input.color, isActive: input.isActive }).filter(
        ([, value]) => value !== undefined,
      ),
    );
    let row = before;
    if (Object.keys(changes).length > 0) {
      try {
        [row] = (await db.update(tags).set(changes).where(eq(tags.tagId, tagId)).returning()) as [TagRow];
      } catch (err) {
        if (isUniqueViolation(err)) throw new HTTPException(409, { message: "תגית בשם זה כבר קיימת" });
        throw err;
      }
    }
    if (before.isActive !== row.isActive) {
      await emitAuditEvent(auth, {
        actionType: row.isActive ? "tag.restored" : "tag.archived",
        entityType: "tag",
        entityId: tagId,
        after: { name: row.name },
      });
    }
    return c.json(serializeTag(row));
  },
);

categoriesRouter.openapi(
  createRoute({
    method: "delete",
    path: "/api/tags/{tagId}",
    tags: ["Categories"],
    summary: "Delete a tag and detach it from its transactions (member+)",
    request: { params: tagIdParam },
    responses: { 200: { description: "Deleted", content: json(deletedResultSchema) } },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const { tagId } = c.req.valid("param");
    const row = await getTag(auth.householdId, tagId);
    const [usage] = await db
      .select({ n: count() })
      .from(transactionTags)
      .where(eq(transactionTags.tagId, tagId));
    // transaction_tags rows cascade with the tag
    await db.delete(tags).where(eq(tags.tagId, tagId));
    await emitAuditEvent(auth, {
      actionType: "tag.deleted",
      entityType: "tag",
      entityId: tagId,
      before: { name: row.name, transactionCount: usage?.n ?? 0 },
    });
    return c.json({ deleted: true as const });
  },
);
