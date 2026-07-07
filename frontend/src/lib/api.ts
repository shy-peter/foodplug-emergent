import { Account, Client, Databases, ID, Query, type Models } from "appwrite";

const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;
const ORGANIZATION_ID = import.meta.env.VITE_APPWRITE_ORGANIZATION_ID;
const AUTH_API_BASE_URL = import.meta.env.VITE_AUTH_API_BASE_URL;
const USE_AUTH_API = String(import.meta.env.VITE_USE_AUTH_API || "").toLowerCase() === "true";
const ORGANIZATIONS_COLLECTION_ID = import.meta.env.VITE_APPWRITE_ORGANIZATIONS_COLLECTION_ID || "organizations";
const USERS_COLLECTION_ID = import.meta.env.VITE_APPWRITE_USERS_COLLECTION_ID || "users";
const CUSTOMERS_COLLECTION_ID = import.meta.env.VITE_APPWRITE_CUSTOMERS_COLLECTION_ID || "customers";
const SALES_COLLECTION_ID = import.meta.env.VITE_APPWRITE_SALES_COLLECTION_ID || "sales";
const PAYMENT_HISTORY_COLLECTION_ID = import.meta.env.VITE_APPWRITE_PAYMENT_HISTORY_COLLECTION_ID || "payment_history";
const BRANCHES_COLLECTION_ID = import.meta.env.VITE_APPWRITE_BRANCHES_COLLECTION_ID || "branches";

export const TOKEN_KEY = "foodplug_token";
export const USER_KEY = "foodplug_user";

export type UserRole = "admin" | "sales";

export type SessionUser = {
  id: string;
  organization_id: string;
  organization_name?: string;
  email: string;
  role: UserRole;
  display_name: string;
  contact?: string;
  location?: string;
};

type UserDoc = Models.Document & SessionUser & { organization_id: string; created_at: string };
type OrganizationDoc = Models.Document & {
  id: string;
  organization_name: string;
  company_code: string;
  address?: string;
  phone?: string;
  email?: string;
  subscription: "trial" | "basic" | "premium" | "enterprise";
  status: "active" | "inactive" | "suspended";
  max_users: number;
  admin_user_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
};
type CustomerDoc = Models.Document & {
  id: string;
  organization_id: string;
  name: string;
  contractor: string;
  location?: string;
  pin: string;
  created_at: string;
  balance_credited?: number;
};
type BranchDoc = Models.Document & {
  id: string;
  organization_id: string;
  branch_name: string;
  sub_branch_name: string;
  created_at: string;
};
type SaleDoc = Models.Document & {
  id: string;
  organization_id: string;
  type: "customer" | "visitor";
  customer_id?: string | null;
  customer_name: string;
  contractor: string;
  food_type: string;
  amount: number;
  agent_id: string;
  agent_name: string;
  location?: string;
  created_at: string;
};

type SaleData = {
  id: string;
  organization_id: string;
  type: "customer" | "visitor";
  customer_id?: string | null;
  customer_name: string;
  contractor: string;
  food_type: string;
  amount: number;
  agent_id: string;
  agent_name: string;
  location?: string;
  created_at: string;
};

type GetOptions = { params?: Record<string, unknown> };

type AppwriteApiError = Error & {
  response: {
    status: number;
    data: {
      detail: string;
    };
  };
};

function nowIso() {
  return new Date().toISOString();
}

function createApiError(detail: string, status = 400): AppwriteApiError {
  const err = new Error(detail) as AppwriteApiError;
  err.response = {
    status,
    data: { detail },
  };
  return err;
}

function assertAppwriteBaseConfig() {
  if (!ENDPOINT || !PROJECT_ID || !DATABASE_ID) {
    throw createApiError(
      "Appwrite is not configured. Set VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, and VITE_APPWRITE_DATABASE_ID.",
      500,
    );
  }
}

function assertTenantConfig() {
  assertAppwriteBaseConfig();
  getTenantOrganizationId();
}

function getTenantOrganizationId() {
  const fromSession = getUser()?.organization_id?.trim() || "";
  const fromEnv = (ORGANIZATION_ID || "").trim();
  const organizationId = fromSession || fromEnv;
  if (!organizationId) {
    throw createApiError("Tenant is not configured. Sign in again or set VITE_APPWRITE_ORGANIZATION_ID.", 500);
  }
  return organizationId;
}

// Keep initialization non-fatal so the app can render and show a clear setup error when API is used.
const client = new Client()
  .setEndpoint(ENDPOINT || "https://cloud.appwrite.io/v1")
  .setProject(PROJECT_ID || "missing-project-id");
const account = new Account(client);
const db = new Databases(client);

function toSessionUser(user: UserDoc): SessionUser {
  return {
    id: user.id,
    organization_id: user.organization_id,
    email: user.email,
    role: user.role,
    display_name: user.display_name,
    contact: user.contact || "",
    location: user.location || "",
  };
}

function hasAuthApi() {
  return false;
}

