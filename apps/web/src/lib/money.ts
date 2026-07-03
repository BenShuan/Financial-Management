/**
 * Money is transported as decimal strings (e.g. "1850.00") — never floats.
 * Parsing to Number happens only here, at the display boundary.
 */

const DEFAULT_CURRENCY = "ILS";
const LOCALE = "he-IL";

export function formatCurrency(
  amount: string | number,
  options?: { currency?: string; signDisplay?: "auto" | "always" | "never" },
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: options?.currency ?? DEFAULT_CURRENCY,
    signDisplay: options?.signDisplay ?? "auto",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Compact form without agorot for dashboards (e.g. ‎₪8,240‎). */
export function formatCurrencyWhole(
  amount: string | number,
  options?: { currency?: string },
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: options?.currency ?? DEFAULT_CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(iso));
}

export function formatDateFull(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}
