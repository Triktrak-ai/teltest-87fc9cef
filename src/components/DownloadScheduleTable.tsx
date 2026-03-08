import { useDownloadSchedule, type DownloadSchedule } from "@/hooks/useDownloadSchedule";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { RotateCcw, FileDown, ShieldOff, Shield, Download, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useImeiOwners } from "@/hooks/useImeiOwners";
import { downloadDddZip, listDddFiles, downloadDddFile } from "@/lib/ddd-storage";

const statusConfig: Record<string, { label: string; className: string }> = {
  ok: { label: "Pobrano", className: "bg-success/20 text-success border-success/30" },
  partial: { label: "Częściowe", className: "bg-warning/20 text-warning border-warning/30" },
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
        .select("id, imei, log_uploaded, created_at, files_downloaded, total_files, status")
        .eq("log_uploaded", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });
}

function useLatestSessionFileCounts() {
  return useQuery({
    queryKey: ["latest-session-file-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("imei, files_downloaded, total_files, status")
        .in("status", ["completed", "partial"])
        .order("completed_at", { ascending: false });
      if (error) throw error;
      // Group by IMEI, take latest
      const map = new Map<string, { files_downloaded: number; total_files: number; status: string }>();
      for (const s of data ?? []) {
        if (!map.has(s.imei)) {
          map.set(s.imei, {
            files_downloaded: s.files_downloaded ?? 0,
            total_files: s.total_files ?? 0,
            status: s.status,
          });
        }
      }
      return map;
    },
    refetchInterval: 30000,
  });
}

