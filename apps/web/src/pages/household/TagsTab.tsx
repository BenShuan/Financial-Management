import { Archive, ArchiveRestore, Hash, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { CategoryColor, Tag } from "@financial-management/shared";
import { useCreateTag, useDeleteTag, useSession, useTags, useUpdateTag } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { colorDotClass } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ColorDots } from "./ColorDots";

export function TagsTab() {
  const session = useSession();
  const tags = useTags();
  const [showArchived, setShowArchived] = useState(false);
  const canEdit = session.data?.role !== undefined && session.data.role !== "viewer";

  if (tags.isPending) return <p className="text-sm font-semibold text-muted-foreground">טוען…</p>;
  if (tags.isError) {
    return <EmptyState icon={Hash} title="לא ניתן לטעון תגיות" description="בדקו שהשרת פועל ונסו שוב." />;
  }
  const archivedCount = tags.data.filter((t) => !t.isActive).length;
  const visible = showArchived ? tags.data : tags.data.filter((t) => t.isActive);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          תגיות הן תוויות חופשיות לתנועות (למשל &quot;חופשה 2026&quot;), בנוסף לקטגוריה.
        </p>
        <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-primary)]"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          הצגת ארכיון{archivedCount > 0 ? ` (${archivedCount})` : ""}
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Hash} title="אין עדיין תגיות" description="הוסיפו תגית ראשונה כדי לסמן תנועות." />
      ) : (
        <ListCard>
          {visible.map((tag) => (
            <TagRow key={tag.tagId} tag={tag} canEdit={canEdit} />
          ))}
        </ListCard>
      )}

      {canEdit ? <NewTagForm /> : null}
    </div>
  );
}

function TagRow({ tag, canEdit }: { tag: Tag; canEdit: boolean }) {
  const update = useUpdateTag();
  const remove = useDeleteTag();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<string | null>(tag.color);
  const error = update.error ?? remove.error;

  function save(e: FormEvent) {
    e.preventDefault();
    update.mutate(
      { tagId: tag.tagId, input: { name, color: (color as CategoryColor | null) ?? null } },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-3 bg-muted/30 px-4 py-3">
        <div className="space-y-1.5">
          <Label htmlFor={`tag-name-${tag.tagId}`}>שם</Label>
          <Input id={`tag-name-${tag.tagId}`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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

  return (
    <ListRow className={cn("flex-wrap", !tag.isActive && "opacity-60")}>
      <span className={cn("size-3 shrink-0 rounded-full", colorDotClass(tag.color))} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">
        #{tag.name}
        {!tag.isActive ? <span className="ms-2 text-xs font-semibold text-muted-foreground">(בארכיון)</span> : null}
      </span>
      {canEdit ? (
        <span className="flex items-center">
          {tag.isActive ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`עריכת ${tag.name}`}
              onClick={() => {
                setName(tag.name);
                setColor(tag.color);
                update.reset();
                setEditing(true);
              }}
            >
              <Icon icon={Pencil} className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={tag.isActive ? `העברת ${tag.name} לארכיון` : `שחזור ${tag.name}`}
            title={tag.isActive ? "העברה לארכיון (נשארת על תנועות קיימות)" : "שחזור"}
            disabled={update.isPending}
            onClick={() => {
              remove.reset();
              update.mutate({ tagId: tag.tagId, input: { isActive: !tag.isActive } });
            }}
          >
            <Icon icon={tag.isActive ? Archive : ArchiveRestore} className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`מחיקת ${tag.name}`}
            disabled={remove.isPending}
            onClick={() => {
              if (!window.confirm(`למחוק את #${tag.name}? התגית תוסר מכל התנועות.`)) return;
              update.reset();
              remove.mutate(tag.tagId);
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

function NewTagForm() {
  const create = useCreateTag();
  const [name, setName] = useState("");
  const [color, setColor] = useState<CategoryColor>("info");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ name, color }, { onSuccess: () => setName("") });
  }

  return (
    <section>
      <h2 className="mb-2 ms-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">תגית חדשה</h2>
      <form onSubmit={onSubmit} className="space-y-3 rounded-card border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-tag-name">שם</Label>
          <Input id="new-tag-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <ColorDots value={color} onChange={setColor} />
        {create.error ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {create.error.message}
          </p>
        ) : null}
        <Button type="submit" disabled={create.isPending}>
          <Icon icon={Plus} className="size-4" />
          הוספת תגית
        </Button>
      </form>
    </section>
  );
}
