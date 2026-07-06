import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { Category, Transaction } from "@financial-management/shared";
import {
  useAccounts,
  useBulkCategorize,
  useCategories,
  useSession,
  useTransactions,
  useUpdateTransaction,
} from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { AmountText } from "@/components/ui/amount-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { colorDotClass } from "@/lib/labels";
import { dateGroupLabel } from "@/lib/money";
import { cn } from "@/lib/utils";

const MONTH_LABEL = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" });

const inlineSelectClass =
  "h-8 max-w-36 shrink-0 truncate rounded-control border border-input bg-card px-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

type MonthFilter = { year: number; month: number } | null;

function currentMonth(): MonthFilter {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function shiftMonth(value: MonthFilter, delta: number): MonthFilter {
  const base = value ?? currentMonth()!;
  const d = new Date(base.year, base.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function monthRange(value: MonthFilter): { from?: string; to?: string } {
  if (!value) return {};
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(value.year, value.month, 0).getDate();
  return {
    from: `${value.year}-${pad(value.month)}-01`,
    to: `${value.year}-${pad(value.month)}-${pad(lastDay)}`,
  };
}

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const importBatchId = searchParams.get("importBatchId") ?? undefined;

  const session = useSession();
  const accounts = useAccounts();
  const categories = useCategories();
  const updateTransaction = useUpdateTransaction();
  const bulkCategorize = useBulkCategorize();
  const currency = session.data?.household.baseCurrency;

  // When arriving from an import, show the whole batch regardless of month
  const [month, setMonth] = useState<MonthFilter>(importBatchId ? null : currentMonth());
  const [categoryFilter, setCategoryFilter] = useState<string>(""); // "" | "uncategorized" | categoryId
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");

  const { from, to } = monthRange(month);
  const transactions = useTransactions({
    from,
    to,
    uncategorized: categoryFilter === "uncategorized",
    categoryId:
      categoryFilter && categoryFilter !== "uncategorized" ? categoryFilter : undefined,
    importBatchId,
    limit: 200,
  });

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories.data ?? []) map.set(cat.categoryId, cat);
    return map;
  }, [categories.data]);

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of accounts.data ?? []) map.set(acc.accountId, acc.name);
    return map;
  }, [accounts.data]);

  const groups = useMemo(() => {
    const byDate = new Map<string, Transaction[]>();
    for (const txn of transactions.data ?? []) {
      const list = byDate.get(txn.transactionDate) ?? [];
      list.push(txn);
      byDate.set(txn.transactionDate, list);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [transactions.data]);

  // Transfers never take a category; split headers are categorized via their splits
  const selectableIds = useMemo(
    () =>
      (transactions.data ?? [])
        .filter((txn) => txn.type !== "transfer" && txn.splits.length === 0)
        .map((txn) => txn.transactionId),
    [transactions.data],
  );

  const toggleRow = (transactionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(transactionId)) next.delete(transactionId);
      else next.add(transactionId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === selectableIds.length ? new Set() : new Set(selectableIds),
    );
  };

  const assignBulk = async () => {
    if (!bulkCategoryId || selected.size === 0) return;
    await bulkCategorize.mutateAsync({
      transactionIds: [...selected],
      categoryId: bulkCategoryId,
    });
    setSelected(new Set());
    setBulkCategoryId("");
  };

  const activeCategories = (categories.data ?? []).filter((c) => c.isActive);

  return (
    <>
      <PageHeader title="תנועות" subtitle="סינון, סיווג ועריכה של כל התנועות" />

      {/* Month picker */}
      <div className="mb-3 flex items-center gap-1 rounded-control border border-border bg-card px-1 py-1">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="חודש קודם"
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon icon={ChevronRight} className="size-4" strokeWidth={2.2} />
        </button>
        <span className="flex-1 text-center text-sm font-extrabold">
          {month ? MONTH_LABEL.format(new Date(month.year, month.month - 1, 1)) : "כל התקופות"}
        </span>
        <button
          type="button"
          onClick={() => setMonth((m) => (m ? null : currentMonth()))}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            month ? "bg-muted text-secondary-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          הכל
        </button>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          aria-label="חודש הבא"
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon icon={ChevronLeft} className="size-4" strokeWidth={2.2} />
        </button>
      </div>

      {/* Category filter chips */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {importBatchId ? (
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ייבוא אחרון
            <Icon icon={X} className="size-3" strokeWidth={2.5} />
          </button>
        ) : null}
        <FilterChip active={categoryFilter === ""} onClick={() => setCategoryFilter("")}>
          הכל
        </FilterChip>
        <FilterChip
          active={categoryFilter === "uncategorized"}
          onClick={() => setCategoryFilter("uncategorized")}
        >
          ללא קטגוריה
        </FilterChip>
        {activeCategories.map((cat) => (
          <FilterChip
            key={cat.categoryId}
            active={categoryFilter === cat.categoryId}
            onClick={() => setCategoryFilter(cat.categoryId)}
          >
            <span className={cn("size-2 rounded-sm", colorDotClass(cat.color))} />
            {cat.name}
          </FilterChip>
        ))}
      </div>

      {/* Bulk-assign bar */}
      {selected.size > 0 ? (
        <div className="sticky top-2 z-10 mb-3 flex items-center gap-2 rounded-control bg-primary-soft p-2.5">
          <span className="flex-1 text-sm font-bold text-primary-strong">
            {selected.size} נבחרו
          </span>
          <select
            value={bulkCategoryId}
            onChange={(e) => setBulkCategoryId(e.target.value)}
            className="h-9 rounded-full border-0 bg-primary px-3 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="בחירת קטגוריה לתנועות שנבחרו"
          >
            <option value="">בחרו קטגוריה ▾</option>
            {activeCategories.map((cat) => (
              <option key={cat.categoryId} value={cat.categoryId}>
                {cat.parentCategoryId ? `— ${cat.name}` : cat.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={assignBulk}
            disabled={!bulkCategoryId || bulkCategorize.isPending}
          >
            {bulkCategorize.isPending ? "משייך…" : "שיוך"}
          </Button>
        </div>
      ) : null}

      {/* List toolbar */}
      {selectableIds.length > 0 ? (
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-bold text-muted-foreground">
            {transactions.data?.length ?? 0} תנועות
          </span>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-bold text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {selected.size === selectableIds.length ? "ניקוי בחירה" : "בחירת הכל"}
          </button>
        </div>
      ) : null}

      {transactions.isPending ? (
        <p className="text-sm font-semibold text-muted-foreground">טוען תנועות…</p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="אין תנועות בסינון הזה"
          description="נסו חודש אחר, קטגוריה אחרת או ייבאו קובץ חדש."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([date, txns]) => (
            <section key={date}>
              <h2 className="mb-2 ms-1 text-xs font-bold text-muted-foreground">
                {dateGroupLabel(date)}
              </h2>
              <ListCard>
                {txns.map((txn) => (
                  <EditableTransactionRow
                    key={txn.transactionId}
                    txn={txn}
                    categoryById={categoryById}
                    accountName={accountNameById.get(txn.accountId)}
                    activeCategories={activeCategories}
                    currency={currency}
                    selected={selected.has(txn.transactionId)}
                    onToggle={() => toggleRow(txn.transactionId)}
                    onCategoryChange={(categoryId) =>
                      updateTransaction.mutate({
                        transactionId: txn.transactionId,
                        input: { categoryId },
                      })
                    }
                    updating={
                      updateTransaction.isPending &&
                      updateTransaction.variables?.transactionId === txn.transactionId
                    }
                  />
                ))}
              </ListCard>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-secondary-foreground hover:bg-primary-soft",
      )}
    >
      {children}
    </button>
  );
}

function EditableTransactionRow({
  txn,
  categoryById,
  accountName,
  activeCategories,
  currency,
  selected,
  onToggle,
  onCategoryChange,
  updating,
}: {
  txn: Transaction;
  categoryById: Map<string, Category>;
  accountName?: string;
  activeCategories: Category[];
  currency?: string;
  selected: boolean;
  onToggle: () => void;
  onCategoryChange: (categoryId: string | null) => void;
  updating: boolean;
}) {
  const category = txn.categoryId ? categoryById.get(txn.categoryId) : undefined;
  const selectable = txn.type !== "transfer" && txn.splits.length === 0;
  const dotColor = txn.type === "transfer" ? "violet" : category?.color;

  // Category options match the row's flow; keep an inactive assigned category visible
  const options = activeCategories.filter((cat) => cat.kind === txn.type);
  const assignedMissing =
    category && !options.some((cat) => cat.categoryId === category.categoryId);

  return (
    <ListRow>
      {selectable ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`בחירת ${txn.description}`}
          onClick={onToggle}
          className={cn(
            "flex size-[18px] shrink-0 items-center justify-center rounded-md border-2 transition-colors",
            selected ? "border-primary bg-primary" : "border-border bg-card",
          )}
        >
          {selected ? (
            <Icon icon={Check} className="size-3 text-primary-foreground" strokeWidth={3} />
          ) : null}
        </button>
      ) : (
        <span className="size-[18px] shrink-0 rounded-md border-2 border-border/50" aria-hidden />
      )}
      <span className={cn("size-8 shrink-0 rounded-[10px]", colorDotClass(dotColor))} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{txn.description}</span>
        <span className="block truncate text-xs font-medium text-muted-foreground">
          {accountName ?? ""}
          {txn.status === "pending" ? " · ממתין" : ""}
        </span>
      </span>
      {txn.type === "transfer" ? (
        <span className="shrink-0 text-xs font-bold text-muted-foreground">העברה</span>
      ) : txn.splits.length > 0 ? (
        <span className="shrink-0 text-xs font-bold text-muted-foreground">
          {txn.splits.length} פיצולים
        </span>
      ) : (
        <select
          value={txn.categoryId ?? ""}
          onChange={(e) => onCategoryChange(e.target.value || null)}
          disabled={updating}
          className={cn(
            inlineSelectClass,
            !txn.categoryId && "border-dashed border-primary/50 text-primary-strong",
          )}
          aria-label={`קטגוריה עבור ${txn.description}`}
        >
          <option value="">ללא קטגוריה</option>
          {assignedMissing && category ? (
            <option value={category.categoryId}>{category.name}</option>
          ) : null}
          {options.map((cat) => (
            <option key={cat.categoryId} value={cat.categoryId}>
              {cat.parentCategoryId ? `— ${cat.name}` : cat.name}
            </option>
          ))}
        </select>
      )}
      <AmountText
        amount={
          txn.type === "transfer" && txn.transferDirection === "out"
            ? `-${txn.amount}`
            : txn.amount
        }
        flow={txn.type === "transfer" ? "neutral" : txn.type}
        currency={currency}
        className="text-sm"
      />
    </ListRow>
  );
}
