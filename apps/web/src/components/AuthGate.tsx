import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  loginInputSchema,
  registerInputSchema,
  sessionContextSchema,
  type SessionContext,
} from "@financial-management/shared";
import { ApiError, apiFetch } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AcceptInvitePage } from "@/pages/AcceptInvitePage";

/**
 * Renders the app only for a signed-in user (session cookie validated by GET /api/me);
 * otherwise shows the login / register form. Authorization itself stays on the server.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch("/api/me", sessionContextSchema),
    staleTime: 5 * 60 * 1000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
  });

  // Invite links work signed-out (the token is the credential) and replace any current session.
  if (pathname === "/accept-invite") return <AcceptInvitePage />;
  if (me.isPending) return null;
  if (me.data) return <>{children}</>;
  if (me.error instanceof ApiError && me.error.status === 401) return <AuthForm />;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4 text-center text-sm text-muted-foreground">
      לא ניתן להתחבר לשרת. נסו לרענן את העמוד.
    </div>
  );
}

function AuthForm() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const parsed =
      mode === "login"
        ? loginInputSchema.safeParse({ email, password })
        : registerInputSchema.safeParse({ email, password, displayName, householdName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "פרטים לא תקינים");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ctx = await apiFetch<SessionContext>(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        sessionContextSchema,
        { method: "POST", body: parsed.data },
      );
      // Drop any previous user's cached data, but keep the ["me"] query itself: AuthGate's
      // observer is attached to it, and clear() would orphan that observer so it never re-renders.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      queryClient.setQueryData(["me"], ctx);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעולה נכשלה");
    } finally {
      setSubmitting(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-card border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
            <LogIn className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold text-foreground">
            {isLogin ? "כניסה" : "יצירת חשבון"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLogin ? "התחברו כדי להמשיך למשק הבית." : "פתחו חשבון חדש ומשק בית משלכם."}
          </p>
        </div>

        {!isLogin ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="auth-name">שם</Label>
              <Input
                id="auth-name"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-household">שם משק הבית</Label>
              <Input
                id="auth-household"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
              />
            </div>
          </>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="auth-email">אימייל</Label>
          <Input
            id="auth-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-password">סיסמה</Label>
          <Input
            id="auth-password"
            type="password"
            dir="ltr"
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "רגע..." : isLogin ? "כניסה" : "יצירת חשבון"}
        </Button>
        <button
          type="button"
          className="w-full text-center text-sm text-primary-strong hover:underline"
          onClick={() => {
            setMode(isLogin ? "register" : "login");
            setError(null);
          }}
        >
          {isLogin ? "אין לכם חשבון? הרשמה" : "יש לכם חשבון? כניסה"}
        </button>
      </form>
    </div>
  );
}
