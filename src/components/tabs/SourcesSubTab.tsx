import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Link, Type, FileUp, Mic, ImageIcon, Search, Pin, PinOff, Trash2,
  Loader2, Zap, ChevronDown, ChevronUp, ExternalLink, Pencil, Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DOCUMENT_STATUS_EVENT = "aura:document-status-changed";

/* ── Types ── */

interface SourceEntry {
  id: string;
  type: string;
  title: string | null;
  content: string;
  summary: string | null;
  image_url: string | null;
  skill_pillar: string | null;
  framework_tag: string | null;
  pinned: boolean;
  created_at: string;
  has_signal?: boolean;
  // Document-specific fields
  file_url?: string | null;
  file_type?: string | null;
  page_count?: number | null;
  file_size?: number | null;
  status?: string | null;
  error_message?: string | null;
}

type FilterKey = "all" | "link" | "image" | "text" | "voice" | "document";
type SortKey = "recent" | "oldest" | "pinned";

const ICONS: Record<string, typeof Link> = { link: Link, text: Type, document: FileUp, voice: Mic, image: ImageIcon };
const FILTER_LABELS: { key: FilterKey; label: string; typeMatch?: string }[] = [
  { key: "all", label: "All" },
  { key: "link", label: "Links", typeMatch: "link" },
  { key: "image", label: "Images", typeMatch: "image" },
  { key: "text", label: "Notes", typeMatch: "text" },
  { key: "voice", label: "Voice", typeMatch: "voice" },
  { key: "document", label: "Documents", typeMatch: "document" },
];

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  link: { label: "URL", color: "#5b8def" },
  image: { label: "IMAGE", color: "var(--success)" },
  text: { label: "NOTE", color: "var(--warning)" },
  voice: { label: "VOICE", color: "var(--brand)" },
  document: { label: "DOC", color: "#7F77DD" },
};

const TypeBadge = ({ type }: { type: string }) => {
  const b = TYPE_BADGES[type];
  if (!b) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 3,
      background: `${b.color}1f`, color: b.color, border: `0.5px solid ${b.color}66`,
      letterSpacing: "0.04em",
    }}>{b.label}</span>
  );
};

const PAGE_SIZE = 20;

const DOC_PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;
const DOC_SUCCESS_STATUSES = new Set(["processed", "completed", "ready"]);

function isDocProcessingStuck(status: string | null | undefined, createdAt: string): boolean {
  if (status !== "processing") return false;
  return Date.now() - new Date(createdAt).getTime() > DOC_PROCESSING_TIMEOUT_MS;
}

function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/https?:\/\/([^\/\s]+)/);
  return m ? m[1].replace(/^www\./, "") : null;
}

function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes && bytes !== 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/* ── Humanize document error_message into a stage-named headline + detail ── */
function humanizeDocError(raw: string | null | undefined): { headline: string; detail: string | null } {
  if (!raw) return { headline: "Processing failed", detail: null };
  const msg = raw.toLowerCase();
  if (msg.includes("timed out") || msg.includes("aborted") || msg.includes("timeout")) {
    return { headline: "Timed out during extraction", detail: raw };
  }
  if (msg.includes("unsupported file") || msg.includes("unsupported")) {
    return { headline: "Unsupported file type", detail: raw };
  }
  if (msg.includes("no usable text") || msg.includes("empty")) {
    return { headline: "No readable text found", detail: raw };
  }
  if (msg.includes("too large")) {
    return { headline: "File too large to process", detail: raw };
  }
  if (msg.includes("storage download")) {
    return { headline: "Could not read uploaded file", detail: raw };
  }
  if (msg.includes("extraction api") || msg.includes("pdf extraction") || msg.includes("image extraction")) {
    return { headline: "Extraction failed", detail: raw };
  }
  if (msg.includes("chunk insert")) {
    return { headline: "Chunking failed", detail: raw };
  }
  if (msg.includes("trigger failed")) {
    return { headline: "Could not start processing", detail: raw };
  }
  return { headline: "Processing failed", detail: raw };
}

