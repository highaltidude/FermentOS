import { pgTable, serial, text, real, timestamp, date } from "drizzle-orm/pg-core";
import { ingredientTypeEnum } from "./recipes";

export const maltTypeEnum = ["lme", "dme", "all_grain"] as const;

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ingredientTypeEnum }).notNull(),
  maltType: text("malt_type", { enum: maltTypeEnum }),
  amount: real("amount").notNull(),
  unit: text("unit").notNull(),
  cost: real("cost"),
  purchasedDate: date("purchased_date"),
  expiryDate: date("expiry_date"),
  supplier: text("supplier"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InventoryItem = typeof inventoryTable.$inferSelect;
