import { getConfigValue, setConfigValue } from "./appConfig";

const KEY = "source_water_profile";

export type WaterProfile = {
  name?: string | null;
  calcium: number;
  magnesium: number;
  sodium: number;
  sulfate: number;
  chloride: number;
  bicarbonate: number;
};

const IONS = ["calcium", "magnesium", "sodium", "sulfate", "chloride", "bicarbonate"] as const;

/**
 * The brewer's tap water report, used to prefill the water calculator. Stored
 * as JSON in app_config, so it is already covered by backups. Null when it has
 * never been saved, or when the stored value is not a usable profile.
 */
export async function getSourceWater(): Promise<WaterProfile | null> {
  const raw = await getConfigValue(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WaterProfile>;
    if (!IONS.every((ion) => typeof parsed[ion] === "number" && Number.isFinite(parsed[ion]))) return null;
    return parsed as WaterProfile;
  } catch {
    return null;
  }
}

/** Null clears the saved water. */
export async function setSourceWater(profile: WaterProfile | null): Promise<void> {
  await setConfigValue(KEY, profile ? JSON.stringify(profile) : "");
}
