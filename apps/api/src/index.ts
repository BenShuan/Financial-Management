import "dotenv/config";
import { serve } from "@hono/node-server";
import { runMigrations } from "./db/migrate.js";
import { app } from "./app.js";

// Migrate before serving: a bad DATABASE_URL fails the deploy fast instead of
// surfacing as 500s behind a green health check.
try {
  await runMigrations();
  console.log("Migrations up to date.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}

const port = Number(process.env.PORT) || 8787;

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
    console.log(`OpenAPI UI: http://localhost:${info.port}/api/docs`);
  },
);