function getAuthApiBaseUrl() {
  const configured = (AUTH_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
    if (isLocalHost) {
      return `${window.location.protocol}//${hostname}:4000`;
    }
  }

  return "";
}

function isNetworkFetchError(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = typeof error === "object" && error && "message" in error ? String((error as { message?: string }).message || "") : "";
  const lowered = message.toLowerCase();
  return (
    lowered.includes("failed to fetch")
    || lowered.includes("networkerror")
    || lowered.includes("load failed")
    || lowered.includes("network request failed")
  );
}

function authApiUrl(path: string) {
  const base = getAuthApiBaseUrl();
  return `${base}${path}`;
}

async function postAuthApi<T>(path: string, body?: Record<string, unknown>) {
  const token = getToken();
  const response = await fetch(authApiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  const payload = (await response.json().catch(() => ({}))) as { detail?: string } & T;
  if (!response.ok) {
    throw createApiError(payload.detail || "Auth API request failed", response.status);
  }

  return payload;
}

async function deleteAuthApi<T>(path: string) {
  const token = getToken();
  const response = await fetch(authApiUrl(path), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as { detail?: string } & T;
  if (!response.ok) {
    throw createApiError(payload.detail || "Auth API request failed", response.status);
  }

  return payload;
}

async function ensureFreshAppwriteSession(email: string, password: string) {
  try {
    await account.deleteSession("current");
  } catch {
    // Ignore missing or already-cleared sessions.
  }

  await account.createEmailPasswordSession(email, password);
}

async function patchAuthApi<T>(path: string, body?: Record<string, unknown>) {
  const token = getToken();
  const response = await fetch(authApiUrl(path), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  const payload = (await response.json().catch(() => ({}))) as { detail?: string } & T;
  if (!response.ok) {
    throw createApiError(payload.detail || "Auth API request failed", response.status);
  }

  return payload;
}

async function getAuthApi<T>(path: string, options?: GetOptions) {
  const token = getToken();
  const params = new URLSearchParams();
  const rawParams = options?.params || {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  const fullPath = query ? `${path}?${query}` : path;

  const response = await fetch(authApiUrl(fullPath), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as { detail?: string } & T;
  if (!response.ok) {
    throw createApiError(payload.detail || "Auth API request failed", response.status);
  }

  return payload;
}

function getCurrentUserOrThrow() {
  const user = getUser();
  if (!user) throw createApiError("Not authenticated", 401);
  return user;
}

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw createApiError("Admin privileges required", 403);
  }
}

async function listAll<T extends Models.Document>(collectionId: string, queries: string[] = []) {
  const hasExplicitLimit = queries.some((query) => /^limit\(\d+\)$/.test(String(query)));
  if (hasExplicitLimit) {
    const res = await db.listDocuments<T>(DATABASE_ID as string, collectionId, queries);
    return res.documents;
  }

  const pageSize = 500;
  const documents: T[] = [];
  let cursorAfter: string | null = null;

  while (true) {
    const pageQueries = [...queries, Query.limit(pageSize)];
    if (cursorAfter) {
      pageQueries.push(Query.cursorAfter(cursorAfter));
    }

    const res = await db.listDocuments<T>(DATABASE_ID as string, collectionId, pageQueries);
    documents.push(...res.documents);

    if (res.documents.length < pageSize) {
      break;
    }

    const lastDocument = res.documents[res.documents.length - 1];
    cursorAfter = lastDocument?.$id || null;
    if (!cursorAfter) {
      break;
    }
  }

  return documents;
}

async function ensureSeedData() {
  const organizationId = getTenantOrganizationId();
  const users = await listAll<UserDoc>(USERS_COLLECTION_ID, [
    Query.equal("organization_id", organizationId),
    Query.limit(1),
  ]);
  if (users.length > 0) return;

  const createdAt = nowIso();

  const adminPayload = {
    id: ID.unique(),
    organization_id: organizationId,
    email: "admin@foodplug.com",
    role: "admin" as const,
    display_name: "FoodPlug Admin",
    contact: "",
    created_at: createdAt,
  };

  const salesPayload = {
    id: ID.unique(),
    organization_id: organizationId,
    email: "sales@foodplug.com",
    role: "sales" as const,
    display_name: "Sales Team",
    contact: "",
    created_at: createdAt,
  };

  await db.createDocument(DATABASE_ID as string, USERS_COLLECTION_ID, ID.unique(), adminPayload);
  await db.createDocument(DATABASE_ID as string, USERS_COLLECTION_ID, ID.unique(), salesPayload);

  const sampleCustomers = [
    { name: "Amaka Okoro", contractor: "Nile Constructions", pin: "7341" },
    { name: "Emeka Chukwu", contractor: "Skyline Builders", pin: "5082" },
    { name: "Ngozi Umeh", contractor: "Stonebridge Group", pin: "6309" },
  ];

  for (const c of sampleCustomers) {
    await db.createDocument(DATABASE_ID as string, CUSTOMERS_COLLECTION_ID, ID.unique(), {
      id: ID.unique(),
      organization_id: organizationId,
      name: c.name,
      contractor: c.contractor,
      pin: c.pin,
      created_at: createdAt,
    });
  }
}

function buildUserLookupQueries(email: string) {
  const queries = [Query.equal("email", email), Query.limit(1)];
  const organizationId = (getUser()?.organization_id || ORGANIZATION_ID || "").trim();
  if (organizationId) {
    queries.unshift(Query.equal("organization_id", organizationId));
  }
  return queries;
}

async function ensureUniquePin() {
  const organizationId = getTenantOrganizationId();
  for (let i = 0; i < 20; i++) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.equal("pin", pin),
      Query.limit(1),
    ]);
    if (existing.length === 0) return pin;
  }
  throw createApiError("Could not generate a unique PIN, please try again", 500);
}

