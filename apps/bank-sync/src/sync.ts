import {
  BANK_SYNC_PROVIDERS,
  type BankSyncProvider,
  type BankSyncUploadAccountResult,
  type SyncAccountLinkStatus,
} from "@financial-management/shared";
import type { ApiClient } from "./api.js";
import { computeStartDate, type ConfigStore } from "./config.js";
import { ApiError, LocalError, MSG, scraperErrorMessage, toUserMessage } from "./errors.js";
import { PROVIDERS } from "./providers.js";
import type { ScrapeFn } from "./scrape.js";
import { toUpload } from "./serialize.js";
import type { Vault } from "./vault.js";

export const UNMAPPED_HINT = "יש לשייך את החשבון באפליקציית הווב (עוד > סנכרון בנקים)";
export const AGENT_VERSION = "bank-sync/0.1.0";

export interface AccountReport {
  /** Last 4 digits only; the full number stays out of the page state. */
  last4: string;
  status: SyncAccountLinkStatus;
  received: number;
  created: number;
  duplicates: number;
  skippedPending: number;
  skippedInvalid: number;
  skippedForeign: number;
  error: string | null;
  hint: string | null;
}

export interface ProviderReport {
  provider: BankSyncProvider;
  label: string;
  startDate: string;
  ok: boolean;
  error: string | null;
  droppedInvalid: number;
  /** Last 4 digits of accounts the provider refused to return (the others were synced). */
  failedAccounts: string[];
  cursorAdvanced: boolean;
  accounts: AccountReport[];
}

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  error: string | null;
  providers: ProviderReport[];
}

export interface SyncDeps {
  vault: Vault;
  configStore: ConfigStore;
  scrape: ScrapeFn;
  apiFactory: (origin: string, token: string) => ApiClient;
  now?: () => Date;
}

function toAccountReport(r: BankSyncUploadAccountResult): AccountReport {
  return {
    last4: r.accountNumber.slice(-4),
    status: r.status,
    received: r.received,
    created: r.created,
    duplicates: r.duplicates,
    skippedPending: r.skippedPending,
    skippedInvalid: r.skippedInvalid,
    skippedForeign: r.skippedForeign,
    error: r.error,
    hint: r.status === "unmapped" ? UNMAPPED_HINT : null,
  };
}

/**
 * The cursor for a provider advances only when the scrape and upload succeeded AND no account
 * came back `unmapped` or with an error (e.g. inactive linked account). Otherwise the next sync
 * re-scans the same window, so rows of newly linked/fixed accounts are not lost.
 */
export function shouldAdvanceCursor(results: BankSyncUploadAccountResult[]): boolean {
  return results.every((r) => r.status !== "unmapped" && r.error === null);
}

export class SyncRunner {
  private running = false;
  lastReport: SyncReport | null = null;

  constructor(private readonly deps: SyncDeps) {}

  get isRunning(): boolean {
    return this.running;
  }

  async run(only?: BankSyncProvider[]): Promise<SyncReport> {
    if (this.running) throw new LocalError(MSG.alreadyRunning);
    this.running = true;
    try {
      const report = await this.runInner(only);
      this.lastReport = report;
      return report;
    } finally {
      this.running = false;
    }
  }

  private async runInner(only?: BankSyncProvider[]): Promise<SyncReport> {
    const now = (this.deps.now ?? (() => new Date()))();
    const startedAt = now.toISOString();
    const finish = (error: string | null, providers: ProviderReport[] = []): SyncReport => ({
      startedAt,
      finishedAt: new Date().toISOString(),
      error,
      providers,
    });

    const { vault } = this.deps;
    if (!vault.unlocked) return finish(MSG.vaultLocked);
    const data = vault.get();
    if (!data.session) return finish(MSG.notLoggedIn);
    const api = this.deps.apiFactory(data.session.apiOrigin, data.session.token);

    // Role is re-checked live before any login to a provider.
    try {
      const me = await api.me();
      if (me.role !== "owner" && me.role !== "admin") return finish(MSG.notAdmin);
    } catch (err) {
      return finish(toUserMessage(err));
    }

    const targets = BANK_SYNC_PROVIDERS.filter((p) => data.providers[p] && (!only || only.includes(p)));
    if (targets.length === 0) return finish(MSG.noProviders);

    const config = await this.deps.configStore.load();
    const reports: ProviderReport[] = [];
    for (const provider of targets) {
      const startDate = computeStartDate(config, provider, now);
      const report: ProviderReport = {
        provider,
        label: PROVIDERS[provider].label,
        startDate: startDate.toISOString().slice(0, 10),
        ok: false,
        error: null,
        droppedInvalid: 0,
        failedAccounts: [],
        cursorAdvanced: false,
        accounts: [],
      };
      reports.push(report);

      // Sequential, one attempt per provider: never retry a failed login (lockout risk).
      const outcome = await this.deps.scrape(provider, data.providers[provider] ?? {}, startDate);
      if (!outcome.success) {
        report.error = scraperErrorMessage(outcome.errorType);
        continue;
      }

      // A refused account doesn't hold the cursor: it may be refused forever (e.g. closed), and
      // later syncs re-scan 14 days back anyway, which covers a one-off refusal.
      report.failedAccounts = outcome.failedAccounts ?? [];
      const accounts = outcome.accounts.filter((a) => String(a.accountNumber ?? "").trim() !== "");
      let advance = true;
      if (accounts.length > 0) {
        const { body, droppedInvalid } = toUpload(provider, now, startDate, accounts, AGENT_VERSION);
        report.droppedInvalid = droppedInvalid;
        try {
          const result = await api.upload(body);
          report.accounts = result.accounts.map(toAccountReport);
          advance = shouldAdvanceCursor(result.accounts);
        } catch (err) {
          report.error = toUserMessage(err);
          if (err instanceof ApiError && err.status === 401) break; // session gone: stop
          continue;
        }
      }
      report.ok = true;
      if (advance) {
        const fresh = await this.deps.configStore.load();
        fresh.lastSuccessfulSyncAt[provider] = startedAt;
        await this.deps.configStore.save(fresh);
        config.lastSuccessfulSyncAt[provider] = startedAt;
        report.cursorAdvanced = true;
      }
    }
    return finish(null, reports);
  }
}
