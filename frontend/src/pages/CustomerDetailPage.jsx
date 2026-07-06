import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, User, Building2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CustomerDetailPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [history, setHistory] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsFilter, setStatsFilter] = useState("today");
  const [selectedDay, setSelectedDay] = useState(() => toLocalDateKey(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(() => toLocalMonthKey(new Date()));

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [customerData, payments] = await Promise.all([
          api.get(`/customers/${customerId}/history`),
          api.get(`/payment-history`, { params: { customer_id: customerId } }),
        ]);
        setCustomer(customerData.data.customer);
        setHistory(customerData.data.sales);
        setPaymentHistory(payments.data || []);
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Failed to load customer");
        navigate("/admin/customers");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [customerId, navigate]);

  const copyPin = (pin) => {
    navigator.clipboard?.writeText(pin);
    toast.success(`PIN ${pin} copied`);
  };

  const filteredHistory = useMemo(
    () => history.filter((sale) => matchesPeriod(sale.created_at, statsFilter, selectedDay, selectedMonth)),
    [history, selectedDay, selectedMonth, statsFilter],
  );

  const filteredPaymentHistory = useMemo(
    () => paymentHistory.filter((payment) => matchesPeriod(payment.created_at, statsFilter, selectedDay, selectedMonth)),
    [paymentHistory, selectedDay, selectedMonth, statsFilter],
  );

  const totalSpent = filteredHistory.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0);
  const paid = filteredPaymentHistory.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const outstanding = Math.max(0, totalSpent - paid);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-[#5C5C59]">Loading...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-10">
        <p className="text-[#5C5C59]">Customer not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/admin/customers")}
        className="flex items-center gap-2 text-[#D95D39] hover:text-[#C2502F] font-semibold"
      >
        <ArrowLeft className="w-4 h-4" /> Back to customers
      </button>

      {/* Customer Profile Card */}
      <div className="card-elevated p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-[#F9F1EE] text-[#D95D39] flex items-center justify-center">
              <User className="w-8 h-8" />
            </div>
            <div>
              <h1 className="font-display font-black text-3xl text-[#2C423F]">{customer.name}</h1>
              <p className="text-[#5C5C59] mt-1">Customer ID: {customer.id}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-[#E8E6E1]">
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Statistics Filter</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
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
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Contractor</p>
            <p className="text-lg font-semibold text-[#2C423F] mt-1 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#D95D39]" />
              {customer.contractor}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">PIN</p>
            <button
              onClick={() => copyPin(customer.pin)}
              className="text-lg font-mono font-bold text-[#D95D39] hover:underline mt-1 flex items-center gap-2"
            >
              {customer.pin}
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Total Meals</p>
            <p className="text-2xl font-display font-bold text-[#2C423F] mt-1">{filteredHistory.length}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Total Spent</p>
            <p className="text-2xl font-display font-bold text-[#2C423F] mt-1">{formatNaira(totalSpent)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Amount Paid</p>
            <p className="text-2xl font-display font-bold text-[#4F7942] mt-1">{formatNaira(paid)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Outstanding Balance</p>
            <p className={`text-2xl font-display font-bold mt-1 ${outstanding > 0 ? "text-[#D95D39]" : "text-[#4F7942]"}`}>
              {formatNaira(outstanding)}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-[#E8E6E1]">
          <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Member Since</p>
          <p className="text-[#2C423F] mt-1">
            {new Date(customer.created_at).toLocaleDateString("en-GB", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* Sales History */}
      <div className="card-elevated p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Transaction</p>
            <h2 className="font-display font-bold text-xl text-[#2C423F] mt-1">Meal History</h2>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Total Records</p>
            <p className="text-2xl font-display font-bold text-[#2C423F]">{filteredHistory.length}</p>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <p className="text-center py-10 text-[#5C5C59]">No meals recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <Th>Agent</Th>
                  <Th>Food Type</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Date & Time</Th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((sale) => (
                  <tr key={sale.id} className="hover:bg-[#F9F8F6] transition-colors">
                    <Td className="font-semibold">{sale.agent_name}</Td>
                    <Td>{sale.food_type}</Td>
                    <Td className={`text-right font-display font-bold ${Number(sale.amount) < 0 ? "text-[#D95D39]" : "text-[#4F7942]"}`}>{formatNaira(sale.amount)}</Td>
                    <Td className="text-right text-[#5C5C59]">
                      {new Date(sale.created_at).toLocaleString("en-GB", {
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
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="card-elevated p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Transaction</p>
            <h2 className="font-display font-bold text-xl text-[#2C423F] mt-1">Payment History</h2>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Total Records</p>
            <p className="text-2xl font-display font-bold text-[#2C423F]">{filteredPaymentHistory.length}</p>
          </div>
        </div>

        {filteredPaymentHistory.length === 0 ? (
          <p className="text-center py-10 text-[#5C5C59]">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <Th>Amount Paid</Th>
                  <Th>Initiated By</Th>
                  <Th className="text-right">Date & Time</Th>
                </tr>
              </thead>
              <tbody>
                {filteredPaymentHistory.map((payment) => (
                  <tr key={payment.$id} className="hover:bg-[#F9F8F6] transition-colors">
                    <Td className="font-display font-bold text-[#4F7942]">{formatNaira(payment.amount)}</Td>
                    <Td className="font-semibold">{payment.initiated_by_name}</Td>
                    <Td className="text-right text-[#5C5C59]">
                      {new Date(payment.created_at).toLocaleString("en-GB", {
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
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function toLocalDateKey(value) {
  const date = new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toLocalMonthKey(value) {
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
    <td className={`py-3 border-b border-[#E8E6E1] text-sm text-[#2C423F] ${className}`}>
      {children}
    </td>
  );
}
