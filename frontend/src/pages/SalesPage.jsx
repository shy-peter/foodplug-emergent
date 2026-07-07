import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, FileSpreadsheet, FileText, Receipt, Search } from "lucide-react";

export default function SalesPage() {
    const navigate = useNavigate();
    const [sales, setSales] = useState([]);
    const [agents, setAgents] = useState([]);
    const [branches, setBranches] = useState([]);
    const [activeTab, setActiveTab] = useState("overview");
    const [agentFilter, setAgentFilter] = useState("all");
    const [customerFilter, setCustomerFilter] = useState("all");
    const [locationFilter, setLocationFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState("today");
    const [customDate, setCustomDate] = useState(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    });
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(true);

    const fetch = async () => {
        setLoading(true);
        try {
            const salesParams = { limit: 2000 };
            if (locationFilter !== "all") {
                salesParams.location = locationFilter;
            }

            const [s, a, b] = await Promise.all([
                api.get("/sales", { params: salesParams }),
                api.get("/agents"),
                api.get("/branches"),
            ]);
            setSales(s.data);
            setAgents(a.data);
            setBranches(b.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to load sales");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetch();
    }, [locationFilter]);

    const isWithinDateFilter = (createdAt) => {
        const saleDate = new Date(createdAt);
        if (Number.isNaN(saleDate.getTime())) return false;

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfTomorrow = new Date(startOfToday);
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

        if (dateFilter === "today") {
            return saleDate >= startOfToday && saleDate < startOfTomorrow;
        }

        if (dateFilter === "yesterday") {
            const startOfYesterday = new Date(startOfToday);
            startOfYesterday.setDate(startOfYesterday.getDate() - 1);
            return saleDate >= startOfYesterday && saleDate < startOfToday;
        }

        if (dateFilter === "custom") {
            if (!customDate) return true;
            const [year, month, day] = customDate.split("-").map(Number);
            if (!year || !month || !day) return true;
            const customStart = new Date(year, month - 1, day);
            const customEnd = new Date(customStart);
            customEnd.setDate(customEnd.getDate() + 1);
            return saleDate >= customStart && saleDate < customEnd;
        }

        return true;
    };

    const filtered = useMemo(() => {
        const query = q.trim().toLowerCase();
        return sales.filter((s) => {
            if (agentFilter !== "all" && s.agent_id !== agentFilter) return false;
            if (customerFilter === "cashpay" && s.type !== "visitor") return false;
            if (customerFilter === "registered" && s.type !== "customer") return false;
            if (!isWithinDateFilter(s.created_at)) return false;
            if (!query) return true;
            return (
                s.customer_name.toLowerCase().includes(query) ||
                s.contractor.toLowerCase().includes(query) ||
                s.agent_name.toLowerCase().includes(query)
            );
        });
    }, [sales, agentFilter, customerFilter, dateFilter, customDate, q]);

    const totalRevenue = filtered.reduce((acc, s) => acc + s.amount, 0);

        const buildExportRows = () => {
                return filtered.map((s) => ({
                        customer: s.customer_name || "",
                        contractor: s.contractor || "",
                        type: s.food_type || s.type || "",
                        agent: s.agent_name || "",
                        amount: Number(s.amount || 0),
                        date: new Date(s.created_at).toLocaleString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                        }),
                }));
        };

        const toSafeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

        const exportToExcel = () => {
                const rows = buildExportRows();
                if (rows.length === 0) {
                        toast.error("No sales to export");
                        return;
                }

                const header = ["Customer", "Contractor", "Type", "Agent", "Amount", "Date"];
                const lines = [
                        header.map(toSafeCell).join(","),
                        ...rows.map((r) => [r.customer, r.contractor, r.type, r.agent, r.amount, r.date].map(toSafeCell).join(",")),
                ];

                const csv = `\ufeff${lines.join("\n")}`;
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `sales-export-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                toast.success("Excel export downloaded");
        };

        const exportToPdf = () => {
                const rows = buildExportRows();
                if (rows.length === 0) {
                        toast.error("No sales to export");
                        return;
                }

                const win = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
                if (!win) {
                        toast.error("Popup blocked. Allow popups to export PDF.");
                        return;
                }

                const tableRows = rows
                        .map(
                                (r) =>
                                        `<tr><td>${escapeHtml(r.customer)}</td><td>${escapeHtml(r.contractor)}</td><td>${escapeHtml(
                                                r.type,
                                        )}</td><td>${escapeHtml(r.agent)}</td><td style="text-align:right;">${escapeHtml(
                                                formatNaira(r.amount),
                                        )}</td><td style="text-align:right;">${escapeHtml(r.date)}</td></tr>`,
                        )
                        .join("");

                win.document.open();
                win.document.write(`
                    <!doctype html>
                    <html>
                        <head>
                            <meta charset="utf-8" />
                            <title>Sales Export</title>
                            <style>
                                body { font-family: Arial, sans-serif; padding: 20px; color: #1f2937; }
                                h1 { margin: 0 0 6px; font-size: 20px; }
                                p { margin: 0 0 12px; color: #4b5563; }
                                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                                th, td { border: 1px solid #d1d5db; padding: 8px; }
                                th { background: #f3f4f6; text-align: left; }
                                @media print { body { padding: 0; } }
                            </style>
                        </head>
                        <body>
                            <h1>Sales Details</h1>
                            <p>Exported ${new Date().toLocaleString("en-GB")} | Rows: ${rows.length}</p>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th>Contractor</th>
                                        <th>Type</th>
                                        <th>Agent</th>
                                        <th style="text-align:right;">Amount</th>
                                        <th style="text-align:right;">Date</th>
                                    </tr>
                                </thead>
                                <tbody>${tableRows}</tbody>
                            </table>
                            <script>
                                window.onload = function () { window.print(); };
                            </script>
                        </body>
                    </html>
                `);
                win.document.close();
        };

    return (
        <div className="space-y-6" data-testid="sales-page">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#5C5C59] font-bold">Ledger</p>
                    <h1 className="font-display font-black text-3xl sm:text-4xl text-[#2C423F] mt-1">
                        All sales
                    </h1>
                    <p className="text-[#5C5C59] mt-2">Every meal, every visitor sale, every naira.</p>
                </div>
                <div className="card-elevated px-5 py-3">
                    <p className="text-xs uppercase tracking-widest text-[#5C5C59]">Filtered revenue</p>
                    <p className="font-display font-black text-2xl text-[#2C423F]" data-testid="sales-total">
                        {formatNaira(totalRevenue)}
                    </p>
                </div>
            </div>

            <div className="inline-flex rounded-lg bg-white border border-[#E8E6E1] p-1">
                {[
                    { id: "overview", label: "Transactions" },
                    { id: "payment-history", label: "Payment History" },
                ].map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                            activeTab === t.id
                                ? "bg-[#2C423F] text-white"
                                : "text-[#5C5C59] hover:text-[#2C423F]"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div>
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

            {activeTab === "overview" && (
            <div className="card-elevated p-4 md:p-6">
                <div className="flex flex-col md:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5C5C59]" />
                        <Input
                            data-testid="sales-search-input"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search by customer, contractor, or agent"
                            className="pl-9 h-11 bg-white border-[#E8E6E1]"
                        />
                    </div>
                    <Select value={agentFilter} onValueChange={setAgentFilter}>
                        <SelectTrigger
                            data-testid="agent-filter"
                            className="w-full md:w-[220px] h-11 bg-white border-[#E8E6E1]"
                        >
                            <SelectValue placeholder="All agents" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All agents</SelectItem>
                            {agents.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                    {a.display_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={customerFilter} onValueChange={setCustomerFilter}>
                        <SelectTrigger className="w-full md:w-[190px] h-11 bg-white border-[#E8E6E1]">
                            <SelectValue placeholder="All customers" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All customers</SelectItem>
                            <SelectItem value="cashpay">Cash Pay</SelectItem>
                            <SelectItem value="registered">Reg users</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                        <SelectTrigger className="w-full md:w-[170px] h-11 bg-white border-[#E8E6E1]">
                            <SelectValue placeholder="Today" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                    </Select>
                    {dateFilter === "custom" && (
                        <Input
                            type="date"
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                            className="w-full md:w-[170px] h-11 bg-white border-[#E8E6E1]"
                        />
                    )}
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            onClick={exportToExcel}
                            variant="outline"
                            className="h-11 border-[#E8E6E1]"
                            data-testid="export-excel-button"
                        >
                            <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
                        </Button>
                        <Button
                            type="button"
                            onClick={exportToPdf}
                            className="h-11 bg-[#2C423F] hover:bg-[#1f302e] text-white"
                            data-testid="export-pdf-button"
                        >
                            <FileText className="w-4 h-4 mr-2" /> PDF
                        </Button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse" data-testid="sales-table">
                        <thead>
                            <tr>
                                <Th>Customer</Th>
                                <Th>Contractor</Th>
                                <Th>Type</Th>
                                <Th>Agent</Th>
                                <Th className="text-right">Amount</Th>
                                <Th className="text-right">Date</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((s) => (
                                (() => {
                                    const isVisitor = s.type === "visitor";
                                    const customerLabel = isVisitor ? "Visitor" : s.customer_name;
                                    const contractorLabel = isVisitor ? "Cash Pay" : s.contractor;
                                    return (
                                <tr key={s.id} className="hover:bg-[#F9F8F6]" data-testid={`sale-row-${s.id}`}>
                                    <Td className="font-semibold">
                                        <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                                isVisitor
                                                    ? "bg-[#E8F5E9] text-[#2E7D32]"
                                                    : "bg-[#FDECEC] text-[#B42318]"
                                            }`}
                                        >
                                            {customerLabel}
                                        </span>
                                    </Td>
                                    <Td>
                                        <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                                isVisitor
                                                    ? "bg-[#E8F5E9] text-[#2E7D32]"
                                                    : "bg-[#FDECEC] text-[#B42318]"
                                            }`}
                                        >
                                            {contractorLabel}
                                        </span>
                                    </Td>
                                    <Td>
                                        <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                                isVisitor
                                                    ? "bg-[#EDF1E4] text-[#4F7942]"
                                                    : "bg-[#F5E6D3] text-[#8A6E3F]"
                                            }`}
                                        >
                                            {s.food_type}
                                        </span>
                                    </Td>
                                    <Td>{s.agent_name}</Td>
                                    <Td className={`text-right font-display font-bold ${Number(s.amount) < 0 ? "text-[#D95D39]" : "text-[#4F7942]"}`}>{formatNaira(s.amount)}</Td>
                                    <Td className="text-right text-[#5C5C59]">
                                        {new Date(s.created_at).toLocaleString("en-GB", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                        })}
                                    </Td>
                                </tr>
                                    );
                                })()
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-10 text-[#5C5C59]">
                                        <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                        {loading ? "Loading..." : "No sales match your filters."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {activeTab === "payment-history" && <PaymentHistoryTab />}
        </div>
    );
}

