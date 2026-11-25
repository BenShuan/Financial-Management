import type { ScraperAccount, ScraperTxn } from "./serialize.js";

/**
 * Tolerant Discount data fetch. The library's own `fetchData` stops at the FIRST account whose
 * `lastTransactions` call returns an Error and fails the whole bank, and it still calls the
 * retired `/Date` endpoint. Here each account uses the current `/ByDate` endpoint (old one as
 * fallback); an account that still fails is skipped and reported, the others are returned.
 * Runs after the library's own login, so no extra bank logins happen (no lockout risk).
 */

const API = "https://start.telebank.co.il/Titan/gatewayAPI";

/** GET within the logged-in bank page; resolves to parsed JSON or null. */
export type FetchJson = (url: string) => Promise<unknown>;

export interface DiscountFetchResult {
  success: boolean;
  accounts: ScraperAccount[];
  /** Last 4 digits of accounts that could not be fetched. */
  failedAccounts: string[];
  /** Bank's own messages, for the local debug log only. */
  messages: string[];
}

interface RawTxn {
  OperationNumber?: number | string;
  OperationDate?: string;
  ValueDate?: string;
  OperationAmount?: number;
  OperationDescriptionToDisplay?: string;
}

interface RawTxnsResponse {
  Error?: { MsgText?: string } | null;
  CurrentAccountLastTransactions?: {
    OperationEntry?: RawTxn[] | null;
    FutureTransactionsBlock?: { FutureTransactionEntry?: RawTxn[] | null } | null;
  } | null;
}

interface RawAccountsResponse {
  UserAccountsData?: { UserAccounts?: Array<{ NewAccountInfo?: { AccountID?: string } }> };
}

/** YYYYMMDD in local time, as the library does with moment. */
function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** YYYYMMDD -> ISO of local midnight (same as the library's moment(..., 'YYYYMMDD')). */
function parseYmd(s: string | undefined): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s ?? "");
  if (!m) return "";
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString();
}

function convert(rows: RawTxn[] | null | undefined, status: "completed" | "pending"): ScraperTxn[] {
  return (rows ?? []).map((t) => ({
    identifier: t.OperationNumber ?? null,
    date: parseYmd(t.OperationDate),
    processedDate: parseYmd(t.ValueDate) || null,
    chargedAmount: t.OperationAmount as number,
    originalAmount: t.OperationAmount ?? null,
    originalCurrency: "ILS",
    description: t.OperationDescriptionToDisplay ?? "",
    status,
  }));
}

function isOk(r: RawTxnsResponse | null): r is RawTxnsResponse & { CurrentAccountLastTransactions: object } {
  return !!r && !r.Error && !!r.CurrentAccountLastTransactions;
}

/** The bank serves at most ~1 year back (the library uses now - 1y + 2d). */
export function discountFromDate(startDate: Date, now: Date): string {
  const floor = new Date(now);
  floor.setFullYear(floor.getFullYear() - 1);
  floor.setDate(floor.getDate() + 2);
  return ymd(startDate > floor ? startDate : floor);
}

export async function fetchDiscountAccounts(
  fetchJson: FetchJson,
  startDate: Date,
  now: Date = new Date(),
): Promise<DiscountFetchResult> {
  const messages: string[] = [];
  const info = (await fetchJson(`${API}/userAccountsData`)) as RawAccountsResponse | null;
  const ids = (info?.UserAccountsData?.UserAccounts ?? [])
    .map((a) => a.NewAccountInfo?.AccountID)
    .filter((id): id is string => typeof id === "string" && id !== "");
  if (ids.length === 0) {
    return { success: false, accounts: [], failedAccounts: [], messages: ["no accounts in userAccountsData"] };
  }

  const from = discountFromDate(startDate, now);
  const to = ymd(now);
  const accounts: ScraperAccount[] = [];
  const failedAccounts: string[] = [];
  for (const id of ids) {
    let res: RawTxnsResponse | null = null;
    for (const url of transactionUrls(id, from, to)) {
      res = (await safeFetch(fetchJson, url, messages)) as RawTxnsResponse | null;
      if (isOk(res)) break;
      messages.push(`account ****${id.slice(-4)}: ${describeError(res)} (trying next endpoint)`);
    }
    if (!isOk(res)) {
      messages.push(`account ****${id.slice(-4)}: ${describeError(res)} (skipped)`);
      failedAccounts.push(id.slice(-4));
      continue;
    }
    const block = res.CurrentAccountLastTransactions;
    accounts.push({
      accountNumber: id,
      txns: [
        ...convert(block.OperationEntry, "completed"),
        ...convert(block.FutureTransactionsBlock?.FutureTransactionEntry, "pending"),
      ],
    });
  }
  return { success: accounts.length > 0, accounts, failedAccounts, messages };
}

const FLAGS = "IsTransactionDetails=True&IsFutureTransactionFlag=True&IsEventNames=True&IsCategoryDescCode=True";

/**
 * Endpoints in order. Discount retired `lastTransactions/<id>/Date` (it now always answers
 * T101010 "אין אפשרות לבצע את הפעולה"); the site uses `lastTransactions/transactions/<id>/ByDate`,
 * which requires ToDate (upstream PR eshaham/israeli-bank-scrapers#1194, not yet released).
 * The old URL stays as a fallback in case the change is rolled back.
 */
export function transactionUrls(id: string, from: string, to: string): string[] {
  return [
    `${API}/lastTransactions/transactions/${id}/ByDate?FromDate=${from}&ToDate=${to}&${FLAGS}`,
    `${API}/lastTransactions/${id}/Date?${FLAGS}&FromDate=${from}`,
  ];
}

function describeError(r: RawTxnsResponse | null): string {
  const e = r?.Error as { MsgText?: string; ReturnedCode?: string } | null | undefined;
  if (!e) return "no data";
  return `${e.ReturnedCode ? `[${e.ReturnedCode}] ` : ""}${e.MsgText ?? ""}`;
}

async function safeFetch(fetchJson: FetchJson, url: string, messages: string[]): Promise<unknown> {
  try {
    return await fetchJson(url);
  } catch (err) {
    // The library's error text includes the URL (account id); keep only the first line.
    messages.push(`fetch failed: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]?.replace(/https?:\S+/g, "<url>").slice(0, 160)}`);
    return null;
  }
}
