import { useSessions, isStaleSession, type Session } from "@/hooks/useSessions";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Lock, WifiOff, ShieldAlert, Loader } from "lucide-react";
import { useMemo } from "react";
import { useImeiOwners } from "@/hooks/useImeiOwners";

type SessionStatus = Session["status"];

const statusConfig: Record<string, { label: string; className: string }> = {
  connecting: { label: "Łączenie", className: "bg-info/20 text-info border-info/30" },
  auth_gen1: { label: "Auth Gen1", className: "bg-primary/20 text-primary border-primary/30" },
  auth_gen2v1: { label: "Auth Gen2v1", className: "bg-primary/20 text-primary border-primary/30" },
  auth_gen2v2: { label: "Auth Gen2v2", className: "bg-accent text-accent-foreground border-primary/30" },
  downloading: { label: "Pobieranie", className: "bg-info/20 text-info border-info/30" },
  completed: { label: "Ukończono", className: "bg-success/20 text-success border-success/30" },
  partial: { label: "Częściowe", className: "bg-warning/20 text-warning border-warning/30" },
  error: { label: "Błąd", className: "bg-destructive/20 text-destructive border-destructive/30" },
  waiting: { label: "Oczekuje", className: "bg-warning/20 text-warning border-warning/30" },
  skipped: { label: "Pominięto", className: "bg-muted text-muted-foreground border-muted-foreground/20" },
  ignition_off: { label: "Stacyjka OFF", className: "bg-muted text-muted-foreground border-muted-foreground/20" },
};