function parseCustomerId(path: string) {
  const historyMatch = path.match(/^\/customers\/([^/]+)\/history$/);
  if (historyMatch) return { type: "history" as const, id: historyMatch[1] };

  const singleMatch = path.match(/^\/customers\/([^/]+)$/);
  if (singleMatch) return { type: "single" as const, id: singleMatch[1] };

  return null;
}

function parseAgentId(path: string) {
  const match = path.match(/^\/agents\/([^/]+)$/);
  return match ? match[1] : null;
}

function normalizeDetail(error: unknown) {
  const projectIdNotFound = "Project with the requested ID could not be found";
  const missingCollectionMatch = "Collection with the requested ID";
  const unauthorizedMatch = "The current user is not authorized to perform the requested action";
  const duplicateValueMatch = "duplicate value";

  const normalizeAppwriteDetail = (detail: string) => {
    if (detail.includes(projectIdNotFound)) {
      return "Appwrite project is misconfigured. Update VITE_APPWRITE_PROJECT_ID in frontend/.env with your real Appwrite Project ID, then restart the frontend server.";
    }

    if (detail.includes(missingCollectionMatch)) {
      const matchedId = detail.match(/Collection with the requested ID '([^']+)' could not be found/);
      const collectionId = matchedId?.[1];
      const envById: Record<string, string> = {
        [ORGANIZATIONS_COLLECTION_ID]: "VITE_APPWRITE_ORGANIZATIONS_COLLECTION_ID",
        [USERS_COLLECTION_ID]: "VITE_APPWRITE_USERS_COLLECTION_ID",
        [CUSTOMERS_COLLECTION_ID]: "VITE_APPWRITE_CUSTOMERS_COLLECTION_ID",
        [SALES_COLLECTION_ID]: "VITE_APPWRITE_SALES_COLLECTION_ID",
        [BRANCHES_COLLECTION_ID]: "VITE_APPWRITE_BRANCHES_COLLECTION_ID",
      };
      const envName = collectionId ? envById[collectionId] : undefined;
      if (envName && collectionId) {
        return `Missing Appwrite collection '${collectionId}'. Create it in database ${DATABASE_ID} or set ${envName} in frontend/.env to an existing collection ID, then restart the frontend server.`;
      }
      if (collectionId) {
        return `Missing Appwrite collection '${collectionId}'. Create it in database ${DATABASE_ID} or update the corresponding collection ID env var in frontend/.env, then restart the frontend server.`;
      }
      return "An Appwrite collection is missing. Verify collection IDs in frontend/.env and restart the frontend server.";
    }

    if (detail.includes(unauthorizedMatch)) {
      return "Appwrite permissions blocked this action. Ensure the logged-in user has access to this collection and a valid Appwrite session.";
    }

    if (detail.toLowerCase().includes(duplicateValueMatch)) {
      if (detail.toLowerCase().includes("company_code")) {
        return "Company code is already in use";
      }
      if (detail.toLowerCase().includes("email")) {
        return "Admin email is already in use";
      }
      return "A unique field value already exists";
    }

    return detail;
  };

  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) {
      return normalizeAppwriteDetail(response.data.detail);
    }
  }

  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message) {
      return normalizeAppwriteDetail(message);
    }
  }

  return "Request failed";
}

