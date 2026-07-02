import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  noteFormSchema,
  type NoteFormValues,
} from "@financial-management/shared";
import { fetchHealth } from "@/api/health";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function HomePage() {
  const [lastNote, setLastNote] = useState<string | null>(null);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  const form = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: { note: "" },
  });

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">בית</h1>
        <p className="text-muted-foreground text-sm">
          Vite,‏ React 19,‏ React Router,‏ TanStack Query,‏ react-hook-form,
          shadcn/ui.
        </p>
      </header>

      <section className="space-y-2 rounded-card bg-card p-6 text-card-foreground shadow-card">
        <h2 className="font-medium">מצב API</h2>
        {health.isPending ? (
          <p className="text-muted-foreground text-sm">בודק…</p>
        ) : health.isError ? (
          <p className="text-destructive text-sm">
            {health.error instanceof Error
              ? health.error.message
              : "לא ניתן להגיע ל-API. האם השרת פועל?"}
          </p>
        ) : (
          <p className="text-sm">
            <span className="font-mono">{health.data?.service}</span> —{" "}
            <span className="text-muted-foreground">{health.data?.status}</span>
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          כתובת בסיס:{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            {import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8787"}
          </code>
        </p>
      </section>

      <section className="space-y-4 rounded-card bg-card p-6 shadow-card">
        <h2 className="font-medium">טופס לדוגמה (Zod משותף)</h2>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => {
            setLastNote(values.note);
            form.reset();
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="note">הערה</Label>
            <Input
              id="note"
              autoComplete="off"
              placeholder="הערה קצרה"
              {...form.register("note")}
            />
            {form.formState.errors.note ? (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.note.message}
              </p>
            ) : null}
          </div>
          <Button type="submit">שליחה</Button>
          {lastNote ? (
            <p className="text-muted-foreground text-sm" role="status">
              נשלח לאחרונה (בצד הלקוח בלבד):{" "}
              <span className="text-foreground">{lastNote}</span>
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
