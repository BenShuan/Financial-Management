import type { BankSyncProvider } from "@financial-management/shared";
import { findBrowser } from "./browser-path.js";
import { PROVIDERS } from "./providers.js";
import type { ScraperAccount } from "./serialize.js";

export type ScrapeOutcome =
  | { success: true; accounts: ScraperAccount[] }
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

/**
 * Real scraper. Never sets DEBUG, verbose or failure screenshots (they can capture credentials
 * or balances). The raw library error message is dropped; only `errorType` is kept.
 */
export const defaultScrape: ScrapeFn = async (provider, credentials, startDate) => {
  const executablePath = findBrowser();
  if (!executablePath) return { success: false, errorType: "LOCAL_NO_BROWSER" };
  try {
    const { createScraper } = await loadScraperModule();
    const scraper = createScraper({
      companyId: PROVIDERS[provider].companyId,
      startDate,
      combineInstallments: false,
      showBrowser: process.env.FM_SHOW_BROWSER === "1",
      executablePath,
      timeout: 60_000,
      verbose: false,
    });
    const result = await scraper.scrape(credentials);
    if (!result.success) return { success: false, errorType: result.errorType ?? "GENERIC" };
    return { success: true, accounts: result.accounts ?? [] };
  } catch {
    return { success: false, errorType: "LOCAL_ERROR" };
  }
};
