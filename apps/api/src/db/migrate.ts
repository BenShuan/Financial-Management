import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index.js";

// Resolved relative to this module (dist/db/migrate.js -> ../../drizzle) so the
// server can start from any cwd; the SQL + meta/ journal are committed.
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

/**
 * Applies pending migrations at boot. Uses the same __drizzle_migrations
 * bookkeeping table as `drizzle-kit migrate`, so either path is a no-op
 * after the other has run.
 */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder });
}
