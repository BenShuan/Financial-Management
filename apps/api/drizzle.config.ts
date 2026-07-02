import { defineConfig } from "drizzle-kit";

export default defineConfig({  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://fm:fm@localhost:5432/financial_management",
  },
});
