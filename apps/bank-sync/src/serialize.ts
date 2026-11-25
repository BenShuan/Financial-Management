import {
  fromMinorUnits,
  type BankSyncProvider,
  type BankSyncUpload,
  type ScrapedTransaction,
} from "@financial-management/shared";

/**
 * Near-raw conversion of scraper output into the shared upload contract. No money logic here:
 * the API decides type, dates, skips and dedupe. We only turn JS numbers into signed decimal
 * strings (via integer agorot, never float formatting) and drop fields outside the contract.
 */

/** Library-shaped transaction (structural; tests need no library import). */
export interface ScraperTxn {
  identifier?: string | number | null;
  date: string;
  processedDate?: string | null;
  chargedAmount: number;
  originalAmount?: number | null;
  originalCurrency?: string | null;
  chargedCurrency?: string | null;
  description?: string | null;
  memo?: string | null;
  status?: string | null;
  installments?: { number: number; total: number } | null;
  [key: string]: unknown;
}

export interface ScraperAccount {
  accountNumber: string;
  txns: ScraperTxn[];
  [key: string]: unknown;
}

/** JS number -> signed decimal string with 2 places, computed on integer agorot. */
export function toSignedMoney(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error("invalid amount");
  const minor = Math.round(n * 100);
  if (!Number.isSafeInteger(minor)) throw new Error("invalid amount");
  return fromMinorUnits(BigInt(minor));
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function optString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

/** Returns null when the row cannot be represented in the contract (bad date or amount). */
export function toScrapedTransaction(t: ScraperTxn): ScrapedTransaction | null {
  const date = isoOrNull(t.date);
  if (!date) return null;
  let chargedAmount: string;
  try {
    chargedAmount = toSignedMoney(t.chargedAmount);
  } catch {
    return null;
  }
  const out: ScrapedTransaction = {
    date,
    chargedAmount,
    description: typeof t.description === "string" ? t.description.slice(0, 500) : "",
    status: t.status === "pending" ? "pending" : "completed",
  };
  if (t.identifier !== undefined && t.identifier !== null && String(t.identifier) !== "") {
    out.identifier = String(t.identifier).slice(0, 200);
  }
  const processedDate = isoOrNull(t.processedDate);
  if (processedDate) out.processedDate = processedDate;
  if (typeof t.originalAmount === "number" && Number.isFinite(t.originalAmount)) {
    out.originalAmount = toSignedMoney(t.originalAmount);
  }
  const originalCurrency = optString(t.originalCurrency, 10);
  if (originalCurrency) out.originalCurrency = originalCurrency;
  const chargedCurrency = optString(t.chargedCurrency, 10);
  if (chargedCurrency) out.chargedCurrency = chargedCurrency;
  const memo = optString(t.memo, 1000);
  if (memo) out.memo = memo;
  const inst = t.installments;
  if (inst && Number.isInteger(inst.number) && Number.isInteger(inst.total) && inst.number >= 1 && inst.total >= 1) {
    out.installments = { number: inst.number, total: inst.total };
  }
  return out;
}

export interface UploadBuild {
  body: BankSyncUpload;
  /** Rows dropped locally because they had no usable date/amount. */
  droppedInvalid: number;
}

export function toUpload(
  provider: BankSyncProvider,
  scrapedAt: Date,
  startDate: Date,
  accounts: ScraperAccount[],
  agentVersion?: string,
): UploadBuild {
  let droppedInvalid = 0;
  const body: BankSyncUpload = {
    provider,
    scrapedAt: scrapedAt.toISOString(),
    startDate: startDate.toISOString().slice(0, 10),
    accounts: accounts.map((a) => ({
      accountNumber: String(a.accountNumber).trim(),
      txns: (a.txns ?? []).flatMap((t) => {
        const row = toScrapedTransaction(t);
        if (!row) {
          droppedInvalid++;
          return [];
        }
        return [row];
      }),
    })),
  };
  if (agentVersion) body.agentVersion = agentVersion;
  return { body, droppedInvalid };
}
