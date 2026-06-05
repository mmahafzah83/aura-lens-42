import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Mic, Loader2, Save, Check, Upload, Sparkles, Pencil, ArrowRight } from "lucide-react";
import InfoTooltip from "@/components/ui/InfoTooltip";
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
  const [trained, setTrained] = useState(false);
  // Entries with an explicit non-"manual" source tag (feedback, upload, etc.) —
  // preserved verbatim across saves; never shown in the textarea.
  const [preservedExamples, setPreservedExamples] = useState<any[]>([]);
  const [pulse, setPulse] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [distilling, setDistilling] = useState(false);
  const [distilledOnce, setDistilledOnce] = useState(false);
  
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

  // All voice rows for language-aware signature card.
  // NOTE: the legacy single-row `profile` state above is intentionally kept —
  // other sections of this file still consume it.
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeLang, setActiveLang] = useState<"en" | "ar">("en");
  const [activeLangInitialized, setActiveLangInitialized] = useState(false);

  const rowHasContent = (r: any): boolean => {
    if (!r) return false;
    const ex = r.example_posts;
    const ad = r.admired_posts;
    const vocab = (r.vocabulary_preferences && typeof r.vocabulary_preferences === "object") ? r.vocabulary_preferences : {};
    const tone = typeof r.tone === "string" ? r.tone : "";
    return (
      (Array.isArray(ex) && ex.length > 0) ||
      (Array.isArray(ad) && ad.length > 0) ||
      (typeof vocab?.notes === "string" && vocab.notes.trim().length > 0) ||
      (Array.isArray(vocab?.use) && vocab.use.length > 0) ||
      (Array.isArray(vocab?.avoid) && vocab.avoid.length > 0) ||
      tone.trim().length > 0
    );
  };

  // Detect existing trained state on mount
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) return;
      supabase
        .from("authority_voice_profiles")
        .select("language, is_primary, example_posts, admired_posts, vocabulary_preferences, tone, updated_at")
        .eq("user_id", session.user.id)
        .then(({ data }) => {
          if (cancelled) return;
          const rows = Array.isArray(data) ? data : [];
          setProfiles(rows);
          if (rows.some(rowHasContent)) setTrained(true);
          if (!activeLangInitialized) {
            const primary = rows.find((r: any) => r.is_primary);
            const lang = (primary?.language === "ar" ? "ar" : primary?.language === "en" ? "en" : "en") as "en" | "ar";
            setActiveLang(lang);
            setActiveLangInitialized(true);
          }
        });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        .eq("is_primary", true)
        .maybeSingle();
      // Refresh all rows for the language-aware signature card (does not
      // touch the legacy single-row `profile` state below).
      const { data: allRows } = await supabase
        .from("authority_voice_profiles")
        .select("language, is_primary, example_posts, admired_posts, vocabulary_preferences, tone, updated_at")
        .eq("user_id", session.user.id);
      setProfiles(Array.isArray(allRows) ? allRows : []);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadProfile();
  }, [open, loadProfile]);

  const handleDistill = async () => {
    setDistilling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("voice-distill", {
        body: { user_id: session.user.id, language: activeLang },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.skipped) {
        toast(
          activeLang === "ar"
            ? "علّم Aura المزيد من منشوراتك بهذه اللغة أولاً"
            : "Teach Aura a few more posts in this language first."
        );
        await loadProfile();
        return;
      }
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

  const parsePostsBlock = (text: string): string[] => {
    const posts: string[] = [];
    let cur: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*-{3,}\s*$/.test(line)) { posts.push(cur.join("\n")); cur = []; }
      else cur.push(line);
    }
    posts.push(cur.join("\n"));
    return posts.map((s) => s.trim()).filter(Boolean);
  };

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
        body: { posts: postsArr, store_samples: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Voice sharpened from ${postsArr.length} ${postsArr.length === 1 ? "post" : "posts"}.`);
      setTeachText("");
      setDistilledOnce(true);
      await loadProfile();
    } catch (err: any) {
      console.error("Voice teach error:", err);
      toast.error(err.message || "Couldn't teach Aura from those posts");
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
        .eq("language", activeLang)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("authority_voice_profiles")
          .update({ tone: next, updated_at: new Date().toISOString() })
          .eq("user_id", uid)
          .eq("language", activeLang);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("authority_voice_profiles")
          .insert({
            user_id: uid,
            tone: next,
            updated_at: new Date().toISOString(),
            language: activeLang,
            is_primary: profiles.length === 0,
          });
        if (error) throw error;
      }
      setProfile((p: any) => ({ ...(p || {}), tone: next }));
      // Reflect the change locally in the per-language rows so the active tab
      // updates immediately without a full reload.
      setProfiles((rows) => {
        const idx = rows.findIndex((r) => r.language === activeLang);
        if (idx >= 0) {
          const copy = rows.slice();
          copy[idx] = { ...copy[idx], tone: next };
          return copy;
        }
        return [...rows, { language: activeLang, is_primary: rows.length === 0, tone: next, example_posts: [], admired_posts: [], vocabulary_preferences: {} }];
      });
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
    setUploading(true);
    try {
      if (!file.name.endsWith(".txt") && file.type !== "text/plain") {
        toast.error("Text files only for now — or paste your posts directly.");
        return;
      }
      const text = await file.text();
      const truncated = text.slice(0, 10000);
      await teachFromPosts(parsePostsBlock(truncated));
    } catch (err: any) {
      console.error("Voice teach file error:", err);
      toast.error(err.message || "Couldn't read that file");
    } finally {
      setUploading(false);
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
        .eq("is_primary", true)
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
        .select("id")
        .eq("user_id", session.user.id)
        .eq("is_primary", true)
        .maybeSingle();

      const row: any = {
        user_id: session.user.id,
        example_posts: examplePosts,
        admired_posts: admiredPostsArr,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from("authority_voice_profiles")
          .update(row)
          .eq("user_id", session.user.id)
          .eq("is_primary", true);
        if (error) throw error;
      } else {
        const primaryLang = (profiles.find((r: any) => r.is_primary)?.language === "ar" ? "ar" : "en");
        const { error } = await supabase
          .from("authority_voice_profiles")
          .insert({
            ...row,
            language: primaryLang,
            is_primary: profiles.length === 0,
          });
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
                // Resolve the active row from `profiles` based on activeLang.
                const activeRow: any =
                  profiles.find((r) => r?.language === activeLang) ||
                  null;
                const primaryLang: "en" | "ar" =
                  (profiles.find((r) => r?.is_primary)?.language === "ar" ? "ar" : "en");
                const tone: string = typeof activeRow?.tone === "string" ? activeRow.tone : "";
                const vocab: any = (activeRow?.vocabulary_preferences && typeof activeRow.vocabulary_preferences === "object") ? activeRow.vocabulary_preferences : {};
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
                const examplesArr: any[] = Array.isArray(activeRow?.example_posts) ? activeRow.example_posts : [];
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

                const useCap = useArr.slice(0, 5);
                const useMore = Math.max(0, useArr.length - useCap.length);
                const avoidCap = avoidArr.slice(0, 5);
                const avoidMore = Math.max(0, avoidArr.length - avoidCap.length);

                // ---------- Tabs strip (always above card) ----------
                const tabs: Array<{ lang: "en" | "ar"; label: string; font: string }> = [
                  { lang: "ar", label: "العربية", font: "'Cairo', 'DM Sans', sans-serif" },
                  { lang: "en", label: "English", font: "'DM Sans', system-ui, sans-serif" },
                ];
                const tabsStrip = (
                  <div
                    role="tablist"
                    aria-label="Voice signature language"
                    style={{
                      display: "flex",
                      gap: 6,
                      marginBottom: 10,
                      borderBottom: "0.5px solid #E3D9C5",
                    }}
                  >
                    {tabs.map((t) => {
                      const isActive = activeLang === t.lang;
                      const isPrimary = primaryLang === t.lang;
                      return (
                        <button
                          key={t.lang}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setActiveLang(t.lang)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "8px 12px",
                            cursor: "pointer",
                            fontFamily: t.font,
                            fontSize: 13,
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? "#B08D3A" : "#8A8170",
                            borderBottom: isActive ? "2px solid #B08D3A" : "2px solid transparent",
                            marginBottom: -1,
                            direction: t.lang === "ar" ? "rtl" : "ltr",
                          }}
                          dir={t.lang === "ar" ? "rtl" : "ltr"}
                          lang={t.lang}
                        >
                          {t.label}
                          {isPrimary && (
                            <span style={{ marginInlineStart: 6, color: "#B08D3A" }}>✦</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );

                // ---------- Primary-voice subtitle (under tabs) ----------
                const primarySubtitle = (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: -2,
                      marginBottom: 12,
                    }}
                    dir={activeLang === "ar" ? "rtl" : "ltr"}
                    lang={activeLang}
                  >
                    <span
                      style={{
                        fontFamily: activeLang === "ar" ? "'Cairo', 'DM Sans', sans-serif" : "'DM Sans', system-ui, sans-serif",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#8A8170",
                        letterSpacing: activeLang === "ar" ? "normal" : "0.01em",
                        lineHeight: 1.6,
                      }}
                    >
                      {activeLang === "ar"
                        ? "الصوت الأساسي — مُحدد من منشوراتك الأخيرة"
                        : "Primary voice — set by your recent posts"}
                    </span>
                    <InfoTooltip
                      triggerSize={13}
                      side="bottom"
                      label="voice-primary"
                    >
                      {activeLang === "ar" ? (
                        <span dir="rtl" lang="ar" style={{ fontFamily: "'Cairo', 'DM Sans', sans-serif" }}>
                          مكتبتك تحدد الصوت الأساسي. التعليم يصقله. المنشورات المُعجَب بها تشكّل الأسلوب فقط. ملاحظاتك تضبطه.
                        </span>
                      ) : (
                        <span>
                          Your library decides the primary voice. Teaching refines it. Admired posts shape style only. Your feedback tunes it.
                        </span>
                      )}
                    </InfoTooltip>
                  </div>
                );

                // ---------- ARABIC BRANCH ----------
                if (activeLang === "ar") {
                  const arEmpty = (
                    <div style={cardStyle} dir="rtl" lang="ar">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <div style={{ ...eyebrowStyle, letterSpacing: "normal" }}>بصمة صوتك</div>
                        <InfoTooltip slug="voice-signature" triggerSize={13} side="top" />
                      </span>
                      <p style={{ fontSize: 22, fontWeight: 600, marginTop: 10, marginBottom: 6, color: "#2A2418", lineHeight: 1.5 }}>
                        بصمة صوتك لم تتشكل بعد.
                      </p>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "#6E6555", margin: 0, lineHeight: 1.7 }}>
                        علّم Aura بعضاً من منشوراتك وشاهد بصمتك تتشكل.
                      </p>
                    </div>
                  );

                  return (
                    <div>
                      {tabsStrip}
                      {primarySubtitle}
                      {!hasVoiceCard ? arEmpty : (
                      <div style={cardStyle} dir="rtl" lang="ar">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <div style={{ ...eyebrowStyle, letterSpacing: "normal" }}>بصمة صوتك</div>
                            <InfoTooltip slug="voice-signature" triggerSize={13} side="top" />
                          </span>
                        </div>

                        {/* Tone line */}
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
                                dir="rtl"
                                lang="ar"
                                style={{ background: "#fff", color: "#2A2418", border: "0.5px solid #E3D9C5", fontWeight: 500 }}
                              />
                              <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-start" }}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setEditingTone(false); setToneDraft(tone); }}
                                  disabled={savingTone}
                                  style={{ color: "#6E6555" }}
                                >
                                  إلغاء
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={handleSaveTone}
                                  disabled={savingTone}
                                  style={{ background: "#B08D3A", color: "#fff" }}
                                >
                                  {savingTone ? <Loader2 className="w-3 h-3 animate-spin" /> : "حفظ"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                              <p
                                style={{
                                  fontSize: 24,
                                  fontWeight: 600,
                                  lineHeight: 1.6,
                                  color: "#2A2418",
                                  margin: 0,
                                  flex: 1,
                                }}
                              >
                                {tone || <span style={{ color: "#8A8170", fontWeight: 500 }}>لم تُلتقط النبرة بعد.</span>}
                              </p>
                              <button
                                type="button"
                                aria-label="تعديل بصمة الصوت"
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
                        <p style={{ fontSize: 12.5, fontWeight: 500, color: "#6E6555", marginTop: 8, marginBottom: 0, lineHeight: 1.7 }}>
                          أول قراءة من Aura — عدّلها لتشبهك.
                        </p>

                        {/* Phrases — inline flowing with guillemets and interpuncts */}
                        {useArr.length > 0 && (
                          <div style={{ marginTop: 18 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <div style={{ ...eyebrowStyle, letterSpacing: "normal" }}>عبارات هي أنت</div>
                              <InfoTooltip slug="voice-phrases" triggerSize={13} side="top" />
                            </span>
                            <p
                              style={{
                                fontSize: 18,
                                fontWeight: 500,
                                lineHeight: 2,
                                color: "#2A2418",
                                margin: "8px 0 0",
                              }}
                            >
                              {(showAllPhrases ? useArr : useCap).map((phrase, i, arr) => (
                                <span key={i}>
                                  <span>«{phrase}»</span>
                                  {i < arr.length - 1 && (
                                    <span style={{ color: "#A98F4E", margin: "0 8px" }}>·</span>
                                  )}
                                </span>
                              ))}
                            </p>
                            {useMore > 0 && (
                              <button
                                type="button"
                                onClick={() => setShowAllPhrases((s) => !s)}
                                style={{
                                  fontSize: 12,
                                  fontWeight: 500,
                                  color: "#8A8170",
                                  marginTop: 6,
                                  marginBottom: 0,
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                  textUnderlineOffset: 2,
                                }}
                              >
                                {showAllPhrases ? "عرض أقل" : `+${useMore} أخرى`}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Keep-out words — ◆ prefixed list, RTL */}
                        {avoidArr.length > 0 && (
                          <div style={{ marginTop: 18 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <div style={{ ...eyebrowStyle, letterSpacing: "normal" }}>كلمات تُبقيها خارجاً</div>
                              <InfoTooltip slug="voice-avoid" triggerSize={13} side="top" />
                            </span>
                            <ul style={{ listStyle: "none", paddingInlineStart: 0, margin: "8px 0 0" }}>
                              {(showAllAvoid ? avoidArr : avoidCap).map((w, i) => (
                                <li
                                  key={i}
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 500,
                                    color: "#6E6555",
                                    lineHeight: 1.9,
                                    paddingInlineStart: 4,
                                  }}
                                >
                                  <span style={{ color: "#A98F4E", marginInlineEnd: 8 }}>◆</span>
                                  {w}
                                </li>
                              ))}
                            </ul>
                            {avoidMore > 0 && (
                              <button
                                type="button"
                                onClick={() => setShowAllAvoid((s) => !s)}
                                style={{
                                  fontSize: 12,
                                  fontWeight: 500,
                                  color: "#8A8170",
                                  marginTop: 6,
                                  marginBottom: 0,
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                  textUnderlineOffset: 2,
                                }}
                              >
                                {showAllAvoid ? "عرض أقل" : `+${avoidMore} أخرى`}
                              </button>
                            )}
                          </div>
                        )}

                        {/* CTA pill */}
                        <button
                          type="button"
                          onClick={() => window.dispatchEvent(new CustomEvent("aura:switch-tab", { detail: { tab: "authority" } }))}
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
                            fontFamily: "'Cairo', 'DM Sans', sans-serif",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <ArrowRight className="w-3.5 h-3.5" style={{ transform: "scaleX(-1)" }} />
                          اقرأ منشوراً مكتوباً بهذا الصوت
                        </button>

                        {/* Footer */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: "0.5px solid #E3D9C5" }}>
                          <span style={{ fontSize: 12.5, fontWeight: 500, color: "#8A8170" }}>
                            صيغت من {examplesArr.length} من منشوراتك
                          </span>
                          <InfoTooltip slug="voice-sharpen" triggerSize={13} side="top" />
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
                              fontFamily: "'Cairo', 'DM Sans', sans-serif",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: distilling ? "default" : "pointer",
                              opacity: distilling ? 0.6 : 1,
                            }}
                          >
                            {distilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            {distilling ? "جارٍ الشحذ…" : "اشحذها الآن"}
                          </button>
                        </div>
                      </div>
                      )}
                    </div>
                  );
                }

                // ---------- ENGLISH BRANCH (pixel-untouched) ----------
                if (!hasVoiceCard) {
                  return (
                    <div>
                      {tabsStrip}
                      <div style={cardStyle}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><div style={eyebrowStyle}>Your voice signature</div><InfoTooltip slug="voice-signature" triggerSize={13} side="top" /></span>
                        <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, marginTop: 10, marginBottom: 6, color: "#2A2418", lineHeight: 1.35 }}>
                          Your voice signature isn't formed yet.
                        </p>
                        <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: "#6E6555", margin: 0 }}>
                          Teach Aura a few of your posts below and watch it take shape.
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div>
                  {tabsStrip}
                  <div style={cardStyle}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><div style={eyebrowStyle}>Your voice signature</div><InfoTooltip slug="voice-signature" triggerSize={13} side="top" /></span>
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
                    {useArr.length > 0 && (
                      <div style={{ marginTop: 18 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><div style={eyebrowStyle}>Phrases that are yours</div><InfoTooltip slug="voice-phrases" triggerSize={13} side="top" /></span>
                        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                          {(showAllPhrases ? useArr : useCap).map((phrase, i) => (
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
                          <button
                            type="button"
                            onClick={() => setShowAllPhrases((s) => !s)}
                            style={{
                              fontFamily: "'DM Sans', system-ui, sans-serif",
                              fontSize: 12,
                              color: "#8A8170",
                              marginTop: 6,
                              marginBottom: 0,
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              textDecoration: "underline",
                              textUnderlineOffset: 2,
                            }}
                          >
                            {showAllPhrases ? "Show less" : `+${useMore} more`}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Words you keep out */}
                    {avoidArr.length > 0 && (
                      <div style={{ marginTop: 18 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><div style={eyebrowStyle}>Words you keep out</div><InfoTooltip slug="voice-avoid" triggerSize={13} side="top" /></span>
                        <ul style={{ listStyle: "disc", paddingInlineStart: 18, margin: "8px 0 0" }}>
                          {(showAllAvoid ? avoidArr : avoidCap).map((w, i) => (
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
                          <button
                            type="button"
                            onClick={() => setShowAllAvoid((s) => !s)}
                            style={{
                              fontFamily: "'DM Sans', system-ui, sans-serif",
                              fontSize: 12,
                              color: "#8A8170",
                              marginTop: 6,
                              marginBottom: 0,
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              textDecoration: "underline",
                              textUnderlineOffset: 2,
                            }}
                          >
                            {showAllAvoid ? "Show less" : `+${avoidMore} more`}
                          </button>
                        )}
                      </div>
                    )}

                    {/* See a post in this voice */}
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent("aura:switch-tab", { detail: { tab: "authority" } }))}
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
                      <InfoTooltip slug="voice-sharpen" triggerSize={13} side="top" />
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
                  </div>
                );
              })()}

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
                <Button onClick={handleSave} disabled={saving} className="w-full gap-2 mt-3">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save admired posts
                </Button>
              </div>

              <div className="pt-4 border-t border-border/8">
                <p className="text-xs font-semibold text-foreground mb-2">
                  Teach Aura your writing
                </p>
                  <p className="text-xs text-muted-foreground/60 mb-2">
                    Paste a few of your posts (separate with ---) or upload a .txt file — Aura detects the language and refines your voice automatically.
                  </p>
                  <Textarea
                    value={teachText}
                    onChange={(e) => setTeachText(e.target.value)}
                    placeholder={"Post 1...\n---\nPost 2...\n---\nPost 3..."}
                    className="min-h-[120px] bg-secondary/30 border-border/20 text-sm"
                    disabled={teaching}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div>
                      <input
                        ref={teachFileRef}
                        type="file"
                        accept=".txt"
                        onChange={handleTeachFile}
                        className="hidden"
                        id="voice-teach-file"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={teaching || uploading}
                        onClick={() => teachFileRef.current?.click()}
                        className="w-full gap-2"
                      >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Upload .txt of posts
                      </Button>
                    </div>
                    <Button
                      type="button"
                      onClick={handleTeachSubmit}
                      disabled={teaching || uploading || teachText.trim().length === 0}
                      className="w-full gap-2"
                    >
                      {teaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Teach Aura
                    </Button>
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
