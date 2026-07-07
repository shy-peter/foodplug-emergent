import { ID, Query } from 'appwrite';

import {
  CUSTOMERS_COLLECTION_ID,
  SALES_COLLECTION_ID,
  createApiError,
  createDoc,
  listAll,
  nowIso,
  type CustomerDoc,
  type SaleDoc,
} from '@/lib/appwrite';
import { requireSessionUser } from '@/lib/auth';

export type SalesCustomer = {
  id: string;
  organization_id: string;
  name: string;
  contractor: string;
  pin: string;
  created_at: string;
  balance_credited?: number;
};

export type SalesHistory = {
  customer: SalesCustomer;
  sales: SaleRecord[];
  total_meals: number;
  total_cost: number;
};

export type SaleRecord = {
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

function toSaleRecord(sale: SaleDoc): SaleRecord {
  return {
    id: sale.id,
    organization_id: sale.organization_id,
    type: sale.type,
    customer_id: sale.customer_id || null,
    customer_name: sale.customer_name,
    contractor: sale.contractor,
    food_type: sale.food_type,
    amount: Number(sale.amount || 0),
    agent_id: sale.agent_id,
    agent_name: sale.agent_name,
    created_at: sale.created_at,
  };
}

function toCustomer(customer: CustomerDoc): SalesCustomer {
  return {
    id: customer.id,
    organization_id: customer.organization_id,
    name: customer.name,
    contractor: customer.contractor,
    pin: customer.pin,
    created_at: customer.created_at,
    balance_credited: Number(customer.balance_credited || 0),
  };
}

function filterSaleRecords(
  sales: SaleRecord[],
  params: Record<string, string | number | undefined>,
): SaleRecord[] {
  const hasExplicitLimit =
    params.limit !== undefined && params.limit !== null && String(params.limit).trim() !== '';
  const limit = hasExplicitLimit ? Number(params.limit) : null;
  const customerId = String(params.customer_id || '').trim();
  const agentId = String(params.agent_id || '').trim();
  const start = String(params.start || '').trim();
  const end = String(params.end || '').trim();

  const filteredSales = sales.filter((sale) => {
      if (customerId && sale.customer_id !== customerId) return false;
      if (agentId && sale.agent_id !== agentId) return false;
      if (start && sale.created_at < start) return false;
      if (end && sale.created_at > end) return false;
      return true;
    });

  if (!hasExplicitLimit || !Number.isFinite(limit) || Number(limit) <= 0) {
    return filteredSales;
  }

  return filteredSales.slice(0, Number(limit));
}

export async function loadSalesCustomers(token: string) {
  void token;
  const user = await requireSessionUser();

  const customers = await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [
    Query.equal('organization_id', user.organization_id),
    Query.orderDesc('created_at'),
  ]);

  return customers.map(toCustomer).filter((customer) => String(customer.pin || '').trim() !== '0000');
}

export async function loadSalesHistory(token: string, customerId: string) {
  void token;
  const user = await requireSessionUser();

  const customer = (
    await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [
      Query.equal('organization_id', user.organization_id),
      Query.equal('id', customerId),
      Query.limit(1),
    ])
  )[0];

  if (!customer) {
    throw createApiError('Customer not found', 404);
  }

  const sales = await listAll<SaleDoc>(SALES_COLLECTION_ID, [
    Query.equal('organization_id', user.organization_id),
    Query.equal('customer_id', customerId),
    Query.orderDesc('created_at'),
  ]);

  const normalizedSales = sales.map(toSaleRecord);
  return {
    customer: toCustomer(customer),
    sales: normalizedSales,
    total_meals: normalizedSales.length,
    total_cost: normalizedSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
  };
}

export async function loadSalesRecords(token: string, params: Record<string, string | number | undefined> = {}) {
  void token;
  const user = await requireSessionUser();

  const sales = await listAll<SaleDoc>(SALES_COLLECTION_ID, [
    Query.equal('organization_id', user.organization_id),
    Query.orderDesc('created_at'),
  ]);

  return filterSaleRecords(sales.map(toSaleRecord), params);
}

export async function registerCustomerMeal(
  token: string,
  payload: { customer_id: string; food_type: string; amount: number },
) {
  void token;
  const user = await requireSessionUser();

  if (payload.amount < 100 || payload.amount > 20000) {
    throw createApiError('Amount must be between ₦100 and ₦20,000', 400);
  }

  const customer = (
    await listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [
      Query.equal('organization_id', user.organization_id),
      Query.equal('id', payload.customer_id),
      Query.limit(1),
    ])
  )[0];

  if (!customer) {
    throw createApiError('Customer not found', 404);
  }

  const sale: SaleRecord = {
    id: ID.unique(),
    organization_id: user.organization_id,
    type: 'customer',
    customer_id: customer.id,
    customer_name: customer.name,
    contractor: customer.contractor,
    food_type: payload.food_type,
    amount: payload.amount,
    agent_id: user.id,
    agent_name: user.display_name,
    created_at: nowIso(),
  };

  await createDoc(SALES_COLLECTION_ID, sale as unknown as Record<string, unknown>);
  return sale;
}

export async function registerVisitorMeal(
  token: string,
  payload: { customer_name: string; contractor: string; food_type: string; amount: number },
) {
  void token;
  const user = await requireSessionUser();

  if (payload.amount < 100 || payload.amount > 20000) {
    throw createApiError('Amount must be between ₦100 and ₦20,000', 400);
  }

  const customerName = payload.customer_name.trim();
  const contractor = payload.contractor.trim();
  if (!customerName || !contractor) {
    throw createApiError('Visitor name and contractor required', 400);
  }

  const sale: SaleRecord = {
    id: ID.unique(),
    organization_id: user.organization_id,
    type: 'visitor',
    customer_id: null,
    customer_name: customerName,
    contractor,
    food_type: payload.food_type,
    amount: payload.amount,
    agent_id: user.id,
    agent_name: user.display_name,
    created_at: nowIso(),
  };

  await createDoc(SALES_COLLECTION_ID, sale as unknown as Record<string, unknown>);
  return sale;
}