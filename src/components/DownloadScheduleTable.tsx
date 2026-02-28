import { useDownloadSchedule, type DownloadSchedule } from "@/hooks/useDownloadSchedule";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RotateCcw, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const statusConfig: Record<string, { label: string; className: string }> = {
  ok: { label: "Pobrano", className: "bg-success/20 text-success border-success/30" },
  error: { label: "Błąd", className: "bg-destructive/20 text-destructive border-destructive/30" },
  skipped: { label: "Pominięto", className: "bg-muted text-muted-foreground border-muted-foreground/20" },
  pending: { label: "Oczekuje", className: "bg-warning/20 text-warning border-warning/30" },
};

function useLatestSessionsWithLogs() {
  return useQuery({
    queryKey: ["sessions-with-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, imei, log_uploaded, created_at")
        .eq("log_uploaded", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; imei: string; log_uploaded: boolean; created_at: string }[];
    },
    refetchInterval: 30000,
  });
}

function getLogDownloadUrl(sessionId: string, fileName: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/session-logs/${sessionId}/${fileName}`;
}

export function DownloadScheduleTable() {
  const { data: schedules, isLoading, resetSchedule } = useDownloadSchedule();
  const { data: sessionsWithLogs } = useLatestSessionsWithLogs();
  const [resetting, setResetting] = useState<string | null>(null);

  const handleReset = async (imei?: string) => {
    const key = imei ?? "__all__";
    setResetting(key);
    try {
      const result = await resetSchedule(imei);
      toast.success(`Zresetowano ${result.reset_count} rekord(ów)`);
    } catch {
      toast.error("Błąd resetowania harmonogramu");
    } finally {
      setResetting(null);
    }
  };

  const getLatestLogSession = (imei: string) => {
    if (!sessionsWithLogs) return null;
    return sessionsWithLogs.find((s) => s.imei === imei) ?? null;
  };

  const handleDownloadLogs = (sessionId: string) => {
    const files = ["traffic.log", "session.txt", "session.json"];
    for (const file of files) {
      const url = getLogDownloadUrl(sessionId, file);
      window.open(url, "_blank");
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Harmonogram pobierania
        </h2>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              disabled={resetting === "__all__"}
            >
              <RotateCcw className="h-3 w-3" />
              Resetuj wszystkie
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Resetuj wszystkie harmonogramy</AlertDialogTitle>
              <AlertDialogDescription>
                Wszystkie urządzenia zostaną oznaczone jako oczekujące na pobranie. Przy następnym
                połączeniu pliki DDD zostaną pobrane ponownie.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleReset()}>Resetuj</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3">IMEI</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Ostatnie pobranie</th>
              <th className="px-5 py-3">Ostatnia próba</th>
              <th className="px-5 py-3">Próby dziś</th>
              <th className="px-5 py-3">Błąd</th>
              <th className="px-5 py-3 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <>
                {[1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}
            {!isLoading && schedules && schedules.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                  Brak wpisów w harmonogramie
                </td>
              </tr>
            )}
            {schedules?.map((s) => {
              const sc = statusConfig[s.status] ?? statusConfig.pending;
              const logSession = getLatestLogSession(s.imei);
              return (
                <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs">{s.imei}</td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className={sc.className}>
                      {sc.label}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {s.last_success_at
                      ? new Date(s.last_success_at).toLocaleString("pl-PL", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {s.last_attempt_at
                      ? new Date(s.last_attempt_at).toLocaleString("pl-PL", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{s.attempts_today}</td>
                  <td className="px-5 py-3 text-xs text-destructive max-w-[200px] truncate">
                    {s.last_error ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right flex items-center justify-end gap-1">
                    {logSession && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleDownloadLogs(logSession.id)}
                            >
                              <FileDown className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Pobierz logi sesji</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs gap-1"
                          disabled={resetting === s.imei}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Resetuj
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Resetuj harmonogram</AlertDialogTitle>
                          <AlertDialogDescription>
                            IMEI {s.imei} zostanie oznaczone jako oczekujące. Przy następnym
                            połączeniu pliki DDD zostaną pobrane ponownie.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Anuluj</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleReset(s.imei)}>
                            Resetuj
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
