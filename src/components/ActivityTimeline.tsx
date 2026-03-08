import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import type { ActivityRecord } from "@/lib/ddd-parser";

const ACTIVITY_BAR_COLORS: Record<string, string> = {
  driving: "#ef4444",   // red-500
  work: "#f59e0b",      // amber-500
  availability: "#0ea5e9", // sky-500
  break: "#10b981",     // emerald-500
  unknown: "#9ca3af",   // gray-400
};

const ACTIVITY_LABELS: Record<string, string> = {
  driving: "Jazda",
  work: "Praca",
  availability: "Dyspozycyjność",
  break: "Odpoczynek",
  unknown: "Nieznany",
};

const HOURS = Array.from({ length: 25 }, (_, i) => i);
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function computeDaySummary(day: ActivityRecord) {
  const totals: Record<string, number> = { driving: 0, work: 0, availability: 0, break: 0, unknown: 0 };
  for (const e of day.entries) {
    // Only count driver slot to avoid double-counting with codriver
    if (e.slot !== 'driver') continue;
    const [hFrom, mFrom] = e.timeFrom.split(":").map(Number);
    const [hTo, mTo] = e.timeTo.split(":").map(Number);
    const from = hFrom * 60 + mFrom;
    const to = hTo * 60 + mTo;
    const dur = Math.max(0, to - from);
    totals[e.status] = (totals[e.status] || 0) + dur;
  }
  return totals;
}

interface TimelineBarProps {
  entries: ActivityRecord["entries"];
  slot: "driver" | "codriver";
  label: string;
}

function TimelineBar({ entries, slot, label }: TimelineBarProps) {
  const filtered = entries.filter((e) => e.slot === slot);
  if (filtered.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-[10px] font-semibold text-muted-foreground text-right">{label}</span>
      <div className="relative h-5 flex-1 rounded-sm bg-muted/50 overflow-hidden">
        {filtered.map((e, i) => {
          const [hFrom, mFrom] = e.timeFrom.split(":").map(Number);
          const [hTo, mTo] = e.timeTo.split(":").map(Number);
          const from = hFrom * 60 + mFrom;
          const to = hTo * 60 + mTo;
          const left = (from / 1440) * 100;
          const width = ((to - from) / 1440) * 100;
          if (width <= 0) return null;
          return (
            <div
              key={i}
              className="absolute top-0 h-full transition-opacity hover:opacity-80"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.2)}%`,
                backgroundColor: ACTIVITY_BAR_COLORS[e.status] || ACTIVITY_BAR_COLORS.unknown,
              }}
              title={`${ACTIVITY_LABELS[e.status]}: ${e.timeFrom}–${e.timeTo}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function HourAxis() {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0" />
      <div className="relative h-4 flex-1">
        {HOUR_LABELS.map((h) => (
          <span
            key={h}
            className="absolute text-[9px] text-muted-foreground -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {h.toString().padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}

function GridLines() {
  return (
    <div className="flex items-center gap-2 pointer-events-none" style={{ position: "absolute", inset: 0 }}>
      <span className="w-6 shrink-0" />
      <div className="relative flex-1 h-full">
        {HOURS.map((h) => (
          <div
            key={h}
            className="absolute top-0 h-full border-l border-border/30"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

interface DayCardProps {
  day: ActivityRecord;
  defaultExpanded?: boolean;
}

function DayCard({ day, defaultExpanded = false }: DayCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const summary = useMemo(() => computeDaySummary(day), [day]);
  const hasCodriver = day.entries.some((e) => e.slot === "codriver" && e.cardInserted);
  const dateStr = day.date ? day.date.toLocaleDateString("pl-PL", { weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" }) : "—";

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-sm font-semibold whitespace-nowrap">{dateStr}</span>
        </div>

        {/* Mini summary badges */}
        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {summary.driving > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-red-500/40 text-red-600 dark:text-red-400">
              <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {formatMinutes(summary.driving)}
            </Badge>
          )}
          {summary.work > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {formatMinutes(summary.work)}
            </Badge>
          )}
          {summary.availability > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-sky-500/40 text-sky-600 dark:text-sky-400">
              <div className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              {formatMinutes(summary.availability)}
            </Badge>
          )}
          {summary.break > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {formatMinutes(summary.break)}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">{day.dayDistance} km</Badge>
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-1 pb-3 px-4">
          <div className="relative space-y-1">
            <GridLines />
            <TimelineBar entries={day.entries} slot="driver" label="K1" />
            {hasCodriver && <TimelineBar entries={day.entries} slot="codriver" label="K2" />}
          </div>
          <HourAxis />

          {/* Detailed entries table */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-0.5">
            {day.entries
              .filter((e) => e.slot === "driver" || e.cardInserted)
              .map((e, j) => (
              <div key={j} className="flex items-center gap-1.5 text-[11px]">
                <div className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: ACTIVITY_BAR_COLORS[e.status] }} />
                <span className="text-muted-foreground">{e.timeFrom}–{e.timeTo}</span>
                <span className="font-medium">{ACTIVITY_LABELS[e.status]}</span>
                <span className="text-muted-foreground ml-auto">{e.slot === "driver" ? "K1" : "K2"}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

interface ActivityTimelineProps {
  activities: ActivityRecord[];
}

export default function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? activities : activities.slice(0, 30);

  // Overall summary
  const totalSummary = useMemo(() => {
    const totals: Record<string, number> = { driving: 0, work: 0, availability: 0, break: 0 };
    for (const day of activities) {
      const s = computeDaySummary(day);
      for (const key of Object.keys(totals)) totals[key] += s[key] || 0;
    }
    return totals;
  }, [activities]);

  const totalDistance = useMemo(() => activities.reduce((sum, d) => sum + d.dayDistance, 0), [activities]);

  return (
    <div className="space-y-3">
      {/* Legend & overall summary */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-4 text-xs">
              {Object.entries(ACTIVITY_BAR_COLORS).filter(([k]) => k !== "unknown").map(([key, color]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className="h-3 w-6 rounded-sm" style={{ backgroundColor: color }} />
                  <span>{ACTIVITY_LABELS[key]}</span>
                </div>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Jazda: <strong className="text-foreground">{formatMinutes(totalSummary.driving)}</strong></span>
              <span>Praca: <strong className="text-foreground">{formatMinutes(totalSummary.work)}</strong></span>
              <span>Dyst.: <strong className="text-foreground">{totalDistance} km</strong></span>
              <span>{activities.length} dni</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Day cards */}
      {displayed.map((day, idx) => (
        <DayCard key={idx} day={day} defaultExpanded={idx === 0} />
      ))}

      {activities.length > 30 && !showAll && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
            Pokaż wszystkie {activities.length} dni
          </Button>
        </div>
      )}
    </div>
  );
}
