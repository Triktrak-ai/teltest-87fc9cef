import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api-client";
import { useSignalR } from "@/hooks/useSignalR";

// Types matching the DB schema
export interface Session {
  id: string;
  imei: string;
  vehicle_plate: string | null;
  status: string;
  generation: string;
  card_generation: string;
  progress: number;
  files_downloaded: number;
  total_files: number;
  current_file: string | null;
  error_code: string | null;
  error_message: string | null;
  bytes_downloaded: number;
  apdu_exchanges: number;
  crc_errors: number;
  started_at: string;
  last_activity: string;
  completed_at: string | null;
  created_at: string;
}

export interface SessionEvent {
  id: string;
  session_id: string | null;
  imei: string;
  type: string;
  message: string;
  context: string | null;
  created_at: string;
}

export function useSessions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiFetch<Session[]>("/api/sessions"),
    refetchInterval: 30000,
  });

  // SignalR realtime
  useSignalR("SessionUpdated", () => {
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
  });

  return query;
}

export function useSessionEvents() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["session_events"],
    queryFn: () => apiFetch<SessionEvent[]>("/api/session-events"),
    refetchInterval: 30000,
  });

  useSignalR("EventCreated", () => {
    queryClient.invalidateQueries({ queryKey: ["session_events"] });
  });

  return query;
}

export function isStaleSession(session: Session, thresholdMinutes = 5): boolean {
  if (session.status === "completed" || session.status === "error" || session.status === "partial" || session.status === "skipped") return false;
  const lastActivity = new Date(session.last_activity).getTime();
  const now = Date.now();
  return (now - lastActivity) > thresholdMinutes * 60 * 1000;
}

export function useSessionStats() {
  const { data: sessions, isLoading } = useSessions();

  const stats = useMemo(() => {
    if (!sessions) {
      return {
        activeSessions: 0,
        completedToday: 0,
        errorsToday: 0,
        uniqueImei: 0,
        totalBytes: 0,
        totalApdu: 0,
        totalCrc: 0,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const active = sessions.filter(
      (s) => s.status !== "completed" && s.status !== "error" && s.status !== "partial" && s.status !== "skipped" && !isStaleSession(s)
    );

    const completedToday = sessions.filter(
      (s) =>
        s.status === "completed" &&
        s.completed_at &&
        new Date(s.completed_at) >= today
    );

    const errorsToday = sessions.filter(
      (s) =>
        s.status === "error" && new Date(s.last_activity) >= today
    );

    const uniqueImei = new Set(active.map((s) => s.imei)).size;

    const totalBytes = sessions.reduce((sum, s) => sum + (s.bytes_downloaded ?? 0), 0);
    const totalApdu = sessions.reduce((sum, s) => sum + (s.apdu_exchanges ?? 0), 0);
    const totalCrc = sessions.reduce((sum, s) => sum + (s.crc_errors ?? 0), 0);

    return {
      activeSessions: active.length,
      completedToday: completedToday.length,
      errorsToday: errorsToday.length,
      uniqueImei,
      totalBytes,
      totalApdu,
      totalCrc,
    };
  }, [sessions]);

  return { stats, isLoading };
}
