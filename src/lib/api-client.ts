/**
 * API client for TachoWebApi (.NET backend).
 * Replaces all Supabase SDK calls with fetch() + JWT.
 *
 * Configure VITE_API_BASE_URL in .env (e.g. https://your-server:5100)
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

// ── Token storage ──────────────────────────────────────────────

const TOKEN_KEY = "tacho_access_token";
const REFRESH_KEY = "tacho_refresh_token";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ── Fetch wrapper ──────────────────────────────────────────────

async function refreshAccessToken(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;

  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: rt }),
  });

  if (!res.ok) {
    clearTokens();
    return null;
  }

  const data = await res.json();
  setTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let token = getAccessToken();

  const doFetch = async (tk: string | null) => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> ?? {}),
    };

    if (tk) headers["Authorization"] = `Bearer ${tk}`;

    // Don't set Content-Type for FormData
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    return fetch(`${API_BASE}${path}`, { ...options, headers });
  };

  let res = await doFetch(token);

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Auth API ───────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string };
}

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function apiSignup(email: string, password: string, fullName?: string, phone?: string) {
  return apiFetch("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: fullName, phone }),
  });
}

export async function apiForgotPassword(email: string) {
  return apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function apiResetPassword(token: string, newPassword: string) {
  return apiFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export function apiSignOut() {
  clearTokens();
}
