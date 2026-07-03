import { ChevronLeft, ChevronRight, Plus, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Category } from "@financial-management/shared";
import { useBudgetActuals, useBudgetPeriods, useCategories, useSession } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { colorDotClass } from "@/lib/labels";
import { formatCurrencyWhole } from "@/lib/money";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  active: "פעילה",
  closed: "סגורה",
};

const MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export function BudgetsPage() {
  const session = useSession();
  const periods = useBudgetPeriods();
  const categories = useCategories();
  const [periodIndex, setPeriodIndex] = useState(0);
  const [view, setView] = useState<"year" | "month">("month");
  const currency = session.data?.household.baseCurrency;

  const period = periods.data?.[periodIndex];
  const actuals = useBudgetActuals(period?.budgetPeriodId);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories.data ?? []) map.set(cat.categoryId, cat);
    return map;
  }, [categories.data]);

  if (periods.isPending) {
    return (
      <>
        <PageHeader title="תקציבים" />
        <p className="text-sm font-semibold text-muted-foreground">טוען…</p>
      </>
    );
  }

  if (!period) {
    return (
      <>
        <PageHeader title="תקציבים" />
        <EmptyState
          icon={Target}
          title="אין עדיין תוכנית שנתית"
          description="מתכננים פעם בשנה, סכום שנתי לכל קטגוריה — והמעקב החודשי נגזר אוטומטית."
          action={
            <Button asChild>
              <Link to="/budgets/new">
                <Icon icon={Plus} strokeWidth={2.4} />
                יצירת תוכנית שנתית
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const data = actuals.data;
  const monthLabel = data ? MONTH_NAMES[data.month - 1] : "";
  const planned = view === "month" ? data?.totals.plannedMonthly : data?.totals.plannedAnnual;
  const spent = view === "month" ? data?.totals.spentMonth : data?.totals.spentYearToDate;
  const pct = planned && spent ? (Number(spent) / Math.max(Number(planned), 0.01)) * 100 : 0;
  const left = planned && spent ? Number(planned) - Number(spent) : 0;

  return (
    <>
      <PageHeader
        title="תקציבים"
        actions={
          <div className="flex items-center gap-2">
            <Chip variant={period.status === "active" ? "primary" : "neutral"}>
              {STATUS_LABELS[period.status]}
            </Chip>
            <Button asChild variant="soft" size="sm">
              <Link to="/budgets/new">
                <Icon icon={Plus} strokeWidth={2.4} />
                תוכנית חדשה
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          aria-label="שנה קודמת"
          disabled={periodIndex >= (periods.data?.length ?? 1) - 1}
          onClick={() => setPeriodIndex((i) => i + 1)}
          className="rounded-control p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
        >
          <Icon icon={ChevronRight} className="size-4" strokeWidth={2.2} />
        </button>
        <span className="text-base font-extrabold">תוכנית {period.year}</span>
        <button
          type="button"
          aria-label="שנה הבאה"
          disabled={periodIndex === 0}
          onClick={() => setPeriodIndex((i) => i - 1)}
          className="rounded-control p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
        >
          <Icon icon={ChevronLeft} className="size-4" strokeWidth={2.2} />
        </button>
        <SegmentedControl
          aria-label="תצוגה"
          className="ms-auto w-44"
          options={[
            { value: "year", label: "שנה" },
            { value: "month", label: monthLabel ? `${monthLabel}` : "חודש" },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {data ? (
        <>
          <Card className="mb-2 p-4">
            <div className="mb-2 flex justify-between text-xs font-bold text-muted-foreground">
              <span>מתוכנן {formatCurrencyWhole(planned ?? "0", { currency })}</span>
              <span>נוצל {formatCurrencyWhole(spent ?? "0", { currency })}</span>
            </div>
            <ProgressBar percent={pct} className="h-2.5" />
            <p
              className={cn(
                "mt-2 text-xs font-bold",
                left >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {left >= 0
                ? `נותרו ${formatCurrencyWhole(left.toFixed(2), { currency })} · במסלול`
                : `חריגה של ${formatCurrencyWhole(Math.abs(left).toFixed(2), { currency })}`}
            </p>
          </Card>
          <p className="mb-4 ms-1 text-[11px] font-semibold text-muted-foreground">
            הנתונים החודשיים נגזרים מהתוכנית השנתית (שנתי ÷ 12) · סה״כ שנתי{" "}
            {formatCurrencyWhole(data.totals.plannedAnnual, { currency })}
          </p>

          <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            קטגוריות · {view === "month" ? monthLabel : "השנה"}
          </h2>
          <div className="flex flex-col gap-2">
            {data.lines.map((line) => {
              const category = categoryById.get(line.categoryId);
              const linePlanned = view === "month" ? line.plannedMonthly : line.plannedAnnual;
              const lineSpent = view === "month" ? line.spentMonth : line.spentYearToDate;
              const linePct = (Number(lineSpent) / Math.max(Number(linePlanned), 0.01)) * 100;
              return (
                <Link key={line.budgetLineId} to={`/budgets/lines/${line.budgetLineId}`}>
                  <Card className="p-3.5 transition-colors hover:bg-muted/40">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-bold">
                        <span
                          className={cn("size-2.5 rounded-sm", colorDotClass(category?.color))}
                        />
                        {category?.name ?? "קטגוריה"}
                      </span>
                      <span className="text-xs font-bold tabular-nums" dir="ltr">
                        {formatCurrencyWhole(lineSpent, { currency })} /{" "}
                        {formatCurrencyWhole(linePlanned, { currency })}
                      </span>
                    </div>
                    <ProgressBar
                      percent={linePct}
                      colorClassName={colorDotClass(category?.color)}
                    />
                    <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground" dir="ltr">
                      {formatCurrencyWhole(line.plannedAnnual, { currency })} / שנה
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm font-semibold text-muted-foreground">טוען נתונים…</p>
      )}
    </>
  );
}
