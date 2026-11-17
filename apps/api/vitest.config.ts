import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration suites share one Postgres database and each runs migrations in
    // beforeAll; running files in parallel races on a fresh DB (__drizzle_migrations).
    fileParallelism: false,
  },
});
