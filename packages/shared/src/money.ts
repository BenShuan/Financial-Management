import { z } from "zod";

/**
 * Money crosses the wire as decimal strings (NUMERIC(18,2) in the DB) - never IEEE floats.
 * Amounts on transactions/splits/budget lines are positive scalars; sign comes from `type`.
 */

const MONEY_REGEX = /^\d{1,16}(\.\d{1,2})?$/;
const SIGNED_MONEY_REGEX = /^-?\d{1,16}(\.\d{1,2})?$/;

/** Positive (or zero) decimal-string amount, e.g. "1850.00". */
export const moneySchema = z
  .string()
  .regex(MONEY_REGEX, "יש להזין סכום תקין (עד שתי ספרות אחרי הנקודה)");

/** Strictly positive decimal-string amount. */
export const positiveMoneySchema = moneySchema.refine((v) => Number(v) > 0, {
  message: "הסכום חייב להיות גדול מאפס",
});

/** Signed decimal-string amount (balances, deltas). */
export const signedMoneySchema = z
  .string()
  .regex(SIGNED_MONEY_REGEX, "יש להזין סכום תקין");

/** Decimal string to integer agorot (minor units), exact. */
export function toMinorUnits(amount: string): bigint {
  const negative = amount.startsWith("-");
  const [whole = "0", frac = ""] = (negative ? amount.slice(1) : amount).split(".");
  const minor = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2));
  return negative ? -minor : minor;
}

/** Integer agorot to decimal string with two fraction digits. */
export function fromMinorUnits(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** Sums decimal strings without float drift. */
export function sumMoney(amounts: readonly string[]): string {
  return fromMinorUnits(amounts.reduce((acc, amount) => acc + toMinorUnits(amount), 0n));
}

/** Exact monetary equality between two decimal strings. */
export function moneyEquals(a: string, b: string): boolean {
  return toMinorUnits(a) === toMinorUnits(b);
}
