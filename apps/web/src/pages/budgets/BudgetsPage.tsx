import { ChevronLeft, ChevronRight, Pencil, Plus, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fromMinorUnits, toMinorUnits, type Category } from "@financial-management/shared";
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
  const isMonth = view === "month";
  const diff = (a: string, b: string) => fromMinorUnits(toMinorUnits(a) - toMinorUnits(b));
  const pctOf = (actual: string, plan: string) =>
    (Number(actual) / Math.max(Number(plan), 0.01)) * 100;

  const expensePlanned = isMonth ? data?.totals.plannedMonthly : data?.totals.plannedAnnual;
  const expenseActual = isMonth ? data?.totals.spentMonth : data?.totals.spentYearToDate;
  const incomePlanned = isMonth ? data?.income.plannedMonthly : data?.income.plannedAnnual;
  const incomeActual = isMonth ? data?.income.actualMonth : data?.income.actualYearToDate;
  const profitPlanned = isMonth ? data?.profit.plannedMonthly : data?.profit.plannedAnnual;
  const profitActual = isMonth ? data?.profit.actualMonth : data?.profit.actualYearToDate;
  const hasIncome = (data?.lines ?? []).some((l) => l.kind === "income");
  const expenseLeft = diff(expensePlanned ?? "0.00", expenseActual ?? "0.00");
  const incomeLeft = diff(incomePlanned ?? "0.00", incomeActual ?? "0.00");
  const profitGap = diff(profitActual ?? "0.00", profitPlanned ?? "0.00");
  const isNeg = (v: string) => toMinorUnits(v) < 0n;
  const abs = (v: string) => (isNeg(v) ? v.slice(1) : v);

  const renderLines = (kind: "income" | "expense") =>
    (data?.lines ?? [])
      .filter((l) => l.kind === kind)
      .map((line) => {
        const category = categoryById.get(line.categoryId);
        const linePlanned = isMonth ? line.plannedMonthly : line.plannedAnnual;
        const lineSpent = isMonth ? line.spentMonth : line.spentYearToDate;
        const linePct = pctOf(lineSpent, linePlanned);
        return (
          <Link
            key={line.budgetLineId}
            to={`/budgets/lines/${line.budgetLineId}`}
            className="flex"
          >
            <Card className="w-full p-4 transition-colors hover:bg-muted/40">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <span className={cn("size-2.5 rounded-sm", colorDotClass(category?.color))} />
                  {category?.name ?? "קטגוריה"}
                </span>
                <span className="text-xs font-bold tabular-nums" dir="ltr">
                  {formatCurrencyWhole(lineSpent, { currency })} /{" "}
                  {formatCurrencyWhole(linePlanned, { currency })}
                </span>
              </div>
              <ProgressBar percent={linePct} colorClassName={colorDotClass(category?.color)} />
              <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground" dir="ltr">
                {formatCurrencyWhole(line.plannedAnnual, { currency })} / שנה
              </p>
            </Card>
          </Link>
        );
      });

  return (
    <>
      <PageHeader
        title="תקציבים"
        actions={
          <div className="flex items-center gap-2">
            <Chip variant={period.status === "active" ? "primary" : "neutral"}>
              {STATUS_LABELS[period.status]}
            </Chip>
            {period.status !== "closed" ? (
              <Button asChild variant="soft" size="sm">
                <Link to={`/budgets/${period.budgetPeriodId}/edit`}>
                  <Icon icon={Pencil} strokeWidth={2.4} />
                  עריכה
                </Link>
              </Button>
            ) : null}
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
          {hasIncome ? (
            <Card className="mb-2 p-4">
              <div className="mb-2 flex justify-between text-xs font-bold text-muted-foreground">
                <span>הכנסות מתוכננות {formatCurrencyWhole(incomePlanned ?? "0", { currency })}</span>
                <span>התקבלו {formatCurrencyWhole(incomeActual ?? "0", { currency })}</span>
              </div>
              <ProgressBar
                percent={pctOf(incomeActual ?? "0", incomePlanned ?? "0")}
                className="h-2.5"
              />
              <p
                className={cn(
                  "mt-2 text-xs font-bold",
                  isNeg(incomeLeft) ? "text-positive" : "text-muted-foreground",
                )}
              >
                {isNeg(incomeLeft)
                  ? `מעל התכנון ב-${formatCurrencyWhole(abs(incomeLeft), { currency })}`
                  : `נותרו לקבל ${formatCurrencyWhole(incomeLeft, { currency })}`}
              </p>
            </Card>
          ) : null}

          <Card className="mb-2 p-4">
            <div className="mb-2 flex justify-between text-xs font-bold text-muted-foreground">
              <span>הוצאות מתוכננות {formatCurrencyWhole(expensePlanned ?? "0", { currency })}</span>
              <span>נוצל {formatCurrencyWhole(expenseActual ?? "0", { currency })}</span>
            </div>
            <ProgressBar
              percent={pctOf(expenseActual ?? "0", expensePlanned ?? "0")}
              className="h-2.5"
            />
            <p
              className={cn(
                "mt-2 text-xs font-bold",
                isNeg(expenseLeft) ? "text-negative" : "text-positive",
              )}
            >
              {isNeg(expenseLeft)
                ? `חריגה של ${formatCurrencyWhole(abs(expenseLeft), { currency })}`
                : `נותרו ${formatCurrencyWhole(expenseLeft, { currency })} · במסלול`}
            </p>
          </Card>

          {hasIncome ? (
            <Card className="mb-2 p-4">
              <p className="mb-2 text-xs font-bold text-muted-foreground">
                רווח (הכנסות − הוצאות) · {isMonth ? monthLabel : "השנה"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground">רווח צפוי</p>
                  <p
                    className={cn(
                      "text-base font-extrabold tabular-nums",
                      isNeg(profitPlanned ?? "0.00") ? "text-negative" : "text-positive",
                    )}
                    dir="ltr"
                  >
                    {formatCurrencyWhole(profitPlanned ?? "0", { currency })}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground">רווח נוכחי</p>
                  <p
                    className={cn(
                      "text-base font-extrabold tabular-nums",
                      isNeg(profitActual ?? "0.00") ? "text-negative" : "text-positive",
                    )}
                    dir="ltr"
                  >
                    {formatCurrencyWhole(profitActual ?? "0", { currency })}
                  </p>
                </div>
              </div>
              <p
                className={cn(
                  "mt-2 text-xs font-bold",
                  isNeg(profitGap) ? "text-negative" : "text-positive",
                )}
              >
                {isNeg(profitGap)
                  ? `נמוך מהצפוי ב-${formatCurrencyWhole(abs(profitGap), { currency })}`
                  : `גבוה מהצפוי ב-${formatCurrencyWhole(profitGap, { currency })}`}
              </p>
            </Card>
          ) : null}

          <p className="mb-4 ms-1 text-[11px] font-semibold text-muted-foreground">
            הנתונים החודשיים נגזרים מהתוכנית השנתית (שנתי ÷ 12) · הוצאות שנתיות{" "}
            {formatCurrencyWhole(data.totals.plannedAnnual, { currency })}
            {hasIncome
              ? ` · הכנסות שנתיות ${formatCurrencyWhole(data.income.plannedAnnual, { currency })}`
              : ""}
          </p>

          {hasIncome ? (
            <>
              <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                הכנסות · {isMonth ? monthLabel : "השנה"}
              </h2>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">{renderLines("income")}</div>
            </>
          ) : null}

          <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            הוצאות · {isMonth ? monthLabel : "השנה"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">{renderLines("expense")}</div>
        </>
      ) : (
        <p className="text-sm font-semibold text-muted-foreground">טוען נתונים…</p>
      )}
    </>
  );
}
