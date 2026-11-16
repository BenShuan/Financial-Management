// WEB_ORIGIN may be a comma-separated list (production + preview domains).
// Normalized so a pasted trailing slash doesn't silently block every request.
const normalizeOrigin = (origin: string) => origin.trim().replace(/\/+$/, "");

export const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Configured origin(s) in production; any localhost port in dev (Vite may auto-assign one). */
export function isAllowedOrigin(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  return allowedOrigins.includes(normalized) || LOCALHOST.test(normalized);
}

/** Origin echoed back in CORS headers (first configured origin when not allowed). */
export function corsOrigin(origin: string): string {
  return isAllowedOrigin(origin) ? origin : (allowedOrigins[0] ?? "");
}
