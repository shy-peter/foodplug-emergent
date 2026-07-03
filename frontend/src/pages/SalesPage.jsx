import { useEffect, useMemo, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Receipt, Search } from "lucide-react";

export default function SalesPage() {
    const [sales, setSales] = useState([]);
    const [agents, setAgents] = useState([]);
    const [agentFilter, setAgentFilter] = useState("all");
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(true);

    const fetch = async () => {
        setLoading(true);
        try {
            const [s, a] = await Promise.all([
                api.get("/sales", { params: { limit: 2000 } }),
                api.get("/agents"),
            ]);
            setSales(s.data);
            setAgents(a.data);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to load sales");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetch();
    }, []);

    const filtered = useMemo(() => {
        const query = q.trim().toLowerCase();
        return sales.filter((s) => {
            if (agentFilter !== "all" && s.agent_id !== agentFilter) return false;
            if (!query) return true;
            return (
                s.customer_name.toLowerCase().includes(query) ||
                s.contractor.toLowerCase().includes(query) ||
                s.agent_name.toLowerCase().includes(query)
            );
        });
    }, [sales, agentFilter, q]);

    const totalRevenue = filtered.reduce((acc, s) => acc + s.amount, 0);

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
                                    <Td className="text-right font-display font-bold">{formatNaira(s.amount)}</Td>
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
