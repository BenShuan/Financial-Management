import { Check, Copy, Link2, Trash2, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  HOUSEHOLD_ROLES,
  type HouseholdMember,
  type HouseholdRole,
  type InviteMemberResult,
} from "@financial-management/shared";
import {
  useHouseholdMembers,
  useInviteMember,
  useRemoveMember,
  useSession,
  useUpdateMemberRole,
} from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/labels";

// UI mirror of the server's authorization (display only — the API enforces it).
const RANK: Record<HouseholdRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

const selectClass =
  "h-9 rounded-control border border-input bg-card px-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const inviteLink = (token: string) =>
  `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("he-IL");

export function HouseholdPage() {
  const session = useSession();
  const members = useHouseholdMembers();
  const myRole = session.data?.role;
  const canManage = myRole === "owner" || myRole === "admin";
  const [issued, setIssued] = useState<InviteMemberResult | null>(null);

  return (
    <>
      <PageHeader title="משק בית" subtitle={session.data?.household.name} />

      {members.isPending ? (
        <p className="text-sm font-semibold text-muted-foreground">טוען…</p>
      ) : members.isError || !members.data ? (
        <EmptyState icon={Users} title="לא ניתן לטעון חברים" description="בדקו שהשרת פועל ונסו שוב." />
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              חברים
            </h2>
            <ListCard>
              {members.data.map((member) => (
                <MemberRow
                  key={member.householdMemberId}
                  member={member}
                  myRole={myRole}
                  myUserId={session.data?.user.userId}
                  onReinvited={setIssued}
                />
              ))}
            </ListCard>
          </section>

          {issued ? <InviteLinkCard result={issued} onDismiss={() => setIssued(null)} /> : null}
          {canManage && myRole ? <InviteForm myRole={myRole} onInvited={setIssued} /> : null}

          <section>
            <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              הרשאות
            </h2>
            <ListCard>
              {[...HOUSEHOLD_ROLES].reverse().map((role) => (
                <ListRow key={role}>
                  <span className="w-16 shrink-0 text-sm font-bold">{ROLE_LABELS[role]}</span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {ROLE_DESCRIPTIONS[role]}
                  </span>
                </ListRow>
              ))}
            </ListCard>
          </section>
        </div>
      )}
    </>
  );
}

function MemberRow({
  member,
  myRole,
  myUserId,
  onReinvited,
}: {
  member: HouseholdMember;
  myRole: HouseholdRole | undefined;
  myUserId: string | undefined;
  onReinvited: (result: InviteMemberResult) => void;
}) {
  const updateRole = useUpdateMemberRole();
  const remove = useRemoveMember();
  const reinvite = useInviteMember();
  const isSelf = member.userId === myUserId;
  const isInvited = member.status === "invited";
  const manageable =
    !isSelf &&
    (myRole === "owner" || (myRole === "admin" && RANK[member.role] < RANK.admin));
  const assignable = HOUSEHOLD_ROLES.filter(
    (role) => myRole === "owner" || (myRole && RANK[role] <= RANK[myRole]),
  );
  const error = updateRole.error ?? remove.error ?? reinvite.error;

  return (
    <ListRow className="flex-wrap">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-extrabold text-primary-strong">
        {member.displayName.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {member.displayName}
          {isSelf ? <span className="ms-2 text-xs font-semibold text-muted-foreground">(אתם)</span> : null}
        </p>
        <p dir="ltr" className="truncate text-start text-xs font-medium text-muted-foreground">
          {member.email}
        </p>
        {isInvited ? (
          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
            ממתין לאישור
            {member.inviteExpiresAt ? ` · הקישור בתוקף עד ${formatDate(member.inviteExpiresAt)}` : ""}
          </p>
        ) : null}
      </div>

      {manageable ? (
        <select
          aria-label={`תפקיד של ${member.displayName}`}
          className={selectClass}
          value={member.role}
          disabled={updateRole.isPending}
          onChange={(e) =>
            updateRole.mutate({ memberId: member.householdMemberId, role: e.target.value as HouseholdRole })
          }
        >
          {assignable.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      ) : (
        <Chip variant={member.role === "owner" ? "primary" : "neutral"}>{ROLE_LABELS[member.role]}</Chip>
      )}
      {isInvited ? <Chip variant="outline">הוזמן</Chip> : null}

      {manageable && isInvited ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={reinvite.isPending}
          onClick={() =>
            reinvite.mutate(
              { email: member.email, displayName: member.displayName, role: member.role },
              { onSuccess: onReinvited },
            )
          }
        >
          <Icon icon={Link2} className="size-4" />
          קישור חדש
        </Button>
      ) : null}
      {manageable ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={isInvited ? `ביטול ההזמנה של ${member.displayName}` : `הסרת ${member.displayName}`}
          disabled={remove.isPending}
          onClick={() => {
            const question = isInvited
              ? `לבטל את ההזמנה של ${member.displayName}?`
              : `להסיר את ${member.displayName} ממשק הבית? הגישה שלו/ה תיפסק מיד.`;
            if (window.confirm(question)) remove.mutate(member.householdMemberId);
          }}
        >
          <Icon icon={Trash2} className="size-4 text-negative" />
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="basis-full text-sm font-semibold text-destructive">
          {error.message}
        </p>
      ) : null}
    </ListRow>
  );
}

function InviteForm({
  myRole,
  onInvited,
}: {
  myRole: HouseholdRole;
  onInvited: (result: InviteMemberResult) => void;
}) {
  const invite = useInviteMember();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<HouseholdRole>("member");
  const assignable = HOUSEHOLD_ROLES.filter((r) => myRole === "owner" || RANK[r] <= RANK[myRole]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    invite.mutate(
      { email, displayName, role },
      {
        onSuccess: (result) => {
          onInvited(result);
          setEmail("");
          setDisplayName("");
        },
      },
    );
  }

  return (
    <section>
      <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        הזמנת חבר
      </h2>
      <form onSubmit={onSubmit} className="space-y-4 rounded-card border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="invite-name">שם</Label>
            <Input
              id="invite-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">אימייל</Label>
            <Input
              id="invite-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">תפקיד</Label>
          <div>
            <select
              id="invite-role"
              className={selectClass}
              value={role}
              onChange={(e) => setRole(e.target.value as HouseholdRole)}
            >
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {invite.error ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {invite.error.message}
          </p>
        ) : null}
        <Button type="submit" disabled={invite.isPending}>
          <Icon icon={UserPlus} className="size-4" />
          {invite.isPending ? "רגע..." : "יצירת קישור הזמנה"}
        </Button>
        <p className="text-xs font-medium text-muted-foreground">
          הקישור נשלח על ידכם (למשל בוואטסאפ). הוא תקף שבוע ומיועד לשימוש חד-פעמי.
        </p>
      </form>
    </section>
  );
}

function InviteLinkCard({
  result,
  onDismiss,
}: {
  result: InviteMemberResult;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(result.inviteToken);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link stays selectable in the field below.
    }
  }

  return (
    <section className="space-y-3 rounded-card border border-primary/30 bg-primary-soft p-4">
      <p className="text-sm font-bold text-primary-strong">
        הקישור ל{result.member.displayName} מוכן — הוא מוצג רק כעת
      </p>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          dir="ltr"
          value={link}
          aria-label="קישור הזמנה"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button type="button" variant="outline" onClick={copy}>
          <Icon icon={copied ? Check : Copy} className="size-4" />
          {copied ? "הועתק" : "העתקה"}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          בתוקף עד {formatDate(result.inviteExpiresAt)}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          סגירה
        </Button>
      </div>
    </section>
  );
}
