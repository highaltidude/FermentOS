import { useGetFermentTempUnit, getGetFermentTempUnitQueryKey } from "@workspace/api-client-react";

/**
 * The user's fermentation temperature unit. staleTime 0 refetches on every
 * mount so a change made in Settings shows up as soon as a page opens.
 */
export function useFermentTempUnit(): "C" | "F" {
  const { data } = useGetFermentTempUnit({
    query: { staleTime: 0, queryKey: getGetFermentTempUnitQueryKey() },
  });
  return data?.unit === "C" ? "C" : "F";
}
