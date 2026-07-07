import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { toast } from "sonner";
import {
  Wallet,
  Users,
  Receipt,
  UserCog,
  TrendingUp,
  Utensils,
  UserPlus,
  Search,
  User,
  MinusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";

export default function DashboardPage() {
  const location = useLocation();
  const [period, setPeriod] = useState("day");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [stats, setStats] = useState(null);
  const [sales, setSales] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [totalBalance, setTotalBalance] = useState(0);
  const [customerRevenueAfterPayments, setCustomerRevenueAfterPayments] = useState(0);
  const [locationFilter, setLocationFilter] = useState("all");
  const [showAllRecentSales, setShowAllRecentSales] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get("tab");
    if (requestedTab === "balance" || requestedTab === "overview") {
      setActiveTab(requestedTab);
      return;
    }
    setActiveTab("overview");
  }, [location.search]);

  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });
      opts.push({ value: val, label });
    }
    return opts;
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const params = { period };
      if (period === "month") params.month = month;
      if (locationFilter !== "all") params.location = locationFilter;

      const salesParams = { limit: 5000 };
      const range = buildDashboardRange(period, month);
      if (range.start) salesParams.start = range.start;
      if (range.end) salesParams.end = range.end;
      if (locationFilter !== "all") salesParams.location = locationFilter;

      const paymentHistoryParams = {};
      if (locationFilter !== "all") paymentHistoryParams.location = locationFilter;

      const [s, l, paymentHistory, branchResponse] = await Promise.all([
        api.get("/stats", { params }),
        api.get("/sales", { params: salesParams }),
        api.get("/payment-history", { params: paymentHistoryParams }),
        api.get("/branches"),
      ]);
      setStats(s.data);
      setSales(l.data);
      setBranches(branchResponse.data || []);
      const totalPaid = (paymentHistory.data || []).reduce((sum, payment) => {
        if (range.start && payment.created_at < range.start) return sum;
        if (range.end && payment.created_at >= range.end) return sum;
        return sum + (Number(payment.amount) || 0);
      }, 0);
      setTotalBalance(totalPaid);
      const totalCustomerRevenue = s.data?.customer_revenue ?? 0;
      const stillOwed = Math.max(0, totalCustomerRevenue - totalPaid);
      setCustomerRevenueAfterPayments(stillOwed);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const refetchBalanceData = async () => {
    try {
      const range = buildDashboardRange(period, month);
      const statsParams = period === "month" ? { period, month } : { period };
      if (locationFilter !== "all") statsParams.location = locationFilter;
      const paymentHistoryParams = {};
      if (locationFilter !== "all") paymentHistoryParams.location = locationFilter;
      const [paymentHistory, s] = await Promise.all([
        api.get("/payment-history", { params: paymentHistoryParams }),
        api.get("/stats", { params: statsParams }),
      ]);
      const totalPaid = (paymentHistory.data || []).reduce((sum, payment) => {
        if (range.start && payment.created_at < range.start) return sum;
        if (range.end && payment.created_at >= range.end) return sum;
        return sum + (Number(payment.amount) || 0);
      }, 0);
      setTotalBalance(totalPaid);
      const totalCustomerRevenue = s.data?.customer_revenue ?? 0;
      const stillOwed = Math.max(0, totalCustomerRevenue - totalPaid);
      setCustomerRevenueAfterPayments(stillOwed);
    } catch (e) {
      console.error("Failed to refetch balance data:", e);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, month, locationFilter]);

  useEffect(() => {
    setShowAllRecentSales(false);
  }, [period, month, locationFilter]);

  const chartData = stats?.chart || [];
  const userVsVisitorData = [
    {
      name: "Registered users",
      value: Number(stats?.total_customers || 0),
      color: "#D95D39",
    },
    {
      name: "Visitor purchases",
      value: Number(stats?.visitor_sales_count || 0),
      color: "#4F7942",
    },
  ];
  const userVsVisitorTotal = userVsVisitorData.reduce(
    (sum, item) => sum + item.value,
    0,
  );
  const customerSalesCount = Number(
    stats?.customer_sales_count ??
      stats?.customers_served ??
      stats?.unique_customers_served ??
      0,
  );
  const isDashboardLoading = loading || !stats;
  const audienceBreakdown = [
    {
      group: "Customers",
      total: Number(stats?.total_customers || 0),
      salesMade: Number(stats?.customer_revenue || 0),
      served: Number(
        stats?.customer_sales_count ??
          stats?.customers_served ??
          stats?.unique_customers_served ??
          0,
      ),
      tone: "#4F7942",
    },
    {
      group: "Visitors",
      total: Number(stats?.total_visitors || 0),
      salesMade: Number(stats?.visitor_revenue || 0),
      served: Number(stats?.visitor_sales_count || 0),
      tone: "#D95D39",
    },
  ];
  const audienceTotals = audienceBreakdown.reduce(
    (acc, item) => ({
      served: acc.served + item.served,
      salesMade: acc.salesMade + item.salesMade,
    }),
    { served: 0, salesMade: 0 },
  );
  const defaultRecentSalesCount = 7;
  const visibleRecentSales = showAllRecentSales
    ? sales
    : sales.slice(0, defaultRecentSalesCount);

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#5C5C59] font-bold">
            Overview
          </p>
          <h1 className="font-display font-black text-3xl sm:text-4xl text-[#2C423F] mt-1">
            Control Room
          </h1>
          <p className="text-[#5C5C59] mt-2 max-w-xl">
            Live view of revenue, workers served, and sales activity across
            every site.
          </p>
        </div>

        <div className="card-elevated p-2">
          
          {isDashboardLoading ? (
            <div className="flex items-center   text-[#5C5C59]">
              <div className=" animate-ping rounded-full bg-green-500" />
              {/* <span className="text-sm font-semibold">Loading...</span> */}
            </div>
          ) : (
            <p className="font-display font-black text-xs text-[#2C423F]">
              {(stats?.total_customers ?? 0).toLocaleString("en-NG")}
            </p>
          )}
        </div>
      </div>

      {activeTab === "overview" && (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg bg-white border border-[#E8E6E1] p-1">
                {[
                  { id: "day", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "month", label: "Month" },
                  { id: "all", label: "All time" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    data-testid={`period-${p.id}`}
                    className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                      period === p.id
                        ? "bg-[#2C423F] text-white"
                        : "text-[#5C5C59] hover:text-[#2C423F]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {period === "month" && (
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger
                    data-testid="month-select"
                    className="w-[200px] h-11 bg-white border-[#E8E6E1]"
                  >
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-full md:w-[240px] h-11 bg-white border-[#E8E6E1] md:ml-auto">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {branches.map((branch) => {
                  const label = `${branch.branch_name} - ${branch.sub_branch_name}`;
                  return (
                    <SelectItem key={branch.id} value={label}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-center border  px-6 py-2 rounded-lg border-green-200">
            <div className="text-right border border-green-200 rounded-lg px-4 py-2">
              <p className="text-xs text-[#5C5C59] font-bold">Total collected</p>
              {isDashboardLoading ? (
                <div className="flex items-center justify-end gap-2 py-1 text-[#5C5C59]">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#E8E6E1] border-t-[#D95D39]" />
                  <span className="text-sm font-semibold">Loading...</span>
                </div>
              ) : (
                <p className="font-display font-bold text-lg text-[#2C423F]">
                  {formatNaira((stats?.visitor_revenue || 0) + totalBalance)}
                </p>
              )}
            </div>
          </div>

          {/* KPI Bento */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {(() => {
              const netRevenue =
                (stats?.visitor_revenue ?? 0) + totalBalance;
              const expectedRevenue = -netRevenue;
              return (
                <>
                  <KpiCard
                    testid="kpi-revenue"
                    label="Revenue"
                    value={formatNaira(netRevenue)}
                    icon={Wallet}
                    accent="#D95D39"
                    highlight
                    subtitle={`${stats?.total_sales ?? 0} sales`}
                    bgClass={netRevenue < 0 ? "bg-[#F9F1EE]" : ""}
                    loading={isDashboardLoading}
                  />
                 
                </>
              );
            })()}
            <KpiCard
              testid="kpi-customers"
              label=" outstanding Bal"
              value={`${formatNaira(customerRevenueAfterPayments)}`}
              usercount={stats?.total_customers ?? 0}
              icon={Users}
              accent="#8A9A5B"
              bgClass="bg-[#F9F1EE]"
              subtitle={`${customerSalesCount} sales`}
              loading={isDashboardLoading}
            />

            <KpiCard
              testid="kpi-visitors"
              label="Visitor sales"
              value={formatNaira(stats?.visitor_revenue)}
              icon={UserPlus}
              accent="#2C423F"
              bgClass="bg-[#E8F5E9]"
              subtitle={`${stats?.visitor_sales_count ?? 0} sales`}
              loading={isDashboardLoading}
            />
            <KpiCard
              testid="kpi-agents"
              label="Sales reps"
              value={stats?.total_agents ?? 0}
              icon={UserCog}
              accent="#D4A373"
              subtitle="Active team"
              loading={isDashboardLoading}
            />
          </div>

          <div
            className="card-elevated p-6"
            data-testid="audience-breakdown-card"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">
              Audience summary
            </p>
            <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1 mb-4">
              Customers and visitors breakdown
            </h3>

            {isDashboardLoading ? (
              <div className="flex items-center justify-center min-h-[160px] text-[#5C5C59]">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#E8E6E1] border-t-[#4F7942]" />
                  <span className="text-sm font-semibold">Loading audience summary...</span>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-left border-collapse"
                  data-testid="audience-breakdown-table"
                >
                  <thead>
                    <tr>
                      <Th>Group</Th>
                      <Th className="text-right">Served</Th>
                      <Th className="text-right">Sales made</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {audienceBreakdown.map((item) => (
                      <tr key={item.group}>
                        <Td className="font-semibold">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: item.tone }}
                            />
                            {item.group}
                          </span>
                        </Td>
                        <Td className="text-right font-display font-bold">
                          {item.served.toLocaleString("en-NG")}
                        </Td>
                        <Td className="text-right font-display font-bold">
                          {formatNaira(item.salesMade)}
                        </Td>
                      </tr>
                    ))}
                    <tr>
                      <Td className="font-semibold">Total</Td>
                      <Td className="text-right font-display font-black text-[#2C423F]">
                        {audienceTotals.served.toLocaleString("en-NG")}
                      </Td>
                      <Td className="text-right font-display font-black text-[#2C423F]">
                        {formatNaira(audienceTotals.salesMade)}
                      </Td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Chart + Top customers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="lg:col-span-2 card-elevated p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">
                    Revenue trend
                  </p>
                  <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1">
                    Sales activity
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-[#4F7942] text-sm font-semibold">
                  <TrendingUp className="w-4 h-4" />
                  {isDashboardLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#E8E6E1] border-t-[#4F7942]" />
                      Loading
                    </span>
                  ) : (
                    `${chartData.length} days`
                  )}
                </div>
              </div>

              <div className="h-64" data-testid="revenue-chart">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-[#5C5C59]">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#E8E6E1] border-t-[#D95D39]" />
                      <span className="text-sm font-semibold">Loading chart...</span>
                    </div>
                  </div>
                ) : chartData.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor="#D95D39"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor="#D95D39"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="#E8E6E1"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#5C5C59", fontSize: 11 }}
                        tickFormatter={(d) => d?.slice(5)}
                      />
                      <YAxis
                        tick={{ fill: "#5C5C59", fontSize: 11 }}
                        tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #E8E6E1",
                          borderRadius: 8,
                        }}
                        formatter={(v) => formatNaira(v)}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#D95D39"
                        strokeWidth={2.5}
                        fill="url(#rev)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="card-elevated p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">
                  Top customers
                </p>
                <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1 mb-4">
                  Big spenders
                </h3>

                {isDashboardLoading ? (
                  <div className="flex items-center justify-center min-h-[120px] text-[#5C5C59]">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#E8E6E1] border-t-[#D95D39]" />
                      <span className="text-sm font-semibold">Loading top customers...</span>
                    </div>
                  </div>
                ) : stats?.top_customers?.length ? (
                  <ul className="space-y-3">
                    {stats.top_customers.map((c, i) => (
                      <li
                        key={c.customer_id}
                        className="flex items-center justify-between gap-3"
                        data-testid={`top-customer-${i}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[#F9F1EE] text-[#D95D39] flex items-center justify-center font-bold">
                            {(c.customer_name || "?").slice(0, 1)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[#2C423F] truncate">
                              {c.customer_name}
                            </p>
                            <p className="text-xs text-[#5C5C59] truncate">
                              {c.contractor}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-display font-bold text-[#2C423F]">
                            {formatNaira(c.revenue)}
                          </p>
                          <p className="text-xs text-[#5C5C59]">
                            {c.meals} meals
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#5C5C59]">
                    No sales yet for this period.
                  </p>
                )}
              </div>

              <div
                className="card-elevated p-6"
                data-testid="registered-vs-visitor-pie-card"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">
                  Distribution
                </p>
                <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1">
                  Registered users vs visitor purchases
                </h3>

                {isDashboardLoading ? (
                  <div className="flex items-center justify-center min-h-[160px] text-[#5C5C59]">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#E8E6E1] border-t-[#2C423F]" />
                      <span className="text-sm font-semibold">Loading distribution...</span>
                    </div>
                  </div>
                ) : userVsVisitorTotal === 0 ? (
                  <p className="text-sm text-[#5C5C59] mt-4">
                    No data for this period.
                  </p>
                ) : (
                  <>
                    <div
                      className="h-52 mt-3"
                      data-testid="registered-vs-visitor-pie"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={userVsVisitorData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={84}
                            paddingAngle={2}
                          >
                            {userVsVisitorData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) =>
                              Number(value).toLocaleString("en-NG")
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-2 mt-2">
                      {userVsVisitorData.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2 text-[#5C5C59]">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span>{item.name}</span>
                          </div>
                          <span className="font-semibold text-[#2C423F]">
                            {item.value.toLocaleString("en-NG")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Recent sales */}
          <div className="card-elevated p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">
                  Latest
                </p>
                <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1">
                  Recent sales
                </h3>
              </div>
              <Receipt className="w-5 h-5 text-[#D95D39]" />
            </div>

            {sales.length === 0 ? (
              <div className="text-center py-10 text-[#5C5C59]">
                <Utensils className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No sales recorded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <table
                  className="w-full text-left border-collapse"
                  data-testid="recent-sales-table"
                >
                  <thead>
                    <tr>
                      <Th>Customer</Th>
                      <Th>Contractor</Th>
                      <Th>Type</Th>
                      <Th>Agent</Th>
                      <Th className="text-right">Amount</Th>
                      <Th className="text-right">When</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecentSales.map((s) => (
                      <tr
                        key={s.id}
                        className="hover:bg-[#F9F8F6] transition-colors"
                      >
                        <Td className="font-semibold">{s.customer_name}</Td>
                        <Td>{s.contractor}</Td>
                        <Td>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                              s.type === "visitor"
                                ? "bg-[#F5E6D3] text-[#563f8a]"
                                : "bg-[#EDF1E4] text-[#4F7942]"
                            }`}
                          >
                            {s.food_type}
                          </span>
                        </Td>
                        <Td>{s.agent_name}</Td>
                        <Td
                          className={`text-right font-display font-bold ${Number(s.amount) < 0 ? "text-[#D95D39]" : "text-[#4F7942]"}`}
                        >
                          {formatNaira(s.amount)}
                        </Td>
                        <Td className="text-right text-[#5C5C59]">
                          {new Date(s.created_at).toLocaleString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                            day: "2-digit",
                            month: "short",
                          })}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sales.length > defaultRecentSalesCount && (
                  <div className="flex justify-end pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAllRecentSales((prev) => !prev)}
                    >
                      {showAllRecentSales ? "Show less" : "Show more"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
      {activeTab === "balance" && <BalancePaymentsTab onPaymentSuccess={refetchBalanceData} />}
    </div>
  );
}

function buildDashboardRange(period, month) {
  const now = new Date();

  if (period === "day") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (period === "yesterday") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (period === "month") {
    const [year, monthIndex] = String(month || "").split("-");
    if (!year || !monthIndex) {
      return { start: "", end: "" };
    }
    const start = new Date(Date.UTC(Number(year), Number(monthIndex) - 1, 1));
    const end = new Date(Date.UTC(Number(year), Number(monthIndex), 1));
    return { start: start.toISOString(), end: end.toISOString() };
  }

  return { start: "", end: "" };
}

function KpiCard({
  label,
  usercount,
  value,
  icon: Icon,
  accent,
  subtitle,
  highlight,
  testid,
  bgClass,
  loading = false,
}) {
  const bgColorMap = {
    "bg-[#F9F1EE]": "#FFDAD1",
    "bg-[#E8F5E9]": "#C8E6C9",
  };
  const bgColor = bgClass ? bgColorMap[bgClass] : null;
  return (
    <div
      data-testid={testid}
      className={`card-elevated p-6 relative overflow-hidden animate-fade-in-up ${
        highlight ? "ring-1 ring-[#D95D39]/20" : ""
      }`}
      style={bgColor ? { backgroundColor: bgColor } : {}}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-6 md:gap-16">
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">
              {label}
            </p>
            <p className=" flex self-end font-bold">{usercount}</p>
          </div>
          <div className="mt-3 min-h-[2.5rem] flex items-center">
            {loading ? (
              <div className="flex items-center gap-3 text-[#5C5C59]">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#E8E6E1] border-t-[#D95D39]" />
                <span className="text-sm font-semibold">Loading revenue...</span>
              </div>
            ) : (
              <p className="font-display font-black text-3xl text-[#2C423F]">{value}</p>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-[#5C5C59] mt-1">{subtitle}</p>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accent}15`, color: accent }}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {highlight && (
        <div
          className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full opacity-20"
          style={{
            background: `radial-gradient(circle, ${accent}, transparent 70%)`,
          }}
        />
      )}
    </div>
  );
}

function Th({ children, className = "" }) {
  return (
    <th
      className={`text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold pb-3 border-b border-[#E8E6E1] ${className}`}
    >
      {children}
    </th>
  );
}
function Td({ children, className = "" }) {
  return (
    <td
      className={`py-3 border-b border-[#E8E6E1] text-sm text-[#2C423F] ${className}`}
    >
      {children}
    </td>
  );
}

function EmptyChart() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-[#5C5C59]">
      <TrendingUp className="w-8 h-8 opacity-40 mb-2" />
      <p className="text-sm">No sales data for this period yet.</p>
    </div>
  );
}

function BalancePaymentsTab({ onPaymentSuccess }) {
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [salesByCustomer, setSalesByCustomer] = useState({});
  const [q, setQ] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("owing");
  const [locationFilter, setLocationFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      const [c, s, branchResponse] = await Promise.all([
        api.get("/customers"),
        api.get("/sales", { params: { limit: 5000 } }),
        api.get("/branches"),
      ]);
      setCustomers(c.data);
      setBranches(branchResponse.data || []);
      const map = {};
      for (const sale of s.data) {
        if (!sale.customer_id) continue;
        if (!map[sale.customer_id]) map[sale.customer_id] = 0;
        map[sale.customer_id] += Math.abs(Number(sale.amount || 0));
      }
      setSalesByCustomer(map);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load customers");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let result = customers;

    // Apply search filter
    if (query) {
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.contractor.toLowerCase().includes(query),
      );
    }

    if (locationFilter !== "all") {
      result = result.filter((c) => String(c.location || "") === locationFilter);
    }

    // Apply balance filter
    if (balanceFilter !== "all") {
      result = result.filter((c) => {
        const totalOwed = salesByCustomer[c.id] || 0;
        const paid = Number(c.balance_credited) || 0;
        const outstanding = Math.max(0, totalOwed - paid);
        return balanceFilter === "owing" ? outstanding > 0 : outstanding === 0;
      });
    }

    return result;
  }, [customers, q, locationFilter, balanceFilter, salesByCustomer]);

  const getOutstanding = (c) => {
    const totalOwed = salesByCustomer[c.id] || 0;
    const paid = Number(c.balance_credited) || 0;
    return Math.max(0, totalOwed - paid);
  };

  const openPayment = (customer) => {
    if (getOutstanding(customer) <= 0) {
      toast.error("This customer has no outstanding balance");
      return;
    }
    setSelected(customer);
    setPayAmount("");
    setDialogOpen(true);
  };

  const handlePay = async (e) => {
    e.preventDefault();
    const amount = Number(payAmount);
    if (!selected) {
      toast.error("Select a customer first");
      return;
    }
    const outstanding = getOutstanding(selected);
    if (outstanding <= 0) {
      toast.error("This customer has no outstanding balance");
      return;
    }
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (amount > outstanding) {
      toast.error(`Amount cannot exceed outstanding balance (${formatNaira(outstanding)})`);
      return;
    }
    setPaying(true);
    try {
      await api.patch(`/customers/${selected.id}/credit`, { amount });
      toast.success(
        `Recorded ${formatNaira(amount)} payment for ${selected.name}`,
      );
      setDialogOpen(false);
      await fetchData();
      if (onPaymentSuccess) {
        await onPaymentSuccess();
      }
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to record payment";
      toast.error(detail);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[#5C5C59] font-bold">
          Payments
        </p>
        <h2 className="font-display font-black text-2xl text-[#2C423F] mt-1">
          Balance Reduction
        </h2>
        <p className="text-[#5C5C59] mt-1">
          Record full or partial payments to reduce a customer's outstanding
          balance.
        </p>
      </div>

      <div className="card-elevated p-4 md:p-6">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5C5C59]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or contractor"
            className="pl-9 h-11 bg-white border-[#E8E6E1]"
          />
        </div>

        <div className="mb-4">
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-full md:w-[240px] h-11 bg-white border-[#E8E6E1]">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((branch) => {
                const label = `${branch.branch_name} - ${branch.sub_branch_name}`;
                return (
                  <SelectItem key={branch.id} value={label}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="mb-4 inline-flex rounded-lg bg-white border border-[#E8E6E1] p-1">
          {[
            { id: "owing", label: "Owing" },
            { id: "cleared", label: "Cleared" },
            { id: "all", label: "All" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setBalanceFilter(f.id)}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                balanceFilter === f.id
                  ? "bg-[#2C423F] text-white"
                  : "text-[#5C5C59] hover:text-[#2C423F]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loadingData ? (
          <p className="text-center py-10 text-[#5C5C59]">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Contractor</Th>
                  <Th className="text-right">Total Owed</Th>
                  <Th className="text-right">Paid</Th>
                  <Th className="text-right">Outstanding</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const totalOwed = salesByCustomer[c.id] || 0;
                  const paid = Number(c.balance_credited) || 0;
                  const outstanding = Math.max(0, totalOwed - paid);
                  return (
                    <tr key={c.id} className="hover:bg-[#F9F8F6]">
                      <Td>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#F9F1EE] text-[#D95D39] flex items-center justify-center">
                            <User className="w-4 h-4" />
                          </div>
                          <span className="font-semibold text-[#2C423F]">
                            {c.name}
                          </span>
                        </div>
                      </Td>
                      <Td>{c.contractor}</Td>
                      <Td className="text-right font-display font-bold">
                        {formatNaira(totalOwed)}
                      </Td>
                      <Td className="text-right font-display font-bold text-[#4F7942]">
                        {formatNaira(paid)}
                      </Td>
                      <Td className="text-right font-display font-bold text-[#D95D39]">
                        {formatNaira(outstanding)}
                      </Td>
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPayment(c)}
                          disabled={outstanding <= 0}
                          className="border-[#D95D39]/30 text-[#D95D39] hover:bg-[#D95D39]/5"
                        >
                          <MinusCircle className="w-3.5 h-3.5 mr-1" /> {outstanding > 0 ? "Record Payment" : "Cleared"}
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center py-10 text-[#5C5C59]"
                    >
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-2xl text-[#2C423F]">
              Record Payment
            </DialogTitle>
            <DialogDescription>
              {selected
                ? `${selected.name} — Outstanding: ${formatNaira(getOutstanding(selected))}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePay} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount paid (₦)</Label>
              <Input
                id="pay-amount"
                type="number"
                min="1"
                max={selected ? getOutstanding(selected) : undefined}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="e.g. 5000"
                required
              />
            </div>
            {selected && getOutstanding(selected) > 0 && (
              <button
                type="button"
                onClick={() => setPayAmount(String(getOutstanding(selected)))}
                className="text-sm text-[#D95D39] underline"
              >
                Clear full balance ({formatNaira(getOutstanding(selected))})
              </button>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={paying}
                className="bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold"
              >
                {paying ? "Saving..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

