import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hono } from "hono";
import { ConfigStore } from "./config.js";
import { TOKEN_HEADER, createLocalApp } from "./server.js";
import { SyncRunner } from "./sync.js";
import { Vault } from "./vault.js";

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const PORT = 5199;
const TOKEN = "launch-token-abc";
const HOST = `127.0.0.1:${PORT}`;
const UUID = "11111111-1111-4111-8111-111111111111";
// Placeholder fixtures, not real credentials.
const BANK_PW = "dummy-bank-pw";
const APP_PW = "dummy-app-pw";

let dir: string;
let vault: Vault;
let app: Hono;
let fetchFn: ReturnType<typeof vi.fn>;

function req(path: string, init: { method?: string; body?: unknown; host?: string; token?: string | null } = {}) {
  const headers: Record<string, string> = { host: init.host ?? HOST };
  if (init.token !== null) headers[TOKEN_HEADER] = init.token ?? TOKEN;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return app.request(`http://${init.host ?? HOST}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fm-server-"));
  vault = new Vault(join(dir, "vault.enc.json"), FAST);
  const configStore = new ConfigStore(join(dir, "config.json"));
  fetchFn = vi.fn();
  const runner = new SyncRunner({
    vault,
    configStore,
    scrape: vi.fn(),
    apiFactory: () => {
      throw new Error("not used");
    },
  });
  app = createLocalApp({ launchToken: TOKEN, getPort: () => PORT, vault, configStore, runner, fetchFn: fetchFn as unknown as typeof fetch });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("host and token guard", () => {
  it("rejects a foreign Host header (DNS rebinding), even with the token", async () => {
    expect((await req("/local/state", { host: "evil.example:5199" })).status).toBe(403);
    expect((await req("/", { host: "evil.example" })).status).toBe(403);
    expect((await req("/local/state", { host: "127.0.0.1:9999" })).status).toBe(403);
  });

  it("requires the per-launch token on /local routes", async () => {
    expect((await req("/local/state", { token: null })).status).toBe(403);
    expect((await req("/local/state", { token: "wrong" })).status).toBe(403);
    expect((await req("/local/vault", { method: "POST", body: { passphrase: "correct horse" }, token: null })).status).toBe(403);
    expect((await req("/local/state")).status).toBe(200);
    expect((await req("/local/state", { host: `localhost:${PORT}` })).status).toBe(200);
  });

  it("serves the page with a nonce CSP and no CORS headers", async () => {
    const res = await req("/", { token: null });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toMatch(/script-src 'nonce-/);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const html = await res.text();
    expect(html).toContain('dir="rtl"');
  });
});

describe("write-only credentials", () => {
  it("never returns credential values or the session token", async () => {
    expect((await req("/local/vault", { method: "POST", body: { passphrase: "correct horse" } })).status).toBe(200);

    const save = await req("/local/providers/discount", {
      method: "PUT",
      body: { id: "012345678", password: BANK_PW, num: "XY99" },
    });
    expect(save.status).toBe(200);
    const saveText = await save.text();
    expect(saveText).not.toContain(BANK_PW);

    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: { userId: UUID, email: "a@b.co", displayName: "A", avatarUrl: null, createdAt: "2024-01-01T00:00:00.000Z" },
          household: { householdId: UUID, name: "בית", baseCurrency: "ILS", timezone: "Asia/Jerusalem", status: "active", createdAt: "2024-01-01T00:00:00.000Z" },
          role: "owner",
        }),
        { status: 200, headers: { "content-type": "application/json", "set-cookie": "fm_session=session-token-XYZ; Path=/; HttpOnly; Expires=Wed, 01 Jan 2031 00:00:00 GMT" } },
      ),
    );
    const login = await req("/local/login", {
      method: "POST",
      body: { apiOrigin: "https://api.example/", email: "a@b.co", password: APP_PW },
    });
    expect(login.status).toBe(200);
    const loginText = await login.text();
    expect(loginText).not.toContain("session-token-XYZ");
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://api.example/api/auth/login");
    expect(String(init.body)).toContain(APP_PW);

    const state = await (await req("/local/state")).text();
    for (const secret of [BANK_PW, "012345678", "XY99", "session-token-XYZ", APP_PW, "correct horse"]) {
      expect(state).not.toContain(secret);
    }
    const parsed = JSON.parse(state) as { providers: { id: string; saved: boolean }[]; session: { email: string } };
    expect(parsed.providers.find((p) => p.id === "discount")?.saved).toBe(true);
    expect(parsed.session.email).toBe("a@b.co");
    expect(vault.get().session?.token).toBe("session-token-XYZ");
  });

  it("rejects unknown credential keys and unknown providers", async () => {
    await req("/local/vault", { method: "POST", body: { passphrase: "correct horse" } });
    expect((await req("/local/providers/max", { method: "PUT", body: { username: "u", password: "p", extra: "x" } })).status).toBe(400);
    expect((await req("/local/providers/hapoalim", { method: "PUT", body: { username: "u", password: "p" } })).status).toBe(404);
  });

  it("refuses provider writes while the vault is locked", async () => {
    expect((await req("/local/providers/max", { method: "PUT", body: { username: "u", password: "p" } })).status).toBe(409);
  });

  it("returns a Hebrew error for a wrong vault passphrase", async () => {
    await req("/local/vault", { method: "POST", body: { passphrase: "correct horse" } });
    await req("/local/lock", { method: "POST" });
    const res = await req("/local/vault", { method: "POST", body: { passphrase: "wrong horse" } });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("סיסמת הכספת שגויה.");
  });
});
