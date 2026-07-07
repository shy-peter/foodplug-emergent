import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { Query } from 'appwrite';

import {
  ORGANIZATIONS_COLLECTION_ID,
  USERS_COLLECTION_ID,
  account,
  assertAppwriteConfig,
  createApiError,
  getConfiguredOrganizationId,
  listAll,
  type OrganizationDoc,
  type UserDoc,
} from '@/lib/appwrite';

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
let inMemorySession: AuthSession | null = null;

function normalizeAppwriteError(error: unknown) {
  if (typeof error === 'object' && error && 'message' in error) {
    const message = String((error as { message?: string }).message || '');
    if (message.includes('Invalid `email` param')) {
      return 'Invalid email or password';
    }
    if (message.includes('Invalid credentials')) {
      return 'Invalid email or password';
    }
    if (message.includes('Project with the requested ID could not be found')) {
      return 'Appwrite project is misconfigured. Check EXPO_PUBLIC_APPWRITE_PROJECT_ID.';
    }
    if (message.includes('Collection with the requested ID')) {
      return 'An Appwrite collection is missing. Verify your EXPO_PUBLIC_APPWRITE_* collection IDs.';
    }
    if (message.includes('not authorized')) {
      return 'Appwrite permissions blocked this action. Verify collection read access for this user.';
    }
    if (message.trim()) {
      return message;
    }
  }

  return 'Request failed';
}

async function ensureFreshAppwriteSession(email: string, password: string) {
  try {
    await account.deleteSession('current');
  } catch {
    // Ignore missing session.
  }

  return account.createEmailPasswordSession(email, password);
}

async function resolveSessionUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const configuredOrg = getConfiguredOrganizationId();

  const scopedQueries = [Query.equal('email', normalizedEmail), Query.limit(1)];
  if (configuredOrg) {
    scopedQueries.unshift(Query.equal('organization_id', configuredOrg));
  }

  const scopedUsers = await listAll<UserDoc>(USERS_COLLECTION_ID, scopedQueries);
  const fallbackUsers = scopedUsers.length > 0 ? scopedUsers : await listAll<UserDoc>(USERS_COLLECTION_ID, [Query.equal('email', normalizedEmail), Query.limit(1)]);
  const user = fallbackUsers[0];

  if (!user) {
    throw createApiError('Invalid email or password', 401);
  }

  let organizationName = '';
  if (user.organization_id) {
    const organizations = await listAll<OrganizationDoc>(ORGANIZATIONS_COLLECTION_ID, [
      Query.equal('id', user.organization_id),
      Query.limit(1),
    ]);
    organizationName = String(organizations[0]?.organization_name || '');
  }

  return {
    id: user.id,
    organization_id: user.organization_id,
    organization_name: organizationName,
    email: user.email,
    role: user.role,
    display_name: user.display_name,
    contact: user.contact || '',
  } satisfies SessionUser;
}

export async function validateDeviceClock() {
  // Appwrite-native mode has no custom backend clock endpoint.
  return;
}

export async function login(email: string, password: string) {
  assertAppwriteConfig();

  try {
    const session = await ensureFreshAppwriteSession(email.trim().toLowerCase(), password);
    const user = await resolveSessionUser(email);
    const nextSession: AuthSession = {
      token: session.$id,
      user,
    };
    inMemorySession = nextSession;
    return nextSession;
  } catch (error) {
    throw new Error(normalizeAppwriteError(error) || 'Login failed. Please try again.');
  }
}

export async function loadSession() {
  if (Platform.OS === 'web') {
    const rawSession = typeof localStorage === 'undefined' ? null : localStorage.getItem(SESSION_STORAGE_KEY);
    if (!rawSession) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawSession) as AuthSession;
      inMemorySession = parsed;
      return parsed;
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
    const parsed = JSON.parse(rawSession) as AuthSession;
    inMemorySession = parsed;
    return parsed;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    return null;
  }
}

export async function saveSession(session: AuthSession) {
  inMemorySession = session;
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
  inMemorySession = null;
  try {
    await account.deleteSession('current');
  } catch {
    // Ignore missing/expired session.
  }

  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
}

export async function requireSessionUser() {
  if (inMemorySession?.user) {
    return inMemorySession.user;
  }

  const storedSession = await loadSession();
  if (!storedSession?.user) {
    throw new Error('Not authenticated');
  }

  return storedSession.user;
}