function PaymentHistoryTab() {
    const navigate = useNavigate();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");

    const fetchPaymentHistory = async () => {
        setLoading(true);
        try {
            const response = await api.get("/payment-history", { params: { limit: 5000 } });
            const sortedPayments = (response.data || []).sort(
                (a, b) => new Date(b.created_at) - new Date(a.created_at)
            );
            setPayments(sortedPayments);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to load payment history");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPaymentHistory();
    }, []);

    const filtered = useMemo(() => {
        const query = q.trim().toLowerCase();
        if (!query) return payments;
        return payments.filter(
            (p) =>
                p.customer_name.toLowerCase().includes(query) ||
                p.contractor.toLowerCase().includes(query) ||
                (p.initiated_by_name && p.initiated_by_name.toLowerCase().includes(query)),
        );
    }, [payments, q]);

    return (
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

            {loading ? (
                <p className="text-center py-10 text-[#5C5C59]">Loading...</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <Th>Customer</Th>
                                <Th>Contractor</Th>
                                <Th className="text-right">Amount Paid</Th>
                                <Th>Initiated By</Th>
                                <Th className="text-right">When</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p) => (
                                <tr
                                    key={p.$id}
                                    onClick={() => navigate(`/admin/customers/${p.customer_id}`)}
                                    className="hover:bg-[#F9F8F6] transition-colors cursor-pointer"
                                >
                                    <Td className="font-semibold">{p.customer_name}</Td>
                                    <Td>{p.contractor}</Td>
                                    <Td className="text-right font-display font-bold text-[#4F7942]">
                                        {formatNaira(p.amount)}
                                    </Td>
                                    <Td className="text-sm text-[#2C423F]">{p.initiated_by_name}</Td>
                                    <Td className="text-right text-[#5C5C59] text-sm">
                                        {new Date(p.created_at).toLocaleString("en-GB", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true,
                                            day: "2-digit",
                                            month: "short",
                                            year: "numeric",
                                        })}
                                    </Td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="text-center py-10 text-[#5C5C59]"
                                    >
                                        {q ? "No payments found." : "No payments recorded yet."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
