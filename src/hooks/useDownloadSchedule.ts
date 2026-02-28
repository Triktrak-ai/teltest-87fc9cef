import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("download_schedule")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as DownloadSchedule[];
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("schedule-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "download_schedule" }, () => {
        queryClient.invalidateQueries({ queryKey: ["download_schedule"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const resetSchedule = useCallback(async (imei?: string) => {
    const body = imei ? { imei } : { all: true };
    const { data, error } = await supabase.functions.invoke("reset-download-schedule", { body });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["download_schedule"] });
    return data as { ok: boolean; reset_count: number };
  }, [queryClient]);

  return { ...query, resetSchedule };
}
