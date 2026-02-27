import { useSessions, isStaleSession, type Session } from "@/hooks/useSessions";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SessionStatus = Session["status"];

const statusConfig: Record<string, { label: string; className: string }> = {
  connecting: { label: "Łączenie", className: "bg-info/20 text-info border-info/30" },
  auth_gen1: { label: "Auth Gen1", className: "bg-primary/20 text-primary border-primary/30" },
  auth_gen2v1: { label: "Auth Gen2v1", className: "bg-primary/20 text-primary border-primary/30" },
  auth_gen2v2: { label: "Auth Gen2v2", className: "bg-accent text-accent-foreground border-primary/30" },
  downloading: { label: "Pobieranie", className: "bg-info/20 text-info border-info/30" },
  completed: { label: "Ukończono", className: "bg-success/20 text-success border-success/30" },
  error: { label: "Błąd", className: "bg-destructive/20 text-destructive border-destructive/30" },
  waiting: { label: "Oczekuje", className: "bg-warning/20 text-warning border-warning/30" },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isActive(status: string): boolean {
  return status !== "completed" && status !== "error";
}

export function SessionsTable() {
  const { data: sessions, isLoading } = useSessions();

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Sesje pobierania DDD
        </h2>
        {sessions && sessions.some((s) => isActive(s.status)) && (
          <span className="flex items-center gap-1.5 text-xs text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Live
          </span>
        )}
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
              <th className="px-5 py-3">Akt. plik</th>
              <th className="px-5 py-3">Pobrano</th>
              <th className="px-5 py-3">APDU</th>
              <th className="px-5 py-3">CRC err</th>
              <th className="px-5 py-3">Akt. aktywność</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <>
                {[1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}
            {!isLoading && sessions && sessions.length === 0 && (
              <tr>
                <td colSpan={11} className="px-5 py-12 text-center text-muted-foreground">
                  Brak aktywnych sesji
                </td>
              </tr>
            )}
            {sessions?.map((s) => {
              const sc = statusConfig[s.status] ?? statusConfig.connecting;
              const active = isActive(s.status);
              const stale = isStaleSession(s);
              const staleMinutes = stale
                ? Math.round((Date.now() - new Date(s.last_activity).getTime()) / 60000)
                : 0;
              return (
                <tr key={s.id} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${stale ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3 font-mono text-xs">
                    <span className="flex items-center gap-1.5">
                      {active && !stale && (
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                        </span>
                      )}
                      {s.imei}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium">{s.vehicle_plate ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs">{s.generation}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className={sc.className}>
                        {sc.label}
                      </Badge>
                      {stale && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="bg-muted text-muted-foreground border-muted-foreground/20 text-[10px]">
                                Nieaktywna
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Brak aktywności od {staleMinutes} min</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                    {s.error_code && (
                      <span className="ml-2 font-mono text-xs text-destructive">
                        {s.error_code}
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
                    {s.total_files > 0 ? `${s.files_downloaded}/${s.total_files}` : "—"}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                    {s.current_file ?? "—"}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {s.bytes_downloaded > 0 ? formatBytes(s.bytes_downloaded) : "—"}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{s.apdu_exchanges || "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {s.crc_errors > 0 ? (
                      <span className="text-destructive">{s.crc_errors}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {new Date(s.last_activity).toLocaleTimeString("pl-PL", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
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
