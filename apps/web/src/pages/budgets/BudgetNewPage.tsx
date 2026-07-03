import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fromMinorUnits,
  sumMoney,
  toMinorUnits,
  type BudgetPeriod,
} from "@financial-management/shared";
import { useBudgetPeriods, useCategories, useCreateBudgetPeriod, useSession } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { colorDotClass } from "@/lib/labels";
import { formatCurrencyWhole } from "@/lib/money";
import { cn } from "@/lib/utils";

const MONEY_INPUT = /^\d{0,12}(\.\d{0,2})?$/;

export function BudgetNewPage() {
  const navigate = useNavigate();
  const session = useSession();
  const categories = useCategories();
  const periods = useBudgetPeriods();
  const createPeriod = useCreateBudgetPeriod();
  const currency = session.data?.household.baseCurrency;

  const latestYear = periods.data?.[0]?.year;
  const [year, setYear] = useState(() =>
    latestYear ? latestYear + 1 : new Date().getFullYear(),
  );
  const [rollover, setRollover] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const expenseCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.isActive && c.kind === "expense"),
    [categories.data],
  );

  const referencePeriod: BudgetPeriod | undefined = periods.data?.find(
    (p) => p.year === year - 1,
  );
  const referenceByCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of referencePeriod?.lines ?? []) {
      map.set(line.categoryId, line.plannedAmount);
    }
    return map;
  }, [referencePeriod]);

  const filledLines = Object.entries(amounts).filter(([, v]) => Number(v) > 0);
  const totalAnnual = sumMoney(filledLines.map(([, v]) => v));
  const totalMonthly = fromMinorUnits(toMinorUnits(totalAnnual) / 12n);

  const onSubmit = async () => {
    await createPeriod.mutateAsync({
      year,
      rolloverEnabled: rollover,
      lines: filledLines.map(([categoryId, plannedAmount]) => ({
        categoryId,
        plannedAmount: Number(plannedAmount).toFixed(2),
      })),
    });
    navigate("/budgets");
  };

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title={`תוכנית חדשה — ${year}`}
        backTo="/budgets"
        actions={
          <Button
            onClick={onSubmit}
            disabled={createPeriod.isPending || filledLines.length === 0}
          >
            {createPeriod.isPending ? "שומר…" : "שמירה"}
          </Button>
        }
      />

      <p className="mb-4 text-xs font-semibold text-muted-foreground">
        מתכננים פעם אחת לכל השנה — מזינים סכום <b>שנתי</b> לכל קטגוריה; התצוגה
        החודשית נגזרת אוטומטית (שנתי ÷ 12).
      </p>

      <Card className="mb-4 flex items-center justify-between p-4">
        <label htmlFor="plan-year" className="text-sm font-bold">
          שנת התוכנית
        </label>
        <Input
          id="plan-year"
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-9 w-24 text-center tabular-nums"
          dir="ltr"
        />
      </Card>

      <Card className="mb-4 flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-bold">גלגול יתרות</p>
          <p className="text-xs font-medium text-muted-foreground">
            העברת יתרות שלא נוצלו מהשנה הקודמת לתוכנית החדשה
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={rollover}
          aria-label="גלגול יתרות"
          onClick={() => setRollover((v) => !v)}
          className={cn(
            "flex h-[26px] w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300",
            rollover ? "bg-primary" : "bg-border",
          )}
        >
          <span
            className={cn(
              "size-5 rounded-full bg-card shadow-sm transition-transform duration-300",
              rollover ? "-translate-x-[18px]" : "translate-x-0",
            )}
          />
        </button>
      </Card>

      <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        סכומים שנתיים מתוכננים
      </h2>
      <div className="mb-4 flex flex-col gap-2">
        {expenseCategories.map((category) => {
          const reference = referenceByCategory.get(category.categoryId);
          return (
            <Card key={category.categoryId} className="flex items-center gap-3 p-3.5">
              <span className={cn("size-2.5 shrink-0 rounded-sm", colorDotClass(category.color))} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {category.parentCategoryId ? `— ${category.name}` : category.name}
                </span>
                {reference ? (
                  <span className="block text-[11px] font-medium text-muted-foreground" dir="ltr">
                    {year - 1}: {formatCurrencyWhole(reference, { currency })} / שנה
                  </span>
                ) : null}
              </span>
              <Input
                inputMode="decimal"
                dir="ltr"
                placeholder="0"
                aria-label={`סכום שנתי עבור ${category.name}`}
                value={amounts[category.categoryId] ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "" || MONEY_INPUT.test(value)) {
                    setAmounts((prev) => ({ ...prev, [category.categoryId]: value }));
                  }
                }}
                className="h-9 w-28 bg-muted text-center font-extrabold tabular-nums"
              />
            </Card>
          );
        })}
      </div>

      <div className="mb-6 flex items-center justify-between rounded-card bg-primary-soft p-4">
        <div>
          <p className="text-sm font-bold text-primary-strong">סה״כ מתוכנן — {year}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-primary-strong/80" dir="ltr">
            ≈ {formatCurrencyWhole(totalMonthly, { currency })} / חודש
          </p>
        </div>
        <p className="text-lg font-extrabold text-primary-strong tabular-nums" dir="ltr">
          {formatCurrencyWhole(totalAnnual, { currency })} / שנה
        </p>
      </div>

      {createPeriod.isError ? (
        <p className="mb-4 text-center text-sm font-bold text-negative" role="alert">
          {createPeriod.error instanceof Error ? createPeriod.error.message : "השמירה נכשלה"}
        </p>
      ) : null}

      <Button
        onClick={onSubmit}
        size="lg"
        className="w-full"
        disabled={createPeriod.isPending || filledLines.length === 0}
      >
        {createPeriod.isPending ? "שומר…" : "שמירת התוכנית"}
      </Button>
    </div>
  );
}
