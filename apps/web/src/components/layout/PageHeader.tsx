import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** When set, renders a back chevron linking to this path (points to reading-start in RTL). */
  backTo?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, backTo, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-5 flex items-center gap-3", className)}>
      {backTo ? (
        <Link
          to={backTo}
          aria-label="חזרה"
          className="flex size-9 shrink-0 items-center justify-center rounded-control transition-colors duration-300 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon icon={ChevronRight} className="size-5" strokeWidth={2.2} />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className={cn("truncate font-extrabold", backTo ? "text-lg" : "text-2xl")}>{title}</h1>
        {subtitle ? (
          <div className="mt-0.5 text-sm font-semibold text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
      {actions}
    </header>
  );
}
