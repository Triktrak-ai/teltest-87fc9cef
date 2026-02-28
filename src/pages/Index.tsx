import { StatsCards } from "@/components/StatsCards";
import { SessionsTable } from "@/components/SessionsTable";
import { EventTimeline } from "@/components/EventTimeline";
import { CompatibilityMatrix } from "@/components/CompatibilityMatrix";
import { DownloadScheduleTable } from "@/components/DownloadScheduleTable";
import { DeviceManagement } from "@/components/DeviceManagement";
import { AdminPanel } from "@/components/AdminPanel";
import { useAuth } from "@/contexts/AuthContext";
import { Radio, RefreshCw, FileText, LogOut, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const Index = () => {
  const queryClient = useQueryClient();
  const { isAdmin, signOut, profile } = useAuth();
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [showAdmin, setShowAdmin] = useState(false);

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
            {isAdmin && (
              <button
                onClick={() => setShowAdmin((v) => !v)}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/80 transition-colors"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {showAdmin ? "Dashboard" : "Admin"}
              </button>
            )}
            <Link
              to="/ddd-reader"
              className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              Czytnik DDD
            </Link>
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
              <span className="text-xs text-muted-foreground">
                {profile?.full_name || "Użytkownik"}
              </span>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Wyloguj
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {showAdmin && isAdmin ? (
          <AdminPanel />
        ) : (
          <>
            <StatsCards />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2 space-y-6">
                <SessionsTable />
                <DownloadScheduleTable />
              </div>
              <div className="space-y-6">
                {!isAdmin && <DeviceManagement />}
                <CompatibilityMatrix />
                <EventTimeline />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
