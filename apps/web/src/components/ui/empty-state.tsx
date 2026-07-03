import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-control bg-primary-soft text-primary-strong">
        <Icon icon={icon} className="size-6" strokeWidth={1.8} />
      </span>
      <p className="text-base font-bold">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm font-medium text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
