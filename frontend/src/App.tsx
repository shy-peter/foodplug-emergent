import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/LoginPage";
import OrganizationRegistrationPage from "@/pages/OrganizationRegistrationPage";
import DashboardPage from "@/pages/DashboardPage";
import CustomersPage from "@/pages/CustomersPage";
import CustomerDetailPage from "@/pages/CustomerDetailPage";
import AgentsPage from "@/pages/AgentsPage";
import SalesPage from "@/pages/SalesPage";
import SalesAgentPage from "@/pages/SalesAgentPage";
import AdminLayout from "@/components/AdminLayout";
import { Toaster } from "@/components/ui/sonner";
import type { ReactNode } from "react";

function RequireAuth({ children, role }: { children: ReactNode; role?: "admin" | "sales" }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/sales"} replace />;
  }
  return <>{children}</>;
}

function ClockGate({ children }: { children: ReactNode }) {
  const { clockChecking, clockValid, clockError } = useAuth();

  if (clockChecking) {
    return <FullScreenNotice title="Checking device time" message="Verifying your clock against the server..." />;
  }

  return (
    <>
      {!clockValid && clockError ? <ClockWarning message={clockError} /> : null}
      {children}
    </>
  );
}

function ClockWarning({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        padding: "12px 16px",
        background: "#FFF4D8",
        borderBottom: "1px solid #E7C86B",
        color: "#6B4F00",
        textAlign: "center",
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {message}
    </div>
  );
}

function FullScreenNotice({ title, message }: { title: string; message: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#F9F8F6",
        color: "#2C423F",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 440 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>{title}</h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#5C5C59" }}>{message}</p>
      </div>
    </div>
  );
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
        <ClockGate>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register-organization" element={<OrganizationRegistrationPage />} />
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
              <Route path="customers/:customerId" element={<CustomerDetailPage />} />
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
        </ClockGate>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
