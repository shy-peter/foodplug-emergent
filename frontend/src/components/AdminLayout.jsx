import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, UserCog, Receipt, Wallet, MapPin, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const navItems = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
    { to: "/admin/customers", label: "Customers", icon: Users, testid: "nav-customers" },
    { to: "/admin/agents", label: "Sales Reps", icon: UserCog, testid: "nav-agents" },
    { to: "/admin?tab=balance", label: "Balance Payment", icon: Wallet, testid: "nav-balance" },
    { to: "/admin/locations", label: "Location/Branch", icon: MapPin, testid: "nav-locations" },
    { to: "/admin/sales", label: "Transactions", icon: Receipt, testid: "nav-sales" },
];

export default function AdminLayout() {
    const { user, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const isItemActive = (item) => {
        if (item.to === "/admin?tab=balance") {
            return location.pathname === "/admin" && new URLSearchParams(location.search).get("tab") === "balance";
        }

        if (item.to === "/admin") {
            const tab = new URLSearchParams(location.search).get("tab");
            return location.pathname === "/admin" && (!tab || tab === "overview");
        }

        if (item.end) {
            return location.pathname === item.to;
        }

        return location.pathname.startsWith(item.to);
    };

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <div className="min-h-screen flex bg-[#F9F8F6]">
            {/* Sidebar */}
            <aside className="hidden md:flex md:w-64 flex-col border-r border-[#E8E6E1] bg-white sticky top-0 h-screen">
                <div className="px-6 py-6 flex items-center gap-3 border-b border-[#E8E6E1]">
                    <div className="w-10 h-10 rounded-xl bg-white border border-[#E8E6E1] flex items-center justify-center overflow-hidden">
                        <img src="/favicon.ico" alt="FoodPlug" className="w-7 h-7 object-contain" />
                    </div>
                    <div>
                        <p className="font-display font-black text-lg text-[#2C423F] leading-none">FoodPlug</p>
                        <p className="text-xs text-[#5C5C59] mt-1 tracking-wider uppercase">Admin console</p>
                    </div>
                </div>

                <nav className="flex-1 px-3 py-4 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            data-testid={item.testid}
                            className={() =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                                    isItemActive(item)
                                        ? "bg-[#F9F1EE] text-[#D95D39]"
                                        : "text-[#5C5C59] hover:bg-[#F9F8F6] hover:text-[#2C423F]"
                                }`
                            }
                        >
                            <item.icon className="w-5 h-5" />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-[#E8E6E1]">
                    <div className="mb-3">
                        <p className="text-xs uppercase tracking-widest text-[#5C5C59]">Signed in as</p>
                        <p className="font-display font-bold text-[#2C423F] mt-1" data-testid="current-user-name">
                            {user?.display_name}
                        </p>
                        <p className="text-xs text-[#5C5C59]">{user?.email}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        data-testid="logout-button"
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#E8E6E1] text-[#2C423F] text-sm font-semibold hover:bg-[#F9F8F6] transition-colors"
                    >
                        <LogOut className="w-4 h-4" /> Log out
                    </button>
                </div>
            </aside>

            {/* Mobile top bar */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between bg-white/90 backdrop-blur border-b border-[#E8E6E1] px-4 h-14">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white border border-[#E8E6E1] flex items-center justify-center overflow-hidden">
                        <img src="/favicon.ico" alt="FoodPlug" className="w-6 h-6 object-contain" />
                    </div>
                    <span className="font-display font-black">FoodPlug</span>
                </div>
                <button
                    onClick={handleLogout}
                    data-testid="logout-button-mobile"
                    className="text-sm text-[#2C423F] font-semibold flex items-center gap-1"
                >
                    <LogOut className="w-4 h-4" /> Logout
                </button>
            </div>

            <main className="flex-1 min-w-0 pt-14 md:pt-0">
                {/* Mobile bottom nav */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#E8E6E1] grid grid-cols-5">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={() =>
                                `flex flex-col items-center justify-center py-2 text-xs font-semibold ${
                                    isItemActive(item) ? "text-[#D95D39]" : "text-[#5C5C59]"
                                }`
                            }
                        >
                            <item.icon className="w-5 h-5 mb-1" />
                            {item.label}
                        </NavLink>
                    ))}
                </div>

                <div className="p-4 md:p-8 pb-20 md:pb-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
