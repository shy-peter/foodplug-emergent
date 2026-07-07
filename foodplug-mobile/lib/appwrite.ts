import { Account, Client, Databases, ID, Query, type Models } from 'appwrite';

const ENDPOINT = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT?.trim();
const PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID?.trim();
const DATABASE_ID = process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID?.trim();
const ORGANIZATION_ID = process.env.EXPO_PUBLIC_APPWRITE_ORGANIZATION_ID?.trim() || '';

export const ORGANIZATIONS_COLLECTION_ID =
  process.env.EXPO_PUBLIC_APPWRITE_ORGANIZATIONS_COLLECTION_ID?.trim() || 'organizations';
export const USERS_COLLECTION_ID = process.env.EXPO_PUBLIC_APPWRITE_USERS_COLLECTION_ID?.trim() || 'users';
export const CUSTOMERS_COLLECTION_ID = process.env.EXPO_PUBLIC_APPWRITE_CUSTOMERS_COLLECTION_ID?.trim() || 'customers';
export const SALES_COLLECTION_ID = process.env.EXPO_PUBLIC_APPWRITE_SALES_COLLECTION_ID?.trim() || 'sales';

export type UserRole = 'admin' | 'sales';

export type UserDoc = Models.Document & {
  id: string;
  organization_id: string;
  organization_name?: string;
  email: string;
  role: UserRole;
  display_name: string;
  contact?: string;
  created_at?: string;
};

export type OrganizationDoc = Models.Document & {
  id: string;
  organization_name: string;
};

export type CustomerDoc = Models.Document & {
  id: string;
  organization_id: string;
  name: string;
  contractor: string;
  pin: string;
  created_at: string;
  balance_credited?: number;
};

export type SaleDoc = Models.Document & {
  id: string;
  organization_id: string;
  type: 'customer' | 'visitor';
  customer_id?: string | null;
  customer_name: string;
  contractor: string;
  food_type: string;
  amount: number;
  agent_id: string;
  agent_name: string;
  created_at: string;
};

export function nowIso() {
  return new Date().toISOString();
}

export function createApiError(detail: string, status = 400) {
  const error = new Error(detail) as Error & {
    response?: {
      status: number;
      data: { detail: string };
    };
  };

  error.response = {
    status,
    data: { detail },
  };

  return error;
}

export function assertAppwriteConfig() {
  if (!ENDPOINT || !PROJECT_ID || !DATABASE_ID) {
    throw createApiError(
      'Appwrite is not configured. Set EXPO_PUBLIC_APPWRITE_ENDPOINT, EXPO_PUBLIC_APPWRITE_PROJECT_ID, and EXPO_PUBLIC_APPWRITE_DATABASE_ID.',
      500,
    );
  }
}

const client = new Client()
  .setEndpoint(ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(PROJECT_ID || 'missing-project-id');

export const account = new Account(client);
export const db = new Databases(client);
export { ID, Query };

export function getConfiguredOrganizationId() {
  return ORGANIZATION_ID;
}

export async function listAll<T extends Models.Document>(collectionId: string, queries: string[] = []) {
  assertAppwriteConfig();
  if (!DATABASE_ID) {
    throw createApiError('Missing EXPO_PUBLIC_APPWRITE_DATABASE_ID.', 500);
  }

  const hasExplicitLimit = queries.some((query) => /^limit\(\d+\)$/.test(String(query)));
  if (hasExplicitLimit) {
    const response = await db.listDocuments<T>(DATABASE_ID, collectionId, queries);
    return response.documents;
  }

  const pageSize = 500;
  const documents: T[] = [];
  let cursorAfter: string | null = null;

  while (true) {
    const pageQueries = [...queries, Query.limit(pageSize)];
    if (cursorAfter) {
      pageQueries.push(Query.cursorAfter(cursorAfter));
    }

    const response = await db.listDocuments<T>(DATABASE_ID, collectionId, pageQueries);
    documents.push(...response.documents);

    if (response.documents.length < pageSize) {
      break;
    }

    const lastDocument = response.documents[response.documents.length - 1];
    cursorAfter = lastDocument?.$id || null;
    if (!cursorAfter) {
      break;
    }
  }

  return documents;
}

export async function createDoc(collectionId: string, payload: Record<string, unknown>) {
  assertAppwriteConfig();
  if (!DATABASE_ID) {
    throw createApiError('Missing EXPO_PUBLIC_APPWRITE_DATABASE_ID.', 500);
  }

  return db.createDocument(DATABASE_ID, collectionId, ID.unique(), payload);
}