function getEffectiveStatus(s: Session): string {
  // Fix race condition: completed_at set but status stuck on "downloading"
  if (s.completed_at && s.status === "downloading") {
    if ((s.total_files ?? 0) > 0 && (s.files_downloaded ?? 0) < (s.total_files ?? 0)) {
      return "partial";
    }
    return "completed";
  }
  // Fix false success: completed with 0 files and 0 APDU = ignition OFF
  if (s.status === "completed" && (s.files_downloaded ?? 0) === 0 && (s.apdu_exchanges ?? 0) === 0) {
    return "ignition_off";
  }
  return s.status;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isGenerationMismatch(s: Session): { mismatch: boolean; culprit?: "card" | "vu"; message?: string } {
  const card = s.card_generation ?? "Unknown";
  const vu = s.generation ?? "Unknown";
  if (card === "Unknown" || vu === "Unknown") return { mismatch: false };
  // Gen2v2 card is backward compatible with all VUs
  if (card === "Gen2v2") return { mismatch: false };
  // Gen1 card in Gen1 VU — full compatibility
  if (card === "Gen1" && vu === "Gen1") return { mismatch: false };
  // Gen1 card in Gen2+ VU — no mismatch for company cards
  if (card === "Gen1" && (vu === "Gen2" || vu === "Gen2v1")) return { mismatch: false };
  // Gen2/Gen2v1 card in Gen1 VU — generally works for company cards
  if (vu === "Gen1") return { mismatch: false };
  // Gen2/Gen2v1 card in Gen2v2 VU — limited read of new sections
  if (vu === "Gen2v2" && (card === "Gen2" || card === "Gen2v1" || card === "Gen1")) {
    return { mismatch: true, culprit: "card", message: `Starsza karta firmowa (${card}) — możliwy ograniczony odczyt danych Gen2v2` };
  }
  // Gen2v1 + Gen1 card — possible auth error
  if ((vu === "Gen2" || vu === "Gen2v1") && card === "Gen1") {
    return { mismatch: true, culprit: "card", message: "Karta Gen1 w tachografie Gen2 — możliwy błąd autoryzacji" };
  }
  return { mismatch: false };
}

interface UnknownClassification {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
  tooltip: string;
  animate?: boolean;
}

function classifyUnknownGeneration(s: Session): UnknownClassification | null {
  const gen = s.generation ?? "Unknown";
  if (gen !== "Unknown") return null;

  // Skipped sessions
  if (s.status === "skipped") {
    return null; // handled by status column already
  }

  // Detecting — session in progress, generation not yet known
  if (s.status === "connecting" || (isActive(s.status) && (s.apdu_exchanges ?? 0) === 0)) {
    return {
      label: "Wykrywanie…",
      icon: Loader,
      className: "bg-info/20 text-info border-info/30",
      tooltip: "Sesja w trakcie — generacja tachografu jeszcze nieznana",
      animate: true,
    };
  }

  // Error-based classifications
  if (s.status === "error") {
    const apdu = s.apdu_exchanges ?? 0;
    const errMsg = (s.error_message ?? "").toLowerCase();
    const cardGen = s.card_generation ?? "Unknown";
    const bothUnknown = gen === "Unknown" && cardGen === "Unknown";

    // VU offline — no APDU at all, both generations unknown
    if (apdu === 0 && bothUnknown) {
      return {
        label: "VU offline",
        icon: WifiOff,
        className: "bg-muted text-muted-foreground border-muted-foreground/20",
        tooltip: "Brak odpowiedzi VU (stacyjka wyłączona?)",
      };
    }

    // Generation mismatch — card known but VU unknown, low APDU
    if (cardGen !== "Unknown" && apdu <= 3) {
      return {
        label: "Niezgodność",
        icon: AlertTriangle,
        className: "bg-warning/20 text-warning border-warning/30",
        tooltip: `Karta ${cardGen} niezgodna z tachografem — błąd autoryzacji`,
      };
    }

    // Lockout — low APDU, both unknown
    if (apdu <= 3 && bothUnknown) {
      return {
        label: "Lockout",
        icon: Lock,
        className: "bg-destructive/20 text-destructive border-destructive/30",
        tooltip: "Tachograf odrzucił certyfikat (blokada bezpieczeństwa)",
      };
    }

    // Certificate error keywords
    if (errMsg.includes("certificate rejected") || errMsg.includes("cert")) {
      return {
        label: "Lockout",
        icon: Lock,
        className: "bg-destructive/20 text-destructive border-destructive/30",
        tooltip: "Tachograf odrzucił certyfikat (blokada bezpieczeństwa)",
      };
    }

    // Advanced auth failure — high APDU count
    if (apdu >= 20) {
      return {
        label: "Auth błąd",
        icon: ShieldAlert,
        className: "bg-warning/20 text-warning border-warning/30",
        tooltip: `Autentykacja przerwana po ${apdu} wymianach APDU`,
      };
    }
  }

  return null; // fallback — show raw "Unknown"
}

function getErrorTooltip(s: Session): string | null {
  if (s.status !== "error") return null;
  const cls = classifyUnknownGeneration(s);
  if (cls) {
    if (cls.label === "Lockout") return "Blokada bezpieczeństwa tachografu (lockout)";
    if (cls.label === "VU offline") return "VU nie odpowiada — możliwe wyłączenie stacyjki";
    if (cls.label === "Auth błąd") return "Certyfikat odrzucony po pełnej autentykacji";
    if (cls.label === "Niezgodność") return cls.tooltip;
    return cls.tooltip;
  }
  // Universal error context for ALL error sessions (even with known generation)
  const files = s.files_downloaded ?? 0;
  const total = s.total_files ?? 0;
  const apdu = s.apdu_exchanges ?? 0;
  if (files > 0 && total > 0) {
    return `Pobieranie przerwane po ${files}/${total} plikach`;
  }
  if (apdu >= 20) {
    return `Błąd po autentykacji (${apdu} APDU)`;
  }
  return s.error_message || null;
}

function genBadgeClass(gen: string): string {
  if (gen === "Gen2v2") return "bg-accent text-accent-foreground border-accent/30";
  if (gen === "Gen2v1" || gen === "Gen2") return "bg-info/20 text-info border-info/30";
  if (gen === "Gen1") return "bg-muted text-muted-foreground border-muted-foreground/20";
  return "";
}

function isActive(status: string): boolean {
  return status !== "completed" && status !== "error" && status !== "partial" && status !== "skipped";
}

import { type AdminFilterResult } from "@/components/AdminFilter";

function matchesFilter(imei: string, filter: AdminFilterResult): boolean {
  return filter.imeis.includes(imei) || imei.toLowerCase().includes(filter.rawQuery);
}

interface SessionsTableProps {
  adminFilter?: AdminFilterResult | null;
}

export function SessionsTable({ adminFilter }: SessionsTableProps) {
  const { getOwner, isAdmin } = useImeiOwners();
  const { data: sessions, isLoading } = useSessions();

  const filtered = useMemo(() => {
    if (!sessions) return undefined;
    if (!adminFilter) return sessions;
    return sessions.filter((s) => matchesFilter(s.imei, adminFilter));
  }, [sessions, adminFilter]);

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Sesje pobierania DDD
        </h2>
        {filtered && filtered.some((s) => isActive(s.status)) && (
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
              {isAdmin && <th className="px-5 py-3">Użytkownik</th>}
              <th className="px-5 py-3">IMEI</th>
              <th className="px-5 py-3">Pojazd</th>
              <th className="px-5 py-3">Tachograf</th>
              <th className="px-5 py-3">Karta</th>
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
                    {Array.from({ length: isAdmin ? 13 : 12 }).map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}
            {!isLoading && filtered && filtered.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 13 : 12} className="px-5 py-12 text-center text-muted-foreground">
                  Brak aktywnych sesji
                </td>
              </tr>
            )}
            {filtered?.map((s) => {
              const effectiveStatus = getEffectiveStatus(s);
              const sc = statusConfig[effectiveStatus] ?? statusConfig.connecting;
              const active = isActive(effectiveStatus);
              const stale = isStaleSession(s);
              const staleMinutes = stale
                ? Math.round((Date.now() - new Date(s.last_activity).getTime()) / 60000)
                : 0;
              const genMismatch = isGenerationMismatch(s);
              return (
                <tr key={s.id} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${stale ? "opacity-50" : ""}`}>
                  {isAdmin && (
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {getOwner(s.imei)?.userName ?? "—"}
                    </td>
                  )}
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
                    <span className="flex items-center gap-1.5">
                      {(() => {
                        const cls = classifyUnknownGeneration(s);
                        if (cls) {
                          const IconComp = cls.icon;
                          return (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={cls.className}>
                                    <IconComp className={`h-3 w-3 mr-1 ${cls.animate ? "animate-spin" : ""}`} />
                                    <span className="font-mono text-xs">{cls.label}</span>
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{cls.tooltip}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        }
                        return (
                          <Badge variant="outline" className={genBadgeClass(s.generation)}>
                            <span className="font-mono text-xs">{s.generation}</span>
                          </Badge>
                        );
                      })()}
                      {genMismatch.mismatch && genMismatch.culprit === "vu" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex text-destructive">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{genMismatch.message ?? `Niezgodność: tachograf ${s.generation} nie obsługuje karty ${s.card_generation}`}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className={genBadgeClass(s.card_generation ?? "Unknown")}>
                        <span className="font-mono text-xs">{s.card_generation ?? "Unknown"}</span>
                      </Badge>
                      {genMismatch.mismatch && genMismatch.culprit === "card" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex text-destructive">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{genMismatch.message ?? `Niezgodność: karta ${s.card_generation} w tachografie ${s.generation}`}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5">
                      {effectiveStatus === "partial" ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={sc.className}>
                                {sc.label}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {s.error_message?.includes("empty_slot")
                                  ? "Pobrano wszystkie pliki VU. Brak włożonej karty kierowcy."
                                  : s.error_message
                                    ? s.error_message
                                    : `Pobrano ${s.files_downloaded ?? 0}/${s.total_files ?? 0} plików`}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : effectiveStatus === "ignition_off" ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={sc.className}>
                                <WifiOff className="h-3 w-3 mr-1" />
                                {sc.label}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Stacyjka wyłączona przed rozpoczęciem pobierania</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : effectiveStatus === "error" && getErrorTooltip(s) ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={sc.className}>
                                {sc.label}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{getErrorTooltip(s)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Badge variant="outline" className={sc.className}>
                          {sc.label}
                        </Badge>
                      )}
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
                    {s.error_code && effectiveStatus === "error" && (
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
