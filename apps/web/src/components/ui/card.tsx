import * as React from "react";
import { cn } from "@/lib/utils";

/** Hearth surface: near-white card with a 1px border, no shadow. */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-card border border-border bg-card text-card-foreground", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export { Card };
