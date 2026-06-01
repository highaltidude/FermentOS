export function calcInsights(
  readings: { gravity?: number | null; receivedAt: Date }[],
): {
  startingGravity: number | null;
  currentGravity: number | null;
  gravityDrop: number | null;
  attenuationPercent: number | null;
  fermentationStatus: string;
  velocityLast24h: number | null;
} | null {
  const gravityReadings = readings.filter((r) => r.gravity != null);
  if (gravityReadings.length < 2) {
    return {
      startingGravity: gravityReadings[0]?.gravity ?? null,
      currentGravity: gravityReadings[0]?.gravity ?? null,
      gravityDrop: null,
      attenuationPercent: null,
      fermentationStatus: "insufficient_data",
      velocityLast24h: null,
    };
  }

  const first = gravityReadings[0]!;
  const last = gravityReadings[gravityReadings.length - 1]!;
  const startingGravity = first.gravity!;
  const currentGravity = last.gravity!;
  const gravityDrop = startingGravity - currentGravity;
  const attenuationPercent = startingGravity > 1 ? (gravityDrop / (startingGravity - 1)) * 100 : null;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = gravityReadings.filter((r) => new Date(r.receivedAt) >= cutoff);
  let velocityLast24h: number | null = null;
  if (recent.length >= 2) {
    const oldest = recent[0]!;
    const newest = recent[recent.length - 1]!;
    const hours = (new Date(newest.receivedAt).getTime() - new Date(oldest.receivedAt).getTime()) / 3_600_000;
    if (hours > 0) {
      velocityLast24h = ((oldest.gravity! - newest.gravity!) / hours) * 24;
    }
  }

  let fermentationStatus: string;
  if (velocityLast24h == null) {
    fermentationStatus = "insufficient_data";
  } else if (velocityLast24h > 0.003) {
    fermentationStatus = "likely_active";
  } else if (velocityLast24h > 0.001) {
    fermentationStatus = "slowing";
  } else {
    const hoursSinceStart =
      (new Date(last.receivedAt).getTime() - new Date(first.receivedAt).getTime()) / 3_600_000;
    fermentationStatus = hoursSinceStart > 48 ? "possibly_complete" : "stable";
  }

  return { startingGravity, currentGravity, gravityDrop, attenuationPercent, fermentationStatus, velocityLast24h };
}
