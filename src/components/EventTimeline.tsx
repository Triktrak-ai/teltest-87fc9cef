import { useSessionEvents } from "@/hooks/useSessions";
import { Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useRef } from "react";

const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  info: { icon: <Info size={14} />, color: "text-info" },
  success: { icon: <CheckCircle size={14} />, color: "text-success" },
  warning: { icon: <AlertTriangle size={14} />, color: "text-warning" },
  error: { icon: <XCircle size={14} />, color: "text-destructive" },
};

export function EventTimeline() {
  const { data: events, isLoading } = useSessionEvents();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events]);

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Ostatnie zdarzenia
        </h2>
        {events && events.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Live
          </span>
        )}
      </div>
      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto">
        {isLoading && (
          <div className="space-y-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3 border-b border-border/30 px-5 py-3">
                <Skeleton className="mt-0.5 h-4 w-4 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}
        {!isLoading && events && events.length === 0 && (
          <div className="px-5 py-12 text-center text-muted-foreground text-sm">
            Brak zdarzeń
          </div>
        )}
        {events?.map((event) => {
          const cfg = typeConfig[event.type] ?? typeConfig.info;
          const time = new Date(event.created_at).toLocaleTimeString("pl-PL", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          return (
            <div
              key={event.id}
              className="flex items-start gap-3 border-b border-border/30 px-5 py-3 hover:bg-secondary/20 transition-colors"
            >
              <span className={`mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{time}</span>
                  <span className="font-mono text-xs text-primary/80 mr-2">[{event.imei}]</span>
                  <span>{event.message}</span>
                  {event.context && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      ({event.context})
                    </span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
