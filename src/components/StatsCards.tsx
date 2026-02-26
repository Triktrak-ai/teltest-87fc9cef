import { Activity, CheckCircle, AlertTriangle, Radio } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: "primary" | "success" | "warning" | "destructive";
}

const accentStyles = {
  primary: "text-primary glow-green-sm border-primary/20",
  success: "text-success glow-green-sm border-success/20",
  warning: "text-warning border-warning/20",
  destructive: "text-destructive border-destructive/20",
};

function StatCard({ label, value, icon, accent = "primary" }: StatCardProps) {
  return (
    <div className={`rounded-lg border bg-card p-5 ${accentStyles[accent]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold font-mono">{value}</p>
        </div>
        <div className="opacity-60">{icon}</div>
      </div>
    </div>
  );
}

export function StatsCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Aktywne sesje" value={3} icon={<Activity size={28} />} accent="primary" />
      <StatCard label="Ukończone dziś" value={12} icon={<CheckCircle size={28} />} accent="success" />
      <StatCard label="Błędy" value={2} icon={<AlertTriangle size={28} />} accent="destructive" />
      <StatCard label="Urządzenia online" value={47} icon={<Radio size={28} />} accent="warning" />
    </div>
  );
}
