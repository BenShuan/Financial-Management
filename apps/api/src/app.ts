import { createRoute } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import {
  healthResponseSchema,
  sessionContextSchema,
} from "@financial-management/shared";
import { corsOrigin } from "./lib/origins.js";
import { createRouter } from "./lib/router.js";
import { accessGate, csrfOriginCheck, sessionAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { buildSessionContext } from "./routes/session-context.js";
import { accountsRouter } from "./routes/accounts.js";
import { categoriesRouter } from "./routes/categories.js";
import { budgetsRouter } from "./routes/budgets.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { importsRouter } from "./routes/imports.js";
import { reconciliationRouter } from "./routes/reconciliation.js";
import { transactionsRouter } from "./routes/transactions.js";

const app = createRouter();

app.use(
  "/*",
  cors({
    origin: corsOrigin,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: "http_error", message: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "internal_error", message: "שגיאה פנימית" }, 500);
});

const healthRoute = createRoute({
  method: "get",
  path: "/api/health",
  tags: ["System"],
  summary: "Health check",
  responses: {
    200: {
      description: "Service is healthy",
      content: { "application/json": { schema: healthResponseSchema } },
    },
  },
});

app.openapi(healthRoute, (c) => {
  return c.json({ status: "ok" as const, service: "financial-management-api" });
});

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health") return next();
  return accessGate(c, next);
});

app.use("/api/*", csrfOriginCheck);

// Public endpoints; everything else under /api requires a valid session cookie.
const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/docs",
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/logout",
]);
app.use("/api/*", async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next();
  return sessionAuth(c, next);
});

const meRoute = createRoute({
  method: "get",
  path: "/api/me",
  tags: ["System"],
  summary: "Current user, household, and role",
  responses: {
    200: {
      description: "Session context",
      content: { "application/json": { schema: sessionContextSchema } },
    },
  },
});

app.openapi(meRoute, async (c) => c.json(await buildSessionContext(c.get("auth"))));

app.route("/", authRouter);
app.route("/", accountsRouter);
app.route("/", categoriesRouter);
app.route("/", transactionsRouter);
app.route("/", dashboardRouter);
app.route("/", budgetsRouter);
app.route("/", importsRouter);
app.route("/", reconciliationRouter);

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Financial Management API",
  },
});

app.get("/api/docs", swaggerUI({ url: "/openapi.json" }));

export { app };
