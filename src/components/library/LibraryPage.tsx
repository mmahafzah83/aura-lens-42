import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Chip, ButtonPrimary } from "@/components/systemb";
import { isArabicText } from "@/lib/utils";
import { formatSmartDate } from "@/lib/formatDate";
import { LayoutGrid, List as ListIcon, Plus, Star } from "lucide-react";
import { isAuraPublishedPost } from "@/lib/postProvenance";

/**
 * LibraryPage — everything the user captured, and what Aura made of it.
 *
 * Pure UI over existing data. Every displayed number is an exact count or a
 * count over a fully-loaded derivation — never the length of a limited fetch.
 * Only fields that exist in the database are rendered: no read state, no
 * source badges beyond link / text / image, no invented signal numbers.
 */

const MONO: React.CSSProperties = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" };

const PAGE = 40;

type LibFilter = "all" | "signal" | "published" | "starred";

interface EntryRow {
  id: string;
  type: string | null;
  title: string | null;
  content: string | null;
  image_url: string | null;
  pinned: boolean | null;
  created_at: string | null;
}

interface SignalLink { id: string; title: string; published: boolean }

const SegBtn: React.FC<React.PropsWithChildren<{ active: boolean; onClick: () => void }>> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="cursor-pointer v23-focus v23-tap"
    aria-pressed={active}
    style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "6px 14px", borderRadius: 7, border: 0, cursor: "pointer",
      fontFamily: "var(--ff-ui)", fontSize: 12.5, fontWeight: 600,
      background: active ? "var(--surface-card)" : "transparent",
      color: active ? "var(--text-primary)" : "var(--text-secondary)",
      boxShadow: active ? "var(--v23-card-rest)" : "none",
      transition: "background 160ms ease, color 160ms ease",
    }}
  >{children}</button>
);

function domainOf(e: EntryRow): string | null {
  if (e.type !== "link" || !e.image_url) return null;
  try { return new URL(e.image_url).hostname.replace(/^www\./, ""); } catch { return null; }
}

function displayTitle(e: EntryRow): string {
  const t = (e.title || "").trim();
  if (t) return t;
  const d = domainOf(e);
  if (d) return d;
  const c = (e.content || "").trim();
  return c ? (c.length > 60 ? `${c.slice(0, 60)}…` : c) : "Untitled capture";
}

/** Plain estimate: 200 words a minute over the stored content. */
function readMinutes(e: EntryRow): number | null {
  const words = (e.content || "").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return null;
  return Math.max(1, Math.round(words / 200));
}

const TYPE_LABEL: Record<string, string> = { link: "Link", text: "Note", image: "Image" };

interface Props {
  onOpenCapture?: (prefillUrl?: string, prefillText?: string) => void;
}

