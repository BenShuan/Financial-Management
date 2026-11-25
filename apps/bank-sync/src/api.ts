import {
  bankSyncUploadResultSchema,
  sessionContextSchema,
  type BankSyncUpload,
  type BankSyncUploadResult,
  type SessionContext,
} from "@financial-management/shared";
import type { z } from "zod";
import { ApiError, MSG, apiErrorMessage } from "./errors.js";

/** Client for the FM API. Auth = the user's own session cookie (token kept only in the vault). */

export type FetchFn = typeof fetch;

const SESSION_COOKIE = "fm_session";
/** Server body limit is 5 MB; stay below it and fail locally with a Hebrew message. */
export const MAX_UPLOAD_BYTES = 4_900_000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https only; plain http is allowed just for a local dev API on a loopback host. */
export function normalizeOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin.trim());
  } catch {
    throw new ApiError(400, "כתובת השרת אינה תקינה");
  }
  const allowed = url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
  if (!allowed) throw new ApiError(400, "כתובת השרת חייבת להתחיל ב-https://");
  return url.origin;
}

async function serverMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: unknown; issues?: { message?: unknown }[] };
    if (typeof body.message === "string") return body.message;
    const first = body.issues?.[0]?.message;
    return typeof first === "string" ? first : undefined;
  } catch {
    return undefined;
  }
}

async function request(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, { ...init, redirect: "error" });
  } catch {
    throw new ApiError(0, MSG.network);
  }
}

async function parseOk<T extends z.ZodTypeAny>(res: Response, schema: T): Promise<z.infer<T>> {
  if (!res.ok) throw new ApiError(res.status, apiErrorMessage(res.status, await serverMessage(res)));
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(res.status, MSG.badResponse);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError(res.status, MSG.badResponse);
  return parsed.data;
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  context: SessionContext;
}

/** Extract the fm_session token and its expiry from Set-Cookie headers. */
export function readSessionCookie(setCookies: string[], now = new Date()): { token: string; expiresAt: string } | null {
  for (const header of setCookies) {
    const [pair, ...attrs] = header.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (!pair || eq < 0 || pair.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const token = decodeURIComponent(pair.slice(eq + 1).trim());
    if (!token) continue;
    let expiresAt = new Date(now.getTime() + THIRTY_DAYS_MS).toISOString();
    for (const attr of attrs) {
      const [k, v] = attr.split("=");
      if (k?.trim().toLowerCase() === "expires" && v) {
        const d = new Date(v.trim());
        if (!Number.isNaN(d.getTime())) expiresAt = d.toISOString();
      }
    }
    return { token, expiresAt };
  }
  return null;
}

export async function login(fetchFn: FetchFn, origin: string, email: string, password: string): Promise<LoginResult> {
  const res = await request(fetchFn, `${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) throw new ApiError(401, (await serverMessage(res)) ?? "אימייל או סיסמה שגויים");
  // 404/405 here almost always means the origin is the web app (Vite/Vercel), not the API server.
  if (res.status === 404 || res.status === 405) throw new ApiError(res.status, MSG.notApiOrigin);
  const context = await parseOk(res, sessionContextSchema);
  const cookie = readSessionCookie(res.headers.getSetCookie());
  if (!cookie) throw new ApiError(res.status, MSG.badResponse);
  return { ...cookie, context };
}

export interface ApiClient {
  me(): Promise<SessionContext>;
  upload(body: BankSyncUpload): Promise<BankSyncUploadResult>;
  logout(): Promise<void>;
}

export function createApiClient(fetchFn: FetchFn, origin: string, token: string): ApiClient {
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
  return {
    async me() {
      const res = await request(fetchFn, `${origin}/api/me`, { headers: { cookie } });
      return parseOk(res, sessionContextSchema);
    },
    async upload(body) {
      const payload = JSON.stringify(body);
      if (Buffer.byteLength(payload) > MAX_UPLOAD_BYTES) throw new ApiError(413, MSG.tooLarge);
      const res = await request(fetchFn, `${origin}/api/sync/uploads`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: payload,
      });
      return parseOk(res, bankSyncUploadResultSchema);
    },
    async logout() {
      await request(fetchFn, `${origin}/api/auth/logout`, { method: "POST", headers: { cookie } });
    },
  };
}
