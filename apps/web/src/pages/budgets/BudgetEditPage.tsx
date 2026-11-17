import { Target } from "lucide-react";
import { useParams } from "react-router-dom";
import { useBudgetPeriods } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { BudgetNewPage } from "./BudgetNewPage";

/** Loads the period, then reuses the plan form in edit mode. */
export function BudgetEditPage() {
  const { budgetPeriodId } = useParams<{ budgetPeriodId: string }>();
  const periods = useBudgetPeriods();

  if (periods.isPending) {
    return (
      <>
        <PageHeader title="עריכת תוכנית" backTo="/budgets" />
        <p className="text-sm font-semibold text-muted-foreground">טוען…</p>
      </>
    );
  }
  const period = periods.data?.find((p) => p.budgetPeriodId === budgetPeriodId);
  if (!period) {
    return (
      <>
        <PageHeader title="עריכת תוכנית" backTo="/budgets" />
        <EmptyState icon={Target} title="התוכנית לא נמצאה" />
      </>
    );
  }
  if (period.status === "closed") {
    return (
      <>
        <PageHeader title="עריכת תוכנית" backTo="/budgets" />
        <EmptyState icon={Target} title="תוכנית סגורה אינה ניתנת לעריכה" />
      </>
    );
  }
  return <BudgetNewPage key={period.budgetPeriodId} period={period} />;
}
