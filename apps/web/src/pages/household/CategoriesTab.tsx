import { Archive, ArchiveRestore, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { Category, CategoryColor, CategoryKind } from "@financial-management/shared";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useSession,
  useUpdateCategory,
} from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CATEGORY_KIND_LABELS, colorDotClass } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ColorDots } from "./ColorDots";

const KIND_OPTIONS = (["expense", "income", "transfer_neutral"] as const).map((value) => ({
  value,
  label: CATEGORY_KIND_LABELS[value],
}));

const selectClass =
  "h-9 rounded-control border border-input bg-card px-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Parent first, then its children — two levels, ordered by sort order. */
function buildTree(categories: Category[]) {
  const parents = categories.filter((c) => !c.parentCategoryId);
  const childrenOf = new Map<string, Category[]>();
  for (const c of categories) {
    if (!c.parentCategoryId) continue;
    childrenOf.set(c.parentCategoryId, [...(childrenOf.get(c.parentCategoryId) ?? []), c]);
  }
  // A child whose parent is filtered out (e.g. archived parent hidden) still shows, at top level.
  const known = new Set(parents.map((p) => p.categoryId));
  const orphans = categories.filter((c) => c.parentCategoryId && !known.has(c.parentCategoryId));
  return [...parents, ...orphans].map((parent) => ({
    parent,
    children: childrenOf.get(parent.categoryId) ?? [],
  }));
}

export function CategoriesTab() {
  const session = useSession();
  const categories = useCategories();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [showArchived, setShowArchived] = useState(false);
  const canEdit = session.data?.role !== undefined && session.data.role !== "viewer";

  const ofKind = useMemo(
    () => (categories.data ?? []).filter((c) => c.kind === kind),
    [categories.data, kind],
  );
  const visible = showArchived ? ofKind : ofKind.filter((c) => c.isActive);
  const archivedCount = ofKind.filter((c) => !c.isActive).length;
  const tree = buildTree(visible);
  const topLevelActive = ofKind.filter((c) => !c.parentCategoryId && c.isActive);

  if (categories.isPending) return <p className="text-sm font-semibold text-muted-foreground">טוען…</p>;
  if (categories.isError) {
    return <EmptyState icon={FolderTree} title="לא ניתן לטעון קטגוריות" description="בדקו שהשרת פועל ונסו שוב." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label="סוג קטגוריה"
          className="min-w-64 flex-1 sm:flex-none"
          options={KIND_OPTIONS}
          value={kind}
          onChange={setKind}
        />
        <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-primary)]"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          הצגת ארכיון{archivedCount > 0 ? ` (${archivedCount})` : ""}
        </label>
      </div>

      {tree.length === 0 ? (
        <EmptyState icon={FolderTree} title="אין קטגוריות מסוג זה" />
      ) : (
        <ListCard>
          {tree.flatMap(({ parent, children }) => [
            <CategoryRow
              key={parent.categoryId}
              category={parent}
              parents={topLevelActive}
              hasChildren={ofKind.some((c) => c.parentCategoryId === parent.categoryId)}
              canEdit={canEdit}
            />,
            ...children.map((child) => (
              <CategoryRow
                key={child.categoryId}
                category={child}
                parents={topLevelActive}
                hasChildren={false}
                canEdit={canEdit}
                indented
              />
            )),
          ])}
        </ListCard>
      )}

      {canEdit ? <NewCategoryForm kind={kind} parents={topLevelActive} /> : null}
    </div>
  );
}

