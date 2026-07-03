import { Check, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Category, ImportRow } from "@financial-management/shared";
import {
  useCategories,
  useCategorizeImportRows,
  useImportBatch,
  usePromoteImportBatch,
  useSession,
} from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { colorDotClass } from "@/lib/labels";
import { formatCurrency, formatDate } from "@/lib/money";
import { cn } from "@/lib/utils";

export function ImportReviewPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const session = useSession();
  const detail = useImportBatch(batchId);
  const categories = useCategories();
  const categorize = useCategorizeImportRows(batchId ?? "");
  const promote = usePromoteImportBatch(batchId ?? "");
  const currency = session.data?.household.baseCurrency;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories.data ?? []) map.set(cat.categoryId, cat);
    return map;
  }, [categories.data]);

  if (detail.isPending) {
    return (
      <>
        <PageHeader title="סקירה וסיווג" backTo="/import" />
        <p className="text-sm font-semibold text-muted-foreground">טוען…</p>
      </>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <>
        <PageHeader title="סקירה וסיווג" backTo="/import" />
        <EmptyState icon={Upload} title="האצווה לא נמצאה" />
      </>
    );
  }

  const { batch, rows } = detail.data;
  const applied = batch.status === "completed" || batch.status === "partially_applied";
  const actionable = rows.filter((r) => !r.isDuplicate && !r.promotedTransactionId);
  const needCategory = actionable.filter((r) => !r.categoryId);
  const categorized = actionable.filter((r) => r.categoryId);

  const toggleRow = (rowId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const assignBulk = async () => {
    if (!bulkCategoryId || selected.size === 0) return;
    await categorize.mutateAsync({ rowIds: [...selected], categoryId: bulkCategoryId });
    setSelected(new Set());
    setBulkCategoryId("");
  };

  const onPromote = async () => {
    await promote.mutateAsync();
    navigate("/import");
  };

  return (
    <>
      <PageHeader
        title={`סקירת ${batch.rowCount} שורות`}
        backTo="/import"
        subtitle={batch.fileName ?? undefined}
      />

      <div className="mb-2 flex items-center gap-1.5">
        <span className="h-1 flex-1 rounded-full bg-primary" />
        <span className="h-1 flex-1 rounded-full bg-primary" />
        <span className={cn("h-1 flex-1 rounded-full", applied ? "bg-primary" : "bg-border")} />
      </div>
      <p className="mb-3 text-xs font-bold text-muted-foreground">
        שלב 2 מתוך 3 · סקירה וסיווג — הקטגוריה נבחרת על ידך, לעולם לא אוטומטית
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {needCategory.length > 0 ? (
          <Chip variant="primary">{needCategory.length} ממתינות לקטגוריה</Chip>
        ) : null}
        {batch.duplicateCount > 0 ? (
          <Chip variant="neutral">{batch.duplicateCount} כפילויות</Chip>
        ) : null}
        {batch.errorCount > 0 ? (
          <Chip variant="negative">{batch.errorCount} שגיאות</Chip>
        ) : null}
        {applied ? <Chip variant="positive">האצווה הוחלה</Chip> : null}
      </div>

      {/* Bulk-assign bar */}
      {!applied && selected.size > 0 ? (
        <div className="sticky top-2 z-10 mb-3 flex items-center gap-2 rounded-control bg-primary-soft p-2.5">
          <span className="flex-1 text-sm font-bold text-primary-strong">
            {selected.size} נבחרו
          </span>
          <select
            value={bulkCategoryId}
            onChange={(e) => setBulkCategoryId(e.target.value)}
            className="h-9 rounded-full border-0 bg-primary px-3 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="בחירת קטגוריה לשורות שנבחרו"
          >
            <option value="">בחרו קטגוריה ▾</option>
            {(categories.data ?? [])
              .filter((c) => c.isActive)
              .map((cat) => (
                <option key={cat.categoryId} value={cat.categoryId}>
                  {cat.parentCategoryId ? `— ${cat.name}` : cat.name}
                </option>
              ))}
          </select>
          <Button size="sm" onClick={assignBulk} disabled={!bulkCategoryId || categorize.isPending}>
            שיוך
          </Button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-2">
        {rows.map((row) => (
          <ReviewRow
            key={row.normalizedRowId}
            row={row}
            category={row.categoryId ? categoryById.get(row.categoryId) : undefined}
            currency={currency}
            selectable={!applied && !row.isDuplicate && !row.promotedTransactionId}
            selected={selected.has(row.normalizedRowId)}
            onToggle={() => toggleRow(row.normalizedRowId)}
          />
        ))}
      </div>

      {promote.isError ? (
        <p className="mb-3 text-center text-sm font-bold text-negative" role="alert">
          {promote.error instanceof Error ? promote.error.message : "ההחלה נכשלה"}
        </p>
      ) : null}

      {!applied ? (
        categorized.length > 0 ? (
          <Button size="lg" className="w-full" onClick={onPromote} disabled={promote.isPending}>
            {promote.isPending
              ? "מחיל…"
              : needCategory.length > 0
                ? `החלת ${categorized.length} שורות מסווגות (${needCategory.length} יידלגו)`
                : `החלת ${categorized.length} שורות ליומן`}
          </Button>
        ) : (
          <div className="rounded-control bg-muted p-3.5 text-center text-sm font-extrabold text-muted-foreground">
            {actionable.length === 0
              ? "אין שורות להחלה"
              : `0 מתוך ${actionable.length} סווגו — המשיכו לסווג`}
          </div>
        )
      ) : null}
    </>
  );
}

function ReviewRow({
  row,
  category,
  currency,
  selectable,
  selected,
  onToggle,
}: {
  row: ImportRow;
  category?: Category;
  currency?: string;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-control border border-border bg-card px-3.5 py-3",
        (row.isDuplicate || row.promotedTransactionId) && "opacity-60",
      )}
    >
      {selectable ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`בחירת ${row.description}`}
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
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{row.description}</span>
        <span className="block text-xs font-medium text-muted-foreground" dir="rtl">
          {formatDate(`${row.transactionDate}T00:00:00`)} ·{" "}
          <span dir="ltr" className={cn("tabular-nums", row.flow === "expense" ? "" : "text-positive")}>
            {row.flow === "expense" ? "-" : "+"}
            {formatCurrency(row.amount, { currency })}
          </span>
          {row.isDuplicate ? " · תואמת תנועה קיימת" : ""}
        </span>
      </span>
      {row.isDuplicate ? (
        <Chip variant="neutral">כפילות</Chip>
      ) : row.promotedTransactionId ? (
        <Chip variant="positive">✓ נקלטה</Chip>
      ) : category ? (
        <Chip variant="primary">
          <span className={cn("size-2 rounded-sm", colorDotClass(category.color))} />
          {category.name}
        </Chip>
      ) : (
        <Chip variant="outline">ממתינה לקטגוריה</Chip>
      )}
    </div>
  );
}
