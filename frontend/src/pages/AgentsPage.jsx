import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, UserCog, Mail, Phone } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";

export default function AgentsPage() {
    const [agents, setAgents] = useState([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ display_name: "", email: "", contact: "", password: "" });
    const [creating, setCreating] = useState(false);

    const fetchAgents = async () => {
        try {
            const res = await api.get("/agents");
            setAgents(res.data);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to load sales reps");
        }
    };

    useEffect(() => {
        fetchAgents();
    }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.display_name || !form.email || !form.password) {
            toast.error("Name, email, and password are required");
            return;
        }
        if (form.password.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }
        setCreating(true);
        try {
            const res = await api.post("/agents", form);
            setAgents((prev) => [res.data, ...prev]);
            setForm({ display_name: "", email: "", contact: "", password: "" });
            setOpen(false);
            toast.success(`Registered ${res.data.display_name}`);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to create sales rep");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Remove this sales rep?")) return;
        try {
            await api.delete(`/agents/${id}`);
            setAgents((prev) => prev.filter((a) => a.id !== id));
            toast.success("Sales rep removed");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Failed to delete");
        }
    };

    return (
        <div className="space-y-6" data-testid="agents-page">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#5C5C59] font-bold">Team</p>
                    <h1 className="font-display font-black text-3xl sm:text-4xl text-[#2C423F] mt-1">
                        Sales representatives
                    </h1>
                    <p className="text-[#5C5C59] mt-2">
                        Add on-site agents who can register meals and process visitor sales.
                    </p>
                </div>

                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button
                            data-testid="add-agent-button"
                            className="bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold h-11 px-5"
                        >
                            <Plus className="w-4 h-4 mr-2" /> Add sales rep
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-white">
                        <DialogHeader>
                            <DialogTitle className="font-display font-bold text-2xl text-[#2C423F]">
                                New sales rep
                            </DialogTitle>
                            <DialogDescription>
                                They will be able to log in and use the POS view to record sales.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Full name</Label>
                                <Input
                                    data-testid="agent-name-input"
                                    value={form.display_name}
                                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                                    placeholder="e.g. Chinedu Eze"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    data-testid="agent-email-input"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    placeholder="chinedu@foodplug.com"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Contact (optional)</Label>
                                <Input
                                    data-testid="agent-contact-input"
                                    value={form.contact}
                                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                                    placeholder="+234 800 000 0000"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Temporary password</Label>
                                <Input
                                    type="password"
                                    data-testid="agent-password-input"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    placeholder="At least 6 characters"
                                    required
                                />
                            </div>
                            <DialogFooter>
                                <Button
                                    type="submit"
                                    disabled={creating}
                                    data-testid="submit-agent-button"
                                    className="bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold"
                                >
                                    {creating ? "Creating..." : "Create sales rep"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="agents-grid">
                {agents.map((a) => (
                    <div key={a.id} className="card-elevated p-5" data-testid={`agent-card-${a.id}`}>
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-[#F9F1EE] text-[#D95D39] flex items-center justify-center">
                                    <UserCog className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-display font-bold text-[#2C423F]">{a.display_name}</p>
                                    <p className="text-xs uppercase tracking-widest text-[#5C5C59] mt-0.5">
                                        Sales rep
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(a.id)}
                                data-testid={`delete-agent-${a.id}`}
                                className="text-[#B22222] hover:bg-[#B22222]/10 p-2 rounded-md transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="mt-4 space-y-2 text-sm text-[#5C5C59]">
                            <p className="flex items-center gap-2">
                                <Mail className="w-4 h-4" /> {a.email}
                            </p>
                            {a.contact && (
                                <p className="flex items-center gap-2">
                                    <Phone className="w-4 h-4" /> {a.contact}
                                </p>
                            )}
                        </div>
                    </div>
                ))}
                {agents.length === 0 && (
                    <div className="col-span-full text-center py-10 text-[#5C5C59]">
                        No sales reps yet. Add your first agent to get started.
                    </div>
                )}
            </div>
        </div>
    );
}
