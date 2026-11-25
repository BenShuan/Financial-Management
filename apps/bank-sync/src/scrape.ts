import type { BankSyncProvider } from "@financial-management/shared";
import { findBrowser } from "./browser-path.js";
import { fetchDiscountAccounts, type DiscountFetchResult } from "./discount.js";
import { PROVIDERS } from "./providers.js";
import type { ScraperAccount } from "./serialize.js";

export type ScrapeOutcome =
  /** `failedAccounts`: last 4 digits of accounts the provider refused (others still returned). */
  | { success: true; accounts: ScraperAccount[]; failedAccounts?: string[] }
  /** `errorType` is the library's code (INVALID_PASSWORD, ...) or LOCAL_NO_BROWSER / LOCAL_ERROR. */
  | { success: false; errorType: string };

/** Port for the scraper so tests never load the library or a browser. */
export type ScrapeFn = (
  provider: BankSyncProvider,
  credentials: Record<string, string>,
  startDate: Date,
) => Promise<ScrapeOutcome>;

interface ScraperModule {
  createScraper: (options: Record<string, unknown>) => {
    scrape: (credentials: Record<string, string>) => Promise<{
      success: boolean;
      accounts?: ScraperAccount[];
      errorType?: string;
      errorMessage?: string;
    }>;
  };
}

async function loadScraperModule(): Promise<ScraperModule> {
  // CommonJS package: named export via interop, or on `default`.
  const mod = (await import("israeli-bank-scrapers-core")) as unknown as Partial<ScraperModule> & {
    default?: Partial<ScraperModule>;
  };
  const createScraper = mod.createScraper ?? mod.default?.createScraper;
  if (!createScraper) throw new Error("createScraper not found");
  return { createScraper };
}

type ScraperInstance = ReturnType<ScraperModule["createScraper"]>;
type ScraperCtor = new (options: Record<string, unknown>) => ScraperInstance & {
  page: unknown;
  options: { startDate: Date };
};

/**
 * Discount with a tolerant `fetchData` (see discount.ts): the library's login is reused as is,
 * only the per-account fetch is replaced so one refused account doesn't fail the whole bank.
 */
async function createTolerantDiscount(
  options: Record<string, unknown>,
  onResult: (r: DiscountFetchResult) => void,
): Promise<ScraperInstance> {
  const discountMod = (await import("israeli-bank-scrapers-core/lib/scrapers/discount.js")) as unknown as {
    default: ScraperCtor | { default: ScraperCtor };
  };
  const fetchMod = (await import("israeli-bank-scrapers-core/lib/helpers/fetch.js")) as unknown as {
    fetchGetWithinPage?: (page: unknown, url: string) => Promise<unknown>;
    default?: { fetchGetWithinPage?: (page: unknown, url: string) => Promise<unknown> };
  };
  const Base = "default" in discountMod.default ? discountMod.default.default : discountMod.default;
  const fetchGet = fetchMod.fetchGetWithinPage ?? fetchMod.default?.fetchGetWithinPage;
  if (typeof Base !== "function" || !fetchGet) throw new Error("discount scraper not found");

  class TolerantDiscount extends Base {
    async fetchData(): Promise<unknown> {
      const r = await fetchDiscountAccounts((url) => fetchGet!(this.page, url), this.options.startDate);
      onResult(r);
      return r.success
        ? { success: true, accounts: r.accounts }
        : {
            success: false,
            errorType: r.failedAccounts.length ? "ACCOUNTS_REFUSED" : "GENERIC",
            errorMessage: r.messages.at(-1) ?? "no accounts" };
    }
  }
  return new TolerantDiscount(options);
}

/**
 * Opt-in diagnostics (FM_SCRAPER_DEBUG=1): prints the library's error type + message to this
 * local terminal only. Never sent to the page or the server; the library's messages don't
 * include the credentials we pass in, but leave this off in normal use.
 */
function isDebug(): boolean {
  return process.env.FM_SCRAPER_DEBUG === "1";
}

function debugLog(provider: BankSyncProvider, errorType: string, message: string | undefined): void {
  if (!isDebug()) return;
  console.error(`[bank-sync:${provider}] ${errorType}: ${message ?? "(no message)"}`);
}

interface DebugFrame {
  url(): string;
  parentFrame(): unknown;
}
interface DebugPage {
  on(event: "framenavigated", handler: (frame: DebugFrame) => void): unknown;
}

/** Debug only: log each top-level navigation (query string dropped, it can carry tokens). */
async function traceNavigation(provider: BankSyncProvider, page: DebugPage): Promise<void> {
  page.on("framenavigated", (frame) => {
    if (frame.parentFrame()) return;
    let shown = frame.url();
    try {
      const u = new URL(shown);
      shown = `${u.origin}${u.pathname}${u.hash}`;
    } catch {
      /* keep raw */
    }
    console.error(`[bank-sync:${provider}] page: ${shown}`);
  });
}

/**
 * Real scraper. Never sets DEBUG, verbose or failure screenshots (they can capture credentials
 * or balances). The raw library error message is dropped; only `errorType` is kept.
 */
export const defaultScrape: ScrapeFn = async (provider, credentials, startDate) => {
  const executablePath = findBrowser();
  if (!executablePath) return { success: false, errorType: "LOCAL_NO_BROWSER" };
  try {
    const options: Record<string, unknown> = {
      companyId: PROVIDERS[provider].companyId,
      startDate,
      combineInstallments: false,
      showBrowser: process.env.FM_SHOW_BROWSER === "1",
      executablePath,
      timeout: 60_000,
      verbose: false,
      ...(isDebug() ? { preparePage: (page: DebugPage) => traceNavigation(provider, page) } : {}),
    };
    let discount: DiscountFetchResult | null = null;
    const scraper =
      provider === "discount"
        ? await createTolerantDiscount(options, (r) => {
            discount = r;
          })
        : (await loadScraperModule()).createScraper(options);
    const result = await scraper.scrape(credentials);
    const discountResult = discount as DiscountFetchResult | null;
    for (const m of discountResult?.messages ?? []) debugLog(provider, "INFO", m);
    if (!result.success) {
      debugLog(provider, result.errorType ?? "GENERIC", result.errorMessage);
      return { success: false, errorType: result.errorType ?? "GENERIC" };
    }
    const failedAccounts = discountResult?.failedAccounts ?? [];
    return { success: true, accounts: result.accounts ?? [], ...(failedAccounts.length ? { failedAccounts } : {}) };
  } catch (err) {
    debugLog(provider, "LOCAL_ERROR", err instanceof Error ? err.message : String(err));
    return { success: false, errorType: "LOCAL_ERROR" };
  }
};
