import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Utensils, LogIn, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
    const { user, login, loading } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    if (user) return <Navigate to={user.role === "admin" ? "/admin" : "/sales"} replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        try {
            const u = await login(email.trim(), password);
            toast.success(`Welcome back, ${u.display_name}`);
            navigate(u.role === "admin" ? "/admin" : "/sales");
        } catch (err) {
            const msg = err?.response?.data?.detail || "Login failed. Please try again.";
            setError(msg);
            toast.error(msg);
        }
    };

    return (
        <div className="min-h-screen flex bg-[#F9F8F6]">
            {/* Left side - brand panel */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#2C423F] text-white p-12 flex-col justify-between">
                <div className="relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-[#D95D39] flex items-center justify-center">
                            <Utensils className="w-6 h-6" />
                        </div>
                        <span className="font-display font-black text-2xl">FoodPlug</span>
                    </div>
                </div>

                <div className="relative z-10 space-y-6 max-w-md animate-fade-in-up">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#D4A373]">Food distribution, engineered</p>
                    <h1 className="font-display font-black text-4xl sm:text-5xl leading-tight">
                        Serve every meal.
                        <br />
                        Track every naira.
                    </h1>
                    <p className="text-[#D4A373]/90 text-base leading-relaxed">
                        A POS-first admin dashboard for construction-site catering. Register workers by PIN, record sales
                        instantly, and see how much you made — today, this week, this month.
                    </p>

                    <div className="grid grid-cols-3 gap-4 pt-6">
                        <Stat label="Sites" value="24" />
                        <Stat label="Workers" value="1.2k" />
                        <Stat label="Meals / day" value="4,800" />
                    </div>
                </div>

                <div className="relative z-10 text-xs text-[#D4A373]/70">
                    &copy; {new Date().getFullYear()} FoodPlug Nigeria
                </div>

                {/* Decorative food image */}
                <img
                    src="https://images.unsplash.com/photo-1763048443535-1243379234e2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwxfHxhZnJpY2FuJTIwZm9vZCUyMHBsYXRlfGVufDB8fHx8MTc4MzEwODgzNXww&ixlib=rb-4.1.0&q=85"
                    alt=""
                    className="absolute -right-24 -bottom-24 w-[520px] h-[520px] object-cover rounded-full opacity-25 pointer-events-none"
                />
            </div>

            {/* Right side - form */}
            <div className="flex-1 flex items-center justify-center px-6 py-10">
                <div className="w-full max-w-md">
                    <div className="lg:hidden flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-[#D95D39] flex items-center justify-center text-white">
                            <Utensils className="w-5 h-5" />
                        </div>
                        <span className="font-display font-black text-2xl text-[#2C423F]">FoodPlug</span>
                    </div>

                    <p className="text-xs uppercase tracking-[0.3em] text-[#5C5C59] font-bold">Welcome back</p>
                    <h2 className="font-display font-black text-3xl sm:text-4xl text-[#2C423F] mt-2">
                        Sign in to your account
                    </h2>
                    <p className="text-[#5C5C59] mt-3">
                        Admins get full analytics. Sales reps get the on-site POS.
                    </p>

                    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-[#2C423F]">Email</Label>
                            <Input
                                id="email"
                                data-testid="login-email-input"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@foodplug.com"
                                required
                                className="h-12 bg-white border-[#E8E6E1]"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-[#2C423F]">Password</Label>
                            <Input
                                id="password"
                                data-testid="login-password-input"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="h-12 bg-white border-[#E8E6E1]"
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-[#B22222]" data-testid="login-error">{error}</p>
                        )}

                        <Button
                            type="submit"
                            data-testid="login-submit-button"
                            disabled={loading}
                            className="w-full h-12 bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold rounded-lg"
                        >
                            <LogIn className="w-4 h-4 mr-2" />
                            {loading ? "Signing in..." : "Sign in"}
                        </Button>
                    </form>

                    <div className="mt-8 rounded-lg border border-[#E8E6E1] bg-white p-4 space-y-2">
                        <div className="flex items-center gap-2 text-[#4F7942] text-xs font-bold uppercase tracking-widest">
                            <ShieldCheck className="w-4 h-4" /> Demo credentials
                        </div>
                        <p className="text-sm text-[#2C423F]">
                            <span className="font-semibold">Admin:</span> admin@foodplug.com / admin123
                        </p>
                        <p className="text-sm text-[#2C423F]">
                            <span className="font-semibold">Sales:</span> sales@foodplug.com / sales123
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div className="border-l-2 border-[#D95D39] pl-3">
            <p className="text-2xl font-display font-black">{value}</p>
            <p className="text-xs uppercase tracking-widest text-[#D4A373]/80">{label}</p>
        </div>
    );
}
