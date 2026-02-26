import { StatsCards } from "@/components/StatsCards";
import { SessionsTable } from "@/components/SessionsTable";
import { EventTimeline } from "@/components/EventTimeline";
import { Radio } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <span className="text-xs text-muted-foreground">Serwer aktywny</span>
          </div>
        </div>
      </header>

      {/* Content */}
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
