import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";

interface AmountTextProps {
  /** Decimal string from the API (always positive scalar). */
  amount: string;
  /** Transaction flow; colors and signs the amount. */
  flow?: "income" | "expense" | "transfer" | "neutral";
  currency?: string;
  className?: string;
}

/** Money display: expenses red with minus, income green with plus, LTR digits inside RTL text. */
export function AmountText({ amount, flow = "neutral", currency, className }: AmountTextProps) {
  const sign = flow === "expense" ? "-" : flow === "income" ? "+" : "";
  return (
    <span
      dir="ltr"
      className={cn(
        "font-extrabold tabular-nums",
        flow === "expense" && "text-negative",
        flow === "income" && "text-positive",
        className,
      )}
    >
      {sign}
      {formatCurrency(amount, { currency })}
    </span>
  );
}
