import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

WebBrowser.maybeCompleteAuthSession();

const AUTH_TOKEN_KEY = "auth_session_token";
const ISSUER_URL = process.env.EXPO_PUBLIC_ISSUER_URL ?? "https://replit.com/oidc";

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
  login: () => Promise<void>;
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
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return "";
}

function getClientId(): string {
  return process.env.EXPO_PUBLIC_REPL_ID || "";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);

  const discovery = AuthSession.useAutoDiscovery(ISSUER_URL);
  const redirectUri = AuthSession.makeRedirectUri();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: getClientId(),
      scopes: ["openid", "email", "profile", "offline_access"],
      redirectUri,
      prompt: AuthSession.Prompt.Login,
    },
    discovery,
  );

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

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (response?.type !== "success" || !request?.codeVerifier) return;

    const { code, state, iss } = response.params;

    (async () => {
      try {
        const apiBase = getApiBaseUrl();
        if (!apiBase) {
          console.error("API base URL is not configured.");
          return;
        }

        const exchangeRes = await fetch(`${apiBase}/api/mobile-auth/token-exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            code_verifier: request.codeVerifier,
            redirect_uri: request.redirectUri,
            state,
            nonce: request.nonce,
            ...(iss ? { iss } : {}),
          }),
        });

        if (!exchangeRes.ok) {
          console.error("Token exchange failed:", exchangeRes.status);
          setIsLoading(false);
          return;
        }

        const data = await exchangeRes.json();
        if (data.token) {
          await SecureStore.setItemAsync(AUTH_TOKEN_KEY, data.token);
          if (data.user) {
            setUser(data.user);
            setIsLoading(false);
          } else {
            setIsLoading(true);
            await fetchUser();
          }
        }
      } catch (err) {
        console.error("Token exchange error:", err);
        setIsLoading(false);
      }
    })();
  }, [response, request, fetchUser]);

  const login = useCallback(async () => {
    if (Platform.OS === "web") {
      try {
        await promptAsync();
      } catch (err) {
        console.error("Login error:", err);
      }
      return;
    }

    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      console.error("API base URL is not configured.");
      return;
    }

    const mobileRedirectUri = AuthSession.makeRedirectUri();
    const loginUrl = `${apiBase}/api/login?mobileRedirect=${encodeURIComponent(mobileRedirectUri)}`;

    setIsLoading(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(loginUrl, mobileRedirectUri);
      if (result.type === "success" && result.url) {
        const redirected = new URL(result.url);
        const token = redirected.searchParams.get("token");
        if (token) {
          await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
          await fetchUser();
          return;
        }
      }
    } catch (err) {
      console.error("Login error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [promptAsync, fetchUser]);

  const logout = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (token) {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/api/mobile-auth/logout`, {
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
