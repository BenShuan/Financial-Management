import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";

export function HouseholdPage() {
  return (
    <>
      <PageHeader title="משק בית" />
      <EmptyState
        icon={Users}
        title="בקרוב"
        description="ניהול חברים והרשאות, קטגוריות ותגיות, מטבע ואזור זמן — יגיעו בשלב הבא."
      />
    </>
  );
}
