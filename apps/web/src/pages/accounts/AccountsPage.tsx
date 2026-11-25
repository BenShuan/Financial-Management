import { ArchiveRestore, ChevronLeft, Pencil, Plus, Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Account, AccountType } from "@financial-management/shared";
import { useAccounts, useSession, useUpdateAccount } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { AmountText } from "@/components/ui/amount-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { formatCurrency } from "@/lib/money";
import { ACCOUNT_TYPE_COLORS, ACCOUNT_TYPE_LABELS } from "@/lib/labels";
import { sumMoney } from "@financial-management/shared";
import { cn } from "@/lib/utils";
import { AccountFormDialog } from "./AccountFormDialog";

const TYPE_ORDER: AccountType[] = ["checking", "savings", "cash", "credit", "other"];

export function AccountsPage() {
  const session = useSession();
  const accounts = useAccounts();
  const currency = session.data?.household.baseCurrency;
  // UI-only gate (mirrors MembersTab); the API enforces requireRole("admin") on every write.
  const role = session.data?.role;
  const canManage = role === "owner" || role === "admin";
  const [dialog, setDialog] = useState<{ open: boolean; account?: Account }>({ open: false });
  const openCreate = () => setDialog({ open: true });
  const openEdit = (account: Account) => setDialog({ open: true, account });

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
  const archived = canManage ? accounts.data.filter((a) => !a.isActive) : [];

  const createButton = canManage ? (
    <Button size="sm" onClick={openCreate}>
      <Icon icon={Plus} strokeWidth={2} />
      חשבון חדש
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="חשבונות"
        subtitle={<>יתרה כוללת <span dir="ltr" className="tabular-nums">{formatCurrency(total, { currency })}</span></>}
        actions={createButton}
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="אין עדיין חשבונות"
          description="הוסיפו חשבון ראשון כדי להתחיל לנהל את הכספים."
          action={createButton}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.type}>
              <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {ACCOUNT_TYPE_LABELS[group.type]}
              </h2>
              <ListCard>
                {group.items.map((account) => (
                  <AccountRow
                    key={account.accountId}
                    account={account}
                    currency={currency}
                    onEdit={canManage ? () => openEdit(account) : undefined}
                  />
                ))}
              </ListCard>
            </section>
          ))}
        </div>
      )}
      {archived.length > 0 ? (
        <ArchivedAccounts accounts={archived} currency={currency} onEdit={openEdit} />
      ) : null}
      {canManage ? (
        <AccountFormDialog
          open={dialog.open}
          account={dialog.account}
          onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        />
      ) : null}
    </>
  );
}

function AccountRow({
  account,
  currency,
  onEdit,
}: {
  account: Account;
  currency?: string;
  onEdit?: () => void;
}) {
  const negative = account.currentBalance.startsWith("-");
  // The wrapper stays the ListCard's direct child (keeps separators); the edit button sits outside the link.
  return (
    <div className="flex items-center">
      <ListRow as={Link} to={`/accounts/${account.accountId}`} className="min-w-0 flex-1">
        <span className={cn("size-9 shrink-0 rounded-[11px]", ACCOUNT_TYPE_COLORS[account.type])} />
        <AccountLabel account={account} />
        <AmountText
          amount={account.currentBalance.replace(/^-/, "")}
          flow={negative ? "expense" : "neutral"}
          currency={currency}
          className="text-[15px]"
        />
        <Icon icon={ChevronLeft} className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
      </ListRow>
      {onEdit ? (
        <Button
          variant="ghost"
          size="icon"
          className="me-2 shrink-0"
          aria-label={`עריכת ${account.name}`}
          onClick={onEdit}
        >
          <Icon icon={Pencil} />
        </Button>
      ) : null}
    </div>
  );
}

function AccountLabel({ account, muted }: { account: Account; muted?: boolean }) {
  return (
    <span className="min-w-0 flex-1">
      <span className={cn("block truncate text-sm font-bold", muted && "text-muted-foreground")}>
        {account.name}
      </span>
      {account.institutionName || account.accountMask ? (
        <span className="block text-xs font-medium text-muted-foreground" dir="rtl">
          {account.institutionName}
          {account.institutionName && account.accountMask ? " · " : ""}
          {account.accountMask ? `•• ${account.accountMask}` : ""}
        </span>
      ) : null}
    </span>
  );
}

/** Admin-only, collapsed by default. Archived balances are muted and excluded from the total. */
function ArchivedAccounts({
  accounts,
  currency,
  onEdit,
}: {
  accounts: Account[];
  currency?: string;
  onEdit: (account: Account) => void;
}) {
  const restore = useUpdateAccount();
  const failedId = restore.isError ? restore.variables?.accountId : undefined;

  return (
    <details className="group mt-6">
      <summary className="mb-2 ms-1 flex cursor-pointer list-none items-center gap-2 rounded-control text-xs font-bold uppercase tracking-wide text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {/* Points to reading-end in RTL when closed; turns down when open. */}
        <Icon
          icon={ChevronLeft}
          className="size-4 shrink-0 transition-transform duration-300 group-open:-rotate-90"
          strokeWidth={2}
        />
        חשבונות בארכיון ({accounts.length})
      </summary>
      <ListCard>
        {accounts.map((account) => {
          const negative = account.currentBalance.startsWith("-");
          const restoring = restore.isPending && restore.variables?.accountId === account.accountId;
          return (
            <div key={account.accountId}>
              <div className="flex items-center">
                <ListRow className="min-w-0 flex-1">
                  <span
                    className={cn("size-9 shrink-0 rounded-[11px] opacity-50", ACCOUNT_TYPE_COLORS[account.type])}
                  />
                  <AccountLabel account={account} muted />
                  <AmountText
                    amount={account.currentBalance.replace(/^-/, "")}
                    flow={negative ? "expense" : "neutral"}
                    currency={currency}
                    className="text-[15px] opacity-60"
                  />
                </ListRow>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={`עריכת ${account.name}`}
                  onClick={() => onEdit(account)}
                >
                  <Icon icon={Pencil} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="me-2 shrink-0"
                  aria-label={`שחזור ${account.name}`}
                  title="שחזור"
                  disabled={restoring}
                  onClick={() => restore.mutate({ accountId: account.accountId, isActive: true })}
                >
                  <Icon icon={ArchiveRestore} />
                </Button>
              </div>
              {failedId === account.accountId ? (
                <p className="px-4 pb-3 text-xs font-bold text-negative" role="alert">
                  {restore.error?.message}
                </p>
              ) : null}
            </div>
          );
        })}
      </ListCard>
    </details>
  );
}
