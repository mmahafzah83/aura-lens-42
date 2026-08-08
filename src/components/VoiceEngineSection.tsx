import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Mic, Loader2, Save, Check, Upload, Sparkles, Pencil, ArrowRight } from "lucide-react";
import InfoTooltip from "@/components/ui/InfoTooltip";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

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
        .select("language, is_primary, example_posts, admired_posts, vocabulary_preferences, preferred_structures, storytelling_patterns, tone, updated_at")
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
        .select("example_posts, admired_posts, vocabulary_preferences, preferred_structures, storytelling_patterns, tone, updated_at")
        .eq("user_id", session.user.id)
        .eq("is_primary", true)
        .maybeSingle();
      // Refresh all rows for the language-aware signature card (does not
      // touch the legacy single-row `profile` state below).
      const { data: allRows } = await supabase
        .from("authority_voice_profiles")
        .select("language, is_primary, example_posts, admired_posts, vocabulary_preferences, preferred_structures, storytelling_patterns, tone, updated_at")
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

