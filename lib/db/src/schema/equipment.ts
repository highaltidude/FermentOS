import { pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const equipmentConditionEnum = ["new", "good", "fair", "poor"] as const;
export type EquipmentCondition = typeof equipmentConditionEnum[number];

export const equipmentTable = pgTable("equipment", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand"),
  model: text("model"),
  category: text("category").notNull(),
  purchasedDate: date("purchased_date"),
  purchasePrice: text("purchase_price"),
  condition: text("condition", { enum: equipmentConditionEnum }),
  serialNumber: text("serial_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEquipmentSchema = createInsertSchema(equipmentTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipmentTable.$inferSelect;
