import { z } from "zod";

/** Example shared schema — extend with domain entities from docs/agent. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Example form schema for client validation (react-hook-form + Zod resolver). */
export const noteFormSchema = z.object({
  note: z.string().trim().min(1, "יש להזין הערה"),
});

export type NoteFormValues = z.infer<typeof noteFormSchema>;
