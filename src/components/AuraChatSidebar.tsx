import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, Zap, Trash2, Briefcase, Rocket, FileText, Target, Linkedin, Bookmark, Check, Plus, ChevronLeft, Presentation, Clock, MessageSquare, Pin, PinOff, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";

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
        style={{ fontSize: 10, color: "#444", background: "none", border: "none", padding: 0, cursor: "pointer" }}
      >
        Context used {expanded ? "▴" : "↓"}
      </button>
      {expanded && (
        <div style={{ background: "#111", border: "0.5px solid #1e1e1e", borderRadius: 6, padding: "10px 12px", marginTop: 6 }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "#333", letterSpacing: 0.5 }}>SIGNALS</div>
          {!loaded ? (
            <div style={{ fontSize: 10, color: "#333", marginTop: 4 }}>Loading…</div>
          ) : signals.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {signals.map(s => (
                <span key={s.id} style={{ background: "#1a1400", border: "1px solid #F9731633", color: "#F97316", fontSize: 9, padding: "2px 7px", borderRadius: 4 }}>
                  {s.signal_title}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "#333", marginTop: 4 }}>No stored signals matched this query</div>
          )}

          <div style={{ fontSize: 9, textTransform: "uppercase", color: "#333", letterSpacing: 0.5, marginTop: 8 }}>YOUR PROFILE</div>
          {profileRows.length > 0 ? (
            <div style={{ marginTop: 4 }}>
              {profileRows.map(r => (
                <div key={r.label} style={{ fontSize: 10, color: "#555" }}>· {r.label}: {r.value}</div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "#333", marginTop: 4 }}>No profile context available</div>
          )}

          {loaded && (
            <div style={{ marginTop: 8, fontSize: 10, color: signals.length > 0 ? "#4a8a4a" : "#8a6a20" }}>
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
      <div className="text-sm font-semibold leading-relaxed" style={{ color: "#F97316" }}>
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
          style={{ color: "#666666", background: "none", border: "none", cursor: "pointer", padding: 0 }}
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

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-aura`;

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

type ViewMode = "chat" | "history";

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
  const streamChat = async (allMessages: Msg[], mode?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ messages: allMessages, mode }),
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
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
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

    try {
      // Ensure we have a conversation
      let convId = existingConvId ?? activeConvId;
      if (!convId) {
        convId = await createConversation(ctx || context);
        if (!convId) throw new Error("Failed to create conversation");
      }

      // Save user message
      await saveMessage(convId, "user", text.trim(), mode);

      // Stream response
      const assistantContent = await streamChat(newMessages, mode);

      // Save assistant message
      if (assistantContent) {
        await saveMessage(convId, "assistant", assistantContent);
      }
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `⚠️ ${e.message || "Something went wrong."}` },
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
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-end" style={{ willChange: "unset" }}>
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
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-primary-foreground" />
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
                  onClick={() => { loadConversations(); setViewMode("history"); }}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary tactile-press"
                  title="Chat History"
                >
                  <Clock className="w-4 h-4" />
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
                    <Zap className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">Strategic Intelligence</h3>
                  <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
                    Cross-referencing your Skill Radar, Learned Intelligence, and saved frameworks. Every response grounded in your vault.
                  </p>
                  <div className="mt-5 space-y-2 w-full max-w-[280px]">
                    {[
                      "What are the macro-drivers in my sector this quarter?",
                      "Where is my biggest gap to Partner level?",
                      "Draft a strategic position on my latest capture",
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
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-secondary/60 border border-border/20 text-foreground rounded-bl-md"
                      }`}
                      style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
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
                      <ContextPanel userQuery={messages[i - 1]?.role === "user" ? messages[i - 1].content : ""} />
                    )}
                    {msg.role === "assistant" && msg.content && !isLoading && (
                      <button
                        onClick={async () => {
                          if (savedIndices.has(i)) return;
                          try {
                            const { data: { session } } = await supabase.auth.getSession();
                            if (!session?.user) { toast.error("Sign in to save"); return; }
                            const title = msg.content.split("\n").find(l => l.trim().length > 5)?.replace(/[#*◈]/g, "").trim().slice(0, 80) || "Aura Insight";
                            const { error } = await supabase.from("entries").insert({
                              user_id: session.user.id,
                              type: "text",
                              content: msg.content,
                              title: `📌 ${title}`,
                              summary: "Saved from Aura chat",
                              pinned: true,
                              skill_pillar: "Strategic Architecture",
                            });
                            if (error) throw error;
                            setSavedIndices(prev => new Set(prev).add(i));
                            toast.success("Saved to Vault", { description: "Pinned as a strategic capture" });
                          } catch (e: any) {
                            toast.error("Failed to save", { description: e.message });
                          }
                        }}
                        className={`mt-1.5 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors tactile-press ${
                          savedIndices.has(i) ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-secondary/60"
                        }`}
                      >
                        {savedIndices.has(i) ? <Check className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
                        {savedIndices.has(i) ? "Saved to Vault" : "Save to Vault"}
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
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.mode}
                    onClick={() => handleQuickAction(action)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 text-[11px] font-medium text-primary/70 hover:text-primary transition-colors disabled:opacity-50 px-2.5 py-1.5 rounded-lg bg-secondary/40 border border-border/20 whitespace-nowrap shrink-0 tactile-press"
                  >
                    <action.icon className="w-3.5 h-3.5" />
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Strategic query…"
                  rows={1}
                  className="flex-1 bg-secondary border-border/30 resize-none text-sm min-h-[44px] max-h-[120px]"
                />
                <Button
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
