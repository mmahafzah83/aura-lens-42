import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Mic, Loader2, Save } from "lucide-react";
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

      toast.success("Voice profile saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save voice profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl border border-border/8 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-secondary/10 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
          <Mic className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">My writing voice</p>
          <p className="text-xs text-muted-foreground/60">Train Aura on your writing style so every post sounds like you — not like AI</p>
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
