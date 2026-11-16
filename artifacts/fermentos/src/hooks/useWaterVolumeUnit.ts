import { useGetUnitSystem, getGetUnitSystemQueryKey } from "@workspace/api-client-react";

/**
 * The unit water volumes are shown in: litres on a metric setup, otherwise
 * gallons, the same choice the water calculator starts with.
 */
export function useWaterVolumeUnit(): "gal" | "L" {
  const { data } = useGetUnitSystem({ query: { queryKey: getGetUnitSystemQueryKey() } });
  return data?.system === "metric" ? "L" : "gal";
}
