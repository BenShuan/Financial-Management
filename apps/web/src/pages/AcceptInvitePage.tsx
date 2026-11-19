import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  acceptInviteInputSchema,
  inviteInfoSchema,
  sessionContextSchema,
  type SessionContext,
} from "@financial-management/shared";
import { apiFetch } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Landing page of an invite link (`/accept-invite?token=...`): the invitee picks a password,
 * joins the household and is signed in. Public — the one-time token is the credential.
 */
export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const info = useQuery({
    queryKey: ["invite-info", token],
    queryFn: () =>
      apiFetch("/api/auth/invite-info", inviteInfoSchema, { method: "POST", body: { token } }),
    enabled: token.length > 0,
    retry: false,
  });
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (password !== confirm) {
      setError("הסיסמאות אינן זהות");
      return;
    }
    const parsed = acceptInviteInputSchema.safeParse({
      token,
      password,
      displayName: (displayName ?? info.data?.displayName ?? "").trim() || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "פרטים לא תקינים");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ctx = await apiFetch<SessionContext>("/api/auth/accept-invite", sessionContextSchema, {
        method: "POST",
        body: parsed.data,
      });
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      queryClient.setQueryData(["me"], ctx);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעולה נכשלה");
    } finally {
      setSubmitting(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">{children}</div>
  );

  if (!token || info.isError) {
    return shell(
      <div className="w-full max-w-sm space-y-3 rounded-card border border-border bg-card p-6 text-center">
        <h1 className="text-lg font-bold">הקישור אינו תקף</h1>
        <p className="text-sm text-muted-foreground">
          הקישור פג תוקף, בוטל או כבר נוצל. בקשו ממנהל משק הבית קישור חדש.
        </p>
        <Button className="w-full" onClick={() => navigate("/", { replace: true })}>
          למסך הכניסה
        </Button>
      </div>,
    );
  }
  if (info.isPending) return shell(<p className="text-sm text-muted-foreground">טוען…</p>);

  return shell(
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-card border border-border bg-card p-6 shadow-sm"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
          <UserPlus className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-bold">הצטרפות למשק הבית {info.data.householdName}</h1>
        <p className="text-sm text-muted-foreground">
          בחרו סיסמה כדי להשלים את ההצטרפות עם{" "}
          <span dir="ltr" className="font-semibold">
            {info.data.email}
          </span>
          .
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-display-name">שם</Label>
        <Input
          id="invite-display-name"
          autoComplete="name"
          value={displayName ?? info.data.displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-password">סיסמה</Label>
        <Input
          id="invite-password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-confirm">אימות סיסמה</Label>
        <Input
          id="invite-confirm"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "רגע..." : "הצטרפות"}
      </Button>
    </form>,
  );
}
