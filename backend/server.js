const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const crypto = require("crypto");

const express = require("express");
const cors = require("cors");
const { Client, Databases, ID, Query, Users } = require("node-appwrite");

const app = express();
app.use(express.json({ limit: "100kb" }));

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-XSS-Protection", "0");
  next();
});

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT;
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const APPWRITE_ORGANIZATIONS_COLLECTION_ID = process.env.APPWRITE_ORGANIZATIONS_COLLECTION_ID || "organizations";
const APPWRITE_USERS_COLLECTION_ID = process.env.APPWRITE_USERS_COLLECTION_ID || "users";
const APPWRITE_CUSTOMERS_COLLECTION_ID = process.env.APPWRITE_CUSTOMERS_COLLECTION_ID || "customers";
const APPWRITE_SALES_COLLECTION_ID = process.env.APPWRITE_SALES_COLLECTION_ID || "sales";
const APPWRITE_PAYMENT_HISTORY_COLLECTION_ID = process.env.APPWRITE_PAYMENT_HISTORY_COLLECTION_ID || "payment_history";
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || APPWRITE_API_KEY || "dev-secret";
const AUTH_TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 8);
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const COMPANY_CODE_REGEX = /^[A-Z0-9_-]{3,20}$/;

function fail(res, status, detail) {
  return res.status(status).json({ detail });
}