async function handleGet(path: string, options?: GetOptions) {
  if (path === "/health") {
    // Appwrite-native mode has no custom backend health endpoint.
    return {
      status: "ok",
      server_time: nowIso(),
      server_time_ms: Date.now(),
      max_clock_skew_ms: 5 * 60 * 1000,
      source: "appwrite-native",
    };
  }

  const organizationId = getTenantOrganizationId();

  if (path === "/") {
    return { service: "FoodPlug API", status: "ok" };
  }

  if (path === "/auth/me") {
    const user = getCurrentUserOrThrow();
    return user;
  }

  if (path === "/customers") {
    const customers = await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.orderDesc("created_at"),
    ]);
    return customers;
  }

  if (path === "/branches") {
    const branches = await listAll<BranchDoc>(BRANCHES_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.orderDesc("created_at"),
    ]);
    return branches;
  }

  const customerPath = parseCustomerId(path);
  if (customerPath?.type === "history") {
    const customer = (
      await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [
        Query.equal("organization_id", organizationId),
        Query.equal("id", customerPath.id),
        Query.limit(1),
      ])
    )[0];
    if (!customer) throw createApiError("Customer not found", 404);

    const sales = await listAll<SaleDoc>(SALES_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.equal("customer_id", customerPath.id),
      Query.orderDesc("created_at"),
    ]);

    return {
      customer,
      sales,
      total_meals: sales.length,
      total_cost: sales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
    };
  }

  if (path === "/sales") {
    const params = options?.params || {};
    const hasExplicitLimit =
      params.limit !== undefined &&
      params.limit !== null &&
      String(params.limit).trim() !== "";
    const limit = hasExplicitLimit ? Number(params.limit) : null;
    const customerId = (params.customer_id as string | undefined) || "";
    const agentId = (params.agent_id as string | undefined) || "";
    const location = (params.location as string | undefined) || "";
    const start = (params.start as string | undefined) || "";
    const end = (params.end as string | undefined) || "";

    const sales = await listAll<SaleDoc>(SALES_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.orderDesc("created_at"),
    ]);
    const [customers, agents] = location
      ? await Promise.all([
          listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [Query.equal("organization_id", organizationId)]),
          listAll<UserDoc>(USERS_COLLECTION_ID, [Query.equal("organization_id", organizationId)]),
        ])
      : [[], []];
    const customerLocationById = new Map(customers.map((customer) => [customer.id, String(customer.location || "")]));
    const agentLocationById = new Map(agents.map((agent) => [agent.id, String(agent.location || "")]));
    const filteredSales = sales
      .filter((sale) => {
        if (customerId && sale.customer_id !== customerId) return false;
        if (agentId && sale.agent_id !== agentId) return false;
        if (location) {
          const resolvedLocation = String(
            sale.location
            || (sale.type === "customer" ? customerLocationById.get(String(sale.customer_id || "")) : agentLocationById.get(String(sale.agent_id || "")))
            || "",
          );
          if (resolvedLocation !== location) return false;
        }
        if (start && sale.created_at < start) return false;
        if (end && sale.created_at >= end) return false;
        return true;
      });

    if (!hasExplicitLimit || !Number.isFinite(limit) || Number(limit) <= 0) {
      return filteredSales;
    }

    return filteredSales.slice(0, Number(limit));
  }

  if (path === "/payment-history") {
    const params = options?.params || {};
    const hasExplicitLimit =
      params.limit !== undefined &&
      params.limit !== null &&
      String(params.limit).trim() !== "";
    const limit = hasExplicitLimit ? Number(params.limit) : null;
    const customerId = (params.customer_id as string | undefined) || "";
    const location = (params.location as string | undefined) || "";

    const queries = [
      Query.equal("organization_id", organizationId),
      Query.orderDesc("created_at"),
    ];

    if (hasExplicitLimit && Number.isFinite(limit) && Number(limit) > 0) {
      queries.push(Query.limit(Number(limit)));
    }

    if (customerId) {
      queries.splice(1, 0, Query.equal("customer_id", customerId));
    }

    const payments = await listAll<Record<string, unknown>>(PAYMENT_HISTORY_COLLECTION_ID, queries);
    if (!location) {
      return payments;
    }

    const customers = await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [Query.equal("organization_id", organizationId)]);
    const customerLocationById = new Map(customers.map((customer) => [customer.id, String(customer.location || "")]));
    return payments.filter((payment) => customerLocationById.get(String(payment.customer_id || "")) === location);
  }

  if (path === "/agents") {
    const user = getCurrentUserOrThrow();
    requireAdmin(user);

    const agents = await listAll<UserDoc>(USERS_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.equal("role", "sales"),
      Query.orderDesc("created_at"),
    ]);
    return agents.map(toSessionUser);
  }

  if (path === "/stats") {
    const params = options?.params || {};
    const period = ((params.period as string) || "day") as "day" | "yesterday" | "month" | "all";
    const month = (params.month as string | undefined) || undefined;
    const location = (params.location as string | undefined) || "";

    const sales = await listAll<SaleDoc>(SALES_COLLECTION_ID, [Query.equal("organization_id", organizationId)]);
    const customers = await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [Query.equal("organization_id", organizationId)]);
    const agents = await listAll<UserDoc>(USERS_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.equal("role", "sales"),
    ]);

    let start: string | null = null;
    let end: string | null = null;
    const now = new Date();

    if (period === "day") {
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      start = dayStart.toISOString();
      end = dayEnd.toISOString();
    } else if (period === "yesterday") {
      const yesterdayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() + 1);
      start = yesterdayStart.toISOString();
      end = yesterdayEnd.toISOString();
    } else if (period === "month") {
      const [y, m] = (month || "").split("-");
      if (!y || !m) {
        throw createApiError("Invalid month format, use YYYY-MM", 400);
      }
      const monthStart = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
      const monthEnd = new Date(Date.UTC(Number(y), Number(m), 1));
      start = monthStart.toISOString();
      end = monthEnd.toISOString();
    }

    const customerLocationById = new Map(customers.map((customer) => [customer.id, String(customer.location || "")]));
    const agentLocationById = new Map(agents.map((agent) => [agent.id, String(agent.location || "")]));

    const locationScopedSales = sales.filter((sale) => {
      if (!location) return true;
      const resolvedLocation = String(
        sale.location
        || (sale.type === "customer" ? customerLocationById.get(String(sale.customer_id || "")) : agentLocationById.get(String(sale.agent_id || "")))
        || "",
      );
      return resolvedLocation === location;
    });

    const scopedSales = locationScopedSales.filter((sale) => {
      if (start && sale.created_at < start) return false;
      if (end && sale.created_at >= end) return false;
      return true;
    });

    const totalRevenue = scopedSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0);
    const visitorSales = scopedSales.filter((sale) => sale.type === "visitor");
    const customerSales = scopedSales.filter((sale) => sale.type === "customer");
    const customersServed = new Set(customerSales.map((s) => s.customer_id).filter(Boolean)).size;
    const visitorIdentitySet = new Set(
      visitorSales
        .map((s) => `${String(s.customer_name || "").trim().toLowerCase()}|${String(s.contractor || "").trim().toLowerCase()}`)
        .filter((v) => v !== "|"),
    );
    const visitorsServed = visitorIdentitySet.size;

    const byDay: Record<string, { date: string; revenue: number; count: number }> = {};
    for (const sale of scopedSales) {
      const date = (sale.created_at || "").slice(0, 10);
      if (!date) continue;
      if (!byDay[date]) {
        byDay[date] = { date, revenue: 0, count: 0 };
      }
      byDay[date].revenue += Math.abs(Number(sale.amount || 0));
      byDay[date].count += 1;
    }

    const byCustomer: Record<string, { customer_id: string; customer_name: string; contractor: string; meals: number; revenue: number }> = {};
    for (const sale of customerSales) {
      if (!sale.customer_id) continue;
      if (!byCustomer[sale.customer_id]) {
        byCustomer[sale.customer_id] = {
          customer_id: sale.customer_id,
          customer_name: sale.customer_name,
          contractor: sale.contractor,
          meals: 0,
          revenue: 0,
        };
      }
      byCustomer[sale.customer_id].meals += 1;
      byCustomer[sale.customer_id].revenue += Math.abs(Number(sale.amount || 0));
    }

    const filteredCustomers = location ? customers.filter((customer) => String(customer.location || "") === location) : customers;
    const filteredAgents = location ? agents.filter((agent) => String(agent.location || "") === location) : agents;

    return {
      period,
      month,
      location,
      range: { start, end },
      total_revenue: totalRevenue,
      total_sales: scopedSales.length,
      customer_revenue: customerSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
      visitor_revenue: visitorSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
      customer_sales_count: customerSales.length,
      visitor_sales_count: visitorSales.length,
      total_customers: filteredCustomers.length,
      total_visitors: visitorsServed,
      total_agents: filteredAgents.length,
      unique_customers_served: customersServed,
      customers_served: customersServed,
      visitors_served: visitorsServed,
      chart: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      top_customers: Object.values(byCustomer)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    };
  }

  throw createApiError(`Unknown GET endpoint: ${path}`, 404);
}

