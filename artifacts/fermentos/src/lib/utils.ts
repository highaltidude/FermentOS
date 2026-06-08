import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function fetchFermentTempUnit(): Promise<"F" | "C"> {
  try {
    const r = await fetch("/api/settings/ferment-temp-unit");
    const d = await r.json();
    return d.unit === "C" ? "C" : "F";
  } catch {
    return "F";
  }
}
