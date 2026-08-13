import { useGetSystemStats, getGetSystemStatsQueryKey, type SystemStats } from "@workspace/api-client-react";
import { evaluateSystemHealth, type SystemHealthEvaluation } from "@/lib/systemHealth";

export function useSystemHealth(options?: { refetchInterval?: number }): {
  stats: SystemStats | undefined;
  status: SystemHealthEvaluation | null;
  isLoading: boolean;
  error: unknown;
  lastUpdated: Date | null;
} {
  const query = useGetSystemStats({
    query: {
      refetchInterval: options?.refetchInterval ?? 5000,
      queryKey: getGetSystemStatsQueryKey(),
    },
  });

  return {
    stats: query.data,
    status: query.data ? evaluateSystemHealth(query.data) : null,
    isLoading: query.isLoading,
    error: query.error,
    lastUpdated: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
  };
}
