import { BrewStatus, PackagingMethod } from "@workspace/api-client-react";

/** Brew stages in the order a batch moves through them. */
export const BREW_STATUSES = Object.values(BrewStatus);

export const PACKAGING_METHODS = Object.values(PackagingMethod);

export const STATUS_LABELS: Record<string, string> = {
  brew_day: "Brew Day",
  fermenting: "Fermenting",
  conditioning: "Conditioning",
  packaged: "Packaged",
};

export const STATUS_COLORS: Record<string, string> = {
  brew_day: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800/40",
  fermenting: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800/40",
  conditioning: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800/40",
  packaged: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800/40",
};

export const PACKAGING_LABELS: Record<string, string> = {
  keg: "Keg",
  bottle: "Bottle",
};
