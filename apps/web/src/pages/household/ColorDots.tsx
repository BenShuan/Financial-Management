import { Check } from "lucide-react";
import { CATEGORY_COLORS, type CategoryColor } from "@financial-management/shared";
import { Icon } from "@/components/ui/icon";
import { COLOR_LABELS, colorDotClass } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Radio group of design-token color swatches (shared by categories and tags). */
export function ColorDots({
  value,
  onChange,
  label = "צבע",
}: {
  value: string | null | undefined;
  onChange: (color: CategoryColor) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      {CATEGORY_COLORS.map((color) => {
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={COLOR_LABELS[color]}
            title={COLOR_LABELS[color]}
            onClick={() => onChange(color)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              colorDotClass(color),
              selected && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
            )}
          >
            {selected ? <Icon icon={Check} className="size-3.5 text-white" strokeWidth={3} /> : null}
          </button>
        );
      })}
    </div>
  );
}
