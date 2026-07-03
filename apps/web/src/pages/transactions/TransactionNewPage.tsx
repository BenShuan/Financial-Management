import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createTransactionSchema,
  type CreateTransactionInput,
  type TransactionType,
} from "@financial-management/shared";
import { useAccounts, useCategories, useCreateTransaction, useSession, useTags } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS = [
  { value: "expense", label: "הוצאה" },
  { value: "income", label: "הכנסה" },
  { value: "transfer", label: "העברה" },
] as const;

const selectClass =
  "h-9 rounded-control border border-input bg-card px-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Native selects yield "" when nothing is chosen; the schema expects undefined. */
const emptyAsUndefined = { setValueAs: (v: unknown) => (v === "" ? undefined : v) };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = useSession();
  const accounts = useAccounts();
  const categories = useCategories();
  const tags = useTags();
  const createTransaction = useCreateTransaction();

  const form = useForm<CreateTransactionInput>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      type: "expense",
      amount: "",
      accountId: searchParams.get("accountId") ?? "",
      transactionDate: todayIso(),
      description: "",
      status: "cleared",
      splits: [],
      tagIds: [],
    },
  });
  const splitArray = useFieldArray({ control: form.control, name: "splits" });

  const type = form.watch("type");
  const selectedTags = form.watch("tagIds") ?? [];
  const hasSplits = (form.watch("splits")?.length ?? 0) > 0;

  const activeAccounts = (accounts.data ?? []).filter((a) => a.isActive);
  const relevantCategories = useMemo(
    () =>
      (categories.data ?? []).filter(
        (cat) => cat.isActive && cat.kind === (type === "income" ? "income" : "expense"),
      ),
    [categories.data, type],
  );

  const currencySymbol = session.data?.household.baseCurrency === "ILS" ? "₪" : "";

  const onSubmit = form.handleSubmit(async (values) => {
    await createTransaction.mutateAsync(values);
    navigate(values.accountId ? `/accounts/${values.accountId}` : "/");
  });

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-lg">
      <PageHeader
        title="תנועה חדשה"
        backTo="/"
        actions={
          <Button type="submit" disabled={createTransaction.isPending}>
            {createTransaction.isPending ? "שומר…" : "שמירה"}
          </Button>
        }
      />

      <SegmentedControl
        aria-label="סוג תנועה"
        options={TYPE_OPTIONS}
        value={type}
        onChange={(value: TransactionType) => {
          form.setValue("type", value);
          form.setValue("categoryId", undefined);
          if (value === "transfer") form.setValue("splits", []);
        }}
        className="mb-6"
      />

      <div className="mb-6 text-center">
        <label htmlFor="amount" className="mb-1 block text-sm font-semibold text-muted-foreground">
          סכום
        </label>
        <div className="flex items-center justify-center gap-1" dir="ltr">
          <span
            className={cn(
              "text-3xl font-extrabold",
              type === "expense" ? "text-negative" : type === "income" ? "text-positive" : "text-foreground",
            )}
          >
            {currencySymbol}
          </span>
          <input
            id="amount"
            inputMode="decimal"
            placeholder="0.00"
            {...form.register("amount")}
            className={cn(
              "w-44 bg-transparent text-center text-4xl font-extrabold tabular-nums placeholder:text-muted-foreground/40 focus-visible:outline-none",
              type === "expense" ? "text-negative" : type === "income" ? "text-positive" : "text-foreground",
            )}
          />
        </div>
        <FieldError message={form.formState.errors.amount?.message} />
      </div>

      <Card className="mb-4 divide-y divide-border">
        <FormRow label="חשבון" error={form.formState.errors.accountId?.message}>
          <select {...form.register("accountId")} className={selectClass}>
            <option value="">בחרו חשבון</option>
            {activeAccounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.name}
              </option>
            ))}
          </select>
        </FormRow>

        {type === "transfer" ? (
          <FormRow label="לחשבון" error={form.formState.errors.transferPeerAccountId?.message}>
            <select {...form.register("transferPeerAccountId", emptyAsUndefined)} className={selectClass}>
              <option value="">בחרו חשבון יעד</option>
              {activeAccounts
                .filter((a) => a.accountId !== form.watch("accountId"))
                .map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.name}
                  </option>
                ))}
            </select>
          </FormRow>
        ) : !hasSplits ? (
          <FormRow
            label={
              <>
                קטגוריה <span className="text-negative">*</span>
              </>
            }
            error={form.formState.errors.categoryId?.message}
          >
            <select {...form.register("categoryId", emptyAsUndefined)} className={selectClass}>
              <option value="">בחרו קטגוריה</option>
              {relevantCategories.map((cat) => (
                <option key={cat.categoryId} value={cat.categoryId}>
                  {cat.parentCategoryId ? `— ${cat.name}` : cat.name}
                </option>
              ))}
            </select>
          </FormRow>
        ) : null}

        <FormRow label="תיאור" error={form.formState.errors.description?.message}>
          <Input {...form.register("description")} placeholder="למשל: שופרסל" className="h-9 max-w-52" />
        </FormRow>

        <FormRow label="שם העסק">
          <Input {...form.register("merchantName", emptyAsUndefined)} placeholder="לא חובה" className="h-9 max-w-52" />
        </FormRow>

        <FormRow label="תאריך" error={form.formState.errors.transactionDate?.message}>
          <Input type="date" {...form.register("transactionDate")} className="h-9 max-w-44" />
        </FormRow>
      </Card>

      {type !== "transfer" ? (
        <div className="mb-4">
          {!hasSplits ? (
            <button
              type="button"
              onClick={() => {
                form.setValue("categoryId", undefined);
                splitArray.append({ categoryId: "", amount: "" });
                splitArray.append({ categoryId: "", amount: "" });
              }}
              className="flex items-center gap-1.5 px-1 text-sm font-bold text-primary transition-colors hover:text-primary/80"
            >
              <Icon icon={Plus} className="size-4" strokeWidth={2.4} />
              פיצול בין קטגוריות
            </button>
          ) : (
            <Card className="divide-y divide-border">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-bold">פיצול בין קטגוריות</span>
                <button
                  type="button"
                  onClick={() => form.setValue("splits", [])}
                  className="text-xs font-bold text-negative hover:text-negative/80"
                >
                  ביטול פיצול
                </button>
              </div>
              {splitArray.fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2 px-4 py-3">
                  <select
                    {...form.register(`splits.${index}.categoryId`)}
                    className={cn(selectClass, "flex-1")}
                  >
                    <option value="">קטגוריה</option>
                    {relevantCategories.map((cat) => (
                      <option key={cat.categoryId} value={cat.categoryId}>
                        {cat.parentCategoryId ? `— ${cat.name}` : cat.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    {...form.register(`splits.${index}.amount`)}
                    placeholder="0.00"
                    inputMode="decimal"
                    dir="ltr"
                    className="h-9 w-24 text-center tabular-nums"
                  />
                  <button
                    type="button"
                    aria-label="הסרת פיצול"
                    onClick={() => splitArray.remove(index)}
                    className="text-muted-foreground hover:text-negative"
                  >
                    <Icon icon={Trash2} className="size-4" />
                  </button>
                </div>
              ))}
              <div className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => splitArray.append({ categoryId: "", amount: "" })}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary"
                >
                  <Icon icon={Plus} className="size-3.5" strokeWidth={2.4} />
                  הוספת שורה
                </button>
              </div>
            </Card>
          )}
          <FieldError message={form.formState.errors.splits?.message} />
        </div>
      ) : null}

      {type !== "transfer" && (tags.data?.length ?? 0) > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {tags.data!.map((tag) => {
            const selected = selectedTags.includes(tag.tagId);
            return (
              <button
                key={tag.tagId}
                type="button"
                onClick={() =>
                  form.setValue(
                    "tagIds",
                    selected
                      ? selectedTags.filter((id) => id !== tag.tagId)
                      : [...selectedTags, tag.tagId],
                  )
                }
              >
                <Chip variant={selected ? "primary" : "outline"}>#{tag.name}</Chip>
              </button>
            );
          })}
        </div>
      ) : null}

      {type !== "transfer" ? (
        <p className="mb-6 text-center text-xs font-semibold text-muted-foreground">
          * לכל הכנסה או הוצאה נדרשת קטגוריה — נבחרת על ידך, לעולם לא אוטומטית.
        </p>
      ) : null}

      {createTransaction.isError ? (
        <p className="mb-4 text-center text-sm font-bold text-negative" role="alert">
          {createTransaction.error instanceof Error
            ? createTransaction.error.message
            : "שמירת התנועה נכשלה"}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={createTransaction.isPending}>
        {createTransaction.isPending ? "שומר…" : "שמירת התנועה"}
      </Button>
    </form>
  );
}

function FormRow({
  label,
  error,
  children,
}: {
  label: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-muted-foreground">{label}</span>
        {children}
      </div>
      <FieldError message={error} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-end text-xs font-bold text-negative" role="alert">
      {message}
    </p>
  );
}
