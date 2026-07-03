import * as React from "react";
import { cn } from "@/lib/utils";

/** Grouped list container: rows inside one rounded bordered card, 1px separators. */
export function ListCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-border bg-card [&>*+*]:border-t [&>*+*]:border-border",
        className,
      )}
      {...props}
    />
  );
}

type ListRowProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className">;

/** A single row; defaults to div, can render as button/Link for tappable rows. */
export function ListRow<T extends React.ElementType = "div">({
  as,
  className,
  ...props
}: ListRowProps<T>) {
  const Comp = (as ?? "div") as React.ElementType;
  return (
    <Comp
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-300",
        as != null &&
          "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
