import { describe, expect, it } from "vitest";
import { createApiClient, normalizeOrigin, readSessionCookie } from "./api.js";
import { findBrowser } from "./browser-path.js";
import { ApiError, MSG, apiErrorMessage, scraperErrorMessage, toUserMessage } from "./errors.js";
import { dataDir } from "./paths.js";

describe("scraperErrorMessage", () => {
  it("maps library error types to Hebrew", () => {
    expect(scraperErrorMessage("INVALID_PASSWORD")).toBe(MSG.invalidPassword);
    expect(scraperErrorMessage("CHANGE_PASSWORD")).toBe(MSG.changePassword);
    expect(scraperErrorMessage("ACCOUNT_BLOCKED")).toBe(MSG.accountBlocked);
    expect(scraperErrorMessage("TIMEOUT")).toBe(MSG.timeout);
    expect(scraperErrorMessage("TWO_FACTOR_RETRIEVER_MISSING")).toBe(MSG.otp);
    expect(scraperErrorMessage("LOCAL_NO_BROWSER")).toBe(MSG.noBrowser);
    expect(scraperErrorMessage("GENERIC")).toBe(MSG.generic);
    expect(scraperErrorMessage(undefined)).toBe(MSG.generic);
  });
});

describe("apiErrorMessage / toUserMessage", () => {
  it("maps statuses and keeps the server's 400 message", () => {
    expect(apiErrorMessage(401)).toBe(MSG.sessionExpired);
    expect(apiErrorMessage(403)).toBe(MSG.forbidden);
    expect(apiErrorMessage(413)).toBe(MSG.tooLarge);
    expect(apiErrorMessage(0)).toBe(MSG.network);
    expect(apiErrorMessage(400, "יש להזין סכום תקין")).toBe("יש להזין סכום תקין");
    expect(apiErrorMessage(500, "stack trace")).toBe(MSG.server);
  });
  it("never echoes unknown error text", () => {
    expect(toUserMessage(new Error("password=hunter2"))).toBe(MSG.generic);
    expect(toUserMessage(new ApiError(403, MSG.forbidden))).toBe(MSG.forbidden);
  });
});

describe("api client", () => {
  it("accepts https origins and http only on loopback", () => {
    expect(normalizeOrigin(" https://api.example/path ")).toBe("https://api.example");
    expect(normalizeOrigin("http://localhost:8787")).toBe("http://localhost:8787");
    expect(normalizeOrigin("http://127.0.0.1:8787/")).toBe("http://127.0.0.1:8787");
    expect(normalizeOrigin("http://[::1]:8787")).toBe("http://[::1]:8787");
    expect(() => normalizeOrigin("http://api.example")).toThrow(ApiError);
    expect(() => normalizeOrigin("http://localhost.evil.example")).toThrow(ApiError);
    expect(() => normalizeOrigin("ftp://api.example")).toThrow(ApiError);
    expect(() => normalizeOrigin("not a url")).toThrow(ApiError);
  });

  it("reads the session token and expiry from Set-Cookie", () => {
    const c = readSessionCookie(["other=1; Path=/", "fm_session=abc%2Fdef; Path=/; HttpOnly; Expires=Wed, 01 Jan 2031 00:00:00 GMT"]);
    expect(c).toEqual({ token: "abc/def", expiresAt: "2031-01-01T00:00:00.000Z" });
    expect(readSessionCookie(["other=1"])).toBeNull();
  });

  it("sends the session cookie and maps 401 to the Hebrew re-login message", async () => {
    const calls: [string, RequestInit][] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ error: "http_error", message: "נדרשת התחברות" }), { status: 401 });
    }) as unknown as typeof fetch;
    const api = createApiClient(fetchFn, "https://api.example", "tok");
    await expect(api.me()).rejects.toMatchObject({ status: 401, message: MSG.sessionExpired });
    expect((calls[0]?.[1].headers as Record<string, string>).cookie).toBe("fm_session=tok");
  });

  it("refuses oversize uploads locally", async () => {
    const fetchFn = (async () => new Response("{}")) as unknown as typeof fetch;
    const api = createApiClient(fetchFn, "https://api.example", "tok");
    const big = {
      provider: "discount" as const,
      scrapedAt: "2024-01-01T00:00:00.000Z",
      startDate: "2024-01-01",
      accounts: [{ accountNumber: "1", txns: [{ date: "2024-01-01T00:00:00.000Z", chargedAmount: "-1.00", description: "x".repeat(5_000_000), status: "completed" as const }] }],
    };
    await expect(api.upload(big)).rejects.toMatchObject({ status: 413, message: MSG.tooLarge });
  });
});

describe("paths / browser", () => {
  it("keeps data outside the repo in the user's app-data dir", () => {
    expect(dataDir({ APPDATA: "C:\\Users\\x\\AppData\\Roaming" }, "win32")).toMatch(/AppData[\\/]Roaming[\\/]fm-bank-sync$/);
    expect(dataDir({ FM_BANK_SYNC_DIR: "/tmp/x" }, "linux")).toBe("/tmp/x");
  });
  it("honors FM_BROWSER_PATH and otherwise searches known locations", () => {
    expect(findBrowser({ FM_BROWSER_PATH: "/opt/chrome" }, "linux", (p) => p === "/opt/chrome")).toBe("/opt/chrome");
    expect(findBrowser({}, "linux", (p) => p === "/usr/bin/chromium")).toBe("/usr/bin/chromium");
    expect(findBrowser({}, "linux", () => false)).toBeNull();
  });
});
