import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Placeholder table for migrations pipeline — replace with domain tables from docs/agent. */
export const households = pgTable("households", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
