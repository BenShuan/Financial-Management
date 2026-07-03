import { z } from "zod";
import { importBatchStatusSchema, importSourceTypeSchema } from "./enums.js";
import { positiveMoneySchema } from "./money.js";

export const importColumnMapSchema = z.object({
  /** CSV header names mapped to normalized fields. */
  date: z.string().min(1, "יש לבחור עמודת תאריך"),
  description: z.string().min(1, "יש לבחור עמודת תיאור"),
  amount: z.string().min(1, "יש לבחור עמודת סכום"),
  merchant: z.string().optional(),
  /** Date format hint. */
  dateFormat: z.enum(["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"]).default("dd/MM/yyyy"),
  /** When true, negative amounts are expenses and positive income (bank convention). */
  negativeIsExpense: z.boolean().default(true),
});
export type ImportColumnMap = z.infer<typeof importColumnMapSchema>;

export const importMappingTemplateSchema = z.object({
  mappingTemplateId: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string(),
  columnMap: importColumnMapSchema,
  isDefault: z.boolean(),
});
export type ImportMappingTemplate = z.infer<typeof importMappingTemplateSchema>;

export const importBatchSchema = z.object({
  importBatchId: z.string().uuid(),
  householdId: z.string().uuid(),
  accountId: z.string().uuid(),
  sourceType: importSourceTypeSchema,
  fileName: z.string().nullable(),
  status: importBatchStatusSchema,
  rowCount: z.number().int(),
  duplicateCount: z.number().int(),
  errorCount: z.number().int(),
  importedAt: z.string(),
});
export type ImportBatch = z.infer<typeof importBatchSchema>;

export const importRowSchema = z.object({
  normalizedRowId: z.string().uuid(),
  importBatchId: z.string().uuid(),
  transactionDate: z.string(),
  description: z.string(),
  merchantName: z.string().nullable(),
  /** Positive scalar; flow derived from the mapping sign convention. */
  amount: positiveMoneySchema,
  flow: z.enum(["income", "expense"]),
  categoryId: z.string().uuid().nullable(),
  isDuplicate: z.boolean(),
  promotedTransactionId: z.string().uuid().nullable(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const createImportBatchSchema = z.object({
  accountId: z.string().uuid({ message: "יש לבחור חשבון" }),
  fileName: z.string().max(200).optional(),
  columnMap: importColumnMapSchema,
  saveMappingAs: z.string().trim().max(80).optional(),
  /** Raw CSV text; parsed server-side. */
  csvText: z.string().min(1, "יש להעלות קובץ CSV"),
});
export type CreateImportBatchInput = z.infer<typeof createImportBatchSchema>;

export const categorizeImportRowsSchema = z.object({
  rowIds: z.array(z.string().uuid()).min(1),
  categoryId: z.string().uuid({ message: "יש לבחור קטגוריה" }),
});
export type CategorizeImportRowsInput = z.infer<typeof categorizeImportRowsSchema>;
