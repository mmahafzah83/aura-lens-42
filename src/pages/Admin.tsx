import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
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
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  }
  return (email?.[0] || "?").toUpperCase();
};

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    approved: "bg-green-500/15 text-green-300 border-green-500/30",
    active: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  };
  return map[status] || "bg-neutral-700/40 text-neutral-300 border-neutral-600/40";
};

const Admin = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

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

  // Auth gate — first thing
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        navigate("/auth", { replace: true });
        return;
      }
      if (session.user.id !== ADMIN_USER_ID) {
        navigate("/home", { replace: true });
        return;
      }
      setAccessToken(session.access_token);
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const fetchRows = async () => {
    setLoading(true);
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
    if (!authChecked) return;
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

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

  const callSendInvite = async (email: string, name: string | null) => {
    if (!accessToken) throw new Error("No session");
    const { error } = await supabase.functions.invoke("send-invite", {
      body: { email, name: name || "" },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (error) throw error;
  };

  const sendInvite = async (row: Row) => {
    setSendingId(row.id);
    try {
      await callSendInvite(row.email, row.name);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: "invited", invited_at: new Date().toISOString() }
            : r
        )
      );
      setActiveInvite(null);
      setNoteByRow((prev) => ({ ...prev, [row.id]: "" }));
      toast.success(`Invite sent to ${row.email}`);
      fetchRows();
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
        .select("id, name")
        .eq("email", email)
        .maybeSingle();
      if (!existing) {
        const { error: insertErr } = await supabase
          .from("beta_allowlist")
          .insert({ email, status: "pending", source: "direct" });
        if (insertErr) throw insertErr;
      }
      await callSendInvite(email, existing?.name ?? null);
      toast.success(`Invite sent to ${email}`);
      setDirectEmail("");
      fetchRows();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send direct invite");
    } finally {
      setDirectSending(false);
    }
  };

  if (!authChecked) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--ink)" }}
      >
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full"
      style={{ backgroundColor: "var(--ink)", color: "var(--ink-7)", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="text-primary font-extrabold text-2xl mb-6">Aura</div>
        <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--ink-7)" }}>
          Beta Access — Admin
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--ink-5)" }}>
          Manage waitlist and send invites
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap gap-2 mb-6">
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
        <div className="flex flex-wrap gap-2 mb-5">
          {(["all", "pending", "approved", "active"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={
                statusFilter === s
                  ? {
                      backgroundColor: "var(--brand-muted)",
                      color: "var(--brand)",
                      borderColor: "rgba(249, 115, 22, 0.4)",
                    }
                  : {
                      backgroundColor: "var(--surface-ink-raised)",
                      color: "var(--ink-5)",
                      borderColor: "var(--ink-3)",
                    }
              }
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}

          <Select value={seniorityFilter} onValueChange={setSeniorityFilter}>
            <SelectTrigger
              className="h-8 w-[170px] text-xs"
              style={{ backgroundColor: "var(--surface-ink-raised)", borderColor: "var(--ink-3)", color: "var(--ink-7)" }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {SENIORITY.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger
              className="h-8 w-[170px] text-xs"
              style={{ backgroundColor: "var(--surface-ink-raised)", borderColor: "var(--ink-3)", color: "var(--ink-7)" }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              {SECTOR.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div
          className="rounded-2xl overflow-hidden mb-8"
          style={{ backgroundColor: "var(--surface-ink-raised)", border: "1px solid var(--ink-3)" }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: "var(--ink-5)" }}>
              No entries match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--ink-5)", backgroundColor: "rgba(255,255,255,0.02)" }}
                  >
                    <th className="text-left px-4 py-3 font-medium">User</th>
                    <th className="text-left px-4 py-3 font-medium">Role / Sector</th>
                    <th className="text-left px-4 py-3 font-medium">Requested</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <Fragment key={r.id}>
                      <tr style={{ borderTop: "1px solid var(--ink-3)" }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold"
                              style={{
                                backgroundColor: "var(--brand-muted)",
                                color: "var(--brand)",
                                border: "1px solid rgba(249,115,22,0.3)",
                              }}
                            >
                              {initials(r.name, r.email)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold truncate" style={{ color: "var(--ink-7)" }}>
                                {r.name || "—"}
                              </div>
                              <div className="text-xs truncate" style={{ color: "var(--ink-5)" }}>
                                {r.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {r.seniority && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-primary-foreground" style={{ backgroundColor: "#1c1c1c", color: "var(--ink-7)", border: "1px solid var(--ink-3)" }}>
                                {r.seniority}
                              </span>
                            )}
                            {r.sector && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-primary-foreground" style={{ backgroundColor: "#1c1c1c", color: "var(--ink-5)", border: "1px solid var(--ink-3)" }}>
                                {r.sector}
                              </span>
                            )}
                            {!r.seniority && !r.sector && (
                              <span className="text-xs" style={{ color: "var(--ink-5)" }}>
                                —
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-5)" }}>
                          {formatDate(r.requested_at || r.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusBadge(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status === "pending" && (
                            <button
                              onClick={() => setActiveInvite(activeInvite === r.id ? null : r.id)}
                              className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
                              style={{
                                backgroundColor: "var(--brand)",
                                color: "var(--ink)",
                              }}
                            >
                              Invite
                            </button>
                          )}
                          {r.status === "approved" && (
                            <span className="text-xs" style={{ color: "var(--ink-5)" }}>
                              Invited ✓
                            </span>
                          )}
                          {r.status === "active" && (
                            <span className="text-xs text-green-400">Active ✓</span>
                          )}
                        </td>
                      </tr>
                      {activeInvite === r.id && r.status === "pending" && (
                        <tr style={{ borderTop: "1px solid var(--ink-3)", backgroundColor: "rgba(255,255,255,0.02)" }}>
                          <td colSpan={5} className="px-4 py-4">
                            <div className="space-y-3">
                              <textarea
                                value={noteByRow[r.id] || ""}
                                onChange={(e) =>
                                  setNoteByRow((prev) => ({ ...prev, [r.id]: e.target.value }))
                                }
                                placeholder="Add a personal note (optional)"
                                rows={3}
                                className="w-full px-3 py-2 rounded-md text-sm outline-none focus:border-brand transition-colors"
                                style={{
                                  backgroundColor: "var(--ink)",
                                  border: "1px solid var(--ink-3)",
                                  color: "var(--ink-7)",
                                }}
                              />
                              <div className="flex justify-end items-center gap-3">
                                <button
                                  onClick={() => setActiveInvite(null)}
                                  className="text-xs"
                                  style={{ color: "var(--ink-5)" }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => sendInvite(r)}
                                  disabled={sendingId === r.id}
                                  className="text-xs px-4 py-2 rounded-md font-medium inline-flex items-center gap-1.5 disabled:opacity-60"
                                  style={{ backgroundColor: "var(--brand)", color: "var(--ink)" }}
                                >
                                  {sendingId === r.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <>
                                      <Send className="w-3 h-3" />
                                      Send invite
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Direct invite */}
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: "var(--surface-ink-raised)", border: "1px solid var(--ink-3)" }}
        >
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--ink-7)" }}>
            Invite directly (bypasses waitlist)
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-5)" }}>
            Send an invite straight to an email — they'll be added to the allowlist automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="email" value={directEmail} onChange={(e) => setDirectEmail(e.target.value)} placeholder="email@company.com" className="flex-1 px-3 py-2.5 rounded-md text-sm outline-none focus:border-brand transition-colors bg-primary-foreground" style={{ backgroundColor: "var(--ink)", border: "1px solid var(--ink-3)", color: "var(--ink-7)" }} />
            <button
              onClick={sendDirectInvite}
              disabled={directSending || !directEmail}
              className="px-5 py-2.5 rounded-md text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60 whitespace-nowrap"
              style={{ backgroundColor: "var(--brand)", color: "var(--ink)" }}
            >
              {directSending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send invite"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;