async function handlePost(path: string, body?: Record<string, unknown>) {
  if (path === "/organizations/register") {
    const organizationName = String(body?.organization_name || "").trim();
    const companyCode = String(body?.company_code || "").trim().toUpperCase();
    const address = String(body?.address || "").trim();
    const phone = String(body?.phone || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const subscription = (String(body?.subscription || "trial").trim() || "trial") as "trial" | "basic" | "premium" | "enterprise";
    const adminDisplayName = String(body?.admin_display_name || "").trim();
    const adminEmail = String(body?.admin_email || "").trim().toLowerCase();
    const adminPassword = String(body?.admin_password || "");

    if (!organizationName || !companyCode || !adminDisplayName || !adminEmail || adminPassword.length < 6) {
      throw createApiError("Organization name, company code, admin name, admin email and admin password (min 6 chars) are required", 400);
    }

    if (!/^[A-Z0-9_-]{3,20}$/.test(companyCode)) {
      throw createApiError("Company code must be 3-20 chars using letters, numbers, underscore or hyphen", 400);
    }

    const orgId = ID.unique();
    const adminUserId = ID.unique();
    const ts = nowIso();

    const organizationDoc = await db.createDocument(DATABASE_ID as string, ORGANIZATIONS_COLLECTION_ID, ID.unique(), {
      id: orgId,
      organization_name: organizationName,
      company_code: companyCode,
      address,
      phone,
      email,
      subscription,
      status: "active",
      max_users: 50,
      admin_user_id: adminUserId,
      created_by: adminUserId,
      created_at: ts,
      updated_at: ts,
      expires_at: "",
    });

    try {
      await account.create(adminUserId, adminEmail, adminPassword, adminDisplayName);

      await db.createDocument(DATABASE_ID as string, USERS_COLLECTION_ID, ID.unique(), {
        id: adminUserId,
        organization_id: orgId,
        email: adminEmail,
        role: "admin",
        display_name: adminDisplayName,
        contact: phone,
        created_at: ts,
      });
    } catch (error) {
      // Best-effort rollback to avoid dangling organizations when user creation fails.
      try {
        await db.deleteDocument(DATABASE_ID as string, ORGANIZATIONS_COLLECTION_ID, organizationDoc.$id);
      } catch {
        // Ignore rollback failure and return original error.
      }
      throw error;
    }

    return {
      organization_id: orgId,
      company_code: companyCode,
      admin_email: adminEmail,
      message: "Organization registered successfully",
    };
  }

  if (path === "/auth/login") {
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      throw createApiError("Email and password are required", 400);
    }

    await ensureFreshAppwriteSession(email, password);

    const users = await listAll<UserDoc>(USERS_COLLECTION_ID, buildUserLookupQueries(email));
    const user = users[0];

    if (!user) {
      try {
        await account.deleteSession("current");
      } catch {
        // Ignore session cleanup error and return the profile error.
      }
      throw createApiError("Invalid email or password", 401);
    }

    let organizationName = "";
    if (user.organization_id) {
      const orgs = await listAll<OrganizationDoc>(ORGANIZATIONS_COLLECTION_ID, [
        Query.equal("id", user.organization_id),
        Query.limit(1),
      ]);
      organizationName = String(orgs[0]?.organization_name || "");
    }

    return {
      token: ID.unique(),
      user: {
        ...toSessionUser(user),
        organization_name: organizationName,
      },
    };
  }

  if (path === "/customers") {
    const actor = getCurrentUserOrThrow();
    const organizationId = getTenantOrganizationId();
    requireAdmin(actor);

    const name = String(body?.name || "").trim();
    const contractor = String(body?.contractor || "").trim();
    const location = String(body?.location || "").trim();
    if (!name || !contractor || !location) {
      throw createApiError("Name, contractor and branch are required", 400);
    }

    const pin = await ensureUniquePin();
    const payload = {
      id: ID.unique(),
      organization_id: organizationId,
      name,
      contractor,
      location,
      pin,
      created_at: nowIso(),
    };

    await db.createDocument(DATABASE_ID as string, CUSTOMERS_COLLECTION_ID, ID.unique(), payload);
    return payload;
  }

  if (path === "/agents") {
    const actor = getCurrentUserOrThrow();
    const organizationId = getTenantOrganizationId();
    requireAdmin(actor);

    const displayName = String(body?.display_name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const contact = String(body?.contact || "").trim();
    const location = String(body?.location || "").trim();
    const password = String(body?.password || "");

    if (!displayName || !email || !location || password.length < 6) {
      throw createApiError("Name, email, location and password (min 6 chars) are required", 400);
    }

    const existing = await listAll<UserDoc>(USERS_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.equal("email", email),
      Query.limit(1),
    ]);
    if (existing.length > 0) {
      throw createApiError("Email already registered", 400);
    }

    const payload = {
      id: ID.unique(),
      organization_id: organizationId,
      email,
      role: "sales" as const,
      display_name: displayName,
      contact,
      location,
      created_at: nowIso(),
    };

    await account.create(payload.id, payload.email, password, payload.display_name);

    await db.createDocument(DATABASE_ID as string, USERS_COLLECTION_ID, ID.unique(), payload);
    return {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      display_name: payload.display_name,
      contact: payload.contact,
      location: payload.location,
    };
  }

  if (path === "/branches") {
    const actor = getCurrentUserOrThrow();
    const organizationId = getTenantOrganizationId();
    requireAdmin(actor);

    const branchName = String(body?.branch_name || "").trim();
    const subBranchName = String(body?.sub_branch_name || "").trim();

    if (!branchName || !subBranchName) {
      throw createApiError("Branch name and sub branch name are required", 400);
    }

    const payload = {
      id: ID.unique(),
      organization_id: organizationId,
      branch_name: branchName,
      sub_branch_name: subBranchName,
      created_at: nowIso(),
    };

    await db.createDocument(DATABASE_ID as string, BRANCHES_COLLECTION_ID, ID.unique(), payload);
    return payload;
  }

  if (path === "/sales") {
    const actor = getCurrentUserOrThrow();
    const organizationId = getTenantOrganizationId();
    let saleType: "customer" | "visitor";
    const amount = Number(body?.amount || 0);

    if (amount < 100 || amount > 20_000) {
      throw createApiError("Amount must be between ₦100 and ₦20,000", 400);
    }

    let customerId: string | null = null;
    let customerName = "";
    let contractor = "";

    if (body?.type === "customer") {
      saleType = "customer";
      const requestedCustomerId = String(body?.customer_id || "");
      const customer = (
        await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [
          Query.equal("organization_id", organizationId),
          Query.equal("id", requestedCustomerId),
          Query.limit(1),
        ])
      )[0];

      if (!customer) {
        throw createApiError("Customer not found", 404);
      }

      customerId = customer.id;
      customerName = customer.name;
      contractor = customer.contractor;
    } else if (body?.type === "visitor") {
      saleType = "visitor";
      customerName = String(body?.customer_name || "").trim();
      contractor = String(body?.contractor || "").trim();
      if (!customerName || !contractor) {
        throw createApiError("Visitor name and contractor required", 400);
      }
    } else {
      throw createApiError("Invalid sale type", 400);
    }

    const payload: SaleData = {
      id: ID.unique(),
      organization_id: organizationId,
      type: saleType,
      customer_id: customerId,
      customer_name: customerName,
      contractor,
      food_type: String(body?.food_type || "").trim() || (saleType === "visitor" ? "visitor" : ""),
      amount,
      agent_id: actor.id,
      agent_name: actor.display_name,
      created_at: nowIso(),
    };

    if (!payload.food_type) {
      throw createApiError("food_type is required", 400);
    }

    await db.createDocument(DATABASE_ID as string, SALES_COLLECTION_ID, ID.unique(), {
      id: payload.id,
      organization_id: payload.organization_id,
      type: payload.type,
      customer_id: payload.customer_id,
      customer_name: payload.customer_name,
      contractor: payload.contractor,
      food_type: payload.food_type,
      amount: payload.amount,
      agent_id: payload.agent_id,
      agent_name: payload.agent_name,
      created_at: payload.created_at,
    });

    return payload;
  }

  throw createApiError(`Unknown POST endpoint: ${path}`, 404);
}