function CategoryRow({
  category,
  parents,
  hasChildren,
  canEdit,
  indented = false,
}: {
  category: Category;
  parents: Category[];
  hasChildren: boolean;
  canEdit: boolean;
  indented?: boolean;
}) {
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState<string | null>(category.color);
  const [parentId, setParentId] = useState(category.parentCategoryId ?? "");
  const error = update.error ?? remove.error;
  const parentChoices = parents.filter((p) => p.categoryId !== category.categoryId);

  function startEdit() {
    setName(category.name);
    setColor(category.color);
    setParentId(category.parentCategoryId ?? "");
    update.reset();
    setEditing(true);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    update.mutate(
      {
        categoryId: category.categoryId,
        input: {
          name,
          color: (color as CategoryColor | null) ?? null,
          ...(hasChildren ? {} : { parentCategoryId: parentId || null }),
        },
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <form onSubmit={save} className={cn("space-y-3 bg-muted/30 px-4 py-3", indented && "ps-10")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`cat-name-${category.categoryId}`}>שם</Label>
            <Input
              id={`cat-name-${category.categoryId}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`cat-parent-${category.categoryId}`}>קטגוריית אב</Label>
            <div>
              <select
                id={`cat-parent-${category.categoryId}`}
                className={selectClass}
                value={parentId}
                disabled={hasChildren}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">ללא (קטגוריה ראשית)</option>
                {parentChoices.map((p) => (
                  <option key={p.categoryId} value={p.categoryId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {hasChildren ? (
              <p className="text-xs font-medium text-muted-foreground">
                לקטגוריה יש תתי-קטגוריות, ולכן היא נשארת ראשית.
              </p>
            ) : null}
          </div>
        </div>
        <ColorDots value={color} onChange={setColor} />
        {update.error ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {update.error.message}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={update.isPending}>
            שמירה
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            ביטול
          </Button>
        </div>
      </form>
    );
  }

  const archiveLabel = category.isActive ? `העברת ${category.name} לארכיון` : `שחזור ${category.name}`;

  return (
    <ListRow className={cn("flex-wrap", indented && "ps-10", !category.isActive && "opacity-60")}>
      <span className={cn("size-4 shrink-0 rounded-[6px]", colorDotClass(category.color))} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">
        {category.name}
        {category.code ? (
          <span dir="ltr" className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">
            {category.code}
          </span>
        ) : null}
        {!category.isActive ? (
          <span className="ms-2 text-xs font-semibold text-muted-foreground">(בארכיון)</span>
        ) : null}
      </span>
      {canEdit ? (
        <span className="flex items-center">
          {category.isActive ? (
            <Button type="button" size="icon" variant="ghost" aria-label={`עריכת ${category.name}`} onClick={startEdit}>
              <Icon icon={Pencil} className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={archiveLabel}
            title={category.isActive ? "העברה לארכיון" : "שחזור"}
            disabled={update.isPending}
            onClick={() => {
              if (
                category.isActive &&
                hasChildren &&
                !window.confirm(`להעביר את ${category.name} ואת תתי-הקטגוריות שלה לארכיון?`)
              ) {
                return;
              }
              remove.reset();
              update.mutate({ categoryId: category.categoryId, input: { isActive: !category.isActive } });
            }}
          >
            <Icon icon={category.isActive ? Archive : ArchiveRestore} className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`מחיקת ${category.name}`}
            title="מחיקה (רק לקטגוריה שלא בשימוש)"
            disabled={remove.isPending}
            onClick={() => {
              if (!window.confirm(`למחוק לצמיתות את ${category.name}?`)) return;
              update.reset();
              remove.mutate(category.categoryId);
            }}
          >
            <Icon icon={Trash2} className="size-4 text-negative" />
          </Button>
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="basis-full text-sm font-semibold text-destructive">
          {error.message}
        </p>
      ) : null}
    </ListRow>
  );
}

function NewCategoryForm({ kind, parents }: { kind: CategoryKind; parents: Category[] }) {
  const create = useCreateCategory();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [color, setColor] = useState<CategoryColor>("primary");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { name, kind, color, ...(parentId ? { parentCategoryId: parentId } : {}) },
      {
        onSuccess: () => {
          setName("");
          setParentId("");
        },
      },
    );
  }

  return (
    <section>
      <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        קטגוריה חדשה ({CATEGORY_KIND_LABELS[kind]})
      </h2>
      <form onSubmit={onSubmit} className="space-y-3 rounded-card border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-cat-name">שם</Label>
            <Input id="new-cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-cat-parent">קטגוריית אב</Label>
            <div>
              <select
                id="new-cat-parent"
                className={selectClass}
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">ללא (קטגוריה ראשית)</option>
                {parents.map((p) => (
                  <option key={p.categoryId} value={p.categoryId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <ColorDots value={color} onChange={setColor} />
        {create.error ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {create.error.message}
          </p>
        ) : null}
        <Button type="submit" disabled={create.isPending}>
          <Icon icon={Plus} className="size-4" />
          הוספת קטגוריה
        </Button>
      </form>
    </section>
  );
}