function getLogDownloadUrl(sessionId: string, fileName: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/session-logs/${sessionId}/${fileName}`;
}

function useDevMode() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["app_settings", "download_block_disabled"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "download_block_disabled")
        .single();
      return data?.value === "true";
    },
  });

  const toggle = async (disabled: boolean) => {
    await supabase.functions.invoke("toggle-download-block", {
      body: { disabled },
    });
    await queryClient.invalidateQueries({ queryKey: ["app_settings", "download_block_disabled"] });
  };

  return { isDevMode: query.data ?? false, isLoading: query.isLoading, toggle };
}

import { type AdminFilterResult } from "@/components/AdminFilter";

function matchesFilter(imei: string, filter: AdminFilterResult): boolean {
  return filter.imeis.includes(imei) || imei.toLowerCase().includes(filter.rawQuery);
}

interface DownloadScheduleTableProps {
  adminFilter?: AdminFilterResult | null;
}

export function DownloadScheduleTable({ adminFilter }: DownloadScheduleTableProps) {
  const { getOwner, isAdmin } = useImeiOwners();
  const { data: schedules, isLoading, resetSchedule } = useDownloadSchedule();
  const { data: fileCounts } = useLatestSessionFileCounts();
  const { data: sessionsWithLogs } = useLatestSessionsWithLogs();
  const { isDevMode, toggle: toggleDevMode } = useDevMode();
  const [resetting, setResetting] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!schedules) return undefined;
    if (!adminFilter) return schedules;
    return schedules.filter((s) => matchesFilter(s.imei, adminFilter));
  }, [schedules, adminFilter]);

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

  // Time window: look up latest session for IMEI to get exact started_at/completed_at
  // Falls back to last_success_at ± 30/5 min if no session found
  const getTimeWindow = useCallback(async (s: DownloadSchedule) => {
    const successAt = s.last_success_at;
    if (!successAt) return null;

    // Try to find the matching session for accurate time window
    const { data: session } = await supabase
      .from("sessions")
      .select("started_at, completed_at")
      .eq("imei", s.imei)
      .in("status", ["completed", "partial"])
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session?.started_at && session?.completed_at) {
      const after = new Date(new Date(session.started_at).getTime() - 2 * 60000).toISOString();
      const before = new Date(new Date(session.completed_at).getTime() + 2 * 60000).toISOString();
      return { after, before };
    }

    // Fallback: wider window around last_success_at
    const dt = new Date(successAt);
    const after = new Date(dt.getTime() - 30 * 60000).toISOString();
    const before = new Date(dt.getTime() + 5 * 60000).toISOString();
    return { after, before };
  }, []);

  const handleDownloadDdd = useCallback(async (s: DownloadSchedule) => {
    const tw = await getTimeWindow(s);
    if (!tw) { toast.error("Brak daty ostatniego pobrania"); return; }
    try {
      toast.info("Przygotowywanie archiwum ZIP…");
      const buf = await downloadDddZip(s.imei, tw.after, tw.before);
      if (!buf || buf.byteLength === 0) { toast.error("Pobrano pusty plik"); return; }
      const blob = new Blob([buf], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${s.imei}_ddd.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success("Pobrano archiwum ZIP");
    } catch (err) {
      toast.error(`Błąd pobierania: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleOpenInReader = useCallback(async (s: DownloadSchedule) => {
    const tw = await getTimeWindow(s);
    if (!tw) { toast.error("Brak daty ostatniego pobrania"); return; }
    navigate(`/ddd-reader?sessionImei=${s.imei}&after=${encodeURIComponent(tw.after)}&before=${encodeURIComponent(tw.before)}`);
  }, [navigate, getTimeWindow]);

  const handleToggleDevMode = async (checked: boolean) => {
    setToggling(true);
    try {
      await toggleDevMode(checked);
      toast.success(checked ? "Blokada pobierania wyłączona (tryb dev)" : "Blokada pobierania włączona");
    } catch {
      toast.error("Błąd przełączania trybu");
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Harmonogram pobierania
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isDevMode ? (
              <ShieldOff className="h-3.5 w-3.5 text-warning" />
            ) : (
              <Shield className="h-3.5 w-3.5 text-primary" />
            )}
            <span className="text-xs text-muted-foreground">
              {isDevMode ? "Blokada wyłączona" : "Blokada aktywna"}
            </span>
            <Switch
              checked={isDevMode}
              onCheckedChange={handleToggleDevMode}
              disabled={toggling}
              className="scale-75"
              title="Tryb deweloperski — wyłącza blokadę pobierania 1x/dzień"
            />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" disabled={resetting === "__all__"}>
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
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              {isAdmin && <th className="px-5 py-3">Użytkownik</th>}
              <th className="px-5 py-3">IMEI</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Pliki</th>
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
                {Array.from({ length: isAdmin ? 9 : 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
              </>
            )}
            {!isLoading && filtered && filtered.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="px-5 py-12 text-center text-muted-foreground">
                  Brak wpisów w harmonogramie
                </td>
              </tr>
            )}
            {filtered?.map((s) => {
              const sc = statusConfig[s.status] ?? statusConfig.pending;
              const logSession = getLatestLogSession(s.imei);
              return (
                <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  {isAdmin && (
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {getOwner(s.imei)?.userName ?? "—"}
                    </td>
                  )}
                  <td className="px-5 py-3 font-mono text-xs">{s.imei}</td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className={sc.className}>{sc.label}</Badge>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {(() => {
                      const fc = fileCounts?.get(s.imei);
                      if (!fc) return "—";
                      const downloaded = fc.files_downloaded;
                      const total = fc.total_files;
                      const color = downloaded >= total ? "text-success" : downloaded >= 5 ? "text-warning" : "text-destructive";
                      return <span className={color}>{downloaded}/{total}</span>;
                    })()}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {s.last_success_at ? new Date(s.last_success_at).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {s.last_attempt_at ? new Date(s.last_attempt_at).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{s.attempts_today}</td>
                  <td className="px-5 py-3 text-xs text-destructive max-w-[200px] truncate">{s.last_error ?? "—"}</td>
                  <td className="px-5 py-3 text-right flex items-center justify-end gap-1">
                    {s.last_success_at && (
                      <>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDownloadDdd(s)}>
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Pobierz pliki DDD (ZIP)</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleOpenInReader(s)}>
                                <BookOpen className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Otwórz w czytniku DDD</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    )}
                    {logSession && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDownloadLogs(logSession.id)}>
                              <FileDown className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Pobierz logi sesji</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" disabled={resetting === s.imei}>
                          <RotateCcw className="h-3 w-3" />
                          Resetuj
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Resetuj harmonogram</AlertDialogTitle>
                          <AlertDialogDescription>
                            IMEI {s.imei} zostanie oznaczone jako oczekujące. Przy następnym połączeniu pliki DDD zostaną pobrane ponownie.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Anuluj</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleReset(s.imei)}>Resetuj</AlertDialogAction>
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
