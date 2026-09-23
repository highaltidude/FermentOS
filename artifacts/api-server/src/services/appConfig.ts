import { eq } from "drizzle-orm";
import { db, appConfigTable } from "@workspace/db";

/**
 * Thin accessors for the app_config key/value table. Every setting lives in
 * one row keyed by name, so callers only ever need read, upsert and delete.
 */

export async function getConfigValue(key: string): Promise<string | null> {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, key));
  return row?.value ?? null;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  await db
    .insert(appConfigTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value, updatedAt: new Date() } });
}

export async function deleteConfigValue(key: string): Promise<void> {
  await db.delete(appConfigTable).where(eq(appConfigTable.key, key));
}
