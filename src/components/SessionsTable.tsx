import { mockSessions, type SessionStatus } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const statusConfig: Record<SessionStatus, { label: string; className: string }> = {
  connecting: { label: "Łączenie", className: "bg-info/20 text-info border-info/30" },
  auth_gen1: { label: "Auth Gen1", className: "bg-primary/20 text-primary border-primary/30" },
  auth_gen2v1: { label: "Auth Gen2v1", className: "bg-primary/20 text-primary border-primary/30" },
  auth_gen2v2: { label: "Auth Gen2v2", className: "bg-accent text-accent-foreground border-primary/30" },
  downloading: { label: "Pobieranie", className: "bg-info/20 text-info border-info/30" },
  completed: { label: "Ukończono", className: "bg-success/20 text-success border-success/30" },
  error: { label: "Błąd", className: "bg-destructive/20 text-destructive border-destructive/30" },
  waiting: { label: "Oczekuje", className: "bg-warning/20 text-warning border-warning/30" },
};

export function SessionsTable() {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Sesje pobierania DDD
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3">IMEI</th>
              <th className="px-5 py-3">Pojazd</th>
              <th className="px-5 py-3">Generacja</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Postęp</th>
              <th className="px-5 py-3">Pliki</th>
              <th className="px-5 py-3">Akt. aktywność</th>
            </tr>
          </thead>
          <tbody>
            {mockSessions.map((s) => {
              const sc = statusConfig[s.status];
              return (
                <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs">{s.imei}</td>
                  <td className="px-5 py-3 font-medium">{s.vehiclePlate}</td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs">{s.generation}</span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className={sc.className}>
                      {sc.label}
                    </Badge>
                    {s.errorCode && (
                      <span className="ml-2 font-mono text-xs text-destructive">
                        {s.errorCode}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 w-32">
                    {s.status === "downloading" ? (
                      <div className="flex items-center gap-2">
                        <Progress value={s.progress} className="h-1.5 flex-1" />
                        <span className="font-mono text-xs text-muted-foreground">{s.progress}%</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {s.totalFiles > 0 ? `${s.filesDownloaded}/${s.totalFiles}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {new Date(s.lastActivity).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
