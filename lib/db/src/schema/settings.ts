import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const beerStylesTable = pgTable("beer_styles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBeerStyleSchema = createInsertSchema(beerStylesTable).omit({ id: true, createdAt: true });
export type InsertBeerStyle = z.infer<typeof insertBeerStyleSchema>;
export type BeerStyle = typeof beerStylesTable.$inferSelect;

export const appConfigTable = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
