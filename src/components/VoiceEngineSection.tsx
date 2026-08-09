import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Mic, Loader2, Save, Check, Upload, Sparkles, Pencil, ArrowRight, X } from "lucide-react";
import InfoTooltip from "@/components/ui/InfoTooltip";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// A console section: an accordion whose summary carries the current value.
// Module-level so typing inside a section never remounts it.
function ConsoleSection({
  id, label, value, explainer, isAr, children, cardStyleB, labelStyle, explainerStyle, bodyLine,
}: {
  id: string; label: string; value: string; explainer?: string; isAr: boolean; children: React.ReactNode;
  cardStyleB: React.CSSProperties; labelStyle: React.CSSProperties; explainerStyle: React.CSSProperties; bodyLine: number;
}) {
  const dp = isAr ? ({ dir: "rtl" as const, lang: "ar" }) : ({ dir: "ltr" as const, lang: "en" });
  return (
    <details id={`voice-sec-${id}`} className="voice-sec" style={{ ...cardStyleB, marginBlockStart: 10, padding: 0 }}>
      <summary
        {...dp}
        style={{
          listStyle: "none", cursor: "pointer", padding: 16, display: "flex", gap: 12,
          alignItems: "baseline", justifyContent: "space-between",
        }}
      >
        <span style={labelStyle}>{label}</span>
        <span style={{ flex: 1, textAlign: isAr ? "left" : "right", fontSize: 12.5, color: "#1B2733", lineHeight: bodyLine }}>
          {value || <span style={{ color: "#8FA1AD" }}>{isAr ? "غير محدد" : "Not set"}</span>}
        </span>
      </summary>
      <div style={{ padding: "0 16px 16px" }}>
        {explainer ? <p style={explainerStyle} {...dp}>{explainer}</p> : null}
        {children}
      </div>
    </details>
  );
}

