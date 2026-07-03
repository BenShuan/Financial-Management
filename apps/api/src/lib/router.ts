import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types.js";

/** Router factory with a consistent 400 shape for Zod validation failures. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: "validation_error",
            issues: result.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
          400,
        );
      }
    },
  });
}
