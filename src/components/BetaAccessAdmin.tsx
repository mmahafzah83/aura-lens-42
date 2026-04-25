import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckSquare, History, Loader2, Send, Shield, Square, StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  invited_by: string | null;
  personal_note: string | null;
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

const formatDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmInviteRow, setConfirmInviteRow] = useState<Row | null>(null);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkNoteMode, setBulkNoteMode] = useState<"shared" | "per-row">("shared");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  if (userId !== ADMIN_USER_ID) return null;

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("beta_allowlist")
      .select("id,email,name,seniority,sector,status,source,requested_at,created_at,invited_at,invited_by,personal_note")
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

  const auditLog = useMemo(() => {
    return rows
      .filter((r) => !!r.invited_at)
      .sort((a, b) => new Date(b.invited_at!).getTime() - new Date(a.invited_at!).getTime());
  }, [rows]);

  const filteredPending = useMemo(
    () => filtered.filter((r) => r.status === "pending"),
    [filtered]
  );

  const allPendingSelected =
    filteredPending.length > 0 && filteredPending.every((r) => selectedIds.has(r.id));
  const somePendingSelected =
    !allPendingSelected && filteredPending.some((r) => selectedIds.has(r.id));

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllPending = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPendingSelected) {
        filteredPending.forEach((r) => next.delete(r.id));
      } else {
        filteredPending.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const sendBulkInvites = async () => {
    const targets = rows.filter((r) => selectedIds.has(r.id) && r.status === "pending");
    if (targets.length === 0) {
      toast.error("No pending rows selected");
      return;
    }
    setBulkSending(true);
    setBulkProgress({ done: 0, total: targets.length });

    let success = 0;
    let failed = 0;
    const succeededIds: string[] = [];

    // Run in parallel but cap concurrency at 5 to be polite to the edge function
    const concurrency = 5;
    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const idx = cursor++;
        const row = targets[idx];
        const note =
          bulkNoteMode === "shared"
            ? bulkNote.trim() || null
            : (noteByRow[row.id] || "").trim() || null;
        try {
          const { error } = await supabase.functions.invoke("send-invite", {
            body: { email: row.email, personal_note: note },
          });
          if (error) throw error;
          success++;
          succeededIds.push(row.id);
        } catch (err: any) {
          failed++;
          console.error(`Bulk invite failed for ${row.email}:`, err?.message || err);
        } finally {
          setBulkProgress({ done: success + failed, total: targets.length });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));

    if (succeededIds.length > 0) {
      const nowIso = new Date().toISOString();
      setRows((prev) =>
        prev.map((r) =>
          succeededIds.includes(r.id)
            ? {
                ...r,
                status: "approved",
                invited_at: nowIso,
                personal_note:
                  bulkNoteMode === "shared"
                    ? bulkNote.trim() || r.personal_note
                    : (noteByRow[r.id] || "").trim() || r.personal_note,
              }
            : r
        )
      );
    }

    setBulkSending(false);
    setBulkProgress(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      succeededIds.forEach((id) => next.delete(id));
      return next;
    });

    if (failed === 0) {
      toast.success(`Sent ${success} invite${success === 1 ? "" : "s"}`);
      setBulkNote("");
    } else if (success === 0) {
      toast.error(`All ${failed} invites failed`);
    } else {
      toast.warning(`Sent ${success}, ${failed} failed`);
    }
    // Refresh from server to capture invited_by populated by the edge function
    fetchRows();
  };

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
    <div id="beta-admin-section" className="mt-8 pt-8 border-t border-border/40 scroll-mt-24">
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/30">
            <Shield className="w-4 h-4 text-orange-400" />
          </div>
          <h3
            className="text-xs font-semibold uppercase tracking-[0.15em]"
            style={{ color: "#F97316" }}
          >
            Beta Access
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
          <>
            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="mb-3 rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckSquare className="w-4 h-4 text-orange-400" />
                    <span className="text-foreground font-medium">
                      {selectedIds.size} selected
                    </span>
                    <span className="text-muted-foreground text-xs">
                      ({rows.filter((r) => selectedIds.has(r.id) && r.status === "pending").length} pending will be invited)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-border/40 overflow-hidden text-[11px]">
                      <button
                        onClick={() => setBulkNoteMode("shared")}
                        className={`px-2.5 py-1 transition-colors ${
                          bulkNoteMode === "shared"
                            ? "bg-primary/15 text-primary"
                            : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Shared note
                      </button>
                      <button
                        onClick={() => setBulkNoteMode("per-row")}
                        className={`px-2.5 py-1 border-l border-border/40 transition-colors ${
                          bulkNoteMode === "per-row"
                            ? "bg-primary/15 text-primary"
                            : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Per-row notes
                      </button>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={clearSelection}
                      className="h-7 text-xs"
                      disabled={bulkSending}
                    >
                      <X className="w-3 h-3 mr-1" /> Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={sendBulkInvites}
                      disabled={bulkSending}
                      className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {bulkSending ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          Sending {bulkProgress?.done ?? 0}/{bulkProgress?.total ?? 0}
                        </>
                      ) : (
                        <>
                          <Send className="w-3 h-3 mr-1" />
                          Send {rows.filter((r) => selectedIds.has(r.id) && r.status === "pending").length} invites
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                {bulkNoteMode === "shared" && (
                  <Textarea
                    value={bulkNote}
                    onChange={(e) => setBulkNote(e.target.value)}
                    placeholder="Optional personal note included with every invite"
                    rows={2}
                    disabled={bulkSending}
                    className="bg-background border-border/50 text-sm"
                  />
                )}
                {bulkNoteMode === "per-row" && (
                  <p className="text-xs text-muted-foreground">
                    Open each row's <span className="text-foreground">Invite</span> panel to type a personal note.
                    Rows without a note will be sent with no note.
                  </p>
                )}
              </div>
            )}

          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-8 px-3 py-2 font-normal">
                    <Checkbox
                      checked={allPendingSelected}
                      data-state={somePendingSelected ? "indeterminate" : allPendingSelected ? "checked" : "unchecked"}
                      onCheckedChange={toggleAllPending}
                      disabled={filteredPending.length === 0}
                      aria-label="Select all pending"
                    />
                  </th>
                  <th className="text-left px-3 py-2 font-normal">User</th>
                  <th className="text-left px-3 py-2 font-normal">Role / Sector</th>
                  <th className="text-left px-3 py-2 font-normal">Requested</th>
                  <th className="text-left px-3 py-2 font-normal">Status</th>
                  <th className="text-right px-3 py-2 font-normal">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      className={`border-t border-border/30 hover:bg-secondary/20 ${
                        selectedIds.has(r.id) ? "bg-orange-500/5" : ""
                      }`}
                    >
                      <td className="px-3 py-3 align-middle">
                        {r.status === "pending" ? (
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={() => toggleRow(r.id)}
                            aria-label={`Select ${r.email}`}
                          />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground/30" />
                        )}
                      </td>
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
                      <tr className="border-t border-border/30 bg-secondary/20">
                        <td colSpan={6} className="px-3 py-3">
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
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          </>
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

      {/* Audit Log */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 mt-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/30">
            <History className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h3
              className="text-xs font-semibold uppercase tracking-[0.15em]"
              style={{ color: "#F97316" }}
            >
              Invite Audit Log
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {auditLog.length} invite{auditLog.length === 1 ? "" : "s"} sent
            </p>
          </div>
        </div>

        {auditLog.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No invites have been sent yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-3 py-2 font-normal">Recipient</th>
                  <th className="text-left px-3 py-2 font-normal">Invited at</th>
                  <th className="text-left px-3 py-2 font-normal">Invited by</th>
                  <th className="text-left px-3 py-2 font-normal">Note</th>
                  <th className="text-left px-3 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((r) => {
                  const hasNote = !!(r.personal_note && r.personal_note.trim().length > 0);
                  const invitedBySelf = r.invited_by && r.invited_by === userId;
                  return (
                    <tr key={`audit-${r.id}`} className="border-t border-border/30 hover:bg-secondary/20">
                      <td className="px-3 py-3">
                        <div className="text-foreground truncate">{r.email}</div>
                        {r.name && (
                          <div className="text-xs text-muted-foreground truncate">{r.name}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(r.invited_at)}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r.invited_by ? (
                          <span
                            className="font-mono text-muted-foreground"
                            title={r.invited_by}
                          >
                            {invitedBySelf ? "You" : `${r.invited_by.slice(0, 8)}…`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {hasNote ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-300 border-orange-500/30"
                            title={r.personal_note || ""}
                          >
                            <StickyNote className="w-3 h-3" />
                            With note
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusBadge(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BetaAccessAdmin;