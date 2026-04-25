import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Send, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

type Row = {
  id: string;
  email: string;
  name: string | null;
  seniority: string | null;
  sector: string | null;
  status: string;
  source: string | null;
  requested_at: string | null;
  created_at: string | null;
  invited_at: string | null;
};

const SENIORITY = ["C-Suite", "VP", "Director", "Manager", "Other"];
const SECTOR = ["Consulting", "Energy", "Finance", "Government", "Technology", "Other"];

const initials = (name: string | null, email: string) => {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
};

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    approved: "bg-green-500/15 text-green-300 border-green-500/30",
    active: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  };
  return map[status] || "bg-secondary text-muted-foreground border-border/40";
};

interface Props {
  userId: string | null | undefined;
}

const BetaAccessAdmin = ({ userId }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [seniorityFilter, setSeniorityFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [activeInvite, setActiveInvite] = useState<string | null>(null);
  const [noteByRow, setNoteByRow] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [directEmail, setDirectEmail] = useState("");
  const [directSending, setDirectSending] = useState(false);

  if (userId !== ADMIN_USER_ID) return null;

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("beta_allowlist")
      .select("id,email,name,seniority,sector,status,source,requested_at,created_at,invited_at")
      .order("requested_at", { ascending: false });
    if (error) {
      console.error("beta_allowlist fetch failed:", error);
      toast.error("Failed to load waitlist");
    } else {
      setRows((data || []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, active: 0 };
    for (const r of rows) {
      if (r.status === "pending") c.pending++;
      else if (r.status === "approved") c.approved++;
      else if (r.status === "active") c.active++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (seniorityFilter !== "all" && r.seniority !== seniorityFilter) return false;
      if (sectorFilter !== "all" && r.sector !== sectorFilter) return false;
      return true;
    });
  }, [rows, statusFilter, seniorityFilter, sectorFilter]);

  const sendInvite = async (row: Row) => {
    setSendingId(row.id);
    try {
      const { error } = await supabase.functions.invoke("send-invite", {
        body: { email: row.email, personal_note: noteByRow[row.id] || null },
      });
      if (error) throw error;
      // optimistic update
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: "approved", invited_at: new Date().toISOString() } : r))
      );
      setActiveInvite(null);
      setNoteByRow((prev) => ({ ...prev, [row.id]: "" }));
      toast.success(`Invite sent to ${row.email}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to send invite");
    } finally {
      setSendingId(null);
    }
  };

  const sendDirectInvite = async () => {
    const email = directEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email");
      return;
    }
    setDirectSending(true);
    try {
      const { data: existing } = await supabase
        .from("beta_allowlist")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (!existing) {
        const { error: insertErr } = await supabase
          .from("beta_allowlist")
          .insert({ email, status: "pending", source: "direct" });
        if (insertErr) throw insertErr;
      }
      const { error } = await supabase.functions.invoke("send-invite", {
        body: { email, personal_note: null },
      });
      if (error) throw error;
      toast.success(`Invite sent to ${email}`);
      setDirectEmail("");
      fetchRows();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send direct invite");
    } finally {
      setDirectSending(false);
    }
  };

  return (
    <div className="mt-8 pt-8 border-t border-border/40">
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/30">
            <Shield className="w-4 h-4 text-orange-400" />
          </div>
          <h3 className="text-lg font-semibold" style={{ color: "#F97316" }}>
            Beta access — admin
          </h3>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="text-xs px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {counts.pending} pending
          </span>
          <span className="text-xs px-3 py-1.5 rounded-full bg-green-500/15 text-green-300 border border-green-500/30">
            {counts.approved} approved
          </span>
          <span className="text-xs px-3 py-1.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
            {counts.active} active
          </span>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(["all", "pending", "approved", "active"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                statusFilter === s
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-secondary/40 text-muted-foreground border-border/40 hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}

          <Select value={seniorityFilter} onValueChange={setSeniorityFilter}>
            <SelectTrigger className="h-8 w-[160px] bg-secondary/40 border-border/40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All seniority</SelectItem>
              {SENIORITY.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="h-8 w-[160px] bg-secondary/40 border-border/40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              {SECTOR.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">No entries match your filters.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-3 py-2 font-normal">User</th>
                  <th className="text-left px-3 py-2 font-normal">Role / Sector</th>
                  <th className="text-left px-3 py-2 font-normal">Requested</th>
                  <th className="text-left px-3 py-2 font-normal">Status</th>
                  <th className="text-right px-3 py-2 font-normal">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <>
                    <tr key={r.id} className="border-t border-border/30 hover:bg-secondary/20">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center justify-center text-[11px] font-medium">
                            {initials(r.name, r.email)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-foreground truncate">{r.name || "—"}</div>
                            <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-foreground text-xs">{r.seniority || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.sector || "—"}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {formatDate(r.requested_at || r.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusBadge(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActiveInvite(activeInvite === r.id ? null : r.id)}
                            className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10"
                          >
                            Invite
                          </Button>
                        )}
                        {r.status === "approved" && (
                          <span className="text-xs text-green-400">Invited ✓</span>
                        )}
                        {r.status === "active" && (
                          <span className="text-xs text-blue-400">Active ✓</span>
                        )}
                      </td>
                    </tr>
                    {activeInvite === r.id && r.status === "pending" && (
                      <tr key={`${r.id}-invite`} className="border-t border-border/30 bg-secondary/20">
                        <td colSpan={5} className="px-3 py-3">
                          <div className="space-y-2">
                            <Textarea
                              value={noteByRow[r.id] || ""}
                              onChange={(e) =>
                                setNoteByRow((prev) => ({ ...prev, [r.id]: e.target.value }))
                              }
                              placeholder="Add a personal note (optional)"
                              rows={2}
                              className="bg-background border-border/50 text-sm"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setActiveInvite(null)}
                                className="h-7 text-xs"
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => sendInvite(r)}
                                disabled={sendingId === r.id}
                                className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                              >
                                {sendingId === r.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>
                                    <Send className="w-3 h-3 mr-1" />
                                    Send invite
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Direct invite */}
        <div className="mt-6 pt-6 border-t border-border/40">
          <label className="text-xs text-muted-foreground tracking-wider uppercase block mb-2">
            Invite someone directly (bypasses waitlist)
          </label>
          <div className="flex gap-2">
            <Input
              type="email"
              value={directEmail}
              onChange={(e) => setDirectEmail(e.target.value)}
              placeholder="email@company.com"
              className="bg-secondary/40 border-border/50"
            />
            <Button
              onClick={sendDirectInvite}
              disabled={directSending || !directEmail}
              className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
            >
              {directSending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send invite"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BetaAccessAdmin;