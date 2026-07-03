import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { useParams } from "react-router-dom";
import { useReconciliation, useReconciliationAction, useSession } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { AmountText } from "@/components/ui/amount-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { formatCurrency, formatDateFull } from "@/lib/money";
import { cn } from "@/lib/utils";

export function ReconciliationPage() {
  const { reconciliationId } = useParams<{ reconciliationId: string }>();
  const session = useSession();
  const detail = useReconciliation(reconciliationId);
  const action = useReconciliationAction(reconciliationId ?? "");
  const currency = session.data?.household.baseCurrency;

  if (detail.isPending) {
    return (
      <>
        <PageHeader title="התאמת חשבון" backTo="/import" />
        <p className="text-sm font-semibold text-muted-foreground">טוען…</p>
      </>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <>
        <PageHeader title="התאמת חשבון" backTo="/import" />
        <EmptyState icon={Scale} title="הסשן לא נמצא" />
      </>
    );
  }

  const { session: recon, cleared } = detail.data;
  const balanced = recon.status === "matched" || recon.status === "resolved";

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="התאמת חשבון"
        backTo="/import"
        subtitle={
          <span dir="ltr" className="tabular-nums">
            {formatDateFull(`${recon.periodStart}T00:00:00`)} – {formatDateFull(`${recon.periodEnd}T00:00:00`)}
          </span>
        }
      />

      <div className="mb-3 flex gap-2.5">
        <Card className="flex-1 p-4">
          <p className="text-xs font-bold text-muted-foreground">יתרת דף החשבון</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums" dir="ltr">
            {formatCurrency(recon.statementEndingBalance, { currency })}
          </p>
        </Card>
        <Card className="flex-1 p-4">
          <p className="text-xs font-bold text-muted-foreground">מחושב מהיומן</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums" dir="ltr">
            {formatCurrency(recon.calculatedEndingBalance, { currency })}
          </p>
        </Card>
      </div>

      <div
        className={cn(
          "mb-5 flex items-center gap-3 rounded-card p-4",
          balanced ? "bg-positive-soft" : recon.status === "closed" ? "bg-muted" : "bg-negative/10",
        )}
      >
        <Icon
          icon={balanced || recon.status === "closed" ? CheckCircle2 : AlertTriangle}
          className={cn(
            "size-5",
            balanced ? "text-positive" : recon.status === "closed" ? "text-muted-foreground" : "text-negative",
          )}
          strokeWidth={2}
        />
        <div className="flex-1">
          <p
            className={cn(
              "text-sm font-extrabold",
              balanced ? "text-positive" : recon.status === "closed" ? "text-foreground" : "text-negative",
            )}
          >
            {recon.status === "matched" && "תואם"}
            {recon.status === "resolved" && "נפתר"}
            {recon.status === "mismatch" && "אי-התאמה"}
            {recon.status === "open" && "פתוח"}
            {recon.status === "closed" && "סגור"}
          </p>
          <p className="text-xs font-semibold text-muted-foreground">
            {balanced
              ? "היתרות מתאימות — אפשר לסגור את הסשן"
              : recon.status === "mismatch"
                ? "תקנו או הוסיפו תנועות ביומן, ואז חשבו מחדש"
                : recon.status === "closed"
                  ? "הסשן נסגר ותועדה יתרת סיום"
                  : "בודקים מול דף החשבון"}
          </p>
        </div>
      </div>

      {recon.status !== "closed" ? (
        <div className="mb-5 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => action.mutate("recalculate")}
            disabled={action.isPending}
          >
            חישוב מחדש
          </Button>
          {recon.status === "mismatch" ? (
            <Button
              variant="soft"
              className="flex-1"
              onClick={() => action.mutate("resolve")}
              disabled={action.isPending}
            >
              סימון כנפתר
            </Button>
          ) : null}
          <Button
            className="flex-1"
            onClick={() => action.mutate("close")}
            disabled={!balanced || action.isPending}
          >
            סגירת הסשן
          </Button>
        </div>
      ) : null}

      {action.isError ? (
        <p className="mb-4 text-center text-sm font-bold text-negative" role="alert">
          {action.error instanceof Error ? action.error.message : "הפעולה נכשלה"}
        </p>
      ) : null}

      <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        תנועות שנוקו ({cleared.length})
      </h2>
      {cleared.length === 0 ? (
        <Card className="p-5 text-sm font-semibold text-muted-foreground">
          אין תנועות שנוקו בטווח התאריכים.
        </Card>
      ) : (
        <ListCard>
          {cleared.map((txn) => (
            <ListRow key={txn.transactionId}>
              <Icon icon={CheckCircle2} className="size-4 shrink-0 text-positive" strokeWidth={2} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{txn.description}</span>
              </span>
              <AmountText
                amount={txn.amount}
                flow={txn.type === "transfer" ? "neutral" : txn.type}
                currency={currency}
                className="text-sm"
              />
            </ListRow>
          ))}
        </ListCard>
      )}
    </div>
  );
}
