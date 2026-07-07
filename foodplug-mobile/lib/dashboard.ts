import { Query } from 'appwrite';

import {
  CUSTOMERS_COLLECTION_ID,
  SALES_COLLECTION_ID,
  USERS_COLLECTION_ID,
  createApiError,
  listAll,
  type CustomerDoc,
  type SaleDoc,
  type UserDoc,
} from '@/lib/appwrite';
import { type SessionUser } from '@/lib/auth';

export type DashboardPeriod = 'day' | 'month' | 'all';

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

export type DashboardStats = {
  period: DashboardPeriod;
  month?: string;
  range?: { start: string | null; end: string | null };
  total_revenue: number;
  total_sales: number;
  customer_revenue: number;
  visitor_revenue: number;
  customer_sales_count: number;
  visitor_sales_count: number;
  total_customers: number;
  total_visitors: number;
  total_agents: number;
  unique_customers_served?: number;
  customers_served?: number;
  visitors_served?: number;
  chart: Array<{ date: string; revenue: number; count: number }>;
  top_customers: Array<{ customer_id: string; customer_name: string; contractor: string; meals: number; revenue: number }>;
};

export type DashboardOverview = {
  period: DashboardPeriod;
  stats: DashboardStats;
  recentSales: SaleRecord[];
};

export type DashboardOverviewFallback = {
  period: DashboardPeriod;
  stats: DashboardStats;
  recentSales: SaleRecord[];
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

function createEmptyStats(period: DashboardPeriod): DashboardStats {
  return {
    period,
    total_revenue: 0,
    total_sales: 0,
    customer_revenue: 0,
    visitor_revenue: 0,
    customer_sales_count: 0,
    visitor_sales_count: 0,
    total_customers: 0,
    total_visitors: 0,
    total_agents: 0,
    chart: [],
    top_customers: [],
  };
}

function getCurrentMonthKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function isSameUtcDay(leftIso: string, rightIso: string) {
  return leftIso.slice(0, 10) === rightIso.slice(0, 10);
}

function isSameMonth(iso: string, monthKey: string) {
  return iso.slice(0, 7) === monthKey;
}

function isInPeriod(iso: string, period: DashboardPeriod) {
  if (period === 'all') {
    return true;
  }

  const nowIso = new Date().toISOString();
  if (period === 'day') {
    return isSameUtcDay(iso, nowIso);
  }

  return isSameMonth(iso, getCurrentMonthKey());
}

function filterSalesByPeriod(sales: SaleRecord[], period: DashboardPeriod) {
  if (period === 'all') {
    return sales;
  }

  const nowIso = new Date().toISOString();
  if (period === 'day') {
    return sales.filter((sale) => isSameUtcDay(sale.created_at, nowIso));
  }

  const monthKey = getCurrentMonthKey();
  return sales.filter((sale) => isSameMonth(sale.created_at, monthKey));
}

function deriveStatsFromSales(period: DashboardPeriod, sales: SaleRecord[]): DashboardStats {
  const sortedSales = [...sales].sort((left, right) => right.created_at.localeCompare(left.created_at));
  const customerSales = sortedSales.filter((sale) => sale.type === 'customer');
  const visitorSales = sortedSales.filter((sale) => sale.type === 'visitor');
  const chartMap = new Map<string, { date: string; revenue: number; count: number }>();
  const customerMap = new Map<string, { customer_id: string; customer_name: string; contractor: string; meals: number; revenue: number }>();

  for (const sale of sortedSales) {
    const saleDate = sale.created_at.slice(0, 10);
    if (!chartMap.has(saleDate)) {
      chartMap.set(saleDate, { date: saleDate, revenue: 0, count: 0 });
    }
    const chartPoint = chartMap.get(saleDate);
    if (chartPoint) {
      chartPoint.revenue += Math.abs(Number(sale.amount || 0));
      chartPoint.count += 1;
    }

    if (sale.type !== 'customer' || !sale.customer_id) continue;
    if (!customerMap.has(sale.customer_id)) {
      customerMap.set(sale.customer_id, {
        customer_id: sale.customer_id,
        customer_name: sale.customer_name,
        contractor: sale.contractor,
        meals: 0,
        revenue: 0,
      });
    }

    const customerEntry = customerMap.get(sale.customer_id);
    if (customerEntry) {
      customerEntry.meals += 1;
      customerEntry.revenue += Math.abs(Number(sale.amount || 0));
    }
  }

  return {
    period,
    total_revenue: sortedSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
    total_sales: sortedSales.length,
    customer_revenue: customerSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
    visitor_revenue: visitorSales.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0),
    customer_sales_count: customerSales.length,
    visitor_sales_count: visitorSales.length,
    total_customers: new Set(customerSales.map((sale) => sale.customer_id).filter(Boolean)).size,
    total_visitors: new Set(
      visitorSales
        .map((sale) => `${String(sale.customer_name || '').trim().toLowerCase()}|${String(sale.contractor || '').trim().toLowerCase()}`)
        .filter((value) => value !== '|'),
    ).size,
    total_agents: new Set(sortedSales.map((sale) => sale.agent_id).filter(Boolean)).size,
    unique_customers_served: new Set(customerSales.map((sale) => sale.customer_id).filter(Boolean)).size,
    customers_served: new Set(customerSales.map((sale) => sale.customer_id).filter(Boolean)).size,
    visitors_served: new Set(
      visitorSales
        .map((sale) => `${String(sale.customer_name || '').trim().toLowerCase()}|${String(sale.contractor || '').trim().toLowerCase()}`)
        .filter((value) => value !== '|'),
    ).size,
    chart: Array.from(chartMap.values()).sort((left, right) => left.date.localeCompare(right.date)),
    top_customers: Array.from(customerMap.values())
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 5),
  };
}

export async function loadDashboardOverview(token: string, user: SessionUser, period: DashboardPeriod = 'day') {
  void token;

  if (!user.organization_id) {
    throw createApiError('Tenant is not configured. Sign in again.', 500);
  }

  const [salesDocs, customerDocs, agentDocs] = await Promise.all([
    listAll<SaleDoc>(SALES_COLLECTION_ID, [
      Query.equal('organization_id', user.organization_id),
      Query.orderDesc('created_at'),
      Query.limit(100),
    ]),
    listAll<CustomerDoc>(CUSTOMERS_COLLECTION_ID, [Query.equal('organization_id', user.organization_id)]),
    listAll<UserDoc>(USERS_COLLECTION_ID, [
      Query.equal('organization_id', user.organization_id),
      Query.equal('role', 'sales'),
    ]),
  ]);

  const recentSales = salesDocs.map(toSaleRecord);
  const periodScopedSales = recentSales.filter((sale) => isInPeriod(sale.created_at, period));

  const baseStats = deriveStatsFromSales(period, periodScopedSales);
  const stats: DashboardStats = {
    ...baseStats,
    total_customers: customerDocs.length,
    total_agents: agentDocs.length,
  };

  if (user.role === 'admin') {
    return {
      period,
      stats,
      recentSales,
    } satisfies DashboardOverview;
  }

  const filteredSales = filterSalesByPeriod(recentSales, period);
  return {
    period,
    stats: {
      ...deriveStatsFromSales(period, filteredSales.length > 0 ? filteredSales : []),
      total_customers: customerDocs.length,
      total_agents: agentDocs.length,
    },
    recentSales,
  } satisfies DashboardOverviewFallback;
}

export function emptyDashboardOverview(period: DashboardPeriod): DashboardOverview {
  return {
    period,
    stats: createEmptyStats(period),
    recentSales: [],
  };
}
