import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fromMinorUnits, sumMoney, toMinorUnits } from "@financial-management/shared";
import {
  useBudgetCategoryHistory,
  useBudgetPeriods,
  useCategories, useCreateBudgetPeriod, useSession } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { colorDotClass } from "@/lib/labels";
import { formatCurrencyWhole } from "@/lib/money";
import { cn } from "@/lib/utils";

const MONEY_INPUT = /^\d{0,12}(\.\d{0,2})?$/;

type Fields = { month: string; year: string };

/** "1200.00" -> "1200", "83.50" -> "83.5"; empty/zero -> "". */
function tidy(amount: string): string {
  if (toMinorUnits(amount) === 0n) return "";
  return amount.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

const monthFromYear = (year: string) =>
  tidy(fromMinorUnits((toMinorUnits(year) * 2n + 12n) / 24n));
const yearFromMonth = (month: string) => tidy(fromMinorUnits(toMinorUnits(month) * 12n));

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
  const [fields, setFields] = useState<Record<string, Fields>>({});
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});

  const expenseCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.isActive && c.kind === "expense"),
    [categories.data],
  );

  const history = useBudgetCategoryHistory(year - 1);
  const historyByCategory = useMemo(
    () => new Map((history.data?.categories ?? []).map((h) => [h.categoryId, h])),
    [history.data],
  );
  // Edit one field; the other is derived. The edited field keeps exactly what was typed.
  const editField = (categoryId: string, source: "month" | "year", value: string) => {
    if (value !== "" && !MONEY_INPUT.test(value)) return;
    setFields((prev) => ({
      ...prev,
      [categoryId]:
        source === "year"
          ? { year: value, month: monthFromYear(value) }
          : { month: value, year: yearFromMonth(value) },
    }));
  };
  const setAnnual = (categoryId: string, value: string) =>
    editField(categoryId, "year", value);

  const filledLines = Object.entries(fields)
    .map(([id, f]) => [id, f.year] as const)
    .filter(([, v]) => Number(v) > 0);
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
    <div className="mx-auto max-w-3xl">
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
        מתכננים פעם אחת לכל השנה — מזינים סכום <b>חודשי</b> או <b>שנתי</b> לכל
        קטגוריה, והשני מתעדכן אוטומטית (שנתי ÷ 12).
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
        סכומים מתוכננים
      </h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {expenseCategories.map((category) => {
          const id = category.categoryId;
          const past = historyByCategory.get(id);
          const planned = past?.planned ?? null;
          const actual = past && Number(past.actual) > 0 ? past.actual : null;
          const showPlanned = history.data?.hasPeriod === true;
          const hasHistory = (showPlanned && planned !== null) || actual !== null;
          const fmt = (v: string | null) =>
            v === null ? "—" : formatCurrencyWhole(v, { currency });
          const applyLastYear = (v: string) => setAnnual(id, String(Number(v)));
          const open = openHistory[id] === true;
          const f = fields[id] ?? { month: "", year: "" };
          return (
            <Card key={id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-sm", colorDotClass(category.color))} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {category.parentCategoryId ? `— ${category.name}` : category.name}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(["month", "year"] as const).map((key) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-muted-foreground">
                      {key === "month" ? "חודשי" : "שנתי"}
                    </span>
                    <Input
                      inputMode="decimal"
                      dir="ltr"
                      placeholder="0"
                      aria-label={`סכום ${key === "month" ? "חודשי" : "שנתי"} עבור ${category.name}`}
                      value={f[key]}
                      onChange={(e) => editField(id, key, e.target.value)}
                      className="h-9 bg-muted text-center font-extrabold tabular-nums"
                    />
                  </label>
                ))}
              </div>

              {hasHistory ? (
                <div className="border-t border-border pt-2">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenHistory((p) => ({ ...p, [id]: !open }))}
                    className="flex w-full items-center justify-between text-[11px] font-bold text-muted-foreground hover:text-foreground"
                  >
                    תקציב שנה קודמת
                    <Icon
                      icon={ChevronDown}
                      className={cn("size-3.5 transition-transform", open && "rotate-180")}
                      strokeWidth={2.2}
                    />
                  </button>
                  {open ? (
                    <div className="mt-2 flex flex-col gap-1.5 text-[11px] font-medium text-muted-foreground">
                      {showPlanned ? (
                        <button
                          type="button"
                          disabled={planned === null}
                          onClick={() => planned !== null && applyLastYear(planned)}
                          title="שימוש בסכום שתוכנן אשתקד"
                          className="flex justify-between text-start enabled:hover:text-foreground enabled:hover:underline"
                        >
                          <span>תוכנן</span>
                          <span dir="ltr">{fmt(planned)}</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={actual === null}
                        onClick={() => actual !== null && applyLastYear(actual)}
                        title="שימוש בסכום שהוצא בפועל אשתקד"
                        className="flex justify-between text-start enabled:hover:text-foreground enabled:hover:underline"
                      >
                        <span>בפועל</span>
                        <span dir="ltr">{fmt(actual)}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
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
