import { mockEvents, type EventLog } from "@/lib/mock-data";
import { Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

const typeConfig: Record<EventLog["type"], { icon: React.ReactNode; color: string }> = {
  info: { icon: <Info size={14} />, color: "text-info" },
  success: { icon: <CheckCircle size={14} />, color: "text-success" },
  warning: { icon: <AlertTriangle size={14} />, color: "text-warning" },
  error: { icon: <XCircle size={14} />, color: "text-destructive" },
};

export function EventTimeline() {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Ostatnie zdarzenia
        </h2>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {mockEvents.map((event) => {
          const cfg = typeConfig[event.type];
          return (
            <div
              key={event.id}
              className="flex items-start gap-3 border-b border-border/30 px-5 py-3 hover:bg-secondary/20 transition-colors"
            >
              <span className={`mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{event.timestamp}</span>
                  <span className="font-mono text-xs text-primary/80 mr-2">[{event.imei}]</span>
                  <span>{event.message}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