async function handleDelete(path: string) {
  const organizationId = getTenantOrganizationId();
  const customerPath = parseCustomerId(path);
  if (customerPath?.type === "single") {
    const actor = getCurrentUserOrThrow();
    requireAdmin(actor);

    const customers = await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.equal("id", customerPath.id),
      Query.limit(1),
    ]);
    const customer = customers[0];
    if (!customer) throw createApiError("Customer not found", 404);

    await db.deleteDocument(DATABASE_ID as string, CUSTOMERS_COLLECTION_ID, customer.$id);

    const linkedSales = await listAll<SaleDoc>(SALES_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.equal("customer_id", customerPath.id),
    ]);
    for (const sale of linkedSales) {
      await db.deleteDocument(DATABASE_ID as string, SALES_COLLECTION_ID, sale.$id);
    }

    return { ok: true };
  }

  const agentId = parseAgentId(path);
  if (agentId) {
    const actor = getCurrentUserOrThrow();
    requireAdmin(actor);

    const agents = await listAll<UserDoc>(USERS_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.equal("id", agentId),
      Query.equal("role", "sales"),
      Query.limit(1),
    ]);
    const agent = agents[0];
    if (!agent) throw createApiError("Sales rep not found", 404);

    await db.deleteDocument(DATABASE_ID as string, USERS_COLLECTION_ID, agent.$id);
    return { ok: true };
  }

  throw createApiError(`Unknown DELETE endpoint: ${path}`, 404);
}

