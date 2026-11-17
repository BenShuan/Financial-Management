import type { z } from "zod";

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8787";

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
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method: options?.method ?? "GET",
    credentials: "include",
    headers: {
      ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {}),
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
