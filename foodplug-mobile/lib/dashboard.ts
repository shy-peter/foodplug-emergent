import { getAuthApiBaseUrls, type SessionUser } from '@/lib/auth';

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

function formatQuery(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    searchParams.set(key, value);
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

const DASHBOARD_REQUEST_TIMEOUT_MS = 10000;

async function requestJson<T>(path: string, token: string) {
  let lastError: Error | null = null;

  for (const baseUrl of getAuthApiBaseUrls()) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DASHBOARD_REQUEST_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const payload = (await response.json().catch(() => ({}))) as T & { detail?: string };
      if (!response.ok) {
        const message = payload.detail || 'Unable to load dashboard';
        if (response.status === 404 || response.status >= 500) {
          lastError = new Error(message);
          continue;
        }
        throw new Error(message);
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(`Dashboard request timed out for ${baseUrl}. Check backend connectivity.`);
      } else {
        lastError = error instanceof Error ? error : new Error('Unable to load dashboard');
      }
    }
  }

  throw lastError || new Error('Unable to load dashboard');
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
  const salesPromise = requestJson<SaleRecord[]>(`/api/sales${formatQuery({ limit: '100' })}`, token);

  if (user.role === 'admin') {
    const statsPromise = requestJson<DashboardStats>(
      `/api/stats${formatQuery({ period, month: period === 'month' ? getCurrentMonthKey() : undefined })}`,
      token,
    );
    const [stats, recentSales] = await Promise.all([statsPromise, salesPromise]);
    return { period, stats, recentSales } satisfies DashboardOverview;
  }

  const recentSales = await salesPromise;
  const filteredSales = filterSalesByPeriod(recentSales, period);
  return {
    period,
    stats: deriveStatsFromSales(period, filteredSales.length > 0 ? filteredSales : []),
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
