import { Repeat } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";

export function RecurringPage() {
  return (
    <>
      <PageHeader title="הוראות קבע" />
      <EmptyState
        icon={Repeat}
        title="בקרוב"
        description="תבניות של הוצאות והכנסות קבועות, מועדים קרובים וזיהוי אוטומטי של תשלומים חוזרים יגיעו בשלב הבא."
      />
    </>
  );
}
