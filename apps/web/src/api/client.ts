import type { z } from "zod";

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8787";

/** Deployment gate until real auth lands: key the user typed once, kept locally. */
const ACCESS_KEY_STORAGE = "fm.access-key";

export function getAccessKey(): string | null {
  return localStorage.getItem(ACCESS_KEY_STORAGE);
}

export function setAccessKey(key: string): void {
  localStorage.setItem(ACCESS_KEY_STORAGE, key);
}

/** Probes /api/me; false only when the API rejects the access key (401). */
export async function checkAccess(key: string | null): Promise<boolean> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/me`, {
      credentials: "include",
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
    });
    return res.status !== 401;
  } catch {
    // API unreachable — let the app render and surface its own errors.
    return true;
  }
}

export class ApiError extends Error {
  status: number;
  issues?: { path: string; message: string }[];

  constructor(status: number, message: string, issues?: ApiError["issues"]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

/** Typed fetch: JSON in/out, Zod-parsed responses, Hebrew error messages from the API. */
export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const accessKey = getAccessKey();
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method: options?.method ?? "GET",
    credentials: "include",
    headers: {
      ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessKey ? { Authorization: `Bearer ${accessKey}` } : {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    let message = `הבקשה נכשלה (${res.status})`;
    let issues: ApiError["issues"];
    try {
      const data = (await res.json()) as {
        message?: string;
        issues?: { path: string; message: string }[];
      };
      if (data.message) message = data.message;
      if (data.issues?.length) {
        issues = data.issues;
        message = data.issues.map((i) => i.message).join(", ");
      }
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message, issues);
  }
  const data: unknown = await res.json();
  return schema.parse(data);
}
