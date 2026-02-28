import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [registered, setRegistered] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Błąd logowania", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone: phone || undefined },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setRegistered(true);
    } catch (err: any) {
      toast({ title: "Błąd rejestracji", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Podaj adres email", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: "Link wysłany", description: "Sprawdź swoją skrzynkę email." });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  if (registered) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md space-y-4 rounded-lg border bg-card p-8 text-center">
          <h2 className="text-xl font-semibold">Konto utworzone</h2>
          <p className="text-sm text-muted-foreground">
            Sprawdź swoją skrzynkę email, aby potwierdzić adres. Po weryfikacji Twoje konto będzie
            oczekiwać na zatwierdzenie przez administratora.
          </p>
          <button onClick={() => { setRegistered(false); setIsLogin(true); }} className="text-sm text-primary hover:underline">
            Wróć do logowania
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-sm space-y-6 rounded-lg border bg-card p-8">
        <div className="flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Radio className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-lg font-bold">TachoDDD Monitor</h1>
        </div>

        <div className="flex rounded-md border">
          <button
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${isLogin ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Logowanie
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${!isLogin ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Rejestracja
          </button>
        </div>

        <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-4">
          {!isLogin && (
            <>
              <div className="space-y-2">
                <Label htmlFor="fullName">Imię i nazwisko</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon (opcjonalnie)</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Proszę czekać..." : isLogin ? "Zaloguj się" : "Zarejestruj się"}
          </Button>
          {isLogin && (
            <button type="button" onClick={handleForgotPassword} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">
              Zapomniałeś hasła?
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default Auth;
