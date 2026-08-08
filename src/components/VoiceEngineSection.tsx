import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Mic, Loader2, Save, Check, Upload, Sparkles, Pencil, ArrowRight, X } from "lucide-react";
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
  const [admiredOpen, setAdmiredOpen] = useState(false);
  const [savingAdmired, setSavingAdmired] = useState(false);
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


  // ── Voice map presentation ───────────────────────────────────────────────
  const activeRow: any = profiles.find((r) => r?.language === activeLang) || null;
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

  const SpineCard = ({ label, explainer, children }: { label: string; explainer: string; children: React.ReactNode }) => (
    <div style={{ position: "relative", marginInlineStart: 22, marginBlockStart: 14 }}>
      <span
        aria-hidden
        style={{
          position: "absolute", insetInlineStart: -22, insetBlockStart: 26, width: 7, height: 7,
          borderRadius: 999, background: "#B9C6D4",
        }}
      />
      <div style={cardStyleB}>
        <div style={labelStyle} {...dirProps}>{label}</div>
        <p style={explainerStyle} {...dirProps}>{explainer}</p>
        {children}
      </div>
    </div>
  );

  const t = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <div id="voice-engine-section" ref={containerRef} style={{ scrollMarginTop: 96, fontFamily: UI }}>
      <style>{`@keyframes voice-dot-kf { 0%,100% { opacity: .35 } 50% { opacity: 1 } }`}</style>

      {/* VOICE CORE */}
      <div style={{ background: NIGHT, borderRadius: 20, padding: 18, color: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: "#00CEC9", animation: "voice-dot-kf 2.6s ease-in-out infinite" }} />
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".12em", color: "#8FA1AD" }}>YOUR VOICE</span>
          <span
            style={{
              marginInlineStart: "auto", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
              background: trained ? "rgba(18,128,92,0.22)" : "rgba(143,161,173,0.18)",
              color: trained ? "#7EE2BC" : "#8FA1AD",
            }}
          >
            {trained ? t("Trained", "مُدرَّب") : t("Not yet", "ليس بعد")}
          </span>
        </div>

        <div role="tablist" aria-label="Voice language" style={{ display: "inline-flex", gap: 4, marginBlockStart: 14, background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 3 }}>
          {(["en", "ar"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={activeLang === l}
              onClick={() => setActiveLang(l)}
              style={{
                border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer",
                background: activeLang === l ? "#0984E3" : "transparent",
                color: activeLang === l ? "#FFFFFF" : "#8FA1AD",
                fontFamily: l === "ar" ? "'CairoAR', 'Cairo', sans-serif" : "Inter, sans-serif",
                fontSize: 12.5, fontWeight: 600,
              }}
              dir={l === "ar" ? "rtl" : "ltr"}
              lang={l}
            >
              {l === "ar" ? "العربية" : "English"}
            </button>
          ))}
        </div>

        <p style={{ fontFamily: MONO, fontSize: 11, color: "#8FA1AD", margin: "12px 0 0", lineHeight: 1.7 }} {...dirProps}>
          {examples.length === 0
            ? t("Not yet heard in this language — teach it below.", "لم تُسمع بعد بهذه اللغة — علّمها أدناه.")
            : `${t("Learned from", "تعلّمت من")} ${examples.length} ${t("posts", "منشوراً")} · ${t("updated", "حُدّثت")} ${shortDate(activeRow?.updated_at)}`}
        </p>

        {busy && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBlockStart: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: "#00CEC9", animation: "voice-dot-kf 1.4s ease-in-out infinite" }} />
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#8FA1AD" }}>
              {t("Aura is listening…", "Aura تُنصت…")}
            </span>
          </div>
        )}
      </div>

      {primaryChangeNotice && (
        <div role="status" style={{ ...cardStyleB, marginBlockStart: 12, display: "flex", gap: 10, alignItems: "flex-start" }} {...dirProps}>
          <span style={{ flex: 1, fontSize: 13, color: "#1B2733", lineHeight: bodyLine }}>
            {isAr
              ? "أصبح صوتك الأساسي محدداً بناءً على منشوراتك الأخيرة."
              : "Your primary voice is now set by your recent posts."}
          </span>
          <button type="button" onClick={dismissPrimaryChangeNotice} style={iconBtn} aria-label={t("Dismiss", "إخفاء")}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* DOTTED SPINE */}
      <div style={{ position: "relative" }}>
        <span
          aria-hidden
          style={{
            position: "absolute", insetInlineStart: 3, insetBlockStart: 0, bottom: 0,
            borderInlineStart: "2px dotted #B9C6D4",
          }}
        />

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#8FA1AD" }} />
          </div>
        )}

        {/* a. Tone */}
        <SpineCard
          label={t("YOUR TONE", "نبرتك")}
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
        </SpineCard>

        {/* b. Structures */}
        <SpineCard
          label={t("HOW YOU BUILD A POST", "كيف تبني منشورك")}
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
        </SpineCard>

        {/* c. Recurring moves */}
        <SpineCard
          label={t("YOUR RECURRING MOVES", "حركاتك المتكررة")}
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
        </SpineCard>

        {/* d. Rules */}
        <SpineCard
          label={t("WHAT YOU DO · WHAT YOU NEVER DO", "ما تفعله · ما لا تفعله أبداً")}
          explainer={t("The rules of your writing. Aura obeys this list.", "قواعد كتابتك. Aura تلتزم بهذه القائمة.")}
        >
          {useRules.map((r, i) => (
            <EditableRow
              key={`u-${i}-${ruleText(r)}`}
              text={ruleText(r)}
              marker={<span style={{ color: "#12805C", fontWeight: 700 }}>✓</span>}
              onSave={(v) => {
                const next = useRules.slice();
                // Only the text changes — verified / contradictions / evidence survive.
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

          {rhythm.trim().length > 0 && (
            <div style={{ marginBlockStart: 16 }} {...dirProps}>
              <div style={labelStyle}>{t("YOUR RHYTHM", "إيقاعك")}</div>
              <p style={{ margin: "6px 0 0", fontStyle: "italic", fontSize: 13, color: "#5B6673", lineHeight: bodyLine }}>{rhythm}</p>
            </div>
          )}
        </SpineCard>

        {/* e. Examples */}
        <SpineCard
          label={t("POSTS THAT ANCHOR YOUR VOICE", "منشورات ترسّخ صوتك")}
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
        </SpineCard>

        {/* f. Teach */}
        <SpineCard
          label={t("TEACH AURA", "علّم Aura")}
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
        </SpineCard>
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
