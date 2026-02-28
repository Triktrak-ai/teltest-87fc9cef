import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useCallback } from "react";

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
        .from("download_schedule" as any)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DownloadSchedule[];
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("download-schedule-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "download_schedule" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["download_schedule"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const resetSchedule = useCallback(async (imei?: string) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-download-schedule`;
    const body = imei ? { imei } : { all: true };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error("Reset failed");
    }

    const result = await res.json();
    queryClient.invalidateQueries({ queryKey: ["download_schedule"] });
    return result;
  }, [queryClient]);

  return { ...query, resetSchedule };
}
