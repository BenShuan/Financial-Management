import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bankSyncUploadSchema,
  type BankSyncUpload,
  type BankSyncUploadAccountResult,
  type HouseholdRole,
  type SessionContext,
} from "@financial-management/shared";
import type { ApiClient } from "./api.js";
import { ConfigStore, computeStartDate, configSchema } from "./config.js";
import { ApiError, MSG } from "./errors.js";
import type { ScrapeFn, ScrapeOutcome } from "./scrape.js";
import { SyncRunner, UNMAPPED_HINT, shouldAdvanceCursor } from "./sync.js";
import { Vault } from "./vault.js";

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const NOW = new Date("2024-06-01T10:00:00.000Z");
const UUID = "11111111-1111-4111-8111-111111111111";
const CREDS = { id: "012345678", password: "dummy-bank-pw", num: "XY99" };
const MAX_CREDS = { username: "maxuser", password: "dummy-card-pw" };

let dir: string;
let vault: Vault;
let configStore: ConfigStore;

function ctx(role: HouseholdRole): SessionContext {
  return {
    user: { userId: UUID, email: "a@b.co", displayName: "A", avatarUrl: null, createdAt: NOW.toISOString() },
    household: { householdId: UUID, name: "בית", baseCurrency: "ILS", timezone: "Asia/Jerusalem", status: "active", createdAt: NOW.toISOString() },
    role,
  };
}

function result(accountNumber: string, over: Partial<BankSyncUploadAccountResult> = {}): BankSyncUploadAccountResult {
  return {
    accountNumber,
    linkId: UUID,
    status: "linked",
    accountId: UUID,
    importBatchId: UUID,
    received: 1,
    created: 1,
    duplicates: 0,
    skippedPending: 0,
    skippedInvalid: 0,
    skippedForeign: 0,
    skipped: [],
    error: null,
    ...over,
  };
}

const okScrape = (accountNumber = "123456789"): ScrapeOutcome => ({
  success: true,
  accounts: [
    {
      accountNumber,
      txns: [
        { date: "2024-05-01T21:00:00.000Z", chargedAmount: -45.9, description: "קפה", status: "completed", identifier: 7 },
        { date: "2024-05-02T21:00:00.000Z", chargedAmount: 120, description: "החזר", status: "pending" },
      ],
    },
  ],
});

function fakeApi(role: HouseholdRole, uploadImpl?: (b: BankSyncUpload) => Promise<{ accounts: BankSyncUploadAccountResult[] }>) {
  const uploads: BankSyncUpload[] = [];
  const api: ApiClient = {
    me: vi.fn(async () => ctx(role)),
    upload: vi.fn(async (b: BankSyncUpload) => {
      uploads.push(b);
      return uploadImpl ? uploadImpl(b) : { accounts: b.accounts.map((a) => result(a.accountNumber)) };
    }),
    logout: vi.fn(async () => {}),
  };
  return { api, uploads };
}

async function setup(providers: Record<string, Record<string, string>> = { discount: CREDS }) {
  await vault.create("correct horse");
  await vault.update((d) => {
    d.session = { apiOrigin: "https://api.example", token: "session-token-XYZ", expiresAt: "2030-01-01T00:00:00.000Z", email: "a@b.co" };
    Object.assign(d.providers, providers);
  });
}

