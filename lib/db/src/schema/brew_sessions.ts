import { pgTable, serial, text, real, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { recipesTable } from "./recipes";

// Lifecycle stages: brew_day → fermenting → conditioning → packaged.
// On startup the api-server runs migrateLegacyStatuses() which converts any
// rows from older schemas (planned, scheduled, brewing, complete) into the
// new values.
export const brewStatusEnum = ["brew_day", "fermenting", "conditioning", "packaged"] as const;

// How a finished batch was packaged. Null until the batch is packaged — and
// still null for batches packaged before this was tracked.
export const packagingMethodEnum = ["keg", "bottle"] as const;

// Tasting scorecard. Filled in once a batch is packaged: three 1-5 sensory
// sub-scores plus a 1-10 overall, with off-flavours and brew-again intent
// recorded alongside but deliberately not scored.
export const brewAgainEnum = ["as_is", "with_tweaks", "no"] as const;

// "None" is the empty array rather than a tag of its own.
export const offFlavorEnum = [
  "diacetyl",
  "acetaldehyde",
  "dms",
  "phenolic",
  "oxidized",
  "astringent",
  "sour",
  "solvent",
  "sulfur",
  "light_struck",
] as const;

export const brewSessionsTable = pgTable("brew_sessions", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").references(() => recipesTable.id, { onDelete: "set null" }),
  recipeName: text("recipe_name").notNull(),
  status: text("status", { enum: brewStatusEnum }).notNull().default("brew_day"),
  brewDate: date("brew_date").notNull(),
  plannedDate: date("planned_date"),
  packagedDate: date("packaged_date"),
  packagingMethod: text("packaging_method", { enum: packagingMethodEnum }),
  batchSizeGallons: real("batch_size_gallons").notNull(),
  originalGravityActual: real("original_gravity_actual"),
  finalGravityActual: real("final_gravity_actual"),
  abvActual: real("abv_actual"),
  appearanceAromaScore: integer("appearance_aroma_score"),
  flavorBalanceScore: integer("flavor_balance_score"),
  mouthfeelScore: integer("mouthfeel_score"),
  overallScore: integer("overall_score"),
  offFlavors: text("off_flavors", { enum: offFlavorEnum }).array(),
  brewAgain: text("brew_again", { enum: brewAgainEnum }),
  // Set whenever the scorecard is saved. This — not overallScore — is what
  // distinguishes "never rated" from a partially filled card.
  ratedAt: timestamp("rated_at", { withTimezone: true }),
  notes: text("notes"),
  fermentTempMin: real("ferment_temp_min"),
  fermentTempMax: real("ferment_temp_max"),
  fermentTempIdeal: real("ferment_temp_ideal"),
  autoAdvanceToConditioning: boolean("auto_advance_to_conditioning"),
  tastingNotes: text("tasting_notes"),
  photoPath: text("photo_path"),
  // Boil timer. Stored as timestamps rather than a remaining count so every
  // device, and the server-side addition alerts, derive the same countdown:
  // remaining = boilMinutes - (now|pausedAt - startedAt - pausedMs).
  // All null until a boil is started.
  boilMinutes: integer("boil_minutes"),
  boilStartedAt: timestamp("boil_started_at", { withTimezone: true }),
  boilPausedAt: timestamp("boil_paused_at", { withTimezone: true }),
  boilPausedMs: integer("boil_paused_ms"),
  boilEndedAt: timestamp("boil_ended_at", { withTimezone: true }),
  // recipe_ingredients ids ticked off during the boil. Not a foreign key: the
  // recipe can be edited after brew day and the checklist is only a record.
  boilDoneAdditionIds: integer("boil_done_addition_ids").array(),
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