const LibraryPage: React.FC<Props> = ({ onOpenCapture }) => {
  const [, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [signalByEntry, setSignalByEntry] = useState<Record<string, SignalLink>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<LibFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Exact total — head count, never an array length.
      const totalRes = await (supabase.from("entries" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      setTotalCount(totalRes?.count ?? 0);

      const [entriesRes, regRes, sigRes, postRes] = await Promise.all([
        (supabase.from("entries" as any) as any)
          .select("id, type, title, content, image_url, pinned, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        (supabase.from("source_registry" as any) as any)
          .select("id, source_id")
          .eq("user_id", user.id)
          .eq("source_type", "entry"),
        (supabase.from("strategic_signals" as any) as any)
          .select("id, signal_title, supporting_evidence_ids")
          .eq("user_id", user.id),
        (supabase.from("linkedin_posts" as any) as any)
          .select("source_metadata, source_type, tracking_status")
          .eq("user_id", user.id),
      ]);

      const rows: EntryRow[] = (entriesRes?.data || []) as EntryRow[];
      setEntries(rows);
      setStarred(new Set(rows.filter(r => r.pinned).map(r => r.id)));

      // registry id -> entry id
      const regToEntry = new Map<string, string>();
      for (const r of (regRes?.data || []) as any[]) regToEntry.set(r.id, r.source_id);

      // fragment id -> entry id (fragments join through source_registry)
      const regIds = [...regToEntry.keys()];
      const fragToEntry = new Map<string, string>();
      for (let i = 0; i < regIds.length; i += 200) {
        const slice = regIds.slice(i, i + 200);
        // Page through: PostgREST caps a single response, and a truncated
        // fetch would silently understate every derived count.
        const PAGE_ROWS = 1000;
        for (let from = 0; ; from += PAGE_ROWS) {
          const { data } = await (supabase.from("evidence_fragments" as any) as any)
            .select("id, source_registry_id")
            .in("source_registry_id", slice)
            .range(from, from + PAGE_ROWS - 1);
          const batch = (data || []) as any[];
          for (const f of batch) {
            const eid = regToEntry.get(f.source_registry_id);
            if (eid) fragToEntry.set(f.id, eid);
          }
          if (batch.length < PAGE_ROWS) break;
        }
      }

      // signals published from — signal id inside source_metadata->signal_ids
      // Only posts Aura produced AND the user published count here — a draft
      // that quotes a signal is not "published from".
      const publishedSignalIds = new Set<string>();
      for (const p of ((postRes?.data || []) as any[]).filter(isAuraPublishedPost)) {
        const ids = p?.source_metadata?.signal_ids;
        if (Array.isArray(ids)) for (const id of ids) if (typeof id === "string") publishedSignalIds.add(id);
      }

      const map: Record<string, SignalLink> = {};
      for (const s of (sigRes?.data || []) as any[]) {
        const evidence: string[] = Array.isArray(s.supporting_evidence_ids) ? s.supporting_evidence_ids : [];
        const published = publishedSignalIds.has(s.id);
        for (const fid of evidence) {
          const eid = fragToEntry.get(fid);
          if (!eid) continue;
          const prev = map[eid];
          // A published signal always wins the footer slot.
          if (!prev || (published && !prev.published)) {
            map[eid] = { id: s.id, title: s.signal_title, published };
          }
        }
      }
      setSignalByEntry(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setShown(PAGE); }, [filter]);

  const counts = useMemo(() => {
    let signal = 0, published = 0;
    for (const e of entries) {
      const s = signalByEntry[e.id];
      if (s) { signal += 1; if (s.published) published += 1; }
    }
    return { all: totalCount, signal, published, starred: starred.size };
  }, [entries, signalByEntry, totalCount, starred]);

  const filtered = useMemo(() => entries.filter(e => {
    if (filter === "signal") return !!signalByEntry[e.id];
    if (filter === "published") return !!signalByEntry[e.id]?.published;
    if (filter === "starred") return starred.has(e.id);
    return true;
  }), [entries, filter, signalByEntry, starred]);

  const toggleStar = async (e: EntryRow) => {
    const next = !starred.has(e.id);
    setStarred(prev => {
      const s = new Set(prev);
      if (next) s.add(e.id); else s.delete(e.id);
      return s;
    });
    const { error } = await (supabase.from("entries" as any) as any)
      .update({ pinned: next })
      .eq("id", e.id);
    if (error) {
      setStarred(prev => {
        const s = new Set(prev);
        if (next) s.delete(e.id); else s.add(e.id);
        return s;
      });
    }
  };

  const openSignal = (id: string) => {
    const next = new URLSearchParams(window.location.search);
    next.set("tab", "intelligence");
    next.set("signal", id);
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const chips: Array<{ key: LibFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "signal", label: "Used in a signal", count: counts.signal },
    { key: "published", label: "Published through Aura", count: counts.published },
    { key: "starred", label: "Starred", count: counts.starred },
  ];

  const Card: React.FC<{ e: EntryRow }> = ({ e }) => {
    const sig = signalByEntry[e.id];
    const title = displayTitle(e);
    const ar = isArabicText(title);
    const dom = domainOf(e);
    const mins = readMinutes(e);
    const isStarred = starred.has(e.id);
    return (
      <div
        data-testid="library-card"
        style={{
          background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
          borderRadius: 12, padding: 13, boxShadow: "var(--v23-card-rest)",
          minHeight: view === "grid" ? 150 : undefined,
          display: "flex", flexDirection: "column", fontFamily: "var(--ff-ui)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Chip variant="cooling">{TYPE_LABEL[e.type || ""] || "Note"}</Chip>
          {dom && (
            <span style={{ ...MONO, fontSize: 10.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {dom}
            </span>
          )}
          <button
            type="button"
            aria-label={isStarred ? "Remove star" : "Star this capture"}
            aria-pressed={isStarred}
            data-testid="library-star"
            onClick={() => void toggleStar(e)}
            className="cursor-pointer v23-focus"
            style={{
              marginInlineStart: "auto", background: "transparent", border: 0,
              width: 40, height: 40, minHeight: 40, marginBlock: -8,
              alignItems: "center", justifyContent: "center",
              borderRadius: 999, display: "inline-flex", cursor: "pointer",
              color: isStarred ? "var(--act)" : "var(--text-muted)",
            }}
          >
            <Star size={14} fill={isStarred ? "currentColor" : "none"} />
          </button>
        </div>

        <div
          dir="auto"
          style={{
            fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)",
            fontFamily: ar ? "var(--ff-ar)" : "var(--ff-ui)",
            lineHeight: ar ? 1.9 : 1.4,
            display: "-webkit-box", WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2, overflow: "hidden",
          }}
        >{title}</div>

        <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-muted)", marginTop: 8 }}>
          {mins ? `~${mins} min read (estimate) · ` : ""}{formatSmartDate(e.created_at || "")}
        </div>

        <div style={{ marginTop: "auto", paddingTop: 12 }}>
          {sig ? (
            <button
              type="button"
              onClick={() => openSignal(sig.id)}
              className="cursor-pointer v23-focus v23-tap"
              title={sig.title}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%",
                padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                background: "var(--act-tint)", color: "var(--act-hover)",
                border: "1px solid var(--act)", fontFamily: "var(--ff-ui)", fontSize: 11.5, fontWeight: 600,
              }}
            >
              <span dir="auto" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sig.title}</span>
            </button>
          ) : (
            <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Not used yet
            </span>
          )}
        </div>
      </div>
    );
  };

  const visible = filtered.slice(0, shown);

  return (
    <section data-testid="library-page" style={{ fontFamily: "var(--ff-ui)", marginBottom: 26 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Library
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 26, lineHeight: 1.15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-.01em" }}>
            Everything you've kept
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)", maxWidth: 620 }}>
            Everything you've captured, and what Aura made of it.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 9, background: "var(--surface-subtle)" }}>
            <SegBtn active={view === "list"} onClick={() => setView("list")}><ListIcon size={13} />List</SegBtn>
            <SegBtn active={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={13} />Grid</SegBtn>
          </div>
          <ButtonPrimary onClick={() => onOpenCapture?.()}><Plus size={13} />Capture something</ButtonPrimary>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {chips.map(c => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              data-testid={`library-chip-${c.key}`}
              onClick={() => setFilter(c.key)}
              className="cursor-pointer v23-focus v23-tap"
              aria-pressed={active}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "6px 14px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${active ? "var(--act)" : "var(--rule-outer)"}`,
                background: active ? "var(--act-tint)" : "var(--surface-card)",
                color: active ? "var(--act-hover)" : "var(--text-secondary)",
                fontFamily: "var(--ff-ui)", fontSize: 12.5, fontWeight: 600,
              }}
            >
              <span>{c.label}</span>
              <span style={{ ...MONO, fontSize: 11.5 }}>{loading ? "—" : c.count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ ...MONO, fontSize: 11, color: "var(--text-muted)", padding: 20 }}>Opening your library…</div>
      ) : counts.all === 0 ? (
        <div
          data-testid="library-empty"
          style={{
            background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
            borderRadius: 14, padding: "44px 26px", textAlign: "center",
            boxShadow: "var(--v23-card-rest)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
            Nothing in here yet — and that's the whole job
          </h2>
          <p style={{ margin: "10px auto 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)", maxWidth: 520 }}>
            Aura can't find a signal until it has something to read. Paste one link you found interesting this week. Eight seconds, and the machine starts working tonight.
          </p>
          <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
            <ButtonPrimary onClick={() => onOpenCapture?.("", undefined)}><Plus size={13} />Paste your first link</ButtonPrimary>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...MONO, fontSize: 11.5, color: "var(--text-muted)", padding: "22px 4px" }}>
          Nothing under “{chips.find(c => c.key === filter)?.label}” yet. Try another filter, or capture something and it lands here.
        </div>
      ) : (
        <>
          <div
            className={view === "grid" ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-1"}
            style={{ gap: 14, alignItems: "start" }}
          >
            {visible.map(e => <Card key={e.id} e={e} />)}
          </div>
          {shown < filtered.length && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
              <button
                type="button"
                data-testid="library-load-more"
                onClick={() => setShown(s => s + PAGE)}
                className="cursor-pointer v23-focus"
                style={{
                  padding: "9px 16px", borderRadius: 9, cursor: "pointer",
                  border: "1px solid var(--rule-outer)", background: "var(--surface-card)",
                  color: "var(--text-primary)", fontFamily: "var(--ff-ui)", fontSize: 12.5, fontWeight: 600,
                }}
              >
                Load more ({filtered.length - shown} left)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default LibraryPage;
