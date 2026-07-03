import { useEffect, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { checkAccess, getAccessKey, setAccessKey } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type GateStatus = "checking" | "granted" | "denied";

/**
 * Deployment gate until real auth lands: when the API is protected by
 * ACCESS_SECRET, asks for the access key once and keeps it in localStorage.
 * Renders the app immediately when the API is open (local dev).
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GateStatus>("checking");
  const [key, setKey] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void checkAccess(getAccessKey()).then((ok) => {
      setStatus(ok ? "granted" : "denied");
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(false);
    const ok = await checkAccess(trimmed);
    if (ok) {
      setAccessKey(trimmed);
      setStatus("granted");
    } else {
      setError(true);
    }
    setSubmitting(false);
  }

  if (status === "granted") return <>{children}</>;
  if (status === "checking") return null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-card border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold text-foreground">נדרש קוד גישה</h1>
          <p className="text-sm text-muted-foreground">
            האפליקציה מוגנת. יש להזין את קוד הגישה כדי להמשיך.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="access-key">קוד גישה</Label>
          <Input
            id="access-key"
            type="password"
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="הזינו קוד גישה"
          />
          {error ? (
            <p className="text-sm text-destructive">קוד הגישה שגוי, נסו שוב.</p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={!key.trim() || submitting}>
          {submitting ? "בודק..." : "כניסה"}
        </Button>
      </form>
    </div>
  );
}
