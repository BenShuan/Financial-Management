import { createHash } from "node:crypto";
import {
  type BankSyncProvider,
  type ScrapedTransaction,
  fromMinorUnits,
  toMinorUnits,
} from "@financial-management/shared";

/**
 * Pure normalization of scraped bank/card transactions (FM-29). The local app only converts
 * numbers to signed decimal strings; every ledger rule lives here on the server. Money stays in
 * integer minor units (bigint) — never floats.
 */

const ILS_CURRENCIES = new Set(["ILS", "₪", "NIS"]);
const HOUSEHOLD_TIMEZONE = "Asia/Jerusalem";
const MAX_DESCRIPTION = 500;
const NO_DESCRIPTION = "ללא תיאור";

export interface MappedRow {
  externalRef: string;
  transactionDate: string;
  postedDate: string | null;
  type: "income" | "expense";
  /** Positive decimal string. */
  amount: string;
  description: string;
  notes: string | null;
  /** The scraped transaction (contract fields only), stored as the raw import row. */
  raw: ScrapedTransaction;
}

export interface MappedAccount {
  rows: MappedRow[];
  skippedPending: number;
  skippedInvalid: number;
  skippedForeign: number;
}

const jerusalemFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: HOUSEHOLD_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** ISO datetime -> calendar date (YYYY-MM-DD) in the household timezone. Throws on invalid input. */
export function jerusalemDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new RangeError(`invalid date: ${iso}`);
  return jerusalemFormatter.format(date);
}

function isIls(currency: string | undefined): boolean {
  return currency === undefined || ILS_CURRENCIES.has(currency.trim().toUpperCase());
}

function normalizeDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

const absMinor = (minor: bigint): bigint => (minor < 0n ? -minor : minor);

function absMoney(amount: string): string {
  return fromMinorUnits(absMinor(toMinorUnits(amount)));
}

/** Normalizes one scraped account's transactions into ledger rows plus skip counters. */
export function mapScrapedAccount(
  provider: BankSyncProvider,
  accountNumber: string,
  txns: readonly ScrapedTransaction[],
): MappedAccount {
  const rows: MappedRow[] = [];
  let skippedPending = 0;
  let skippedInvalid = 0;
  let skippedForeign = 0;
  const occurrences = new Map<string, number>();

  for (const txn of txns) {
    if (txn.status === "pending") {
      skippedPending++;
      continue;
    }
    if (!isIls(txn.chargedCurrency)) {
      skippedForeign++;
      continue;
    }
    const minor = toMinorUnits(txn.chargedAmount);
    if (minor === 0n) {
      skippedInvalid++;
      continue;
    }
    let transactionDate: string;
    let postedDate: string | null;
    try {
      transactionDate = jerusalemDate(txn.date);
      postedDate = txn.processedDate ? jerusalemDate(txn.processedDate) : null;
    } catch {
      skippedInvalid++;
      continue;
    }

    const type = minor < 0n ? "expense" : "income";
    const amount = fromMinorUnits(absMinor(minor));
    const description = txn.description.trim().slice(0, MAX_DESCRIPTION) || NO_DESCRIPTION;

    const noteParts: string[] = [];
    if (txn.memo?.trim()) noteParts.push(txn.memo.trim());
    if (txn.installments) {
      noteParts.push(`תשלום ${txn.installments.number} מתוך ${txn.installments.total}`);
    }
    if (txn.originalCurrency && !isIls(txn.originalCurrency) && txn.originalAmount) {
      noteParts.push(`סכום מקור: ${absMoney(txn.originalAmount)} ${txn.originalCurrency.trim()}`);
    }

    const base = createHash("sha256")
      .update(
        [
          "bs1",
          provider,
          accountNumber,
          txn.identifier ?? "",
          transactionDate,
          amount,
          type,
          normalizeDescription(description),
          txn.installments?.number ?? "",
        ].join("|"),
      )
      .digest("hex");
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);

    rows.push({
      externalRef: `bs1:${base}${occurrence > 1 ? `#${occurrence}` : ""}`,
      transactionDate,
      postedDate,
      type,
      amount,
      description,
      notes: noteParts.length > 0 ? noteParts.join(" · ") : null,
      raw: txn,
    });
  }

  return { rows, skippedPending, skippedInvalid, skippedForeign };
}
