import type {
  AccountType,
  CategoryColor,
  CategoryKind,
  HouseholdMember,
  HouseholdRole,
} from "@financial-management/shared";

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

export const ROLE_LABELS: Record<HouseholdRole, string> = {
  owner: "בעלים",
  admin: "מנהל",
  member: "חבר",
  viewer: "צופה",
};

export const ROLE_DESCRIPTIONS: Record<HouseholdRole, string> = {
  owner: "שליטה מלאה, כולל ניהול מנהלים",
  admin: "ניהול חברים וצפייה ועריכה",
  member: "הוספה ועריכה של תנועות ותקציבים",
  viewer: "צפייה בלבד",
};

export const MEMBER_STATUS_LABELS: Record<HouseholdMember["status"], string> = {
  active: "פעיל",
  invited: "הוזמן",
  removed: "הוסר",
};

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  expense: "הוצאות",
  income: "הכנסות",
  transfer_neutral: "ניטרלי",
};

export const COLOR_LABELS: Record<CategoryColor, string> = {
  primary: "ירוק-כחול",
  info: "כחול",
  warning: "כתום",
  violet: "סגול",
  positive: "ירוק",
  negative: "אדום",
};
