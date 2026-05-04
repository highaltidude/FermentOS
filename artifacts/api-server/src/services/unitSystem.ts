import { eq } from "drizzle-orm";
import { db, appConfigTable } from "@workspace/db";

const KEY = "unit_system";
export type UnitSystem = "imperial" | "metric" | "both";
const VALID: UnitSystem[] = ["imperial", "metric", "both"];

export function isUnitSystem(v: unknown): v is UnitSystem {
  return typeof v === "string" && (VALID as string[]).includes(v);
}

export async function getUnitSystem(): Promise<UnitSystem> {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, KEY));
  return isUnitSystem(row?.value) ? row.value : "imperial";
}

export async function setUnitSystem(system: UnitSystem): Promise<void> {
  await db
    .insert(appConfigTable)
    .values({ key: KEY, value: system })
    .onConflictDoUpdate({
      target: appConfigTable.key,
      set: { value: system, updatedAt: new Date() },
    });
}
