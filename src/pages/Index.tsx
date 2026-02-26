import { StatsCards } from "@/components/StatsCards";
import { SessionsTable } from "@/components/SessionsTable";
import { EventTimeline } from "@/components/EventTimeline";
import { Radio, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const Index = () => {
  const queryClient = useQueryClient();
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    queryClient.invalidateQueries({ queryKey: ["session_events"] });
    setLastRefresh(new Date());
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 glow-green-sm">
              <Radio className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">TachoDDD Monitor</h1>
              <p className="text-xs text-muted-foreground">Teltonika Remote Download Protocol</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Odśwież
            </button>
            <span className="text-xs text-muted-foreground">
              {lastRefresh.toLocaleTimeString("pl-PL")}
            </span>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <span className="text-xs text-muted-foreground">Serwer aktywny</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <StatsCards />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SessionsTable />
          </div>
          <div>
            <EventTimeline />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
