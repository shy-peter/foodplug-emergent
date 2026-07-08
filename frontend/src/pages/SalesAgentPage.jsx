import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LogOut,
  Search,
  UserRound,
  KeyRound,
  Fingerprint,
  UserPlus,
  ArrowLeft,
  Delete,
} from "lucide-react";

export default function SalesAgentPage() {
  const VISITOR_PROFILE_ID = "__visitors__";
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("name"); // name | pin | fingerprint | visitor
  const [customers, setCustomers] = useState([]);
  const [myMealsServed, setMyMealsServed] = useState(0);
  const [customersAttended, setCustomersAttended] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const [statsFilter, setStatsFilter] = useState("today");
  const [selectedDay, setSelectedDay] = useState(() =>
    toLocalDateKey(new Date()),
  );
  const [selectedMonth, setSelectedMonth] = useState(() =>
    toLocalMonthKey(new Date()),
  );
  const [foodType, setFoodType] = useState("");
  const [foodTypeError, setFoodTypeError] = useState("");
  const [amount, setAmount] = useState("");
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [saleFlashActive, setSaleFlashActive] = useState(false);
  const [saleErrorFlashActive, setSaleErrorFlashActive] = useState(false);
  const flashTimeoutRef = useRef(null);
  const errorFlashTimeoutRef = useRef(null);

  const triggerSaleFlash = () => {
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    setSaleFlashActive(false);
    requestAnimationFrame(() => {
      setSaleFlashActive(true);
      flashTimeoutRef.current = setTimeout(() => {
        setSaleFlashActive(false);
        flashTimeoutRef.current = null;
      }, 520);
    });
  };

  const triggerSaleErrorFlash = () => {
    if (errorFlashTimeoutRef.current) {
      clearTimeout(errorFlashTimeoutRef.current);
    }
    setSaleErrorFlashActive(false);
    requestAnimationFrame(() => {
      setSaleErrorFlashActive(true);
      errorFlashTimeoutRef.current = setTimeout(() => {
        setSaleErrorFlashActive(false);
        errorFlashTimeoutRef.current = null;
      }, 560);
    });
  };

  const getCustomersAttendedCount = (sales) =>
    new Set(
      sales
        .filter(
          (sale) =>
            sale.type === "customer" &&
            String(sale.customer_id || "").trim().length > 0,
        )
        .map((sale) => String(sale.customer_id)),
    ).size;

  const loadCustomers = async () => {
    try {
      const res = await api.get("/customers");
      const filteredCustomers = (
        Array.isArray(res.data) ? res.data : []
      ).filter((c) => String(c.pin || "").trim() !== "0000");
      setCustomers(filteredCustomers);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load customers");
    }
  };

  const loadVisitorProfile = async () => {
    try {
      const res = await api.get("/sales");
      const visitorSales = (Array.isArray(res.data) ? res.data : []).filter(
        (sale) => sale.type === "visitor",
      );

      setSelected({
        id: VISITOR_PROFILE_ID,
        name: "Visitor",
        contractor: "Visitor profile",
        pin: "-",
      });
      setHistory({
        sales: visitorSales,
        total_meals: visitorSales.length,
        total_cost: visitorSales.reduce(
          (sum, sale) => sum + Number(sale.amount || 0),
          0,
        ),
      });
      setFoodType("");
      setAmount("");
      setMode("visitor");
    } catch {
      toast.error("Failed to load visitor profile");
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadMySalesMetrics = async () => {
    if (!user?.id) return;
    try {
      const res = await api.get("/sales", {
        params: { agent_id: user.id },
      });
      const sales = Array.isArray(res.data) ? res.data : [];
      setMyMealsServed(sales.length);
      setCustomersAttended(getCustomersAttendedCount(sales));
    } catch {
      // Keep UI usable even if this metric fails to load.
    }
  };

  useEffect(() => {
    loadMySalesMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
      if (errorFlashTimeoutRef.current) {
        clearTimeout(errorFlashTimeoutRef.current);
      }
    };
  }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.contractor.toLowerCase().includes(q),
    );
  }, [customers, searchTerm]);

  const filteredSales = useMemo(() => {
    const sales = Array.isArray(history?.sales) ? history.sales : [];
    return sales.filter((sale) =>
      matchesPeriod(sale.created_at, statsFilter, selectedDay, selectedMonth),
    );
  }, [history, selectedDay, selectedMonth, statsFilter]);

  const visibleSales = useMemo(() => {
    if (showAllTransactions) return filteredSales;
    return filteredSales.slice(0, 3);
  }, [filteredSales, showAllTransactions]);

  useEffect(() => {
    setShowAllTransactions(false);
  }, [selected?.id, statsFilter, selectedDay, selectedMonth]);

  const selectCustomer = async (c) => {
    setSelected(c);
    setStatsFilter("today");
    setSelectedDay(toLocalDateKey(new Date()));
    setSelectedMonth(toLocalMonthKey(new Date()));
    setFoodType("");
    setFoodTypeError("");
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
    setStatsFilter("today");
    setSelectedDay(toLocalDateKey(new Date()));
    setSelectedMonth(toLocalMonthKey(new Date()));
    setFoodType("");
    setFoodTypeError("");
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

  const handleFingerprintConfirm = async () => {
    const fingerprintCode = searchTerm.trim();
    if (fingerprintCode.length < 4) {
      toast.error("Place finger and enter fingerprint code");
      return;
    }

    // Current implementation maps fingerprint code to the customer's PIN.
    const c = customers.find(
      (customer) => String(customer.pin || "").trim() === fingerprintCode,
    );
    if (!c) {
      toast.error("Fingerprint not recognized");
      return;
    }

    await selectCustomer(c);
  };

  const handleVisitorMode = async () => {
    await loadVisitorProfile();
  };

  const registerSale = async () => {
    if (saleSubmitting) return;
    if (!selected) return;
    if (!foodType) {
      setFoodTypeError("Choose food type before confirming sale");
      toast.error("Choose soft or hard food");
      return;
    }
    setFoodTypeError("");
    const price = Number(amount);
    if (!price || price < 100 || price > 10000) {
      toast.error("Amount must be between ₦100 and ₦10,000");
      return;
    }
    setSaleSubmitting(true);
    try {
      await api.post("/sales", {
        type: "customer",
        customer_id: selected.id,
        food_type: foodType,
        amount: price,
      });
      triggerSaleFlash();
      toast.success(`Sold ${foodType} food for ${formatNaira(price)}`);
      setAmount("");
      setFoodType("");
      const res = await api.get(`/customers/${selected.id}/history`);
      setHistory(res.data);
      await loadMySalesMetrics();
    } catch (e) {
      triggerSaleErrorFlash();
      toast.error(e?.response?.data?.detail || "Sale failed");
    } finally {
      setSaleSubmitting(false);
    }
  };

  const registerVisitor = async () => {
    if (saleSubmitting) return;
    if (!foodType) {
      setFoodTypeError("Choose food type before confirming sale");
      toast.error("Choose soft or hard food");
      return;
    }
    setFoodTypeError("");
    const price = Number(amount);
    if (!price || price < 100 || price > 10000) {
      toast.error("Amount must be between ₦100 and ₦10,000");
      return;
    }
    setSaleSubmitting(true);
    try {
      await api.post("/sales", {
        type: "visitor",
        customer_name: "Unregistered User",
        contractor: "Unregistered",
        food_type: foodType,
        amount: price,
      });
      triggerSaleFlash();
      toast.success(`Visitor sale recorded — ${formatNaira(price)}`);
      setAmount("");
      setFoodType("");
      if (selected?.id === VISITOR_PROFILE_ID) {
        await loadVisitorProfile();
      }
      await loadMySalesMetrics();
    } catch (e) {
      triggerSaleErrorFlash();
      toast.error(e?.response?.data?.detail || "Sale failed");
    } finally {
      setSaleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      {saleFlashActive && (
        <div className="sale-success-flash" aria-hidden="true" />
      )}
      {saleErrorFlashActive && (
        <div className="sale-error-flash" aria-hidden="true" />
      )}
      {saleSubmitting && (
        <div
          className="sale-processing-overlay"
          role="status"
          aria-live="polite"
          aria-label="Processing sale"
        >
          <div className="sale-processing-card">
            <div className="sale-processing-spinner" aria-hidden="true" />
            <p className="sale-processing-text">Processing sale...</p>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-[#E8E6E1]">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white border border-[#E8E6E1] flex items-center justify-center overflow-hidden">
              <img
                src="/favicon.ico"
                alt="FoodPlug"
                className="w-6 h-6 object-contain"
              />
            </div>
            <div>
              <p className="font-display font-black text-[#2C423F] leading-none">
                FoodPlug POS
              </p>
             <p className="text-xs text-[#5C5C59]">
                {user?.display_name || "Sales rep"}
                {user?.location ? (
                  <>
                    {" - "}
                    <span className="font-mono italic text-[#D95D39]">
                      {user.location}
                    </span>
                  </>
                ) : (user?.organization_name || user?.organization_id) ? (
                  <>
                    {" - "}
                    <span className="font-mono italic text-[#D95D39]">
                      {user?.organization_name || user?.organization_id}
                    </span>
                  </>
                ) : null}
              </p>
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
            <div className="mb-6 rounded-[28px] bg-[#2C423F] p-6 md:p-7">
              <p className="text-xs uppercase tracking-[0.3em] text-[#D4A373] font-bold">
                Point of sale
              </p>
              <h1 className="font-display font-black text-3xl text-white mt-1">
                Register a meal
              </h1>
              <p className="text-sm text-[rgba(255,244,229,0.84)] mt-2">
                Search a customer by name, confirm with PIN, or open the visitor
                profile.
              </p>
              <div className="grid grid-cols-2  gap-3 mt-4">
                <div className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[rgba(255,255,255,0.72)] font-bold">
                   Total Meals served
                  </p>
                  <p className="font-display font-black text-white text-2xl mt-1">
                    {myMealsServed}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[rgba(255,255,255,0.72)] font-bold">
                    Customers attended
                  </p>
                  <p className="font-display font-black text-white text-2xl mt-1">
                    {customersAttended}/{customers.length}
                  </p>
                </div>
              </div>
            </div>

            {/* Mode tabs */}
            <div
              className="grid grid-cols-2 md:grid-cols-4 gap-1 mb-6 md:ml-40 md:mr-40"
              data-testid="mode-tabs"
            >
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
                active={mode === "fingerprint"}
                onClick={() => {
                  setMode("fingerprint");
                  setSearchTerm("");
                }}
                icon={Fingerprint}
                label="Fingerprint"
                testid="mode-fingerprint"
              />
              <ModeButton
                active={mode === "visitor"}
                onClick={handleVisitorMode}
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
                          <p className="font-semibold text-[#2C423F]">
                            {c.name}
                          </p>
                          <p className="text-xs text-[#5C5C59]">
                            {c.contractor}
                          </p>
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
                  <p className="text-xs uppercase tracking-widest text-[#5C5C59]">
                    Enter customer PIN
                  </p>
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

            {mode === "fingerprint" && (
              <div className="card-elevated p-6" data-testid="fingerprint-mode">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-widest text-[#5C5C59]">
                    Fingerprint verification
                  </p>
                  <div className="mt-3 text-3xl text-[#2C423F] h-12 flex items-center justify-center">
                    <Fingerprint className="w-8 h-8" />
                  </div>
                  <p className="text-sm text-[#5C5C59] mt-2">
                    Enter fingerprint code to verify and open user profile.
                  </p>
                </div>

                <div className="max-w-sm mx-auto mt-5 space-y-3">
                  <Input
                    data-testid="fingerprint-code-input"
                    value={searchTerm}
                    onChange={(e) =>
                      setSearchTerm(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    placeholder="Fingerprint code"
                    className="h-12 text-center font-mono"
                  />
                  <Button
                    data-testid="fingerprint-confirm-button"
                    onClick={handleFingerprintConfirm}
                    className="w-full h-12 bg-[#2C423F] hover:bg-[#1f302e] text-white font-bold"
                  >
                    Verify fingerprint
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {selected && (
          <div className="animate-fade-in-up">
            {(() => {
              const isVisitorProfile = selected?.id === VISITOR_PROFILE_ID;
              const totalSales = filteredSales.reduce(
                (sum, sale) => sum + Math.abs(Number(sale.amount || 0)),
                0,
              );
              const paid = Number(history?.customer?.balance_credited || 0);
              const outstanding = Math.max(0, totalSales - paid);
              const indicatorMealsCount = filteredSales.length;
              return (
                <>
                  <div className="w-full flex items-center justify-between gap-3 mb-4">
                    <button
                      onClick={backToSearch}
                      data-testid="back-to-search-button"
                      className="w-full sm:w-auto h-11 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#5C5C59] hover:text-[#2C423F] border border-[#E8E6E1] rounded-full"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back to search
                    </button>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((slot) => {
                        const isActive = indicatorMealsCount >= slot;
                        const isThreshold =
                          slot === 5 && indicatorMealsCount >= 5;
                        const colorClass = isActive
                          ? isThreshold
                            ? "bg-red-500 border-red-600"
                            : "bg-green-500 border-green-600"
                          : "bg-white border-[#E8E6E1]";

                        return (
                          <div
                            key={slot}
                            className={`h-2.5 w-2.5 rounded-full border ${colorClass}`}
                            title={`Meal ${slot}`}
                          />
                        );
                      })}
                      {indicatorMealsCount > 5 && (
                        <span className="ml-1 text-[10px] font-bold text-red-600">
                          +{indicatorMealsCount - 5}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="card-elevated p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-[#5C5C59]">
                          {isVisitorProfile ? "Profile" : "Customer"}
                        </p>
                        <h2 className="font-display font-black text-2xl text-[#2C423F] mt-1">
                          {selected.name}
                        </h2>
                        <p className="text-sm text-[#5C5C59]">
                          {selected.contractor}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-widest text-[#5C5C59]">
                          {isVisitorProfile ? "Source" : "PIN"}
                        </p>
                        <p className="font-mono font-black text-2xl text-[#D95D39]">
                          {isVisitorProfile ? "visitor sales" : selected.pin}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setStatsFilter("today")}
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                          statsFilter === "today"
                            ? "bg-[#2C423F] text-white border-[#2C423F]"
                            : "bg-white text-[#2C423F] border-[#E8E6E1]"
                        }`}
                      >
                        Today
                      </button>
                      <button
                        onClick={() => setStatsFilter("yesterday")}
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                          statsFilter === "yesterday"
                            ? "bg-[#2C423F] text-white border-[#2C423F]"
                            : "bg-white text-[#2C423F] border-[#E8E6E1]"
                        }`}
                      >
                        Yesterday
                      </button>
                      <button
                        onClick={() => setStatsFilter("all")}
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                          statsFilter === "all"
                            ? "bg-[#2C423F] text-white border-[#2C423F]"
                            : "bg-white text-[#2C423F] border-[#E8E6E1]"
                        }`}
                      >
                        All time
                      </button>
                      <input
                        type="date"
                        value={selectedDay}
                        onChange={(e) => {
                          setSelectedDay(e.target.value);
                          setStatsFilter("day");
                        }}
                        className="h-9 px-2 rounded-md border border-[#E8E6E1] text-sm text-[#2C423F]"
                      />
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => {
                          setSelectedMonth(e.target.value);
                          setStatsFilter("month");
                        }}
                        className="h-9 px-2 rounded-md border border-[#E8E6E1] text-sm text-[#2C423F]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <div className="p-4 rounded-lg bg-[#F9F8F6] border border-[#E8E6E1]">
                        <p className="text-xs uppercase tracking-widest text-[#5C5C59]">
                          {isVisitorProfile ? "Purchases" : "Meals"}
                        </p>
                        <p
                          className="font-display font-black text-2xl text-[#2C423F] mt-1"
                          data-testid="customer-total-meals"
                        >
                          {filteredSales.length}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-[#F9F8F6] border border-[#E8E6E1]">
                        <p className="text-xs uppercase tracking-widest text-[#5C5C59]">
                          {isVisitorProfile ? "Revenue" : "Outstanding balance"}
                        </p>
                        <p
                          className={`font-display font-black text-2xl mt-1 ${
                            isVisitorProfile
                              ? "text-[#2C423F]"
                              : outstanding > 0
                                ? "text-[#D95D39]"
                                : "text-[#4F7942]"
                          }`}
                          data-testid="customer-total-cost"
                        >
                          {formatNaira(
                            isVisitorProfile ? totalSales : outstanding,
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className="card-elevated p-2 mt-2"
                    data-testid={
                      isVisitorProfile
                        ? "visitor-register-meal"
                        : "customer-register-meal"
                    }
                  >
                    <p className="text-xs uppercase tracking-widest text-[#5C5C59] font-bold">
                      Register meal
                    </p>
                    <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1">
                      Choose food type
                    </h3>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <button
                        onClick={() => {
                          setFoodType("soft");
                          setFoodTypeError("");
                        }}
                        data-testid={
                          isVisitorProfile
                            ? "visitor-food-type-soft"
                            : "food-type-soft"
                        }
                        className={`h-10  mx-auto inline-flex items-center justify-center text-center p-3 rounded-full border-2 border-dashed font-bold transition-colors ${
                          foodType === "soft"
                            ? "border-[#D95D39] bg-[#F9F1EE] text-[#D95D39]"
                            : "border-[#E8E6E1] text-[#2C423F] hover:border-[#D95D39]/50"
                        }`}
                        style={{ borderStyle: "dashed" }}
                      >
                        Soft food
                      </button>
                      <button
                        onClick={() => {
                          setFoodType("hard");
                          setFoodTypeError("");
                        }}
                        data-testid={
                          isVisitorProfile
                            ? "visitor-food-type-hard"
                            : "food-type-hard"
                        }
                        className={`h-10  mx-auto inline-flex items-center justify-center text-center p-3 rounded-full border-2 border-dashed font-bold transition-colors ${
                          foodType === "hard"
                            ? "border-[#D95D39] bg-[#F9F1EE] text-[#D95D39]"
                            : "border-[#E8E6E1] text-[#2C423F] hover:border-[#D95D39]/50"
                        }`}
                        style={{ borderStyle: "dashed" }}
                      >
                        Hard food
                      </button>
                    </div>
                    {foodTypeError ? (
                      <p className="mt-1 text-sm font-semibold text-[#B22222]">
                        {foodTypeError}
                      </p>
                    ) : null}

                    <div className="mt-4">
                      <Label
                        className={
                          isVisitorProfile ? "" : "text-[#D95D39] font-bold"
                        }
                      >
                        Amount (₦){" "}
                        {!isVisitorProfile && (
                          <span className="text-[#D95D39]">
                            — Stored as negative
                          </span>
                        )}
                      </Label>
                      <div className="relative">
                        {!isVisitorProfile && (
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D95D39] font-bold text-lg">
                            −
                          </span>
                        )}
                        <Input
                          data-testid={
                            isVisitorProfile
                              ? "visitor-sale-amount-input"
                              : "sale-amount-input"
                          }
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="e.g. 1500"
                          className={`h-12 ${!isVisitorProfile ? "pl-8 border-2 border-[#D95D39] focus:border-[#C2502F]" : ""}`}
                        />
                      </div>
                    </div>

                    <Button
                      data-testid={
                        isVisitorProfile
                          ? "record-visitor-button"
                          : "confirm-sale-button"
                      }
                      onClick={
                        isVisitorProfile ? registerVisitor : registerSale
                      }
                      disabled={saleSubmitting}
                      className={`w-full max-w-full h-12 font-bold mt-4 text-sm sm:text-base ${
                        isVisitorProfile
                          ? "bg-[#DDF4D7] hover:bg-[#CFECC7] text-[#2C423F]"
                          : "bg-[#D95D39] hover:bg-[#C2502F] text-white"
                      }`}
                    >
                      {saleSubmitting
                        ? "Confirming..."
                        : isVisitorProfile
                          ? "Pay cash"
                          : "Confirm sale"}
                    </Button>
                  </div>

                  {filteredSales.length > 0 && (
                    <div className="card-elevated p-6 mt-4">
                      <h3 className="font-display font-bold text-xl text-[#2C423F] mt-1 mb-3">
                        {isVisitorProfile ? "Visitors history" : "Food history"}
                      </h3>
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
                            {visibleSales.map((s) => (
                              <tr
                                key={s.id}
                                className="border-b border-[#E8E6E1]"
                              >
                                <td className="py-2 text-sm text-[#2C423F]">
                                  {new Date(s.created_at)
                                    .toLocaleString("en-GB", {
                                      day: "2-digit",
                                      month: "short",
                                      hour: "numeric",
                                      minute: "2-digit",
                                      hour12: true,
                                    })
                                    .toLowerCase()}
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
                      {!showAllTransactions && filteredSales.length > 3 && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => setShowAllTransactions(true)}
                            className="text-sm font-semibold text-[#D95D39] hover:text-[#C2502F]"
                          >
                            Show more
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
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
      className={`w-20 p-2 mx-auto flex flex-col items-center justify-center gap-0.5  rounded-full border-2 border-dashed transition-colors ${
        active
          ? "border-[#D95D39] bg-[#F9F1EE] text-[#D95D39]"
          : "border-[#E8E6E1] text-[#5C5C59] hover:border-[#D95D39]/50"
      }`}
      style={{ borderStyle: "dashed" }}
    >
      <Icon className="w-3 h-3" />
      <span className="text-[8px] leading-none font-bold uppercase tracking-[0.06em]">
        {label}
      </span>
    </button>
  );
}

function PinKey({ onClick, label, icon: Icon, muted }) {
  return (
    <button
      onClick={onClick}
      className={`w-20 p-2  rounded-full font-display font-bold text-xl border-2 border-dotted transition-colors ${
        muted
          ? "border-[#E8E6E1] bg-white text-[#5C5C59] hover:bg-[#F9F8F6]"
          : "border-[#E8E6E1] bg-white text-[#2C423F] hover:bg-[#F9F1EE] hover:border-[#D95D39]"
      }`}
      style={{ borderStyle: "dotted" }}
    >
      {Icon ? <Icon className="w-5 h-5 mx-auto" /> : label}
    </button>
  );
}

function toLocalDateKey(value) {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
    if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
      const parsed = new Date(normalized);
      if (!Number.isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, "0");
        const d = String(parsed.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }
  }
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toLocalMonthKey(value) {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;
    if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
      const parsed = new Date(normalized);
      if (!Number.isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, "0");
        return `${y}-${m}`;
      }
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized.slice(0, 7);
  }
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function matchesPeriod(isoDate, filter, selectedDay, selectedMonth) {
  const dayKey = toLocalDateKey(isoDate);
  const monthKey = toLocalMonthKey(isoDate);
  const todayKey = toLocalDateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday);

  if (filter === "today") return dayKey === todayKey;
  if (filter === "yesterday") return dayKey === yesterdayKey;
  if (filter === "day") return dayKey === selectedDay;
  if (filter === "month") return monthKey === selectedMonth;
  return true;
}
