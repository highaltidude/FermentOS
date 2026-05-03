import { pgTable, serial, text, real, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { recipesTable } from "./recipes";

// "scheduled" replaces the older "planned" status. The api-server migrates any
// legacy rows on startup (see migrateLegacyStatuses in app init).
export const brewStatusEnum = ["scheduled", "brewing", "fermenting", "conditioning", "packaged", "complete"] as const;

export const brewSessionsTable = pgTable("brew_sessions", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").references(() => recipesTable.id, { onDelete: "set null" }),
  recipeName: text("recipe_name").notNull(),
  status: text("status", { enum: brewStatusEnum }).notNull().default("scheduled"),
  // Actual brew day (when fermentables hit the kettle). For scheduled sessions
  // this is the intended date; when the user starts the brew it is overwritten
  // with today's date and the original intent is preserved in plannedDate.
  brewDate: date("brew_date").notNull(),
  // Set when a scheduled session is started so historical analytics can compare
  // intended vs actual start dates. Null for sessions that were never scheduled.
  plannedDate: date("planned_date"),
  packagedDate: date("packaged_date"),
  batchSizeGallons: real("batch_size_gallons").notNull(),
  originalGravityActual: real("original_gravity_actual"),
  finalGravityActual: real("final_gravity_actual"),
  abvActual: real("abv_actual"),
  rating: integer("rating"),
  notes: text("notes"),
  tastingNotes: text("tasting_notes"),
  photoPath: text("photo_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBrewSessionSchema = createInsertSchema(brewSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrewSession = z.infer<typeof insertBrewSessionSchema>;
export type BrewSession = typeof brewSessionsTable.$inferSelect;

export const fermentationReadingsTable = pgTable("fermentation_readings", {
  id: serial("id").primaryKey(),
  brewSessionId: integer("brew_session_id").notNull().references(() => brewSessionsTable.id, { onDelete: "cascade" }),
  readingAt: timestamp("reading_at").notNull(),
  temperatureFahrenheit: real("temperature_fahrenheit"),
  gravity: real("gravity"),
  ph: real("ph"),
  notes: text("notes"),
});

export const insertFermentationReadingSchema = createInsertSchema(fermentationReadingsTable).omit({ id: true });
export type InsertFermentationReading = z.infer<typeof insertFermentationReadingSchema>;
export type FermentationReading = typeof fermentationReadingsTable.$inferSelect;

export const brewSessionStatusLogTable = pgTable("brew_session_status_log", {
  id: serial("id").primaryKey(),
  brewSessionId: integer("brew_session_id").notNull().references(() => brewSessionsTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: brewStatusEnum }).notNull(),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
  notes: text("notes"),
});

export type BrewSessionStatusLog = typeof brewSessionStatusLogTable.$inferSelect;
