import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type UserRole = 'admin' | 'sales';

export type SessionUser = {
  id: string;
  organization_id: string;
  organization_name?: string;
  email: string;
  role: UserRole;
  display_name: string;
  contact?: string;
};

export type AuthSession = {
  token: string;
  user: SessionUser;
};

const SESSION_STORAGE_KEY = 'foodplug_mobile_session';
const AUTH_REQUEST_TIMEOUT_MS = 10000;
const CLOCK_CHECK_TIMEOUT_MS = 10000;
const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;

const DEFAULT_API_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:4000',
  ios: 'http://localhost:4000',
  web: 'http://localhost:4000',
  default: 'http://localhost:4000',
});

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_AUTH_API_BASE_URL?.trim();
  return (configuredBaseUrl || DEFAULT_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
}

function getExpoHostApiBaseUrl() {
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost;
  if (!hostUri) {
    return null;
  }

  const host = hostUri.replace(/^exp:\/\//, '').replace(/^http:\/\//, '').split(':')[0].trim();
  if (!host) {
    return null;
  }

  return `http://${host}:4000`;
}

export function getAuthApiBaseUrls() {
  return Array.from(
    new Set(
      [process.env.EXPO_PUBLIC_AUTH_API_BASE_URL?.trim(), getExpoHostApiBaseUrl(), getApiBaseUrl(), 'http://localhost:4000']
        .filter((value): value is string => Boolean(value))
        .map((value) => value.replace(/\/$/, '')),
    ),
  );
}

async function fetchJson<T>(baseUrl: string, path: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = (await response.json().catch(() => ({}))) as Partial<T> & { detail?: string; message?: string };
  return { response, payload };
}

type HealthResponse = {
  status?: string;
  detail?: string;
  server_time?: string;
  server_time_ms?: number;
  max_clock_skew_ms?: number;
};

async function fetchHealth(baseUrl: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLOCK_CHECK_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = (await response.json().catch(() => ({}))) as HealthResponse;
  return { response, payload };
}

export async function validateDeviceClock() {
  let lastError: Error | null = null;

  for (const baseUrl of getAuthApiBaseUrls()) {
    try {
      const { response, payload } = await fetchHealth(baseUrl);
      const serverTimeMs =
        typeof payload.server_time_ms === 'number' ? payload.server_time_ms : Date.parse(payload.server_time || '');
      const maxSkewMs = typeof payload.max_clock_skew_ms === 'number' ? payload.max_clock_skew_ms : DEFAULT_CLOCK_SKEW_MS;

      if (Number.isFinite(serverTimeMs)) {
        const skew = Math.abs(Date.now() - serverTimeMs);
        if (skew > maxSkewMs) {
          throw new Error('Device time is incorrect. Set date and time to automatic and try again.');
        }
        return;
      }

      const message = payload.detail || 'Unable to verify device time.';
      if (response.status === 404 || response.status >= 500) {
        lastError = new Error(message);
        continue;
      }

      throw new Error(message);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(`Device clock check timed out for ${baseUrl}. Check backend connectivity.`);
      } else {
        lastError = error instanceof Error ? error : new Error('Unable to verify device time.');
      }
    }
  }

  throw lastError || new Error('Unable to verify device time.');
}

export async function login(email: string, password: string) {
  let lastError: Error | null = null;

  for (const baseUrl of getAuthApiBaseUrls()) {
    try {
      const { response, payload } = await fetchJson<AuthSession>(baseUrl, '/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const message = payload.detail || payload.message || 'Login failed. Please try again.';
        if (response.status === 404 || response.status >= 500) {
          lastError = new Error(message);
          continue;
        }
        throw new Error(message);
      }

      if (!payload.token || !payload.user) {
        throw new Error('Login failed. Invalid server response.');
      }

      return payload as AuthSession;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(`Login request timed out for ${baseUrl}. Check backend connectivity.`);
      } else {
        lastError = error instanceof Error ? error : new Error('Login failed. Please try again.');
      }
    }
  }

  throw lastError || new Error('Login failed. Please try again.');
}

export async function loadSession() {
  if (Platform.OS === 'web') {
    const rawSession = typeof localStorage === 'undefined' ? null : localStorage.getItem(SESSION_STORAGE_KEY);
    if (!rawSession) {
      return null;
    }

    try {
      return JSON.parse(rawSession) as AuthSession;
    } catch {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
      return null;
    }
  }

  const rawSession = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as AuthSession;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    return null;
  }
}

export async function saveSession(session: AuthSession) {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return;
  }

  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export async function clearSession() {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
}
