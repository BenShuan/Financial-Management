import {
  healthResponseSchema,
  type HealthResponse,
} from "@financial-management/shared";

function apiOrigin(): string {
  return import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8787";
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${apiOrigin()}/api/health`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  const data: unknown = await res.json();
  return healthResponseSchema.parse(data);
}
