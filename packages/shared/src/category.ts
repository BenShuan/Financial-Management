import { z } from "zod";
import { categoryKindSchema } from "./enums.js";

/** Colors are design-token names (the web app maps them to classes), shared by categories and tags. */
export const CATEGORY_COLORS = ["primary", "info", "warning", "violet", "positive", "negative"] as const;
export const categoryColorSchema = z.enum(CATEGORY_COLORS);
export type CategoryColor = z.infer<typeof categoryColorSchema>;

export const categorySchema = z.object({
  categoryId: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string(),
  kind: categoryKindSchema,
  parentCategoryId: z.string().uuid().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  code: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type Category = z.infer<typeof categorySchema>;

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "יש להזין שם קטגוריה")
  .max(60, "שם הקטגוריה ארוך מדי");

/** Shortcut code typed in the transactions table (unique per kind among active categories). */
const categoryCodeSchema = z
  .string()
  .trim()
  .min(1, "יש להזין קוד")
  .max(3, "קוד יכול לכלול עד 3 תווים");

/**
 * POST /api/categories. Hierarchy is two levels: a parent must be a top-level category of the
 * same kind. `kind` is fixed at creation (budgets and transactions depend on it).
 */
export const createCategorySchema = z.object({
  name: categoryNameSchema,
  kind: categoryKindSchema,
  parentCategoryId: z.string().uuid().optional(),
  color: categoryColorSchema.optional(),
  icon: z.string().trim().max(40).optional(),
  code: categoryCodeSchema.optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * PATCH /api/categories/{id}: rename, re-parent (null = top level), recolor, reorder, archive
 * (`isActive: false`, cascades to children) or restore. Omitted fields are left unchanged.
 */
export const updateCategorySchema = z.object({
  name: categoryNameSchema.optional(),
  parentCategoryId: z.string().uuid().nullable().optional(),
  color: categoryColorSchema.nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  code: categoryCodeSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const tagSchema = z.object({
  tagId: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
  isActive: z.boolean(),
});
export type Tag = z.infer<typeof tagSchema>;

const tagNameSchema = z.string().trim().min(1, "יש להזין שם תגית").max(40, "שם התגית ארוך מדי");

export const createTagSchema = z.object({
  name: tagNameSchema,
  color: categoryColorSchema.optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

/** PATCH /api/tags/{id}: rename, recolor, archive (`isActive: false`) or restore. */
export const updateTagSchema = z.object({
  name: tagNameSchema.optional(),
  color: categoryColorSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const deletedResultSchema = z.object({ deleted: z.literal(true) });