/* ── Delete Confirmation Dialog ── */

const DeleteDialog = ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) =>
  createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)" }} onClick={onCancel} />
      <div style={{ position: "relative", background: "var(--surface-ink-subtle)", borderRadius: 16, padding: 24, width: 360, maxWidth: "90vw", border: "1px solid var(--ink-3)" }}>
        <p style={{ color: "var(--ink-7)", fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>Delete this source?</p>
        <p style={{ color: "var(--ink-5)", fontSize: 13, margin: "0 0 20px" }}>This cannot be undone.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid var(--ink-3)", background: "transparent", color: "var(--ink-5)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: "var(--danger)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
        </div>
      </div>
    </div>,
    document.body,
  );

/* ── Open entry in new tab helper ── */

async function openEntryInNewTab(entry: SourceEntry) {
  // Documents: ask the edge function for a fresh signed URL via supabase.functions.invoke
  // (same XHR path the rest of the app uses — not a top-level navigation to
  // *.functions.supabase.co), then open the resulting storage signed URL in a new tab.
  if (entry.type === "document" && entry.id) {
    const newTab = window.open("about:blank", "_blank", "noopener");
    let stage: "invoke" | "auth_failed" | "signed_url_failed" | "browser_blocked" = "invoke";
    let signedUrl: string | null = null;
    try {
      const { data, error } = await supabase.functions.invoke("open-document", {
        body: { id: entry.id, format: "json" },
      });
      if (error) throw error;
      if (!data?.ok || !data?.signedUrl) {
        const errMsg = String(data?.error || "").toLowerCase();
        stage = errMsg.includes("auth") ? "auth_failed" : "signed_url_failed";
        throw new Error(data?.error || "Could not open document");
      }
      signedUrl = data.signedUrl;
      if (!newTab || newTab.closed) {
        stage = "browser_blocked";
        throw new Error("Popup or navigation blocked");
      }
      newTab.location.href = signedUrl;
    } catch (e: any) {
      if (newTab && !newTab.closed) newTab.close();
      console.error(`[SourcesSubTab] open document failed (stage=${stage})`, e);
      toast.error("Could not open document", {
        description:
          "Your browser or an extension may be blocking document access. Try disabling blockers or opening in another browser.",
        action: signedUrl
          ? {
              label: "Copy link",
              onClick: () => {
                navigator.clipboard?.writeText(signedUrl!);
                toast.success("Link copied");
              },
            }
          : undefined,
      });
    }
    return;
  }

  const url = entry.image_url || (entry.content.match(/^https?:\/\//) ? entry.content.split(/\s/)[0] : null);

  if (url && /^https?:\/\//.test(url)) {
    window.open(url, "_blank", "noopener");
  } else {
    // For notes/voice without a URL, open content as a text blob
    const blob = new Blob([`${entry.title || "Source"}\n\n${entry.content}`], { type: "text/plain" });
    window.open(URL.createObjectURL(blob), "_blank");
  }
}

/* ── Download an entry's underlying file (documents = private signed URL, images = direct fetch) ── */
async function downloadEntryFile(entry: SourceEntry) {
  try {
    if (entry.type === "document") {
      if (!entry.file_url) { toast.error("No file to download"); return; }
      const raw = entry.file_url;
      const path = raw.startsWith("http")
        ? raw.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(public|sign)\/documents\//, "")
        : raw;
      const filename = (entry.title || path.split("/").pop() || "document").replace(/^\d+-/, "");
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(path, 60 * 10, { download: filename });
      if (error || !data?.signedUrl) throw error || new Error("No signed URL");
      triggerDownloadLink(data.signedUrl, filename);
      return;
    }

    if (entry.type === "image" && entry.image_url) {
      // Public bucket — fetch as blob so the download attribute is honored cross-origin.
      const url = entry.image_url;
      const filename = (entry.title || url.split("/").pop() || "image").split("?")[0];
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerDownloadLink(objectUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      return;
    }

    toast.error("Nothing to download for this source");
  } catch (e: any) {
    console.error("[SourcesSubTab] download failed", e);
    toast.error("Could not download file", { description: e?.message || "Please try again." });
  }
}

function triggerDownloadLink(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ── Expanded Source View ── */

const ExpandedSource = ({
  entry, onDelete, onSwitchToSignal, onDetectSignal,
}: {
  entry: SourceEntry;
  onDelete: () => void;
  onSwitchToSignal: (signalId: string) => void;
  onDetectSignal: (entryId: string) => void;
}) => {
  const [linkedSignals, setLinkedSignals] = useState<{ id: string; signal_title: string }[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title || "");
  const [editContent, setEditContent] = useState(entry.content);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(false);

  useEffect(() => {
    (async () => {
      // Find evidence_fragments that reference this entry via source_registry
      const { data: fragments } = await supabase
        .from("evidence_fragments")
        .select("tags")
        .limit(5);

      // Find signals that have this entry's id in supporting_evidence_ids
      const { data: signals } = await supabase
        .from("strategic_signals")
        .select("id, signal_title, supporting_evidence_ids")
        .eq("status", "active")
        .limit(50);

      const linked = (signals || []).filter(
        s => (s.supporting_evidence_ids || []).includes(entry.id),
      );
      setLinkedSignals(linked as any);
      setLoadingSignals(false);
    })();
  }, [entry.id]);

  const handleSaveEdit = async () => {
    setSaving(true);
    const { error } = await supabase.from("entries").update({ title: editTitle || null, content: editContent }).eq("id", entry.id);
    if (error) { toast.error("Failed to save"); setSaving(false); return; }
    toast.success("Source updated");
    entry.title = editTitle || null;
    entry.content = editContent;
    setEditing(false);
    setSaving(false);
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      // Extract evidence first, then detect signals
      const { data: extractResult, error: extractError } = await supabase.functions.invoke('extract-evidence', {
        body: { source_type: 'entry', source_id: entry.id, user_id: session.user.id },
      });
      if (extractError) throw new Error("Evidence extraction failed");
      const registryId = extractResult?.source_registry_id;
      if (registryId) {
        const { error: sigError } = await supabase.functions.invoke('detect-signals-v2', {
          body: { source_registry_id: registryId, user_id: session.user.id },
        });
        if (sigError) throw new Error("Signal detection failed");
      }
      toast.success("Signal detection triggered");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDetecting(false);
    }
  };

  const sourceUrl = entry.type === "link" ? (entry.image_url || (entry.content.match(/^https?:\/\//) ? entry.content.split(/\s/)[0] : null)) : null;

  return (
    <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--surface-ink-subtle)" }}>
      {editing ? (
        <div style={{ marginTop: 14 }}>
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Title"
            style={{ width: "100%", background: "var(--surface-ink-subtle)", border: "1px solid var(--ink-3)", borderRadius: 10, padding: "8px 12px", color: "var(--ink-7)", fontSize: 14, marginBottom: 10, outline: "none" }}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "var(--ink-3)"; }}
          />
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            rows={6}
            style={{ width: "100%", background: "var(--surface-ink-subtle)", border: "1px solid var(--ink-3)", borderRadius: 10, padding: "8px 12px", color: "var(--ink-7)", fontSize: 13, resize: "vertical", outline: "none" }}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "var(--ink-3)"; }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={handleSaveEdit} disabled={saving} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "var(--brand)", color: "var(--ink)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setEditing(false)} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--ink-3)", background: "transparent", color: "var(--ink-5)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ color: "var(--ink-7)", fontSize: 13, lineHeight: 1.6, margin: "14px 0", whiteSpace: "pre-wrap" }}>{entry.content}</p>

          {entry.summary && entry.summary !== entry.content && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ color: "var(--ink-4)", fontSize: 10, letterSpacing: "0.08em", marginBottom: 4 }}>SUMMARY</p>
              <p style={{ color: "var(--ink-5)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>{entry.summary}</p>
            </div>
          )}

          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12, textDecoration: "none" }}>
              <ExternalLink size={12} /> {extractDomain(sourceUrl) || sourceUrl}
            </a>
          )}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {entry.skill_pillar && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(197,165,90,0.1)", color: "var(--brand)" }}>{entry.skill_pillar}</span>
            )}
            {entry.framework_tag && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--surface-ink-subtle)", color: "var(--ink-5)", border: "1px solid var(--ink-3)" }}>{entry.framework_tag}</span>
            )}
          </div>

          {/* Signals from this source */}
          <div style={{ marginTop: 12 }}>
            <p style={{ color: "var(--ink-4)", fontSize: 10, letterSpacing: "0.08em", marginBottom: 8 }}>SIGNALS FROM THIS SOURCE</p>
            {loadingSignals ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--ink-4)" }} />
            ) : linkedSignals.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {linkedSignals.map(s => (
                  <button key={s.id} onClick={() => onSwitchToSignal(s.id)} style={{ background: "none", border: "none", color: "var(--brand)", fontSize: 12, cursor: "pointer", textAlign: "left", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <Zap size={12} /> {s.signal_title}
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--ink-4)", fontSize: 12 }}>No signals detected from this source yet.</p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button onClick={() => openEntryInNewTab(entry)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--brand)", background: "transparent", color: "var(--brand)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <ExternalLink size={14} /> Open
            </button>
            {((entry.type === "document" && entry.file_url) || (entry.type === "image" && entry.image_url)) && (
              <button onClick={() => downloadEntryFile(entry)} title="Download file" style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--ink-3)", background: "transparent", color: "var(--ink-7)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <Download size={14} /> Download
              </button>
            )}
            <button onClick={handleDetect} disabled={detecting} style={{ padding: "10px 16px", borderRadius: 10, background: "var(--brand)", color: "var(--ink)", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer" }}>
              {detecting ? <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline" }} /> : <Zap size={14} style={{ display: "inline", marginRight: 4 }} />}
              Detect Signal
            </button>
            <button onClick={() => setEditing(true)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--ink-3)", background: "transparent", color: "var(--ink-5)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => setDeleteTarget(true)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--ink-3)", background: "transparent", color: "var(--danger)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}

      {deleteTarget && <DeleteDialog onConfirm={onDelete} onCancel={() => setDeleteTarget(false)} />}
    </div>
  );
};

/* ═══════════════════════════════════════════
   SOURCES SUB-TAB
   ═══════════════════════════════════════════ */

const SourcesSubTab = ({
  onOpenCapture,
  onSwitchToSignal,
}: {
  onOpenCapture?: () => void;
  onSwitchToSignal: (signalId: string) => void;
}) => {
  const [entries, setEntries] = useState<SourceEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    entries.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
    return counts;
  }, [entries]);

  // Documents chip: unique filenames whose status is a success state. Stuck,
  // failed, or duplicate rows must NOT inflate this number.
  const processedDocsCount = useMemo(() => {
    const names = new Set<string>();
    for (const e of entries) {
      if (e.type !== "document") continue;
      const status = (e.status || "").toLowerCase();
      if (!DOC_SUCCESS_STATUSES.has(status)) continue;
      names.add(e.title || e.id);
    }
    return names.size;
  }, [entries]);

  const loadEntries = useCallback(async () => {
    setLoading(true);

    const [entriesRes, docsRes] = await Promise.all([
      supabase.from("entries").select("id, type, title, content, summary, image_url, skill_pillar, framework_tag, pinned, created_at"),
      supabase.from("documents").select("id, filename, file_url, file_type, status, summary, page_count, file_size, created_at, error_message"),
    ]);

    if (entriesRes.error) { toast.error("Failed to load sources"); setLoading(false); return; }

    const entryItems: SourceEntry[] = (entriesRes.data || []) as any[];
    // Dedupe documents by filename — keep the most recent row per filename so the
    // list never shows the same file twice when it's been re-uploaded.
    const rawDocs = (docsRes.data || []) as any[];
    const dedupedDocsByName = new Map<string, any>();
    for (const d of rawDocs) {
      const key = d.filename ?? `__id__:${d.id}`;
      const existing = dedupedDocsByName.get(key);
      if (!existing || new Date(d.created_at).getTime() > new Date(existing.created_at).getTime()) {
        dedupedDocsByName.set(key, d);
      }
    }
    const docItems: SourceEntry[] = Array.from(dedupedDocsByName.values()).map((d: any) => ({
      id: d.id,
      type: "document",
      title: d.filename,
      content: d.summary || d.filename,
      summary: d.summary,
      image_url: d.file_url,
      skill_pillar: null,
      framework_tag: null,
      pinned: false,
      created_at: d.created_at,
      file_url: d.file_url,
      file_type: d.file_type,
      page_count: d.page_count,
      file_size: d.file_size,
      status: d.status,
      error_message: d.error_message,
    }));

    const combined = [...entryItems, ...docItems];
    setEntries(combined);
    setTotalCount(combined.length);
    setHasMore(false);
    setLoading(false);
    setLoadingMore(false);

    // Auto-recover stuck pending docs (idempotent, capped). Avoids duplicate storms
    // by only retrying once per page mount and skipping anything already processing.
    const stuckPending = (docsRes.data || []).filter((d: any) => d.status === "pending").slice(0, 3);
    if (stuckPending.length > 0) {
      console.log(`[SourcesSubTab] auto-retrying ${stuckPending.length} pending document(s)`);
      for (const d of stuckPending) {
        supabase.functions.invoke("ingest-document", { body: { document_id: d.id } })
          .then(({ error }) => {
            if (error) console.error(`[SourcesSubTab] auto-retry failed for ${d.id}:`, error);
          })
          .catch((e) => console.error(`[SourcesSubTab] auto-retry exception for ${d.id}:`, e));
      }
    }
  }, []);

  // Manual retry (used by "Tap to retry" buttons)
  const retryDocument = useCallback(async (documentId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Please sign in again."); return; }
    await supabase
      .from("documents")
      .update({ status: "processing", error_message: null } as any)
      .eq("id", documentId);
    setEntries(prev => prev.map(x => x.id === documentId ? { ...x, status: "processing", error_message: null } : x));
    const { error } = await supabase.functions.invoke("ingest-document", {
      body: { document_id: documentId },
    });
    if (error) {
      console.error("[SourcesSubTab] retry invoke error:", error);
      toast.error(`Retry failed: ${error.message || "unknown"}`);
      await supabase
        .from("documents")
        .update({ status: "error", error_message: `Retry trigger failed: ${error.message || "unknown"}` } as any)
        .eq("id", documentId);
      setEntries(prev => prev.map(x => x.id === documentId
        ? { ...x, status: "error", error_message: `Retry trigger failed: ${error.message || "unknown"}` }
        : x));
      return;
    }
    toast("Retrying…");
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  useEffect(() => {
    const handleDocumentStatusChange = () => {
      void loadEntries();
    };

    window.addEventListener(DOCUMENT_STATUS_EVENT, handleDocumentStatusChange);
    return () => window.removeEventListener(DOCUMENT_STATUS_EVENT, handleDocumentStatusChange);
  }, [loadEntries]);

  // Client-side filter + search + sort
  const visibleEntries = useMemo(() => {
    let list = entries;
    if (filter !== "all") {
      const typeMatch = FILTER_LABELS.find(f => f.key === filter)?.typeMatch;
      if (typeMatch) list = list.filter(e => e.type === typeMatch);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e =>
        (e.title || "").toLowerCase().includes(q) ||
        (e.content || "").toLowerCase().includes(q) ||
        (e.summary || "").toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    switch (sortKey) {
      case "recent": sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)); break;
      case "oldest": sorted.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)); break;
      case "pinned": sorted.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (+new Date(b.created_at) - +new Date(a.created_at))); break;
    }
    return sorted;
  }, [entries, filter, search, sortKey]);

  const handleScroll = useCallback(() => {
    // No pagination — all loaded client-side
  }, []);

  const togglePin = async (entry: SourceEntry) => {
    const newPinned = !entry.pinned;
    const { error } = await supabase.from("entries").update({ pinned: newPinned }).eq("id", entry.id);
    if (error) { toast.error("Failed to update pin"); return; }
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, pinned: newPinned } : e));
    toast(newPinned ? "Source pinned" : "Source unpinned");
  };

  const handleDelete = async (id: string) => {
    const target = entries.find(e => e.id === id);
    const table = target?.type === "document" ? "documents" : "entries";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    setEntries(prev => prev.filter(e => e.id !== id));
    setTotalCount(prev => prev - 1);
    setDeleteTarget(null);
    setExpandedId(null);
    toast.success("Source deleted");
  };

  /* ── Empty state ── */
  if (!loading && entries.length === 0 && !search && filter === "all") {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(197,165,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", border: "1px solid rgba(197,165,90,0.15)" }}>
          <FileUp className="w-6 h-6" style={{ color: "var(--brand)" }} />
        </div>
        <p style={{ color: "var(--ink-7)", fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Your knowledge starts here.</p>
        <p style={{ color: "var(--ink-5)", fontSize: 13, margin: "0 0 24px", maxWidth: 340, marginLeft: "auto", marginRight: "auto" }}>Capture a URL, note, or document to build your intelligence base.</p>
        <button onClick={onOpenCapture} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "var(--brand)", color: "var(--ink)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          Capture your first source
        </button>
      </div>
    );
  }

  const Icon = (type: string) => ICONS[type] || Type;

  return (
    <div>
      {/* Header count */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div className="w-8 h-8 rounded-lg" style={{ background: "rgba(197,165,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(197,165,90,0.15)" }}>
          <FileUp className="w-4 h-4" style={{ color: "var(--brand)" }} />
        </div>
        <h2 style={{ color: "var(--ink-5)", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>Sources</h2>
        <span style={{ color: "var(--ink-5)", fontSize: 12, marginLeft: "auto" }}>{totalCount} captured</span>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search your sources..."
          style={{ width: "100%", paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10, background: "var(--surface-ink-subtle)", border: "1px solid var(--ink-3)", borderRadius: 12, color: "var(--ink-7)", fontSize: 13, outline: "none" }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--ink-3)"; }}
        />
      </div>

      {/* Filters + sort */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, paddingBottom: 2 }} className="scrollbar-hide">
          {FILTER_LABELS.map(f => {
            const isActive = filter === f.key;
            const count =
              f.key === "all"
                ? totalCount
                : f.key === "document"
                  ? processedDocsCount
                  : (typeCounts[f.typeMatch || ""] || 0);
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                  cursor: "pointer", whiteSpace: "nowrap",
                  background: isActive ? "rgba(197,165,90,0.15)" : "var(--surface-ink-raised)",
                  color: isActive ? "var(--brand)" : "var(--ink-5)",
                  border: `1px solid ${isActive ? "var(--brand)" : "var(--ink-3)"}`,
                }}
              >
                {f.label} ({count})
              </button>
            );
          })}
        </div>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          style={{ background: "var(--surface-ink-subtle)", color: "var(--ink-7)", fontSize: 11, fontWeight: 500, border: "1px solid var(--ink-3)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", outline: "none", flexShrink: 0 }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--ink-3)"; }}
        >
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest first</option>
          <option value="pinned">Pinned first</option>
        </select>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
        </div>
      ) : visibleEntries.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <p style={{ color: "var(--ink-5)", fontSize: 13 }}>No sources match your search.</p>
        </div>
      ) : (
        <div ref={scrollRef} onScroll={handleScroll} style={{ maxHeight: "calc(100vh - 460px)", overflowY: "auto" }} className="scrollbar-hide">
          {visibleEntries.map(entry => {
            const isExpanded = expandedId === entry.id;
            const EntryIcon = Icon(entry.type);
            const isDoc = entry.type === "document";
            const displayTitle = entry.title || entry.content.slice(0, 60);
            const docStatus = isDoc ? (entry.status || "processing") : null;
            const isStuckProcessing = isDoc && docStatus === "processing" && isDocProcessingStuck(docStatus, entry.created_at);
            const isProcessing = isDoc && !isStuckProcessing && (docStatus === "processing" || docStatus === "pending");
            const isErrored = isDoc && (docStatus === "error" || isStuckProcessing);
            const isReady = isDoc && DOC_SUCCESS_STATUSES.has((docStatus || "").toLowerCase());
            const docSizeLabel = isDoc ? formatBytes(entry.file_size) : null;
            const docTypeLabel = isDoc && isReady ? (entry.file_type || "FILE").toString().toUpperCase() : null;
            const docPagesLabel = isDoc && isReady && entry.page_count ? `${entry.page_count} ${entry.page_count === 1 ? "page" : "pages"}` : null;
            const canDownload = (isDoc && !!entry.file_url) || (entry.type === "image" && !!entry.image_url);
            const preview = isDoc
              ? (isReady ? (entry.summary || "").slice(0, 120) : "")
              : (entry.summary || entry.content).slice(0, 120);
            const domain = entry.type === "link" ? extractDomain(entry.image_url) || extractDomain(entry.content) : null;

            return (
              <div key={`${entry.type}-${entry.id}`} style={{ background: "var(--surface-ink-raised)", borderRadius: 14, border: "1px solid var(--ink-3)", marginBottom: 10, overflow: "hidden", position: "relative" }} className="group">
                {/* Open button */}
                <button
                  onClick={e => { e.stopPropagation(); openEntryInNewTab(entry); }}
                  title="Open in new tab"
                  style={{ position: "absolute", top: 12, right: canDownload ? 96 : 68, zIndex: 2, background: "none", border: "none", cursor: "pointer", padding: 4 }}
                  className="text-ink-5 hover:text-brand transition-colors"
                >
                  <ExternalLink size={14} />
                </button>

                {/* Download button (documents + images) */}
                {canDownload && (
                  <button
                    onClick={e => { e.stopPropagation(); downloadEntryFile(entry); }}
                    title="Download file"
                    style={{ position: "absolute", top: 12, right: 68, zIndex: 2, background: "none", border: "none", cursor: "pointer", padding: 4 }}
                    className="text-ink-5 hover:text-brand transition-colors"
                  >
                    <Download size={14} />
                  </button>
                )}

                {/* Pin button (entries only) */}
                {!isDoc && (
                  <button
                    onClick={e => { e.stopPropagation(); togglePin(entry); }}
                    style={{ position: "absolute", top: 12, right: 40, zIndex: 2, background: "none", border: "none", cursor: "pointer", padding: 4 }}
                  >
                    {entry.pinned
                      ? <Pin size={14} fill="var(--brand)" color="var(--brand)" />
                      : <PinOff size={14} color="var(--ink-4)" />}
                  </button>
                )}

                {/* Delete button */}
                <button
                  onClick={e => { e.stopPropagation(); setDeleteTarget(entry.id); }}
                  className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:!opacity-100"
                  style={{ position: "absolute", top: 12, right: 12, zIndex: 2, background: "none", border: "none", cursor: "pointer", padding: 4, transition: "opacity 0.2s" }}
                >
                  <Trash2 size={14} color="var(--ink-5)" />
                </button>

                {/* Card content */}
                <div
                  onClick={() => !isDoc && setExpandedId(isExpanded ? null : entry.id)}
                  style={{ padding: 16, cursor: isDoc ? "default" : "pointer" }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(197,165,90,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <EntryIcon size={16} style={{ color: "var(--brand)" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 60 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <TypeBadge type={entry.type} />
                        <p style={{ color: "var(--ink-7)", fontSize: 14, fontWeight: 600, margin: 0, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{displayTitle}</p>
                      </div>
                      {isProcessing ? (
                        <div style={{ margin: "0 0 6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--warning)" }} />
                            <p style={{ color: "var(--warning)", fontSize: 12, lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
                              {docStatus === "pending" ? "Queued for processing…" : "Processing…"}
                            </p>
                            <span style={{ color: "var(--ink-5)", fontSize: 11 }}>· Started {relativeTime(entry.created_at)}</span>
                          </div>
                          {docStatus === "pending" && (
                            <button
                              onClick={(ev) => { ev.stopPropagation(); retryDocument(entry.id); }}
                              style={{ background: "transparent", border: "none", color: "var(--brand)", fontSize: 11, padding: 0, marginTop: 4, cursor: "pointer", textDecoration: "underline" }}
                            >
                              Tap to retry
                            </button>
                          )}
                        </div>
                      ) : isErrored ? (
                        <div style={{ margin: "0 0 6px" }}>
                          <p style={{ color: "var(--danger)", fontSize: 12, lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
                            {humanizeDocError(entry.error_message).headline}
                          </p>
                          {humanizeDocError(entry.error_message).detail && (
                            <p style={{ color: "var(--ink-5)", fontSize: 11, lineHeight: 1.45, margin: "2px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {humanizeDocError(entry.error_message).detail}
                            </p>
                          )}
                          <button
                            onClick={(ev) => { ev.stopPropagation(); retryDocument(entry.id); }}
                            style={{ background: "transparent", border: "none", color: "var(--brand)", fontSize: 11, padding: 0, marginTop: 4, cursor: "pointer", textDecoration: "underline" }}
                          >
                            Tap to retry
                          </button>
                        </div>
                      ) : preview ? (
                        <p style={{ color: "var(--ink-5)", fontSize: 12, lineHeight: 1.5, margin: "0 0 6px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{preview}{preview.length >= 120 ? "…" : ""}</p>
                      ) : null}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {docTypeLabel && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "rgba(127,119,221,0.12)", color: "#9b94e8", letterSpacing: "0.04em" }}>{docTypeLabel}</span>
                        )}
                        {docPagesLabel && (
                          <span style={{ fontSize: 11, color: "#9b94e8", fontWeight: 500 }}>{docPagesLabel}</span>
                        )}
                        {docSizeLabel && (
                          <span style={{ fontSize: 11, color: "#9b94e8", fontWeight: 500 }}>· {docSizeLabel}</span>
                        )}
                        {domain && <span style={{ fontSize: 11, color: "var(--ink-5)" }}>{domain}</span>}
                        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{relativeTime(entry.created_at)}</span>
                        {entry.has_signal && (
                          <span title="Signal generated from this source" style={{ color: "var(--brand)", display: "flex", alignItems: "center" }}>
                            <Zap size={12} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded (entries only) */}
                {isExpanded && !isDoc && (
                  <ExpandedSource
                    entry={entry}
                    onDelete={() => handleDelete(entry.id)}
                    onSwitchToSignal={onSwitchToSignal}
                    onDetectSignal={(id) => {}}
                  />
                )}
              </div>
            );
          })}

          {/* Load more spinner */}
          {loadingMore && (
            <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--brand)" }} />
            </div>
          )}
          {!hasMore && visibleEntries.length > 0 && (
            <p style={{ color: "var(--ink-4)", fontSize: 11, textAlign: "center", padding: 12 }}>All sources loaded</p>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteDialog
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default SourcesSubTab;
