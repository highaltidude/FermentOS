import { getConfigValue, setConfigValue } from "./appConfig";

const KEY = "unit_system";
export type UnitSystem = "imperial" | "metric" | "both";
const VALID: UnitSystem[] = ["imperial", "metric", "both"];

function isUnitSystem(v: unknown): v is UnitSystem {
  return typeof v === "string" && (VALID as string[]).includes(v);
}

export async function getUnitSystem(): Promise<UnitSystem> {
  const value = await getConfigValue(KEY);
  return isUnitSystem(value) ? value : "imperial";
}

export async function setUnitSystem(system: UnitSystem): Promise<void> {
  await setConfigValue(KEY, system);
}
