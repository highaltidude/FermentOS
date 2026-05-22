const BATTERY_CURVE: Array<[number, number]> = [
  [4.20, 100],
  [4.15, 95],
  [4.11, 90],
  [4.08, 85],
  [4.02, 75],
  [3.98, 65],
  [3.95, 55],
  [3.91, 45],
  [3.87, 35],
  [3.85, 25],
  [3.80, 15],
  [3.75, 8],
  [3.70, 3],
  [3.60, 0],
];

export function estimateBatteryPercent(volts: number): number {
  if (volts >= 4.20) return 100;
  if (volts <= 3.60) return 0;
  for (let i = 0; i < BATTERY_CURVE.length - 1; i++) {
    const [v1, p1] = BATTERY_CURVE[i]!;
    const [v2, p2] = BATTERY_CURVE[i + 1]!;
    if (volts <= v1 && volts >= v2) {
      const t = (volts - v2) / (v1 - v2);
      return Math.round(p2 + t * (p1 - p2));
    }
  }
  return 0;
}

export function batteryWarningLevel(pct: number): "critical" | "warning" | null {
  if (pct < 10) return "critical";
  if (pct < 20) return "warning";
  return null;
}
