import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ArrowLeft, UserPlus } from "lucide-react";
import { toast } from "sonner";

const COMPANY_CODE_REGEX = /^[A-Z0-9_-]{3,20}$/;

export default function OrganizationRegistrationPage() {
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        organization_name: "",
        company_code: "",
        address: "",
        phone: "",
        email: "",
        subscription: "trial",
        admin_display_name: "",
        admin_email: "",
        admin_password: "",
        admin_password_confirm: "",
    });

    const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
    const passwordMismatch = Boolean(form.admin_password_confirm) && form.admin_password !== form.admin_password_confirm;

    const handleCompanyCodeChange = (value) => {
        const normalized = value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
        setField("company_code", normalized);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const normalizedCompanyCode = form.company_code.trim().toUpperCase();
            if (!COMPANY_CODE_REGEX.test(normalizedCompanyCode)) {
                toast.error("Company code must be 3-20 chars using letters, numbers, underscore or hyphen");
                return;
            }

            if (form.admin_password !== form.admin_password_confirm) {
                return;
            }

            const { admin_password_confirm, ...rest } = form;
            const payload = {
                ...rest,
                company_code: normalizedCompanyCode,
            };
            const res = await api.post("/organizations/register", payload);
            toast.success(`Organization registered: ${res.data.company_code}`);
            navigate("/login");
        } catch (err) {
            const msg = err?.response?.data?.detail || "Registration failed. Please check your inputs.";
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center px-6 py-10">
            <div className="w-full max-w-2xl card-elevated p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-[#5C5C59] font-bold">Onboarding</p>
                        <h1 className="font-display font-black text-3xl text-[#2C423F] mt-1">Register Organization</h1>
                    </div>
                    <Building2 className="w-8 h-8 text-[#D95D39]" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-5" data-testid="organization-registration-form">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2 md:col-span-2">
                            <Label>Organization name</Label>
                            <Input
                                value={form.organization_name}
                                onChange={(e) => setField("organization_name", e.target.value)}
                                placeholder="e.g. Julius Berger"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Company code</Label>
                            <Input
                                value={form.company_code}
                                onChange={(e) => handleCompanyCodeChange(e.target.value)}
                                placeholder="e.g. JULIUS"
                                maxLength={20}
                                required
                            />
                            <p className="text-xs text-[#5C5C59]">Use 3-20 chars: A-Z, 0-9, _ or -</p>
                        </div>

                        <div className="space-y-2">
                            <Label>Subscription</Label>
                            <select
                                value={form.subscription}
                                onChange={(e) => setField("subscription", e.target.value)}
                                className="h-10 w-full rounded-md border border-[#E8E6E1] bg-white px-3 text-sm"
                            >
                                <option value="trial">trial</option>
                                <option value="basic">basic</option>
                                <option value="premium">premium</option>
                                <option value="enterprise">enterprise</option>
                            </select>
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <Label>Address</Label>
                            <Input
                                value={form.address}
                                onChange={(e) => setField("address", e.target.value)}
                                placeholder="Optional"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Organization email</Label>
                            <Input
                                type="email"
                                value={form.email}
                                onChange={(e) => setField("email", e.target.value)}
                                placeholder="ops@company.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input
                                value={form.phone}
                                onChange={(e) => setField("phone", e.target.value)}
                                placeholder="+234..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Admin full name</Label>
                            <Input
                                value={form.admin_display_name}
                                onChange={(e) => setField("admin_display_name", e.target.value)}
                                placeholder="Admin user"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Admin email</Label>
                            <Input
                                type="email"
                                value={form.admin_email}
                                onChange={(e) => setField("admin_email", e.target.value)}
                                placeholder="admin@company.com"
                                required
                            />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <Label>Admin password</Label>
                            <Input
                                type="password"
                                value={form.admin_password}
                                onChange={(e) => setField("admin_password", e.target.value)}
                                placeholder="Minimum 6 characters"
                                required
                            />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <Label>Confirm admin password</Label>
                            <Input
                                type="password"
                                value={form.admin_password_confirm}
                                onChange={(e) => setField("admin_password_confirm", e.target.value)}
                                placeholder="Re-enter password"
                                required
                            />
                            {passwordMismatch && <p className="text-xs text-[#B22222]">Password does not match</p>}
                        </div>
                    </div>

                    <Button
                        type="submit"
                        className="w-full h-11 bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold"
                        disabled={submitting}
                    >
                        <UserPlus className="w-4 h-4 mr-2" />
                        {submitting ? "Registering..." : "Register organization"}
                    </Button>
                </form>

                <div className="mt-4 text-center">
                    <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-[#2C423F] hover:underline">
                        <ArrowLeft className="w-4 h-4" /> Back to login
                    </Link>
                </div>
            </div>
        </div>
    );
}
