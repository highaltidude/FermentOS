import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recipesTable = pgTable("recipes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  style: text("style").notNull(),
  batchSizeGallons: real("batch_size_gallons").notNull(),
  originalGravity: real("original_gravity"),
  finalGravity: real("final_gravity"),
  abv: real("abv"),
  ibu: real("ibu"),
  colorSrm: real("color_srm"),
  estimatedBrewTimeMinutes: integer("estimated_brew_time_minutes"),
  efficiencyPercent: real("efficiency_percent"),
  caloriesPerServing: integer("calories_per_serving"),
  notes: text("notes"),
  fermentTempMin: real("ferment_temp_min"),
  fermentTempMax: real("ferment_temp_max"),
  daysPlanned: integer("days_planned"),
  daysBrewing: integer("days_brewing"),
  daysFermenting: integer("days_fermenting"),
  daysConditioning: integer("days_conditioning"),
  daysPackaged: integer("days_packaged"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRecipeSchema = createInsertSchema(recipesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type Recipe = typeof recipesTable.$inferSelect;

export const ingredientTypeEnum = ["malt", "hop", "yeast", "adjunct", "water_agent", "other"] as const;
export const ingredientUseEnum = ["mash", "boil", "dry_hop", "whirlpool", "primary", "secondary", "packaging", "other"] as const;

export const recipeIngredientsTable = pgTable("recipe_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ingredientTypeEnum }).notNull(),
  amount: real("amount").notNull(),
  unit: text("unit").notNull(),
  use: text("use", { enum: ingredientUseEnum }),
  timingMinutes: integer("timing_minutes"),
  notes: text("notes"),
});

export const insertRecipeIngredientSchema = createInsertSchema(recipeIngredientsTable).omit({ id: true });
export type InsertRecipeIngredient = z.infer<typeof insertRecipeIngredientSchema>;
export type RecipeIngredient = typeof recipeIngredientsTable.$inferSelect;

export const stepPhaseEnum = ["mash", "boil", "fermentation", "conditioning", "packaging", "other"] as const;

export const recipeStepsTable = pgTable("recipe_steps", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  phase: text("phase", { enum: stepPhaseEnum }),
  body: text("body").notNull(),
  durationMinutes: integer("duration_minutes"),
});

export const insertRecipeStepSchema = createInsertSchema(recipeStepsTable).omit({ id: true });
export type InsertRecipeStep = z.infer<typeof insertRecipeStepSchema>;
export type RecipeStep = typeof recipeStepsTable.$inferSelect;
