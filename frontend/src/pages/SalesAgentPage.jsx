import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Utensils,
    LogOut,
    Search,
    UserRound,
    KeyRound,
    UserPlus,
    ArrowLeft,
    Delete,
} from "lucide-react";

export default function SalesAgentPage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [mode, setMode] = useState("name"); // name | pin | visitor
    const [customers, setCustomers] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selected, setSelected] = useState(null);
    const [history, setHistory] = useState(null);
    const [foodType, setFoodType] = useState("");
    const [amount, setAmount] = useState("");
    const [visitorForm, setVisitorForm] = useState({ name: "", contractor: "", amount: "" });

    const loadCustomers = async () => {
        try {
            const res = await api.get("/customers");
            setCustomers(res.data);
        } catch (e) {
            toast.error("Failed to load customers");
        }
    };

    useEffect(() => {
        loadCustomers();
    }, []);

    const filtered = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return [];
        return customers.filter(
            (c) => c.name.toLowerCase().includes(q) || c.contractor.toLowerCase().includes(q),
        );
    }, [customers, searchTerm]);

    const selectCustomer = async (c) => {
        setSelected(c);
        setFoodType("");
        setAmount("");
        try {
            const res = await api.get(`/customers/${c.id}/history`);
            setHistory(res.data);
        } catch (e) {
            toast.error("Failed to load history");
        }
    };

    const backToSearch = () => {
        setSelected(null);
        setHistory(null);
        setFoodType("");
        setAmount("");
        setSearchTerm("");
    };

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    const handlePinConfirm = async () => {
        if (searchTerm.length < 4) {
            toast.error("Enter the customer's PIN");
            return;
        }
        const c = customers.find((c) => c.pin === searchTerm.trim());
        if (!c) {
            toast.error("No customer found with that PIN");
            return;
        }
        selectCustomer(c);
    };

    const registerSale = async () => {
        if (!selected) return;
        if (!foodType) {
            toast.error("Choose soft or hard food");
            return;
        }
        const price = Number(amount);
        if (!price || price < 100 || price > 20000) {
            toast.error("Amount must be between ₦100 and ₦20,000");
            return;
        }
        try {
            await api.post("/sales", {
                type: "customer",
                customer_id: selected.id,
                food_type: foodType,
                amount: price,
            });
            toast.success(`Sold ${foodType} food for ${formatNaira(price)}`);
            setAmount("");
            setFoodType("");
            const res = await api.get(`/customers/${selected.id}/history`);
            setHistory(res.data);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Sale failed");
        }
    };

    const registerVisitor = async () => {
        const { name, contractor, amount: amt } = visitorForm;
        if (!name.trim() || !contractor.trim()) {
            toast.error("Enter visitor name and contractor");
            return;
        }
        const price = Number(amt);
        if (!price || price < 100 || price > 20000) {
            toast.error("Amount must be between ₦100 and ₦20,000");
            return;
        }
        try {
            await api.post("/sales", {
                type: "visitor",
                customer_name: name.trim(),
                contractor: contractor.trim(),
                food_type: "visitor",
                amount: price,
            });
            toast.success(`Visitor sale recorded — ${formatNaira(price)}`);
            setVisitorForm({ name: "", contractor: "", amount: "" });
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Sale failed");
        }
    };

    return (
        <div className="min-h-screen bg-[#F9F8F6]">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-[#E8E6E1]">
                <div className="max-w-4xl mx-auto flex items-center justify-between px-4 h-14">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#D95D39] flex items-center justify-center text-white">
                            <Utensils className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="font-display font-black text-[#2C423F] leading-none">FoodPlug POS</p>
                            <p className="text-xs text-[#5C5C59]">{user?.display_name}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        data-testid="sales-logout-button"
                        className="text-sm font-semibold text-[#2C423F] flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-[#F9F8F6]"
                    >
                        <LogOut className="w-4 h-4" /> Logout
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6 pb-24">
                {!selected && (
                    <>
                        <div className="mb-6">
                            <p className="text-xs uppercase tracking-[0.3em] text-[#5C5C59] font-bold">Point of sale</p>
                            <h1 className="font-display font-black text-3xl text-[#2C423F] mt-1">
                                Register a meal
                            </h1>
                        </div>

                        {/* Mode tabs */}
                        <div className="grid grid-cols-3 gap-2 mb-6" data-testid="mode-tabs">
                            <ModeButton
                                active={mode === "name"}
                                onClick={() => {
                                    setMode("name");
                                    setSearchTerm("");
                                }}
                                icon={UserRound}
                                label="By name"
                                testid="mode-name"
                            />
                            <ModeButton
                                active={mode === "pin"}
                                onClick={() => {
                                    setMode("pin");
                                    setSearchTerm("");
                                }}
                                icon={KeyRound}
                                label="By PIN"
                                testid="mode-pin"
                            />
                            <ModeButton
                                active={mode === "visitor"}
                                onClick={() => setMode("visitor")}
                                icon={UserPlus}
                                label="Visitor"
                                testid="mode-visitor"
                            />
                        </div>

                        {mode === "name" && (
                            <div className="card-elevated p-4 md:p-6">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5C5C59]" />
                                    <Input
                                        data-testid="search-name-input"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search customer by name or contractor"
                                        className="pl-9 h-12 bg-white border-[#E8E6E1]"
                                    />
                                </div>

                                {searchTerm && (
                                    <div className="mt-4 space-y-2">
                                        {filtered.length === 0 && (
                                            <p className="text-sm text-[#5C5C59] py-4 text-center">
                                                No matching customers.
                                            </p>
                                        )}
                                        {filtered.slice(0, 20).map((c) => (
                                            <button
                                                key={c.id}
                                                onClick={() => selectCustomer(c)}
                                                data-testid={`select-customer-${c.id}`}
                                                className="w-full flex items-center justify-between p-3 rounded-lg border border-[#E8E6E1] hover:border-[#D95D39] hover:bg-[#F9F1EE] transition-colors"
                                            >
                                                <div className="text-left">
                                                    <p className="font-semibold text-[#2C423F]">{c.name}</p>
                                                    <p className="text-xs text-[#5C5C59]">{c.contractor}</p>
                                                </div>
                                                <span className="font-mono font-bold text-[#D95D39]">
                                                    PIN {c.pin}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {mode === "pin" && (
                            <div className="card-elevated p-6" data-testid="pin-pad">
                                <div className="text-center">
                                    <p className="text-xs uppercase tracking-widest text-[#5C5C59]">Enter customer PIN</p>
                                    <div className="mt-3 text-3xl font-display font-black text-[#2C423F] h-12 flex items-center justify-center tracking-[0.5em]">
                                        {searchTerm ? "•".repeat(searchTerm.length) : "____"}
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3 mt-6 max-w-xs mx-auto">
                                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                                        <PinKey
                                            key={d}
                                            onClick={() =>
                                                setSearchTerm((s) => (s.length < 6 ? s + d : s))
                                            }
                                            label={d}
                                        />
                                    ))}
                                    <PinKey onClick={() => setSearchTerm("")} label="C" muted />
                                    <PinKey
                                        onClick={() =>
                                            setSearchTerm((s) => (s.length < 6 ? s + "0" : s))
                                        }
                                        label="0"
                                    />
                                    <PinKey
                                        onClick={() => setSearchTerm((s) => s.slice(0, -1))}
                                        icon={Delete}
                                        muted
                                    />
                                </div>
                                <div className="mt-6 max-w-xs mx-auto">
                                    <Button
                                        data-testid="pin-confirm-button"
                                        onClick={handlePinConfirm}
                                        className="w-full h-12 bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold"
                                    >
                                        Confirm PIN
                                    </Button>
                                </div>
                            </div>
                        )}

                        {mode === "visitor" && (
                            <div className="card-elevated p-6 space-y-4" data-testid="visitor-form">
                                <p className="text-sm text-[#5C5C59]">
                                    Record a one-off sale for an unregistered customer.
                                </p>
                                <div className="space-y-2">
                                    <Label>Visitor name</Label>
                                    <Input
                                        data-testid="visitor-name-input"
                                        value={visitorForm.name}
                                        onChange={(e) => setVisitorForm({ ...visitorForm, name: e.target.value })}
                                        placeholder="e.g. Musa Ibrahim"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Contractor / site</Label>
                                    <Input
                                        data-testid="visitor-contractor-input"
                                        value={visitorForm.contractor}
                                        onChange={(e) =>
                                            setVisitorForm({ ...visitorForm, contractor: e.target.value })
                                        }
                                        placeholder="e.g. Skyline Builders"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Amount (₦)</Label>
                                    <Input
                                        data-testid="visitor-amount-input"
                                        type="number"
                                        value={visitorForm.amount}
                                        onChange={(e) =>
                                            setVisitorForm({ ...visitorForm, amount: e.target.value })
                                        }
                                        placeholder="e.g. 1500"
                                    />
                                </div>
                                <Button
                                    data-testid="record-visitor-button"
                                    onClick={registerVisitor}
                                    className="w-full h-12 bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold"
                                >
                                    Record visitor sale
                                </Button>
                            </div>
                        )}
                    </>
                )}

                {selected && (
                    <div className="animate-fade-in-up">
                        <button
                            onClick={backToSearch}
                            data-testid="back-to-search-button"
                            className="flex items-center gap-2 text-sm font-semibold text-[#5C5C59] hover:text-[#2C423F] mb-4"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to search
                        </button>

                        <div className="card-elevated p-6">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-widest text-[#5C5C59]">Customer</p>
                                    <h2 className="font-display font-black text-2xl text-[#2C423F] mt-1">
                                        {selected.name}
                                    </h2>
                                    <p className="text-sm text-[#5C5C59]">{selected.contractor}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs uppercase tracking-widest text-[#5C5C59]">PIN</p>
                                    <p className="font-mono font-black text-2xl text-[#D95D39]">{selected.pin}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-6">
                                <div className="p-4 rounded-lg bg-[#F9F8F6] border border-[#E8E6E1]">
                                    <p className="text-xs uppercase tracking-widest text-[#5C5C59]">Meals</p>
                                    <p
                                        className="font-display font-black text-2xl text-[#2C423F] mt-1"
                                        data-testid="customer-total-meals"
                                    >
                                        {history?.total_meals ?? 0}
                                    </p>
                                </div>
                                <div className="p-4 rounded-lg bg-[#F9F8F6] border border-[#E8E6E1]">
                                    <p className="text-xs uppercase tracking-widest text-[#5C5C59]">Spent</p>
                                    <p
                                        className="font-display font-black text-2xl text-[#2C423F] mt-1"
                                        data-testid="customer-total-cost"
                                    >
                                        {formatNaira(history?.total_cost ?? 0)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="card-elevated p-6 mt-4">
                            <p className="text-xs uppercase tracking-widest text-[#5C5C59] font-bold">Register meal</p>
                            <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1">Choose food type</h3>
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <button
                                    onClick={() => setFoodType("soft")}
                                    data-testid="food-type-soft"
                                    className={`p-4 rounded-lg border-2 font-bold transition-colors ${
                                        foodType === "soft"
                                            ? "border-[#D95D39] bg-[#F9F1EE] text-[#D95D39]"
                                            : "border-[#E8E6E1] text-[#2C423F] hover:border-[#D95D39]/50"
                                    }`}
                                >
                                    Soft food
                                </button>
                                <button
                                    onClick={() => setFoodType("hard")}
                                    data-testid="food-type-hard"
                                    className={`p-4 rounded-lg border-2 font-bold transition-colors ${
                                        foodType === "hard"
                                            ? "border-[#D95D39] bg-[#F9F1EE] text-[#D95D39]"
                                            : "border-[#E8E6E1] text-[#2C423F] hover:border-[#D95D39]/50"
                                    }`}
                                >
                                    Hard food
                                </button>
                            </div>

                            <div className="mt-4">
                                <Label>Amount (₦)</Label>
                                <Input
                                    data-testid="sale-amount-input"
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="e.g. 1500"
                                    className="h-12"
                                />
                            </div>

                            <Button
                                data-testid="confirm-sale-button"
                                onClick={registerSale}
                                className="w-full h-12 bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold mt-4"
                            >
                                Confirm sale
                            </Button>
                        </div>

                        {history?.sales?.length > 0 && (
                            <div className="card-elevated p-6 mt-4">
                                <p className="text-xs uppercase tracking-widest text-[#5C5C59] font-bold">Recent activity</p>
                                <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1 mb-3">Food history</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold pb-2">
                                                    Date
                                                </th>
                                                <th className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold pb-2">
                                                    Type
                                                </th>
                                                <th className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold pb-2 text-right">
                                                    Amount
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.sales.slice(0, 10).map((s) => (
                                                <tr key={s.id} className="border-b border-[#E8E6E1]">
                                                    <td className="py-2 text-sm text-[#2C423F]">
                                                        {new Date(s.created_at).toLocaleDateString("en-GB", {
                                                            day: "2-digit",
                                                            month: "short",
                                                        })}
                                                    </td>
                                                    <td className="py-2 text-sm text-[#2C423F] capitalize">
                                                        {s.food_type}
                                                    </td>
                                                    <td className="py-2 text-sm text-[#2C423F] text-right font-semibold">
                                                        {formatNaira(s.amount)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}

function ModeButton({ active, onClick, icon: Icon, label, testid }) {
    return (
        <button
            onClick={onClick}
            data-testid={testid}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors ${
                active
                    ? "border-[#D95D39] bg-[#F9F1EE] text-[#D95D39]"
                    : "border-[#E8E6E1] text-[#5C5C59] hover:border-[#D95D39]/50"
            }`}
        >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
        </button>
    );
}

function PinKey({ onClick, label, icon: Icon, muted }) {
    return (
        <button
            onClick={onClick}
            className={`h-14 rounded-lg font-display font-bold text-xl border transition-colors ${
                muted
                    ? "border-[#E8E6E1] bg-white text-[#5C5C59] hover:bg-[#F9F8F6]"
                    : "border-[#E8E6E1] bg-white text-[#2C423F] hover:bg-[#F9F1EE] hover:border-[#D95D39]"
            }`}
        >
            {Icon ? <Icon className="w-5 h-5 mx-auto" /> : label}
        </button>
    );
}