const VoiceEngineSection = ({ onWrite }: { onWrite?: () => void } = {}) => {
  const [open, setOpen] = useState(true);
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
  const [admiredOpen, setAdmiredOpen] = useState(false);
  const [savingAdmired, setSavingAdmired] = useState(false);
  // Local drafts so sliders stay smooth; committed on release.
  const [lenDraft, setLenDraft] = useState<number | null>(null);
  const [mixDraft, setMixDraft] = useState<Record<string, number> | null>(null);
  const [bannedDraft, setBannedDraft] = useState("");
  const [endingNote, setEndingNote] = useState(false);
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

  // Primary-voice-change notification (from voice-distill EF).
  const [primaryChangeNotice, setPrimaryChangeNotice] = useState<
    { ids: string[]; from: "en" | "ar"; to: "en" | "ar" } | null
  >(null);

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
        .select("language, is_primary, example_posts, admired_posts, vocabulary_preferences, preferred_structures, storytelling_patterns, tone, allowed_endings, updated_at")
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

  // Load unacknowledged primary-voice-change milestones.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data } = await supabase
        .from("user_milestones")
        .select("id, context, earned_at")
        .eq("user_id", session.user.id)
        .eq("milestone_id", "voice_primary_changed")
        .eq("acknowledged", false)
        .order("earned_at", { ascending: false });
      if (cancelled) return;
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) { setPrimaryChangeNotice(null); return; }
      const latest = rows[0];
      const ctx: any = latest.context || {};
      const from = ctx.from === "ar" ? "ar" : ctx.from === "en" ? "en" : null;
      const to = ctx.to === "ar" ? "ar" : ctx.to === "en" ? "en" : null;
      if (!from || !to) return;
      setPrimaryChangeNotice({ ids: rows.map((r: any) => r.id), from, to });
    };
    load();
    return () => { cancelled = true; };
  }, [profiles]);

  const dismissPrimaryChangeNotice = async () => {
    const notice = primaryChangeNotice;
    if (!notice) return;
    setPrimaryChangeNotice(null);
    try {
      await supabase
        .from("user_milestones")
        .update({ acknowledged: true })
        .in("id", notice.ids);
    } catch (e) {
      console.warn("Couldn't acknowledge primary-change notice", e);
    }
  };

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
        .select("example_posts, admired_posts, vocabulary_preferences, preferred_structures, storytelling_patterns, tone, allowed_endings, updated_at")
        .eq("user_id", session.user.id)
        .eq("is_primary", true)
        .maybeSingle();
      // Refresh all rows for the language-aware signature card (does not
      // touch the legacy single-row `profile` state below).
      const { data: allRows } = await supabase
        .from("authority_voice_profiles")
        .select("language, is_primary, example_posts, admired_posts, vocabulary_preferences, preferred_structures, storytelling_patterns, tone, allowed_endings, updated_at")
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
            ? "المزيد من منشوراتك بهذه اللغة أولاً — ثم الصقل."
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
    const lines = text.split(/\r?\n/);
    let blankRun = 0;
    let sawDashSeparator = false;
    for (const line of lines) {
      if (/^\s*-{3,}\s*$/.test(line)) {
        sawDashSeparator = true;
        posts.push(cur.join("\n"));
        cur = [];
        blankRun = 0;
        continue;
      }
      if (line.trim() === "") {
        blankRun++;
        // If no explicit --- separators appear, treat 2+ blank lines as a boundary.
        if (!sawDashSeparator && blankRun >= 2 && cur.length > 0) {
          posts.push(cur.join("\n"));
          cur = [];
        } else {
          cur.push(line);
        }
        continue;
      }
      blankRun = 0;
      cur.push(line);
    }
    posts.push(cur.join("\n"));
    return posts.map((s) => s.trim()).filter(Boolean);
  };

  // Batch posts into chunks that stay under the EF payload budget.
  // Keeps whole posts together; splits on cumulative character count.
  const chunkPostsForDistill = (posts: string[], maxChars = 8000): string[][] => {
    const chunks: string[][] = [];
    let cur: string[] = [];
    let curChars = 0;
    for (const p of posts) {
      const len = p.length;
      if (cur.length > 0 && curChars + len > maxChars) {
        chunks.push(cur);
        cur = [];
        curChars = 0;
      }
      cur.push(p);
      curChars += len;
    }
    if (cur.length > 0) chunks.push(cur);
    return chunks;
  };

  // Silent variant of teachFromPosts — no toast, no state reset. Returns success.
  const distillBatch = async (postsArr: string[]): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) throw new Error("Not authenticated");
    const { data, error } = await supabase.functions.invoke("voice-distill", {
      body: { posts: postsArr, store_samples: true },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return true;
  };

  // Teach from a (potentially large) list of posts by splitting into batches.
  // Shows one aggregate toast. Used by both paste and file-upload paths when
  // the input would exceed a single voice-distill payload.
  const teachFromPostsBatched = async (postsArr: string[], labelPrefix = ""): Promise<number> => {
    const chunks = chunkPostsForDistill(postsArr);
    if (chunks.length === 0) return 0;
    const progressId = `voice-teach-${Date.now()}`;
    let taught = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      toast.loading(
        `${labelPrefix}Teaching Aura — batch ${i + 1} of ${chunks.length} (${chunk.length} posts)…`,
        { id: progressId, duration: Infinity },
      );
      // eslint-disable-next-line no-await-in-loop
      await distillBatch(chunk);
      taught += chunk.length;
    }
    toast.dismiss(progressId);
    return taught;
  };

  const teachFromPosts = async (postsArr: string[]) => {
    if (postsArr.length === 0) {
      toast.error("Add at least one post to teach Aura from.");
      return;
    }
    setTeaching(true);
    try {
      const taught = await teachFromPostsBatched(postsArr);
      toast.success(`Voice sharpened from ${taught} ${taught === 1 ? "post" : "posts"}.`);
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

  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

  // Client-side text extraction for .txt/.md/.docx/.pdf.
  const extractTextFromFile = async (file: File): Promise<string> => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".txt") || lower.endsWith(".md") || file.type === "text/plain" || file.type === "text/markdown") {
      return await file.text();
    }
    if (lower.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth: any = await import("mammoth/mammoth.browser");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return (result?.value as string) || "";
    }
    if (lower.endsWith(".pdf") || file.type === "application/pdf") {
      const pdfjs: any = await import("pdfjs-dist");
      // Use CDN worker (module type) so we don't need custom bundler config.
      try {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
      } catch { /* ignore */ }
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        // eslint-disable-next-line no-await-in-loop
        const page = await pdf.getPage(i);
        // eslint-disable-next-line no-await-in-loop
        const content = await page.getTextContent();
        const strings = content.items.map((it: any) => (typeof it?.str === "string" ? it.str : "")).filter(Boolean);
        pages.push(strings.join(" "));
      }
      return pages.join("\n\n");
    }
    throw new Error(`Unsupported file type: ${file.name}`);
  };

  const handleTeachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setTeaching(true);
    let grandTotal = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileLabel = `${file.name} (${i + 1}/${files.length}) `;
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(`${file.name} is over 50MB — skipping.`);
          continue;
        }
        const lower = file.name.toLowerCase();
        const ok = /\.(txt|md|docx|pdf)$/i.test(lower);
        if (!ok) {
          toast.error(`${file.name}: unsupported file type. Use .txt, .md, .docx, or .pdf.`);
          continue;
        }
        const readingId = `voice-read-${Date.now()}-${i}`;
        toast.loading(`Reading ${file.name}…`, { id: readingId, duration: Infinity });
        let text = "";
        try {
          // eslint-disable-next-line no-await-in-loop
          text = await extractTextFromFile(file);
        } catch (err: any) {
          toast.dismiss(readingId);
          console.error("Extract error:", err);
          toast.error(`Couldn't read ${file.name}: ${err?.message || "extraction failed"}`);
          continue;
        }
        toast.dismiss(readingId);
        const posts = parsePostsBlock(text);
        if (posts.length === 0) {
          toast.error(`${file.name}: no posts found.`);
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const taught = await teachFromPostsBatched(posts, fileLabel);
          grandTotal += taught;
        } catch (err: any) {
          console.error("Voice teach file error:", err);
          toast.error(`${file.name}: ${err?.message || "Couldn't teach Aura from those posts"}`);
        }
      }
      if (grandTotal > 0) {
        toast.success(`Voice sharpened from ${grandTotal} ${grandTotal === 1 ? "post" : "posts"} across ${files.length} ${files.length === 1 ? "file" : "files"}.`);
        setDistilledOnce(true);
        await loadProfile();
      }
    } finally {
      setUploading(false);
      setTeaching(false);
      if (teachFileRef.current) teachFileRef.current.value = "";
    }
  };

  const handleSaveAdmired = async () => {
    setSavingAdmired(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");

      const admiredPostsArr = admiredPosts
        .split(/\n---\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(content => ({ content }));

      const { data: existing } = await supabase
        .from("authority_voice_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("is_primary", true)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("authority_voice_profiles")
          .update({ admired_posts: admiredPostsArr, updated_at: new Date().toISOString() })
          .eq("user_id", session.user.id)
          .eq("is_primary", true);
        if (error) throw error;
      } else {
        const primaryLang = (profiles.find((r: any) => r.is_primary)?.language === "ar" ? "ar" : "en");
        const { error } = await supabase
          .from("authority_voice_profiles")
          .insert({
            user_id: session.user.id,
            admired_posts: admiredPostsArr,
            updated_at: new Date().toISOString(),
            language: primaryLang,
            is_primary: profiles.length === 0,
          });
        if (error) throw error;
      }

      toast.success(t("Noted — style only, never words.", "تم — للأسلوب فقط، لا للكلمات."));
    } catch (e: any) {
      toast.error(e.message || "Couldn't save");
    } finally {
      setSavingAdmired(false);
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


  // ── Engine band + console presentation ───────────────────────────────────
  // ONE voice: the member's primary row. `activeLang` is initialised from that
  // row and no control re-keys it, so nothing swaps when a language differs.
  const primaryRow: any = profiles.find((r) => r?.is_primary) || profiles[0] || null;
  const activeRow: any = profiles.find((r) => r?.language === activeLang) || primaryRow;
  const isAr = activeLang === "ar";
  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  const UI = isAr ? "'CairoAR', 'Cairo', Inter, sans-serif" : "Inter, system-ui, sans-serif";
  const dirProps = { dir: isAr ? "rtl" as const : "ltr" as const, lang: activeLang };
  const bodyLine = isAr ? 1.9 : 1.6;

  const toneVal: string = typeof activeRow?.tone === "string" ? activeRow.tone : "";
  const vocab: any = (activeRow?.vocabulary_preferences && typeof activeRow.vocabulary_preferences === "object")
    ? activeRow.vocabulary_preferences : {};
  const structures: any[] = Array.isArray(activeRow?.preferred_structures) ? activeRow.preferred_structures : [];
  const patterns: any[] = Array.isArray(activeRow?.storytelling_patterns) ? activeRow.storytelling_patterns : [];
  const useRules: any[] = Array.isArray(vocab.use) ? vocab.use : [];
  const avoidRules: any[] = Array.isArray(vocab.avoid) ? vocab.avoid : [];
  const rhythm: string = typeof vocab.rhythm === "string" ? vocab.rhythm : "";
  const examples: any[] = Array.isArray(activeRow?.example_posts) ? activeRow.example_posts : [];
  // Member controls the engine now reads.
  const prefs: any = (vocab.prefs && typeof vocab.prefs === "object" && !Array.isArray(vocab.prefs)) ? vocab.prefs : {};
  const allowedEndings: string[] = Array.isArray(activeRow?.allowed_endings)
    ? activeRow.allowed_endings.map((e: any) => String(e)).filter(Boolean)
    : [];
  const lengthMax: number = Number.isFinite(Number(prefs.length_max)) && Number(prefs.length_max) > 0
    ? Number(prefs.length_max) : 1400;
  const lengthSet: boolean = Number.isFinite(Number(prefs.length_max)) && Number(prefs.length_max) > 0;
  const emojiLevel: string = ["none", "rare", "some"].includes(prefs.emoji_level) ? prefs.emoji_level : "";
  const chosenOpenings: string[] = Array.isArray(prefs.openings) ? prefs.openings.map((o: any) => String(o)) : [];
  const storyMix: Record<string, number> = (prefs.story_mix && typeof prefs.story_mix === "object" && !Array.isArray(prefs.story_mix))
    ? prefs.story_mix : {};
  const antiAi: boolean = prefs.anti_ai !== false;
  const bannedPhrases: string[] = Array.isArray(prefs.banned_phrases) ? prefs.banned_phrases.map((b: any) => String(b)).filter(Boolean) : [];
  const ruleText = (r: any): string => (typeof r === "string" ? r : String(r?.rule ?? r?.phrase ?? r?.text ?? ""));
  const itemText = (r: any): string => (typeof r === "string" ? r : String(r?.text ?? r?.content ?? r?.rule ?? ""));
  const exampleText = (e: any): string => (typeof e === "string" ? e : String(e?.content ?? ""));
  // Manual entries only are removable here; preserved (tagged) entries stay verbatim.
  const isManualExample = (p: any) => {
    if (typeof p === "string") return true;
    if (!p || typeof p !== "object") return false;
    return !("source" in p) || p.source === "manual" || p.source == null;
  };
  const shownExamples = examples.filter(isManualExample).slice(0, 2);

  const shortDate = (v: any): string => {
    const d = v ? new Date(v) : null;
    if (!d || isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(isAr ? "ar" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  };

  const patchActiveRow = (patch: Record<string, any>) => {
    setProfiles((rows) => {
      const idx = rows.findIndex((r) => r.language === activeLang);
      if (idx < 0) return [...rows, { language: activeLang, is_primary: rows.length === 0, ...patch }];
      const copy = rows.slice();
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  };

  // Every write targets the ACTIVE-LANGUAGE row and bumps updated_at.
  const writeField = async (patch: Record<string, any>, prev: Record<string, any>) => {
    patchActiveRow(patch);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const uid = session.user.id;
      const { data: existing } = await supabase
        .from("authority_voice_profiles").select("id")
        .eq("user_id", uid).eq("language", activeLang).maybeSingle();
      const stamped = { ...patch, updated_at: new Date().toISOString() };
      if (existing) {
        const { error } = await supabase
          .from("authority_voice_profiles").update(stamped)
          .eq("user_id", uid).eq("language", activeLang);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("authority_voice_profiles")
          .insert({ user_id: uid, language: activeLang, is_primary: profiles.length === 0, ...stamped } as any);
        if (error) throw error;
      }
      patchActiveRow({ updated_at: stamped.updated_at });
      toast.success(isAr ? "تم الحفظ — Aura تكتب بهذا من الآن." : "Saved — Aura writes with this from now on");
    } catch (e: any) {
      patchActiveRow(prev);
      toast.error(e?.message || (isAr ? "تعذّر الحفظ" : "Couldn't save"));
    }
  };

  const saveList = (field: "preferred_structures" | "storytelling_patterns", next: any[], prevArr: any[]) =>
    writeField({ [field]: next }, { [field]: prevArr });

  // Sibling keys of vocabulary_preferences (rhythm, texture, notes, …) are
  // spread through untouched; only the edited list is replaced.
  const saveVocabList = (key: "use" | "avoid", next: any[]) =>
    writeField({ vocabulary_preferences: { ...vocab, [key]: next } }, { vocabulary_preferences: vocab });

  /**
   * Every member control lives inside `vocabulary_preferences.prefs`. The whole
   * vocabulary object is spread, then `prefs` is spread, then only the edited
   * key is replaced — rhythm, texture, notes, use, avoid, examples_cleaned_at
   * all survive untouched.
   */
  const savePrefs = (patch: Record<string, any>) =>
    writeField(
      { vocabulary_preferences: { ...vocab, prefs: { ...prefs, ...patch } } },
      { vocabulary_preferences: vocab },
    );

  /** `allowed_endings` is a real text[] column — written as a plain array. */
  const saveEndings = (next: string[]) =>
    writeField({ allowed_endings: next }, { allowed_endings: allowedEndings });

  const busy = teaching || uploading || distilling;

  const NIGHT = "#0F1519";
  const cardStyleB: React.CSSProperties = {
    background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 20,
    padding: 18, fontFamily: UI,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: MONO, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "#5B6673",
  };
  const explainerStyle: React.CSSProperties = { fontSize: 12, color: "#5B6673", margin: "4px 0 12px", lineHeight: bodyLine };
  const iconBtn: React.CSSProperties = {
    background: "transparent", border: "none", padding: 4, cursor: "pointer", color: "#5B6673", lineHeight: 0,
  };

  const EditableRow = ({ text, onSave, onRemove, marker }: { text: string; onSave: (v: string) => void; onRemove: () => void; marker?: React.ReactNode }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(text);
    return (
      <div
        {...dirProps}
        style={{
          display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0",
          borderBottom: "1px solid #F1F4F8", fontFamily: UI, fontSize: 13, lineHeight: bodyLine, color: "#1B2733",
        }}
      >
        {marker}
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setEditing(false); if (draft.trim() && draft !== text) onSave(draft.trim()); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
              if (e.key === "Escape") { setDraft(text); setEditing(false); }
            }}
            {...dirProps}
            style={{
              flex: 1, minHeight: 52, resize: "vertical", borderRadius: 8, border: "1px solid #E2E7EE",
              padding: 8, fontFamily: UI, fontSize: 13, lineHeight: bodyLine, color: "#1B2733", background: "#FFFFFF",
            }}
          />
        ) : (
          <span style={{ flex: 1 }}>{text}</span>
        )}
        {!editing && (
          <>
            <button type="button" style={iconBtn} aria-label={isAr ? "تعديل" : "Edit"} onClick={() => { setDraft(text); setEditing(true); }}>
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" style={iconBtn} aria-label={isAr ? "إزالة" : "Remove"} onClick={onRemove}>
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    );
  };

  const AddRow = ({ onAdd, label }: { onAdd: (v: string) => void; label: string }) => {
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");
    if (!adding) {
      return (
        <button
          type="button"
          onClick={() => setAdding(true)}
          {...dirProps}
          style={{
            marginTop: 10, width: "100%", textAlign: isAr ? "right" : "left", padding: "9px 12px",
            border: "1px dashed #B9C6D4", borderRadius: 10, background: "transparent",
            fontFamily: UI, fontSize: 12.5, color: "#5B6673", cursor: "pointer",
          }}
        >
          {label}
        </button>
      );
    }
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { const v = draft.trim(); setAdding(false); setDraft(""); if (v) onAdd(v); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
          if (e.key === "Escape") { setDraft(""); setAdding(false); }
        }}
        {...dirProps}
        style={{
          marginTop: 10, width: "100%", minHeight: 52, borderRadius: 10, border: "1px solid #E2E7EE",
          padding: 9, fontFamily: UI, fontSize: 13, lineHeight: bodyLine, color: "#1B2733",
        }}
      />
    );
  };

  const t = (en: string, ar: string) => (isAr ? ar : en);

  const chipBtn = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? "#0670C4" : "#E2E7EE"}`,
    background: active ? "rgba(6,112,196,0.08)" : "#FFFFFF",
    color: active ? "#0670C4" : "#5B6673",
    borderRadius: 999, padding: "6px 12px", fontFamily: UI, fontSize: 12.5,
    cursor: "pointer", lineHeight: 1.4,
  });

  const OPENING_OPTIONS: { v: string; en: string; ar: string }[] = [
    { v: "number_first", en: "A number first", ar: "رقم أولاً" },
    { v: "contrarian_claim", en: "A claim they'll argue with", ar: "ادعاء سيجادلون فيه" },
    { v: "observation", en: "Something you keep seeing", ar: "شيء تراه باستمرار" },
    { v: "question", en: "A question", ar: "سؤال" },
    { v: "story", en: "A short story", ar: "قصة قصيرة" },
    { v: "confession", en: "An admission", ar: "اعتراف" },
  ];
  const ENDING_OPTIONS: { v: string; en: string; ar: string }[] = [
    { v: "question", en: "An uncomfortable question", ar: "سؤال غير مريح" },
    { v: "signature", en: "Your signature line", ar: "جملة توقيعك" },
    { v: "hanging_line", en: "A line left hanging", ar: "جملة معلّقة" },
    { v: "reframe", en: "A reframe", ar: "إعادة تأطير" },
    { v: "equation", en: "An equation", ar: "معادلة" },
    { v: "number", en: "A number", ar: "رقم" },
  ];
  const STORY_ROWS: { k: string; en: string; ar: string; note: string }[] = [
    { k: "analytical", en: "Analytical", ar: "تحليلي", note: t("here's what it is", "هذا ما هو عليه") },
    { k: "actionable", en: "Actionable", ar: "جاهز للتنفيذ", note: t("here's how", "هكذا تفعلها") },
    { k: "human", en: "Human", ar: "الطبيعة البشرية", note: t("here's why", "وهذا هو السبب") },
    { k: "inspiring", en: "Inspiring", ar: "ملهم", note: t("yes, you can", "نعم، تستطيع") },
  ];
  const labelOf = (opts: { v: string; en: string; ar: string }[], v: string) => {
    const hit = opts.find((o) => o.v === v);
    return hit ? (isAr ? hit.ar : hit.en) : v;
  };

  // Language mix is read from the corpus, never chosen here.
  const langMix = (() => {
    let ar = 0, en = 0;
    for (const r of profiles) {
      const n = Array.isArray(r?.example_posts) ? r.example_posts.length : 0;
      if (r?.language === "ar") ar += n; else en += n;
    }
    const total = ar + en;
    if (total === 0) return t("No posts heard yet", "لم تُسمع منشورات بعد");
    return `العربية ${Math.round((ar / total) * 100)}% · English ${Math.round((en / total) * 100)}%`;
  })();

  const openSection = (id: string) => {
    const el = document.getElementById(`voice-sec-${id}`) as HTMLDetailsElement | null;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const summaries: Record<string, string> = {
    lang: langMix,
    tone: toneVal ? toneVal.slice(0, 70) : "",
    length: lengthSet ? `${lengthMax} ${t("chars", "حرفاً")}` : t("No limit", "بلا حد"),
    rhythm: rhythm ? rhythm.slice(0, 60) : "",
    emoji: emojiLevel ? t(
      emojiLevel === "none" ? "None" : emojiLevel === "rare" ? "Rare" : "Some",
      emojiLevel === "none" ? "بلا" : emojiLevel === "rare" ? "نادراً" : "قليلاً",
    ) : "",
    openings: chosenOpenings.length ? chosenOpenings.map((o) => labelOf(OPENING_OPTIONS, o)).join(" · ") : "",
    endings: allowedEndings.length ? allowedEndings.map((e) => labelOf(ENDING_OPTIONS, e)).join(" · ") : "",
    story: Object.keys(storyMix).length
      ? STORY_ROWS.map((r) => `${isAr ? r.ar : r.en} ${Number(storyMix[r.k]) || 0}`).join(" · ")
      : "",
    structures: structures.length ? `${structures.length}` : "",
    moves: patterns.length ? `${patterns.length}` : "",
    rules: (useRules.length || avoidRules.length) ? `${useRules.length} ✓ · ${avoidRules.length} ✗` : "",
    anchors: examples.length ? `${examples.length}` : "",
  };

  const FEED_CHIPS: { id: string; name: string }[] = [
    { id: "lang", name: t("Language", "اللغة") },
    { id: "tone", name: t("Tone", "النبرة") },
    { id: "length", name: t("Length", "الطول") },
    { id: "rhythm", name: t("Rhythm", "الإيقاع") },
    { id: "emoji", name: t("Emoji", "الإيموجي") },
    { id: "openings", name: t("Openings", "الافتتاحيات") },
    { id: "endings", name: t("Endings", "الخواتيم") },
    { id: "story", name: t("Story types", "أنواع المنشور") },
    { id: "structures", name: t("Structures", "البُنى") },
    { id: "moves", name: t("Moves", "الحركات") },
    { id: "rules", name: t("Do · Never", "افعل · لا تفعل") },
    { id: "anchors", name: t("Anchors", "المراسي") },
  ];

  return (
    <div id="voice-engine-section" ref={containerRef} style={{ scrollMarginTop: 96, fontFamily: UI }}>
      <style>{`
@keyframes voice-core-kf { 0%,100% { opacity:.4; transform:scale(.92) } 50% { opacity:1; transform:scale(1) } }
@keyframes voice-ring-kf { 0% { opacity:.55; transform:scale(.8) } 100% { opacity:0; transform:scale(1.9) } }
@keyframes voice-travel { 0% { transform:translateY(-20px); opacity:0 } 25% { opacity:1 } 100% { transform:translateY(0); opacity:0 } }
.voice-sec > summary::-webkit-details-marker { display:none }
.voice-feed { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
.voice-chip { position:relative; }
@media (min-width: 900px) {
  .voice-chip::after { content:""; position:absolute; left:50%; bottom:-22px; height:20px; border-left:1px dotted rgba(0,206,201,.45); }
  .voice-chip::before { content:""; position:absolute; left:calc(50% - 2px); bottom:-6px; width:4px; height:4px; border-radius:999px; background:#00CEC9; animation: voice-travel 3s linear infinite; }
  .voice-chip:nth-child(3n)::before { animation-duration:3.6s; animation-delay:.4s }
  .voice-chip:nth-child(3n+1)::before { animation-duration:2.6s; animation-delay:.9s }
  .voice-chip:nth-child(4n)::before { animation-duration:4s; animation-delay:1.3s }
}
@media (max-width: 899px) {
  .voice-feed { flex-wrap:nowrap; overflow-x:auto; justify-content:flex-start; padding-bottom:4px; }
  .voice-chip::after, .voice-chip::before { display:none }
}
@media (prefers-reduced-motion: reduce) {
  .voice-chip::before { animation:none; display:none }
  .voice-core, .voice-ring { animation:none !important }
}
      `}</style>

      {/* ── PART 1 — ENGINE BAND ─────────────────────────────────────────── */}
      <div style={{ background: NIGHT, borderRadius: 24, padding: "22px 18px 26px", color: "#FFFFFF" }}>
        <div className="voice-feed" role="list">
          {FEED_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="listitem"
              className="voice-chip"
              onClick={() => openSection(c.id)}
              {...dirProps}
              style={{
                border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)",
                borderRadius: 999, padding: "5px 11px", cursor: "pointer", color: "#C7D3DC",
                fontFamily: UI, fontSize: 11.5, whiteSpace: "nowrap", flex: "0 0 auto",
              }}
            >
              <span style={{ color: "#8FA1AD" }}>{c.name}</span>
              <span style={{ marginInlineStart: 6, color: "#FFFFFF" }}>
                {(summaries[c.id] || t("—", "—")).slice(0, 26)}
              </span>
            </button>
          ))}
        </div>

        {/* Core */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBlockStart: 34 }}>
          <span style={{ position: "relative", width: 14, height: 14, display: "inline-block" }} aria-hidden>
            <span
              className="voice-ring"
              style={{
                position: "absolute", inset: -6, borderRadius: 999, border: "1px solid #00CEC9",
                animation: "voice-ring-kf 2.6s ease-out infinite",
              }}
            />
            <span
              className="voice-core"
              style={{
                position: "absolute", inset: 2, borderRadius: 999, background: "#00CEC9",
                animation: "voice-core-kf 2.6s ease-in-out infinite",
              }}
            />
          </span>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".12em", color: "#8FA1AD", marginBlockStart: 12 }}>
            YOUR VOICE
          </span>
          <p
            {...dirProps}
            style={{ margin: "8px 0 0", maxWidth: 460, textAlign: "center", fontSize: 15, lineHeight: bodyLine, color: "#FFFFFF" }}
          >
            {toneVal
              ? toneVal.slice(0, 90) + (toneVal.length > 90 ? "…" : "")
              : t("No tone captured yet.", "لم تُلتقط النبرة بعد.")}
          </p>
          <p style={{ fontFamily: MONO, fontSize: 11, color: "#8FA1AD", margin: "10px 0 0", textAlign: "center", lineHeight: 1.7 }} {...dirProps}>
            {examples.length === 0
              ? t("Not yet heard — teach it below.", "لم تُسمع بعد — علّمها أدناه.")
              : `${t("Learned from", "تعلّمت من")} ${examples.length} ${t("posts", "منشوراً")} · ${t("updated", "حُدّثت")} ${shortDate(activeRow?.updated_at)}`}
          </p>
          {busy && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBlockStart: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "#00CEC9", animation: "voice-core-kf 1.4s ease-in-out infinite" }} />
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#8FA1AD" }}>{t("Aura is listening…", "Aura تُنصت…")}</span>
            </div>
          )}
        </div>
      </div>

      {primaryChangeNotice && (
        <div role="status" style={{ ...cardStyleB, marginBlockStart: 12, display: "flex", gap: 10, alignItems: "flex-start" }} {...dirProps}>
          <span style={{ flex: 1, fontSize: 13, color: "#1B2733", lineHeight: bodyLine }}>
            {isAr ? "أصبح صوتك الأساسي محدداً بناءً على منشوراتك الأخيرة." : "Your primary voice is now set by your recent posts."}
          </span>
          <button type="button" onClick={dismissPrimaryChangeNotice} style={iconBtn} aria-label={t("Dismiss", "إخفاء")}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#8FA1AD" }} />
        </div>
      )}

      {/* ── PART 2 — CONSOLE ─────────────────────────────────────────────── */}
      <div style={{ marginBlockStart: 14 }}>
        {/* 1. Language — read only */}
        <ConsoleSection
          isAr={isAr}
          id="lang"
          label={t("LANGUAGE", "اللغة")}
          value={summaries.lang}
          explainer={t("Read from the posts Aura has heard. Showing: your primary voice.", "محسوبة من المنشورات التي سمعتها Aura. المعروض: صوتك الأساسي.")}
        >
          <p style={{ fontFamily: MONO, fontSize: 12, color: "#5B6673", margin: 0 }} {...dirProps}>
            {summaries.lang}
          </p>
        </ConsoleSection>

        {/* 2. Tone */}
        <ConsoleSection
          isAr={isAr}
          id="tone"
          label={t("TONE", "النبرة")}
          value={summaries.tone}
          explainer={t("The register Aura writes you in. Edit it any time — your words win.", "النبرة التي تكتب بها Aura نيابة عنك. عدّلها متى شئت — كلماتك هي الفيصل.")}
        >
          {editingTone ? (
            <div>
              <Textarea
                value={toneDraft}
                onChange={(e) => setToneDraft(e.target.value)}
                className="min-h-[88px] text-sm"
                {...dirProps}
                style={{ fontFamily: UI, lineHeight: bodyLine }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Button variant="ghost" size="sm" disabled={savingTone} onClick={() => { setEditingTone(false); setToneDraft(toneVal); }}>
                  {t("Cancel", "إلغاء")}
                </Button>
                <Button size="sm" disabled={savingTone} onClick={handleSaveTone}>
                  {savingTone ? <Loader2 className="w-3 h-3 animate-spin" /> : t("Save", "حفظ")}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }} {...dirProps}>
              <p style={{ flex: 1, margin: 0, fontSize: 15, lineHeight: bodyLine, color: "#1B2733" }}>
                {toneVal || <span style={{ color: "#5B6673" }}>{t("No tone captured yet.", "لم تُلتقط النبرة بعد.")}</span>}
              </p>
              <button type="button" style={iconBtn} aria-label={t("Edit tone", "تعديل النبرة")} onClick={() => { setToneDraft(toneVal); setEditingTone(true); }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </ConsoleSection>

        {/* 3. Length */}
        <ConsoleSection
          isAr={isAr}
          id="length"
          label={t("LENGTH", "الطول")}
          value={summaries.length}
          explainer={t("Aura keeps every post at or under this.", "تلتزم Aura بهذا الحد في كل منشور.")}
        >
          <div {...dirProps}>
            <div style={{ fontFamily: MONO, fontSize: 13, color: "#1B2733" }}>
              {t(`up to ${lenDraft ?? lengthMax} characters`, `حتى ${lenDraft ?? lengthMax} حرفاً`)}
            </div>
            <input
              type="range"
              min={400}
              max={3000}
              step={50}
              value={lenDraft ?? lengthMax}
              onChange={(e) => setLenDraft(Number(e.target.value))}
              onMouseUp={() => { if (lenDraft !== null) { savePrefs({ length_max: lenDraft }); setLenDraft(null); } }}
              onTouchEnd={() => { if (lenDraft !== null) { savePrefs({ length_max: lenDraft }); setLenDraft(null); } }}
              onKeyUp={() => { if (lenDraft !== null) { savePrefs({ length_max: lenDraft }); setLenDraft(null); } }}
              style={{ width: "100%", marginTop: 10, accentColor: "#0670C4" }}
              aria-label={t("Maximum characters", "الحد الأقصى للأحرف")}
            />
          </div>
        </ConsoleSection>

        {/* 4. Rhythm — read only */}
        <ConsoleSection
          isAr={isAr}
          id="rhythm"
          label={t("RHYTHM", "الإيقاع")}
          value={summaries.rhythm}
          explainer={t("Heard in your own writing.", "مُلاحظ في كتابتك أنت.")}
        >
          <p style={{ margin: 0, fontStyle: "italic", fontSize: 13, color: "#5B6673", lineHeight: bodyLine }} {...dirProps}>
            {rhythm || t("Not heard yet.", "لم يُلاحظ بعد.")}
          </p>
        </ConsoleSection>

        {/* 5. Emoji */}
        <ConsoleSection
          isAr={isAr}
          id="emoji"
          label={t("EMOJI", "الإيموجي")}
          value={summaries.emoji}
          explainer={t("Never in the opening or the closing question.", "لا يظهر أبداً في الافتتاحية ولا في السؤال الختامي.")}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} {...dirProps}>
            {(["none", "rare", "some"] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                aria-pressed={emojiLevel === lvl}
                onClick={() => savePrefs({ emoji_level: lvl })}
                style={chipBtn(emojiLevel === lvl)}
              >
                {t(
                  lvl === "none" ? "None" : lvl === "rare" ? "Rare" : "Some",
                  lvl === "none" ? "بلا" : lvl === "rare" ? "نادراً" : "قليلاً",
                )}
              </button>
            ))}
          </div>
        </ConsoleSection>

        {/* 6. Openings */}
        <ConsoleSection
          isAr={isAr}
          id="openings"
          label={t("OPENINGS", "الافتتاحيات")}
          value={summaries.openings}
          explainer={t("Aura opens every post one of these ways.", "تفتتح Aura كل منشور بإحدى هذه الطرق.")}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} {...dirProps}>
            {OPENING_OPTIONS.map((o) => {
              const on = chosenOpenings.includes(o.v);
              return (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => savePrefs({ openings: on ? chosenOpenings.filter((x) => x !== o.v) : [...chosenOpenings, o.v] })}
                  style={chipBtn(on)}
                >
                  {isAr ? o.ar : o.en}
                </button>
              );
            })}
          </div>
        </ConsoleSection>

        {/* 7. Endings — real allowed_endings column */}
        <ConsoleSection
          isAr={isAr}
          id="endings"
          label={t("ENDINGS", "الخواتيم")}
          value={summaries.endings}
          explainer={t("Aura rotates between the ones you keep.", "تتنقل Aura بين ما تُبقيه منها.")}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} {...dirProps}>
            {ENDING_OPTIONS.map((o) => {
              const on = allowedEndings.includes(o.v);
              return (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (on && allowedEndings.length <= 1) { setEndingNote(true); return; }
                    setEndingNote(false);
                    saveEndings(on ? allowedEndings.filter((x) => x !== o.v) : [...allowedEndings, o.v]);
                  }}
                  style={chipBtn(on)}
                >
                  {isAr ? o.ar : o.en}
                </button>
              );
            })}
          </div>
          {endingNote && (
            <p style={{ ...explainerStyle, margin: "10px 0 0" }} {...dirProps}>
              {t("Keep at least one ending.", "أبقِ خاتمة واحدة على الأقل.")}
            </p>
          )}
        </ConsoleSection>

        {/* 8. Story types */}
        <ConsoleSection
          isAr={isAr}
          id="story"
          label={t("STORY TYPES", "أنواع المنشور")}
          value={summaries.story}
          explainer={t("Aura leans toward the one you use least.", "تميل Aura إلى النوع الأقل استخداماً لديك.")}
        >
          <div {...dirProps}>
            {STORY_ROWS.map((r) => {
              const val = Number((mixDraft ?? storyMix)[r.k]) || 0;
              return (
                <div key={r.k} style={{ marginBlockEnd: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "#1B2733", lineHeight: bodyLine }}>
                      {isAr ? r.ar : r.en}{" "}
                      <span style={{ color: "#8FA1AD", fontSize: 12 }}>{isAr ? r.en : r.ar} · {r.note}</span>
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: "#5B6673" }}>{val}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={val}
                    onChange={(e) => setMixDraft({ ...(mixDraft ?? storyMix), [r.k]: Number(e.target.value) })}
                    onMouseUp={() => { if (mixDraft) { savePrefs({ story_mix: mixDraft }); setMixDraft(null); } }}
                    onTouchEnd={() => { if (mixDraft) { savePrefs({ story_mix: mixDraft }); setMixDraft(null); } }}
                    onKeyUp={() => { if (mixDraft) { savePrefs({ story_mix: mixDraft }); setMixDraft(null); } }}
                    style={{ width: "100%", accentColor: "#0670C4" }}
                    aria-label={isAr ? r.ar : r.en}
                  />
                </div>
              );
            })}
            <p style={{ ...explainerStyle, margin: 0 }}>{t("Aura leans toward the one you use least.", "تميل Aura إلى النوع الأقل استخداماً لديك.")}</p>
          </div>
        </ConsoleSection>

        {/* 9. Structures */}
        <ConsoleSection
          isAr={isAr}
          id="structures"
          label={t("HOW YOU BUILD A POST", "كيف تبني منشورك")}
          value={summaries.structures}
          explainer={t("The shapes your posts take, learned from what you publish.", "الأشكال التي تأخذها منشوراتك، مُتعلَّمة مما تنشره.")}
        >
          {structures.map((item, i) => (
            <EditableRow
              key={`s-${i}-${itemText(item)}`}
              text={itemText(item)}
              onSave={(v) => {
                const next = structures.slice();
                next[i] = typeof item === "string" ? v : { ...item, text: v };
                saveList("preferred_structures", next, structures);
              }}
              onRemove={() => saveList("preferred_structures", structures.filter((_, j) => j !== i), structures)}
            />
          ))}
          <AddRow label={t("+ Add in your own words", "+ أضف بكلماتك")} onAdd={(v) => saveList("preferred_structures", [...structures, v], structures)} />
        </ConsoleSection>

        {/* 10. Recurring moves */}
        <ConsoleSection
          isAr={isAr}
          id="moves"
          label={t("YOUR RECURRING MOVES", "حركاتك المتكررة")}
          value={summaries.moves}
          explainer={t("Signature moves Aura noticed across your posts.", "حركات مميزة لاحظتها Aura عبر منشوراتك.")}
        >
          {patterns.map((item, i) => (
            <EditableRow
              key={`p-${i}-${itemText(item)}`}
              text={itemText(item)}
              onSave={(v) => {
                const next = patterns.slice();
                next[i] = typeof item === "string" ? v : { ...item, text: v };
                saveList("storytelling_patterns", next, patterns);
              }}
              onRemove={() => saveList("storytelling_patterns", patterns.filter((_, j) => j !== i), patterns)}
            />
          ))}
          <AddRow label={t("+ Add in your own words", "+ أضف بكلماتك")} onAdd={(v) => saveList("storytelling_patterns", [...patterns, v], patterns)} />
        </ConsoleSection>

        {/* 11. Do · Never */}
        <ConsoleSection
          isAr={isAr}
          id="rules"
          label={t("WHAT YOU DO · WHAT YOU NEVER DO", "ما تفعله · ما لا تفعله أبداً")}
          value={summaries.rules}
          explainer={t("The rules of your writing. Aura obeys this list.", "قواعد كتابتك. Aura تلتزم بهذه القائمة.")}
        >
          {useRules.map((r, i) => (
            <EditableRow
              key={`u-${i}-${ruleText(r)}`}
              text={ruleText(r)}
              marker={<span style={{ color: "#12805C", fontWeight: 700 }}>✓</span>}
              onSave={(v) => {
                const next = useRules.slice();
                next[i] = typeof r === "string" ? { rule: v, verified: false, contradictions: 0, evidence: null } : { ...r, rule: v };
                saveVocabList("use", next);
              }}
              onRemove={() => saveVocabList("use", useRules.filter((_, j) => j !== i))}
            />
          ))}
          <AddRow
            label={t("+ Add in your own words", "+ أضف بكلماتك")}
            onAdd={(v) => saveVocabList("use", [...useRules, { rule: v, verified: false, contradictions: 0, evidence: null }])}
          />

          <div style={{ height: 16 }} />

          {avoidRules.map((r, i) => (
            <EditableRow
              key={`a-${i}-${ruleText(r)}`}
              text={ruleText(r)}
              marker={<span style={{ color: "#C0392B", fontWeight: 700 }}>✗</span>}
              onSave={(v) => {
                const next = avoidRules.slice();
                next[i] = typeof r === "string" ? { rule: v, verified: false, contradictions: 0, evidence: null } : { ...r, rule: v };
                saveVocabList("avoid", next);
              }}
              onRemove={() => saveVocabList("avoid", avoidRules.filter((_, j) => j !== i))}
            />
          ))}
          <AddRow
            label={t("+ Add in your own words", "+ أضف بكلماتك")}
            onAdd={(v) => saveVocabList("avoid", [...avoidRules, { rule: v, verified: false, contradictions: 0, evidence: null }])}
          />

          {/* Keep AI phrasing out */}
          <div style={{ marginBlockStart: 18, display: "flex", alignItems: "flex-start", gap: 10 }} {...dirProps}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "#1B2733", lineHeight: bodyLine }}>
                {t("Keep AI phrasing out", "أبعد صياغة الذكاء الاصطناعي")}
              </div>
              <p style={{ ...explainerStyle, margin: "2px 0 0" }}>
                {t("Blocks the stock AI openers and closers.", "يمنع الافتتاحيات والخواتيم الجاهزة للذكاء الاصطناعي.")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={antiAi}
              onClick={() => savePrefs({ anti_ai: !antiAi })}
              style={{
                width: 42, height: 24, borderRadius: 999, border: "1px solid #E2E7EE", cursor: "pointer",
                background: antiAi ? "#0670C4" : "#EEF2F6", position: "relative", flex: "0 0 auto",
              }}
              aria-label={t("Keep AI phrasing out", "أبعد صياغة الذكاء الاصطناعي")}
            >
              <span
                style={{
                  position: "absolute", top: 2, insetInlineStart: antiAi ? 20 : 2, width: 18, height: 18,
                  borderRadius: 999, background: "#FFFFFF", transition: "inset-inline-start 140ms ease",
                }}
              />
            </button>
          </div>

          {/* Never say this */}
          <div style={{ marginBlockStart: 18 }} {...dirProps}>
            <div style={labelStyle}>{t("NEVER SAY THIS", "لا تقل هذا أبداً")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBlockStart: 8 }}>
              {bannedPhrases.map((p, i) => (
                <span
                  key={`b-${i}-${p}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #E2E7EE",
                    borderRadius: 999, padding: "5px 10px", fontSize: 12.5, color: "#1B2733", background: "#FFFFFF",
                  }}
                >
                  {p}
                  <button
                    type="button"
                    style={iconBtn}
                    aria-label={t("Remove", "إزالة")}
                    onClick={() => savePrefs({ banned_phrases: bannedPhrases.filter((_, j) => j !== i) })}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              value={bannedDraft}
              onChange={(e) => setBannedDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const v = bannedDraft.trim();
                if (!v || bannedPhrases.includes(v)) { setBannedDraft(""); return; }
                savePrefs({ banned_phrases: [...bannedPhrases, v] });
                setBannedDraft("");
              }}
              placeholder={t("Add a phrase, press Enter", "أضف عبارة، ثم Enter")}
              {...dirProps}
              style={{
                marginBlockStart: 10, width: "100%", borderRadius: 10, border: "1px solid #E2E7EE",
                padding: "9px 11px", fontFamily: UI, fontSize: 13, color: "#1B2733", lineHeight: bodyLine,
              }}
            />
          </div>
        </ConsoleSection>

        {/* 12. Anchor posts */}
        <ConsoleSection
          isAr={isAr}
          id="anchors"
          label={t("POSTS THAT ANCHOR YOUR VOICE", "منشورات ترسّخ صوتك")}
          value={summaries.anchors}
          explainer={t("The writing Aura holds as proof of how you sound.", "الكتابة التي تحتفظ بها Aura دليلاً على طريقتك.")}
        >
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#5B6673" }}>{examples.length}</div>
          {shownExamples.map((ex, i) => (
            <div
              key={`e-${i}`}
              {...dirProps}
              style={{
                marginBlockStart: 10, border: "1px solid #E2E7EE", borderRadius: 12, padding: 12,
                display: "flex", gap: 8, alignItems: "flex-start",
                fontSize: 13, lineHeight: bodyLine, color: "#1B2733",
              }}
            >
              <span style={{ flex: 1 }}>
                {exampleText(ex).slice(0, 180)}{exampleText(ex).length > 180 ? "…" : ""}
              </span>
              <button
                type="button"
                style={iconBtn}
                aria-label={t("Remove example", "إزالة المثال")}
                onClick={() => {
                  const target = ex;
                  // Preserved (non-manual) entries are never touched here.
                  let dropped = false;
                  const next = examples.filter((e) => {
                    if (!dropped && isManualExample(e) && e === target) { dropped = true; return false; }
                    return true;
                  });
                  writeField({ example_posts: next }, { example_posts: examples });
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <p style={{ ...explainerStyle, margin: "12px 0 0" }} {...dirProps}>{t("Teaching adds more.", "التعليم يضيف المزيد.")}</p>
        </ConsoleSection>

        {/* 13. Teach Aura */}
        <ConsoleSection
          isAr={isAr}
          id="teach"
          label={t("TEACH AURA", "علّم Aura")}
          value={t("Paste, upload, sharpen", "الصق، ارفع، اصقل")}
          explainer={t("Feed it posts you've written. Two minutes of pasting beats an hour of describing.", "أطعمها منشورات كتبتها. دقيقتان من اللصق أفضل من ساعة من الوصف.")}
        >
          <Textarea
            value={teachText}
            onChange={(e) => setTeachText(e.target.value)}
            placeholder={"Post 1...\n---\nPost 2...\n---\nPost 3..."}
            className="min-h-[120px] text-sm"
            disabled={teaching}
            style={{ fontFamily: UI, lineHeight: bodyLine }}
          />
          <p style={{ ...explainerStyle, margin: "8px 0 0" }} {...dirProps}>
            {t("Your posts are yours alone — used only to refine your voice, never shared.",
               "منشوراتك لك وحدك — تُستخدم لصقل صوتك فقط، ولا تُشارك مع أحد.")}
          </p>
          <input
            ref={teachFileRef}
            type="file"
            accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            onChange={handleTeachFile}
            className="hidden"
            id="voice-teach-file"
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <Button type="button" variant="outline" disabled={teaching || uploading} onClick={() => teachFileRef.current?.click()} className="gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t("Upload posts (.txt, .docx, .pdf)", "ارفع منشورات (.txt, .docx, .pdf)")}
            </Button>
            <Button type="button" variant="outline" onClick={handleTeachSubmit} disabled={teaching || uploading || teachText.trim().length === 0} className="gap-2">
              {teaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {t("Teach Aura", "علّم Aura")}
            </Button>
            <Button type="button" variant="ghost" onClick={handleDistill} disabled={distilling} className="gap-2">
              {distilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {t("Sharpen now", "صقل الآن")}
            </Button>
          </div>
          <div style={{ marginTop: 14 }} {...dirProps}>
            <button
              type="button"
              onClick={() => setAdmiredOpen((v) => !v)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: 0,
                padding: 0, cursor: "pointer", fontFamily: UI, fontSize: 12.5, color: "#5B6673",
                lineHeight: bodyLine,
              }}
              aria-expanded={admiredOpen}
            >
              {t("Posts you admire (style only)", "منشورات تُعجبك (للأسلوب فقط)")}
              <ChevronRight
                className="w-3.5 h-3.5"
                style={{ transition: "transform 150ms ease", transform: admiredOpen ? "rotate(90deg)" : "none" }}
              />
            </button>
            {admiredOpen && (
              <div style={{ marginTop: 10 }}>
                <Textarea
                  value={admiredPosts}
                  onChange={(e) => setAdmiredPosts(e.target.value)}
                  placeholder={t("Paste posts whose style you admire — separate with ---", "الصق منشورات تُعجبك أساليبها — افصل بينها بـ ---")}
                  className="min-h-[110px] text-sm"
                  disabled={savingAdmired}
                  style={{ fontFamily: UI, lineHeight: bodyLine }}
                />
                <div style={{ marginTop: 10 }}>
                  <Button type="button" size="sm" variant="outline" onClick={handleSaveAdmired} disabled={savingAdmired} className="gap-2">
                    {savingAdmired ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t("Save", "حفظ")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ConsoleSection>
      </div>

      {/* PRIMARY ACTION */}
      <button
        type="button"
        onClick={() => onWrite?.()}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#04477C"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#0670C4"; }}
        {...dirProps}
        style={{
          marginBlockStart: 18, width: "100%", border: "none", borderRadius: 8, padding: "12px 16px",
          background: "#0670C4", color: "#FFFFFF", fontFamily: UI, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
        }}
      >
        {t("Write with this voice →", "اكتب بهذا الصوت ←")}
      </button>
    </div>
  );
};

export default VoiceEngineSection;
