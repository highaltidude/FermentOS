import { pgTable, serial, text, real, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { ingredientTypeEnum } from "./recipes";

export const maltTypeEnum = ["lme", "dme", "all_grain"] as const;

// A place an ingredient can be bought. `price` is per unit of the item's `unit`.
export type InventorySupplier = {
  name: string;
  price: number | null;
  url: string | null;
  preferred: boolean;
};

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ingredientTypeEnum }).notNull(),
  maltType: text("malt_type", { enum: maltTypeEnum }),
  amount: real("amount").notNull(),
  unit: text("unit").notNull(),
  purchasedDate: date("purchased_date"),
  expiryDate: date("expiry_date"),
  suppliers: jsonb("suppliers").$type<InventorySupplier[]>().notNull().default([]),
  // Legacy single supplier and price, copied into `suppliers` at boot and no
  // longer read or written. Kept so rollback.sh (which never runs push) leaves
  // older code with the columns it selects, and so push only adds `suppliers`
  // instead of stopping at a rename prompt that would skip the rest of the
  // release's schema changes.
  cost: real("cost"),
  supplier: text("supplier"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InventoryItem = typeof inventoryTable.$inferSelect;
