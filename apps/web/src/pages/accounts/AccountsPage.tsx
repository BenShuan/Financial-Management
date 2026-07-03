import { ChevronLeft, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import type { Account, AccountType } from "@financial-management/shared";
import { useAccounts, useSession } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { AmountText } from "@/components/ui/amount-text";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { formatCurrency } from "@/lib/money";
import { ACCOUNT_TYPE_COLORS, ACCOUNT_TYPE_LABELS } from "@/lib/labels";
import { sumMoney } from "@financial-management/shared";
import { cn } from "@/lib/utils";

const TYPE_ORDER: AccountType[] = ["checking", "savings", "cash", "credit", "other"];

export function AccountsPage() {
  const session = useSession();
  const accounts = useAccounts();
  const currency = session.data?.household.baseCurrency;

  if (accounts.isPending) {
    return (
      <>
        <PageHeader title="חשבונות" />
        <p className="text-sm font-semibold text-muted-foreground">טוען…</p>
      </>
    );
  }
  if (accounts.isError || !accounts.data) {
    return (
      <>
        <PageHeader title="חשבונות" />
        <EmptyState icon={Wallet} title="לא ניתן לטעון חשבונות" description="בדקו שהשרת פועל ונסו שוב." />
      </>
    );
  }

  const active = accounts.data.filter((a) => a.isActive);
  const total = sumMoney(active.map((a) => a.currentBalance));
  const groups = TYPE_ORDER.map((type) => ({
    type,
    items: active.filter((a) => a.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="חשבונות"
        subtitle={<>יתרה כוללת <span dir="ltr" className="tabular-nums">{formatCurrency(total, { currency })}</span></>}
      />
      {groups.length === 0 ? (
        <EmptyState icon={Wallet} title="אין עדיין חשבונות" description="הוסיפו חשבון ראשון כדי להתחיל לנהל את הכספים." />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.type}>
              <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {ACCOUNT_TYPE_LABELS[group.type]}
              </h2>
              <ListCard>
                {group.items.map((account) => (
                  <AccountRow key={account.accountId} account={account} currency={currency} />
                ))}
              </ListCard>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function AccountRow({ account, currency }: { account: Account; currency?: string }) {
  const negative = account.currentBalance.startsWith("-");
  return (
    <ListRow as={Link} to={`/accounts/${account.accountId}`}>
      <span className={cn("size-9 shrink-0 rounded-[11px]", ACCOUNT_TYPE_COLORS[account.type])} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{account.name}</span>
        {account.institutionName || account.accountMask ? (
          <span className="block text-xs font-medium text-muted-foreground" dir="rtl">
            {account.institutionName}
            {account.institutionName && account.accountMask ? " · " : ""}
            {account.accountMask ? `•• ${account.accountMask}` : ""}
          </span>
        ) : null}
      </span>
      <AmountText
        amount={account.currentBalance.replace(/^-/, "")}
        flow={negative ? "expense" : "neutral"}
        currency={currency}
        className="text-[15px]"
      />
      <Icon icon={ChevronLeft} className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
    </ListRow>
  );
}
