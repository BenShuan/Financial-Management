import { createRoute } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import {
  healthResponseSchema,
  sessionContextSchema,
} from "@financial-management/shared";
import { db } from "./db/index.js";
import { households, users } from "./db/schema.js";
import { createRouter } from "./lib/router.js";
import { accessGate, devAuth } from "./middleware/auth.js";
import { accountsRouter } from "./routes/accounts.js";
import { categoriesRouter } from "./routes/categories.js";
import { budgetsRouter } from "./routes/budgets.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { importsRouter } from "./routes/imports.js";
import { reconciliationRouter } from "./routes/reconciliation.js";
import { transactionsRouter } from "./routes/transactions.js";

const app = createRouter();

// WEB_ORIGIN may be a comma-separated list (production + preview domains).
// Normalized so a pasted trailing slash doesn't silently block every request.
const normalizeOrigin = (origin: string) => origin.trim().replace(/\/+$/, "");
const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);
console.log("allowedOrigins", allowedOrigins, "from WEB_ORIGIN", process.env.WEB_ORIGIN);
app.use(
  "/*",
  cors({
    // Configured origin(s) in production; any localhost port in dev (Vite may auto-assign one).
    origin: (origin) => {
      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.includes(normalized)) return origin;
      return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)
        ? origin
        : (allowedOrigins[0] ?? "");
    },
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

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health" || c.req.path === "/api/docs") return next();
  return devAuth(c, next);
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

app.openapi(meRoute, async (c) => {
  const auth = c.get("auth");
  const [user] = await db.select().from(users).where(eq(users.userId, auth.userId));
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.householdId, auth.householdId));
  if (!user || !household) {
    throw new HTTPException(500, { message: "חסר הקשר משתמש" });
  }
  return c.json({
    user: {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    },
    household: {
      householdId: household.householdId,
      name: household.name,
      baseCurrency: household.baseCurrency,
      timezone: household.timezone,
      status: household.status,
      createdAt: household.createdAt.toISOString(),
    },
    role: auth.role,
  });
});

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
