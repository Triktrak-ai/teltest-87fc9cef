import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiResetPassword } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const token = searchParams.get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast({ title: "Błąd", description: "Brak tokena resetowania", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiResetPassword(token, password);
      toast({ title: "Hasło zmienione", description: "Możesz się teraz zalogować." });
      navigate("/auth");
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Nieprawidłowy link resetowania hasła.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-4 rounded-lg border bg-card p-8">
        <h2 className="text-lg font-semibold text-center">Ustaw nowe hasło</h2>
        <div className="space-y-2">
          <Label htmlFor="new-password">Nowe hasło</Label>
          <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Zapisywanie..." : "Zmień hasło"}
        </Button>
      </form>
    </div>
  );
};

export default ResetPassword;
