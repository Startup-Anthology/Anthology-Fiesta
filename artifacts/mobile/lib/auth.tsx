import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";

const AUTH_TOKEN_KEY = "auth_session_token";

interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
}

interface TwoFactorStatus {
  enrolled: boolean;
  method: string | null;
  totpVerified: boolean;
  twoFactorVerified: boolean;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  twoFactorStatus: TwoFactorStatus | null;
  refreshTwoFactorStatus: () => Promise<void>;
  isAdmin: boolean;
  is2faVerified: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
  twoFactorStatus: null,
  refreshTwoFactorStatus: async () => {},
  isAdmin: false,
  is2faVerified: false,
});

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  return "http://localhost:8080";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/auth/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.user) {
        setUser(data.user);
      } else {
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshTwoFactorStatus = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (!token) return;

      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/2fa/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTwoFactorStatus(data);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (user?.role === "admin") {
      refreshTwoFactorStatus();
    }
  }, [user, refreshTwoFactorStatus]);

  const login = useCallback(async (email: string, password: string) => {
    const apiBase = getApiBaseUrl();
    setIsLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Login failed");
      }

      const data = await res.json();
      if (data.token) {
        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, data.token);
        if (data.user) {
          setUser(data.user);
          setIsLoading(false);
        } else {
          await fetchUser();
        }
      }
    } catch (err) {
      setIsLoading(false);
      throw err;
    }
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (token) {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
    } finally {
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
      setUser(null);
      setTwoFactorStatus(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);

  const isAdmin = user?.role === "admin";
  const is2faVerified = twoFactorStatus?.twoFactorVerified === true;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
        twoFactorStatus,
        refreshTwoFactorStatus,
        isAdmin,
        is2faVerified,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}
