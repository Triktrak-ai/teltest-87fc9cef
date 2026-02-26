import { Activity, CheckCircle, AlertTriangle, Radio, HardDrive, Repeat, ShieldAlert } from "lucide-react";
import { useSessionStats } from "@/hooks/useSessions";
import { Skeleton } from "@/components/ui/skeleton";

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

export function StatsCards() {
  const { stats, isLoading } = useSessionStats();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      <StatCard label="Aktywne sesje" value={stats.activeSessions} icon={<Activity size={28} />} accent="primary" loading={isLoading} />
      <StatCard label="Ukończone dziś" value={stats.completedToday} icon={<CheckCircle size={28} />} accent="success" loading={isLoading} />
      <StatCard label="Błędy dziś" value={stats.errorsToday} icon={<AlertTriangle size={28} />} accent="destructive" loading={isLoading} />
      <StatCard label="IMEI online" value={stats.uniqueImei} icon={<Radio size={28} />} accent="warning" loading={isLoading} />
      <StatCard label="Pobrano łącznie" value={formatBytes(stats.totalBytes)} icon={<HardDrive size={28} />} accent="primary" loading={isLoading} />
      <StatCard label="APDU łącznie" value={stats.totalApdu} icon={<Repeat size={28} />} accent="warning" loading={isLoading} />
      <StatCard label="Błędy CRC" value={stats.totalCrc} icon={<ShieldAlert size={28} />} accent="destructive" loading={isLoading} />
    </div>
  );
}
