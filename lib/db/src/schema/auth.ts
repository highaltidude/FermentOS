import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const apiTokensTable = pgTable("api_tokens", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export type ApiToken = typeof apiTokensTable.$inferSelect;
