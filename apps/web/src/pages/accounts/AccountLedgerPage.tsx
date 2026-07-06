import { Search, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { Category, Transaction } from "@financial-management/shared";
import { useAccount, useCategories, useSession, useTransactions } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { AmountText } from "@/components/ui/amount-text";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { colorDotClass } from "@/lib/labels";
import { dateGroupLabel, formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";

export function AccountLedgerPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const session = useSession();
  const account = useAccount(accountId);
  const categories = useCategories();
  const [search, setSearch] = useState("");
  const transactions = useTransactions({ accountId, search: search || undefined, limit: 100 });
  const currency = session.data?.household.baseCurrency;

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories.data ?? []) map.set(cat.categoryId, cat);
    return map;
  }, [categories.data]);

  const groups = useMemo(() => {
    const byDate = new Map<string, Transaction[]>();
    for (const txn of transactions.data ?? []) {
      const list = byDate.get(txn.transactionDate) ?? [];
      list.push(txn);
      byDate.set(txn.transactionDate, list);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [transactions.data]);

  return (
    <>
      <PageHeader
        title={account.data?.name ?? "חשבון"}
        backTo="/accounts"
        subtitle={
          account.data ? (
            <>
              יתרה{" "}
              <span dir="ltr" className="tabular-nums">
                {formatCurrency(account.data.currentBalance, { currency })}
              </span>
            </>
          ) : undefined
        }
      />

      <div className="relative mb-4">
        <Icon
          icon={Search}
          className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש בתנועות"
          className="ps-9"
          aria-label="חיפוש בתנועות"
        />
      </div>

      {transactions.isPending ? (
        <p className="text-sm font-semibold text-muted-foreground">טוען תנועות…</p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={search ? "אין תוצאות" : "אין עדיין תנועות"}
          description={search ? "נסו חיפוש אחר." : "הוסיפו תנועה ראשונה עם כפתור הפלוס."}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([date, txns]) => (
            <section key={date}>
              <h2 className="mb-2 ms-1 text-xs font-bold text-muted-foreground">
                {dateGroupLabel(date)}
              </h2>
              <ListCard>
                {txns.map((txn) => (
                  <TransactionRow
                    key={txn.transactionId}
                    txn={txn}
                    categoryById={categoryById}
                    currency={currency}
                  />
                ))}
              </ListCard>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function TransactionRow({
  txn,
  categoryById,
  currency,
}: {
  txn: Transaction;
  categoryById: Map<string, Category>;
  currency?: string;
}) {
  const category = txn.categoryId ? categoryById.get(txn.categoryId) : undefined;
  const subtitle =
    txn.type === "transfer"
      ? "העברה"
      : txn.splits.length > 0
        ? `${txn.splits.length} פיצולים`
        : (category?.name ?? "ללא קטגוריה");
  const dotColor = txn.type === "transfer" ? "violet" : category?.color;
  return (
    <ListRow>
      <span className={cn("size-8 shrink-0 rounded-[10px]", colorDotClass(dotColor))} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{txn.description}</span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {subtitle}
          {txn.status === "pending" ? (
            <>
              <span className="size-1.5 rounded-full bg-warning" aria-hidden />
              ממתין
            </>
          ) : null}
        </span>
      </span>
      <AmountText
        amount={txn.type === "transfer" && txn.transferDirection === "out" ? `-${txn.amount}` : txn.amount}
        flow={txn.type === "transfer" ? "neutral" : txn.type}
        currency={currency}
        className="text-sm"
      />
    </ListRow>
  );
}
