import { CalendarClock, House, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { dashboardSummarySchema } from "@financial-management/shared";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { useSession } from "@/api/hooks";
import { AmountText } from "@/components/ui/amount-text";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { formatCurrency, formatCurrencyWhole, formatDateFull } from "@/lib/money";
import { ACCOUNT_TYPE_COLORS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const summaryType: z.ZodType<z.infer<typeof dashboardSummarySchema>> = dashboardSummarySchema;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "לילה טוב";
  if (hour < 12) return "בוקר טוב";
  if (hour < 18) return "צהריים טובים";
  return "ערב טוב";
}

export function DashboardPage() {
  const session = useSession();
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch("/api/dashboard", summaryType),
  });
  const currency = session.data?.household.baseCurrency;

  if (dashboard.isPending) {
    return <p className="text-sm font-semibold text-muted-foreground">טוען…</p>;
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <EmptyState
        icon={House}
        title="לא ניתן לטעון את לוח הבית"
        description="בדקו שהשרת פועל (pnpm dev בתיקיית apps/api) ונסו שוב."
      />
    );
  }

  const data = dashboard.data;
  const deltaNegative = data.netWorthMonthDelta.startsWith("-");
  const budget = data.monthBudget;
  const spentPct = budget
    ? Math.round((Number(budget.spentMonth) / Math.max(Number(budget.plannedMonthly), 0.01)) * 100)
    : 0;
  const leftover = budget
    ? Number(budget.plannedMonthly) - Number(budget.spentMonth)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">
            {greeting()}, {session.data?.user.displayName ?? ""}
          </p>
          <h1 className="text-xl font-extrabold">{session.data?.household.name ?? "הבית שלנו"}</h1>
        </div>
        <span className="size-10 rounded-control bg-primary" aria-hidden />
      </header>

      {/* Net worth hero */}
      <section
        className="rounded-card bg-gradient-to-br from-primary to-primary-strong p-6 text-primary-foreground shadow-[0_14px_30px] shadow-primary/30"
        aria-label="שווי נקי"
      >
        <p className="text-xs font-bold uppercase tracking-wider opacity-85">שווי נקי</p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums" dir="ltr">
          {formatCurrency(data.netWorth, { currency })}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold opacity-95">
          <Icon icon={deltaNegative ? TrendingDown : TrendingUp} className="size-4" strokeWidth={2.4} />
          <span dir="ltr" className="tabular-nums">
            {formatCurrency(data.netWorthMonthDelta, { currency, signDisplay: "always" })}
          </span>
          החודש
        </p>
      </section>

      {/* Account chips */}
      {data.accounts.length > 0 ? (
        <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0">
          {data.accounts.map((account) => (
            <Link
              key={account.accountId}
              to={`/accounts/${account.accountId}`}
              className="min-w-36 shrink-0 rounded-card border border-border bg-card p-3.5 transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <span className={cn("size-2 rounded-sm", ACCOUNT_TYPE_COLORS[account.type])} />
                {account.name}
              </span>
              <span
                dir="ltr"
                className={cn(
                  "mt-1 block text-base font-extrabold tabular-nums",
                  account.currentBalance.startsWith("-") && "text-negative",
                )}
              >
                {formatCurrencyWhole(account.currentBalance, { currency })}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {/* This month vs budget */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold">החודש</h2>
          {budget ? (
            <span className="text-xs font-bold text-muted-foreground">{spentPct}% נוצל</span>
          ) : null}
        </div>
        {budget ? (
          <div className="flex items-center gap-4">
            <ProgressRing percent={spentPct} />
            <div>
              <p className="text-lg font-extrabold" dir="ltr">
                {formatCurrencyWhole(budget.spentMonth, { currency })}{" "}
                <span className="text-sm font-semibold text-muted-foreground">
                  / {formatCurrencyWhole(budget.plannedMonthly, { currency })}
                </span>
              </p>
              <p
                className={cn(
                  "mt-0.5 text-xs font-bold",
                  leftover >= 0 ? "text-positive" : "text-negative",
                )}
              >
                {leftover >= 0
                  ? `במסלול · נותרו ${formatCurrencyWhole(String(leftover.toFixed(2)), { currency })}`
                  : `חריגה של ${formatCurrencyWhole(String(Math.abs(leftover).toFixed(2)), { currency })}`}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                הסכום החודשי נגזר מהתוכנית השנתית של {budget.year}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-muted-foreground">
              אין תוכנית שנתית פעילה לשנה הנוכחית.
            </p>
            <Link to="/budgets/new" className="shrink-0 text-sm font-bold text-primary hover:text-primary/80">
              יצירת תוכנית
            </Link>
          </div>
        )}
      </Card>

      {/* Upcoming recurring */}
      <section>
        <h2 className="mb-2 ms-1 text-sm font-extrabold">בקרוב</h2>
        {data.upcoming.length === 0 ? (
          <Card className="p-5 text-sm font-semibold text-muted-foreground">
            אין חיובים קרובים.
          </Card>
        ) : (
          <ListCard>
            {data.upcoming.map((item) => (
              <ListRow key={item.occurrenceId}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary-strong">
                  <Icon icon={CalendarClock} className="size-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{item.templateName}</span>
                  <span className="block text-xs font-medium text-muted-foreground">
                    לתשלום {formatDateFull(`${item.dueDate}T00:00:00`)}
                  </span>
                </span>
                <AmountText amount={item.expectedAmount} currency={currency} className="text-sm" />
              </ListRow>
            ))}
          </ListCard>
        )}
      </section>
    </div>
  );
}
