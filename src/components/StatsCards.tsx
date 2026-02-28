import { Activity, CheckCircle, AlertTriangle, Radio, HardDrive, Repeat, ShieldAlert, SkipForward } from "lucide-react";
import { useSessions, useSessionStats, isStaleSession } from "@/hooks/useSessions";
import { useDownloadSchedule } from "@/hooks/useDownloadSchedule";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: "primary" | "success" | "warning" | "destructive";
  loading?: boolean;
}

const accentStyles = {
  primary: "text-primary glow-green-sm border-primary/20",
  success: "text-success glow-green-sm border-success/20",
  warning: "text-warning border-warning/20",
  destructive: "text-destructive border-destructive/20",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatCard({ label, value, icon, accent = "primary", loading }: StatCardProps) {
  return (
    <div className={`rounded-lg border bg-card p-5 ${accentStyles[accent]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 text-3xl font-bold font-mono">{value}</p>
          )}
        </div>
        <div className="opacity-60">{icon}</div>
      </div>
    </div>
  );
}

interface StatsCardsProps {
  filterImeis?: string[] | null;
}

export function StatsCards({ filterImeis }: StatsCardsProps) {
  const { data: allSessions, isLoading } = useSessions();
  const { data: allSchedules, isLoading: schedLoading } = useDownloadSchedule();

  const sessions = useMemo(() => {
    if (!allSessions) return undefined;
    if (!filterImeis) return allSessions;
    return allSessions.filter((s) => filterImeis.includes(s.imei));
  }, [allSessions, filterImeis]);

  const schedules = useMemo(() => {
    if (!allSchedules) return undefined;
    if (!filterImeis) return allSchedules;
    return allSchedules.filter((s) => filterImeis.includes(s.imei));
  }, [allSchedules, filterImeis]);

  const stats = useMemo(() => {
    if (!sessions) return { activeSessions: 0, completedToday: 0, errorsToday: 0, uniqueImei: 0, totalBytes: 0, totalApdu: 0, totalCrc: 0 };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const active = sessions.filter((s) => s.status !== "completed" && s.status !== "error" && s.status !== "partial" && s.status !== "skipped" && !isStaleSession(s));
    const completedToday = sessions.filter((s) => s.status === "completed" && s.completed_at && new Date(s.completed_at) >= today);
    const errorsToday = sessions.filter((s) => s.status === "error" && new Date(s.last_activity) >= today);
    return {
      activeSessions: active.length,
      completedToday: completedToday.length,
      errorsToday: errorsToday.length,
      uniqueImei: new Set(active.map((s) => s.imei)).size,
      totalBytes: sessions.reduce((sum, s) => sum + (s.bytes_downloaded ?? 0), 0),
      totalApdu: sessions.reduce((sum, s) => sum + (s.apdu_exchanges ?? 0), 0),
      totalCrc: sessions.reduce((sum, s) => sum + (s.crc_errors ?? 0), 0),
    };
  }, [sessions]);

  const skippedToday = useMemo(() => {
    if (!schedules) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return schedules.filter((s) => {
      if (s.status !== "skipped" && s.status !== "ok") return false;
      const updated = s.last_attempt_at ? new Date(s.last_attempt_at) : null;
      if (!updated) return false;
      return updated >= today && s.attempts_today > 0;
    }).length;
  }, [schedules]);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
      <StatCard label="Aktywne sesje" value={stats.activeSessions} icon={<Activity size={28} />} accent="primary" loading={isLoading} />
      <StatCard label="Ukończone dziś" value={stats.completedToday} icon={<CheckCircle size={28} />} accent="success" loading={isLoading} />
      <StatCard label="Błędy dziś" value={stats.errorsToday} icon={<AlertTriangle size={28} />} accent="destructive" loading={isLoading} />
      <StatCard label="Pominięte dziś" value={skippedToday} icon={<SkipForward size={28} />} accent="warning" loading={schedLoading} />
      <StatCard label="IMEI aktywne" value={stats.uniqueImei} icon={<Radio size={28} />} accent="warning" loading={isLoading} />
      <StatCard label="Pobrano łącznie" value={formatBytes(stats.totalBytes)} icon={<HardDrive size={28} />} accent="primary" loading={isLoading} />
      <StatCard label="APDU łącznie" value={stats.totalApdu} icon={<Repeat size={28} />} accent="warning" loading={isLoading} />
      <StatCard label="Błędy CRC" value={stats.totalCrc} icon={<ShieldAlert size={28} />} accent="destructive" loading={isLoading} />
    </div>
  );
}
