import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://fm:fm@localhost:5432/financial_management";

const pool = new pg.Pool({ connectionString });

export const db = drizzle(pool, { schema });
