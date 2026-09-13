import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken, setToken } from "@/src/api/client";

type Role = "patient" | "staff";

export type SessionUser = {
  id: string;
  username: string;
  role: Role;
  name?: string;
  patient_id?: string;
};

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, pin: string) => Promise<Role>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<SessionUser>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      await clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (username: string, pin: string): Promise<Role> => {
    const res = await api<{ access_token: string; role: Role; name: string }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { username, pin },
    });
    await setToken(res.access_token);
    const me = await api<SessionUser>("/auth/me");
    setUser(me);
    return res.role;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout-all", { method: "POST" });
    } catch {
      // ignore
    }
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
