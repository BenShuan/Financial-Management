import type { AccountType } from "@financial-management/shared";

/** Category/account colors are stored as design-token names; map them to classes. */
const DOT_CLASSES: Record<string, string> = {
  primary: "bg-primary",
  info: "bg-info",
  warning: "bg-warning",
  violet: "bg-violet",
  positive: "bg-positive",
  negative: "bg-negative",
};

export function colorDotClass(color: string | null | undefined): string {
  return DOT_CLASSES[color ?? ""] ?? "bg-primary";
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "עובר ושב",
  savings: "חיסכון",
  cash: "מזומן",
  credit: "אשראי",
  other: "אחר",
};

export const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  checking: "bg-info",
  savings: "bg-positive",
  cash: "bg-warning",
  credit: "bg-negative",
  other: "bg-violet",
};
