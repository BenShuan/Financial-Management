import { Target } from "lucide-react";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useBudgetActuals, useBudgetPeriods, useCategories, useSession, useTransactions } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { AmountText } from "@/components/ui/amount-text";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { colorDotClass } from "@/lib/labels";
import { formatCurrencyWhole, formatDate } from "@/lib/money";
import { cn } from "@/lib/utils";

const RING_COLORS: Record<string, string> = {
  primary: "oklch(var(--primary))",
  info: "oklch(var(--info))",
  warning: "oklch(var(--warning))",
  violet: "oklch(var(--violet))",
  positive: "oklch(var(--positive))",
  negative: "oklch(var(--negative))",
};

export function BudgetLinePage() {
  const { budgetLineId } = useParams<{ budgetLineId: string }>();
  const session = useSession();
  const periods = useBudgetPeriods();
  const categories = useCategories();
  const currency = session.data?.household.baseCurrency;

  // Locate the period that owns this line
  const owning = useMemo(() => {
    for (const period of periods.data ?? []) {
      const line = period.lines.find((l) => l.budgetLineId === budgetLineId);
      if (line) return { period, line };
    }
    return undefined;
  }, [periods.data, budgetLineId]);

  const actuals = useBudgetActuals(owning?.period.budgetPeriodId);
  const lineActuals = actuals.data?.lines.find((l) => l.budgetLineId === budgetLineId);
  const category = categories.data?.find(
    (c) => c.categoryId === owning?.line.categoryId,
  );

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const transactions = useTransactions({
    categoryId: owning?.line.categoryId,
    from: monthStart,
    limit: 50,
  });

  if (periods.isPending || actuals.isPending) {
    return (
      <>
        <PageHeader title="מעקב קטגוריה" backTo="/budgets" />
        <p className="text-sm font-semibold text-muted-foreground">טוען…</p>
      </>
    );
  }
  if (!owning || !lineActuals) {
    return (
      <>
        <PageHeader title="מעקב קטגוריה" backTo="/budgets" />
        <EmptyState icon={Target} title="השורה לא נמצאה" />
      </>
    );
  }

  const pct = Math.round(
    (Number(lineActuals.spentMonth) / Math.max(Number(lineActuals.plannedMonthly), 0.01)) * 100,
  );
  const left = Number(lineActuals.plannedMonthly) - Number(lineActuals.spentMonth);
  const ytdPct = Math.round(
    (Number(lineActuals.spentYearToDate) / Math.max(Number(lineActuals.plannedAnnual), 0.01)) * 100,
  );

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title={category?.name ?? "קטגוריה"}
        backTo="/budgets"
        subtitle={`תוכנית ${owning.period.year}`}
      />

      <Card className="mb-4 p-6 text-center">
        <ProgressRing
          percent={pct}
          size={120}
          strokeWidth={13}
          color={RING_COLORS[category?.color ?? "primary"] ?? RING_COLORS.primary}
          showLabel
          className="mx-auto"
        />
        <p className="mt-3 text-base font-extrabold" dir="ltr">
          {formatCurrencyWhole(lineActuals.spentMonth, { currency })}{" "}
          <span className="text-sm font-semibold text-muted-foreground">
            מתוך {formatCurrencyWhole(lineActuals.plannedMonthly, { currency })} החודש
          </span>
        </p>
        <p className="mt-1 text-[11px] font-semibold text-muted-foreground" dir="ltr">
          {formatCurrencyWhole(lineActuals.plannedMonthly, { currency })}/חודש נגזר מ-
          {formatCurrencyWhole(lineActuals.plannedAnnual, { currency })}/שנה
        </p>
        <div className="mt-2.5">
          <Chip variant={left >= 0 ? "positive" : "negative"}>
            {left >= 0
              ? `במסלול · נותרו ${formatCurrencyWhole(left.toFixed(2), { currency })}`
              : `חריגה של ${formatCurrencyWhole(Math.abs(left).toFixed(2), { currency })}`}
          </Chip>
        </div>
      </Card>

      <h2 className="mb-1 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        תנועות החודש
      </h2>
      <p className="mb-2 ms-1 text-[11px] font-semibold text-muted-foreground" dir="ltr">
        מתחילת השנה: {formatCurrencyWhole(lineActuals.spentYearToDate, { currency })} מתוך{" "}
        {formatCurrencyWhole(lineActuals.plannedAnnual, { currency })} ({ytdPct}%)
      </p>

      {transactions.data && transactions.data.length > 0 ? (
        <ListCard>
          {transactions.data.map((txn) => (
            <ListRow key={txn.transactionId}>
              <span
                className={cn("size-2.5 shrink-0 rounded-sm", colorDotClass(category?.color))}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{txn.description}</span>
                <span className="block text-xs font-medium text-muted-foreground">
                  {formatDate(`${txn.transactionDate}T00:00:00`)}
                </span>
              </span>
              <AmountText amount={txn.amount} flow="expense" currency={currency} className="text-sm" />
            </ListRow>
          ))}
        </ListCard>
      ) : (
        <Card className="p-5 text-sm font-semibold text-muted-foreground">
          אין תנועות בקטגוריה זו החודש.
        </Card>
      )}
    </div>
  );
}
