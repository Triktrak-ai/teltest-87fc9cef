import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { apiFetch, getAccessToken, clearTokens, type AuthResponse } from "@/lib/api-client";

interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  approved: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  isAdmin: boolean;
  isApproved: boolean;
  loading: boolean;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
  /** Called after successful login to set user state */
  onLoginSuccess: (authRes: AuthResponse) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfileAndRole = useCallback(async () => {
    try {
      const [prof, roles] = await Promise.all([
        apiFetch<Profile>("/api/profiles/me"),
        apiFetch<{ role: string }[]>("/api/profiles/user-roles"),
      ]);
      setProfile(prof);
      setIsAdmin(roles.some((r) => r.role === "admin"));
    } catch {
      // Token invalid — clear
      clearTokens();
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (getAccessToken()) await fetchProfileAndRole();
  }, [fetchProfileAndRole]);

  // Bootstrap: check if we already have a token
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    // Decode user id/email from JWT payload (no verification — server validates)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUser({ id: payload.sub, email: payload.email });
      fetchProfileAndRole().finally(() => setLoading(false));
    } catch {
      clearTokens();
      setLoading(false);
    }
  }, [fetchProfileAndRole]);

  const signOut = () => {
    clearTokens();
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  };

  const onLoginSuccess = async (authRes: AuthResponse) => {
    setUser(authRes.user);
    await fetchProfileAndRole();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        isApproved: profile?.approved ?? false,
        loading,
        signOut,
        refreshProfile,
        onLoginSuccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
