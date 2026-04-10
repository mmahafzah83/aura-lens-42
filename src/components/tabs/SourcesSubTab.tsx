import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Link, Type, FileUp, Mic, ImageIcon, Search, Pin, PinOff, Trash2,
  Loader2, Zap, ChevronDown, ChevronUp, ExternalLink, Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
}

type FilterKey = "all" | "link" | "text" | "document" | "voice" | "image";
type SortKey = "recent" | "oldest" | "pinned";

const ICONS: Record<string, typeof Link> = { link: Link, text: Type, document: FileUp, voice: Mic, image: ImageIcon };
const FILTER_LABELS: { key: FilterKey; label: string; typeMatch?: string }[] = [
  { key: "all", label: "All" },
  { key: "link", label: "URLs", typeMatch: "link" },
  { key: "text", label: "Notes", typeMatch: "text" },
  { key: "document", label: "Documents", typeMatch: "document" },
  { key: "voice", label: "Voice", typeMatch: "voice" },
  { key: "image", label: "Images", typeMatch: "image" },
];

const PAGE_SIZE = 20;

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

/* ── Delete Confirmation Dialog ── */

const DeleteDialog = ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) =>
  createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)" }} onClick={onCancel} />
      <div style={{ position: "relative", background: "#1a1a1a", borderRadius: 16, padding: 24, width: 360, maxWidth: "90vw", border: "1px solid #252525" }}>
        <p style={{ color: "#f0f0f0", fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>Delete this source?</p>
        <p style={{ color: "#888", fontSize: 13, margin: "0 0 20px" }}>This cannot be undone.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid #2a2a2a", background: "transparent", color: "#888", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: "#E24B4A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
        </div>
      </div>
    </div>,
    document.body,
  );

/* ── Open entry in new tab helper ── */

function openEntryInNewTab(entry: SourceEntry) {
  const url = entry.image_url || (entry.content.match(/^https?:\/\//) ? entry.content.split(/\s/)[0] : null);
  if (url) {
    window.open(url, "_blank", "noopener");
  } else {
    // For notes/voice without a URL, open content as a text blob
    const blob = new Blob([`${entry.title || "Source"}\n\n${entry.content}`], { type: "text/plain" });
    window.open(URL.createObjectURL(blob), "_blank");
  }
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
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ entry_id: entry.id }),
      });
      if (!resp.ok) throw new Error("Detection failed");
      toast.success("Signal detection triggered");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDetecting(false);
    }
  };

  const sourceUrl = entry.type === "link" ? (entry.image_url || (entry.content.match(/^https?:\/\//) ? entry.content.split(/\s/)[0] : null)) : null;

  return (
    <div style={{ padding: "0 16px 16px", borderTop: "1px solid #1f1f1f" }}>
      {editing ? (
        <div style={{ marginTop: 14 }}>
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Title"
            style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "8px 12px", color: "#f0f0f0", fontSize: 14, marginBottom: 10, outline: "none" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#C5A55A"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
          />
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            rows={6}
            style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "8px 12px", color: "#f0f0f0", fontSize: 13, resize: "vertical", outline: "none" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#C5A55A"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={handleSaveEdit} disabled={saving} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#C5A55A", color: "#0d0d0d", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setEditing(false)} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #2a2a2a", background: "transparent", color: "#888", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ color: "#ccc", fontSize: 13, lineHeight: 1.6, margin: "14px 0", whiteSpace: "pre-wrap" }}>{entry.content}</p>

          {entry.summary && entry.summary !== entry.content && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: "0.08em", marginBottom: 4 }}>SUMMARY</p>
              <p style={{ color: "#888", fontSize: 13, lineHeight: 1.5, margin: 0 }}>{entry.summary}</p>
            </div>
          )}

          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#C5A55A", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12, textDecoration: "none" }}>
              <ExternalLink size={12} /> {extractDomain(sourceUrl) || sourceUrl}
            </a>
          )}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {entry.skill_pillar && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(197,165,90,0.1)", color: "#C5A55A" }}>{entry.skill_pillar}</span>
            )}
            {entry.framework_tag && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#1a1a1a", color: "#666", border: "1px solid #252525" }}>{entry.framework_tag}</span>
            )}
          </div>

          {/* Signals from this source */}
          <div style={{ marginTop: 12 }}>
            <p style={{ color: "#3a3a3a", fontSize: 10, letterSpacing: "0.08em", marginBottom: 8 }}>SIGNALS FROM THIS SOURCE</p>
            {loadingSignals ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#3a3a3a" }} />
            ) : linkedSignals.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {linkedSignals.map(s => (
                  <button key={s.id} onClick={() => onSwitchToSignal(s.id)} style={{ background: "none", border: "none", color: "#C5A55A", fontSize: 12, cursor: "pointer", textAlign: "left", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <Zap size={12} /> {s.signal_title}
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ color: "#3a3a3a", fontSize: 12 }}>No signals detected from this source yet.</p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button onClick={() => openEntryInNewTab(entry)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #C5A55A", background: "transparent", color: "#C5A55A", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <ExternalLink size={14} /> Open
            </button>
            <button onClick={handleDetect} disabled={detecting} style={{ padding: "10px 16px", borderRadius: 10, background: "#C5A55A", color: "#0d0d0d", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer" }}>
              {detecting ? <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline" }} /> : <Zap size={14} style={{ display: "inline", marginRight: 4 }} />}
              Detect Signal
            </button>
            <button onClick={() => setEditing(true)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #2a2a2a", background: "transparent", color: "#888", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => setDeleteTarget(true)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #2a2a2a", background: "transparent", color: "#E24B4A", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
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

  const loadEntries = useCallback(async (offset: number, append: boolean) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);

    let query = supabase.from("entries").select("id, type, title, content, summary, image_url, skill_pillar, framework_tag, pinned, created_at", { count: offset === 0 ? "exact" : undefined });

    if (filter !== "all") {
      const typeMatch = FILTER_LABELS.find(f => f.key === filter)?.typeMatch;
      if (typeMatch) query = query.eq("type", typeMatch);
    }

    if (search.trim()) {
      query = query.or(`title.ilike.%${search.trim()}%,content.ilike.%${search.trim()}%,summary.ilike.%${search.trim()}%`);
    }

    switch (sortKey) {
      case "recent": query = query.order("created_at", { ascending: false }); break;
      case "oldest": query = query.order("created_at", { ascending: true }); break;
      case "pinned": query = query.order("pinned", { ascending: false }).order("created_at", { ascending: false }); break;
    }

    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) { toast.error("Failed to load sources"); setLoading(false); setLoadingMore(false); return; }

    const items = (data || []) as unknown as SourceEntry[];
    if (offset === 0 && count !== null) setTotalCount(count);
    if (items.length < PAGE_SIZE) setHasMore(false);

    if (append) setEntries(prev => [...prev, ...items]);
    else { setEntries(items); setHasMore(items.length === PAGE_SIZE); }

    setLoading(false);
    setLoadingMore(false);
  }, [filter, search, sortKey]);

  useEffect(() => { loadEntries(0, false); }, [loadEntries]);

  // Also get total count for "all" (not filtered)
  useEffect(() => {
    (async () => {
      const { count } = await supabase.from("entries").select("id", { count: "exact", head: true });
      if (count !== null) setTotalCount(count);
    })();
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || loadingMore || !hasMore) return;
    const el = scrollRef.current;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      loadEntries(entries.length, true);
    }
  }, [entries.length, loadingMore, hasMore, loadEntries]);

  const togglePin = async (entry: SourceEntry) => {
    const newPinned = !entry.pinned;
    const { error } = await supabase.from("entries").update({ pinned: newPinned }).eq("id", entry.id);
    if (error) { toast.error("Failed to update pin"); return; }
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, pinned: newPinned } : e));
    toast(newPinned ? "Source pinned" : "Source unpinned");
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("entries").delete().eq("id", id);
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
          <FileUp className="w-6 h-6" style={{ color: "#C5A55A" }} />
        </div>
        <p style={{ color: "#f0f0f0", fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Your knowledge starts here.</p>
        <p style={{ color: "#666", fontSize: 13, margin: "0 0 24px", maxWidth: 340, marginLeft: "auto", marginRight: "auto" }}>Capture a URL, note, or document to build your intelligence base.</p>
        <button onClick={onOpenCapture} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "#C5A55A", color: "#0d0d0d", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
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
          <FileUp className="w-4 h-4" style={{ color: "#C5A55A" }} />
        </div>
        <h2 style={{ color: "#888", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>Sources</h2>
        <span style={{ color: "#666", fontSize: 12, marginLeft: "auto" }}>{totalCount} captured</span>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#3a3a3a" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search your sources..."
          style={{ width: "100%", paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10, background: "#1a1a1a", border: "1px solid #252525", borderRadius: 12, color: "#f0f0f0", fontSize: 13, outline: "none" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#C5A55A"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#252525"; }}
        />
      </div>

      {/* Filters + sort */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, paddingBottom: 2 }} className="scrollbar-hide">
          {FILTER_LABELS.map(f => {
            const isActive = filter === f.key;
            const count = f.key === "all" ? totalCount : (typeCounts[f.typeMatch || ""] || 0);
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                  cursor: "pointer", whiteSpace: "nowrap",
                  background: isActive ? "rgba(197,165,90,0.15)" : "#141414",
                  color: isActive ? "#C5A55A" : "#555",
                  border: `1px solid ${isActive ? "#C5A55A" : "#252525"}`,
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
          style={{ background: "#1a1a1a", color: "#ccc", fontSize: 11, fontWeight: 500, border: "1px solid #2a2a2a", borderRadius: 8, padding: "5px 10px", cursor: "pointer", outline: "none", flexShrink: 0 }}
          onFocus={e => { e.currentTarget.style.borderColor = "#C5A55A"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
        >
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest first</option>
          <option value="pinned">Pinned first</option>
        </select>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#C5A55A" }} />
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <p style={{ color: "#666", fontSize: 13 }}>No sources match your search.</p>
        </div>
      ) : (
        <div ref={scrollRef} onScroll={handleScroll} style={{ maxHeight: "calc(100vh - 460px)", overflowY: "auto" }} className="scrollbar-hide">
          {entries.map(entry => {
            const isExpanded = expandedId === entry.id;
            const EntryIcon = Icon(entry.type);
            const displayTitle = entry.title || entry.content.slice(0, 60);
            const preview = (entry.summary || entry.content).slice(0, 120);
            const domain = entry.type === "link" ? extractDomain(entry.image_url) || extractDomain(entry.content) : null;

            return (
              <div key={entry.id} style={{ background: "#141414", borderRadius: 14, border: "1px solid #252525", marginBottom: 10, overflow: "hidden", position: "relative" }} className="group">
                {/* Open button */}
                <button
                  onClick={e => { e.stopPropagation(); openEntryInNewTab(entry); }}
                  title="Open in new tab"
                  style={{ position: "absolute", top: 12, right: 68, zIndex: 2, background: "none", border: "none", cursor: "pointer", padding: 4 }}
                  className="text-[#555] hover:text-[#C5A55A] transition-colors"
                >
                  <ExternalLink size={14} />
                </button>

                {/* Pin button */}
                <button
                  onClick={e => { e.stopPropagation(); togglePin(entry); }}
                  style={{ position: "absolute", top: 12, right: 40, zIndex: 2, background: "none", border: "none", cursor: "pointer", padding: 4 }}
                >
                  {entry.pinned
                    ? <Pin size={14} fill="#C5A55A" color="#C5A55A" />
                    : <PinOff size={14} color="#3a3a3a" />}
                </button>

                {/* Delete button */}
                <button
                  onClick={e => { e.stopPropagation(); setDeleteTarget(entry.id); }}
                  className="opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:!opacity-100"
                  style={{ position: "absolute", top: 12, right: 12, zIndex: 2, background: "none", border: "none", cursor: "pointer", padding: 4, transition: "opacity 0.2s" }}
                >
                  <Trash2 size={14} color="#555" />
                </button>

                {/* Card content */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  style={{ padding: 16, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(197,165,90,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <EntryIcon size={16} style={{ color: "#C5A55A" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 60 }}>
                      <p style={{ color: "#f0f0f0", fontSize: 14, fontWeight: 600, margin: "0 0 4px", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayTitle}</p>
                      <p style={{ color: "#666", fontSize: 12, lineHeight: 1.5, margin: "0 0 6px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{preview}{preview.length >= 120 ? "..." : ""}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {domain && <span style={{ fontSize: 11, color: "#555" }}>{domain}</span>}
                        <span style={{ fontSize: 11, color: "#3a3a3a" }}>{relativeTime(entry.created_at)}</span>
                        {entry.has_signal && (
                          <span title="Signal generated from this source" style={{ color: "#C5A55A", display: "flex", alignItems: "center" }}>
                            <Zap size={12} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && (
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
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#C5A55A" }} />
            </div>
          )}
          {!hasMore && entries.length > 0 && (
            <p style={{ color: "#3a3a3a", fontSize: 11, textAlign: "center", padding: 12 }}>All sources loaded</p>
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
