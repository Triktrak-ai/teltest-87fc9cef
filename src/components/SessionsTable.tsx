import { useSessions, isStaleSession, type Session } from "@/hooks/useSessions";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Lock, WifiOff, ShieldAlert, Loader } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useImeiOwners } from "@/hooks/useImeiOwners";

type SessionStatus = Session["status"];

const ERR_CLASS = "bg-destructive/20 text-destructive border-destructive/30";
const statusConfig: Record<string, { label: string; className: string }> = {
  connecting: { label: "Łączenie", className: ERR_CLASS },
  auth_gen1: { label: "Auth Gen1", className: ERR_CLASS },
  auth_gen2v1: { label: "Auth Gen2v1", className: ERR_CLASS },
  auth_gen2v2: { label: "Auth Gen2v2", className: ERR_CLASS },
  downloading: { label: "Pobieranie", className: ERR_CLASS },
  completed: { label: "Ukończono", className: "bg-success/20 text-success border-success/30" },
  partial: { label: "Częściowe", className: ERR_CLASS },
  error: { label: "Błąd", className: ERR_CLASS },
  waiting: { label: "Oczekuje", className: ERR_CLASS },
  skipped: { label: "Pominięto", className: ERR_CLASS },
  ignition_off: { label: "Stacyjka OFF", className: ERR_CLASS },
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

    // Lockout — low APDU (cert rejected or security lockout)
    // Note: error_message is not populated by C# server, so we can't distinguish
    // lockout from generation mismatch here. Lockout is the dominant case (>95%).
    // True generation mismatches are visible in session events timeline.
    if (apdu <= 3) {
      return {
        label: "Lockout",
        icon: Lock,
        className: "bg-destructive/20 text-destructive border-destructive/30",
        tooltip: "Tachograf odrzucił certyfikat (blokada bezpieczeństwa po udanym pobraniu)",
      };
    }

    // Certificate error keywords (higher APDU)
    const isCertRejected = errMsg.includes("certificate rejected") || errMsg.includes("cert");

    // Certificate error keywords (higher APDU)
    if (isCertRejected) {
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

function getErrorBadgeInfo(s: Session): { label: string; icon?: React.ComponentType<{ className?: string }>; className: string } {
  const cls = classifyUnknownGeneration(s);
  if (cls) {
    if (cls.label === "VU offline") return { label: "VU offline", icon: WifiOff, className: "bg-muted text-muted-foreground border-muted-foreground/20" };
    if (cls.label === "Lockout") return { label: "Lockout", icon: Lock, className: "bg-destructive/20 text-destructive border-destructive/30" };
    if (cls.label === "Auth błąd") return { label: "Auth błąd", icon: ShieldAlert, className: "bg-warning/20 text-warning border-warning/30" };
  }
  const files = s.files_downloaded ?? 0;
  const total = s.total_files ?? 0;
  if (files > 0 && total > 0) {
    return { label: `Przerwane ${files}/${total}`, icon: AlertTriangle, className: "bg-warning/20 text-warning border-warning/30" };
  }
  const apdu = s.apdu_exchanges ?? 0;
  if (apdu >= 20) {
    return { label: "Auth błąd", icon: ShieldAlert, className: "bg-warning/20 text-warning border-warning/30" };
  }
  return { label: "Błąd", className: "bg-destructive/20 text-destructive border-destructive/30" };
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

  const PAGE_SIZE = 30;
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when filter or data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [adminFilter, sessions]);

  const totalPages = filtered ? Math.ceil(filtered.length / PAGE_SIZE) : 0;
  const paginatedSessions = useMemo(() => {
    if (!filtered) return undefined;
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (currentPage > 3) pages.push("...");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("...");
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  }, [totalPages, currentPage]);

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
              <th className="px-5 py-3">Data / Czas</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">IMEI</th>
              <th className="px-5 py-3">Pojazd</th>
              <th className="px-5 py-3">Tachograf</th>
              <th className="px-5 py-3">Karta</th>
              <th className="px-5 py-3">Postęp</th>
              <th className="px-5 py-3">Pliki</th>
              <th className="px-5 py-3">Akt. plik</th>
              <th className="px-5 py-3">Pobrano</th>
              <th className="px-5 py-3">APDU</th>
              <th className="px-5 py-3">CRC err</th>
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
            {paginatedSessions?.map((s) => {
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
                  {/* Data / Czas */}
                  <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {(() => {
                      const d = new Date(s.last_activity);
                      return (
                        <>
                          <span>{d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })}</span>
                          {" "}
                          <span className="font-mono">{d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                        </>
                      );
                    })()}
                  </td>
                  {/* Status */}
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
                      ) : effectiveStatus === "error" ? (() => {
                        const errInfo = getErrorBadgeInfo(s);
                        const ErrIcon = errInfo.icon;
                        const tooltip = getErrorTooltip(s);
                        const badge = (
                          <Badge variant="outline" className={errInfo.className}>
                            {ErrIcon && <ErrIcon className="h-3 w-3 mr-1" />}
                            {errInfo.label}
                          </Badge>
                        );
                        return tooltip ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>{badge}</TooltipTrigger>
                              <TooltipContent><p>{tooltip}</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : badge;
                      })() : (
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
                  {/* IMEI */}
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
                  <td className="px-5 py-3 w-32">
                    {effectiveStatus === "downloading" ? (
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {filtered && totalPages > 1 && (
        <div className="border-t px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} z {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Poprzednia
            </Button>
            {pageNumbers.map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
              ) : (
                <Button
                  key={p}
                  variant={p === currentPage ? "outline" : "ghost"}
                  size="sm"
                  className="h-8 w-8 p-0 text-xs"
                  onClick={() => setCurrentPage(p as number)}
                >
                  {p}
                </Button>
              )
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Następna
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
