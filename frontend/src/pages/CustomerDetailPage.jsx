import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, User, Building2, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CustomerDetailPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [history, setHistory] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsFilter, setStatsFilter] = useState("today");
  const [activityFilter, setActivityFilter] = useState("both");
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

  const activityHistory = useMemo(() => {
    const mealItems = history.map((sale) => ({
      id: `meal-${sale.id}`,
      type: "meal",
      title: "Meal",
      details: sale.food_type || "Meal",
      actor: sale.agent_name || "",
      amount: Number(sale.amount || 0),
      created_at: sale.created_at,
    }));

    const paymentItems = paymentHistory.map((payment) => ({
      id: `payment-${payment.$id}`,
      type: "payment",
      title: "Payment",
      details: `Payment received${payment.initiated_by_name ? ` by ${payment.initiated_by_name}` : ""}`,
      actor: payment.initiated_by_name || "",
      amount: Number(payment.amount || 0),
      created_at: payment.created_at,
    }));

    const combined = [...mealItems, ...paymentItems].filter((item) => {
      if (activityFilter === "meal") return item.type === "meal";
      if (activityFilter === "payment") return item.type === "payment";
      return true;
    });

    return combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [activityFilter, history, paymentHistory]);

  const exportActivityHistory = () => {
    if (!activityHistory.length) {
      toast.error("No history to export");
      return;
    }

    const rows = [...activityHistory].map((item) => ({
      type: item.type,
      foodTypeDetails: item.details,
      agentAdmin: item.actor || "",
      amount: formatNaira(item.amount),
      date: new Date(item.created_at).toLocaleString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
    }));

    const escapeHtml = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;");

    const tableRows = rows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.type)}</td>
            <td>${escapeHtml(row.foodTypeDetails)}</td>
            <td>${escapeHtml(row.agentAdmin)}</td>
            <td style="text-align:right;">${escapeHtml(row.amount)}</td>
            <td style="text-align:right;">${escapeHtml(row.date)}</td>
          </tr>
        `,
      )
      .join("");

    const html = `
      <!doctype html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head>
          <meta charset="utf-8" />
          <!--[if gte mso 9]><xml>
            <x:ExcelWorkbook>
              <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                  <x:Name>History</x:Name>
                  <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                </x:ExcelWorksheet>
              </x:ExcelWorksheets>
            </x:ExcelWorkbook>
          </xml><![endif]-->
          <style>
            body { font-family: Arial, sans-serif; color: #1f2937; }
            h1 { margin: 0 0 6px; font-size: 18px; }
            p { margin: 0 0 12px; color: #4b5563; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; }
            th { background: #f3f4f6; text-align: left; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(customer.name)} - Activity History</h1>
          <p>Contractor: ${escapeHtml(customer.contractor)} | PIN: ${escapeHtml(customer.pin)} | Exported: ${new Date().toLocaleString("en-GB")}</p>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>FoodType/Details</th>
                <th>Agent/Admin</th>
                <th style="text-align:right;">Amount</th>
                <th style="text-align:right;">Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob(["\ufeff", html], {
      type: "application/vnd.ms-excel;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `history-${customer.pin}-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("History downloaded");
  };

  const filteredActivityHistory = useMemo(
    () => activityHistory.filter((item) => matchesPeriod(item.created_at, statsFilter, selectedDay, selectedMonth)),
    [activityHistory, selectedDay, selectedMonth, statsFilter],
  );

  const mealCount = history.length;
  const paymentCount = paymentHistory.length;

  const exportLabel = activityFilter === "meal" ? "Meal Excel" : activityFilter === "payment" ? "Payment Excel" : "Excel";

  const activityTypeLabel = activityFilter === "meal" ? "Meal History" : activityFilter === "payment" ? "Payment History" : "Activity History";
  const totalBilled = history.reduce((sum, sale) => sum + Math.abs(Number(sale.amount || 0)), 0);
  const paid = paymentHistory.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalSpent = paid;
  const outstanding = Math.max(0, totalBilled - paid);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px] rounded-2xl border border-[#E8E6E1] bg-white/70">
        <div className="flex flex-col items-center gap-3 text-[#5C5C59]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#E8E6E1] border-t-[#D95D39]" />
          <p className="text-sm font-medium">Loading customer profile...</p>
        </div>
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
            <p className="text-2xl font-display font-bold text-[#2C423F] mt-1">
              {filteredActivityHistory.filter((item) => item.type === "meal").length}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Total Spent</p>
            <p className="text-2xl font-display font-bold text-[#2C423F] mt-1">{formatNaira(totalSpent)}</p>
          </div>
          {/* <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Total Billed</p>
            <p className="text-2xl font-display font-bold text-[#4F7942] mt-1">{formatNaira(totalBilled)}</p>
          </div> */}
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
            <h2 className="font-display font-bold text-xl text-[#2C423F] mt-1">{activityTypeLabel}</h2>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={exportActivityHistory}
              className="border-[#D95D39]/30 text-[#D95D39] hover:bg-[#D95D39]/5"
            >
              <Download className="w-4 h-4 mr-2" /> Download {exportLabel}
            </Button>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#5C5C59] font-bold">Total Records</p>
              <p className="text-2xl font-display font-bold text-[#2C423F]">{filteredActivityHistory.length}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setActivityFilter("meal")}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
              activityFilter === "meal"
                ? "bg-[#4F7942] text-white border-[#4F7942]"
                : "bg-white text-[#2C423F] border-[#E8E6E1]"
            }`}
          >
            Meal History
          </button>
          <button
            onClick={() => setActivityFilter("payment")}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
              activityFilter === "payment"
                ? "bg-[#D95D39] text-white border-[#D95D39]"
                : "bg-white text-[#2C423F] border-[#E8E6E1]"
            }`}
          >
            Payment History
          </button>
          <button
            onClick={() => setActivityFilter("both")}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
              activityFilter === "both"
                ? "bg-[#2C423F] text-white border-[#2C423F]"
                : "bg-white text-[#2C423F] border-[#E8E6E1]"
            }`}
          >
            Both
          </button>
        </div>

        {filteredActivityHistory.length === 0 ? (
          <p className="text-center py-10 text-[#5C5C59]">No history recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th>FoodType/Details</Th>
                  <Th>Agent/Admin</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Date & Time</Th>
                </tr>
              </thead>
              <tbody>
                {filteredActivityHistory.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      item.type === "meal" ? "bg-[#FFF1F0] hover:bg-[#FFE6E3]" : "bg-[#F1FBF3] hover:bg-[#E8F8EB]"
                    }`}
                  >
                    <Td className="bg-transparent">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-[0.15em] ${
                          item.type === "meal"
                            ? "bg-[#E8F5E9] text-[#4F7942]"
                            : "bg-[#F9F1EE] text-[#D95D39]"
                        }`}
                      >
                        {item.type}
                      </span>
                    </Td>
                    <Td className="font-semibold bg-transparent">{item.details}</Td>
                    <Td className="bg-transparent">{item.actor || "-"}</Td>
                    <Td className={`text-right font-display font-bold ${item.type === "meal" ? "text-[#D95D39]" : "text-[#4F7942]"}`}>
                      {formatNaira(item.amount)}
                    </Td>
                    <Td className="text-right text-[#5C5C59]">
                      {new Date(item.created_at).toLocaleString("en-GB", {
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
