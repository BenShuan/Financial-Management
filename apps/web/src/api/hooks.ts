import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  accountSchema,
  budgetActualsSchema,
  budgetPeriodSchema,
  bulkCategorizeSchema,
  categorySchema,
  createBudgetPeriodSchema,
  createImportBatchSchema,
  createReconciliationSessionSchema,
  createTransactionSchema,
  importBatchSchema,
  importMappingTemplateSchema,
  reconciliationSessionSchema,
  sessionContextSchema,
  tagSchema,
  transactionSchema,
  updateTransactionSchema,
  type BulkCategorizeInput,
  type CreateBudgetPeriodInput,
  type CreateImportBatchInput,
  type CreateReconciliationSessionInput,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from "@financial-management/shared";
import { apiFetch } from "./client";

export function useSession() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch("/api/me", sessionContextSchema),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch("/api/accounts", z.array(accountSchema)),
  });
}

export function useAccount(accountId: string | undefined) {
  return useQuery({
    queryKey: ["accounts", accountId],
    queryFn: () => apiFetch(`/api/accounts/${accountId}`, accountSchema),
    enabled: Boolean(accountId),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch("/api/categories", z.array(categorySchema)),
    staleTime: 60 * 1000,
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: () => apiFetch("/api/tags", z.array(tagSchema)),
    staleTime: 60 * 1000,
  });
}

export function useTransactions(params: {
  accountId?: string;
  categoryId?: string;
  uncategorized?: boolean;
  importBatchId?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== false) {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return useQuery({
    queryKey: ["transactions", params],
    queryFn: () =>
      apiFetch(`/api/transactions${qs ? `?${qs}` : ""}`, z.array(transactionSchema)),
  });
}

/** Invalidate everything money-touching after a ledger mutation. */
function useInvalidateLedger() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["budgets"] });
  };
}

export function useCreateTransaction() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      apiFetch("/api/transactions", transactionSchema, {
        method: "POST",
        body: createTransactionSchema.parse(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: ({
      transactionId,
      input,
    }: {
      transactionId: string;
      input: UpdateTransactionInput;
    }) =>
      apiFetch(`/api/transactions/${transactionId}`, transactionSchema, {
        method: "PATCH",
        body: updateTransactionSchema.parse(input),
      }),
    onSuccess: invalidate,
  });
}

export function useBulkCategorize() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (input: BulkCategorizeInput) =>
      apiFetch("/api/transactions/bulk-categorize", z.array(transactionSchema), {
        method: "POST",
        body: bulkCategorizeSchema.parse(input),
      }),
    onSuccess: invalidate,
  });
}

export function useBudgetPeriods() {
  return useQuery({
    queryKey: ["budgets"],
    queryFn: () => apiFetch("/api/budgets", z.array(budgetPeriodSchema)),
  });
}

export function useBudgetActuals(budgetPeriodId: string | undefined, month?: number) {
  return useQuery({
    queryKey: ["budgets", budgetPeriodId, "actuals", month],
    queryFn: () =>
      apiFetch(
        `/api/budgets/${budgetPeriodId}/actuals${month ? `?month=${month}` : ""}`,
        budgetActualsSchema,
      ),
    enabled: Boolean(budgetPeriodId),
  });
}

export function useCreateBudgetPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBudgetPeriodInput) =>
      apiFetch("/api/budgets", budgetPeriodSchema, {
        method: "POST",
        body: createBudgetPeriodSchema.parse(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["budgets"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useImportBatches() {
  return useQuery({
    queryKey: ["imports"],
    queryFn: () => apiFetch("/api/imports", z.array(importBatchSchema)),
  });
}

export function useImportMappings() {
  return useQuery({
    queryKey: ["import-mappings"],
    queryFn: () => apiFetch("/api/import-mappings", z.array(importMappingTemplateSchema)),
  });
}

export function useCreateImportBatch() {
  const invalidate = useInvalidateLedger();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateImportBatchInput) =>
      apiFetch("/api/imports", importBatchSchema, {
        method: "POST",
        body: createImportBatchSchema.parse(input),
      }),
    onSuccess: () => {
      // Import now creates transactions directly, so the ledger changes too
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["imports"] });
      void queryClient.invalidateQueries({ queryKey: ["import-mappings"] });
    },
  });
}

const reconciliationDetailSchema = z.object({
  session: reconciliationSessionSchema,
  cleared: z.array(
    z.object({
      transactionId: z.string().uuid(),
      description: z.string(),
      transactionDate: z.string(),
      amount: z.string(),
      type: z.enum(["income", "expense", "transfer"]),
    }),
  ),
});

export function useReconciliations() {
  return useQuery({
    queryKey: ["reconciliations"],
    queryFn: () => apiFetch("/api/reconciliations", z.array(reconciliationSessionSchema)),
  });
}

export function useReconciliation(reconciliationId: string | undefined) {
  return useQuery({
    queryKey: ["reconciliations", reconciliationId],
    queryFn: () =>
      apiFetch(`/api/reconciliations/${reconciliationId}`, reconciliationDetailSchema),
    enabled: Boolean(reconciliationId),
  });
}

export function useCreateReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReconciliationSessionInput) =>
      apiFetch("/api/reconciliations", reconciliationSessionSchema, {
        method: "POST",
        body: createReconciliationSessionSchema.parse(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
    },
  });
}

export function useReconciliationAction(reconciliationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: "recalculate" | "resolve" | "close") =>
      apiFetch(`/api/reconciliations/${reconciliationId}/${action}`, reconciliationSessionSchema, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
    },
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (transactionId: string) =>
      apiFetch(`/api/transactions/${transactionId}`, z.object({ deleted: z.boolean() }), {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
}
