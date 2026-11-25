import { randomBytes, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { BANK_SYNC_PROVIDERS, bankSyncProviderSchema, type BankSyncProvider } from "@financial-management/shared";
import { createApiClient, login, normalizeOrigin, type FetchFn } from "./api.js";
import type { ConfigStore } from "./config.js";
import { ApiError, LocalError, MSG, toUserMessage } from "./errors.js";
import { PROVIDERS } from "./providers.js";
import type { SyncRunner } from "./sync.js";
import { renderPage } from "./ui/page.js";
import { VaultError, type Vault } from "./vault.js";

/**
 * Local-only HTTP surface. Bound to 127.0.0.1 by index.ts. Guards:
 * 1. Host header must be 127.0.0.1:<port> or localhost:<port> (DNS-rebinding defense).
 * 2. Every /local/* call needs X-Local-Token = the per-launch token (no CORS headers are sent,
 *    so other origins can neither send the header nor read responses).
 * Credentials are write-only: no route returns credential values or the session token.
 */

export interface LocalAppDeps {
  launchToken: string;
  getPort: () => number;
  vault: Vault;
  configStore: ConfigStore;
  runner: SyncRunner;
  fetchFn?: FetchFn;
}

export const TOKEN_HEADER = "x-local-token";

function tokenMatches(expected: string, given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

const vaultBody = z.object({ passphrase: z.string().min(1).max(200) }).strict();
const loginBody = z
  .object({ apiOrigin: z.string().min(1).max(300), email: z.string().email().max(200), password: z.string().min(1).max(200) })
  .strict();
const settingsBody = z
  .object({ lookbackDays: z.number().int().min(1).max(365), overlapDays: z.number().int().min(0).max(60) })
  .strict();
const syncBody = z.object({ providers: z.array(bankSyncProviderSchema).optional() }).strict();

function credentialsSchema(provider: BankSyncProvider) {
  const shape = Object.fromEntries(PROVIDERS[provider].fields.map((f) => [f.key, z.string().trim().min(1).max(200)]));
  return z.object(shape).strict();
}

function vaultErrorResponse(c: Context, err: VaultError) {
  if (err.code === "wrong_passphrase") return c.json({ error: MSG.wrongPassphrase }, 401);
  if (err.code === "short_passphrase") return c.json({ error: MSG.shortPassphrase }, 400);
  if (err.code === "locked") return c.json({ error: MSG.vaultLocked }, 409);
  return c.json({ error: "קובץ הכספת פגום או חסר." }, 500);
}

export function createLocalApp(deps: LocalAppDeps): Hono {
  const { vault, configStore, runner } = deps;
  const fetchFn = deps.fetchFn ?? fetch;
  const app = new Hono();

  app.use("*", async (c, next) => {
    const port = deps.getPort();
    const host = c.req.header("host") ?? "";
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return c.text("Forbidden", 403);
    await next();
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
  });

  app.use("/local/*", async (c, next) => {
    if (!tokenMatches(deps.launchToken, c.req.header(TOKEN_HEADER))) return c.json({ error: "Forbidden" }, 403);
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof VaultError) return vaultErrorResponse(c, err);
    if (err instanceof LocalError) return c.json({ error: err.message }, 409);
    if (err instanceof ApiError) return c.json({ error: err.message }, 502);
    return c.json({ error: toUserMessage(err) }, 500);
  });

  app.get("/", (c) => {
    const nonce = randomBytes(16).toString("base64");
    c.header(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    );
    return c.html(renderPage(nonce));
  });

  app.get("/local/state", async (c) => {
    const config = await configStore.load();
    const data = vault.unlocked ? vault.get() : null;
    const s = data?.session;
    return c.json({
      vaultExists: await vault.exists(),
      unlocked: vault.unlocked,
      apiOrigin: config.apiOrigin || process.env.FM_API_ORIGIN || "",
      session: s
        ? { email: s.email, displayName: s.displayName ?? null, householdName: s.householdName ?? null, role: s.role ?? null, expiresAt: s.expiresAt }
        : null,
      providers: BANK_SYNC_PROVIDERS.map((p) => ({
        id: p,
        label: PROVIDERS[p].label,
        kind: PROVIDERS[p].kind,
        fields: PROVIDERS[p].fields,
        saved: !!data?.providers[p],
      })),
      settings: { lookbackDays: config.lookbackDays, overlapDays: config.overlapDays },
      lastSuccessfulSyncAt: config.lastSuccessfulSyncAt,
      running: runner.isRunning,
      lastReport: runner.lastReport,
    });
  });

  app.post("/local/vault", async (c) => {
    const body = vaultBody.safeParse(await readJson(c));
    if (!body.success) return c.json({ error: MSG.invalidInput }, 400);
    if (await vault.exists()) await vault.unlock(body.data.passphrase);
    else await vault.create(body.data.passphrase);
    return c.json({ unlocked: true });
  });

  app.post("/local/lock", (c) => {
    vault.lock();
    return c.json({ unlocked: false });
  });

  app.post("/local/login", async (c) => {
    const body = loginBody.safeParse(await readJson(c));
    if (!body.success) return c.json({ error: MSG.invalidInput }, 400);
    if (!vault.unlocked) return c.json({ error: MSG.vaultLocked }, 409);
    let origin: string;
    try {
      origin = normalizeOrigin(body.data.apiOrigin);
    } catch (err) {
      return c.json({ error: err instanceof ApiError ? err.message : "כתובת השרת אינה תקינה" }, 400);
    }
    const result = await login(fetchFn, origin, body.data.email, body.data.password);
    await vault.update((d) => {
      d.session = {
        apiOrigin: origin,
        token: result.token,
        expiresAt: result.expiresAt,
        email: result.context.user.email,
        displayName: result.context.user.displayName,
        householdName: result.context.household.name,
        role: result.context.role,
      };
    });
    const config = await configStore.load();
    await configStore.save({ ...config, apiOrigin: origin });
    const isAdmin = result.context.role === "owner" || result.context.role === "admin";
    return c.json({ loggedIn: true, warning: isAdmin ? null : MSG.notAdmin });
  });

  app.post("/local/logout", async (c) => {
    if (!vault.unlocked) return c.json({ error: MSG.vaultLocked }, 409);
    const session = vault.get().session;
    if (session) {
      try {
        await createApiClient(fetchFn, session.apiOrigin, session.token).logout();
      } catch {
        // best effort; the token is dropped locally either way
      }
      await vault.update((d) => {
        delete d.session;
      });
    }
    return c.json({ loggedIn: false });
  });

  app.put("/local/providers/:id", async (c) => {
    const id = bankSyncProviderSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: MSG.invalidInput }, 404);
    if (!vault.unlocked) return c.json({ error: MSG.vaultLocked }, 409);
    const body = credentialsSchema(id.data).safeParse(await readJson(c));
    if (!body.success) return c.json({ error: "יש למלא את כל שדות פרטי הכניסה." }, 400);
    await vault.update((d) => {
      d.providers[id.data] = body.data as Record<string, string>;
    });
    return c.json({ saved: true });
  });

  app.delete("/local/providers/:id", async (c) => {
    const id = bankSyncProviderSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: MSG.invalidInput }, 404);
    if (!vault.unlocked) return c.json({ error: MSG.vaultLocked }, 409);
    await vault.update((d) => {
      delete d.providers[id.data];
    });
    return c.json({ saved: false });
  });

  app.put("/local/settings", async (c) => {
    const body = settingsBody.safeParse(await readJson(c));
    if (!body.success) return c.json({ error: MSG.invalidInput }, 400);
    const config = await configStore.load();
    await configStore.save({ ...config, ...body.data });
    return c.json(body.data);
  });

  app.post("/local/sync", async (c) => {
    const body = syncBody.safeParse((await readJson(c)) ?? {});
    if (!body.success) return c.json({ error: MSG.invalidInput }, 400);
    const report = await runner.run(body.data.providers);
    return c.json(report);
  });

  return app;
}
