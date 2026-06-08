import { pgTable, serial, text, real, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { recipesTable } from "./recipes";

// Lifecycle stages: brew_day → fermenting → conditioning → packaged.
// On startup the api-server runs migrateLegacyStatuses() which converts any
// rows from older schemas (planned, scheduled, brewing, complete) into the
// new values.
export const brewStatusEnum = ["brew_day", "fermenting", "conditioning", "packaged"] as const;

export const brewSessionsTable = pgTable("brew_sessions", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").references(() => recipesTable.id, { onDelete: "set null" }),
  recipeName: text("recipe_name").notNull(),
  status: text("status", { enum: brewStatusEnum }).notNull().default("brew_day"),
  brewDate: date("brew_date").notNull(),
  plannedDate: date("planned_date"),
  packagedDate: date("packaged_date"),
  batchSizeGallons: real("batch_size_gallons").notNull(),
  originalGravityActual: real("original_gravity_actual"),
  finalGravityActual: real("final_gravity_actual"),
  abvActual: real("abv_actual"),
  rating: integer("rating"),
  notes: text("notes"),
  fermentTempMin: real("ferment_temp_min"),
  fermentTempMax: real("ferment_temp_max"),
  tastingNotes: text("tasting_notes"),
  photoPath: text("photo_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBrewSessionSchema = createInsertSchema(brewSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrewSession = z.infer<typeof insertBrewSessionSchema>;
export type BrewSession = typeof brewSessionsTable.$inferSelect;

export const fermentationReadingSourceEnum = ["manual", "ispindel"] as const;

export const fermentationReadingsTable = pgTable("fermentation_readings", {
  id: serial("id").primaryKey(),
  brewSessionId: integer("brew_session_id").notNull().references(() => brewSessionsTable.id, { onDelete: "cascade" }),
  readingAt: timestamp("reading_at", { withTimezone: true }).notNull(),
  temperatureFahrenheit: real("temperature_fahrenheit"),
  gravity: real("gravity"),
  ph: real("ph"),
  notes: text("notes"),
  source: text("source", { enum: fermentationReadingSourceEnum }).notNull().default("manual"),
});

export const insertFermentationReadingSchema = createInsertSchema(fermentationReadingsTable).omit({ id: true });
export type InsertFermentationReading = z.infer<typeof insertFermentationReadingSchema>;
export type FermentationReading = typeof fermentationReadingsTable.$inferSelect;

export const brewSessionStatusLogTable = pgTable("brew_session_status_log", {
  id: serial("id").primaryKey(),
  brewSessionId: integer("brew_session_id").notNull().references(() => brewSessionsTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: brewStatusEnum }).notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
});

export type BrewSessionStatusLog = typeof brewSessionStatusLogTable.$inferSelect;
