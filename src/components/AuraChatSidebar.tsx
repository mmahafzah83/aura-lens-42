import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, Trash2, Briefcase, Rocket, FileText, Target, Linkedin, Bookmark, Check, Plus, ChevronLeft, Presentation, Clock, MessageSquare, Pin, PinOff, Pencil, ChevronDown } from "lucide-react";
import AuraLogo from "@/components/brand/AuraLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";

/* ── Always-on Context Strip (signals + identity pills) ── */
interface TopSignal { id: string; signal_title: string; }
interface IdentityCtx { level?: string | null; firm?: string | null; sector_focus?: string | null; }

const AlwaysContextStrip = () => {
  const [loaded, setLoaded] = useState(false);
  const [signals, setSignals] = useState<TopSignal[]>([]);
  const [identity, setIdentity] = useState<IdentityCtx>({});

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoaded(true); return; }
        const uid = session.user.id;
        const [sigRes, profRes] = await Promise.all([
          supabase.from("strategic_signals").select("id, signal_title").eq("user_id", uid).eq("status", "active").order("priority_score", { ascending: false }).limit(3),
          supabase.from("diagnostic_profiles").select("level, firm, sector_focus").eq("user_id", uid).maybeSingle(),
        ]);
        setSignals((sigRes.data as TopSignal[]) || []);
        setIdentity((profRes.data as IdentityCtx) || {});
      } catch {
        // fail silently
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const truncate = (s: string, n = 30) => (s || "").length > n ? `${s.slice(0, n)}…` : s;
  const roleParts = [identity.level, identity.firm].filter(Boolean).join(" · ");

  return (
    <div className="mt-1.5 w-full max-w-[85%]">
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
        <ChevronDown className="w-3 h-3" />
        <span>Context used</span>
      </div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Signals row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 9, textTransform: "uppercase", color: "hsl(var(--muted-foreground))", letterSpacing: 0.5, marginRight: 2 }}>Signals</span>
          {!loaded ? null : signals.length > 0 ? (
            signals.map(s => (
              <span key={s.id} style={{ background: "#E6F1FB", color: "#0C447C", fontSize: 10, padding: "2px 8px", borderRadius: 10 }}>
                {truncate(s.signal_title || "Untitled signal", 30)}
              </span>
            ))
          ) : (
            <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>No signals loaded yet</span>
          )}
        </div>
        {/* Identity row */}
        {(roleParts || identity.sector_focus) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 9, textTransform: "uppercase", color: "hsl(var(--muted-foreground))", letterSpacing: 0.5, marginRight: 2 }}>Identity</span>
            {roleParts && (
              <span style={{ background: "#EEEDFE", color: "#3C3489", fontSize: 10, padding: "2px 8px", borderRadius: 10 }}>{roleParts}</span>
            )}
            {identity.sector_focus && (
              <span style={{ background: "#EEEDFE", color: "#3C3489", fontSize: 10, padding: "2px 8px", borderRadius: 10 }}>{identity.sector_focus}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Suggested follow-up question (parsed from response) ── */
const SuggestedFollowUp = ({ content, onAsk }: { content: string; onAsk: (q: string) => void }) => {
  const matches = Array.from(content.matchAll(/\*\*([^*]+)\*\*/g)).map(m => m[1].trim());
  const blacklist = /^(NEXT STEP|PURSUIT STRATEGY)$/i;
  const entity = matches.find(m => m && !blacklist.test(m)) || "your top competitor";
  const question = `What is ${entity}'s exact position on this right now?`;
  return (
    <button
      onClick={() => onAsk(question)}
      className="mt-1.5 text-left hover:underline"
      style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      Also ask: {question} ↗
    </button>
  );
};

/* ── Context Panel — shows what data informed the response ── */
interface MatchedSignal { id: string; signal_title: string; }
interface ProfileCtx { level?: string | null; sector_focus?: string | null; north_star_goal?: string | null; }

const ContextPanel = ({ userQuery }: { userQuery: string }) => {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [signals, setSignals] = useState<MatchedSignal[]>([]);
  const [profile, setProfile] = useState<ProfileCtx>({});

  useEffect(() => {
    if (!expanded || loaded) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoaded(true); return; }
        const uid = session.user.id;
        const [sigRes, profRes] = await Promise.all([
          supabase.from("strategic_signals").select("id, signal_title").eq("user_id", uid).eq("status", "active").limit(50),
          supabase.from("diagnostic_profiles").select("level, sector_focus, north_star_goal").eq("user_id", uid).maybeSingle(),
        ]);
        const q = (userQuery || "").toLowerCase();
        const tokens = q.split(/\s+/).filter(t => t.length > 3);
        const matched = (sigRes.data || []).filter((s: any) => {
          const title = (s.signal_title || "").toLowerCase();
          if (!title) return false;
          if (q && title.includes(q)) return true;
          return tokens.some(t => title.includes(t));
        }).slice(0, 8) as MatchedSignal[];
        setSignals(matched);
        setProfile((profRes.data as ProfileCtx) || {});
      } catch (e) {
        console.error("[ContextPanel] load failed", e);
      } finally {
        setLoaded(true);
      }
    })();
  }, [expanded, loaded, userQuery]);

  const profileRows: { label: string; value: string }[] = [];
  if (profile.level) profileRows.push({ label: "Role", value: profile.level });
  if (profile.sector_focus) profileRows.push({ label: "Sector", value: profile.sector_focus });
  if (profile.north_star_goal) profileRows.push({ label: "Target", value: profile.north_star_goal.slice(0, 60) });

  return (
    <div className="mt-1.5 w-full max-w-[85%]">
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ fontSize: 10, color: "var(--ink-4)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
      >
        Context used {expanded ? "▴" : "↓"}
      </button>
      {expanded && (
        <div style={{ background: "var(--ink)", border: "0.5px solid var(--surface-ink-subtle)", borderRadius: 6, padding: "10px 12px", marginTop: 6 }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--ink-3)", letterSpacing: 0.5 }}>SIGNALS</div>
          {!loaded ? (
            <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>Loading…</div>
          ) : signals.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {signals.map(s => (
                <span key={s.id} style={{ background: "var(--surface-ink-subtle)", border: "1px solid var(--brand-muted)", color: "var(--brand)", fontSize: 9, padding: "2px 7px", borderRadius: 4 }}>
                  {s.signal_title}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>No stored signals matched this query</div>
          )}

          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--ink-3)", letterSpacing: 0.5, marginTop: 8 }}>YOUR PROFILE</div>
          {profileRows.length > 0 ? (
            <div style={{ marginTop: 4 }}>
              {profileRows.map(r => (
                <div key={r.label} style={{ fontSize: 10, color: "var(--ink-5)" }}>· {r.label}: {r.value}</div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>No profile context available</div>
          )}

          {loaded && (
            <div style={{ marginTop: 8, fontSize: 10, color: signals.length > 0 ? "#4a8a4a" : "var(--gold-mid)" }}>
              {signals.length > 0
                ? "Response grounded in your stored intelligence"
                : "Response based on general reasoning — capture more to improve relevance"}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── BLUF Response Block — shows first 2 sentences prominently, rest expandable ── */
const AuraResponseBlock = ({ content }: { content: string }) => {
  const [expanded, setExpanded] = useState(false);

  // Split into sentences, take first 2 as BLUF
  const sentences = content.replace(/\n+/g, " ").match(/[^.!?]*[.!?]+/g) || [content];
  const bluf = sentences.slice(0, 2).join(" ").trim();
  const blufEndIndex = content.indexOf(sentences[1]?.trim() || "") + (sentences[1]?.trim().length || content.length);
  const restMd = content.slice(blufEndIndex).trim();
  const hasMore = restMd.length > 20;

  return (
    <div>
      <div className="text-sm font-semibold leading-relaxed" style={{ color: "var(--brand)" }}>
        <ReactMarkdown
          components={{
            p: ({ children }) => <span>{children}</span>,
          }}
        >
          {bluf || content.slice(0, 200)}
        </ReactMarkdown>
      </div>
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs flex items-center gap-1 transition-colors"
          style={{ color: "var(--ink-5)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          Read full analysis ▾
        </button>
      )}
      {hasMore && expanded && (
        <div className="mt-3 prose prose-sm prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:text-primary [&_code]:text-xs [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded">
          <ReactMarkdown>{restMd}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};

type Msg = { role: "user" | "assistant"; content: string; isBrief?: boolean; isShadowTwin?: boolean };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-aura`;

/* ── Linked context passed from outside ── */
export interface ChatContext {
  linkedType?: "signal" | "insight" | "framework" | "content" | "general";
  linkedId?: string;
  linkedLabel?: string;
}

interface AuraChatSidebarProps {
  open: boolean;
  onClose: () => void;
  initialMessage?: string;
  context?: ChatContext;
}

/* ── Types for DB rows ── */
interface Conversation {
  id: string;
  title: string;
  linked_type: string | null;
  linked_id: string | null;
  linked_label: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

type ViewMode = "chat" | "history" | "vault";

/* ── Vault item type & helpers ── */
interface VaultItem {
  id: string;
  content: string;
  created_at: string;
  type: string;
}

const VAULT_TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  pursuit: { bg: "#EEEDFE", color: "#3C3489" },
  memo: { bg: "#E6F1FB", color: "#0C447C" },
  post: { bg: "#EAF3DE", color: "#27500A" },
  plan: { bg: "#FAEEDA", color: "#633806" },
  deck: { bg: "#F1EFE8", color: "#444441" },
  analysis: { bg: "#F1EFE8", color: "#444441" },
};

function detectVaultType(content: string): string {
  const c = content || "";
  if (/PURSUIT STRATEGY/i.test(c)) return "pursuit";
  if (/EXECUTIVE MEMO/i.test(c) || (/\bTo:/.test(c) && /\bFrom:/.test(c))) return "memo";
  if (/LinkedIn Post/i.test(c) || /Headline:/i.test(c)) return "post";
  if (/90-Day/i.test(c) || /Days\s*1-?30/i.test(c)) return "plan";
  if (/\bSlide\b/i.test(c) || /TITLE:/.test(c)) return "deck";
  return "analysis";
}

const QUICK_ACTIONS = [
  { label: "LinkedIn Post", icon: Linkedin, mode: "linkedin-summary", prompt: "Summarize my most recent strategic insight into a high-authority LinkedIn post." },
  { label: "Identify Gaps", icon: Target, mode: "gap-analysis", prompt: "Analyze my Skill Radar gaps against the Partner benchmark and recommend 90-day actions." },
  { label: "Draft Memo", icon: FileText, mode: "draft-memo", prompt: "Draft an executive memo based on my most recent captures and strategic intelligence." },
  { label: "Meeting Prep", icon: Briefcase, mode: "meeting-prep", prompt: "Prepare a 1-page meeting prep memo for a VP meeting based on my most recent captures." },
  { label: "Draft Deck", icon: Presentation, mode: "draft-deck", prompt: "Draft a strategic presentation based on my most impactful captures." },
  { label: "Synthesize", icon: Rocket, mode: "synthesize-pursuit", prompt: "Synthesize a pursuit from my documents, captures, and leadership insights." },
];

const LINKED_TYPE_COLORS: Record<string, string> = {
  signal: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  insight: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  framework: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  content: "text-purple-400 bg-purple-400/10 border-purple-400/20",
};

const AuraChatSidebar = ({ open, onClose, initialMessage, context }: AuraChatSidebarProps) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [swipeY, setSwipeY] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [headerCounts, setHeaderCounts] = useState<{ signals: number; captures: number } | null>(null);
  // ── Cross-session memory (aura_conversation_memory) ──
  type MemoryRow = { id: string; role: string | null; content: string | null; created_at: string };
  const [memoryRows, setMemoryRows] = useState<MemoryRow[]>([]);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const sessionIdRef = useRef<string>(Date.now().toString());
  // ── Adaptive first-chip label parsed from latest assistant response ──
  const [adaptiveChipLabel, setAdaptiveChipLabel] = useState<string | null>(null);
  // ── Vault (AA-4) ──
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [expandedVaultId, setExpandedVaultId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastInitRef = useRef<string | undefined>(undefined);
  const lastContextRef = useRef<ChatContext | undefined>(undefined);

  // ── Touch handlers ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
    if (dy > 10 && dy > dx) setSwipeY(Math.max(0, dy * 0.6));
  }, []);
  const handleTouchEnd = useCallback(() => {
    if (swipeY > 140) onClose();
    setSwipeY(0);
    touchStartRef.current = null;
  }, [swipeY, onClose]);

  // ── Auto-scroll ──
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ── Focus input ──
  useEffect(() => {
    if (open && viewMode === "chat" && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [open, viewMode]);

  // ── Load conversations list ──
  const loadConversations = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("chat_conversations" as any)
      .select("*")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data) setConversations(data as any as Conversation[]);
  }, []);

  // ── Load header intelligence counts on open ──
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const uid = session.user.id;
        const [sigRes, entRes] = await Promise.all([
          supabase.from("strategic_signals").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "active"),
          supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", uid),
        ]);
        setHeaderCounts({ signals: sigRes.count ?? 0, captures: entRes.count ?? 0 });
      } catch {
        // fail silently
      }
    })();
  }, [open]);

  // ── Load cross-session memory on open ──
  useEffect(() => {
    if (!open) { setShowMemoryPanel(false); return; }
    sessionIdRef.current = Date.now().toString();
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setMemoryRows([]); return; }
        const { data } = await supabase
          .from("aura_conversation_memory" as any)
          .select("id, role, content, created_at")
          .eq("user_id", session.user.id)
          .not("role", "is", null)
          .not("content", "is", null)
          .order("created_at", { ascending: false })
          .limit(10);
        setMemoryRows(((data as any[]) || []) as MemoryRow[]);
      } catch {
        setMemoryRows([]);
      }
    })();
  }, [open]);

  // ── Load messages for a conversation ──
  const loadMessages = useCallback(async (convId: string) => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("chat_messages" as any)
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages((data as any[]).map(m => ({ role: m.role as "user" | "assistant", content: m.content })));
    }
    setLoadingHistory(false);
  }, []);

  // ── Create new conversation ──
  const createConversation = useCallback(async (ctx?: ChatContext): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase
      .from("chat_conversations" as any)
      .insert({
        user_id: session.user.id,
        title: ctx?.linkedLabel || "New Chat",
        linked_type: ctx?.linkedType || "general",
        linked_id: ctx?.linkedId || null,
        linked_label: ctx?.linkedLabel || null,
      } as any)
      .select()
      .single();
    if (error || !data) { console.error("Failed to create conversation:", error); return null; }
    const conv = data as any as Conversation;
    setActiveConvId(conv.id);
    setActiveConv(conv);
    return conv.id;
  }, []);

  // ── Save message to DB ──
  const saveMessage = useCallback(async (convId: string, role: "user" | "assistant", content: string, mode?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("chat_messages" as any).insert({
      conversation_id: convId,
      user_id: session.user.id,
      role,
      content,
      mode: mode || null,
    } as any);
    // Update conversation updated_at and auto-title
    if (role === "user" && content.trim()) {
      const title = content.trim().slice(0, 60) + (content.length > 60 ? "…" : "");
      await supabase.from("chat_conversations" as any).update({ title, updated_at: new Date().toISOString() } as any).eq("id", convId);
      setActiveConv(prev => prev ? { ...prev, title } : prev);
    } else {
      await supabase.from("chat_conversations" as any).update({ updated_at: new Date().toISOString() } as any).eq("id", convId);
    }
  }, []);

  // ── Handle open/close + initial message ──
  useEffect(() => {
    if (open) {
      loadConversations();
      const contextChanged = JSON.stringify(context) !== JSON.stringify(lastContextRef.current);
      const messageChanged = initialMessage !== lastInitRef.current;

      if (contextChanged || messageChanged) {
        lastInitRef.current = initialMessage;
        lastContextRef.current = context;

        // Check if there's an existing conversation for this linked object
        if (context?.linkedId) {
          const existing = conversations.find(
            c => c.linked_id === context.linkedId && c.linked_type === context.linkedType
          );
          if (existing) {
            setActiveConvId(existing.id);
            setActiveConv(existing);
            loadMessages(existing.id).then(() => {
              if (initialMessage) setTimeout(() => send(initialMessage, undefined, existing.id), 100);
            });
            setViewMode("chat");
            return;
          }
        }

        // Start fresh
        setMessages([]);
        setSavedIndices(new Set());
        setActiveConvId(null);
        setActiveConv(null);
        setViewMode("chat");

        if (initialMessage) {
          setTimeout(() => send(initialMessage, undefined, null, context), 100);
        }
      }
    } else {
      lastInitRef.current = undefined;
      lastContextRef.current = undefined;
    }
  }, [open, initialMessage, context]);

  // ── Streaming chat ──
  const streamChat = async (
    allMessages: Msg[],
    mode?: string,
    opts?: { extraSystem?: string; tagShadowTwin?: boolean }
  ) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");

    // Prepend an additional system message to the EF input so it survives unchanged.
    const outboundMessages: Array<{ role: string; content: string }> = opts?.extraSystem
      ? [{ role: "system", content: opts.extraSystem }, ...allMessages.map(m => ({ role: m.role, content: m.content }))]
      : allMessages.map(m => ({ role: m.role, content: m.content }));

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ messages: outboundMessages, mode }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error || `Error ${resp.status}`);
    }
    if (!resp.body) throw new Error("No response body");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantSoFar = "";

    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1
              ? { ...m, content: assistantSoFar, ...(opts?.tagShadowTwin ? { isShadowTwin: true } : {}) }
              : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar, ...(opts?.tagShadowTwin ? { isShadowTwin: true } : {}) }];
      });
    };

    let done = false;
    while (!done) {
      const { done: readerDone, value } = await reader.read();
      if (readerDone) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") { done = true; break; }
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) upsert(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    if (buffer.trim()) {
      for (let raw of buffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) upsert(content);
        } catch {}
      }
    }

    return assistantSoFar;
  };

  // ── Send message ──
  const send = async (text: string, mode?: string, existingConvId?: string | null, ctx?: ChatContext) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setShowMemoryPanel(false);
    // Reset adaptive chip when a new message is sent
    setAdaptiveChipLabel(null);

    // Build silent cross-session memory prefix (last 5 user/assistant rows, chronological)
    const memoryPrefix: Msg[] = memoryRows
      .filter(r => (r.role === "user" || r.role === "assistant") && r.content)
      .slice(0, 5)
      .reverse()
      .map(r => ({ role: r.role as "user" | "assistant", content: r.content as string }));

    try {
      // Ensure we have a conversation
      let convId = existingConvId ?? activeConvId;
      if (!convId) {
        convId = await createConversation(ctx || context);
        if (!convId) throw new Error("Failed to create conversation");
      }

      // Save user message
      await saveMessage(convId, "user", text.trim(), mode);

      // Persist user turn to cross-session memory (silent failure)
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;
          await supabase.from("aura_conversation_memory" as any).insert({
            user_id: session.user.id,
            role: "user",
            content: text.trim(),
            session_id: sessionIdRef.current,
            metadata: {},
          } as any);
        } catch (e) { console.error("[memory] user insert failed", e); }
      })();

      // ── Shadow Twin detection ──
      const SHADOW_TRIGGER = "Generate my Shadow Twin portrait.";
      let extraSystem: string | undefined;
      let tagShadowTwin = false;
      if (text.trim() === SHADOW_TRIGGER) {
        tagShadowTwin = true;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const uid = session?.user?.id;
          if (uid) {
            const [sigRes, profRes, postRes] = await Promise.all([
              supabase.from("strategic_signals" as any)
                .select("signal_title, fragment_count, explanation")
                .eq("user_id", uid)
                .order("priority_score", { ascending: false })
                .limit(3),
              supabase.from("diagnostic_profiles" as any)
                .select("sector_focus, core_practice, north_star_goal, level, firm, brand_pillars")
                .eq("user_id", uid)
                .maybeSingle(),
              supabase.from("linkedin_posts" as any)
                .select("post_text, engagement_score")
                .eq("user_id", uid)
                .order("published_at", { ascending: false })
                .limit(5),
            ]);
            const sigs = ((sigRes.data as any[]) || []).map((s, i) =>
              `${i + 1}. ${s.signal_title} (fragments: ${s.fragment_count ?? 0}) — ${s.explanation || ""}`
            ).join("\n");
            const p: any = profRes.data || {};
            const profile = `Sector: ${p.sector_focus || "—"} | Practice: ${p.core_practice || "—"} | Level: ${p.level || "—"} | Firm: ${p.firm || "—"} | North Star: ${p.north_star_goal || "—"} | Pillars: ${(p.brand_pillars || []).join(", ") || "—"}`;
            const posts = ((postRes.data as any[]) || []).map((pp, i) =>
              `${i + 1}. (engagement ${pp.engagement_score ?? 0}) ${(pp.post_text || "").slice(0, 240)}`
            ).join("\n");
            extraSystem = `---SHADOW TWIN SYSTEM PROMPT OVERRIDE---

The user has requested their "Shadow Twin" — a portrait of the expert they are capable of being but have not yet fully claimed in public. This is a deeply personal and strategic output. Override your usual format for this response only.

SHADOW TWIN CONTEXT:
PROFILE — ${profile}
TOP 3 SIGNALS:
${sigs || "—"}
RECENT 5 POSTS:
${posts || "—"}

Generate a 220-word portrait structured exactly as follows:

PARAGRAPH 1 — The claimed identity (60 words): Write who this professional is known as in 18 months. Give them a specific title that does not exist yet but is earned. Name the exact topic they own. Name one specific framework or model they are associated with by name (invent a plausible name based on their signals). Write in third person, present tense, as if it is already true.

PARAGRAPH 2 — The evidence trail (80 words): Name exactly 3 posts or pieces of content they published that shifted how the market sees them. These must be grounded in their top signals — cite signal_titles by exact name in bold. Each piece of content should have a specific title and the sentence it changed.

PARAGRAPH 3 — The gap (80 words): Name the 3 specific things that stand between their current state and this portrait. Be direct and uncomfortable. Name the content they have NOT published. Name the competitor who currently holds the position they are reaching for. End with one action — the single post or framework that would start closing the gap. End with NEXT STEP: [specific action].

---END SHADOW TWIN SYSTEM PROMPT OVERRIDE---`;
          }
        } catch (e) {
          console.error("[shadow-twin] context fetch failed", e);
        }
      }

      // Stream response (with silent memory prefix prepended)
      const assistantContent = await streamChat(
        [...memoryPrefix, ...newMessages],
        mode,
        { extraSystem, tagShadowTwin }
      );

      // Save assistant message
      if (assistantContent) {
        await saveMessage(convId, "assistant", assistantContent);
        // Parse adaptive chip label from latest response
        const m = assistantContent.match(/\b(Draft|Write|Develop|Send|Create|Propose|Schedule|Prepare|Build)\s+(?:an?\s+|the\s+)?([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*){0,2})/i);
        if (m) {
          const noun = m[2].replace(/[.,;:!?]+$/, "").trim();
          const cap = noun.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
          let label = `Draft ${cap}`;
          if (label.length > 20) label = label.slice(0, 20).trimEnd();
          setAdaptiveChipLabel(label);
        } else {
          setAdaptiveChipLabel(null);
        }
        // Persist assistant turn to cross-session memory (silent failure)
        (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            await supabase.from("aura_conversation_memory" as any).insert({
              user_id: session.user.id,
              role: "assistant",
              content: assistantContent,
              session_id: sessionIdRef.current,
              metadata: { signal_titles_referenced: [] },
            } as any);
          } catch (e) { console.error("[memory] assistant insert failed", e); }
        })();
      }
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `⚠️ ${e.message || "Didn't connect. Try once more."}` },
      ]);
    }
    setIsLoading(false);
  };

  // ── New chat ──
  const startNewChat = () => {
    setMessages([]);
    setSavedIndices(new Set());
    setActiveConvId(null);
    setActiveConv(null);
    setViewMode("chat");
  };

  // ── Weekly proactive brief on open (AA-5) ──
  const briefTriggeredRef = useRef(false);
  useEffect(() => {
    if (!open) { briefTriggeredRef.current = false; return; }
    if (briefTriggeredRef.current) return;
    if (initialMessage) return; // don't override an explicit message
    if (context?.linkedId) return; // don't override a contextual open
    try {
      const last = localStorage.getItem("aura_last_brief_shown");
      const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
      if (last && Date.now() - parseInt(last, 10) < sixDaysMs) return;
    } catch { /* localStorage unavailable */ }
    briefTriggeredRef.current = true;

    const briefPrompt = "Generate my proactive weekly intelligence brief. Include: (1) my top 2 signals by priority_score and exactly why they matter THIS week — name a recent development, (2) one specific publishing window open right now based on my last post date and signal momentum, (3) one uncomfortable truth about a gap in my authority positioning, (4) one concrete next step with a specific deadline. Cite signal_titles by exact name in bold. Be direct and contrarian. End with NEXT STEP:.";

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        // Push placeholder assistant message marked as brief
        setMessages(prev => prev.length === 0 ? [{ role: "assistant", content: "", isBrief: true }] : prev);
        setIsLoading(true);
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ messages: [{ role: "user", content: briefPrompt }] }),
        });
        if (!resp.ok || !resp.body) throw new Error("brief request failed");
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = ""; let acc = "";
        const flush = (chunk: string) => {
          acc += chunk;
          setMessages(prev => {
            // Find last brief message index
            let idx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === "assistant" && prev[i].isBrief) { idx = i; break; }
            }
            if (idx === -1) return [...prev, { role: "assistant", content: acc, isBrief: true }];
            return prev.map((m, i) => i === idx ? { ...m, content: acc } : m);
          });
        };
        let done = false;
        while (!done) {
          const { done: d, value } = await reader.read();
          if (d) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const j = line.slice(6).trim();
            if (j === "[DONE]") { done = true; break; }
            try {
              const p = JSON.parse(j);
              const c = p.choices?.[0]?.delta?.content;
              if (c) flush(c);
            } catch { /* ignore */ }
          }
        }
        try { localStorage.setItem("aura_last_brief_shown", Date.now().toString()); } catch { /* ignore */ }
      } catch (e) {
        console.error("[weekly brief]", e);
        // Remove empty brief placeholder on failure
        setMessages(prev => prev.filter(m => !(m.isBrief && !m.content)));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Vault: load saved items from aura_conversation_memory ──
  const loadVault = useCallback(async () => {
    setVaultLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setVaultItems([]); return; }
      const { data, error } = await supabase
        .from("aura_conversation_memory")
        .select("id, content, created_at, metadata")
        .eq("user_id", session.user.id)
        .eq("role", "assistant")
        .filter("metadata->>saved", "eq", "true")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const items: VaultItem[] = (data || []).map((r: any) => ({
        id: r.id,
        content: r.content || "",
        created_at: r.created_at,
        type: (r.metadata && r.metadata.type) || detectVaultType(r.content || ""),
      }));
      setVaultItems(items);
    } catch (e) {
      // fail silently
      setVaultItems([]);
    } finally {
      setVaultLoading(false);
    }
  }, []);

  const openVault = useCallback(() => {
    loadVault();
    setViewMode("vault");
  }, [loadVault]);

  // ── Vault: ask follow-up — load content as first assistant message in new chat ──
  const vaultAskFollowUp = (content: string) => {
    sessionIdRef.current = "session_" + Date.now().toString();
    setActiveConvId(null);
    setActiveConv(null);
    setSavedIndices(new Set());
    setMessages([{ role: "assistant", content }]);
    setViewMode("chat");
  };

  // ── Vault: soft-delete by setting metadata.saved = false ──
  const vaultDelete = async (item: VaultItem) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const newMeta = {
        saved: false,
        unsaved_at: new Date().toISOString(),
        type: item.type,
      };
      const { error } = await supabase
        .from("aura_conversation_memory")
        .update({ metadata: newMeta })
        .eq("id", item.id)
        .eq("user_id", session.user.id);
      if (error) throw error;
      setVaultItems(prev => prev.filter(v => v.id !== item.id));
      toast.success("Removed from Vault");
    } catch (e: any) {
      toast.error("Failed to remove", { description: e?.message });
    }
  };

  // ── Open existing conversation ──
  const openConversation = async (conv: Conversation) => {
    setActiveConvId(conv.id);
    setActiveConv(conv);
    setSavedIndices(new Set());
    await loadMessages(conv.id);
    setViewMode("chat");
  };

  // ── Delete conversation ──
  const deleteConversation = async (convId: string) => {
    await supabase.from("chat_conversations" as any).delete().eq("id", convId);
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConvId === convId) startNewChat();
    toast.success("Chat deleted");
  };

  // ── Pin/unpin ──
  const togglePin = async (conv: Conversation) => {
    await supabase.from("chat_conversations" as any).update({ pinned: !conv.pinned } as any).eq("id", conv.id);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, pinned: !c.pinned } : c));
    if (activeConv?.id === conv.id) setActiveConv(prev => prev ? { ...prev, pinned: !prev.pinned } : prev);
  };

  // ── Rename ──
  const saveTitle = async () => {
    if (!activeConv || !titleDraft.trim()) return;
    await supabase.from("chat_conversations" as any).update({ title: titleDraft.trim() } as any).eq("id", activeConv.id);
    setActiveConv(prev => prev ? { ...prev, title: titleDraft.trim() } : prev);
    setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, title: titleDraft.trim() } : c));
    setEditingTitle(false);
  };

  const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
    const topic = input.trim();
    if (topic) {
      send(`${action.prompt.replace("my most recent", `the following: ${topic}`)}`, action.mode);
    } else {
      send(action.prompt, action.mode);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  if (!open) return null;

  // ── Group conversations ──
  const pinnedConvs = conversations.filter(c => c.pinned);
  const recentConvs = conversations.filter(c => !c.pinned);
  const linkedGroups: Record<string, Conversation[]> = {};
  recentConvs.forEach(c => {
    if (c.linked_type && c.linked_type !== "general") {
      if (!linkedGroups[c.linked_type]) linkedGroups[c.linked_type] = [];
      linkedGroups[c.linked_type].push(c);
    }
  });
  const generalConvs = recentConvs.filter(c => !c.linked_type || c.linked_type === "general");

  const contextLabel = activeConv?.linked_label || context?.linkedLabel;
  const contextType = activeConv?.linked_type || context?.linkedType;

  return (
    <div data-testid="aura-chat-panel" className="fixed inset-0 z-[10000] flex flex-col items-center justify-end" style={{ willChange: "unset" }}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" style={{ zIndex: 999, pointerEvents: "all" }} onClick={onClose} />

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative flex flex-col w-full bg-background rounded-t-2xl overflow-hidden"
        style={{
          height: "85vh",
          zIndex: 1000,
          transform: swipeY > 0 ? `translateY(${swipeY}px)` : "translateY(0)",
          transition: swipeY > 0 ? "none" : "transform 0.3s ease-out",
          opacity: swipeY > 0 ? Math.max(0.3, 1 - swipeY / 400) : 1,
          willChange: "unset",
        }}
      >
        {/* Swipe handle */}
        <div className="flex justify-center pt-2.5 pb-1 cursor-grab">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* ═══ Header ═══ */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0 min-h-[52px]">
          {viewMode === "history" ? (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setViewMode("chat")} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary tactile-press">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h2 className="text-sm font-semibold text-foreground">Chat History</h2>
              </div>
              <button
                onClick={startNewChat}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors tactile-press"
              >
                <Plus className="w-3.5 h-3.5" />
                New Chat
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  <AuraLogo size={32} variant="auto" />
                </div>
                <div className="min-w-0 flex-1">
                  {editingTitle && activeConv ? (
                    <input
                      value={titleDraft}
                      onChange={e => setTitleDraft(e.target.value)}
                      onBlur={saveTitle}
                      onKeyDown={e => e.key === "Enter" && saveTitle()}
                      className="text-sm font-semibold text-foreground bg-transparent border-b border-primary/40 outline-none w-full"
                      autoFocus
                    />
                  ) : (
                    <h2
                      className="text-sm font-semibold text-foreground truncate cursor-pointer"
                      onClick={() => {
                        if (activeConv) {
                          setTitleDraft(activeConv.title);
                          setEditingTitle(true);
                        }
                      }}
                    >
                      {activeConv?.title || "Aura"}
                    </h2>
                  )}
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {activeConv ? "Strategic Thread" : "Chief of Staff"}
                  </p>
                  {!activeConv && headerCounts && (
                    <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", opacity: 0.7, marginTop: 1 }}>
                      {headerCounts.signals} signals · {headerCounts.captures} captures loaded
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={startNewChat}
                  className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-lg hover:bg-secondary tactile-press"
                  title="New Chat"
                >
                  <Plus className="w-4.5 h-4.5" />
                </button>
                <button
                  onClick={() => setShowMemoryPanel(v => !v)}
                  className={`p-2 transition-colors rounded-lg hover:bg-secondary tactile-press ${showMemoryPanel ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  title="Memory history"
                >
                  <Clock className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { if (viewMode === "vault") { setViewMode("chat"); } else { openVault(); } }}
                  className={`p-2 transition-colors rounded-lg hover:bg-secondary tactile-press ${viewMode === "vault" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  title="Vault"
                >
                  <Bookmark className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { loadConversations(); setViewMode("history"); }}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary tactile-press"
                  title="Chat History"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-secondary tactile-press">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* ═══ Context Banner ═══ */}
        {viewMode === "chat" && contextLabel && contextType && (
          <div className={`mx-4 mt-2 px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 ${LINKED_TYPE_COLORS[contextType] || "text-muted-foreground bg-secondary/40 border-border/20"}`}>
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {activeConv ? "Continuing" : "Linked to"}: {contextLabel}
            </span>
            <span className="text-[10px] opacity-60 uppercase shrink-0">{contextType}</span>
          </div>
        )}

        {/* ═══ Cross-session Memory Bar (AA-2) ═══ */}
        {viewMode === "chat" && (() => {
          const lastAssistant = memoryRows.find(r => r.role === "assistant" && r.content);
          if (!lastAssistant) return null;
          const topic = (lastAssistant.content || "").replace(/\s+/g, " ").trim().slice(0, 70);
          const lastAssistants = memoryRows.filter(r => r.role === "assistant" && r.content).slice(0, 5);
          return (
            <div style={{ background: "var(--gold-pale)", borderBottom: "0.5px solid var(--gold-light)" }}>
              <div className="flex items-center gap-2 px-4 py-2">
                <span style={{ background: "var(--brand)", color: "#fff", fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Remembers
                </span>
                <span style={{ fontSize: 11, color: "var(--gold-text)", lineHeight: 1.35 }} className="truncate">
                  Continuing from last session — {topic}
                </span>
              </div>
              {showMemoryPanel && (
                <div style={{ borderTop: "0.5px solid var(--gold-light)", background: "var(--gold-pale-2)", padding: "6px 8px" }}>
                  {lastAssistants.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--gold-mid-2)", padding: "6px 8px" }}>No recent memory yet.</div>
                  ) : (
                    lastAssistants.map(r => {
                      const ts = new Date(r.created_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                      const snippet = (r.content || "").replace(/\s+/g, " ").trim().slice(0, 80);
                      return (
                        <button
                          key={r.id}
                          onClick={() => { send(r.content || ""); }}
                          className="w-full text-left tactile-press"
                          style={{ display: "block", padding: "6px 8px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", marginBottom: 2 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--gold-pale-3)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          <div style={{ fontSize: 9, color: "var(--gold-mid-3)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>{ts}</div>
                          <div style={{ fontSize: 11, color: "var(--gold-dark)", lineHeight: 1.35 }}>{snippet}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══ HISTORY VIEW ═══ */}
        {viewMode === "history" && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Start a new chat to begin</p>
              </div>
            ) : (
              <>
                {/* Pinned */}
                {pinnedConvs.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-2 px-1">Pinned</p>
                    <div className="space-y-1">
                      {pinnedConvs.map(c => (
                        <ConversationRow key={c.id} conv={c} onOpen={openConversation} onDelete={deleteConversation} onTogglePin={togglePin} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Linked groups */}
                {Object.entries(linkedGroups).map(([type, convs]) => (
                  <div key={type}>
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-2 px-1 capitalize">{type}s</p>
                    <div className="space-y-1">
                      {convs.map(c => (
                        <ConversationRow key={c.id} conv={c} onOpen={openConversation} onDelete={deleteConversation} onTogglePin={togglePin} />
                      ))}
                    </div>
                  </div>
                ))}

                {/* General / Recent */}
                {generalConvs.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-2 px-1">Recent</p>
                    <div className="space-y-1">
                      {generalConvs.map(c => (
                        <ConversationRow key={c.id} conv={c} onOpen={openConversation} onDelete={deleteConversation} onTogglePin={togglePin} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══ VAULT VIEW ═══ */}
        {viewMode === "vault" && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
            {vaultLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : vaultItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <Bookmark className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-xs text-muted-foreground/60 max-w-[260px] leading-relaxed">
                  Your saved Aura responses appear here. Click Save to Vault after any response.
                </p>
              </div>
            ) : (
              vaultItems.map(item => {
                const style = VAULT_TYPE_STYLES[item.type] || VAULT_TYPE_STYLES.analysis;
                const date = new Date(item.created_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                const isExpanded = expandedVaultId === item.id;
                const preview = (item.content || "").replace(/\s+/g, " ").trim().slice(0, 100);
                return (
                  <div
                    key={item.id}
                    onClick={() => setExpandedVaultId(isExpanded ? null : item.id)}
                    className="group rounded-lg border border-border/30 bg-secondary/30 hover:bg-secondary/50 transition-colors p-3 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span style={{ background: style.bg, color: style.color, fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
                        {item.type}
                      </span>
                      <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", opacity: 0.7 }}>
                        {date}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.45, whiteSpace: isExpanded ? "pre-wrap" : "normal" }}>
                      {isExpanded ? item.content : (preview + (item.content.length > 100 ? "…" : ""))}
                    </div>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 md:opacity-0 max-md:opacity-100 transition-opacity"
                    >
                      <button
                        onClick={() => vaultAskFollowUp(item.content)}
                        className="text-[11px] font-medium px-2 py-1 rounded-md text-primary hover:bg-primary/10 tactile-press"
                      >
                        Ask follow-up →
                      </button>
                      <button
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(item.content); toast.success("Copied"); }
                          catch { toast.error("Copy failed"); }
                        }}
                        className="text-[11px] font-medium px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 tactile-press"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => vaultDelete(item)}
                        className="text-[11px] font-medium px-2 py-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 tactile-press"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══ CHAT VIEW ═══ */}
        {viewMode === "chat" && (
          <>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
              {loadingHistory ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <AuraLogo size={40} variant="auto" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">Your Chief of Staff</h3>
                  <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed">
                    {EMPTY_STATE.askAura.text}
                  </p>
                  <div className="mt-5 space-y-2 w-full max-w-[280px]">
                    {[
                      "What should I write about?",
                      "What did my competitors publish?",
                      "Where am I invisible?",
                    ].map(q => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="w-full text-left text-xs px-3 py-2.5 rounded-lg bg-secondary/60 border border-border/20 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors tactile-press"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    {msg.role === "assistant" && msg.isBrief && (
                      <div
                        className="max-w-[85%]"
                        style={{ fontSize: 10, color: "var(--brand)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}
                      >
                        WEEKLY BRIEF · {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </div>
                    )}
                    {msg.role === "assistant" && msg.isShadowTwin && (
                      <div
                        className="max-w-[85%]"
                        style={{ fontSize: 10, color: "#534AB7", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 500, marginBottom: 4 }}
                      >
                        YOUR MARKET MIRROR — 18 MONTHS AHEAD
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-secondary/60 border border-border/20 text-foreground rounded-bl-md"
                      }`}
                      style={{
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        ...(msg.role === "assistant" && msg.isBrief ? { borderLeft: "3px solid var(--brand)" } : {}),
                        ...(msg.role === "assistant" && msg.isShadowTwin ? { borderLeft: "3px solid #7F77DD" } : {}),
                      }}
                    >
                      {msg.role === "assistant" ? (
                        <ReactMarkdown
                          components={{
                            // Preserve the bubble's text-sm leading-relaxed styling
                            p: ({ children }) => (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap [&:not(:last-child)]:mb-2">
                                {children}
                              </p>
                            ),
                            strong: ({ children }) => (
                              <strong className="font-semibold text-foreground">{children}</strong>
                            ),
                            em: ({ children }) => <em className="italic">{children}</em>,
                            br: () => <br />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        msg.content
                      )}
                    </div>
                    {msg.role === "assistant" && msg.content && !isLoading && (
                      <>
                        <AlwaysContextStrip />
                        <SuggestedFollowUp content={msg.content} onAsk={(q) => send(q)} />
                      </>
                    )}
                    {msg.role === "assistant" && msg.content && !isLoading && (
                      <button
                        onClick={async () => {
                          try {
                            const { data: { session } } = await supabase.auth.getSession();
                            if (!session?.user) { toast.error("Sign in to save"); return; }
                            const detectedType = detectVaultType(msg.content);
                            const { error } = await supabase.from("aura_conversation_memory").insert({
                              user_id: session.user.id,
                              role: "assistant",
                              content: msg.content,
                              session_id: "vault_" + Date.now().toString(),
                              metadata: { saved: true, saved_at: new Date().toISOString(), type: detectedType },
                            });
                            if (error) throw error;
                            setSavedFlash(prev => new Set(prev).add(i));
                            setTimeout(() => {
                              setSavedFlash(prev => {
                                const next = new Set(prev);
                                next.delete(i);
                                return next;
                              });
                            }, 2000);
                            toast.success("Saved to Vault");
                          } catch (e: any) {
                            toast.error("Failed to save", { description: e.message });
                          }
                        }}
                        className={`mt-1.5 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors tactile-press ${
                          savedFlash.has(i) ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-secondary/60"
                        }`}
                      >
                        {savedFlash.has(i) ? <Check className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
                        {savedFlash.has(i) ? "Saved ✓" : "Save to Vault"}
                      </button>
                    )}
                    {msg.role === "assistant" && msg.content && !isLoading && msg.isShadowTwin && (
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(msg.content);
                            toast.success("Portrait copied");
                          } catch {
                            toast.error("Copy failed");
                          }
                        }}
                        className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors tactile-press"
                        style={{
                          background: "#EEEDFE",
                          color: "#3C3489",
                          border: "0.5px solid #AFA9EC",
                        }}
                      >
                        Copy portrait
                      </button>
                    )}
                  </div>
                ))
              )}

              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex justify-start">
                  <div className="bg-secondary/60 border border-border/20 rounded-2xl rounded-bl-md px-4 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div
              className="border-t border-border/30 px-4 py-3 space-y-2 shrink-0 bg-background"
              style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
            >
              {/* Quick Actions */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                {QUICK_ACTIONS.map((action, idx) => {
                  const isAdaptive = idx === 0 && !!adaptiveChipLabel;
                  const label = isAdaptive ? (adaptiveChipLabel as string) : action.label;
                  return (
                    <button
                      key={action.mode}
                      onClick={() => isAdaptive ? send(label) : handleQuickAction(action)}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-primary/70 hover:text-primary transition-colors disabled:opacity-50 px-2.5 py-1.5 rounded-lg bg-secondary/40 border border-border/20 whitespace-nowrap shrink-0 tactile-press"
                    >
                      <action.icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  );
                })}
                {/* Market Mirror chip (O-3, formerly Shadow Twin BB-4) */}
                <button
                  key="market-mirror"
                  onClick={() => send("Generate my Shadow Twin portrait.")}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 text-[11px] transition-colors disabled:opacity-50 px-2.5 py-1.5 rounded-lg whitespace-nowrap shrink-0 tactile-press"
                  style={{
                    background: "#EEEDFE",
                    border: "0.5px solid #AFA9EC",
                    color: "#3C3489",
                    fontWeight: 500,
                  }}
                >
                  Market Mirror ↗
                </button>
              </div>

              <div className="flex gap-2">
                <Textarea
                  ref={textareaRef}
                  data-testid="aura-chat-input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Strategic query…"
                  rows={1}
                  className="flex-1 bg-secondary border-border/30 resize-none text-sm min-h-[44px] max-h-[120px]"
                />
                <Button
                  data-testid="aura-send-btn"
                  onClick={() => send(input)}
                  disabled={isLoading || !input.trim()}
                  size="icon"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-11 w-11 flex-shrink-0"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ── Conversation Row Component ── */
const ConversationRow = ({
  conv,
  onOpen,
  onDelete,
  onTogglePin,
}: {
  conv: Conversation;
  onOpen: (c: Conversation) => void;
  onDelete: (id: string) => void;
  onTogglePin: (c: Conversation) => void;
}) => {
  const typeColor = conv.linked_type && conv.linked_type !== "general"
    ? LINKED_TYPE_COLORS[conv.linked_type] || ""
    : "";
  const timeAgo = getTimeAgo(conv.updated_at);

  return (
    <div className="group flex items-center gap-2 px-3 py-3 rounded-xl hover:bg-secondary/40 transition-colors cursor-pointer" onClick={() => onOpen(conv)}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{conv.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground/50">{timeAgo}</span>
          {conv.linked_type && conv.linked_type !== "general" && (
            <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${typeColor}`}>
              {conv.linked_type}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onTogglePin(conv); }}
          className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded-md"
          title={conv.pinned ? "Unpin" : "Pin"}
        >
          {conv.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
          className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors rounded-md"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default AuraChatSidebar;
