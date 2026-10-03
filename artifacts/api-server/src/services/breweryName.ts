import { deleteConfigValue, getConfigValue, setConfigValue } from "./appConfig";

const KEY = "brewery_name";

export async function getBreweryName(): Promise<string | null> {
  return getConfigValue(KEY);
}

/** An empty or null name removes the row rather than storing a blank. */
export async function setBreweryName(name: string | null): Promise<void> {
  if (name) {
    await setConfigValue(KEY, name);
  } else {
    await deleteConfigValue(KEY);
  }
}
