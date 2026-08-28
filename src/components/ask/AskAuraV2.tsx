import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DeskLedger from "./DeskLedger";
import DeskWatchSheet from "@/components/desk/DeskWatchSheet";
import DeskPriorityAsk from "@/components/desk/DeskPriorityAsk";
import DeskMirror from "@/components/desk/DeskMirror";
import DeskCapabilityReply from "@/components/desk/DeskCapabilityReply";
import DeskLinkedInField from "@/components/desk/DeskLinkedInField";
import DeskSlot, { type DeskCardKind } from "@/components/desk/DeskSlot";
import DeskReturnCard, { loadReturnCard, type ReturnCardData } from "@/components/desk/DeskReturnCard";
import {
  capabilityNeeded, isDeclined, loadCapabilities, loadDeskPrefs, panelOn, panelOpen, saveDeskPrefs,
  type Capabilities, type CapabilityKey, type DeskPrefs,
} from "@/components/desk/deskPrefs";
import { cleanMoves, guardClaims, groundBold, honestFailure, answerLang, CHROME } from "@/components/desk/deskMoves";
import { track } from "@/lib/track";
import { cleanMemory, type CleanMemoryRow } from "@/components/desk/deskMemory";


import { beginDeskRun, endDeskRun, setDeskFound } from "@/components/desk/deskDockBus";
import { Settings2, X, Send, ArrowUpRight, Eye, Quote, Gauge, Compass, History, Radar, PenLine, Inbox, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import AuraMark from "@/components/brand/AuraMark";
import { filterPublishedRows } from "@/lib/postProvenance";

/**
 * AskAuraV2 — System-B V23 `s-ask`.
 *
 * Reskin + grounding pass over the existing ask-aura engine. Nothing about the
 * model or the memory schema changes here: the surface renders the same SSE
 * stream, and now also reads the `citations` registry the function returns so
 * every [S-1xx] reference in an answer becomes a pill that resolves to a real
 * strategic_signals row belonging to this user. Refs with no matching row are
 * stripped rather than rendered.
 *
 * Colour law: cyan (--machine) = the machine working — thinking state and
 * citation pills. Blue (--act) = your turn — send and action buttons. Amber
 * appears zero times: no signal on this surface has a clock running.
 *
 * No Radix anywhere: the message list, composer and send button are plain
 * elements so nothing can unmount them mid-stream.
 */

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-aura`;

/** Words that mean "show me the ledger", not "answer me". */
const WANTS_LEDGER = /\b(where\s+do\s+i\s+stand|what('?s| is)\s+waiting|what\s+have\s+i\s+got|what\s+else\s+is\s+waiting|what('?s| is)\s+outstanding|my\s+standing)\b/i;
const MONO: React.CSSProperties = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" };
const AR = /[\u0600-\u06FF]/;

export interface AskContext {
  linkedType?: "signal" | "insight" | "framework" | "content" | "general";
  linkedId?: string;
  linkedLabel?: string;
}

interface Citation {
  ref: string;
  id: string;
  title: string;
  evidence_count: number;
  days_live: number | null;
  velocity_status: string | null;
  confidence: number;
}

/** A retrieved row the answer can cite as a bare [n]. Built by the function from the retrieval layer. */
interface Source {
  n: number;
  title: string;
  kind: string;
  date: string | null;
  url: string | null;
}

/** The real tab router values from src/pages/Dashboard.tsx (NAV_ITEMS). */
const SURFACES = [
  "home", "intelligence", "library", "drafts", "overnight",
  "authority", "influence", "momentum", "widgets", "identity",
] as const;

interface ActionRoute { surface: string; subject_id: string | null }
interface ActionLine { tool: string; ok: boolean; label: string; route?: ActionRoute; /** Only present when the write returned a real row id. */ post_id?: string }

type Msg = { role: "user" | "assistant"; content: string; isError?: boolean; actions?: ActionLine[] };


interface Props {
  open: boolean;
  onClose: () => void;
  initialMessage?: string;
  context?: AskContext;
  /** Optional overnight finding the opener should speak about first. */
  findingId?: string;
}

/* ── Rail data ── */
interface Position {
  topTheme: string | null;
  topThemePct: number;
  publishedLive: number;
  voiceTone: string | null;
  voiceLearnedFrom: number;
}
interface MemoryRow { id: string; session_date: string; summary: string; actions_committed?: string[] | null }

const isAr = (s: string) => AR.test(s || "");

/**
 * The output contract: an answer arrives in layers. The model writes three
 * line-markers; this splits them. It runs on every streamed token, so a
 * half-written marker on the final line must never be treated as a marker.
 *
 * If §§PLAIN never appears the whole text is the plain layer — today's
 * behaviour, which is the safety net.
 */
export function parseLayers(raw: string): { plain: string; more: string; moves: string[] } {
  const text = String(raw ?? "");
  const lines = text.split("\n");
  const isMarker = (l: string, name: string, i: number) =>
    l.trim() === name && (i < lines.length - 1 || text.endsWith("\n"));

  let seenPlain = false;
  for (let i = 0; i < lines.length; i++) if (isMarker(lines[i], "§§PLAIN", i)) { seenPlain = true; break; }
  if (!seenPlain) {
    // Fallback path gets the same guard as the main one: a final line that is
    // only a partial or complete marker is being typed right now — drop it
    // rather than flashing "§§PLAIN" on screen for a frame.
    const last = lines[lines.length - 1].trim();
    if (!text.endsWith("\n") && last.length > 0 && /^§+§?[A-Z]*$/.test(last))
      return { plain: lines.slice(0, -1).join("\n"), more: "", moves: [] };
    return { plain: text, more: "", moves: [] };
  }

  let current: "none" | "plain" | "more" | "moves" = "none";
  const buf = { plain: [] as string[], more: [] as string[], moves: [] as string[] };
  // A last line that is only the beginning of a marker is a marker still being
  // typed — never show it to the member.
  const partial = (l: string, i: number) =>
    i === lines.length - 1 && !text.endsWith("\n") && /^§+§?[A-Z]*$/.test(l.trim()) && l.trim().length > 0;
  lines.forEach((l, i) => {
    if (isMarker(l, "§§PLAIN", i)) { current = "plain"; return; }
    if (isMarker(l, "§§MORE", i)) { current = "more"; return; }
    if (isMarker(l, "§§MOVES", i)) { current = "moves"; return; }
    if (partial(l, i)) return;
    if (current !== "none") buf[current].push(l);
  });


  const plain = buf.plain.join("\n").trim();
  const more = buf.more.join("\n").trim();
  // O3 — the chips are written in the language of the answer they sit under.
  const moves = cleanMoves(buf.moves.join(" ").split("|"), answerLang(`${plain}\n${more}`));
  return { plain, more, moves };
}


/**
 * Which citations this answer actually used. A ref is counted when the model
 * printed the bracketed reference, and — because models routinely cite the
 * title in bold and drop the ref — also when the exact signal title appears in
 * the text. Both paths resolve to the same real strategic_signals row.
 */
function usedCitations(text: string, all: Citation[]): Citation[] {
  const t = text || "";
  return all.filter(c => t.includes(`[${c.ref}]`) || (c.title && t.includes(c.title)));
}

/** Which retrieved sources this answer actually cited as bare [n]. */
function usedSources(text: string, all: Source[]): Source[] {
  const t = text || "";
  return all.filter(s => t.includes(`[${s.n}]`));
}

/** Insert a pill marker for every citation this answer used. */
function markCitations(text: string, byRef: Record<string, Citation>, byNum: Record<number, Source>): string {
  let out = text.replace(/\[(S-\d+)\]/g, (_full, ref: string) =>
    byRef[ref] ? ` \`\u27E6${ref}\u27E7\` ` : "");
  // Bare numeric refs from the retrieval layer: pill when resolved, stripped when not.
  out = out.replace(/\[(\d{1,3})\]/g, (_full, num: string) =>
    byNum[Number(num)] ? ` \`\u27E6#${num}\u27E7\` ` : "");
  for (const c of Object.values(byRef)) {
    if (out.includes(`\u27E6${c.ref}\u27E7`)) continue;
    if (!c.title) continue;
    const i = out.indexOf(c.title);
    if (i === -1) continue;
    out = out.slice(0, i + c.title.length) + ` \`\u27E6${c.ref}\u27E7\` ` + out.slice(i + c.title.length);
  }
  return out;
}

