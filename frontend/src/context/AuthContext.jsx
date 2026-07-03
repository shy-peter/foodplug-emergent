import { createContext, useContext, useEffect, useState } from "react";
import { api, clearSession, getUser, saveSession } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => getUser());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Optionally validate token in background
        const validate = async () => {
            if (!user) return;
            try {
                const res = await api.get("/auth/me");
                setUser(res.data);
                localStorage.setItem("foodplug_user", JSON.stringify(res.data));
            } catch {
                clearSession();
                setUser(null);
            }
        };
        validate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const login = async (email, password) => {
        setLoading(true);
        try {
            const res = await api.post("/auth/login", { email, password });
            saveSession(res.data.token, res.data.user);
            setUser(res.data.user);
            return res.data.user;
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        clearSession();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
