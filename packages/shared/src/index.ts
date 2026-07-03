import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from "./enums.js";
export * from "./money.js";
export * from "./household.js";
export * from "./account.js";
export * from "./category.js";
export * from "./transaction.js";
export * from "./budget.js";
export * from "./recurring.js";
export * from "./import.js";
export * from "./reconciliation.js";
export * from "./dashboard.js";