function createRateLimiter({ windowMs, maxRequests }) {
  const store = new Map();
  return (req, res, next) => {
    const key = `${req.ip || "unknown"}:${req.path}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      store.set(key, { windowStart: now, count: 1 });
      return next();
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      return fail(res, 429, "Too many requests. Please try again shortly.");
    }

    return next();
  };
}

const authRateLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, maxRequests: 25 });
const signupRateLimit = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 20 });
const writeRateLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, maxRequests: 300 });

function nowIso() {
  return new Date().toISOString();
}

async function listAll(collectionId, queries = []) {
  const res = await db.listDocuments(APPWRITE_DATABASE_ID, collectionId, [Query.limit(5000), ...queries]);
  return res.documents;
}

function b64urlEncodeUtf8(input) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function b64urlDecodeUtf8(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signTokenPayload(payloadEncoded) {
  return crypto.createHmac("sha256", AUTH_TOKEN_SECRET).update(payloadEncoded).digest("base64url");
}

function createAuthToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...claims,
    iat: now,
    exp: now + AUTH_TOKEN_TTL_SECONDS,
  };
  const payloadEncoded = b64urlEncodeUtf8(JSON.stringify(payload));
  const signature = signTokenPayload(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== "string") return null;
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return null;

  const expected = signTokenPayload(payloadEncoded);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(b64urlDecodeUtf8(payloadEncoded));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.exp || now >= Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== "string") return "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function getActor(req) {
  const token = getBearerToken(req);
  const payload = verifyAuthToken(token);
  if (!payload || typeof payload !== "object") return null;
  return {
    id: String(payload.id || ""),
    organization_id: String(payload.organization_id || ""),
    role: String(payload.role || ""),
    display_name: String(payload.display_name || ""),
    email: String(payload.email || ""),
  };
}

function requireAdminActor(req, res) {
  const actor = getActor(req);
  if (!actor || !actor.id || !actor.organization_id) {
    fail(res, 401, "Not authenticated");
    return null;
  }
  if (actor.role !== "admin") {
    fail(res, 403, "Admin privileges required");
    return null;
  }
  return actor;
}

function requireActor(req, res) {
  const actor = getActor(req);
  if (!actor || !actor.id || !actor.organization_id) {
    fail(res, 401, "Not authenticated");
    return null;
  }
  return actor;
}

async function ensureUniquePin(organizationId) {
  for (let i = 0; i < 20; i++) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await listAll(APPWRITE_CUSTOMERS_COLLECTION_ID, [
      Query.equal("organization_id", organizationId),
      Query.equal("pin", pin),
      Query.limit(1),
    ]);
    if (existing.length === 0) return pin;
  }
  throw new Error("Could not generate a unique PIN, please try again");
}

function mapAppwriteError(error) {
  const message = String(error && error.message ? error.message : "Request failed");
  const normalized = message.toLowerCase();

  if (normalized.includes("duplicate value") && normalized.includes("company_code")) {
    return { status: 400, detail: "Company code is already in use" };
  }
  if (normalized.includes("duplicate value") && normalized.includes("email")) {
    return { status: 400, detail: "Admin email is already in use" };
  }

  return { status: 400, detail: message };
}

function assertConfig() {
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY || !APPWRITE_DATABASE_ID) {
    throw new Error(
      "Backend auth config missing. Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, and APPWRITE_DATABASE_ID.",
    );
  }

  if (process.env.NODE_ENV === "production" && !process.env.AUTH_TOKEN_SECRET) {
    throw new Error("Production requires AUTH_TOKEN_SECRET for secure token signing.");
  }
}

let db;
let users;
try {
  assertConfig();
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);
  db = new Databases(client);
  users = new Users(client);
} catch (error) {
  console.error("[auth-backend] startup error:", error.message);
}

async function validateEmailPasswordSession(email, password) {
  const response = await fetch(`${APPWRITE_ENDPOINT}/account/sessions/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": APPWRITE_PROJECT_ID,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.message || "Invalid email or password";
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function ensureSalesSchema() {
  if (!db) return;

  try {
    const attributes = await db.listAttributes(APPWRITE_DATABASE_ID, APPWRITE_SALES_COLLECTION_ID);
    const hasFoodType = Array.isArray(attributes?.attributes)
      && attributes.attributes.some((attribute) => attribute && attribute.key === 'food_type');

    if (hasFoodType) return;

    console.log('[auth-backend] creating missing sales.food_type attribute');
    await db.createEnumAttribute({
      databaseId: APPWRITE_DATABASE_ID,
      collectionId: APPWRITE_SALES_COLLECTION_ID,
      key: 'food_type',
      elements: ['soft', 'hard', 'visitor'],
      required: true,
    });
  } catch (error) {
    console.warn('[auth-backend] sales schema check skipped:', error.message);
  }
}

app.get("/health", (_req, res) => {
  const clockPayload = {
    server_time: nowIso(),
    server_time_ms: Date.now(),
    max_clock_skew_ms: MAX_CLOCK_SKEW_MS,
  };

  if (!db) {
    return res.status(500).json({
      status: "error",
      detail: "Auth backend misconfigured",
      ...clockPayload,
    });
  }
  return res.json({ status: "ok", ...clockPayload });
});

app.post("/api/auth/register-organization", signupRateLimit, async (req, res) => {
  if (!db || !users) return fail(res, 500, "Auth backend misconfigured");

  const organizationName = String(req.body?.organization_name || "").trim();
  const companyCode = String(req.body?.company_code || "").trim().toUpperCase();
  const address = String(req.body?.address || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const subscription = String(req.body?.subscription || "trial").trim() || "trial";
  const adminDisplayName = String(req.body?.admin_display_name || "").trim();
  const adminEmail = String(req.body?.admin_email || "").trim().toLowerCase();
  const adminPassword = String(req.body?.admin_password || "");

  if (!organizationName || !companyCode || !adminDisplayName || !adminEmail || adminPassword.length < 6) {
    return fail(
      res,
      400,
      "Organization name, company code, admin name, admin email and admin password (min 6 chars) are required",
    );
  }

  if (!COMPANY_CODE_REGEX.test(companyCode)) {
    return fail(res, 400, "Company code must be 3-20 chars using letters, numbers, underscore or hyphen");
  }

  const orgId = ID.unique();
  const adminUserId = ID.unique();
  const ts = nowIso();

  let organizationDoc;
  try {
    organizationDoc = await db.createDocument(APPWRITE_DATABASE_ID, APPWRITE_ORGANIZATIONS_COLLECTION_ID, ID.unique(), {
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

    await users.create(adminUserId, adminEmail, undefined, adminPassword, adminDisplayName);

    await db.createDocument(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, ID.unique(), {
      id: adminUserId,
      organization_id: orgId,
      email: adminEmail,
      role: "admin",
      display_name: adminDisplayName,
      contact: phone,
      created_at: ts,
    });

    return res.json({
      organization_id: orgId,
      company_code: companyCode,
      admin_email: adminEmail,
      message: "Organization registered successfully",
    });
  } catch (error) {
    if (users) {
      try {
        await users.delete(adminUserId);
      } catch (_userRollbackError) {
        // Ignore rollback issues and return original failure.
      }
    }
    if (organizationDoc && organizationDoc.$id) {
      try {
        await db.deleteDocument(APPWRITE_DATABASE_ID, APPWRITE_ORGANIZATIONS_COLLECTION_ID, organizationDoc.$id);
      } catch (_rollbackError) {
        // Ignore rollback issues and return original failure.
      }
    }
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.post("/api/auth/login", authRateLimit, async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return fail(res, 400, "Email and password are required");
  }

  try {
    await validateEmailPasswordSession(email, password);

    const usersRes = await db.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, [
      Query.equal("email", email),
      Query.limit(1),
    ]);

    const user = usersRes.documents[0];
    if (!user) {
      return fail(res, 401, "Invalid email or password");
    }

    let organizationName = "";
    if (user.organization_id) {
      const orgRes = await db.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_ORGANIZATIONS_COLLECTION_ID, [
        Query.equal("id", user.organization_id),
        Query.limit(1),
      ]);
      organizationName = String(orgRes.documents?.[0]?.organization_name || "");
    }

    return res.json({
      token: createAuthToken({
        id: user.id,
        organization_id: user.organization_id,
        organization_name: organizationName,
        email: user.email,
        role: user.role,
        display_name: user.display_name,
      }),
      user: {
        id: user.id,
        organization_id: user.organization_id,
        organization_name: organizationName,
        email: user.email,
        role: user.role,
        display_name: user.display_name,
        contact: user.contact || "",
      },
    });
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.post("/api/customers", writeRateLimit, async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireAdminActor(req, res);
  if (!actor) return;

  const name = String(req.body?.name || "").trim();
  const contractor = String(req.body?.contractor || "").trim();
  if (!name || !contractor) {
    return fail(res, 400, "Name and contractor are required");
  }

  try {
    const payload = {
      id: ID.unique(),
      organization_id: actor.organization_id,
      name,
      contractor,
      pin: await ensureUniquePin(actor.organization_id),
      created_at: nowIso(),
    };

    await db.createDocument(APPWRITE_DATABASE_ID, APPWRITE_CUSTOMERS_COLLECTION_ID, ID.unique(), payload);
    return res.json(payload);
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.get("/api/customers", async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireActor(req, res);
  if (!actor) return;

  try {
    const customers = await listAll(APPWRITE_CUSTOMERS_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.orderDesc("created_at"),
    ]);
    return res.json(customers);
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.get("/api/customers/:customerId/history", async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireActor(req, res);
  if (!actor) return;

  const customerId = String(req.params.customerId || "").trim();
  if (!customerId) return fail(res, 400, "customerId is required");

  try {
    const customers = await listAll(APPWRITE_CUSTOMERS_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.equal("id", customerId),
      Query.limit(1),
    ]);
    const customer = customers[0];
    if (!customer) return fail(res, 404, "Customer not found");

    const sales = await listAll(APPWRITE_SALES_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.equal("customer_id", customerId),
      Query.orderDesc("created_at"),
    ]);

    return res.json({
      customer,
      sales,
      total_meals: sales.length,
      total_cost: sales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
    });
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.delete("/api/customers/:customerId", writeRateLimit, async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireAdminActor(req, res);
  if (!actor) return;

  const customerId = String(req.params.customerId || "").trim();
  if (!customerId) return fail(res, 400, "customerId is required");

  try {
    const customers = await listAll(APPWRITE_CUSTOMERS_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.equal("id", customerId),
      Query.limit(1),
    ]);
    const customer = customers[0];
    if (!customer) return fail(res, 404, "Customer not found");

    await db.deleteDocument(APPWRITE_DATABASE_ID, APPWRITE_CUSTOMERS_COLLECTION_ID, customer.$id);

    const linkedSales = await listAll(APPWRITE_SALES_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.equal("customer_id", customerId),
    ]);
    for (const sale of linkedSales) {
      await db.deleteDocument(APPWRITE_DATABASE_ID, APPWRITE_SALES_COLLECTION_ID, sale.$id);
    }

    return res.json({ ok: true });
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.patch("/api/customers/:customerId/credit", writeRateLimit, async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireAdminActor(req, res);
  if (!actor) return;

  const customerId = String(req.params.customerId || "").trim();
  if (!customerId) return fail(res, 400, "customerId is required");

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail(res, 400, "amount must be a positive number");
  }

  try {
    const customers = await listAll(APPWRITE_CUSTOMERS_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.equal("id", customerId),
      Query.limit(1),
    ]);
    const customer = customers[0];
    if (!customer) return fail(res, 404, "Customer not found");

    const newCredited = Number(customer.balance_credited || 0) + amount;
    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_CUSTOMERS_COLLECTION_ID,
      customer.$id,
      { balance_credited: newCredited },
    );

    // Create payment history record
    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_PAYMENT_HISTORY_COLLECTION_ID,
      ID.unique(),
      {
        organization_id: actor.organization_id,
        customer_id: customerId,
        customer_name: customer.name,
        contractor: customer.contractor,
        amount: amount,
        initiated_by: actor.user_id || actor.id,
        initiated_by_name: actor.name || "Admin",
        created_at: new Date().toISOString(),
      },
    );

    return res.json({ ok: true, balance_credited: newCredited });
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.get("/api/payment-history", async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireAdminActor(req, res);
  if (!actor) return;

  try {
    const limit = Number(req.query.limit || 500);
    const customerId = String(req.query.customer_id || "");

    const queries = [
      Query.equal("organization_id", actor.organization_id),
      Query.orderDesc("created_at"),
      Query.limit(limit),
    ];

    if (customerId) {
      queries.splice(1, 0, Query.equal("customer_id", customerId));
    }

    const history = await listAll(APPWRITE_PAYMENT_HISTORY_COLLECTION_ID, queries);
    return res.json(history);
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.get("/api/agents", async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireAdminActor(req, res);
  if (!actor) return;

  try {
    const agents = await listAll(APPWRITE_USERS_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.equal("role", "sales"),
      Query.orderDesc("created_at"),
    ]);
    const normalized = agents.map((agent) => ({
      id: agent.id,
      organization_id: agent.organization_id,
      email: agent.email,
      role: agent.role,
      display_name: agent.display_name,
      contact: agent.contact || "",
    }));
    return res.json(normalized);
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.get("/api/sales", async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireActor(req, res);
  if (!actor) return;

  const limit = Number(req.query.limit || 500);
  const customerId = String(req.query.customer_id || "");
  const agentId = String(req.query.agent_id || "");
  const start = String(req.query.start || "");
  const end = String(req.query.end || "");

  try {
    const sales = await listAll(APPWRITE_SALES_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.orderDesc("created_at"),
    ]);

    const filtered = sales
      .filter((sale) => {
        if (customerId && sale.customer_id !== customerId) return false;
        if (agentId && sale.agent_id !== agentId) return false;
        if (start && sale.created_at < start) return false;
        if (end && sale.created_at > end) return false;
        return true;
      })
      .slice(0, limit);

    return res.json(filtered);
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.post("/api/sales", writeRateLimit, async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireActor(req, res);
  if (!actor) return;

  const amount = Number(req.body?.amount || 0);
  if (amount < 100 || amount > 10000) {
    return fail(res, 400, "Amount must be between ₦100 and ₦10,000");
  }

  try {
    let type;
    let customerId = null;
    let customerName = "";
    let contractor = "";
    const foodType = String(req.body?.food_type || "").trim();

    if (req.body?.type === "customer") {
      type = "customer";
      const requestedCustomerId = String(req.body?.customer_id || "");
      const customers = await listAll(APPWRITE_CUSTOMERS_COLLECTION_ID, [
        Query.equal("organization_id", actor.organization_id),
        Query.equal("id", requestedCustomerId),
        Query.limit(1),
      ]);
      const customer = customers[0];
      if (!customer) return fail(res, 404, "Customer not found");

      customerId = customer.id;
      customerName = customer.name;
      contractor = customer.contractor;
    } else if (req.body?.type === "visitor") {
      type = "visitor";
      customerName = String(req.body?.customer_name || "").trim();
      contractor = String(req.body?.contractor || "").trim();
      if (!customerName || !contractor) {
        return fail(res, 400, "Visitor name and contractor required");
      }
    } else {
      return fail(res, 400, "Invalid sale type");
    }

    const payload = {
      id: ID.unique(),
      organization_id: actor.organization_id,
      type,
      customer_id: customerId,
      customer_name: customerName,
      contractor,
      food_type: foodType || (type === "visitor" ? "visitor" : ""),
      amount: type === "customer" ? -Math.abs(amount) : Math.abs(amount),
      agent_id: actor.id,
      agent_name: actor.display_name,
      created_at: nowIso(),
    };

    if (!payload.food_type) {
      return fail(res, 400, "food_type is required");
    }

    await db.createDocument(APPWRITE_DATABASE_ID, APPWRITE_SALES_COLLECTION_ID, ID.unique(), payload);
    return res.json(payload);
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.get("/api/stats", async (req, res) => {
  if (!db) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireAdminActor(req, res);
  if (!actor) return;

  const period = String(req.query.period || "day");
  const month = String(req.query.month || "");

  try {
    const sales = await listAll(APPWRITE_SALES_COLLECTION_ID, [Query.equal("organization_id", actor.organization_id)]);
    const customers = await listAll(APPWRITE_CUSTOMERS_COLLECTION_ID, [Query.equal("organization_id", actor.organization_id)]);
    const agents = await listAll(APPWRITE_USERS_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.equal("role", "sales"),
    ]);

    let start = null;
    let end = null;
    const now = new Date();

    if (period === "day") {
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      start = dayStart.toISOString();
      end = dayEnd.toISOString();
    } else if (period === "month") {
      const [y, m] = month.split("-");
      if (!y || !m) return fail(res, 400, "Invalid month format, use YYYY-MM");
      const monthStart = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
      const monthEnd = new Date(Date.UTC(Number(y), Number(m), 1));
      start = monthStart.toISOString();
      end = monthEnd.toISOString();
    }

    const scopedSales = sales.filter((sale) => {
      if (start && sale.created_at < start) return false;
      if (end && sale.created_at >= end) return false;
      return true;
    });

    const visitorSales = scopedSales.filter((sale) => sale.type === "visitor");
    const customerSales = scopedSales.filter((sale) => sale.type === "customer");
    const customersServed = new Set(customerSales.map((s) => s.customer_id).filter(Boolean)).size;
    const visitorIdentitySet = new Set(
      visitorSales
        .map((s) => `${String(s.customer_name || "").trim().toLowerCase()}|${String(s.contractor || "").trim().toLowerCase()}`)
        .filter((v) => v !== "|"),
    );
    const visitorsServed = visitorIdentitySet.size;

    const byDay = {};
    for (const sale of scopedSales) {
      const date = String(sale.created_at || "").slice(0, 10);
      if (!date) continue;
      if (!byDay[date]) {
        byDay[date] = { date, revenue: 0, count: 0 };
      }
      byDay[date].revenue += Math.abs(Number(sale.amount || 0));
      byDay[date].count += 1;
    }

    const byCustomer = {};
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

    return res.json({
      period,
      month,
      range: { start, end },
      total_revenue: scopedSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
      total_sales: scopedSales.length,
      customer_revenue: customerSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
      visitor_revenue: visitorSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
      customer_sales_count: customerSales.length,
      visitor_sales_count: visitorSales.length,
      total_customers: customers.length,
      total_visitors: visitorsServed,
      total_agents: agents.length,
      unique_customers_served: customersServed,
      customers_served: customersServed,
      visitors_served: visitorsServed,
      chart: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      top_customers: Object.values(byCustomer)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    });
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.post("/api/agents", writeRateLimit, async (req, res) => {
  if (!db || !users) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireAdminActor(req, res);
  if (!actor) return;

  const displayName = String(req.body?.display_name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const contact = String(req.body?.contact || "").trim();
  const password = String(req.body?.password || "");

  if (!displayName || !email || password.length < 6) {
    return fail(res, 400, "Name, email and password (min 6 chars) are required");
  }

  const agentId = ID.unique();
  try {
    const existing = await listAll(APPWRITE_USERS_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.equal("email", email),
      Query.limit(1),
    ]);
    if (existing.length > 0) {
      return fail(res, 400, "Email already registered");
    }

    await users.create(agentId, email, undefined, password, displayName);

    const payload = {
      id: agentId,
      organization_id: actor.organization_id,
      email,
      role: "sales",
      display_name: displayName,
      contact,
      created_at: nowIso(),
    };

    await db.createDocument(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, ID.unique(), payload);

    return res.json({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      display_name: payload.display_name,
      contact: payload.contact,
    });
  } catch (error) {
    try {
      await users.delete(agentId);
    } catch (_rollbackError) {
      // Ignore rollback issues and return original failure.
    }
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

app.delete("/api/agents/:agentId", writeRateLimit, async (req, res) => {
  if (!db || !users) return fail(res, 500, "Auth backend misconfigured");

  const actor = requireAdminActor(req, res);
  if (!actor) return;

  const agentId = String(req.params.agentId || "").trim();
  if (!agentId) return fail(res, 400, "agentId is required");

  try {
    const agents = await listAll(APPWRITE_USERS_COLLECTION_ID, [
      Query.equal("organization_id", actor.organization_id),
      Query.equal("id", agentId),
      Query.equal("role", "sales"),
      Query.limit(1),
    ]);
    const agent = agents[0];
    if (!agent) return fail(res, 404, "Sales rep not found");

    await db.deleteDocument(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, agent.$id);

    try {
      await users.delete(agentId);
    } catch (_authDeleteError) {
      // Keep API success because app profile is removed; auth user can be cleaned up later.
    }

    return res.json({ ok: true });
  } catch (error) {
    const mapped = mapAppwriteError(error);
    return fail(res, mapped.status, mapped.detail);
  }
});

if (require.main === module && process.env.VERCEL !== "1") {
  const port = Number(process.env.PORT || 4000);
  (async () => {
    await ensureSalesSchema();
    app.listen(port, () => {
      console.log(`[auth-backend] listening on port ${port}`);
    });
  })().catch((error) => {
    console.error('[auth-backend] failed to start:', error.message);
  });
}

module.exports = app;
