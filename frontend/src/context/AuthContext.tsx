import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearSession, getUser, saveSession, type SessionUser } from "@/lib/api";

type AuthContextType = {
  user: SessionUser | null;
  loading: boolean;
  clockChecking: boolean;
  clockValid: boolean;
  clockError: string | null;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => void;
  setUser: (user: SessionUser | null) => void;
};

type HealthResponse = {
  server_time?: string;
  server_time_ms?: number;
  max_clock_skew_ms?: number;
  detail?: string;
};

const CLOCK_CHECK_TIMEOUT_MS = 10000;
const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CLOCK_SAFETY_MARGIN_MS = 15 * 1000;

async function validateDeviceClock() {
  const requestStartedAt = Date.now();

  let healthResponse;
  try {
    healthResponse = await Promise.race([
      api.get<HealthResponse>("/health"),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Device clock check timed out. Check backend connectivity.")), CLOCK_CHECK_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Do not block app usage when clock verification is unavailable.
    return;
  }

  const responseReceivedAt = Date.now();

  const payload = healthResponse.data;
  const serverTimeMs =
    typeof payload.server_time_ms === "number" ? payload.server_time_ms : Date.parse(payload.server_time || "");
  const maxSkewMs = typeof payload.max_clock_skew_ms === "number" ? payload.max_clock_skew_ms : DEFAULT_CLOCK_SKEW_MS;

  if (!Number.isFinite(serverTimeMs)) {
    return;
  }

  // Use midpoint time to reduce false positives caused by request/response latency.
  const estimatedClientNow = Math.round((requestStartedAt + responseReceivedAt) / 2);
  const roundTripMs = Math.max(0, responseReceivedAt - requestStartedAt);
  const allowedSkewMs = Math.max(maxSkewMs, DEFAULT_CLOCK_SKEW_MS) + roundTripMs + CLOCK_SAFETY_MARGIN_MS;

  const skew = Math.abs(estimatedClientNow - serverTimeMs);
  if (skew > allowedSkewMs) {
    throw new Error("Device time is incorrect. Set date and time to automatic and try again.");
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => getUser());
  const [loading, setLoading] = useState(false);
  const [clockChecking, setClockChecking] = useState(true);
  const [clockValid, setClockValid] = useState(true);
  const [clockError, setClockError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const validate = async () => {
      const sessionValidation = (async () => {
        if (!user) return;
        try {
          const res = await api.get<SessionUser>("/auth/me");
          if (!mounted) return;
          setUser(res.data);
          localStorage.setItem("foodplug_user", JSON.stringify(res.data));
        } catch {
          if (!mounted) return;
          clearSession();
          setUser(null);
        }
      })();

      const clockValidation = (async () => {
        try {
          await validateDeviceClock();
          if (!mounted) return;
          setClockValid(true);
          setClockError(null);
        } catch (error) {
          if (!mounted) return;
          setClockValid(false);
          setClockError(error instanceof Error ? error.message : "Unable to verify device time.");
        }
      })();

      await Promise.allSettled([sessionValidation, clockValidation]);
      if (mounted) {
        setClockChecking(false);
      }
    };

    void validate();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: SessionUser }>("/auth/login", { email, password });
      saveSession(res.data.token, res.data.user);
      setUser(res.data.user);
      return res.data.user;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      clockChecking,
      clockValid,
      clockError,
      login,
      logout,
      setUser,
    }),
    [clockChecking, clockError, clockValid, loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
