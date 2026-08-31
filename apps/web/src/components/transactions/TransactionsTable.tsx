import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import type { Category, Transaction } from "@financial-management/shared";
import { AmountText } from "@/components/ui/amount-text";
import { Icon } from "@/components/ui/icon";
import { colorDotClass } from "@/lib/labels";
import { dateGroupLabel } from "@/lib/money";
import { cn } from "@/lib/utils";

const HEBREW_LETTER = /^[א-ת]$/;
const DIGIT = /^[0-9]$/;

type CodeMap = Map<string, Category>;

function buildCodeMap(categories: Category[], kind: "income" | "expense"): CodeMap {
  const map: CodeMap = new Map();
  for (const cat of categories) {
    if (cat.kind === kind && cat.code) map.set(cat.code, cat);
  }
  return map;
}

export function TransactionsTable({
  groups,
  categoryById,
  accountNameById,
  activeCategories,
  currency,
  selected,
  selectableIds,
  onToggleRow,
  onCategoryChange,
  pendingTransactionId,
}: {
  groups: [string, Transaction[]][];
  categoryById: Map<string, Category>;
  accountNameById: Map<string, string>;
  activeCategories: Category[];
  currency?: string;
  selected: Set<string>;
  selectableIds: string[];
  onToggleRow: (transactionId: string) => void;
  onCategoryChange: (transactionId: string, categoryId: string | null) => void;
  pendingTransactionId?: string;
}) {
  const incomeCodeMap = useMemo(() => buildCodeMap(activeCategories, "income"), [activeCategories]);
  const expenseCodeMap = useMemo(
    () => buildCodeMap(activeCategories, "expense"),
    [activeCategories],
  );

  const [focusedId, setFocusedId] = useState<string | null>(selectableIds[0] ?? null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (focusedId && !selectableIds.includes(focusedId)) {
      setFocusedId(selectableIds[0] ?? null);
    }
  }, [selectableIds, focusedId]);

  const moveFocus = (fromId: string, delta: 1 | -1) => {
    const idx = selectableIds.indexOf(fromId);
    if (idx === -1) return;
    const nextIdx = Math.min(Math.max(idx + delta, 0), selectableIds.length - 1);
    const nextId = selectableIds[nextIdx];
    if (nextId) {
      setFocusedId(nextId);
      cellRefs.current.get(nextId)?.focus();
    }
  };

  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-card border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="sticky top-0 z-10 bg-card [&>th]:border-b [&>th]:border-border [&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:text-xs [&>th]:font-bold [&>th]:text-muted-foreground">
              <th className="w-8" />
              <th>תיאור</th>
              <th className="w-40">קטגוריה</th>
              <th className="w-28 text-end">סכום</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([date, txns]) => (
              <Fragment key={date}>
                <tr>
                  <td colSpan={4} className="bg-muted/40 px-3 py-1.5 text-xs font-bold text-muted-foreground">
                    {dateGroupLabel(date)}
                  </td>
                </tr>
                {txns.map((txn) => {
                  const category = txn.categoryId ? categoryById.get(txn.categoryId) : undefined;
                  const selectable = txn.type !== "transfer" && txn.splits.length === 0;
                  const dotColor = txn.type === "transfer" ? "violet" : category?.color;
                  return (
                    <tr
                      key={txn.transactionId}
                      className="[&>td]:border-b [&>td]:border-border [&>td]:px-3 [&>td]:py-2 last:[&>td]:border-b-0"
                    >
                      <td>
                        {selectable ? (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={selected.has(txn.transactionId)}
                            aria-label={`בחירת ${txn.description}`}
                            onClick={() => onToggleRow(txn.transactionId)}
                            className={cn(
                              "flex size-[18px] shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                              selected.has(txn.transactionId)
                                ? "border-primary bg-primary"
                                : "border-border bg-card",
                            )}
                          >
                            {selected.has(txn.transactionId) ? (
                              <Icon icon={Check} className="size-3 text-primary-foreground" strokeWidth={3} />
                            ) : null}
                          </button>
                        ) : (
                          <span
                            className="block size-[18px] shrink-0 rounded-md border-2 border-border/50"
                            aria-hidden
                          />
                        )}
                      </td>
                      <td className="min-w-0">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={cn("size-6 shrink-0 rounded-[8px]", colorDotClass(dotColor))} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{txn.description}</span>
                            <span className="block truncate text-xs font-medium text-muted-foreground">
                              {accountNameById.get(txn.accountId) ?? ""}
                              {txn.status === "pending" ? " · ממתין" : ""}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        {txn.type === "transfer" ? (
                          <span className="text-xs font-bold text-muted-foreground">העברה</span>
                        ) : txn.splits.length > 0 ? (
                          <span className="text-xs font-bold text-muted-foreground">
                            {txn.splits.length} פיצולים
                          </span>
                        ) : (
                          <CategoryCell
                            txn={txn}
                            category={category}
                            codeMap={txn.type === "income" ? incomeCodeMap : expenseCodeMap}
                            categories={activeCategories.filter((c) => c.kind === txn.type)}
                            registerRef={(el) => {
                              if (el) cellRefs.current.set(txn.transactionId, el);
                              else cellRefs.current.delete(txn.transactionId);
                            }}
                            isRovingTarget={focusedId === txn.transactionId}
                            onFocus={() => setFocusedId(txn.transactionId)}
                            onNavigate={(delta) => moveFocus(txn.transactionId, delta)}
                            onAssign={(categoryId) => {
                              onCategoryChange(txn.transactionId, categoryId);
                              moveFocus(txn.transactionId, 1);
                            }}
                            onClear={() => onCategoryChange(txn.transactionId, null)}
                            updating={pendingTransactionId === txn.transactionId}
                          />
                        )}
                      </td>
                      <td className="text-end">
                        <AmountText
                          amount={
                            txn.type === "transfer" && txn.transferDirection === "out"
                              ? `-${txn.amount}`
                              : txn.amount
                          }
                          flow={txn.type === "transfer" ? "neutral" : txn.type}
                          currency={currency}
                          className="text-sm"
                        />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryCell({
  txn,
  category,
  codeMap,
  categories,
  registerRef,
  isRovingTarget,
  onFocus,
  onNavigate,
  onAssign,
  onClear,
  updating,
}: {
  txn: Transaction;
  category?: Category;
  codeMap: CodeMap;
  categories: Category[];
  registerRef: (el: HTMLButtonElement | null) => void;
  isRovingTarget: boolean;
  onFocus: () => void;
  onNavigate: (delta: 1 | -1) => void;
  onAssign: (categoryId: string) => void;
  onClear: () => void;
  updating: boolean;
}) {
  const [buffer, setBuffer] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const charPattern = txn.type === "income" ? HEBREW_LETTER : DIGIT;

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flashInvalid = () => {
    setInvalid(true);
    setTimeout(() => setInvalid(false), 300);
  };

  const resetBuffer = () => {
    clearTimer();
    setBuffer("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      setMenuOpen(false);
      resetBuffer();
      onNavigate(e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setMenuOpen((open) => !open);
      return;
    }
    if (e.key === "Escape") {
      if (buffer) resetBuffer();
      else setMenuOpen(false);
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      if (buffer) {
        setBuffer(buffer.slice(0, -1));
      } else {
        onClear();
      }
      return;
    }
    if (e.key.length !== 1 || !charPattern.test(e.key)) return;
    e.preventDefault();
    const next = buffer + e.key;
    const exact = codeMap.get(next);
    const hasLonger = [...codeMap.keys()].some((c) => c !== next && c.startsWith(next));

    clearTimer();
    if (exact && !hasLonger) {
      onAssign(exact.categoryId);
      resetBuffer();
    } else if (hasLonger) {
      setBuffer(next);
      timerRef.current = setTimeout(() => {
        if (exact) onAssign(exact.categoryId);
        else flashInvalid();
        resetBuffer();
      }, 600);
    } else {
      flashInvalid();
      resetBuffer();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        ref={registerRef}
        tabIndex={isRovingTarget ? 0 : -1}
        onFocus={onFocus}
        onKeyDown={handleKeyDown}
        onClick={() => {
          onFocus();
          setMenuOpen((open) => !open);
        }}
        disabled={updating}
        aria-label={`קטגוריה עבור ${txn.description}: ${category ? category.name : "ללא קטגוריה"}. הקלידו קוד קטגוריה או Enter לבחירה מרשימה`}
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-control border bg-card px-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          invalid ? "border-negative" : category ? "border-input" : "border-dashed border-primary/50",
        )}
      >
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm bg-muted px-1 text-[11px] font-extrabold text-secondary-foreground">
          {buffer || category?.code || "—"}
        </span>
        <span className={cn("size-2 shrink-0 rounded-sm", colorDotClass(category?.color))} />
        <span className={cn("truncate", !category && "text-primary-strong")}>
          {category ? category.name : "ללא קטגוריה"}
        </span>
      </button>

      {menuOpen ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
          <ul className="absolute end-0 top-full z-30 mt-1 max-h-56 w-48 overflow-y-auto rounded-control border border-border bg-card py-1 shadow-lg">
            <li>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center px-2.5 py-1.5 text-start text-xs font-bold text-muted-foreground hover:bg-muted"
              >
                ללא קטגוריה
              </button>
            </li>
            {categories.map((cat) => (
              <li key={cat.categoryId}>
                <button
                  type="button"
                  onClick={() => {
                    onAssign(cat.categoryId);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-start text-xs font-bold hover:bg-muted"
                >
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm bg-muted px-1 text-[10px] font-extrabold">
                    {cat.code ?? "—"}
                  </span>
                  <span className={cn("size-2 shrink-0 rounded-sm", colorDotClass(cat.color))} />
                  <span className="truncate">{cat.parentCategoryId ? `— ${cat.name}` : cat.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