export const api = {
  async get<T = unknown>(path: string, options?: GetOptions): Promise<{ data: T }> {
    try {
      if (hasAuthApi()) {
        if (path === "/health") {
          const data = await getAuthApi<T>("/health", options);
          return { data };
        }
        if (path === "/customers") {
          const data = await getAuthApi<T>("/api/customers", options);
          return { data };
        }
        const customerHistory = path.match(/^\/customers\/([^/]+)\/history$/);
        if (customerHistory) {
          const data = await getAuthApi<T>(`/api/customers/${customerHistory[1]}/history`, options);
          return { data };
        }
        if (path === "/agents") {
          const data = await getAuthApi<T>("/api/agents", options);
          return { data };
        }
        if (path === "/sales") {
          const data = await getAuthApi<T>("/api/sales", options);
          return { data };
        }
        if (path === "/stats") {
          const data = await getAuthApi<T>("/api/stats", options);
          return { data };
        }
        if (path === "/payment-history") {
          const data = await getAuthApi<T>("/api/payment-history", options);
          return { data };
        }
      }

      if (path === "/health") {
        assertAppwriteBaseConfig();
        const data = await handleGet(path, options);
        return { data: data as T };
      }

      assertTenantConfig();
      const data = await handleGet(path, options);
      return { data: data as T };
    } catch (error) {
      throw createApiError(normalizeDetail(error), 400);
    }
  },

  async post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<{ data: T }> {
    try {
      if (hasAuthApi() && (path === "/organizations/register" || path === "/auth/login")) {
        const authPath = path === "/organizations/register" ? "/api/auth/register-organization" : "/api/auth/login";
        try {
          const data = await postAuthApi<T>(authPath, body);

          // When login is handled by backend, establish a browser Appwrite session
          // so subsequent frontend Appwrite DB calls are authorized.
          if (path === "/auth/login") {
            const email = String(body?.email || "").trim().toLowerCase();
            const password = String(body?.password || "");
            if (email && password) {
              await ensureFreshAppwriteSession(email, password);
            }
          }

          return { data };
        } catch (authApiError) {
          // If backend is unreachable, fall back to direct Appwrite path.
          if (!isNetworkFetchError(authApiError)) {
            throw authApiError;
          }
        }
      }

      if (hasAuthApi() && (path === "/customers" || path === "/agents")) {
        const authPath = path === "/customers" ? "/api/customers" : "/api/agents";
        const data = await postAuthApi<T>(authPath, body);
        return { data };
      }

      if (hasAuthApi() && path === "/sales") {
        const data = await postAuthApi<T>("/api/sales", body);
        return { data };
      }

      if (path === "/organizations/register" || path === "/auth/login") {
        assertAppwriteBaseConfig();
      } else {
        assertTenantConfig();
      }
      const data = await handlePost(path, body);
      return { data: data as T };
    } catch (error) {
      throw createApiError(normalizeDetail(error), 400);
    }
  },

  async delete<T = unknown>(path: string): Promise<{ data: T }> {
    try {
      if (hasAuthApi()) {
        const customerMatch = path.match(/^\/customers\/([^/]+)$/);
        if (customerMatch) {
          const data = await deleteAuthApi<T>(`/api/customers/${customerMatch[1]}`);
          return { data };
        }

        const agentMatch = path.match(/^\/agents\/([^/]+)$/);
        if (agentMatch) {
          const data = await deleteAuthApi<T>(`/api/agents/${agentMatch[1]}`);
          return { data };
        }
      }

      assertTenantConfig();
      const data = await handleDelete(path);
      return { data: data as T };
    } catch (error) {
      throw createApiError(normalizeDetail(error), 400);
    }
  },

  async patch<T = unknown>(path: string, body?: Record<string, unknown>): Promise<{ data: T }> {
    try {
      const creditMatch = path.match(/^\/customers\/([^/]+)\/credit$/);
      if (creditMatch) {
        const customerId = creditMatch[1];

        if (hasAuthApi()) {
          const data = await patchAuthApi<T>(`/api/customers/${customerId}/credit`, body);
          return { data };
        }

        // Direct Appwrite path
        const organizationId = getTenantOrganizationId();
        const actor = getCurrentUserOrThrow();
        requireAdmin(actor);

        const customers = await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [
          Query.equal("organization_id", organizationId),
          Query.equal("id", customerId),
          Query.limit(1),
        ]);
        const customer = customers[0];
        if (!customer) throw createApiError("Customer not found", 404);

        const amount = Number(body?.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw createApiError("amount must be a positive number", 400);
        }

        const customerSales = await listAll<SaleDoc>(SALES_COLLECTION_ID, [
          Query.equal("organization_id", organizationId),
          Query.equal("customer_id", customerId),
        ]);
        const totalOwed = customerSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0);
        const alreadyCredited = Number(customer.balance_credited || 0);
        const outstanding = Math.max(0, totalOwed - alreadyCredited);

        if (outstanding <= 0) {
          throw createApiError("This customer has no outstanding balance", 400);
        }

        if (amount > outstanding) {
          throw createApiError(
            `Amount exceeds outstanding balance. Remaining balance is ${formatNaira(outstanding)}`,
            400,
          );
        }

        const newCredited = alreadyCredited + amount;
        await db.updateDocument(DATABASE_ID as string, CUSTOMERS_COLLECTION_ID, customer.$id, {
          balance_credited: newCredited,
        });
        await db.createDocument(DATABASE_ID as string, PAYMENT_HISTORY_COLLECTION_ID, ID.unique(), {
          organization_id: organizationId,
          customer_id: customerId,
          customer_name: customer.name,
          contractor: customer.contractor,
          amount,
          initiated_by: actor.id,
          initiated_by_name: actor.display_name,
          created_at: nowIso(),
        });
        return { data: { ok: true, balance_credited: newCredited } as T };
      }

      throw createApiError(`Unknown PATCH endpoint: ${path}`, 404);
    } catch (error) {
      throw createApiError(normalizeDetail(error), 400);
    }
  },
};

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  account.deleteSession("current").catch(() => {
    // Ignore session cleanup failures during local sign-out.
  });
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function formatNaira(amount: number | string | null | undefined) {
  const n = Number(amount || 0);
  const isNegative = n < 0;
  const absValue = Math.abs(n);
  const formatted = absValue.toLocaleString("en-NG", { maximumFractionDigits: 0 });
  return isNegative ? `−₦${formatted}` : `₦${formatted}`;
}
