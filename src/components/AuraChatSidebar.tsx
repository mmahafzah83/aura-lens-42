import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, Presentation, Zap, Trash2, Briefcase, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-aura`;

interface AuraChatSidebarProps {
  open: boolean;
  onClose: () => void;
  initialMessage?: string;
}

const AuraChatSidebar = ({ open, onClose, initialMessage }: AuraChatSidebarProps) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    if (open && initialMessage && messages.length === 0) {
      send(initialMessage);
    }
  }, [open, initialMessage]);

  const streamChat = async (allMessages: Msg[], mode?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Not authenticated. Please sign in again.");
    }

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
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
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
  };

  const send = async (text: string, mode?: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      await streamChat(newMessages, mode);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${e.message || "Something went wrong."}` },
      ]);
    }
    setIsLoading(false);
  };

  const handleDraftDeck = () => {
    if (input.trim()) {
      send(`Draft a presentation on: ${input.trim()}`, "draft-deck");
    } else {
      send("Draft a presentation based on my most recent and most impactful captures. Create a strategic deck outline.", "draft-deck");
    }
  };

  const handleMeetingPrep = () => {
    const topic = input.trim();
    if (topic) {
      send(`Prepare a 1-page bilingual meeting prep memo for a VP meeting on: ${topic}`, "meeting-prep");
    } else {
      send("Prepare a 1-page bilingual meeting prep memo for a VP meeting based on my most recent and strategic captures.", "meeting-prep");
    }
  };

  const handleSynthesize = () => {
    const topic = input.trim();
    if (topic) {
      send(`Synthesize a pursuit for: ${topic}. Find the strategic intersection between my documents, captures, and leadership insights.`, "synthesize-pursuit");
    } else {
      send("Synthesize a pursuit based on my most recent captures and uploaded documents. Find the strategic intersection between my saved frameworks and leadership thoughts.", "synthesize-pursuit");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] z-50 flex flex-col bg-background border-l border-border/30 shadow-2xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Ask Aura</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">RAG-Powered Intelligence Vault</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Zap className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">Your Vault, Unlocked</h3>
            <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
              Ask across your captures, uploaded PDFs, voice notes, and screenshots. Aura uses RAG to find the most relevant intelligence.
            </p>
            <div className="mt-6 space-y-2 w-full max-w-[280px]">
              {[
                "What are my recurring themes this month?",
                "Find insights from my uploaded SWA PDFs",
                "What frameworks have I captured?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="w-full text-left text-xs px-3 py-2.5 rounded-lg bg-secondary/60 border border-border/20 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-secondary/60 border border-border/20 text-foreground rounded-bl-md"
              }`}
              dir="auto"
              style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:text-primary [&_code]:text-xs [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-secondary/60 border border-border/20 rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border/30 px-4 py-3 space-y-2" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your captures & documents…"
            rows={1}
            className="flex-1 bg-secondary border-border/30 resize-none text-sm min-h-[40px] max-h-[120px]"
            dir="auto"
          />
          <Button
            onClick={() => send(input)}
            disabled={isLoading || !input.trim()}
            size="icon"
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10 flex-shrink-0"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleMeetingPrep}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-[11px] font-medium text-primary/70 hover:text-primary transition-colors disabled:opacity-50 px-1"
          >
            <Briefcase className="w-3.5 h-3.5" />
            Meeting Prep
          </button>
          <button
            onClick={handleDraftDeck}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-[11px] font-medium text-primary/70 hover:text-primary transition-colors disabled:opacity-50 px-1"
          >
            <Presentation className="w-3.5 h-3.5" />
            Draft Deck
          </button>
          <button
            onClick={handleSynthesize}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-[11px] font-medium text-primary/70 hover:text-primary transition-colors disabled:opacity-50 px-1"
          >
            <Rocket className="w-3.5 h-3.5" />
            Synthesize Pursuit
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuraChatSidebar;
