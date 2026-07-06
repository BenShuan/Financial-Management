import { CheckCircle2, ChevronLeft, FileUp, Scale, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { importColumnMapSchema, type ImportColumnMap } from "@financial-management/shared";
import {
  useAccounts,
  useCreateImportBatch,
  useCreateReconciliation,
  useImportBatches,
  useImportMappings,
  useReconciliations,
} from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { formatDateFull } from "@/lib/money";
import { cn } from "@/lib/utils";

const BATCH_STATUS_LABELS: Record<string, string> = {
  pending: "ממתין",
  processing: "בסקירה",
  completed: "הוחל",
  failed: "נכשל",
  partially_applied: "הוחל חלקית",
};

const RECON_STATUS_LABELS: Record<string, string> = {
  open: "פתוח",
  matched: "תואם",
  mismatch: "אי-התאמה",
  resolved: "נפתר",
  closed: "סגור",
};

const selectClass =
  "h-10 w-full rounded-control border border-input bg-card px-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ImportPage() {
  const navigate = useNavigate();
  const accounts = useAccounts();
  const batches = useImportBatches();
  const mappings = useImportMappings();
  const reconciliations = useReconciliations();
  const createBatch = useCreateImportBatch();
  const createReconciliation = useCreateReconciliation();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [accountId, setAccountId] = useState("");
  const [mappingId, setMappingId] = useState("");
  const [map, setMap] = useState<ImportColumnMap>({
    date: "",
    description: "",
    amount: "",
    dateFormat: "dd/MM/yyyy",
    negativeIsExpense: true,
  });

  // Reconciliation quick-open form
  const [reconAccountId, setReconAccountId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [statementBalance, setStatementBalance] = useState("");

  const headers = useMemo(() => {
    if (!csvText) return [];
    const firstLine = csvText.split(/\r?\n/)[0] ?? "";
    return firstLine.split(",").map((h) => h.replace(/^"|"$/g, "").trim()).filter(Boolean);
  }, [csvText]);

  const rowCount = useMemo(
    () => (csvText ? Math.max(csvText.trim().split(/\r?\n/).length - 1, 0) : 0),
    [csvText],
  );

  const onFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    // Auto-fill from the default or first saved mapping when headers match
    const candidate = (mappings.data ?? []).find((m) =>
      [m.columnMap.date, m.columnMap.description, m.columnMap.amount].every((col) =>
        text.split(/\r?\n/)[0]?.includes(col),
      ),
    );
    if (candidate) {
      setMappingId(candidate.mappingTemplateId);
      setMap(importColumnMapSchema.parse(candidate.columnMap));
    }
  };

  const mappingComplete = map.date && map.description && map.amount && accountId;

  const startImport = async () => {
    if (!csvText || !mappingComplete) return;
    const batch = await createBatch.mutateAsync({
      accountId,
      fileName: fileName || undefined,
      columnMap: map,
      csvText,
      saveMappingAs: mappingId ? undefined : "מיפוי אחרון",
    });
    navigate(`/transactions?importBatchId=${batch.importBatchId}`);
  };

  const openReconciliation = async () => {
    if (!reconAccountId || !periodStart || !periodEnd || !statementBalance) return;
    const session = await createReconciliation.mutateAsync({
      accountId: reconAccountId,
      periodStart,
      periodEnd,
      statementEndingBalance: Number(statementBalance).toFixed(2),
    });
    navigate(`/reconciliation/${session.reconciliationId}`);
  };

  return (
    <>
      <PageHeader title="ייבוא תנועות" subtitle="קובץ CSV נכנס, יומן מסודר יוצא" />

      <p className="mb-4 text-xs font-bold text-muted-foreground">
        העלאה ומיפוי עמודות · התנועות ייקלטו מיד ללא קטגוריה, והסיווג נעשה במסך התנועות
      </p>

      {/* Upload zone */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="mb-4 w-full rounded-card border-2 border-dashed border-primary/40 bg-primary-soft/40 px-4 py-8 text-center transition-colors hover:bg-primary-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon icon={FileUp} className="mx-auto mb-2 size-8 text-primary" strokeWidth={1.8} />
        {csvText ? (
          <>
            <span className="block text-sm font-bold">{fileName}</span>
            <span className="block text-xs font-semibold text-muted-foreground">
              זוהו {rowCount} שורות · לחצו להחלפת קובץ
            </span>
          </>
        ) : (
          <>
            <span className="block text-sm font-bold">בחירת קובץ CSV</span>
            <span className="block text-xs font-semibold text-muted-foreground">
              ייצוא תנועות מהבנק או מחברת האשראי
            </span>
          </>
        )}
      </button>

      {csvText ? (
        <>
          {mappingId ? (
            <div className="mb-4 flex items-center gap-2 rounded-control bg-primary-soft px-3.5 py-2.5 text-sm font-bold text-primary-strong">
              <Icon icon={CheckCircle2} className="size-4" strokeWidth={2.2} />
              נעשה שימוש במיפוי שמור
            </div>
          ) : null}

          <Card className="mb-4 divide-y divide-border">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-semibold text-muted-foreground">חשבון יעד</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={cn(selectClass, "max-w-48")}
                aria-label="חשבון יעד"
              >
                <option value="">בחרו חשבון</option>
                {(accounts.data ?? [])
                  .filter((a) => a.isActive)
                  .map((a) => (
                    <option key={a.accountId} value={a.accountId}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
            {(
              [
                ["date", "תאריך"],
                ["description", "תיאור"],
                ["amount", "סכום"],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-semibold text-muted-foreground">
                  עמודת {label}
                </span>
                <select
                  value={map[field]}
                  onChange={(e) => {
                    setMappingId("");
                    setMap((m) => ({ ...m, [field]: e.target.value }));
                  }}
                  className={cn(selectClass, "max-w-48")}
                  aria-label={`עמודת ${label}`}
                >
                  <option value="">בחרו עמודה</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      "{h}"
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-semibold text-muted-foreground">פורמט תאריך</span>
              <select
                value={map.dateFormat}
                onChange={(e) =>
                  setMap((m) => ({
                    ...m,
                    dateFormat: e.target.value as ImportColumnMap["dateFormat"],
                  }))
                }
                className={cn(selectClass, "max-w-48")}
                aria-label="פורמט תאריך"
                dir="ltr"
              >
                <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                <option value="MM/dd/yyyy">MM/dd/yyyy</option>
                <option value="yyyy-MM-dd">yyyy-MM-dd</option>
              </select>
            </div>
          </Card>

          {createBatch.isError ? (
            <p className="mb-3 text-center text-sm font-bold text-negative" role="alert">
              {createBatch.error instanceof Error ? createBatch.error.message : "הייבוא נכשל"}
            </p>
          ) : null}

          <Button
            size="lg"
            className="mb-6 w-full"
            disabled={!mappingComplete || createBatch.isPending}
            onClick={startImport}
          >
            {createBatch.isPending ? "מעבד…" : "ייבוא התנועות"}
          </Button>
        </>
      ) : null}

      {/* Past batches */}
      {(batches.data?.length ?? 0) > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            אצוות קודמות
          </h2>
          <ListCard>
            {batches.data!.map((batch) => (
              <ListRow
                as={Link}
                to={`/transactions?importBatchId=${batch.importBatchId}`}
                key={batch.importBatchId}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary-strong">
                  <Icon icon={Upload} className="size-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {batch.fileName ?? "ייבוא ידני"}
                  </span>
                  <span className="block text-xs font-medium text-muted-foreground">
                    {formatDateFull(batch.importedAt)} · {batch.transactionCount} תנועות
                    {batch.duplicateCount > 0 ? ` · ${batch.duplicateCount} כפילויות` : ""}
                    {batch.errorCount > 0 ? ` · ${batch.errorCount} שגיאות` : ""}
                  </span>
                </span>
                <Chip
                  variant={
                    batch.status === "completed"
                      ? "positive"
                      : batch.status === "failed"
                        ? "negative"
                        : "primary"
                  }
                >
                  {BATCH_STATUS_LABELS[batch.status]}
                </Chip>
                <Icon icon={ChevronLeft} className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              </ListRow>
            ))}
          </ListCard>
        </section>
      ) : null}

      {/* Reconciliation */}
      <section>
        <h2 className="mb-2 ms-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Icon icon={Scale} className="size-3.5" strokeWidth={2} />
          התאמת חשבון מול דף חשבון
        </h2>
        <Card className="mb-3 flex flex-col gap-3 p-4">
          <select
            value={reconAccountId}
            onChange={(e) => setReconAccountId(e.target.value)}
            className={selectClass}
            aria-label="חשבון להתאמה"
          >
            <option value="">בחרו חשבון</option>
            {(accounts.data ?? [])
              .filter((a) => a.isActive)
              .map((a) => (
                <option key={a.accountId} value={a.accountId}>
                  {a.name}
                </option>
              ))}
          </select>
          <div className="flex gap-2">
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              aria-label="תחילת תקופה"
            />
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              aria-label="סוף תקופה"
            />
          </div>
          <Input
            inputMode="decimal"
            dir="ltr"
            placeholder="יתרת סגירה בדף החשבון"
            value={statementBalance}
            onChange={(e) => setStatementBalance(e.target.value)}
            aria-label="יתרת סגירה בדף החשבון"
            className="text-center tabular-nums"
          />
          <Button
            variant="soft"
            disabled={
              !reconAccountId || !periodStart || !periodEnd || !statementBalance ||
              createReconciliation.isPending
            }
            onClick={openReconciliation}
          >
            {createReconciliation.isPending ? "פותח…" : "פתיחת התאמה"}
          </Button>
        </Card>

        {(reconciliations.data?.length ?? 0) > 0 ? (
          <ListCard>
            {reconciliations.data!.map((session) => (
              <ListRow
                as={Link}
                to={`/reconciliation/${session.reconciliationId}`}
                key={session.reconciliationId}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold" dir="ltr">
                    {session.periodStart} → {session.periodEnd}
                  </span>
                </span>
                <Chip
                  variant={
                    session.status === "matched" || session.status === "resolved"
                      ? "positive"
                      : session.status === "mismatch"
                        ? "negative"
                        : "neutral"
                  }
                >
                  {RECON_STATUS_LABELS[session.status]}
                </Chip>
                <Icon icon={ChevronLeft} className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              </ListRow>
            ))}
          </ListCard>
        ) : null}
      </section>
    </>
  );
}
