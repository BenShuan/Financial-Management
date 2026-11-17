import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  accountSchema,
  budgetActualsSchema,
  budgetCategoryHistorySchema,
  budgetPeriodSchema,
  bulkCategorizeSchema,
  categorySchema,
  createBudgetPeriodSchema,
  createImportBatchSchema,
  createReconciliationSessionSchema,
  createCategorySchema,
  createTagSchema,
  createTransactionSchema,
  deletedResultSchema,
  householdMemberSchema,
  inviteMemberInputSchema,
  inviteMemberResultSchema,
  removeMemberResultSchema,
  updateMemberRoleInputSchema,
  importBatchSchema,
  importMappingTemplateSchema,
  reconciliationSessionSchema,
  sessionContextSchema,
  tagSchema,
  transactionSchema,
  updateBudgetPeriodSchema,
  updateCategorySchema,
  updateTagSchema,
  updateTransactionSchema,
  type BulkCategorizeInput,
  type CreateBudgetPeriodInput,
  type CreateImportBatchInput,
  type CreateReconciliationSessionInput,
  type CreateCategoryInput,
  type CreateTagInput,
  type CreateTransactionInput,
  type HouseholdRole,
  type InviteMemberInput,
  type UpdateBudgetPeriodInput,
  type UpdateCategoryInput,
  type UpdateTagInput,
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

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, input }: { categoryId: string; input: UpdateCategoryInput }) =>
      apiFetch(`/api/categories/${categoryId}`, categorySchema, {
        method: "PATCH",
        body: updateCategorySchema.parse(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
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

export function useBudgetCategoryHistory(year: number) {
  return useQuery({
    queryKey: ["budgets", "category-history", year],
    queryFn: () =>
      apiFetch(`/api/budgets/category-history?year=${year}`, budgetCategoryHistorySchema),
    enabled: Number.isInteger(year) && year >= 2000 && year <= 2100,
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

export function useUpdateBudgetPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      budgetPeriodId,
      ...input
    }: UpdateBudgetPeriodInput & { budgetPeriodId: string }) =>
      apiFetch(`/api/budgets/${budgetPeriodId}`, budgetPeriodSchema, {
        method: "PATCH",
        body: updateBudgetPeriodSchema.parse(input),
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

const HOUSEHOLD_MEMBERS_KEY = ["household", "members"] as const;

export function useHouseholdMembers() {
  return useQuery({
    queryKey: HOUSEHOLD_MEMBERS_KEY,
    queryFn: () => apiFetch("/api/household/members", z.array(householdMemberSchema)),
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteMemberInput) =>
      apiFetch("/api/household/members/invite", inviteMemberResultSchema, {
        method: "POST",
        body: inviteMemberInputSchema.parse(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOUSEHOLD_MEMBERS_KEY }),
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: HouseholdRole }) =>
      apiFetch(`/api/household/members/${memberId}`, householdMemberSchema, {
        method: "PATCH",
        body: updateMemberRoleInputSchema.parse({ role }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOUSEHOLD_MEMBERS_KEY }),
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      apiFetch(`/api/household/members/${memberId}`, removeMemberResultSchema, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOUSEHOLD_MEMBERS_KEY }),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      apiFetch("/api/categories", categorySchema, {
        method: "POST",
        body: createCategorySchema.parse(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) =>
      apiFetch(`/api/categories/${categoryId}`, deletedResultSchema, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) =>
      apiFetch("/api/tags", tagSchema, { method: "POST", body: createTagSchema.parse(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tags"] }),
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, input }: { tagId: string; input: UpdateTagInput }) =>
      apiFetch(`/api/tags/${tagId}`, tagSchema, { method: "PATCH", body: updateTagSchema.parse(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tags"] }),
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) =>
      apiFetch(`/api/tags/${tagId}`, deletedResultSchema, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      // Deleting a tag detaches it from transactions
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
