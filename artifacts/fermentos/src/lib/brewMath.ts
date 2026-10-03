/** Estimated ABV % from original and current/final gravity. */
export function estimateAbv(og: number, fg: number): number {
  return (og - fg) * 131.25;
}

/** A temperature-range bound in °F, converting when the range is stored in °C. */
export function tempRangeToF(value: number, unit: string | null | undefined): number {
  return unit === "C" ? value * 9 / 5 + 32 : value;
}
