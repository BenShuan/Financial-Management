import { Link2, RefreshCw } from "lucide-react";
import { useState } from "react";
import {
  BANK_SYNC_PROVIDER_KINDS,
  BANK_SYNC_PROVIDER_LABELS,
  accountNumberLast4,
  type Account,
  type AccountType,
  type SyncAccountLink,
  type SyncAccountLinkStatus,
} from "@financial-management/shared";
import {
  useAccounts,
  useSession,
  useSyncAccountLinks,
  useUpdateSyncAccountLink,
} from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Chip, type ChipProps } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";
import { formatDateFull } from "@/lib/money";

const STATUS_LABELS: Record<SyncAccountLinkStatus, string> = {
  unmapped: "לא משויך",
  linked: "משויך",
  ignored: "מוסתר",
};

const STATUS_VARIANTS: Record<SyncAccountLinkStatus, ChipProps["variant"]> = {
  unmapped: "negative",
  linked: "positive",
  ignored: "outline",
};

/** Account types listed first in the picker, per provider kind (ordering only). */
const PREFERRED_TYPES: Record<"bank" | "card", AccountType[]> = {
  bank: ["checking", "savings"],
  card: ["credit"],
};

const selectClass =
  "h-9 min-w-0 flex-1 rounded-control border border-input bg-card px-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const maskNumber = (accountNumber: string) => `••••${accountNumberLast4(accountNumber)}`;

function sortAccountsFor(link: SyncAccountLink, accounts: Account[]): Account[] {
  const preferred = PREFERRED_TYPES[BANK_SYNC_PROVIDER_KINDS[link.provider]];
  const rank = (a: Account) => (preferred.includes(a.type) ? 0 : 1);
  return [...accounts].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "he"));
}

export function SyncPage() {
  const session = useSession();
  const links = useSyncAccountLinks();
  const accounts = useAccounts();
  const role = session.data?.role;
  // UI mirror of the server's authorization (display only — the API enforces it).
  const canEdit = role === "admin" || role === "owner";
  const activeAccounts = (accounts.data ?? []).filter((a) => a.isActive);
  const unmappedCount = links.data?.filter((l) => l.status === "unmapped").length ?? 0;

  return (
    <>
      <PageHeader title="סנכרון בנקים וכרטיסים" backTo="/more" />
      <p className="mb-5 px-1 text-sm font-medium text-muted-foreground">
        הסנכרון רץ באפליקציה המקומית על המחשב שלכם, ופרטי ההתחברות לבנק נשמרים רק שם. אחרי הסנכרון
        הראשון החשבונות שנמצאו יופיעו כאן — שייכו כל אחד לחשבון באפליקציה כדי שהתנועות ייובאו אליו.
      </p>

      {links.isPending ? (
        <p className="text-sm font-semibold text-muted-foreground">טוען…</p>
      ) : links.isError || !links.data ? (
        <EmptyState
          icon={RefreshCw}
          title="לא ניתן לטעון חשבונות מסונכרנים"
          description="בדקו שהשרת פועל ונסו שוב."
        />
      ) : links.data.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="עדיין לא התבצע סנכרון"
          description="הפעילו את אפליקציית הסנכרון המקומית ולחצו על ״סנכרן עכשיו״. החשבונות שיימצאו יופיעו כאן."
        />
      ) : (
        <>
          {unmappedCount > 0 ? (
            <div
              role="status"
              className="mb-4 rounded-card border border-warning/40 bg-warning/15 px-4 py-3 text-sm font-semibold"
            >
              {unmappedCount === 1
                ? "חשבון אחד ממתין לשיוך. "
                : `${unmappedCount} חשבונות ממתינים לשיוך. `}
              תנועות של חשבון לא משויך לא ייובאו; אחרי השיוך הסנכרון הבא יייבא אותן.
            </div>
          ) : null}
          <ListCard>
            {links.data.map((link) => (
              <SyncLinkRow
                key={link.syncAccountLinkId}
                link={link}
                accounts={sortAccountsFor(link, activeAccounts)}
                allAccounts={accounts.data ?? []}
                canEdit={canEdit}
              />
            ))}
          </ListCard>
          {!canEdit ? (
            <p className="mt-3 px-1 text-xs font-medium text-muted-foreground">
              רק מנהלים ובעלים יכולים לשייך או להסתיר חשבונות.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

function SyncLinkRow({
  link,
  accounts,
  allAccounts,
  canEdit,
}: {
  link: SyncAccountLink;
  accounts: Account[];
  allAccounts: Account[];
  canEdit: boolean;
}) {
  const update = useUpdateSyncAccountLink();
  const [selected, setSelected] = useState<string>(link.accountId ?? "");
  const linkedAccount = allAccounts.find((a) => a.accountId === link.accountId);
  const mutate = (input: Parameters<typeof update.mutate>[0]["input"]) =>
    update.mutate({ syncAccountLinkId: link.syncAccountLinkId, input });

  return (
    <ListRow className="flex-col items-stretch gap-2">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary-strong">
          <Icon icon={Link2} className="size-4" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">
            {BANK_SYNC_PROVIDER_LABELS[link.provider]}{" "}
            <span dir="ltr" className="font-semibold text-muted-foreground">
              {maskNumber(link.externalAccountNumber)}
            </span>
          </span>
          <span className="block truncate text-xs font-medium text-muted-foreground">
            {link.status === "linked"
              ? `משויך ל־${linkedAccount?.name ?? "חשבון"}`
              : `נראה לאחרונה ${formatDateFull(link.lastSeenAt)}`}
          </span>
        </span>
        <Chip variant={STATUS_VARIANTS[link.status]}>{STATUS_LABELS[link.status]}</Chip>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          {link.status !== "ignored" ? (
            <>
              <select
                aria-label="חשבון לשיוך"
                className={selectClass}
                value={selected}
                disabled={update.isPending}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">בחרו חשבון…</option>
                {accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={update.isPending || !selected || selected === link.accountId}
                onClick={() => mutate({ status: "linked", accountId: selected })}
              >
                שייך
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={update.isPending}
                onClick={() => mutate({ status: "ignored" })}
              >
                הסתר
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() => mutate({ status: "unmapped" })}
            >
              בטל הסתרה
            </Button>
          )}
        </div>
      ) : null}

      {update.error ? (
        <p role="alert" className="text-xs font-semibold text-negative">
          {update.error.message}
        </p>
      ) : null}
    </ListRow>
  );
}
