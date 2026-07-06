import { useEffect, useMemo, useState } from "react";
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
    const [sales, setSales] = useState([]);
    const [agents, setAgents] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [agentFilter, setAgentFilter] = useState("all");
    const [owingOnly, setOwingOnly] = useState(false);
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(true);

    const fetch = async () => {
        setLoading(true);
        try {
            const [s, a, c] = await Promise.all([
                api.get("/sales", { params: { limit: 2000 } }),
                api.get("/agents"),
                api.get("/customers"),
            ]);
            setSales(s.data);
            setAgents(a.data);
            setCustomers(c.data);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to load sales");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetch();
    }, []);

    // Build a map of customers with outstanding balance
    const customersWithOutstanding = useMemo(() => {
        const map = {};
        for (const customer of customers) {
            // Calculate total owed by this customer from sales
            const totalOwed = sales
                .filter((s) => s.customer_id === customer.id && s.type === "customer")
                .reduce((sum, s) => sum + Math.abs(Number(s.amount || 0)), 0);
            const paid = Number(customer.balance_credited || 0);
            const outstanding = Math.max(0, totalOwed - paid);
            map[customer.id] = outstanding > 0;
        }
        return map;
    }, [customers, sales]);

    const filtered = useMemo(() => {
        const query = q.trim().toLowerCase();
        return sales.filter((s) => {
            if (agentFilter !== "all" && s.agent_id !== agentFilter) return false;
            if (owingOnly && s.type === "customer" && !customersWithOutstanding[s.customer_id]) return false;
            if (!query) return true;
            return (
                s.customer_name.toLowerCase().includes(query) ||
                s.contractor.toLowerCase().includes(query) ||
                s.agent_name.toLowerCase().includes(query)
            );
        });
    }, [sales, agentFilter, q, owingOnly, customersWithOutstanding]);

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
                    <button
                        onClick={() => setOwingOnly(!owingOnly)}
                        className={`px-4 h-11 rounded-lg text-sm font-bold transition-colors ${
                            owingOnly
                                ? "bg-[#D95D39] text-white"
                                : "bg-white border border-[#E8E6E1] text-[#5C5C59] hover:text-[#2C423F]"
                        }`}
                    >
                        {owingOnly ? "✓ Owing Only" : "All Customers"}
                    </button>
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
                                <tr key={s.id} className="hover:bg-[#F9F8F6]" data-testid={`sale-row-${s.id}`}>
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
