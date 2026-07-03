import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Area,
    AreaChart,
} from "recharts";

export default function DashboardPage() {
    const [period, setPeriod] = useState("day");
    const [month, setMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const [stats, setStats] = useState(null);
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);

    const monthOptions = useMemo(() => {
        const opts = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
            opts.push({ value: val, label });
        }
        return opts;
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const params = { period };
            if (period === "month") params.month = month;
            const [s, l] = await Promise.all([
                api.get("/stats", { params }),
                api.get("/sales", { params: { limit: 10 } }),
            ]);
            setStats(s.data);
            setSales(l.data);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to load dashboard");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, month]);

    const chartData = stats?.chart || [];

    return (
        <div className="space-y-8" data-testid="admin-dashboard">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#5C5C59] font-bold">Overview</p>
                    <h1 className="font-display font-black text-3xl sm:text-4xl text-[#2C423F] mt-1">
                        Control Room
                    </h1>
                    <p className="text-[#5C5C59] mt-2 max-w-xl">
                        Live view of revenue, workers served, and sales activity across every site.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded-lg bg-white border border-[#E8E6E1] p-1">
                        {[
                            { id: "day", label: "Today" },
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
            </div>

            {/* KPI Bento */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <KpiCard
                    testid="kpi-revenue"
                    label="Revenue"
                    value={formatNaira(stats?.total_revenue)}
                    icon={Wallet}
                    accent="#D95D39"
                    highlight
                    subtitle={`${stats?.total_sales ?? 0} sales`}
                />
                <KpiCard
                    testid="kpi-customers"
                    label="Total customers"
                    value={stats?.total_customers ?? 0}
                    icon={Users}
                    accent="#8A9A5B"
                    subtitle={`${stats?.unique_customers_served ?? 0} served`}
                />
                <KpiCard
                    testid="kpi-agents"
                    label="Sales reps"
                    value={stats?.total_agents ?? 0}
                    icon={UserCog}
                    accent="#D4A373"
                    subtitle="Active team"
                />
                <KpiCard
                    testid="kpi-visitors"
                    label="Visitor sales"
                    value={stats?.visitor_sales_count ?? 0}
                    icon={UserPlus}
                    accent="#2C423F"
                    subtitle={formatNaira(stats?.visitor_revenue)}
                />
            </div>

            {/* Chart + Top customers */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                <div className="lg:col-span-2 card-elevated p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Revenue trend</p>
                            <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1">
                                Sales activity
                            </h3>
                        </div>
                        <div className="flex items-center gap-2 text-[#4F7942] text-sm font-semibold">
                            <TrendingUp className="w-4 h-4" />
                            {chartData.length} days
                        </div>
                    </div>

                    <div className="h-64" data-testid="revenue-chart">
                        {chartData.length === 0 && !loading ? (
                            <EmptyChart />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#D95D39" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#D95D39" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="#E8E6E1" strokeDasharray="3 3" vertical={false} />
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

                <div className="card-elevated p-6">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Top customers</p>
                    <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1 mb-4">Big spenders</h3>

                    {stats?.top_customers?.length ? (
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
                                            <p className="font-semibold text-[#2C423F] truncate">{c.customer_name}</p>
                                            <p className="text-xs text-[#5C5C59] truncate">{c.contractor}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-display font-bold text-[#2C423F]">{formatNaira(c.revenue)}</p>
                                        <p className="text-xs text-[#5C5C59]">{c.meals} meals</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-[#5C5C59]">No sales yet for this period.</p>
                    )}
                </div>
            </div>

            {/* Recent sales */}
            <div className="card-elevated p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Latest</p>
                        <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1">Recent sales</h3>
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
                        <table className="w-full text-left border-collapse" data-testid="recent-sales-table">
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
                                {sales.map((s) => (
                                    <tr key={s.id} className="hover:bg-[#F9F8F6] transition-colors">
                                        <Td className="font-semibold">{s.customer_name}</Td>
                                        <Td>{s.contractor}</Td>
                                        <Td>
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                                    s.type === "visitor"
                                                        ? "bg-[#F5E6D3] text-[#8A6E3F]"
                                                        : "bg-[#EDF1E4] text-[#4F7942]"
                                                }`}
                                            >
                                                {s.food_type}
                                            </span>
                                        </Td>
                                        <Td>{s.agent_name}</Td>
                                        <Td className="text-right font-display font-bold">{formatNaira(s.amount)}</Td>
                                        <Td className="text-right text-[#5C5C59]">
                                            {new Date(s.created_at).toLocaleString("en-GB", {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                                day: "2-digit",
                                                month: "short",
                                            })}
                                        </Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function KpiCard({ label, value, icon: Icon, accent, subtitle, highlight, testid }) {
    return (
        <div
            data-testid={testid}
            className={`card-elevated p-6 relative overflow-hidden animate-fade-in-up ${
                highlight ? "ring-1 ring-[#D95D39]/20" : ""
            }`}
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">{label}</p>
                    <p className="font-display font-black text-3xl text-[#2C423F] mt-3">{value}</p>
                    {subtitle && <p className="text-sm text-[#5C5C59] mt-1">{subtitle}</p>}
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
                    style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)` }}
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
    return <td className={`py-3 border-b border-[#E8E6E1] text-sm text-[#2C423F] ${className}`}>{children}</td>;
}

function EmptyChart() {
    return (
        <div className="h-full flex flex-col items-center justify-center text-[#5C5C59]">
            <TrendingUp className="w-8 h-8 opacity-40 mb-2" />
            <p className="text-sm">No sales data for this period yet.</p>
        </div>
    );
}
