import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const beerStylesTable = pgTable("beer_styles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BeerStyle = typeof beerStylesTable.$inferSelect;

export const appConfigTable = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
