import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Plus, Copy, User } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";

export default function CustomersPage() {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState([]);
    const [salesByCustomer, setSalesByCustomer] = useState({});
    const [q, setQ] = useState("");
    const [balanceFilter, setBalanceFilter] = useState("all");
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [contractor, setContractor] = useState("");
    const [creating, setCreating] = useState(false);
    const [lastPin, setLastPin] = useState("");

    const fetchData = async () => {
        try {
            const [c, s] = await Promise.all([api.get("/customers"), api.get("/sales", { params: { limit: 5000 } })]);
            setCustomers(c.data);
            const map = {};
            for (const sale of s.data) {
                if (!sale.customer_id) continue;
                if (!map[sale.customer_id]) map[sale.customer_id] = { meals: 0, revenue: 0 };
                map[sale.customer_id].meals += 1;
                map[sale.customer_id].revenue += Math.abs(Number(sale.amount || 0));
            }
            setSalesByCustomer(map);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to load customers");
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filtered = useMemo(() => {
        const query = q.trim().toLowerCase();
        return customers.filter((c) => {
            if (query && !(
                c.name.toLowerCase().includes(query) ||
                c.contractor.toLowerCase().includes(query) ||
                c.pin.includes(query)
            )) return false;
            if (balanceFilter !== "all") {
                const s = salesByCustomer[c.id] || { revenue: 0 };
                const outstanding = Math.max(0, s.revenue - (Number(c.balance_credited) || 0));
                if (balanceFilter === "owing" && outstanding === 0) return false;
                if (balanceFilter === "cleared" && outstanding > 0) return false;
            }
            return true;
        });
    }, [customers, q, balanceFilter, salesByCustomer]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!name.trim() || !contractor.trim()) {
            toast.error("Please provide name and contractor");
            return;
        }
        setCreating(true);
        try {
            const res = await api.post("/customers", { name: name.trim(), contractor: contractor.trim() });
            setCustomers((prev) => [res.data, ...prev]);
            setLastPin(res.data.pin);
            setName("");
            setContractor("");
            toast.success(`Created ${res.data.name}. PIN: ${res.data.pin}`);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to create customer");
        } finally {
            setCreating(false);
        }
    };

    const copyPin = (pin) => {
        navigator.clipboard?.writeText(pin);
        toast.success(`PIN ${pin} copied`);
    };

    return (
        <div className="space-y-6" data-testid="customers-page">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#5C5C59] font-bold">Directory</p>
                    <h1 className="font-display font-black text-3xl sm:text-4xl text-[#2C423F] mt-1">Customers</h1>
                    <p className="text-[#5C5C59] mt-2">Register construction workers to enable PIN-based POS.</p>
                </div>

                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button
                            data-testid="add-customer-button"
                            className="bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold h-11 px-5"
                        >
                            <Plus className="w-4 h-4 mr-2" /> Add customer
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-white">
                        <DialogHeader>
                            <DialogTitle className="font-display font-bold text-2xl text-[#2C423F]">
                                Add customer
                            </DialogTitle>
                            <DialogDescription>
                                A unique 4-digit PIN is generated automatically for POS lookup.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="c-name">Full name</Label>
                                <Input
                                    id="c-name"
                                    data-testid="customer-name-input"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Amaka Okoro"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="c-contractor">Contractor</Label>
                                <Input
                                    id="c-contractor"
                                    data-testid="customer-contractor-input"
                                    value={contractor}
                                    onChange={(e) => setContractor(e.target.value)}
                                    placeholder="e.g. Nile Constructions"
                                    required
                                />
                            </div>
                            {lastPin && (
                                <div className="bg-[#F9F1EE] border border-[#D95D39]/20 rounded-lg p-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs uppercase tracking-widest text-[#5C5C59]">Last generated PIN</p>
                                        <p className="font-display font-black text-2xl text-[#D95D39]">{lastPin}</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => copyPin(lastPin)}
                                        className="border-[#D95D39]/30"
                                    >
                                        <Copy className="w-4 h-4 mr-1" /> Copy
                                    </Button>
                                </div>
                            )}
                            <DialogFooter>
                                <Button
                                    type="submit"
                                    disabled={creating}
                                    data-testid="submit-customer-button"
                                    className="bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold"
                                >
                                    {creating ? "Creating..." : "Create customer"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="card-elevated p-4 md:p-6">
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5C5C59]" />
                        <Input
                            data-testid="customer-search-input"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search by name, contractor, or PIN"
                            className="pl-9 h-11 bg-white border-[#E8E6E1]"
                        />
                    </div>
                    <div className="inline-flex rounded-lg bg-white border border-[#E8E6E1] p-1 shrink-0">
                        {[
                            { id: "all", label: "All" },
                            { id: "owing", label: "Owing" },
                            { id: "cleared", label: "Cleared" },
                        ].map((f) => (
                            <button
                                key={f.id}
                                onClick={() => setBalanceFilter(f.id)}
                                className={`px-3 py-1.5 rounded-md text-sm font-bold transition-colors ${
                                    balanceFilter === f.id
                                        ? f.id === "owing"
                                            ? "bg-[#D95D39] text-white"
                                            : f.id === "cleared"
                                            ? "bg-[#4F7942] text-white"
                                            : "bg-[#2C423F] text-white"
                                        : "text-[#5C5C59] hover:text-[#2C423F]"
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse" data-testid="customers-table">
                        <thead>
                            <tr>
                                <Th>Name</Th>
                                <Th>Contractor</Th>
                                <Th>PIN</Th>
                                <Th className="text-right">Meals</Th>
                                <Th className="text-right">Balance</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((c) => {
                                const s = salesByCustomer[c.id] || { meals: 0, revenue: 0 };
                                const paid = Number(c.balance_credited) || 0;
                                const outstanding = Math.max(0, s.revenue - paid);
                                return (
                                    <tr
                                        key={c.id}
                                        onClick={() => navigate(`/admin/customers/${c.id}`)}
                                        className="hover:bg-[#F9F8F6] cursor-pointer transition-colors"
                                        data-testid={`customer-row-${c.id}`}
                                    >
                                        <Td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-[#F9F1EE] text-[#D95D39] flex items-center justify-center">
                                                    <User className="w-4 h-4" />
                                                </div>
                                                <span className="font-semibold text-[#2C423F]">{c.name}</span>
                                            </div>
                                        </Td>
                                        <Td>{c.contractor}</Td>
                                        <Td>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyPin(c.pin);
                                                }}
                                                className="font-mono font-bold text-[#D95D39] hover:underline"
                                                data-testid={`copy-pin-${c.pin}`}
                                            >
                                                {c.pin}
                                            </button>
                                        </Td>
                                        <Td className="text-right">{s.meals}</Td>
                                        <Td className="text-right font-display font-bold">
                                            <span className={outstanding > 0 ? "text-[#D95D39]" : "text-[#4F7942]"}>
                                                {formatNaira(outstanding)}
                                            </span>
                                        </Td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-[#5C5C59]">
                                        No customers match your search.
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
