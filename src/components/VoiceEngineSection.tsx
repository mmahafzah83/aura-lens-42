import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Mic, Loader2, Save, Check, Upload, Sparkles, Pencil, ArrowRight } from "lucide-react";
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
  // Entries with an explicit non-"manual" source tag (feedback, upload, etc.) —
  // preserved verbatim across saves; never shown in the textarea.
  const [preservedExamples, setPreservedExamples] = useState<any[]>([]);
  const [pulse, setPulse] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [distilling, setDistilling] = useState(false);
  const [distilledOnce, setDistilledOnce] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const teachFileRef = useRef<HTMLInputElement>(null);
  const [teachText, setTeachText] = useState("");
  const [teaching, setTeaching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Full profile row for the "Your voice signature" card.
  const [profile, setProfile] = useState<any>(null);
  const [editingTone, setEditingTone] = useState(false);
  const [toneDraft, setToneDraft] = useState("");
  const [savingTone, setSavingTone] = useState(false);

  // Toggle states for voice-signature card vocabulary lists
  const [showAllPhrases, setShowAllPhrases] = useState(false);
  const [showAllAvoid, setShowAllAvoid] = useState(false);

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

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data } = await supabase
        .from("authority_voice_profiles")
        .select("example_posts, admired_posts, vocabulary_preferences, tone, updated_at")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!data) return;
      setProfile(data);
      const examples = data.example_posts as any[];
      const admired = data.admired_posts as any[];
      const vocab = data.vocabulary_preferences as any;
      const exArr = Array.isArray(examples) ? examples : [];
      // Manual = explicit source:"manual" OR legacy entries (no source field, or string).
      const isManual = (p: any) => {
        if (typeof p === "string") return true;
        if (!p || typeof p !== "object") return false;
        return !("source" in p) || p.source === "manual" || p.source == null;
      };
      const manualEntries = exArr.filter(isManual);
      const tagged = exArr.filter((p) => !isManual(p));
      setPreservedExamples(tagged);
      setWritingSamples(
        manualEntries.map((p: any) => (typeof p === "string" ? p : p.content || "")).join("\n\n---\n\n")
      );
      setAdmiredPosts(
        Array.isArray(admired) ? admired.map((p: any) => p.content || p).join("\n\n---\n\n") : ""
      );
      setVocabNotes(
        typeof vocab === "object" && vocab?.notes ? vocab.notes : (data.tone || "")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadProfile();
  }, [open, loadProfile]);

  // Append an entry to example_posts with a given source tag (non-destructive).
  const appendTaggedExample = async (content: string, source: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) throw new Error("Not authenticated");
    const uid = session.user.id;
    const { data: existing } = await supabase
      .from("authority_voice_profiles")
      .select("id, example_posts")
      .eq("user_id", uid)
      .maybeSingle();
    const current = Array.isArray((existing as any)?.example_posts)
      ? ((existing as any).example_posts as any[])
      : [];
    const updated = [...current, { content: trimmed, source, added_at: new Date().toISOString() }];
    if (existing) {
      const { error } = await supabase
        .from("authority_voice_profiles")
        .update({ example_posts: updated, updated_at: new Date().toISOString() })
        .eq("user_id", uid);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("authority_voice_profiles")
        .insert({ user_id: uid, example_posts: updated, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      let text = "";
      if (file.name.endsWith(".txt") || file.type === "text/plain") {
        text = await file.text();
      } else if (file.name.endsWith(".pdf") || file.type === "application/pdf") {
        const arrayBuf = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        const readable = raw.match(/[\x20-\x7E\n\r]{20,}/g) || [];
        text = readable.join("\n").slice(0, 10000);
        if (!text.trim()) {
          text = `[PDF uploaded: ${file.name}]`;
          toast.info("PDF text extraction was limited. For best results, paste the text directly.");
        }
      } else {
        toast.error("Please upload a PDF or TXT file");
        return;
      }
      if (text.trim()) {
        await appendTaggedExample(text.slice(0, 10000), "upload");
        toast.success("Document added to your voice engine");
        await loadProfile();
      }
    } catch (err: any) {
      console.error("Voice upload error:", err);
      toast.error(err.message || "Couldn't process file");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDistill = async () => {
    setDistilling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("voice-distill", {
        body: { user_id: session.user.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Voice locked in. From now on, every post sounds like the best version of you.");
      setDistilledOnce(true);
      await loadProfile();
    } catch (err: any) {
      console.error("Voice distill error:", err);
      toast.error(err.message || "Couldn't distill voice");
    } finally {
      setDistilling(false);
    }
  };

  const parsePostsBlock = (text: string): string[] =>
    text
      .split(/\n---\n/)
      .map((s) => s.trim())
      .filter(Boolean);

  const teachFromPosts = async (postsArr: string[]) => {
    if (postsArr.length === 0) {
      toast.error("Add at least one post to teach Aura from.");
      return;
    }
    setTeaching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("voice-distill", {
        body: { posts: postsArr },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Learned from ${postsArr.length} ${postsArr.length === 1 ? "post" : "posts"} — your voice profile is updated.`);
      setTeachText("");
      setDistilledOnce(true);
      await loadProfile();
    } catch (err: any) {
      console.error("Voice teach error:", err);
      toast.error(err.message || "Couldn't learn from those posts");
    } finally {
      setTeaching(false);
    }
  };

  const handleTeachSubmit = () => {
    teachFromPosts(parsePostsBlock(teachText));
  };

  const handleSaveTone = async () => {
    const next = toneDraft.trim();
    setSavingTone(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const uid = session.user.id;
      const { data: existing } = await supabase
        .from("authority_voice_profiles")
        .select("id")
        .eq("user_id", uid)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("authority_voice_profiles")
          .update({ tone: next, updated_at: new Date().toISOString() })
          .eq("user_id", uid);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("authority_voice_profiles")
          .insert({ user_id: uid, tone: next, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
      setProfile((p: any) => ({ ...(p || {}), tone: next }));
      setEditingTone(false);
      toast.success("Voice identity updated");
    } catch (e: any) {
      toast.error(e.message || "Couldn't save tone");
    } finally {
      setSavingTone(false);
    }
  };

  const handleTeachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!(file.name.endsWith(".txt") || file.type === "text/plain")) {
        toast.error("Please upload a .txt file with posts separated by --- on a new line.");
        return;
      }
      const text = await file.text();
      await teachFromPosts(parsePostsBlock(text));
    } catch (err: any) {
      console.error("Voice teach file error:", err);
      toast.error(err.message || "Couldn't read that file");
    } finally {
      if (teachFileRef.current) teachFileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");

      const manualExamples = writingSamples
        .split(/\n---\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(content => ({ content, source: "manual" as const, updated_at: new Date().toISOString() }));

      // Re-read preserved tagged entries fresh to avoid stale state if feedback
      // landed between open and save.
      const { data: freshRow } = await supabase
        .from("authority_voice_profiles")
        .select("example_posts")
        .eq("user_id", session.user.id)
        .maybeSingle();
      const freshArr = Array.isArray((freshRow as any)?.example_posts)
        ? ((freshRow as any).example_posts as any[])
        : [];
      const freshTagged = freshArr.filter((p) => {
        if (typeof p === "string") return false;
        if (!p || typeof p !== "object") return false;
        return "source" in p && p.source && p.source !== "manual";
      });
      const examplePosts = [...freshTagged, ...manualExamples];

      const admiredPostsArr = admiredPosts
        .split(/\n---\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(content => ({ content }));

      // Check if row exists
      const { data: existing } = await supabase
        .from("authority_voice_profiles")
        .select("id, vocabulary_preferences, tone")
        .eq("user_id", session.user.id)
        .maybeSingle();

      const existingVocab = (existing as any)?.vocabulary_preferences || {};
      const existingTone = (existing as any)?.tone || "";

      const row = {
        user_id: session.user.id,
        example_posts: examplePosts,
        admired_posts: admiredPostsArr,
        vocabulary_preferences: { ...existingVocab, notes: vocabNotes },
        tone: existingTone.trim().length > 0 ? existingTone : vocabNotes.slice(0, 200),
        updated_at: new Date().toISOString(),
      };

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
      setPreservedExamples(freshTagged);
    } catch (e: any) {
      toast.error(e.message || "Couldn't save voice profile");
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
          fontSize: 14,
          fontStyle: "italic",
          color: "var(--ink-3)",
          padding: "14px 20px 0",
          margin: 0,
          lineHeight: 1.625,
        }}
      >
        Aura learns your voice from everything you give it — your posts, uploads, and your feedback — and keeps refining over time.
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
                  fontSize: 12,
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
              {(() => {
                const tone: string = typeof profile?.tone === "string" ? profile.tone : "";
                const vocab: any = (profile?.vocabulary_preferences && typeof profile.vocabulary_preferences === "object") ? profile.vocabulary_preferences : {};
                const useArr: string[] = Array.isArray(vocab.use) ? vocab.use.filter((s: any) => typeof s === "string" && s.trim()) : [];
                const avoidArrRaw: any[] = Array.isArray(vocab.avoid) ? vocab.avoid : [];
                const avoidArr: string[] = avoidArrRaw
                  .map((v) => {
                    if (typeof v === "string") return v;
                    if (v && typeof v === "object") return String(v.phrase ?? v.text ?? v.content ?? "");
                    return "";
                  })
                  .map((s) => s.trim())
                  .filter(Boolean);
                const examplesArr: any[] = Array.isArray(profile?.example_posts) ? profile.example_posts : [];
                const hasVoiceCard = !!tone.trim() || useArr.length > 0 || avoidArr.length > 0;

                const cardStyle: React.CSSProperties = {
                  background: "#F8F5F0",
                  border: "0.5px solid #E3D9C5",
                  borderRadius: 14,
                  padding: "22px 24px",
                  color: "#2A2418",
                };
                const eyebrowStyle: React.CSSProperties = {
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: 12,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#A98F4E",
                  fontWeight: 600,
                };

                if (!hasVoiceCard) {
                  return (
                    <div style={cardStyle}>
                      <div style={eyebrowStyle}>Your voice signature</div>
                      <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, marginTop: 10, marginBottom: 6, color: "#2A2418", lineHeight: 1.35 }}>
                        Your voice signature isn't formed yet.
                      </p>
                      <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: "#6E6555", margin: 0 }}>
                        Teach Aura a few of your posts below and watch it take shape.
                      </p>
                    </div>
                  );
                }

                const useCap = useArr.slice(0, 5);
                const useMore = Math.max(0, useArr.length - useCap.length);
                const avoidCap = avoidArr.slice(0, 5);
                const avoidMore = Math.max(0, avoidArr.length - avoidCap.length);

                return (
                  <div style={cardStyle}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={eyebrowStyle}>Your voice signature</div>
                    </div>

                    {/* Identity / tone line */}
                    <div
                      style={{
                        border: "0.5px solid #E3D9C5",
                        borderRadius: 10,
                        padding: "14px 16px",
                        background: "rgba(255,255,255,0.4)",
                        position: "relative",
                      }}
                    >
                      {editingTone ? (
                        <div>
                          <Textarea
                            value={toneDraft}
                            onChange={(e) => setToneDraft(e.target.value)}
                            className="min-h-[88px] text-sm"
                            style={{ background: "#fff", color: "#2A2418", border: "0.5px solid #E3D9C5" }}
                          />
                          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setEditingTone(false); setToneDraft(tone); }}
                              disabled={savingTone}
                              style={{ color: "#6E6555" }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveTone}
                              disabled={savingTone}
                              style={{ background: "#B08D3A", color: "#fff" }}
                            >
                              {savingTone ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <p
                            style={{
                              fontFamily: "'Cormorant Garamond', Georgia, serif",
                              fontSize: 24,
                              lineHeight: 1.35,
                              color: "#2A2418",
                              margin: 0,
                              flex: 1,
                            }}
                          >
                            {tone || <span style={{ color: "#8A8170", fontStyle: "italic" }}>No tone captured yet.</span>}
                          </p>
                          <button
                            type="button"
                            aria-label="Edit voice identity"
                            onClick={() => { setToneDraft(tone); setEditingTone(true); }}
                            style={{
                              border: "0.5px solid #E3D9C5",
                              background: "transparent",
                              borderRadius: 8,
                              padding: 6,
                              cursor: "pointer",
                              color: "#A98F4E",
                              flexShrink: 0,
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12.5, color: "#6E6555", marginTop: 8, marginBottom: 0 }}>
                      Aura's first take — edit it to make it yours.
                    </p>

                    {/* Phrases that are yours */}
                    {useCap.length > 0 && (
                      <div style={{ marginTop: 18 }}>
                        <div style={eyebrowStyle}>Phrases that are yours</div>
                        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                          {useCap.map((phrase, i) => (
                            <li
                              key={i}
                              style={{
                                fontFamily: "'Cormorant Garamond', Georgia, serif",
                                fontStyle: "italic",
                                fontSize: 18,
                                lineHeight: 1.5,
                                color: "#2A2418",
                              }}
                            >
                              &ldquo;{phrase}&rdquo;
                            </li>
                          ))}
                        </ul>
                        {useMore > 0 && (
                          <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12, color: "#8A8170", marginTop: 6, marginBottom: 0 }}>
                            +{useMore} more
                          </p>
                        )}
                      </div>
                    )}

                    {/* Words you keep out */}
                    {avoidCap.length > 0 && (
                      <div style={{ marginTop: 18 }}>
                        <div style={eyebrowStyle}>Words you keep out</div>
                        <ul style={{ listStyle: "disc", paddingInlineStart: 18, margin: "8px 0 0" }}>
                          {avoidCap.map((w, i) => (
                            <li
                              key={i}
                              style={{
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                                fontSize: 14,
                                color: "#6E6555",
                                lineHeight: 1.6,
                              }}
                            >
                              {w}
                            </li>
                          ))}
                        </ul>
                        {avoidMore > 0 && (
                          <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12, color: "#8A8170", marginTop: 6, marginBottom: 0 }}>
                            +{avoidMore} more
                          </p>
                        )}
                      </div>
                    )}

                    {/* See a post in this voice */}
                    <button
                      type="button"
                      onClick={() => navigate("/dashboard?tab=authority")}
                      style={{
                        marginTop: 18,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        border: "0.5px solid #B08D3A",
                        borderRadius: 999,
                        padding: "8px 14px",
                        background: "transparent",
                        color: "#B08D3A",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      See a post written in this voice <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    {/* Footer */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: "0.5px solid #E3D9C5" }}>
                      <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12.5, color: "#8A8170" }}>
                        Shaped from {examplesArr.length} of your posts.
                      </span>
                      <button
                        type="button"
                        onClick={handleDistill}
                        disabled={distilling}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "transparent",
                          border: "none",
                          color: "#B08D3A",
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: distilling ? "default" : "pointer",
                          opacity: distilling ? 0.6 : 1,
                        }}
                      >
                        {distilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {distilling ? "Sharpening…" : "Sharpen now"}
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Your writing samples
                </label>
                <p className="text-xs text-muted-foreground/50 mb-2">
                  Paste examples of your best posts or writing. Separate multiple samples with --- on a new line.
                </p>
                <Textarea
                  value={writingSamples}
                  onChange={(e) => setWritingSamples(e.target.value)}
                  placeholder="Paste your best LinkedIn posts, articles, or writing samples here..."
                  className="min-h-[120px] bg-secondary/30 border-border/20 text-sm"
                />
                {preservedExamples.length > 0 && (
                  <p className="text-[11px] text-muted-foreground/60 mt-2 italic">
                    + {preservedExamples.length} {preservedExamples.length === 1 ? "post" : "posts"} learned from your uploads and feedback (kept automatically)
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Admired posts
                </label>
                <p className="text-xs text-muted-foreground/50 mb-2">
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
                <p className="text-xs text-muted-foreground/50 mb-2">
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

              <div className="pt-4 border-t border-border/8 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Add more, learn faster
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.txt,application/pdf,text/plain"
                      onChange={handleFile}
                      className="hidden"
                      id="voice-engine-file"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                      className="w-full gap-2"
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Upload PDF or TXT
                    </Button>
                    <p className="text-[11px] text-muted-foreground/60 mt-1.5">
                      Adds to your samples — your typed text is never overwritten.
                    </p>
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={distilling}
                      onClick={handleDistill}
                      className="w-full gap-2"
                    >
                      {distilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {distilledOnce ? "Re-distill voice from my posts" : "Distill voice from my posts"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground/60 mt-1.5">
                      Refines tone and patterns from your LinkedIn posts. Your feedback and notes are preserved.
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/8">
                  <p className="text-xs font-semibold text-foreground mb-2">
                    Teach Aura from your posts
                  </p>
                  <p className="text-xs text-muted-foreground/60 mb-2">
                    Paste several of your posts (separate with --- on a new line) or upload a .txt file. These are distilled into your voice profile and are not stored as samples.
                  </p>
                  <Textarea
                    value={teachText}
                    onChange={(e) => setTeachText(e.target.value)}
                    placeholder={"Post 1...\n---\nPost 2...\n---\nPost 3..."}
                    className="min-h-[120px] bg-secondary/30 border-border/20 text-sm"
                    disabled={teaching}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <Button
                      type="button"
                      onClick={handleTeachSubmit}
                      disabled={teaching || teachText.trim().length === 0}
                      className="w-full gap-2"
                    >
                      {teaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Teach Aura from these posts
                    </Button>
                    <div>
                      <input
                        ref={teachFileRef}
                        type="file"
                        accept=".txt,text/plain"
                        onChange={handleTeachFile}
                        className="hidden"
                        id="voice-teach-file"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={teaching}
                        onClick={() => teachFileRef.current?.click()}
                        className="w-full gap-2"
                      >
                        {teaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Upload .txt of posts
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceEngineSection;