function runner(scrape: ScrapeFn, api: ApiClient) {
  return new SyncRunner({ vault, configStore, scrape, apiFactory: () => api, now: () => NOW });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fm-sync-"));
  vault = new Vault(join(dir, "vault.enc.json"), FAST);
  configStore = new ConfigStore(join(dir, "config.json"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("computeStartDate", () => {
  it("uses lookback on first run and overlap afterwards", () => {
    const cfg = configSchema.parse({});
    expect(computeStartDate(cfg, "discount", NOW).toISOString()).toBe("2024-03-03T10:00:00.000Z");
    cfg.lastSuccessfulSyncAt.discount = "2024-05-20T00:00:00.000Z";
    expect(computeStartDate(cfg, "discount", NOW).toISOString()).toBe("2024-05-06T00:00:00.000Z");
  });
});

describe("shouldAdvanceCursor", () => {
  it("holds back on unmapped accounts or any per-account error", () => {
    expect(shouldAdvanceCursor([result("1"), result("2", { status: "ignored" })])).toBe(true);
    expect(shouldAdvanceCursor([result("1"), result("2", { status: "unmapped", accountId: null })])).toBe(false);
    expect(shouldAdvanceCursor([result("1", { error: "החשבון המשויך אינו פעיל" })])).toBe(false);
  });
});

describe("SyncRunner", () => {
  it("scrapes, uploads a schema-valid payload and advances the cursor on full success", async () => {
    await setup();
    const scrape = vi.fn<ScrapeFn>(async () => okScrape());
    const { api, uploads } = fakeApi("admin");
    const report = await runner(scrape, api).run();

    expect(report.error).toBeNull();
    expect(scrape).toHaveBeenCalledTimes(1);
    expect(scrape.mock.calls[0]?.[2].toISOString()).toBe("2024-03-03T10:00:00.000Z");
    expect(uploads).toHaveLength(1);
    expect(() => bankSyncUploadSchema.parse(uploads[0])).not.toThrow();
    expect(uploads[0]?.accounts[0]?.txns.map((t) => t.chargedAmount)).toEqual(["-45.90", "120.00"]);
    expect(report.providers[0]).toMatchObject({ provider: "discount", ok: true, cursorAdvanced: true });
    expect(report.providers[0]?.accounts[0]).toMatchObject({ last4: "6789", status: "linked", created: 1 });
    expect((await configStore.load()).lastSuccessfulSyncAt.discount).toBe(NOW.toISOString());
  });

  it("keeps the cursor when an account comes back unmapped, and shows the web hint", async () => {
    await setup();
    const { api } = fakeApi("owner", async (b) => ({
      accounts: b.accounts.map((a) => result(a.accountNumber, { status: "unmapped", accountId: null, importBatchId: null, created: 0 })),
    }));
    const report = await runner(async () => okScrape(), api).run();
    expect(report.providers[0]).toMatchObject({ ok: true, cursorAdvanced: false });
    expect(report.providers[0]?.accounts[0]?.hint).toBe(UNMAPPED_HINT);
    expect((await configStore.load()).lastSuccessfulSyncAt.discount).toBeUndefined();
  });

  it("keeps the cursor when an account result has an error (inactive linked account)", async () => {
    await setup();
    const { api } = fakeApi("admin", async (b) => ({
      accounts: b.accounts.map((a) => result(a.accountNumber, { error: "החשבון המשויך אינו פעיל", created: 0, importBatchId: null })),
    }));
    const report = await runner(async () => okScrape(), api).run();
    expect(report.providers[0]?.cursorAdvanced).toBe(false);
    expect(report.providers[0]?.accounts[0]?.error).toBe("החשבון המשויך אינו פעיל");
    expect((await configStore.load()).lastSuccessfulSyncAt.discount).toBeUndefined();
  });

  it("starts from the overlap after a previous success", async () => {
    await setup();
    await configStore.save(configSchema.parse({ lastSuccessfulSyncAt: { discount: "2024-05-20T00:00:00.000Z" } }));
    const scrape = vi.fn<ScrapeFn>(async () => okScrape());
    await runner(scrape, fakeApi("admin").api).run();
    expect(scrape.mock.calls[0]?.[2].toISOString()).toBe("2024-05-06T00:00:00.000Z");
  });

  it("maps INVALID_PASSWORD to Hebrew, does not retry, and continues with other providers", async () => {
    await setup({ discount: CREDS, max: MAX_CREDS });
    const scrape = vi.fn<ScrapeFn>(async (p) =>
      p === "discount" ? { success: false, errorType: "INVALID_PASSWORD" } : okScrape("5555"),
    );
    const { api, uploads } = fakeApi("admin");
    const report = await runner(scrape, api).run();
    expect(scrape).toHaveBeenCalledTimes(2);
    expect(report.providers.find((p) => p.provider === "discount")).toMatchObject({ ok: false, error: MSG.invalidPassword, cursorAdvanced: false });
    expect(report.providers.find((p) => p.provider === "max")).toMatchObject({ ok: true, cursorAdvanced: true });
    expect(uploads.map((u) => u.provider)).toEqual(["max"]);
    const cfg = await configStore.load();
    expect(cfg.lastSuccessfulSyncAt.discount).toBeUndefined();
    expect(cfg.lastSuccessfulSyncAt.max).toBe(NOW.toISOString());
  });

  it("aborts before scraping when the live role is below admin", async () => {
    await setup();
    const scrape = vi.fn<ScrapeFn>(async () => okScrape());
    const report = await runner(scrape, fakeApi("member").api).run();
    expect(report.error).toBe(MSG.notAdmin);
    expect(scrape).not.toHaveBeenCalled();
  });

  it("reports an expired session in Hebrew and does not scrape", async () => {
    await setup();
    const scrape = vi.fn<ScrapeFn>(async () => okScrape());
    const { api } = fakeApi("admin");
    api.me = vi.fn(async () => {
      throw new ApiError(401, MSG.sessionExpired);
    });
    const report = await runner(scrape, api).run();
    expect(report.error).toBe(MSG.sessionExpired);
    expect(scrape).not.toHaveBeenCalled();
  });

  it("keeps the cursor when the upload fails", async () => {
    await setup();
    const { api } = fakeApi("admin", async () => {
      throw new ApiError(413, MSG.tooLarge);
    });
    const report = await runner(async () => okScrape(), api).run();
    expect(report.providers[0]).toMatchObject({ ok: false, error: MSG.tooLarge, cursorAdvanced: false });
    expect((await configStore.load()).lastSuccessfulSyncAt.discount).toBeUndefined();
  });

  it("syncs only the selected providers", async () => {
    await setup({ discount: CREDS, max: MAX_CREDS });
    const scrape = vi.fn<ScrapeFn>(async () => okScrape());
    const report = await runner(scrape, fakeApi("admin").api).run(["max"]);
    expect(scrape.mock.calls.map((c) => c[0])).toEqual(["max"]);
    expect(report.providers.map((p) => p.provider)).toEqual(["max"]);
    expect((await configStore.load()).lastSuccessfulSyncAt.discount).toBeUndefined();
  });

  it("shows which rows the server skipped, rebuilt from the uploaded rows", async () => {
    await setup();
    const { api } = fakeApi("admin", async (b) => ({
      accounts: b.accounts.map((a) =>
        result(a.accountNumber, { skippedPending: 1, skipped: [{ index: 1, reason: "pending" }, { index: 9, reason: "invalid" }] }),
      ),
    }));
    const report = await runner(async () => okScrape(), api).run();
    expect(report.providers[0]?.accounts[0]?.skippedRows).toEqual([
      { reason: "pending", date: "2024-05-02", description: "החזר", amount: "120.00", currency: null },
    ]);
  });

  it("reports refused accounts and still advances the cursor", async () => {
    await setup();
    const scrape = vi.fn<ScrapeFn>(async () => ({ ...okScrape(), failedAccounts: ["4321"] }) as ScrapeOutcome);
    const report = await runner(scrape, fakeApi("admin").api).run();
    expect(report.providers[0]?.failedAccounts).toEqual(["4321"]);
    expect(report.providers[0]?.ok).toBe(true);
    expect(report.providers[0]?.cursorAdvanced).toBe(true);
  });

  it("allows only one sync at a time", async () => {
    await setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const r = runner(async () => {
      await gate;
      return okScrape();
    }, fakeApi("admin").api);
    const first = r.run();
    await vi.waitFor(() => expect(r.isRunning).toBe(true));
    await expect(r.run()).rejects.toThrow(MSG.alreadyRunning);
    release();
    await first;
    expect(r.isRunning).toBe(false);
  });

  it("never logs credentials or the session token", async () => {
    await setup({ discount: CREDS, max: MAX_CREDS });
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    const scrape: ScrapeFn = async (p) => (p === "max" ? { success: false, errorType: "TIMEOUT" } : okScrape());
    const report = await runner(scrape, fakeApi("admin").api).run();
    const logged = spies.flatMap((s) => s.mock.calls.flat()).map(String).join("\n");
    const reportText = JSON.stringify(report);
    for (const secret of [CREDS.password, CREDS.id, MAX_CREDS.password, "session-token-XYZ"]) {
      expect(logged).not.toContain(secret);
      expect(reportText).not.toContain(secret);
    }
    expect(reportText).not.toContain("123456789");
  });

  it("requires an unlocked vault and a login", async () => {
    const scrape = vi.fn<ScrapeFn>(async () => okScrape());
    expect((await runner(scrape, fakeApi("admin").api).run()).error).toBe(MSG.vaultLocked);
    await vault.create("correct horse");
    expect((await runner(scrape, fakeApi("admin").api).run()).error).toBe(MSG.notLoggedIn);
    expect(scrape).not.toHaveBeenCalled();
  });
});
