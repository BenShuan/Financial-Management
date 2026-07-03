import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** 0–100; values above 100 are clamped and rendered as over-budget. */
  percent: number;
  /** Tailwind bg-* class for the fill; defaults to primary, switches to negative when over 100. */
  colorClassName?: string;
  className?: string;
}

export function ProgressBar({ percent, colorClassName, className }: ProgressBarProps) {
  const over = percent > 100;
  const width = Math.min(Math.max(percent, 0), 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 overflow-hidden rounded-full bg-border/60", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-in-out",
          over ? "bg-negative" : (colorClassName ?? "bg-primary"),
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
