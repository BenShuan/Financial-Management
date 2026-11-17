import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fromMinorUnits,
  sumMoney,
  toMinorUnits,
  type BudgetPeriod,
} from "@financial-management/shared";
import {
  useBudgetCategoryHistory,
  useBudgetPeriods,
  useCategories,
  useCreateBudgetPeriod,
  useSession,
  useUpdateBudgetPeriod,
} from "@/api/hooks";
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

/** Create a new annual plan, or edit `period` when given (year is fixed in edit mode). */
export function BudgetNewPage({ period }: { period?: BudgetPeriod } = {}) {
  const navigate = useNavigate();
  const session = useSession();
  const categories = useCategories();
  const periods = useBudgetPeriods();
  const createPeriodMutation = useCreateBudgetPeriod();
  const updatePeriod = useUpdateBudgetPeriod();
  const isEdit = Boolean(period);
  const saveMutation = isEdit ? updatePeriod : createPeriodMutation;
  const currency = session.data?.household.baseCurrency;

  const latestYear = periods.data?.[0]?.year;
  const [year, setYear] = useState(() =>
    period ? period.year : latestYear ? latestYear + 1 : new Date().getFullYear(),
  );
  const [rollover, setRollover] = useState(period?.rolloverEnabled ?? false);
  const [fields, setFields] = useState<Record<string, Fields>>(() =>
    Object.fromEntries(
      (period?.lines ?? []).map((l) => [
        l.categoryId,
        { year: tidy(l.plannedAmount), month: monthFromYear(tidy(l.plannedAmount)) },
      ]),
    ),
  );
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});

  const expenseCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.isActive && c.kind === "expense"),
    [categories.data],
  );
  const incomeCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.isActive && c.kind === "income"),
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
  const incomeIds = new Set(incomeCategories.map((c) => c.categoryId));
  const toMoney = (v: string) => Number(v).toFixed(2);
  const incomeAnnual = sumMoney(
    filledLines.filter(([id]) => incomeIds.has(id)).map(([, v]) => toMoney(v)),
  );
  const expenseAnnual = sumMoney(
    filledLines.filter(([id]) => !incomeIds.has(id)).map(([, v]) => toMoney(v)),
  );
  const profitAnnual = fromMinorUnits(toMinorUnits(incomeAnnual) - toMinorUnits(expenseAnnual));
  const monthlyOf = (annual: string) => fromMinorUnits(toMinorUnits(annual) / 12n);

  const onSubmit = async () => {
    const lines = filledLines.map(([categoryId, plannedAmount]) => ({
      categoryId,
      plannedAmount: Number(plannedAmount).toFixed(2),
    }));
    if (period) {
      await updatePeriod.mutateAsync({
        budgetPeriodId: period.budgetPeriodId,
        rolloverEnabled: rollover,
        lines,
      });
    } else {
      await createPeriodMutation.mutateAsync({ year, rolloverEnabled: rollover, lines });
    }
    navigate("/budgets");
  };

  const renderCategory = (category: (typeof expenseCategories)[number]) => {
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
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={isEdit ? `עריכת תוכנית — ${year}` : `תוכנית חדשה — ${year}`}
        backTo="/budgets"
        actions={
          <Button
            onClick={onSubmit}
            disabled={saveMutation.isPending || filledLines.length === 0}
          >
            {saveMutation.isPending ? "שומר…" : "שמירה"}
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
          disabled={isEdit}
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

      {incomeCategories.length > 0 ? (
        <>
          <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            הכנסות מתוכננות
          </h2>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {incomeCategories.map(renderCategory)}
          </div>
        </>
      ) : null}

      <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        הוצאות מתוכננות
      </h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {expenseCategories.map(renderCategory)}
      </div>

      <Card className="mb-6 flex flex-col gap-2 p-4">
        <p className="text-sm font-bold">סיכום התוכנית — {year}</p>
        {(
          [
            { label: "הכנסות מתוכננות", annual: incomeAnnual, tone: "text-positive" },
            { label: "הוצאות מתוכננות", annual: expenseAnnual, tone: "text-negative" },
          ] as const
        ).map((row) => (
          <div key={row.label} className="flex items-center justify-between text-sm">
            <span className="font-semibold text-muted-foreground">{row.label}</span>
            <span className={cn("font-extrabold tabular-nums", row.tone)} dir="ltr">
              {formatCurrencyWhole(row.annual, { currency })} / שנה
              <span className="ms-2 text-[11px] font-semibold text-muted-foreground">
                ≈ {formatCurrencyWhole(monthlyOf(row.annual), { currency })} / חודש
              </span>
            </span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between rounded-card bg-primary-soft p-3">
          <p className="text-sm font-bold text-primary-strong">רווח צפוי</p>
          <p
            className={cn(
              "text-lg font-extrabold tabular-nums",
              toMinorUnits(profitAnnual) < 0n ? "text-negative" : "text-positive",
            )}
            dir="ltr"
          >
            {formatCurrencyWhole(profitAnnual, { currency })} / שנה
            <span className="ms-2 text-[11px] font-semibold text-primary-strong/80">
              ≈ {formatCurrencyWhole(monthlyOf(profitAnnual), { currency })} / חודש
            </span>
          </p>
        </div>
      </Card>

      {saveMutation.isError ? (
        <p className="mb-4 text-center text-sm font-bold text-negative" role="alert">
          {saveMutation.error instanceof Error ? saveMutation.error.message : "השמירה נכשלה"}
        </p>
      ) : null}

      <Button
        onClick={onSubmit}
        size="lg"
        className="w-full"
        disabled={saveMutation.isPending || filledLines.length === 0}
      >
        {saveMutation.isPending ? "שומר…" : "שמירת התוכנית"}
      </Button>
    </div>
  );
}
