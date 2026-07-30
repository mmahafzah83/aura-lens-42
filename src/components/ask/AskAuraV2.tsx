import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Send, ArrowUpRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
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

type Msg = { role: "user" | "assistant"; content: string; isError?: boolean };

interface Props {
  open: boolean;
  onClose: () => void;
  initialMessage?: string;
  context?: AskContext;
}

/* ── Rail data ── */
interface Position {
  topTheme: string | null;
  topThemePct: number;
  publishedLive: number;
  voiceTone: string | null;
  voiceLearnedFrom: number;
}
interface MemoryRow { id: string; session_date: string; summary: string }
interface PromptSeed { label: string; text: string }

const isAr = (s: string) => AR.test(s || "");

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

/** Insert a pill marker for every citation this answer used. */
function markCitations(text: string, byRef: Record<string, Citation>): string {
  let out = text.replace(/\[(S-\d+)\]/g, (_full, ref: string) =>
    byRef[ref] ? ` \`\u27E6${ref}\u27E7\` ` : "");
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

/* ── Citation pill ── */
const Pill: React.FC<{ c: Citation; onOpen: (id: string) => void }> = ({ c, onOpen }) => (
  <button
    type="button"
    data-testid="citation-pill"
    data-signal-id={c.id}
    title={`${c.title} — ${c.evidence_count} capture${c.evidence_count === 1 ? "" : "s"}`}
    onClick={() => onOpen(c.id)}
    style={{
      ...MONO, display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "baseline",
      margin: "0 2px", padding: "1px 7px", borderRadius: 999, fontSize: 11, cursor: "pointer",
      background: "var(--act-tint)",
      border: "1px solid color-mix(in srgb, var(--act) 45%, transparent)",
      color: "var(--act-hover)",
    }}
  >
    {c.ref}
  </button>
);

export default function AskAuraV2({ open, onClose, initialMessage, context }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [citations, setCitations] = useState<Record<string, Citation>>({});
  const [citedOrder, setCitedOrder] = useState<string[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [memory, setMemory] = useState<MemoryRow[]>([]);
  const [seeds, setSeeds] = useState<PromptSeed[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const listRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const firedRef = useRef(false);

  const openSignal = (id: string) => {
    const next = new URLSearchParams(window.location.search);
    next.set("tab", "intelligence");
    next.set("signal", id);
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

      const [postsRes, voiceRes, memRes, sigRes, draftRes] = await Promise.all([
        supabase.from("linkedin_posts").select("source_type, tracking_status, theme, theme_tags").eq("user_id", uid),
        supabase.from("authority_voice_profiles").select("tone, example_posts").eq("user_id", uid).eq("is_primary", true).maybeSingle(),
        supabase.from("aura_conversation_memory").select("id, session_date, summary").eq("user_id", uid).not("summary", "is", null).order("session_date", { ascending: false }).limit(6),
        supabase.from("strategic_signals").select("id, signal_title, theme_tags, priority_score").eq("user_id", uid).order("priority_score", { ascending: false }).limit(3),
        supabase.from("linkedin_posts").select("id").eq("user_id", uid).eq("tracking_status", "draft"),
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
      setMemory(((memRes.data as any[]) || []).filter(r => (r.summary || "").trim()) as MemoryRow[]);

      const sigs = ((sigRes.data as any[]) || []);
      const drafts = ((draftRes.data as any[]) || []).length;
      const s: PromptSeed[] = [];
      if (sigs[0]) s.push({ label: `Why does “${String(sigs[0].signal_title).slice(0, 34)}” matter?`, text: `Why does the signal "${sigs[0].signal_title}" matter for me right now?` });
      if (sigs[1]) s.push({ label: "What should I write next?", text: `Given my live signals, what should I write next and what is the hook?` });
      if (top) s.push({ label: `Am I too narrow on ${top[0]}?`, text: `${top[1]} of my ${live.length} live posts are about ${top[0]}. Am I too concentrated?` });
      if (drafts > 0) s.push({ label: `Which of my ${drafts} drafts first?`, text: `I have ${drafts} drafts waiting. Which one should I finish first and why?` });
      if (!s.length) s.push({ label: "What can you see about me?", text: "What can you actually see in my graph right now?" });
      setSeeds(s.slice(0, 4));
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => taRef.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [open]);

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

  const send = useCallback(async (text: string) => {
    const body = text.trim();
    if (!body || loading) return;
    const userMsg: Msg = { role: "user", content: body };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setFollowUps([]);
    setLoading(true);
    void persist("user", body, []);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })), context }),
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

      if (acc.trim()) {
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
      } else {
        setMessages(prev => prev.slice(0, -1));
      }
    } catch (e: any) {
      setMessages(prev => {
        const copy = [...prev];
        if (copy.length && copy[copy.length - 1].role === "assistant" && !copy[copy.length - 1].content) copy.pop();
        return [...copy, { role: "assistant", content: e?.message || "Didn't connect. Try once more.", isError: true }];
      });
    }
    setLoading(false);
  }, [context, loading, messages, persist]);

  useEffect(() => {
    if (!open) { firedRef.current = false; return; }
    if (firedRef.current || !initialMessage) return;
    firedRef.current = true;
    void send(initialMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMessage]);

  const cited = useMemo(() => citedOrder.map(r => citations[r]).filter(Boolean), [citedOrder, citations]);

  if (!open) return null;

  /* ── Answer body: refs become pills, unresolved refs are stripped ── */
  const Answer: React.FC<{ text: string }> = ({ text }) => {
    const rtl = isAr(text);
    const prepared = markCitations(text, citations);
    return (
      <div
        dir={rtl ? "rtl" : "ltr"}
        className="ask-answer"
        style={{
          fontFamily: rtl ? "var(--ff-ar)" : "var(--font-body, inherit)",
          lineHeight: rtl ? 1.9 : 1.65,
          fontSize: 14.5,
          color: "var(--text-primary)",
          textAlign: rtl ? "right" : "left",
        }}
      >
        <ReactMarkdown
          components={{
            code: ({ children }) => {
              const raw = String(children);
              const m = raw.match(/^\u27E6(S-\d+)\u27E7$/);
              if (m && citations[m[1]]) return <Pill c={citations[m[1]]} onOpen={openSignal} />;
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

  const rail = (
    <aside
      data-testid="ask-rail"
      style={{
        background: "var(--surface-card)", border: "1px solid var(--rule-outer)", borderRadius: 16,
        padding: 18, display: "flex", flexDirection: "column", gap: 22, overflowY: "auto",
      }}
    >
      <div>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--machine-text)" }}>
          Chief of Staff
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
          Reads only your graph.
        </div>
      </div>

      <div>
        {railLabel("In this conversation")}
        {cited.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nothing cited yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cited.map(c => (
              <button
                key={c.ref}
                type="button"
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
          </div>
        )}
      </div>

      <div>
        {railLabel("Your position")}
        {!position ? (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Reading your posts…</div>
        ) : position.publishedLive === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            No posts live on LinkedIn yet, so there is no theme concentration to show.
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
            {position.topTheme ? (
              <div>
                <strong>{position.topTheme}</strong>
                <span style={{ ...MONO, color: "var(--text-secondary)" }}>
                  {" "}— {position.topThemePct}% of {position.publishedLive} posts live on LinkedIn
                </span>
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
                {position.publishedLive} posts live on LinkedIn, none tagged with a theme yet.
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-secondary)" }}>
          {position && position.voiceTone
            ? <>Voice: {position.voiceTone}{position.voiceLearnedFrom > 0 ? ` — learned from ${position.voiceLearnedFrom} of your posts` : ""}</>
            : "No voice profile learned yet — Aura needs more of your own writing first."}
        </div>
      </div>

      <div>
        {railLabel("Memory")}
        {memory.length === 0 ? (
          <div data-testid="ask-memory-empty" style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Nothing remembered yet. Memory builds itself as you use Aura — each session leaves a short note here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {memory.map(m => (
              <div key={m.id} style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                <div style={{ ...MONO, fontSize: 10.5, color: "var(--text-muted)" }}>Noted {m.session_date}</div>
                {m.summary}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );

  return createPortal(
    <div data-testid="ask-aura-v2" style={{ position: "fixed", inset: 0, zIndex: 10000, background: "var(--surface-page, var(--surface-card))", display: "flex", flexDirection: "column" }}>
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid var(--rule-outer)", flex: "0 0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--machine)" }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text-primary)" }}>Ask Aura</span>
          {context?.linkedLabel && (
            <span style={{ ...MONO, fontSize: 11, color: "var(--text-muted)" }}>· {context.linkedLabel}</span>
          )}
        </div>
        <button type="button" aria-label="Close" onClick={onClose} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--text-secondary)" }}>
          <X size={18} />
        </button>
      </header>

      <div className="ask-body" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <div className="ask-grid" style={{ height: "100%", maxWidth: 1400, margin: "0 auto", padding: "16px 20px", boxSizing: "border-box" }}>
          <section style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div ref={listRef} style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
              {messages.length === 0 && (
                <div style={{ padding: "36px 4px", maxWidth: 620 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--text-primary)", marginBottom: 8 }}>
                    Ask about your own work.
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    Aura reads your captures, signals and posts. It cannot see the open web or what anyone else has published — so it will tell you when a question sits outside what it can see.
                  </div>
                </div>
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
                ) : (
                  <div key={i} style={{ margin: "14px 0", maxWidth: 720 }}>
                    {m.isError
                      ? <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{m.content}</div>
                      : <Answer text={m.content} />}
                  </div>
                );
              })}

              {loading && (
                <div data-testid="ask-thinking" style={{ ...MONO, fontSize: 12, color: "var(--machine-text)", margin: "10px 0" }}>
                  Reading your graph…
                </div>
              )}

              {!loading && followUps.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "6px 0 16px" }}>
                  {followUps.map(f => (
                    <button key={f} type="button" onClick={() => send(f)} style={{
                      background: "transparent", border: "1px solid var(--act)", color: "var(--act)",
                      borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}>{f}<ArrowUpRight size={13} /></button>
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
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                  rows={2}
                  dir={isAr(input) ? "rtl" : "ltr"}
                  placeholder="Ask about a signal, a draft, or your position"
                  style={{
                    flex: 1, resize: "none", border: 0, outline: "none", background: "transparent",
                    fontSize: 14.5, color: "var(--text-primary)", lineHeight: isAr(input) ? 1.9 : 1.5,
                    fontFamily: isAr(input) ? "var(--ff-ar)" : undefined,
                  }}
                />
                <button type="submit" aria-label="Send" disabled={loading || !input.trim()} style={{
                  background: "var(--act)", color: "var(--text-inverse)", border: 0, borderRadius: 10,
                  width: 38, height: 38, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  cursor: loading || !input.trim() ? "default" : "pointer", opacity: loading || !input.trim() ? 0.5 : 1,
                }}>
                  <Send size={16} />
                </button>
              </form>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {seeds.map(s => (
                  <button key={s.text} type="button" onClick={() => send(s.text)} style={{
                    background: "transparent", border: "1px solid var(--rule-outer)", color: "var(--text-secondary)",
                    borderRadius: 999, padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
                  }}>{s.label}</button>
                ))}
              </div>
            </div>
          </section>

          {rail}
        </div>
      </div>

      <style>{`
        .ask-grid { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 20px; }
        .ask-grid > aside { max-height: 100%; }
        @media (max-width: 1023px) {
          .ask-grid { grid-template-columns: minmax(0,1fr); grid-template-rows: auto minmax(0,1fr); }
          .ask-grid > aside { order: -1; flex-direction: row; gap: 18px; overflow-x: auto; padding: 12px 14px; }
          .ask-grid > aside > div { min-width: 220px; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
