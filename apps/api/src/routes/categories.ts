import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  categorySchema,
  createTagSchema,
  tagSchema,
  updateCategorySchema,
} from "@financial-management/shared";
import { createRouter } from "../lib/router.js";
import { db } from "../db/index.js";
import { categories, tags } from "../db/schema.js";
import { requireRole } from "../middleware/auth.js";

const categoryIdParam = z.object({ categoryId: z.string().uuid() });

export const categoriesRouter = createRouter();

categoriesRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/categories",
    tags: ["Categories"],
    summary: "List household categories",
    responses: {
      200: {
        description: "Categories",
        content: { "application/json": { schema: z.array(categorySchema) } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.householdId, auth.householdId))
      .orderBy(asc(categories.sortOrder));
    return c.json(
      rows.map((row) => ({
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
      })),
    );
  },
);

categoriesRouter.openapi(
  createRoute({
    method: "patch",
    path: "/api/categories/{categoryId}",
    tags: ["Categories"],
    summary: "Update category shortcut code (member+)",
    request: {
      params: categoryIdParam,
      body: { content: { "application/json": { schema: updateCategorySchema } } },
    },
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: categorySchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const { categoryId } = c.req.valid("param");
    const input = c.req.valid("json");

    const [before] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.householdId, auth.householdId), eq(categories.categoryId, categoryId)));
    if (!before) throw new HTTPException(404, { message: "הקטגוריה לא נמצאה" });

    if (input.code) {
      const [conflict] = await db
        .select({ categoryId: categories.categoryId })
        .from(categories)
        .where(
          and(
            eq(categories.householdId, auth.householdId),
            eq(categories.kind, before.kind),
            eq(categories.isActive, true),
            eq(categories.code, input.code),
            ne(categories.categoryId, categoryId),
          ),
        );
      if (conflict) throw new HTTPException(409, { message: "הקוד הזה כבר בשימוש בקטגוריה אחרת" });
    }

    const [row] = await db
      .update(categories)
      .set({ code: input.code })
      .where(eq(categories.categoryId, categoryId))
      .returning();
    if (!row) throw new HTTPException(500, { message: "עדכון הקטגוריה נכשל" });

    return c.json({
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
    });
  },
);

categoriesRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/tags",
    tags: ["Categories"],
    summary: "List household tags",
    responses: {
      200: {
        description: "Tags",
        content: { "application/json": { schema: z.array(tagSchema) } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await db
      .select()
      .from(tags)
      .where(eq(tags.householdId, auth.householdId))
      .orderBy(asc(tags.name));
    return c.json(
      rows.map((row) => ({
        tagId: row.tagId,
        householdId: row.householdId,
        name: row.name,
        color: row.color,
        isActive: row.isActive,
      })),
    );
  },
);

categoriesRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/tags",
    tags: ["Categories"],
    summary: "Create tag (member+)",
    request: { body: { content: { "application/json": { schema: createTagSchema } } } },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: tagSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "member");
    const input = c.req.valid("json");
    const [row] = await db
      .insert(tags)
      .values({ householdId: auth.householdId, name: input.name, color: input.color })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new HTTPException(409, { message: "תגית בשם זה כבר קיימת" });
    return c.json(
      {
        tagId: row.tagId,
        householdId: row.householdId,
        name: row.name,
        color: row.color,
        isActive: row.isActive,
      },
      201,
    );
  },
);
