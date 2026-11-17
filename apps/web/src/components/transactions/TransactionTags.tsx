import { Check, Tag as TagIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Tag } from "@financial-management/shared";
import { Icon } from "@/components/ui/icon";
import { colorDotClass } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * A transaction's tags as small chips plus a popover to toggle them. Archived tags stay visible
 * on the transactions that already carry them but are not offered for new assignments.
 */
export function TransactionTags({
  description,
  tagIds,
  tagById,
  activeTags,
  onChange,
  disabled,
}: {
  description: string;
  tagIds: string[];
  tagById: Map<string, Tag>;
  activeTags: Tag[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Fixed position from the trigger, so the table's overflow container cannot clip the popover.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Page scroll/resize would detach the fixed popover from its trigger; scrolling the list itself is fine.
    const close = (e: Event) => {
      if (e.type === "scroll" && rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const assigned = tagIds.map((id) => tagById.get(id)).filter((t): t is Tag => Boolean(t));
  const toggle = (tagId: string) =>
    onChange(tagIds.includes(tagId) ? tagIds.filter((id) => id !== tagId) : [...tagIds, tagId]);

  if (assigned.length === 0 && activeTags.length === 0) return null;

  return (
    <span ref={rootRef} className="relative mt-1 flex flex-wrap items-center gap-1">
      {assigned.map((tag) => (
        <span
          key={tag.tagId}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-secondary-foreground"
        >
          <span className={cn("size-1.5 rounded-full", colorDotClass(tag.color))} aria-hidden />#{tag.name}
        </span>
      ))}
      {activeTags.length > 0 ? (
        <button
          type="button"
          aria-label={`תגיות של ${description}`}
          aria-expanded={open}
          aria-haspopup="true"
          disabled={disabled}
          ref={triggerRef}
          onClick={() => {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (rect) setAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
            setOpen((o) => !o);
          }}
          className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Icon icon={TagIcon} className="size-3" strokeWidth={2.2} />
        </button>
      ) : null}
      {open && anchor ? (
        <span
          role="group"
          aria-label="בחירת תגיות"
          style={{ top: anchor.top, right: anchor.right }}
          className="fixed z-50 flex max-h-64 w-52 flex-col overflow-y-auto rounded-control border border-border bg-card p-1 shadow-md"
        >
          {activeTags.map((tag) => {
            const selected = tagIds.includes(tag.tagId);
            return (
              <button
                key={tag.tagId}
                type="button"
                role="checkbox"
                aria-checked={selected}
                onClick={() => toggle(tag.tagId)}
                className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-start text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn("size-2 shrink-0 rounded-full", colorDotClass(tag.color))} aria-hidden />
                <span className="min-w-0 flex-1 truncate">#{tag.name}</span>
                {selected ? <Icon icon={Check} className="size-4 text-primary" strokeWidth={2.6} /> : null}
              </button>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}
