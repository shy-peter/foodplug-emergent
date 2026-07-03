import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import CustomersPage from "@/pages/CustomersPage";
import AgentsPage from "@/pages/AgentsPage";
import SalesPage from "@/pages/SalesPage";
import SalesAgentPage from "@/pages/SalesAgentPage";
import AdminLayout from "@/components/AdminLayout";
import { Toaster } from "@/components/ui/sonner";

function RequireAuth({ children, role }) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    if (role && user.role !== role) {
        return <Navigate to={user.role === "admin" ? "/admin" : "/sales"} replace />;
    }
    return children;
}

function RootRedirect() {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    return <Navigate to={user.role === "admin" ? "/admin" : "/sales"} replace />;
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<RootRedirect />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        path="/admin"
                        element={
                            <RequireAuth role="admin">
                                <AdminLayout />
                            </RequireAuth>
                        }
                    >
                        <Route index element={<DashboardPage />} />
                        <Route path="customers" element={<CustomersPage />} />
                        <Route path="agents" element={<AgentsPage />} />
                        <Route path="sales" element={<SalesPage />} />
                    </Route>
                    <Route
                        path="/sales"
                        element={
                            <RequireAuth>
                                <SalesAgentPage />
                            </RequireAuth>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <Toaster position="top-right" richColors />
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
