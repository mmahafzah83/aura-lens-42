import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Mic, Loader2, Save, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const VoiceEngineSection = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [writingSamples, setWritingSamples] = useState("");
  const [admiredPosts, setAdmiredPosts] = useState("");
  const [vocabNotes, setVocabNotes] = useState("");
  const [trained, setTrained] = useState(false);
  const [pulse, setPulse] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Detect existing trained state on mount
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) return;
      supabase
        .from("authority_voice_profiles")
        .select("example_posts, admired_posts, vocabulary_preferences, tone")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data) return;
          const ex = data.example_posts as any[];
          const ad = data.admired_posts as any[];
          const vocab = (data.vocabulary_preferences as any)?.notes || data.tone || "";
          const hasContent =
            (Array.isArray(ex) && ex.length > 0) ||
            (Array.isArray(ad) && ad.length > 0) ||
            (typeof vocab === "string" && vocab.trim().length > 0);
          if (hasContent) setTrained(true);
        });
    });
    return () => { cancelled = true; };
  }, []);

  // Respond to ?focus=voice — open, scroll, pulse
  useEffect(() => {
    if (searchParams.get("focus") !== "voice") return;
    setOpen(true);
    // Wait for paint, then scroll + pulse
    const id = window.setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPulse(true);
      window.setTimeout(() => setPulse(false), 2000);
      // Clean the param so refresh doesn't re-trigger
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      setSearchParams(next, { replace: true });
    }, 120);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) { setLoading(false); return; }
      supabase
        .from("authority_voice_profiles")
        .select("example_posts, admired_posts, vocabulary_preferences, tone")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const examples = data.example_posts as any[];
            const admired = data.admired_posts as any[];
            const vocab = data.vocabulary_preferences as any;
            setWritingSamples(
              Array.isArray(examples) ? examples.map((p: any) => p.content || p).join("\n\n---\n\n") : ""
            );
            setAdmiredPosts(
              Array.isArray(admired) ? admired.map((p: any) => p.content || p).join("\n\n---\n\n") : ""
            );
            setVocabNotes(
              typeof vocab === "object" && vocab?.notes ? vocab.notes : (data.tone || "")
            );
          }
          setLoading(false);
        });
    });
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");

      const examplePosts = writingSamples
        .split(/\n---\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(content => ({ content }));

      const admiredPostsArr = admiredPosts
        .split(/\n---\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(content => ({ content }));

      const toneValue = vocabNotes.slice(0, 200);

      const row = {
        user_id: session.user.id,
        example_posts: examplePosts,
        admired_posts: admiredPostsArr,
        vocabulary_preferences: { notes: vocabNotes },
        tone: toneValue,
        updated_at: new Date().toISOString(),
      };

      // Check if row exists
      const { data: existing } = await supabase
        .from("authority_voice_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("authority_voice_profiles")
          .update(row)
          .eq("user_id", session.user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("authority_voice_profiles")
          .insert(row);
        if (error) throw error;
      }

      toast.success("Voice profile saved! Your next generated post will match your style.");
      setTrained(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to save voice profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="voice-engine-section"
      ref={containerRef}
      className={`glass-card rounded-2xl border border-border/8 overflow-hidden ${pulse ? "voice-pulse" : ""}`}
      style={{ scrollMarginTop: 96 }}
    >
      <style>{`
        @keyframes voice-pulse-kf {
          0%, 100% { box-shadow: 0 0 0 0 rgba(197,165,90,0); border-color: rgba(197,165,90,0.15); }
          50%      { box-shadow: 0 0 0 6px rgba(197,165,90,0.18); border-color: rgba(197,165,90,0.85); }
        }
        .voice-pulse {
          animation: voice-pulse-kf 1s ease-in-out 2;
          border-color: var(--brand) !important;
        }
      `}</style>
      <p
        style={{
          fontSize: 13,
          fontStyle: "italic",
          color: "var(--ink-3)",
          padding: "14px 20px 0",
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        Teach Aura your voice. Paste examples of your best posts below — Aura will learn your tone, structure, and vocabulary.
      </p>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-secondary/10 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
          <Mic className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
            My writing voice
            {trained && (
              <span
                title="Voice profile saved"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--brand)",
                  background: "rgba(197,165,90,0.12)",
                  border: "1px solid rgba(197,165,90,0.3)",
                  borderRadius: 999,
                  padding: "2px 7px",
                }}
              >
                <Check className="w-2.5 h-2.5" /> Voice trained
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground/60">Teach Aura your voice so every post sounds like you — not like AI</p>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground/40" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/40" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-border/8 pt-5 animate-fade-in">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-primary/40" />
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Your writing samples
                </label>
                <p className="text-[10px] text-muted-foreground/50 mb-2">
                  Paste examples of your best posts or writing. Separate multiple samples with --- on a new line.
                </p>
                <Textarea
                  value={writingSamples}
                  onChange={(e) => setWritingSamples(e.target.value)}
                  placeholder="Paste your best LinkedIn posts, articles, or writing samples here..."
                  className="min-h-[120px] bg-secondary/30 border-border/20 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Admired posts
                </label>
                <p className="text-[10px] text-muted-foreground/50 mb-2">
                  Paste posts by others whose style you want to learn from. Separate with --- on a new line.
                </p>
                <Textarea
                  value={admiredPosts}
                  onChange={(e) => setAdmiredPosts(e.target.value)}
                  placeholder="Paste posts by thought leaders you admire..."
                  className="min-h-[120px] bg-secondary/30 border-border/20 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Vocabulary & tone notes
                </label>
                <p className="text-[10px] text-muted-foreground/50 mb-2">
                  Describe how you write — e.g. "direct, no jargon, short sentences, always end with a question"
                </p>
                <Textarea
                  value={vocabNotes}
                  onChange={(e) => setVocabNotes(e.target.value)}
                  placeholder="Direct, analytical, short paragraphs, avoid buzzwords..."
                  className="min-h-[80px] bg-secondary/30 border-border/20 text-sm"
                />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save voice profile
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceEngineSection;
