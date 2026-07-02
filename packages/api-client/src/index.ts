import {
  healthResponseSchema,
  type HealthResponse,
} from "@financial-management/shared";

export type { HealthResponse };

/**
 * Thin typed fetch wrapper. Replace or extend with code generated from OpenAPI when ready.
 */
export function createApiClient(baseUrl: string) {
  const origin = baseUrl.replace(/\/$/, "");

  return {
    async getHealth(init?: RequestInit): Promise<HealthResponse> {
      const res = await fetch(`${origin}/api/health`, {
        credentials: "include",
        ...init,
      });
      if (!res.ok) {
        throw new Error(`GET /api/health failed (${res.status})`);
      }
      const data: unknown = await res.json();
      return healthResponseSchema.parse(data);
    },
  };
}
