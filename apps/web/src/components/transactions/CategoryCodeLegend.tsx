import { useMemo, useRef, useState, type ReactNode } from "react";
import type { Category } from "@financial-management/shared";
import { useUpdateCategory } from "@/api/hooks";
import { ApiError } from "@/api/client";
import { colorDotClass } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Sticky grid of every active category with its keyboard shortcut code.
 * Doubles as the category filter (click a chip) and lets the code itself
 * be edited inline (click the code badge) — the only editable category
 * field the API exposes today.
 */
export function CategoryCodeLegend({
  categories,
  categoryFilter,
  onFilterChange,
}: {
  categories: Category[];
  categoryFilter: string;
  onFilterChange: (value: string) => void;
}) {
  const income = useMemo(() => categories.filter((c) => c.kind === "income"), [categories]);
  const expense = useMemo(() => categories.filter((c) => c.kind === "expense"), [categories]);

  return (
    <aside className="sticky top-2 z-20 order-first max-h-[40vh] shrink-0 overflow-y-auto rounded-card border border-border bg-card/95 p-3 backdrop-blur lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-64 lg:self-start">
      <div className="mb-2 flex flex-wrap gap-1.5">
        <SpecialChip active={categoryFilter === ""} onClick={() => onFilterChange("")}>
          הכל
        </SpecialChip>
        <SpecialChip
          active={categoryFilter === "uncategorized"}
          onClick={() => onFilterChange("uncategorized")}
        >
          ללא קטגוריה
        </SpecialChip>
      </div>

      <CategoryGroup
        title="הכנסות"
        categories={income}
        categoryFilter={categoryFilter}
        onFilterChange={onFilterChange}
      />
      <CategoryGroup
        title="הוצאות"
        categories={expense}
        categoryFilter={categoryFilter}
        onFilterChange={onFilterChange}
      />
    </aside>
  );
}

function CategoryGroup({
  title,
  categories,
  categoryFilter,
  onFilterChange,
}: {
  title: string;
  categories: Category[];
  categoryFilter: string;
  onFilterChange: (value: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="mb-2 last:mb-0">
      <h3 className="mb-1 text-[11px] font-bold text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {categories.map((cat) => (
          <CategoryChip
            key={cat.categoryId}
            category={cat}
            active={categoryFilter === cat.categoryId}
            onFilterClick={() => onFilterChange(categoryFilter === cat.categoryId ? "" : cat.categoryId)}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryChip({
  category,
  active,
  onFilterClick,
}: {
  category: Category;
  active: boolean;
  onFilterClick: () => void;
}) {
  const updateCategory = useUpdateCategory();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const skipCommitRef = useRef(false);

  const startEditing = () => {
    setDraft(category.code ?? "");
    setError(null);
    setEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next === (category.code ?? "")) return;
    updateCategory.mutate(
      { categoryId: category.categoryId, input: { code: next || null } },
      {
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : "עדכון הקוד נכשל");
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-control border px-1.5 py-1 transition-colors",
        active ? "border-primary bg-primary-soft" : "border-border bg-card",
      )}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              skipCommitRef.current = true;
              setEditing(false);
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            if (skipCommitRef.current) {
              skipCommitRef.current = false;
              return;
            }
            commit();
          }}
          className="h-6 w-8 shrink-0 rounded-sm border border-input bg-background text-center text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`קוד עבור ${category.name}`}
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          title="לחיצה לעריכת הקוד"
          className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-sm bg-muted px-1 text-xs font-extrabold text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {category.code ?? "?"}
        </button>
      )}
      <button
        type="button"
        onClick={onFilterClick}
        className="flex min-w-0 flex-1 items-center gap-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn("size-2 shrink-0 rounded-sm", colorDotClass(category.color))} />
        <span className="truncate text-xs font-bold">{category.name}</span>
      </button>
      {error ? <span className="text-[10px] font-bold text-negative">{error}</span> : null}
    </div>
  );
}

function SpecialChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-secondary-foreground",
      )}
    >
      {children}
    </button>
  );
}
