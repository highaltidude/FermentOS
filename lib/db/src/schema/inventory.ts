import { pgTable, serial, text, real, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ingredientTypeEnum } from "./recipes";

export const maltTypeEnum = ["lme", "dme", "all_grain"] as const;

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ingredientTypeEnum }).notNull(),
  maltType: text("malt_type", { enum: maltTypeEnum }),
  amount: real("amount").notNull(),
  unit: text("unit").notNull(),
  purchasedDate: date("purchased_date"),
  expiryDate: date("expiry_date"),
  supplier: text("supplier"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type InventoryItem = typeof inventoryTable.$inferSelect;