function railLabel(children: React.ReactNode) {
  return (
    <div style={{ ...MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
      {children}
    </div>
  );
}

const PILL_STYLE: React.CSSProperties = {
  ...MONO, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
  verticalAlign: "baseline",
  margin: "0 2px", padding: "4px 10px", minHeight: 24, minWidth: 24, borderRadius: 999,
  fontSize: 11, cursor: "pointer", lineHeight: 1,
  background: "var(--act-tint)",
  border: "1px solid color-mix(in srgb, var(--act) 45%, transparent)",
  color: "var(--act-hover)",
};

const sourceDetail = (s: Source) =>
  [s.title, s.kind.replace(/_/g, " "), s.date || null, s.url ? "opens in a new tab" : "no link on this one"]
    .filter(Boolean).join(" — ");

/* ── Citation pill ── */
const Pill: React.FC<{ c: Citation; onOpen: (id: string) => void }> = ({ c, onOpen }) => (
  <button
    type="button"
    className="ask-focusable"
    data-testid="citation-pill"
    data-signal-id={c.id}
    aria-label={`Signal ${c.ref}: ${c.title}`}
    title={`${c.title} — ${c.evidence_count} capture${c.evidence_count === 1 ? "" : "s"}`}
    onClick={() => onOpen(c.id)}
    style={PILL_STYLE}
  >
    {c.ref}
  </button>
);

/* ── Source pill: same grammar as the citation pill. Opens the url when there is one. ── */
const SourcePill: React.FC<{ s: Source }> = ({ s }) => (
  <button
    type="button"
    className="ask-focusable"
    data-testid="source-pill"
    aria-label={`Source ${s.n}: ${sourceDetail(s)}`}
    title={sourceDetail(s)}
    onClick={() => { if (s.url) window.open(s.url, "_blank", "noopener,noreferrer"); }}
    style={{ ...PILL_STYLE, cursor: s.url ? "pointer" : "default" }}
  >
    {s.n}
  </button>
);

export default function AskAuraV2({ open, onClose, initialMessage, context, findingId }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [citations, setCitations] = useState<Record<string, Citation>>({});
  const [citedOrder, setCitedOrder] = useState<string[]>([]);
  const [sources, setSources] = useState<Record<number, Source>>({});
  /* Every name that exists in this member’s record; bold outside it is unbolded. */
  const [groundedTerms, setGroundedTerms] = useState<string[]>([]);
  const [citedSources, setCitedSources] = useState<number[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [memory, setMemory] = useState<CleanMemoryRow[]>([]);
  /** What the answers are made of, counted from his own rows. */
  const [graph, setGraph] = useState<{ captures: number; signals: number; openSignals: number; posts: number; drafts: number; score: number | null } | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [opener, setOpener] = useState<{ text: string; chips: { label: string; prompt: string }[] } | null>(null);
  /** True only while a Mirror card holds the slot. Two voices, never. */
  const [mirrorShowing, setMirrorShowing] = useState(false);
  const [mirrorDecided, setMirrorDecided] = useState(false);
  const [openerDone, setOpenerDone] = useState(false);
  /** The one card the member asked for, which outranks the computed one. */
  const [slotAsk, setSlotAsk] = useState<"ledger" | null>(null);
  /** The welcome-back card, decided once per session before anything renders. */
  const [returnDecided, setReturnDecided] = useState(false);
  const [returnData, setReturnData] = useState<ReturnCardData | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  /** "Say more" is per message: expanding one answer never expands another. */
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  /** The gear, and what the Desk can actually do for him today. */
  const [watchOpen, setWatchOpen] = useState(false);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [prefs, setPrefs] = useState<DeskPrefs>({});
  /** An ask parked because the thing it needs is missing. */
  const [blocked, setBlocked] = useState<{ capability: CapabilityKey; question: string } | null>(null);
  /** The gear's "Add it", answered in place on the Desk. */
  const [addressOpen, setAddressOpen] = useState(false);
  /**
   * "Was this right?" — the verdict per answer. It used to write nowhere, which
   * taught the member his feedback was decorative. A `No` becomes a rejects row.
   */
  const [feedback, setFeedback] = useState<Record<number, "yes" | "no">>({});



  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const listRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerElRef = useRef<HTMLElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const firedRef = useRef(false);
  const openerRef = useRef(false);


  /**
   * The one navigation contract on this surface: Dashboard reads ?tab= (and
   * ?signal= for a subject). openSignal, openDrafts and the routing pill all
   * go through here — there is no second helper.
   */
  const openSurface = (tab: string, subjectId?: string | null) => {
    const next = new URLSearchParams(window.location.search);
    next.set("tab", tab);
    if (subjectId) next.set("signal", subjectId);
    else next.delete("signal");
    window.history.pushState({}, "", `${window.location.pathname}?${next.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    onClose();
  };
  const openSignal = (id: string) => openSurface("intelligence", id);
  /** Only ever called with a verified row id — there is no fallback to home. */
  const openDraft = (postId: string) => {
    const next = new URLSearchParams(window.location.search);
    next.set("tab", "drafts");
    next.set("post", postId);
    next.delete("signal");
    window.history.pushState({}, "", `${window.location.pathname}?${next.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    onClose();
  };


  /* ── Load the rail from real rows only ── */
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;

      const [postsRes, voiceRes, memRes, sigRes, draftRes, captureRes, signalCountRes, postCountRes, openSignalRes, scoreRes] = await Promise.all([
        supabase.from("linkedin_posts").select("source_type, tracking_status, theme, theme_tags").eq("user_id", uid),
        supabase.from("authority_voice_profiles").select("tone, example_posts").eq("user_id", uid).eq("is_primary", true).eq("mode_key", "default").maybeSingle(),
        supabase.from("aura_conversation_memory").select("id, session_date, summary, actions_committed").eq("user_id", uid).is("role", null).not("summary", "is", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("strategic_signals").select("id, signal_title, theme_tags, priority_score").eq("user_id", uid).order("priority_score", { ascending: false }).limit(3),
        supabase.from("linkedin_posts").select("id").eq("user_id", uid).eq("tracking_status", "draft"),
        supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("strategic_signals").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("linkedin_posts").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("strategic_signals").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "active"),
        supabase.from("score_snapshots").select("score").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
      ]);

      const live = filterPublishedRows((postsRes.data as any[]) || []);
      const counts = new Map<string, number>();
      for (const p of live as any[]) {
        const tags: string[] = Array.isArray(p.theme_tags) && p.theme_tags.length ? p.theme_tags : (p.theme ? [p.theme] : []);
        for (const t of tags) if (t) counts.set(t, (counts.get(t) || 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const voice: any = voiceRes.data || null;
      setPosition({
        topTheme: top ? top[0] : null,
        topThemePct: top && live.length ? Math.round((top[1] / live.length) * 100) : 0,
        publishedLive: live.length,
        voiceTone: voice?.tone || null,
        voiceLearnedFrom: Array.isArray(voice?.example_posts) ? voice.example_posts.length : 0,
      });
      /* Broken rows are dropped, never shown: see deskMemory.cleanMemory. */
      setMemory(cleanMemory(((memRes.data as any[]) || []) as any));

      void sigRes;
      const drafts = ((draftRes.data as any[]) || []).length;
      setGraph({
        captures: captureRes.count ?? 0,
        signals: signalCountRes.count ?? 0,
        openSignals: openSignalRes.count ?? 0,
        posts: postCountRes.count ?? 0,
        drafts,
        score: ((scoreRes.data as any[]) || [])[0]?.score ?? null,
      });

    })();
  }, [open]);

  /* What the Desk can do today, and what he has already told it. */
  const refreshDesk = useCallback(async () => {
    const [c, p] = await Promise.all([loadCapabilities(), loadDeskPrefs()]);
    setCaps(c);
    if (p) setPrefs(p.prefs);
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!open) { setPrefsLoaded(false); setSlotAsk(null); return; }
    void refreshDesk();
  }, [open, refreshDesk]);

  /* Is he coming back after a gap? Decided before the slot renders anything. */
  useEffect(() => {
    if (!open) { setReturnDecided(false); setReturnData(null); setMirrorDecided(false); setMirrorShowing(false); return; }
    let cancelled = false;
    (async () => {
      let d: ReturnCardData | null = null;
      try { d = await loadReturnCard(); } catch { d = null; }
      if (cancelled) return;
      setReturnData(d);
      setReturnDecided(true);
    })();
    return () => { cancelled = true; };
  }, [open]);

  /* A decider that never answers must not leave him looking at a resting mark. */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      setMirrorDecided(true);
      setReturnDecided(true);
      setPrefsLoaded(true);
      setOpenerDone(true);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [open]);




  /* ── Opener: Aura speaks first, once per open ── */
  useEffect(() => {
    if (!open) { openerRef.current = false; setOpener(null); setOpenerDone(false); return; }
    if (openerRef.current || initialMessage) return;
    openerRef.current = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setOpenerDone(true); return; }
        const { data, error } = await supabase.functions.invoke("ask-aura-opener", { body: findingId ? { finding_id: findingId } : {} });
        if (error) throw error;
        const text = typeof (data as any)?.text === "string" ? (data as any).text.trim() : "";
        const chips = Array.isArray((data as any)?.chips) ? (data as any).chips.slice(0, 3) : [];
        if (text) setOpener({ text, chips });
      } catch (e) {
        console.error("[ask] opener failed", e);
      } finally {
        setOpenerDone(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMessage, findingId]);


  /* Initial focus stays on the textarea; the opener element is remembered so we can hand focus back. */
  useEffect(() => {
    if (!open) return;
    openerElRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const t = window.setTimeout(() => taRef.current?.focus(), 120);
    return () => {
      window.clearTimeout(t);
      const back = openerElRef.current;
      openerElRef.current = null;
      if (back && document.contains(back)) window.setTimeout(() => back.focus(), 0);
    };
  }, [open]);

  /* Escape closes; Tab is trapped inside the dialog in both directions. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const root = panelRef.current;
      if (!root) return;
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(el => el.offsetParent !== null || el === document.activeElement);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const persist = useCallback(async (role: "user" | "assistant", content: string, refs: string[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.from("aura_conversation_memory").insert({
        user_id: session.user.id,
        role,
        content,
        session_id: sessionIdRef.current,
        metadata: role === "assistant" ? { signal_titles_referenced: refs } : {},
      } as any);
    } catch (e) { console.error("[ask] memory insert failed", e); }
  }, []);

  const send = useCallback(async (text: string, opts?: { force?: boolean }) => {
    const body = text.trim();
    if (!body || loading) return;

    /* "Where do I stand" is not a question for a model — it is the ledger.
       Asked for in words, it takes the slot exactly as the chip does. */
    if (!opts?.force && messages.length === 0 && WANTS_LEDGER.test(body)) {
      setInput("");
      setReturnData(null);
      setSlotAsk("ledger");
      return;
    }



    /* A question that needs something he has not given gets an honest refusal,
       not an invented answer. "Later" keeps it quiet for thirty days. */
    if (!opts?.force) {
      const need = capabilityNeeded(body);
      if (need && caps && !caps[need] && !isDeclined(prefs, need)) {
        setMessages([...messages, { role: "user", content: body }]);
        setInput("");
        setFollowUps([]);
        setBlocked({ capability: need, question: body });
        return;
      }
    }
    setBlocked(null);

    const userMsg: Msg = { role: "user", content: body };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setFollowUps([]);
    setLoading(true);
    /* The dock mirrors the Desk: it turns while Aura reads, and keeps turning
       if he closes the Desk mid-answer — the run, not the surface, owns it. */
    beginDeskRun("Reading your graph");
    void persist("user", body, []);


    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })), context, session_id: sessionIdRef.current }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any)?.error || "Aura couldn't respond.");
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      let gotCitations: Citation[] = [];
      let gotSources: Source[] = [];
      const gotActions: ActionLine[] = [];
      setMessages([...next, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            if (Array.isArray(j?.citations)) gotCitations = j.citations as Citation[];
            if (Array.isArray(j?.sources)) gotSources = j.sources as Source[];
            if (Array.isArray(j?.grounded_terms)) setGroundedTerms(j.grounded_terms.map(String));
            if (Array.isArray(j?.grounded_terms)) setGroundedTerms(j.grounded_terms.map(String));
            if (j?.action && typeof j.action?.label === "string") {
              const r = j.action.route;
              const route: ActionRoute | undefined =
                r && typeof r.surface === "string"
                  ? { surface: r.surface, subject_id: typeof r.subject_id === "string" ? r.subject_id : null }
                  : undefined;
              gotActions.push({
                tool: String(j.action.tool || ""),
                ok: !!j.action.ok,
                label: j.action.label,
                post_id: typeof j.action.post_id === "string" ? j.action.post_id : undefined,
                route,
              });
            }
            const delta = j?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              acc += delta;
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: acc };
                return copy;
              });
            }
          } catch { /* partial frame */ }
        }
      }

      if (gotCitations.length) {
        setCitations(prev => {
          const m = { ...prev };
          for (const c of gotCitations) if (c?.ref && c?.id) m[c.ref] = c;
          return m;
        });
        const used = usedCitations(acc, gotCitations).map(c => c.ref);
        if (used.length) setCitedOrder(prev => [...prev, ...used.filter(r => !prev.includes(r))]);
      }

      if (gotSources.length) {
        setSources(prev => {
          const m = { ...prev };
          for (const s of gotSources) if (Number.isFinite(s?.n)) m[Number(s.n)] = s;
          return m;
        });
        const usedS = usedSources(acc, gotSources).map(s => Number(s.n));
        if (usedS.length) setCitedSources(prev => [...prev, ...usedS.filter(n => !prev.includes(n))]);
      }

      if (acc.trim()) {
        if (gotActions.length) {
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: acc, actions: gotActions };
            return copy;
          });
        }
        const used = usedCitations(acc, gotCitations);
        const titles = used.map(c => c.title);
        void persist("assistant", acc.trim(), titles);
        const fu: string[] = [];
        const firstCited = used[0];
        if (firstCited) {
          fu.push(`What evidence sits behind ${firstCited.title}?`);
          fu.push(`Draft a post from ${firstCited.title}`);
        }
        fu.push("Make that sharper");
        setFollowUps(fu.slice(0, 3));
        setDeskFound("Your answer is ready", { question: body, answer: parseLayers(acc).plain || acc.trim() });
      } else {
        setMessages(prev => prev.slice(0, -1));
        endDeskRun();
      }

    } catch (e: any) {
      setMessages(prev => {
        const copy = [...prev];
        if (copy.length && copy[copy.length - 1].role === "assistant" && !copy[copy.length - 1].content) copy.pop();
        return [...copy, { role: "assistant", content: e?.message || "Didn't connect. Try once more.", isError: true }];
      });
      endDeskRun();
    }
    setLoading(false);
  }, [caps, context, loading, messages, persist, prefs]);

  useEffect(() => {
    if (!open) { firedRef.current = false; return; }
    if (firedRef.current || !initialMessage) return;
    firedRef.current = true;
    void send(initialMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMessage]);

  const cited = useMemo(() => citedOrder.map(r => citations[r]).filter(Boolean), [citedOrder, citations]);
  /** Moves on the newest assistant answer, if it carried any. */
  const lastMoves = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      return m.isError ? [] : parseLayers(m.content).moves;
    }
    return [];
  }, [messages]);

  const citedSourceRows = useMemo(
    () => citedSources.map(n => sources[n]).filter(Boolean),
    [citedSources, sources],
  );

  if (!open) return null;

  /* ── Answer body: refs become pills, unresolved refs are stripped ── */
  const Answer: React.FC<{ text: string; size?: number; color?: string }> = ({ text, size, color }) => {
    const rtl = isAr(text);
    const prepared = markCitations(text, citations, sources);
    return (
      <div
        dir={rtl ? "rtl" : "ltr"}
        className="ask-answer"
        style={{
          fontFamily: rtl ? "var(--ff-ar)" : "var(--font-body, inherit)",
          lineHeight: rtl ? 1.9 : 1.65,
          fontSize: size ?? 14.5,
          color: color ?? "var(--text-primary)",
          textAlign: rtl ? "right" : "left",
        }}
      >

        <ReactMarkdown
          components={{
            code: ({ children }) => {
              const raw = String(children);
              const m = raw.match(/^\u27E6(S-\d+)\u27E7$/);
              if (m && citations[m[1]]) return <Pill c={citations[m[1]]} onOpen={openSignal} />;
              const sm = raw.match(/^\u27E6#(\d{1,3})\u27E7$/);
              if (sm && sources[Number(sm[1])]) return <SourcePill s={sources[Number(sm[1])]} />;
              return <code style={{ ...MONO, fontSize: 12.5 }}>{children}</code>;
            },
            p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
            blockquote: ({ children }) => (
              <blockquote style={{
                margin: "12px 0", padding: rtl ? "0 12px 0 0" : "0 0 0 12px",
                borderInlineStart: "2px solid var(--machine)", color: "var(--text-secondary)",
              }}>{children}</blockquote>
            ),
            ul: ({ children }) => <ul style={{ margin: "0 0 10px", paddingInlineStart: 18 }}>{children}</ul>,
          }}
        >
          {prepared}
        </ReactMarkdown>
      </div>
    );
  };

  /* One heading grammar for every section: icon, label, and the fold. */
  const sectionHead = (key: string, Icon: any, label: string) => {
    const isOpen = panelOpen(prefs, key);
    return (
      <button
        type="button"
        className="ask-focusable"
        aria-expanded={isOpen}
        onClick={async () => {
          const merged = await saveDeskPrefs(prefs, { panel_open: { [key]: !isOpen } });
          setPrefs(merged);
        }}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 36,
          background: "transparent", border: 0, padding: 0, marginBottom: isOpen ? 10 : 0, cursor: "pointer",
        }}
      >
        <Icon size={18} strokeWidth={1.7} color="var(--text-muted)" aria-hidden="true" />
        <span style={{ ...MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)", flex: 1, textAlign: "left" }}>
          {label}
        </span>
        <ChevronDown
          size={15} strokeWidth={1.8} color="var(--text-muted)" aria-hidden="true"
          style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 160ms ease" }}
        />
      </button>
    );
  };


  const num = (n: number | string) => (
    <span style={{ ...MONO, fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>{n}</span>
  );

  const jumpRow = (Icon: any, label: string, count: string | null, go: () => void) => (
    <button
      key={label}
      type="button"
      className="ask-focusable ask-rail-row"
      onClick={go}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
        background: "transparent", cursor: "pointer",
        border: "1px solid var(--rule-outer)", borderRadius: 12, padding: "9px 12px",
      }}
    >
      <Icon size={18} strokeWidth={1.7} color="var(--text-muted)" aria-hidden="true" />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
      {count && <span style={{ ...MONO, fontSize: 11, color: "var(--text-muted)" }}>{count}</span>}
    </button>
  );

  const rail = (
    <aside
      data-testid="ask-rail"
      style={{
        background: "var(--surface-card)", border: "1px solid var(--rule-outer)", borderRadius: 16,
        padding: 18, display: "flex", flexDirection: "column", gap: 22, overflowY: "auto",
      }}
    >
      {/* 1 — What I can see: the single most reassuring line on the panel. */}
      {panelOn(prefs, "scope") && (
        <div data-testid="rail-scope">
          {sectionHead("scope", Eye, "What I can see")}
          {panelOpen(prefs, "scope") && <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {!graph ? "Counting your rows…"
              : (graph.captures + graph.signals + graph.posts) === 0
                ? "Nothing in your vault yet, so there is nothing for me to read."
                : <>Your {num(graph.captures)} captures, {num(graph.signals)} signals, {num(graph.openSignals)} still open, {num(graph.posts)} posts.</>}
          </div>}
        </div>
      )}

      {/* 2 — Used in this answer: the citation registry, each row openable. */}
      {panelOn(prefs, "cited") && (
        <div data-testid="rail-cited">
          {sectionHead("cited", Quote, "Used in this answer")}
          {panelOpen(prefs, "cited") && (cited.length === 0 && citedSourceRows.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nothing cited yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {cited.map(c => (
                <button
                  key={c.ref}
                  type="button"
                  className="ask-focusable ask-rail-row"
                  onClick={() => openSignal(c.id)}
                  style={{
                    textAlign: "left", background: "transparent", cursor: "pointer",
                    border: "1px solid var(--rule-outer)", borderRadius: 12, padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ ...MONO, fontSize: 10.5, color: "var(--machine-text)" }}>{c.ref}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{c.title}</span>
                  </div>
                  <div style={{ ...MONO, fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    {c.evidence_count} capture{c.evidence_count === 1 ? "" : "s"}
                    {c.days_live != null ? ` · ${c.days_live}d live` : ""}
                    {c.velocity_status ? ` · ${c.velocity_status}` : ""}
                  </div>
                </button>
              ))}
              {citedSourceRows.map(s => (
                <button
                  key={`s-${s.n}`}
                  type="button"
                  className="ask-focusable ask-rail-row"
                  aria-label={`Source ${s.n}: ${sourceDetail(s)}`}
                  title={sourceDetail(s)}
                  onClick={() => { if (s.url) window.open(s.url, "_blank", "noopener,noreferrer"); }}
                  style={{
                    textAlign: "left", background: "transparent", cursor: s.url ? "pointer" : "default",
                    border: "1px solid var(--rule-outer)", borderRadius: 12, padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ ...MONO, fontSize: 10.5, color: "var(--machine-text)" }}>{s.n}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{s.title}</span>
                  </div>
                  <div style={{ ...MONO, fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    {s.kind.replace(/_/g, " ")}{s.date ? ` · ${s.date}` : ""}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 3 — Where you stand: one number, one voice line. Never a third. */}
      {panelOn(prefs, "standing") && (
        <div data-testid="rail-standing">
          {sectionHead("standing", Gauge, "Where you stand")}
          {panelOpen(prefs, "standing") && <><div style={{ fontSize: 15, color: "var(--text-primary)" }}>
            {graph && graph.score != null
              ? <span style={{ ...MONO, fontVariantNumeric: "tabular-nums" }}>{graph.score}/100</span>
              : <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>No score recorded yet.</span>}
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {position && position.voiceTone
              ? <>Voice: {position.voiceTone}{position.voiceLearnedFrom > 0 ? ` — learned from ${position.voiceLearnedFrom} of your posts` : ""}</>
              : "No voice profile learned yet — Aura needs more of your own writing first."}
          </div></>}
        </div>
      )}

      {/* 4 — Jump to: the four places he actually uses. */}
      {panelOn(prefs, "jump") && (
        <div data-testid="rail-jump">
          {sectionHead("jump", Compass, "Jump to")}
          {panelOpen(prefs, "jump") && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {jumpRow(Radar, "Signals", graph && graph.signals > 0 ? String(graph.signals) : null, () => openSurface("intelligence"))}
            {jumpRow(PenLine, "Write", graph && graph.drafts > 0 ? `${graph.drafts} drafts` : null, () => openSurface("authority"))}
            {jumpRow(Inbox, "Capture", graph && graph.captures > 0 ? String(graph.captures) : null, () => openSurface("home"))}
            {jumpRow(Gauge, "Where you stand", graph && graph.score != null ? `${graph.score}/100` : null, () => openSurface("influence"))}
          </div>}
        </div>
      )}

      {/* Last, and only when a row survived the filter. */}
      {panelOn(prefs, "memory") && memory.length > 0 && (
        <div data-testid="rail-memory">
          {sectionHead("memory", History, "What I remember")}
          {panelOpen(prefs, "memory") && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {memory.map(m => (
              <div key={m.id} style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                <div style={{ ...MONO, fontSize: 10.5, color: "var(--text-muted)" }}>Noted {m.session_date}</div>
                <div className="ask-clamp-2">{m.text}</div>
              </div>
            ))}
          </div>}
        </div>
      )}
    </aside>
  );

  /**
   * WHICH ONE CARD. A single expression, evaluated top to bottom, producing one
   * value. Asked-for beats computed; nothing renders until every decider has
   * answered, and the resting mark covers that wait.
   */
  const slotReady = openerDone && prefsLoaded && mirrorDecided && returnDecided;
  const card: DeskCardKind =
    slotAsk ? slotAsk
    : !slotReady ? "loading"
    : returnData ? "return"
    : mirrorShowing ? "mirror"
    : !prefs.priority ? "priority"
    : "opener";

  return createPortal(
    <div
      ref={panelRef}
      data-testid="ask-aura-v2"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-aura-title"
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "var(--surface-page, var(--surface-card))", display: "flex", flexDirection: "column", overflowX: "hidden" }}
    >
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid var(--rule-outer)", flex: "0 0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AuraMark size={24} state={loading ? "working" : "resting"} />
          <span id="ask-aura-title" style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text-primary)" }}>Your Desk</span>
          {context?.linkedLabel && (
            <span style={{ ...MONO, fontSize: 11, color: "var(--text-muted)" }}>· {context.linkedLabel}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button
          type="button"
          className="ask-focusable"
          aria-label="What your Desk watches"
          onClick={() => setWatchOpen(true)}
          style={{
            background: "transparent", border: 0, cursor: "pointer", color: "#5B6673",
            width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
            margin: "-6px 0", borderRadius: 10,
          }}
        >
          <Settings2 size={17} aria-hidden="true" />
        </button>
        <button type="button" className="ask-focusable" aria-label="Close" onClick={onClose} style={{

          background: "transparent", border: 0, cursor: "pointer", color: "var(--text-secondary)",
          width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
          margin: "-6px -10px -6px 0", borderRadius: 10,
        }}>
          <X size={18} aria-hidden="true" />
        </button>
        </div>
      </header>

      <DeskWatchSheet
        open={watchOpen}
        onClose={() => { setWatchOpen(false); void refreshDesk(); }}
        onAddLinkedIn={() => setAddressOpen(true)}
      />


      <div className="ask-body" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <div className="ask-grid" style={{ height: "100%", maxWidth: 1400, margin: "0 auto", padding: "16px 20px", boxSizing: "border-box" }}>
          <section style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div ref={listRef} aria-live="polite" aria-atomic="false" style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
              {/* ── THE SLOT: exactly one card, ever. ── */}
              {messages.length === 0 && (
                <DeskSlot
                  card={card}
                  probe={
                    <DeskMirror
                      onDecided={(show) => { setMirrorDecided(true); setMirrorShowing(show); }}
                      onOpenDraft={(id) => {
                        const next = new URLSearchParams(window.location.search);
                        next.set("tab", "authority");
                        next.set("draft", id);
                        window.history.pushState({}, "", `${window.location.pathname}?${next.toString()}`);
                        window.dispatchEvent(new PopStateEvent("popstate"));
                        onClose();
                      }}
                    />
                  }
                  render={{
                    /* The Mirror is the probe itself — the slot shows it in place. */
                    mirror: () => null,

                    /* Not a spinner, not a void: the mark, parked, on the card ground. */
                    loading: () => (
                      <div data-testid="desk-resting" style={{
                        minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center",
                        background: "var(--surface-card)", borderRadius: 16,
                      }}>
                        <AuraMark size={64} state="resting" />
                      </div>
                    ),

                    return: () => (
                      <DeskReturnCard
                        data={returnData}
                        onReady={(show, d) => { setReturnDecided(true); setReturnData(show ? d : null); }}
                        onPickUp={() => { setReturnData(null); void send("Pick up where we left off."); }}
                        onOvernight={() => { setReturnData(null); setSlotAsk(null); }}
                        onNew={() => { setReturnData(null); setSlotAsk(null); taRef.current?.focus(); }}
                      />
                    ),

                    /* First run only, and never beside the opener. */
                    priority: () => (
                      <DeskPriorityAsk
                        onOpenWatch={() => setWatchOpen(true)}
                        onAnswered={() => { window.setTimeout(() => { void refreshDesk(); }, 2500); }}
                      />
                    ),

                    /* Asked for, never shown unasked. */
                    ledger: () => (
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="ask-focusable"
                          data-testid="desk-ledger-back"
                          onClick={() => setSlotAsk(null)}
                          style={{
                            background: "transparent", border: 0, color: "var(--text-muted)",
                            fontSize: 12.5, cursor: "pointer", padding: "6px 2px", minHeight: 44,
                          }}
                        >← Back</button>
                        <DeskLedger
                          onOpenDrafts={() => openSurface("drafts")}
                          onOpenSignals={() => openSurface("intelligence")}
                          onOpenTab={(t) => openSurface(t)}
                        />
                      </div>
                    ),

                    opener: () => (
                      <div className="ask-answer-card" style={{ maxWidth: 620, marginTop: 24 }}>
                        {opener ? (
                          <>
                            <Answer text={opener.text} />
                            {opener.chips.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 14px" }}>
                                {opener.chips.map((c, i) => {
                                  /* The third chip is the way into the ledger, in this slot. */
                                  const toLedger = i === 2 || /something else/i.test(c.prompt);
                                  return (
                                    <button
                                      key={c.prompt}
                                      type="button"
                                      className="ask-focusable ask-chip"
                                      onClick={() => (toLedger ? setSlotAsk("ledger") : send(c.prompt))}
                                      style={i === 0 ? {
                                        background: "var(--act)", border: 0, color: "var(--text-inverse)",
                                        borderRadius: 999, padding: "7px 14px", fontSize: 12.5, cursor: "pointer",
                                        display: "inline-flex", alignItems: "center", gap: 6,
                                      } : {
                                        background: "transparent", border: "1px solid var(--act)", color: "var(--act)",
                                        borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
                                        display: "inline-flex", alignItems: "center", gap: 6,
                                      }}
                                    >{toLedger ? "What else is waiting?" : c.label}<ArrowUpRight size={13} /></button>
                                  );
                                })}
                              </div>
                            )}
                            <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
                              Aura reads your captures, signals and posts. It cannot see the open web or what anyone else has published — so it will tell you when a question sits outside what it can see.
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                            Aura reads your captures, signals and posts. It cannot see the open web or what anyone else has published — so it will tell you when a question sits outside what it can see.
                          </div>
                        )}
                      </div>
                    ),
                  }}
                />
              )}


              {addressOpen && (
                <DeskLinkedInField
                  onSaved={() => { setAddressOpen(false); void refreshDesk(); }}
                  onCancel={() => setAddressOpen(false)}
                />
              )}



              {messages.map((m, i) => {
                const rtl = isAr(m.content);
                return m.role === "user" ? (
                  <div key={i} style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0" }}>
                    <div dir={rtl ? "rtl" : "ltr"} style={{
                      maxWidth: "78%", padding: "10px 14px", borderRadius: 14,
                      background: "var(--act)", color: "var(--text-inverse)", fontSize: 14.5,
                      fontFamily: rtl ? "var(--ff-ar)" : undefined, lineHeight: rtl ? 1.9 : 1.55,
                    }}>{m.content}</div>
                  </div>
                ) : (() => {
                  // The layers. A malformed answer degrades to the whole text.
                  const layers = parseLayers(m.content);
                  /* A save is only real when the write came back with a row id. */
                  const savedId = (m.actions || []).find(a => a.ok && a.tool === "save_draft" && a.post_id)?.post_id || null;
                  const verified = (m.actions || []).filter(a => a.ok && (a.tool !== "save_draft" || !!a.post_id)).map(a => a.tool);
                  /* Bold reads as a system term — only real names keep it. */
                  const guardedPlain = guardClaims(groundBold(layers.plain, groundedTerms), verified);
                  const guardedMore = guardClaims(groundBold(layers.more, groundedTerms), verified);
                  const failedSave = (m.actions || []).some(a => a.tool === "save_draft" && (!a.ok || !a.post_id));
                  const isOpen = !!expanded[i];
                  // A failure is not a finished object — errors stay outside the card.
                  if (m.isError) return (
                    <div key={i} style={{ margin: "14px 0", maxWidth: 720 }}>
                      <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{m.content}</div>
                    </div>
                  );
                  return (
                  <div key={i} className="ask-answer-card" style={{ margin: "14px 0", maxWidth: 720 }}>
                    {<>
                          <Answer text={guardedPlain.text} size={15} color="var(--text-primary)" />
                          {(failedSave || (guardedPlain.stripped && verified.length === 0)) && (
                            <div data-testid="ask-honest-failure" style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "2px 0 8px" }}>
                              {honestFailure(answerLang(layers.plain))}
                            </div>
                          )}
                          {guardedMore.text && (
                            <>
                              <button
                                type="button"
                                className="ask-focusable ask-chip"
                                data-testid="ask-say-more"
                                aria-expanded={isOpen}
                                onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}
                                style={{
                                  background: "transparent", border: "1px solid var(--act)", color: "var(--act)",
                                  borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
                                  display: "inline-flex", alignItems: "center", gap: 6, marginTop: 2,
                                }}
                              >{isOpen ? "Less" : "Say more"}</button>
                              {isOpen && (
                                <div style={{ marginTop: 8 }}>
                                  <Answer text={guardedMore.text} size={13.8} color="var(--text-secondary)" />
                                </div>
                              )}
                            </>
                          )}
                          {layers.moves.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 2px" }}>
                              {layers.moves.map((mv, mi) => (
                                <button
                                  key={`${mi}:${mv}`} type="button" className="ask-focusable ask-chip"
                                  data-testid="ask-move-chip"
                                  onClick={() => send(mv)}
                                  style={mi === 0 ? {
                                    background: "var(--act)", border: 0, color: "var(--text-inverse)",
                                    borderRadius: 999, padding: "7px 14px", fontSize: 12.5, cursor: "pointer",
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                  } : {
                                    background: "transparent", border: "1px solid var(--act)", color: "var(--act)",
                                    borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                  }}
                                >{mv}<ArrowUpRight size={13} aria-hidden="true" /></button>
                              ))}
                            </div>
                          )}
                        </>}

                    {/* The machine reporting its own work: cyan, never a button. */}
                    {(m.actions || []).map((a, k) => (
                      <div key={k} data-testid="ask-action-line" style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
                        <span aria-hidden="true" style={{
                          width: 7, height: 7, borderRadius: 999,
                          background: a.ok ? "var(--machine)" : "var(--text-muted)",
                        }} />
                        <span style={{ ...MONO, fontSize: 12, color: a.ok ? "var(--machine-text)" : "var(--text-muted)" }}>
                          {a.label}
                        </span>
                      </div>
                    ))}
                    {savedId && (
                      <div style={{ marginTop: 10 }}>
                        <button type="button" className="ask-focusable ask-chip" onClick={() => openDraft(savedId)} style={{
                          background: "transparent", border: "1px solid var(--act)", color: "var(--act)",
                          borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
                          display: "inline-flex", alignItems: "center", gap: 6,
                        }}>Open in Publish<ArrowUpRight size={13} aria-hidden="true" /></button>
                      </div>
                    )}
                    {/* The door. Blue because the member taps it; a route to an
                        unknown surface renders nothing at all. */}
                    {(m.actions || [])
                      .filter(a => a.ok && a.route && (SURFACES as readonly string[]).includes(a.route.surface))
                      .map((a, k) => (
                        <div key={`route-${k}`} style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            className="ask-focusable ask-chip"
                            data-testid="ask-route-button"
                            onClick={() => openSurface(a.route!.surface, a.route!.subject_id)}
                            style={{
                              background: "transparent", border: "1px solid var(--act)", color: "var(--act)",
                              borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
                              display: "inline-flex", alignItems: "center", gap: 6,
                            }}
                          >{a.label}<ArrowUpRight size={13} aria-hidden="true" /></button>
                        </div>
                      ))}
                  </div>
                  );
                })();
              })}

              {blocked && (
                <DeskCapabilityReply
                  capability={blocked.capability}
                  onReady={async () => {
                    const q = blocked.question;
                    setBlocked(null);
                    await refreshDesk();
                    void send(q, { force: true });
                  }}
                  onInstead={(p) => { setBlocked(null); void send(p, { force: true }); }}
                  onDismiss={() => setBlocked(null)}
                />
              )}




              {loading && (
                <div role="status" data-testid="ask-thinking" style={{ ...MONO, fontSize: 12, color: "var(--machine-text)", margin: "10px 0", display: "flex", alignItems: "center", gap: 8 }}>
                  <AuraMark size={16} state="working" />
                  Reading your graph…
                </div>
              )}

              {/* The model's own moves replace these for the answer that carries
                  them; with no moves, the generated follow-ups render as today. */}
              {!loading && followUps.length > 0 && lastMoves.length === 0 && (

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "6px 0 16px" }}>
                  {followUps.map(f => (
                    <button key={f} type="button" className="ask-focusable ask-chip" onClick={() => send(f)} style={{
                      background: "transparent", border: "1px solid var(--act)", color: "var(--act)",
                      borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}>{f}<ArrowUpRight size={13} aria-hidden="true" /></button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: "0 0 auto", paddingTop: 12 }}>
              <form
                onSubmit={(e) => { e.preventDefault(); void send(input); }}
                style={{
                  display: "flex", gap: 10, alignItems: "flex-end",
                  border: "1px solid var(--rule-outer)", borderRadius: 14, padding: 10,
                  background: "var(--surface-card)",
                }}
              >
                <textarea
                  ref={taRef}
                  className="ask-focusable"
                  aria-label="Your Desk — ask a question"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                  rows={2}
                  dir={isAr(input) ? "rtl" : "ltr"}
                  placeholder="Assign a task, or ask"
                  style={{
                    flex: 1, resize: "none", border: 0, background: "transparent",
                    fontSize: 14.5, color: "var(--text-primary)", lineHeight: isAr(input) ? 1.9 : 1.5,
                    fontFamily: isAr(input) ? "var(--ff-ar)" : undefined,
                  }}
                />
                <button type="submit" className="ask-focusable ask-send" aria-label="Send" disabled={loading || !input.trim()} style={{
                  background: "var(--act)", color: "var(--text-inverse)", border: 0, borderRadius: 10,
                  width: 38, height: 38, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  cursor: loading || !input.trim() ? "default" : "pointer", opacity: loading || !input.trim() ? 0.5 : 1,
                }}>
                  <Send size={16} aria-hidden="true" />
                </button>
              </form>

            </div>
          </section>

          {rail}
        </div>
      </div>

      <style>{`
        .ask-grid { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 20px; }
        .ask-grid > aside { max-height: 100%; }
        .ask-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        /* One answer shape: every answer, and the opener, is a finished object. */
        .ask-answer-card {
          background: var(--surface-card);
          border: 1px solid var(--rule-outer);
          border-radius: 20px;
          padding: 16px 18px 14px;
        }
        /* Keyboard users must see where they are. Mouse users are untouched. */
        [data-testid="ask-aura-v2"] .ask-focusable:focus-visible {
          outline: 2px solid var(--act);
          outline-offset: 2px;
        }
        [data-testid="ask-aura-v2"] .ask-chip { min-height: 36px; }
        [data-testid="ask-aura-v2"] .ask-rail-row { min-height: 44px; }
        @media (max-width: 767px) {
          [data-testid="ask-aura-v2"] .ask-chip { min-height: 44px; }
          [data-testid="ask-aura-v2"] .ask-send { width: 44px; height: 44px; }
          .ask-answer-card { padding: 14px 14px 12px; }
        }
        @media (max-width: 1023px) {
          /* The answer leads on a phone; the rail follows underneath it. */
          .ask-grid { grid-template-columns: minmax(0,1fr); grid-template-rows: minmax(0,1fr) auto; }
          .ask-grid > aside { order: 1; flex-direction: row; gap: 18px; overflow-x: auto; max-width: 100%; padding: 12px 14px; }
          .ask-grid > aside > div { min-width: 220px; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
