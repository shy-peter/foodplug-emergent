import { getAuthApiBaseUrls } from '@/lib/auth';

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

function formatQuery(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

const SALES_REQUEST_TIMEOUT_MS = 10000;

async function requestJson<T>(path: string, token: string, init?: RequestInit) {
  let lastError: Error | null = null;

  for (const baseUrl of getAuthApiBaseUrls()) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SALES_REQUEST_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const payload = (await response.json().catch(() => ({}))) as T & { detail?: string };
      if (!response.ok) {
        const message = payload.detail || 'Request failed';
        if (response.status === 404 || response.status >= 500) {
          lastError = new Error(message);
          continue;
        }
        throw new Error(message);
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(`Request timed out for ${baseUrl}. Check backend connectivity.`);
      } else {
        lastError = error instanceof Error ? error : new Error('Request failed');
      }
    }
  }

  throw lastError || new Error('Request failed');
}

export async function loadSalesCustomers(token: string) {
  const customers = await requestJson<SalesCustomer[]>('/api/customers', token);
  return Array.isArray(customers) ? customers.filter((customer) => String(customer.pin || '').trim() !== '0000') : [];
}

export async function loadSalesHistory(token: string, customerId: string) {
  return requestJson<SalesHistory>(`/api/customers/${customerId}/history`, token);
}

export async function loadSalesRecords(token: string, params: Record<string, string | number | undefined> = {}) {
  return requestJson<SaleRecord[]>(`/api/sales${formatQuery(params)}`, token);
}

export async function registerCustomerMeal(
  token: string,
  payload: { customer_id: string; food_type: string; amount: number },
) {
  return requestJson<SaleRecord>('/api/sales', token, {
    method: 'POST',
    body: JSON.stringify({
      type: 'customer',
      customer_id: payload.customer_id,
      food_type: payload.food_type,
      amount: payload.amount,
    }),
  });
}

export async function registerVisitorMeal(
  token: string,
  payload: { customer_name: string; contractor: string; food_type: string; amount: number },
) {
  return requestJson<SaleRecord>('/api/sales', token, {
    method: 'POST',
    body: JSON.stringify({
      type: 'visitor',
      customer_name: payload.customer_name,
      contractor: payload.contractor,
      food_type: payload.food_type,
      amount: payload.amount,
    }),
  });
}