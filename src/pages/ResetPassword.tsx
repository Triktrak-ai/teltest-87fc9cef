import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Check if already in recovery via hash
    if (window.location.hash.includes("type=recovery")) setReady(true);
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Hasło zmienione", description: "Możesz się teraz zalogować." });
      navigate("/");
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Weryfikacja linku resetowania hasła...</p>
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
