import { useEffect, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

export default function LocationsPage() {
    const [branches, setBranches] = useState([]);
    const [open, setOpen] = useState(false);
    const [branchName, setBranchName] = useState("");
    const [subBranchName, setSubBranchName] = useState("");
    const [creating, setCreating] = useState(false);

    const fetchBranches = async () => {
        try {
            const response = await api.get("/branches");
            setBranches(response.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to load branches");
        }
    };

    useEffect(() => {
        fetchBranches();
    }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!branchName.trim() || !subBranchName.trim()) {
            toast.error("Branch name and sub branch name are required");
            return;
        }

        setCreating(true);
        try {
            const response = await api.post("/branches", {
                branch_name: branchName.trim(),
                sub_branch_name: subBranchName.trim(),
            });
            setBranches((prev) => [response.data, ...prev]);
            setBranchName("");
            setSubBranchName("");
            setOpen(false);
            toast.success("Branch created");
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to create branch");
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="locations-page">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#5C5C59] font-bold">Branches</p>
                    <h1 className="font-display font-black text-3xl sm:text-4xl text-[#2C423F] mt-1">
                        Location / Branch
                    </h1>
                    <p className="text-[#5C5C59] mt-2">
                        Create branches and sub branches that can be assigned to customers and sales reps.
                    </p>
                </div>

                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold h-11 px-5">
                            <Plus className="w-4 h-4 mr-2" /> Create new branch
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-white">
                        <DialogHeader>
                            <DialogTitle className="font-display font-bold text-2xl text-[#2C423F]">
                                Create new branch
                            </DialogTitle>
                            <DialogDescription>
                                Add a branch and sub branch so admins can assign them when creating customers and sales reps.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Branch name</Label>
                                <Input
                                    value={branchName}
                                    onChange={(e) => setBranchName(e.target.value)}
                                    placeholder="e.g. Abuja"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Sub branch name</Label>
                                <Input
                                    value={subBranchName}
                                    onChange={(e) => setSubBranchName(e.target.value)}
                                    placeholder="e.g. Wuse Zone 4"
                                    required
                                />
                            </div>
                            <DialogFooter>
                                <Button
                                    type="submit"
                                    disabled={creating}
                                    className="bg-[#D95D39] hover:bg-[#C2502F] text-white font-bold"
                                >
                                    {creating ? "Creating..." : "Create branch"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {branches.map((branch) => (
                    <div key={branch.id} className="card-elevated p-5">
                        <div className="flex items-start gap-3">
                            <div className="w-11 h-11 rounded-xl bg-[#F9F1EE] text-[#D95D39] flex items-center justify-center">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-display font-bold text-[#2C423F]">{branch.branch_name}</p>
                                <p className="text-sm text-[#5C5C59] mt-1">{branch.sub_branch_name}</p>
                            </div>
                        </div>
                    </div>
                ))}
                {branches.length === 0 && (
                    <div className="col-span-full card-elevated p-8 text-center text-[#5C5C59]">
                        No branches yet. Create your first branch to assign customers and sales reps.
                    </div>
                )}
            </div>
        </div>
    );
}
