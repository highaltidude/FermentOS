/**
 * The brew session page's movable cards: what Settings calls them, and the
 * default layout the page uses until the saved one has loaded.
 */
import { BrewLayoutSection, type BrewLayout } from "@workspace/api-client-react";

export const BREW_SECTION_INFO: Record<BrewLayoutSection, { label: string; description: string }> = {
  water: { label: "Water", description: "Salt additions for the batch; shown on brew day only" },
  dryHops: { label: "Dry hops", description: "Dry hop additions and when they're due" },
  tasting: { label: "Tasting & rating", description: "Photo, scorecard and tasting notes" },
  recipeAsBrewed: { label: "Recipe as brewed", description: "The recipe when the batch started, and changes since" },
  stageHistory: { label: "Stage history", description: "When the batch moved between stages" },
  tempControl: { label: "Temperature control", description: "Heating and cooling relays for this batch" },
  heatingCooling: { label: "Heating & cooling", description: "How long the relays ran, by hour or day" },
  telemetry: { label: "Telemetry", description: "The fermenter sensor's latest reading, insights and alerts, including the \"fermentation may be complete\" prompt" },
  sensors: { label: "Sensors on this brew", description: "Which sensors are fermenter or reference" },
  sensorReadings: { label: "Sensor readings", description: "Table of every reading the fermenter sensor sent" },
  fermentationChart: { label: "Fermentation chart", description: "Temperature and gravity over time" },
  referenceCharts: { label: "Reference sensor charts", description: "One chart per reference sensor, such as an ice bath" },
  readings: { label: "Fermentation readings", description: "Readings list and the Log Reading button" },
};

export const DEFAULT_BREW_LAYOUT: BrewLayout = { order: Object.values(BrewLayoutSection), hidden: [] };

/** The order with one section swapped with its neighbour, or the same order at either end. */
export function moveSection(order: BrewLayoutSection[], section: BrewLayoutSection, by: -1 | 1): BrewLayoutSection[] {
  const i = order.indexOf(section);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
