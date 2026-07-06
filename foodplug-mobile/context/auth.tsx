import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  clearSession,
  loadSession,
  login as loginRequest,
  saveSession,
  validateDeviceClock,
  type AuthSession,
  type SessionUser,
} from '@/lib/auth';

type AuthContextValue = {
  user: SessionUser | null;
  token: string | null;
  hydrated: boolean;
  loading: boolean;
  clockChecking: boolean;
  clockValid: boolean;
  clockError: string | null;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clockChecking, setClockChecking] = useState(true);
  const [clockValid, setClockValid] = useState(true);
  const [clockError, setClockError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const [storedSessionResult, clockResult] = await Promise.allSettled([loadSession(), validateDeviceClock()]);

      if (mounted) {
        if (storedSessionResult.status === 'fulfilled') {
          setSession(storedSessionResult.value);
        }

        if (clockResult.status === 'fulfilled') {
          setClockValid(true);
          setClockError(null);
        } else {
          setClockValid(false);
          setClockError(
            clockResult.reason instanceof Error ? clockResult.reason.message : 'Unable to verify device time.',
          );
        }

        setHydrated(true);
        setClockChecking(false);
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    if (!clockValid) {
      throw new Error(clockError || 'Device time is incorrect. Set date and time to automatic and try again.');
    }

    setLoading(true);
    try {
      const nextSession = await loginRequest(email, password);
      await saveSession(nextSession);
      setSession(nextSession);
      return nextSession.user;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await clearSession();
    setSession(null);
  };

  const value = useMemo(
    () => ({
      user: session?.user || null,
      token: session?.token || null,
      hydrated,
      loading,
      clockChecking,
      clockValid,
      clockError,
      login,
      logout,
    }),
    [clockChecking, clockError, clockValid, hydrated, loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
