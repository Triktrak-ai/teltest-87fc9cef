import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Clock } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isApproved, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Ładowanie...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isApproved && !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md space-y-4 rounded-lg border bg-card p-8 text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Konto oczekuje na zatwierdzenie</h2>
          <p className="text-sm text-muted-foreground">
            Twoje konto zostało utworzone, ale wymaga zatwierdzenia przez administratora.
            Skontaktuj się z administratorem systemu.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary hover:underline"
          >
            Odśwież status
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
