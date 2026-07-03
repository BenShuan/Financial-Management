import { z } from "zod";
import { categoryKindSchema } from "./enums.js";

export const categorySchema = z.object({
  categoryId: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string(),
  kind: categoryKindSchema,
  parentCategoryId: z.string().uuid().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם קטגוריה"),
  kind: categoryKindSchema,
  parentCategoryId: z.string().uuid().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const tagSchema = z.object({
  tagId: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
  isActive: z.boolean(),
});
export type Tag = z.infer<typeof tagSchema>;

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "יש להזין שם תגית").max(40),
  color: z.string().optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;
