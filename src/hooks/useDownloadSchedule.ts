import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { useSignalR } from "@/hooks/useSignalR";

export interface DownloadSchedule {
  id: string;
  imei: string;
  last_success_at: string | null;
  last_attempt_at: string | null;
  status: string;
  last_error: string | null;
  attempts_today: number;
  created_at: string;
  updated_at: string;
}

export function useDownloadSchedule() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["download_schedule"],
    queryFn: () => apiFetch<DownloadSchedule[]>("/api/download-schedule"),
    refetchInterval: 30000,
  });

  useSignalR("SessionUpdated", () => {
    queryClient.invalidateQueries({ queryKey: ["download_schedule"] });
  });

  const resetSchedule = useCallback(async (imei?: string) => {
    const body = imei ? { imei } : { all: true };
    const result = await apiFetch<{ ok: boolean; reset_count: number }>("/api/reset-download-schedule", {
      method: "POST",
      body: JSON.stringify(body),
    });
    queryClient.invalidateQueries({ queryKey: ["download_schedule"] });
    return result;
  }, [queryClient]);

  return { ...query, resetSchedule };
}
