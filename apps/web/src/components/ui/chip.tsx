import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-secondary-foreground",
        primary: "bg-primary-soft text-primary-strong",
        positive: "bg-positive-soft text-positive",
        negative: "bg-negative/10 text-negative",
        outline: "border border-dashed border-border bg-muted/50 text-muted-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

export function Chip({ className, variant, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ variant }), className)} {...props} />;
}
