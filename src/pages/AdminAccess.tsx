import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const relativeTime = (iso: string | null) => {
  if (!iso) return "Never logged in";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    pending: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30",
    invited: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    approved: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    active: "bg-green-500/15 text-green-300 border-green-500/30",
    rejected: "bg-red-500/15 text-red-300 border-red-500/30",
    declined: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
  };
  return map[status] || "bg-neutral-700/40 text-neutral-300 border-neutral-600/40";
};

const AdminAccess = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [seniorityFilter, setSeniorityFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [directEmail, setDirectEmail] = useState("");
  const [directName, setDirectName] = useState("");
  const [directSending, setDirectSending] = useState(false);
  const [confirmInviteRow, setConfirmInviteRow] = useState<Row | null>(null);
  const [confirmDeclineRow, setConfirmDeclineRow] = useState<Row | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [directDuplicate, setDirectDuplicate] = useState<{ name: string | null; status: string } | null>(null);
  const [npsRows, setNpsRows] = useState<Array<{ id: string; rating: number | null; message: string | null; page: string | null; created_at: string | null }>>([]);
  const [activeUsers, setActiveUsers] = useState<Array<{ email: string; first_name: string | null; sector: string | null; last_sign_in_at: string | null; activated_at: string | null; captures: number; user_id?: string | null }>>([]);
  const [activeLoading, setActiveLoading] = useState(false);

  // Seed captures
  const [seedUserId, setSeedUserId] = useState<string>("");
  const [seedUrl, setSeedUrl] = useState<string>("");
  const [seedSending, setSeedSending] = useState(false);

  // Inactivity alert

  // Delete-user state
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<{ email: string; name: string | null } | null>(null);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);

  // In-page tabs + waitlist search (presentation only)
  type TabKey = "waitlist" | "users" | "feedback";
  const [activeTab, setActiveTab] = useState<TabKey>("waitlist");
  const [searchQuery, setSearchQuery] = useState("");

  const FOUNDER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
  const PROTECTED_EMAIL = "mmahafzah8386@gmail.com";

  const seedCapture = async () => {
    const url = seedUrl.trim();
    if (!seedUserId) { toast.error("Pick a user"); return; }
    if (!/^https?:\/\//i.test(url)) { toast.error("Enter a valid URL (https://…)"); return; }
    setSeedSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || accessToken;
      const { error } = await supabase.functions.invoke("ingest-capture", {
        body: { type: "link", content: url, source_url: url, target_user_id: seedUserId },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (error) throw error;
      const target = activeUsers.find((u) => u.user_id === seedUserId);
      const label = target?.first_name || target?.email || "user";
      toast.success(`Article seeded for ${label}`);
      setSeedUrl("");
    } catch (e: any) {
      toast.error(e?.message || "Seed failed");
    } finally {
      setSeedSending(false);
    }
  };

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
      toast.error("Couldn't load waitlist");
    } else {
      setRows((data || []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!authChecked) return;
    fetchRows();
    (async () => {
      const { data } = await supabase
        .from("beta_feedback")
        .select("id,rating,message,page,created_at")
        .eq("feedback_type", "nps")
        .order("created_at", { ascending: false });
      setNpsRows((data || []) as any);
    })();
    (async () => {
      setActiveLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke("admin-active-users", {
          body: {},
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (!error && data?.users) setActiveUsers(data.users);
      } catch (e) {
        console.warn("admin-active-users failed", e);
      } finally {
        setActiveLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

  const npsStats = useMemo(() => {
    const valid = npsRows.filter((r) => typeof r.rating === "number");
    const count = valid.length;
    const avg = count ? valid.reduce((s, r) => s + (r.rating || 0), 0) / count : 0;
    const promoters = valid.filter((r) => (r.rating || 0) >= 9).length;
    const detractors = valid.filter((r) => (r.rating || 0) <= 6).length;
    const nps = count ? Math.round(((promoters - detractors) / count) * 100) : 0;
    return { count, avg, nps };
  }, [npsRows]);

  const handleDeleteUser = async (email: string) => {
    setDeletingEmail(email);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("No active session");
      }

      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { target_email: email },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || (data && (data as any).error)) {
        throw new Error((data as any)?.error || error?.message || "Delete failed");
      }
      toast.success("User deleted permanently");
      setRows((prev) => prev.filter((r) => r.email.toLowerCase() !== email.toLowerCase()));
      setActiveUsers((prev) => prev.filter((u) => u.email.toLowerCase() !== email.toLowerCase()));
    } catch (e: any) {
      toast.error(e?.message || "Couldn't delete user");
    } finally {
      setDeletingEmail(null);
      setConfirmDeleteRow(null);
    }
  };

  const counts = useMemo(() => {
    const c = { pending: 0, invited: 0, active: 0 };
    for (const r of rows) {
      if (r.status === "pending") c.pending++;
      else if (r.status === "invited" || r.status === "approved") c.invited++;
      else if (r.status === "active") c.active++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (seniorityFilter !== "all" && r.seniority !== seniorityFilter) return false;
      if (sectorFilter !== "all" && r.sector !== sectorFilter) return false;
      if (q) {
        const email = (r.email || "").toLowerCase();
        const name = (r.name || "").toLowerCase();
        if (!email.includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, seniorityFilter, sectorFilter, searchQuery]);

  const callSendInvite = async (email: string, name: string | null) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("No session");
    setAccessToken(token);
    const { error } = await supabase.functions.invoke("send-invite", {
      body: { email, name: name || "" },
      headers: { Authorization: `Bearer ${token}` },
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
      toast.success(`Invite sent to ${row.email}`);
      fetchRows();
    } catch (err: any) {
      toast.error(err?.message || "Couldn't send invite");
    } finally {
      setSendingId(null);
    }
  };

  const resendInvite = async (row: Row) => {
    setResendingId(row.id);
    try {
      await callSendInvite(row.email, row.name);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, invited_at: new Date().toISOString() } : r
        )
      );
      toast.success(`Invite resent to ${row.email}`);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't resend invite");
    } finally {
      setResendingId(null);
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
        .select("id, name, status")
        .eq("email", email)
        .maybeSingle();
      if (existing && !directDuplicate) {
        setDirectDuplicate({ name: (existing as any).name ?? null, status: (existing as any).status });
        setDirectSending(false);
        return;
      }
      if (!existing) {
        const { error: insertErr } = await supabase
          .from("beta_allowlist")
          .insert({ email, name: directName.trim() || null, status: "pending", source: "direct" });
        if (insertErr) throw insertErr;
      }
      await callSendInvite(email, directName.trim() || (existing as any)?.name || null);
      toast.success(`Invite sent to ${email}`);
      setDirectEmail("");
      setDirectName("");
      setDirectDuplicate(null);
      fetchRows();
    } catch (err: any) {
      toast.error(err?.message || "Couldn't send direct invite");
    } finally {
      setDirectSending(false);
    }
  };

  const declineRow = async (row: Row) => {
    setDecliningId(row.id);
    try {
      const { error: upErr } = await supabase
        .from("beta_allowlist")
        .update({ status: "declined" })
        .eq("id", row.id);
      if (upErr) throw upErr;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.functions.invoke("send-decline-email", {
          body: { email: row.email, name: row.name || "" },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
      } catch (mailErr) {
        console.warn("decline email failed", mailErr);
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "declined" } : r)));
      toast.success(`Declined ${row.email}`);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't decline");
    } finally {
      setDecliningId(null);
      setConfirmDeclineRow(null);
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
    <AdminShell title="Access" subtitle="Manage waitlist and send invites">
        {/* In-page tabs */}
        <div className="flex flex-wrap gap-1 mb-6 p-1 rounded-lg" style={{ backgroundColor: "var(--surface-ink-raised)", border: "1px solid var(--ink-3)", width: "fit-content" }}>
          {([
            { k: "waitlist", label: "Waitlist" },
            { k: "users", label: "Users" },
            { k: "feedback", label: "Feedback" },
          ] as { k: TabKey; label: string }[]).map((t) => (
            <button
              key={t.k}
              onClick={() => setActiveTab(t.k)}
              className="text-xs px-3 py-1.5 rounded-md transition-colors"
              style={
                activeTab === t.k
                  ? { backgroundColor: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--bronze-line)" }
                  : { backgroundColor: "transparent", color: "var(--ink-5)", border: "1px solid transparent" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "waitlist" && (<>
        {/* Stats row */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-xs px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {counts.pending} pending
          </span>
          <span className="text-xs px-3 py-1.5 rounded-full bg-green-500/15 text-green-300 border border-green-500/30">
            {counts.invited} invited
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
                      borderColor: "var(--bronze-line)",
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

        {/* Waitlist search */}
        <div className="mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search waitlist by email or name…"
            className="w-full sm:w-[360px] px-3 py-2 rounded-md text-sm outline-none"
            style={{ backgroundColor: "var(--ink)", border: "1px solid var(--ink-3)", color: "var(--ink-7)" }}
          />
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
                    className="text-xs uppercase tracking-wider"
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
                    <tr key={r.id} style={{ borderTop: "1px solid var(--ink-3)" }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold"
                              style={{
                                backgroundColor: "var(--brand-muted)",
                                color: "var(--brand)",
                                border: "1px solid var(--bronze-line)",
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
                              <span className="text-xs px-2 py-0.5 rounded bg-primary-foreground" style={{ backgroundColor: "var(--ink-2)", color: "var(--ink-7)", border: "1px solid var(--ink-3)" }}>
                                {r.seniority}
                              </span>
                            )}
                            {r.sector && (
                              <span className="text-xs px-2 py-0.5 rounded bg-primary-foreground" style={{ backgroundColor: "var(--ink-2)", color: "var(--ink-5)", border: "1px solid var(--ink-3)" }}>
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
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status === "pending" && (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => setConfirmDeclineRow(r)}
                                disabled={decliningId === r.id}
                                className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-60"
                                style={{
                                  backgroundColor: "transparent",
                                  color: "var(--ink-5)",
                                  border: "1px solid var(--ink-3)",
                                }}
                              >
                                {decliningId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Decline"}
                              </button>
                              <button
                                onClick={() => setConfirmInviteRow(r)}
                                className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
                                style={{
                                  backgroundColor: "var(--brand)",
                                  color: "var(--ink)",
                                }}
                              >
                                Invite
                              </button>
                            </div>
                          )}
                          {(r.status === "invited" || r.status === "approved") && (
                            <div className="inline-flex items-center gap-2">
                              <span className="text-xs" style={{ color: "var(--ink-5)" }}>
                                Invited ✓ · {formatDate(r.invited_at)}
                              </span>
                              <button
                                onClick={() => resendInvite(r)}
                                disabled={resendingId === r.id}
                                className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-60"
                                style={{
                                  backgroundColor: "transparent",
                                  color: "var(--brand)",
                                  border: "1px solid var(--bronze-line)",
                                }}
                              >
                                {resendingId === r.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <span className="inline-flex items-center gap-1.5"><Send className="w-3 h-3" /> Resend</span>
                                )}
                              </button>
                            </div>
                          )}
                          {r.status === "active" && (
                            <span className="text-xs text-green-400">Active ✓</span>
                          )}
                          {r.status === "declined" && (
                            <span className="text-xs" style={{ color: "var(--ink-5)" }}>
                              Declined
                            </span>
                          )}
                        </td>
                      </tr>
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
            <input
              type="text"
              value={directName}
              onChange={(e) => { setDirectName(e.target.value); setDirectDuplicate(null); }}
              placeholder="Name (optional)"
              className="sm:w-[200px] px-3 py-2.5 rounded-md text-sm outline-none transition-colors"
              style={{ backgroundColor: "var(--ink)", border: "1px solid var(--ink-3)", color: "var(--ink-7)" }}
            />
            <input
              type="email"
              value={directEmail}
              onChange={(e) => { setDirectEmail(e.target.value); setDirectDuplicate(null); }}
              placeholder="email@company.com"
              className="flex-1 px-3 py-2.5 rounded-md text-sm outline-none transition-colors"
              style={{ backgroundColor: "var(--ink)", border: "1px solid var(--ink-3)", color: "var(--ink-7)" }}
            />
            <button
              onClick={sendDirectInvite}
              disabled={directSending || !directEmail}
              className="px-5 py-2.5 rounded-md text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60 whitespace-nowrap"
              style={{ backgroundColor: "var(--brand)", color: "var(--ink)" }}
            >
              {directSending ? <Loader2 className="w-4 h-4 animate-spin" /> : directDuplicate ? "Send anyway" : "Send invite"}
            </button>
          </div>
          {directDuplicate && (
            <p className="text-xs mt-3" style={{ color: "var(--brand)" }}>
              This email is already on the waitlist as {directDuplicate.name || "(no name)"} ({directDuplicate.status}). Click "Send anyway" to proceed.
            </p>
          )}
        </div>

        </>)}

        {activeTab === "users" && (<>
        {/* Seed Captures */}
        <div
          className="rounded-2xl p-6 mt-8"
          style={{ backgroundColor: "var(--surface-ink-raised)", border: "1px solid var(--ink-3)" }}
        >
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--ink-7)" }}>
            Seed Captures
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-5)" }}>
            Pre-load articles for a user before inviting them.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={seedUserId} onValueChange={setSeedUserId}>
              <SelectTrigger
                className="sm:w-[260px] text-sm"
                style={{ backgroundColor: "var(--ink)", border: "1px solid var(--ink-3)", color: "var(--ink-7)" }}
              >
                <SelectValue placeholder="Choose user" />
              </SelectTrigger>
              <SelectContent>
                {activeUsers
                  .filter((u) => !!u.user_id && (u.first_name || u.email))
                  .map((u) => (
                    <SelectItem key={u.user_id as string} value={u.user_id as string}>
                      {(u.first_name || u.email)} ({(u.user_id as string).slice(0, 8)})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <input
              type="text"
              value={seedUrl}
              onChange={(e) => setSeedUrl(e.target.value)}
              placeholder="Paste article URL (https://...)"
              className="flex-1 px-3 py-2.5 rounded-md text-sm outline-none transition-colors"
              style={{ backgroundColor: "var(--ink)", border: "1px solid var(--ink-3)", color: "var(--ink-7)" }}
            />
            <button
              onClick={seedCapture}
              disabled={seedSending || !seedUserId || !seedUrl}
              className="px-5 py-2.5 rounded-md text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60 whitespace-nowrap"
              style={{ backgroundColor: "var(--brand)", color: "var(--ink)" }}
            >
              {seedSending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Seed Capture"}
            </button>
          </div>
        </div>

        {/* User management — delete users + their data */}
        <div
          className="rounded-2xl p-6 mt-8"
          style={{ backgroundColor: "var(--surface-ink-raised)", border: "1px solid var(--ink-3)" }}
        >
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--ink-7)" }}>
            User management
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-5)" }}>
            Users: {rows.length} total · {rows.filter((r) => r.status === "active").length} active · {rows.filter((r) => r.status === "pending").length} pending. Deleting a user removes their auth account and all associated data permanently.
          </p>
          {rows.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--ink-5)" }}>No users yet.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const profile = activeUsers.find((u) => u.email.toLowerCase() === r.email.toLowerCase());
                const isProtected =
                  profile?.user_id === FOUNDER_ID ||
                  r.email.toLowerCase() === PROTECTED_EMAIL;
                const isDeleting = deletingEmail === r.email;
                return (
                  <div
                    key={r.id}
                    className="flex items-start justify-between gap-4 p-3 rounded-md"
                    style={{ backgroundColor: "var(--ink)", border: "1px solid var(--ink-3)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--ink-7)" }}>
                        {r.email}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--ink-5)" }}>
                        {profile?.first_name
                          ? `${profile.first_name}${profile.sector ? ` · ${profile.sector}` : ""}`
                          : r.name || "(Profile not completed)"}
                      </div>
                      <div className="text-xs mt-1 uppercase tracking-wider" style={{ color: "var(--ink-5)" }}>
                        <span className={`inline-block px-2 py-0.5 rounded border ${statusBadge(r.status)}`}>{r.status}</span>
                        <span className="ml-2">Joined: {formatDate(r.invited_at || r.created_at || r.requested_at)}</span>
                      </div>
                    </div>
                    {isProtected ? (
                      <span className="text-xs px-2 py-1 rounded" style={{ color: "var(--ink-5)", border: "1px dashed var(--ink-3)" }} title="Protected admin account">
                        Protected
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteRow({ email: r.email, name: r.name })}
                        disabled={isDeleting}
                        className="px-3 py-1.5 text-xs rounded-md inline-flex items-center gap-1.5 shrink-0"
                        style={{ border: "1px solid rgba(220,38,38,0.4)", color: "rgb(248,113,113)" }}
                      >
                        {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete user
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        </>)}

        {activeTab === "feedback" && (<>
        {/* NPS responses */}
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: "var(--surface-ink-raised)", border: "1px solid var(--ink-3)" }}
        >
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--ink-7)" }}>
            NPS responses
          </h2>
          <p className="text-xs mb-4" style={{ color: "var(--ink-5)" }}>
            7-day post-signup survey. Higher NPS = more likely to recommend.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--bronze-line)" }}>
              Avg score: {npsStats.avg.toFixed(1)}
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "var(--ink)", color: "var(--ink-5)", border: "1px solid var(--ink-3)" }}>
              NPS: {npsStats.nps}
            </span>
            <span className="text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "var(--ink)", color: "var(--ink-5)", border: "1px solid var(--ink-3)" }}>
              {npsStats.count} responses
            </span>
          </div>
          {npsRows.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--ink-5)" }}>No NPS responses yet.</div>
          ) : (
            <div className="space-y-2">
              {npsRows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-3 p-3 rounded-md"
                  style={{ backgroundColor: "var(--ink)", border: "1px solid var(--ink-3)" }}
                >
                  <div
                    className="flex items-center justify-center font-semibold text-sm shrink-0"
                    style={{
                      width: 36, height: 36, borderRadius: 6,
                      backgroundColor: (r.rating ?? 0) >= 9 ? "var(--brand)" : (r.rating ?? 0) >= 7 ? "var(--brand-muted)" : "rgba(255,255,255,0.05)",
                      color: (r.rating ?? 0) >= 9 ? "var(--ink)" : "var(--ink-7)",
                      border: "1px solid var(--ink-3)",
                    }}
                  >
                    {r.rating ?? "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: "var(--ink-7)" }}>
                      {r.message?.trim() || <span style={{ color: "var(--ink-5)", fontStyle: "italic" }}>No comment</span>}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--ink-5)" }}>
                      {formatDate(r.created_at)} · {r.page || "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        </>)}


      <AlertDialog
        open={!!confirmInviteRow}
        onOpenChange={(open) => { if (!open) setConfirmInviteRow(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              Send invitation to {confirmInviteRow?.name || "this person"} ({confirmInviteRow?.email})?
              This will send them an email immediately with a 48-hour access link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const row = confirmInviteRow;
                setConfirmInviteRow(null);
                if (row) sendInvite(row);
              }}
            >
              Send invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!confirmDeclineRow}
        onOpenChange={(open) => { if (!open) setConfirmDeclineRow(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this applicant?</AlertDialogTitle>
            <AlertDialogDescription>
              Decline {confirmDeclineRow?.name || confirmDeclineRow?.email}? This will send them a polite email
              letting them know Aura isn't the right fit at this stage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const row = confirmDeclineRow;
                if (row) declineRow(row);
              }}
            >
              Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!confirmDeleteRow}
        onOpenChange={(open) => { if (!open) setConfirmDeleteRow(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {confirmDeleteRow?.name || confirmDeleteRow?.email}'s auth account and all associated data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const email = confirmDeleteRow?.email;
                if (email) handleDeleteUser(email);
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
};

export default AdminAccess;