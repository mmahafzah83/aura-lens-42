/**
 * /studio — one room.
 *
 * A member chooses a subject, gets a post, turns it into slides and puts it on
 * LinkedIn without ever leaving this address. Nothing here navigates away, and
 * nothing here is shared with any other member-facing screen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ButtonPrimary, ButtonGhost } from "@/components/systemb";
import { loadStartCards, type StartCard } from "@/components/composer/startCards";
import { loadStudioDrafts, loadStudioDraft, type StudioDraft } from "@/components/studio/draftsSource";
import { track } from "@/lib/track";
import { formatSmartDate } from "@/lib/formatDate";
import { stripMarkdown, fixArabicDirectionalSymbols } from "@/lib/textFormat";
import { DeckIRSchema, type DeckIR } from "@/carousel/deckIR";
import { DEFAULT_THEME, type ThemeName } from "@/carousel/render/themes";
import type { FitState } from "@/carousel/render/useFitLadder";
import { collectSlideNodes, exportDeckPdf } from "@/carousel/render/exportDeck";
import { mediaSupport } from "@/carousel/render/Slide";
import StudioCanvas from "@/carousel/studio/StudioCanvas";
import { plainFailure } from "@/carousel/studio/slotLabels";
import { moveSlide, replaceSlide, setSlidePhoto } from "@/carousel/studio/deckEdit";
import { SLIDE_MEDIA_LIMITS, checkImage, fitToSlot } from "@/lib/imagePrep";
import JourneyMap from "@/components/studio/JourneyMap";
import BusyBar from "@/components/studio/BusyBar";
import PostureQuestion from "@/components/studio/PostureQuestion";
import StageCard from "@/components/studio/StageCard";
import ZonePiece from "@/components/studio/ZonePiece";
import ZoneStage from "@/components/studio/ZoneStage";
import ZoneInspector from "@/components/studio/ZoneInspector";
import ZoneLook from "@/components/studio/ZoneLook";
import { T, attentionText, pictureProblem, postureLabel, startReason, type Lang, type Posture } from "@/components/studio/strings";

/** Slides need enough words to divide up. Below this the option is refused. */
const SLIDES_MIN_CHARS = 400;
/** LinkedIn's own ceiling. */
const POST_MAX_CHARS = 3000;

/** A cheap, stable stamp of the text a deck was built from. */
function sourceStamp(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${text.length}:${h}`;
}

const POSTURE_KEY = "aura_studio_posture";
const DRAFT_KEY = "aura_studio_draft_v1";

/**
 * The quality gate, said as one sentence a member can act on. Never a list,
 * never a score, never a verdict. In Arabic the English weakness is not shown
 * at all — a plain Arabic sentence stands in its place.
 */
function gateSentence(firstWeakness: string | undefined, lang: Lang): string {
  const w = (firstWeakness || "").trim();
  if (lang === "ar" || !w) return T.notReadyPlain[lang];
  const tidy = w.replace(/\s+/g, " ").replace(/^[-•\d.\s]+/, "");
  return `${T.notReadyLead.en} ${tidy.endsWith(".") ? tidy : `${tidy}.`}`;
}

/** Two tabs that both do something. There is no third. */
type SubNav = "build" | "look";

/** What the member decided this piece should be. Chosen at step 3. */
type Format = "post" | "slides";

interface Choice {
  id: string | null;
  title: string;
  insight: string;
}

export default function Studio() {
  const [searchParams] = useSearchParams();
  /* ---------- session and preferences ---------------------------- */
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [lang, setLang] = useState<Lang>("en");
  const [writeLang, setWriteLang] = useState<Lang>("en");

  const [posture, setPosture] = useState<Posture>("editor");
  const [askingPosture, setAskingPosture] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  /* ---------- the piece ------------------------------------------ */
  const [step, setStep] = useState(1);
  const [sub, setSub] = useState<SubNav>("build");
  const [format, setFormat] = useState<Format | null>(null);

  const [cards, setCards] = useState<StartCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [typedTopic, setTypedTopic] = useState("");
  const [pasted, setPasted] = useState("");

  const [content, setContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<null | "failed" | "session">(null);
  const genRunId = useRef(0);

  const [deck, setDeck] = useState<DeckIR | null>(null);
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);
  const [deckLength, setDeckLength] = useState<5 | 7 | 10>(7);
  const [deckBusy, setDeckBusy] = useState(false);
  const [deckFailures, setDeckFailures] = useState<string[]>([]);
  /** The words these slides were built from. Lets us say when they drift apart. */
  const [deckSource, setDeckSource] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [fits, setFits] = useState<Record<number, FitState>>({});
  const [changingLine, setChangingLine] = useState(false);
  const [pictureNotice, setPictureNotice] = useState<string | null>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  /** Which table the open draft came from. Decides the publish promotion. */
  const [draftSource, setDraftSource] = useState<"content_items" | "linkedin_posts" | null>(null);
  const [drafts, setDrafts] = useState<StudioDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  /** All active subjects, loaded only when the member asks to see them. */
  const [allSignals, setAllSignals] = useState<Array<{ id: string; title: string; insight: string }>>([]);
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  /** The quality gate held this post. One sentence, never a checklist. */
  const [notReady, setNotReady] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  /** In flight. Never a tick — the action has not finished. */
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  /** Failures. Never a tick, never overwritten by an autosave. */
  /** Set when a draft came back, rendered once the language is known. */
  const [restoredFlag, setRestoredFlag] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [busy, setBusy] = useState<null | "post" | "save" | "export" | "link">(null);
  const [exported, setExported] = useState(false);
  /** Raised when pasted words would overwrite a post the member already has. */
  const [askReplace, setAskReplace] = useState(false);
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [linkInput, setLinkInput] = useState("");

  const [undoStack, setUndoStack] = useState<Array<{ content: string; deck: DeckIR | null }>>([]);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(520);
  const [narrow, setNarrow] = useState(false);

  const rtlShell = lang === "ar";
  const rtlWrite = writeLang === "ar";

  /* ---------- boot ------------------------------------------------ */
  useEffect(() => {
    let dead = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (dead) return;
      if (!session) { setReady(true); return; }
      setUserId(session.user.id);
      const { data: profile } = await supabase
        .from("diagnostic_profiles")
        .select("content_language, first_name, avatar_url")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (dead) return;
      const seeded: Lang = (profile as any)?.content_language === "ar" ? "ar" : "en";
      setLang(seeded);
      setWriteLang(seeded);
      setReady(true);
      // The composer opening is the first number the company reads.
      void track("composer_opened", {
        source: searchParams.get("draft") ? "studio_deep_link" : "studio",
        signal_id: searchParams.get("signal") || null,
        move_state: null,
      });
    })();
    return () => { dead = true; };
  }, [searchParams]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSTURE_KEY) as Posture | null;
      if (saved === "delegator" || saved === "editor" || saved === "author") setPosture(saved);
      else setAskingPosture(true);
    } catch { setAskingPosture(true); }
  }, []);

  /* ---------- responsive ------------------------------------------ */
  useEffect(() => {
    const measure = () => {
      setNarrow(window.innerWidth < 900);
      const w = canvasBoxRef.current?.clientWidth ?? 520;
      setCanvasWidth(Math.max(260, Math.min(720, w - 28)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [deck, step]);

  /* ---------- bring back the piece -------------------------------- */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        content?: unknown; deck?: unknown; choice?: unknown; writeLang?: unknown;
        step?: unknown; format?: unknown; draftId?: unknown; draftSource?: unknown;
      };
      let restoredAnything = false;
      // Without the row id a reload inserts a second row for the same piece.
      if (typeof saved.draftId === "string" && saved.draftId) setDraftId(saved.draftId);
      if (saved.draftSource === "content_items" || saved.draftSource === "linkedin_posts") {
        setDraftSource(saved.draftSource);
      }
      if (typeof saved.content === "string" && saved.content.trim()) {
        setContent(saved.content);
        restoredAnything = true;
      }
      if (saved.deck) {
        // A corrupt deck is ignored, never thrown.
        const parsed = DeckIRSchema.safeParse(saved.deck);
        if (parsed.success) {
          setDeck(parsed.data);
          setTheme(parsed.data.theme as ThemeName);
          restoredAnything = true;
        }
      }
      if (saved.choice && typeof saved.choice === "object") {
        const c = saved.choice as Choice;
        if (typeof c.title === "string") setChoice({ id: c.id ?? null, title: c.title, insight: c.insight ?? "" });
      }
      if (saved.writeLang === "ar" || saved.writeLang === "en") setWriteLang(saved.writeLang);
      if (saved.format === "post" || saved.format === "slides") setFormat(saved.format);
      if (restoredAnything) {
        // Reopen exactly where they stopped.
        const s = Number(saved.step);
        setStep(s >= 1 && s <= 4 ? s : 2);
        // The language is not resolved yet at this point, so the message is
        // raised later, from whatever `lang` is then.
        setRestoredFlag(true);
      }
    } catch { /* an unreadable draft is simply not restored */ }
  }, []);

  useEffect(() => {
    if (!restoredFlag || !ready) return;
    setStatus(T.draftRestored[lang]);
    setRestoredFlag(false);
  }, [restoredFlag, ready, lang]);

  /* ---------- keep the piece ------------------------------------- */
  useEffect(() => {
    if (!content && !deck) return;
    // Debounced, and silent: `T.editHint` already tells the member their
    // changes save themselves, so no live region fires on every keystroke.
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ content, deck, choice, writeLang, step, format, draftId, draftSource }),
        );
      } catch { /* quota never blocks editing */ }
    }, 1500);
    return () => window.clearTimeout(t);
  }, [content, deck, choice, writeLang, step, format, draftId, draftSource]);

  /* A success note fades; a problem does not. */
  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(t);
  }, [status]);

  const remember = useCallback(() => {
    setUndoStack((s) => [...s.slice(-9), { content, deck }]);
  }, [content, deck]);

  const undo = useCallback(() => {
    setUndoStack((s) => {
      const last = s[s.length - 1];
      if (!last) return s;
      setContent(last.content);
      setDeck(last.deck);
      setCurrent(0);
      setFits({});
      return s.slice(0, -1);
    });
  }, []);

  /* ---------- step 1: the subject --------------------------------- */
  const preselectedRef = useRef(false);
  useEffect(() => {
    if (!userId) return;
    let dead = false;
    setCardsLoading(true);
    (async () => {
      const { cards: rows } = await loadStartCards(userId);
      if (dead) return;
      setCards(rows);
      setCardsLoading(false);
      // First entry only. Changing posture later never overwrites a subject
      // the member has already chosen.
      if (!preselectedRef.current && posture === "delegator" && rows[0]) {
        preselectedRef.current = true;
        setChoice((c) => c ?? { id: rows[0].signalId, title: rows[0].title, insight: rows[0].insight });
      }
    })();
    return () => { dead = true; };
  }, [userId, posture]);

  /* ---------- step 1: the drafts already waiting ------------------ */
  const openDraft = useCallback(
    async (d: StudioDraft, source: string) => {
      remember();
      setDraftId(d.id);
      setDraftSource(d._source);
      setContent(d.body);
      setWriteLang(d.language);
      setNotReady(null);
      if (d.signalId || d.title || d.topic) {
        setChoice({ id: d.signalId ?? null, title: d.title || d.topic || "", insight: "" });
      }
      setStep(2);
      setStatus(T.draftOpened[lang]);
      void track("composer_opened", { source, signal_id: d.signalId ?? null, move_state: "drafted" });
    },
    [remember, lang],
  );

  useEffect(() => {
    if (!userId) return;
    let dead = false;
    setDraftsLoading(true);
    (async () => {
      const rows = await loadStudioDrafts();
      if (dead) return;
      setDrafts(rows);
      setDraftsLoading(false);
    })();
    return () => { dead = true; };
  }, [userId]);

  /* The lifecycle emails deep-link straight into one draft. */
  const deepLinkRef = useRef(false);
  useEffect(() => {
    if (!userId || deepLinkRef.current) return;
    const id = searchParams.get("draft");
    if (!id) return;
    deepLinkRef.current = true;
    (async () => {
      const d = await loadStudioDraft(id);
      if (!d) { setProblem(T.draftMissing[lang]); return; }
      await openDraft(d, "lifecycle_email");
    })();
  }, [userId, searchParams, openDraft, lang]);

  /* Every subject, on request. The three ranked cards are a shortcut, not a cap. */
  useEffect(() => {
    if (!showAllSubjects || !userId || allSignals.length > 0) return;
    let dead = false;
    (async () => {
      const { data } = await supabase
        .from("strategic_signals")
        .select("id, signal_title, explanation, what_it_means_for_you, strength_score")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("strength_score", { ascending: false })
        .limit(200);
      if (dead) return;
      setAllSignals(
        ((data as any[]) || [])
          .filter((s) => s.signal_title)
          .map((s) => ({
            id: s.id as string,
            title: s.signal_title as string,
            insight: (s.what_it_means_for_you || s.explanation || "") as string,
          })),
      );
    })();
    return () => { dead = true; };
  }, [showAllSubjects, userId, allSignals.length]);

  /* ---------- step 2: the words ----------------------------------- */
  const generate = useCallback(async (picked?: Choice) => {
    const target = picked ?? choice;
    if (!target) return;
    const runId = ++genRunId.current;
    const useLang = writeLang;
    setGenError(null);
    setNotReady(null);
    setGenerating(true);
    setBusyMessage(T.writing[lang]);
    setStep(2);
    setSub("build");

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 60000);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const freshToken = sess?.session?.access_token;
      if (!freshToken) { setGenError("session"); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-authority-content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        signal: controller.signal,
        body: JSON.stringify({
          action: "generate_content",
          content_type: "post",
          topic: target.title,
          context: target.insight || "",
          language: useLang,
          signal_id: target.id || undefined,
          stream: false,
        }),
      });
      const json = await res.json().catch(() => null);
      if (runId !== genRunId.current) return;
      const text = json?.content;
      if (!res.ok || !text) { setGenError("failed"); return; }
      remember();
      setContent(fixArabicDirectionalSymbols(stripMarkdown(String(text)), useLang));
      // The gate already ran at generation. If it held the post, the words stay
      // fully editable and only the publish action waits.
      if (json?.blocked === true) {
        const weak: string[] = Array.isArray(json?.quality_gate?.weaknesses)
          ? json.quality_gate.weaknesses.filter((w: unknown) => typeof w === "string" && w.trim())
          : [];
        setNotReady(gateSentence(weak[0], lang));
      }
    } catch {
      if (runId === genRunId.current) setGenError("failed");
    } finally {
      window.clearTimeout(timer);
      if (runId === genRunId.current) { setGenerating(false); setBusyMessage(null); }
    }
  }, [choice, writeLang, remember, lang]);

  /* ---------- the draft row --------------------------------------- */
  /** The subject, written as a title so the Library never shows a raw line. */
  const pieceTitle = useCallback((): string => {
    const t = (choice?.title || typedTopic || "").trim();
    if (t) return t.slice(0, 120);
    const line = content.split("\n").map((l) => l.trim()).find(Boolean) || "";
    return line.slice(0, 120);
  }, [choice, typedTopic, content]);

  const pieceMeta = useCallback(
    () => ({
      source: "studio",
      topic: choice?.title || typedTopic || null,
      language: writeLang,
      _language: writeLang,
      signal_ids: choice?.id ? [choice.id] : [],
    }),
    [choice, typedTopic, writeLang],
  );

  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (!userId || !content.trim()) return null;
    const title = pieceTitle();
    if (draftId) {
      if (draftSource === "content_items") {
        // A content_items draft keeps its own row; the linkedin_posts twin is
        // created only when the piece is actually published.
        await supabase
          .from("content_items")
          .update({ body: content, language: writeLang } as any)
          .eq("id", draftId);
        return draftId;
      }
      // Never overwrite what the edge functions wrote into source_metadata.
      const { data: existing } = await supabase
        .from("linkedin_posts")
        .select("source_metadata")
        .eq("id", draftId)
        .maybeSingle();
      const prev = ((existing as any)?.source_metadata as Record<string, unknown>) || {};
      await supabase
        .from("linkedin_posts")
        .update({
          post_text: content,
          title,
          topic_label: title || null,
          source_signal_id: choice?.id || null,
          source_metadata: { ...prev, ...pieceMeta() },
        } as any)
        .eq("id", draftId);
      return draftId;
    }
    const { data: ins, error } = await supabase
      .from("linkedin_posts")
      .insert({
        user_id: userId,
        post_text: content,
        original_generated_text: content,
        format_type: "post",
        tracking_status: "draft",
        source_type: "aura_generated",
        authorship: "aura_drafted",
        title,
        topic_label: title || null,
        source_signal_id: choice?.id || null,
        source_metadata: pieceMeta(),
      } as any)
      .select("id")
      .single();
    if (error) return null;
    const id = (ins as any)?.id as string;
    setDraftId(id);
    setDraftSource("linkedin_posts");
    return id;
  }, [userId, content, draftId, draftSource, choice, writeLang, pieceTitle, pieceMeta]);

  /**
   * Publishing to LinkedIn from a content_items draft needs a linkedin_posts
   * row. This makes one and remembers where the piece came from, so the
   * content_items twin can be retired the moment the post goes live.
   */
  const originDraftRef = useRef<{ id: string; source: "content_items" | "linkedin_posts" } | null>(null);
  const ensurePostRow = useCallback(async (): Promise<string | null> => {
    if (draftId && draftSource === "content_items") {
      originDraftRef.current = { id: draftId, source: "content_items" };
      const title = pieceTitle();
      const { data: ins, error } = await supabase
        .from("linkedin_posts")
        .insert({
          user_id: userId,
          post_text: content,
          original_generated_text: content,
          format_type: "post",
          tracking_status: "draft",
          source_type: "aura_generated",
          authorship: "aura_drafted",
          title,
          topic_label: title || null,
          source_signal_id: choice?.id || null,
          source_metadata: pieceMeta(),
        } as any)
        .select("id")
        .single();
      if (error) return null;
      return (ins as any)?.id as string;
    }
    return saveDraft();
  }, [draftId, draftSource, userId, content, choice, pieceTitle, pieceMeta, saveDraft]);

  /**
   * A published post must COUNT. The cockpit reads `published_at`, the archive
   * and the metric matcher read `post_url`. Both are written here, on both
   * publishing paths, and the existing source_metadata is merged, never lost.
   */
  const finalisePublished = useCallback(
    async (id: string, url: string | null) => {
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from("linkedin_posts")
        .select("source_metadata")
        .eq("id", id)
        .maybeSingle();
      const prev = ((existing as any)?.source_metadata as Record<string, unknown>) || {};
      await supabase
        .from("linkedin_posts")
        .update({
          tracking_status: "published",
          published_at: now,
          acquisition: "published_via_aura",
          ...(url ? { post_url: url, published_confirmed_at: now } : {}),
          like_count: 0,
          comment_count: 0,
          repost_count: 0,
          engagement_score: 0,
          source_trust: 100,
          enriched_by: [],
          synced_at: now,
          source_metadata: { ...prev, ...pieceMeta(), ...(url ? { external_url: url } : {}) },
        } as any)
        .eq("id", id);

      // The content_items twin is retired, or the invariant grows a duplicate.
      const origin = originDraftRef.current;
      if (origin?.source === "content_items") {
        await supabase.from("content_items").update({ status: "published" } as any).eq("id", origin.id);
      } else if (draftSource === "content_items" && draftId) {
        await supabase.from("content_items").update({ status: "published" } as any).eq("id", draftId);
      }

      // Aura learns from what was actually posted. Best-effort, never blocking.
      try {
        if (userId && content.trim().length > 50) {
          const { data: vp } = await supabase
            .from("authority_voice_profiles")
            .select("example_posts")
            .eq("user_id", userId)
            .eq("language", writeLang)
            .maybeSingle();
          const existingExamples = Array.isArray((vp as any)?.example_posts) ? ((vp as any).example_posts as any[]) : [];
          const updated = [...existingExamples, content].slice(-10);
          if (vp) {
            await supabase
              .from("authority_voice_profiles")
              .update({ example_posts: updated } as any)
              .eq("user_id", userId)
              .eq("language", writeLang);
          } else {
            const { data: anyRow } = await supabase
              .from("authority_voice_profiles")
              .select("id")
              .eq("user_id", userId)
              .limit(1);
            await supabase.from("authority_voice_profiles").insert({
              user_id: userId,
              example_posts: updated,
              language: writeLang,
              is_primary: !anyRow || anyRow.length === 0,
            } as any);
          }
        }
      } catch { /* the member never sees a learning failure */ }

      // The Imprint must keep moving. Fire and forget.
      if (userId) {
        void supabase.functions
          .invoke("calculate-aura-score", { body: { user_id: userId } })
          .catch(() => { /* never surfaced */ });
      }
    },
    [pieceMeta, draftSource, draftId, userId, content, writeLang],
  );

  /* ---------- step 3: the slides, right here ---------------------- */
  const makeSlides = useCallback(async (lengthOverride?: 5 | 7 | 10) => {
    // Never silent: every refusal says why.
    if (!content.trim()) { setProblem(T.slidesNeedPost[lang]); return; }
    if (content.trim().length < SLIDES_MIN_CHARS) { setProblem(T.slidesTooShort[lang]); return; }
    if (!choice?.id) { setProblem(T.typedTopicNoSlides[lang]); return; }
    const builtFrom = content;
    setStep(3);
    setSub("build");
    setDeckBusy(true);
    setDeckFailures([]);
    setProblem(null);
    setStatus(null);
    setBusyMessage(T.makingSlides[lang]);
    let timedOut = false;
    const timeout = new Promise<"timeout">((resolve) => {
      window.setTimeout(() => { timedOut = true; resolve("timeout"); }, 90000);
    });
    try {
      await saveDraft();
      const call = supabase.functions.invoke("generate-deck", {
        body: {
          signal_id: choice.id,
          length: lengthOverride ?? deckLength,
          theme,
          lang: writeLang,
          // Always: the slides adapt the words the member approved.
          source_text: content,
        },
      });
      const raced = await Promise.race([call, timeout]);
      if (raced === "timeout" || timedOut) {
        setProblem(T.slidesTimedOut[lang]);
        return;
      }
      const { data, error } = raced as Awaited<typeof call>;
      if (error && !data) throw error;
      const result: any = data;
      if (!result?.ok) {
        // An empty list is no message at all, so it falls back like a missing one.
        const raw: string[] = Array.isArray(result?.failures) ? result.failures.filter((f: unknown) => typeof f === "string" && f.trim()) : [];
        setDeckFailures(raw.length > 0 ? raw.map(plainFailure) : [T.slidesFailedPlain[lang]]);
        return;
      }
      const parsed = DeckIRSchema.safeParse(result.deck);
      if (!parsed.success) { setDeckFailures([T.slidesFailedShape[lang]]); return; }
      remember();
      setDeck({ ...parsed.data, theme });
      setDeckSource(builtFrom);
      setExported(false);
      setCurrent(0);
      setFits({});
    } catch {
      setDeckFailures([T.connectionDropped[lang]]);
    } finally {
      setDeckBusy(false);
      setBusyMessage(null);
    }
  }, [choice, content, theme, deckLength, writeLang, lang, saveDraft, remember]);

  const changeThisLine = useCallback(async () => {
    if (!deck) return;
    setChangingLine(true);
    setProblem(null);
    setBusyMessage(T.changingLine[lang]);
    try {
      const { data } = await supabase.functions.invoke("generate-deck", {
        body: { signal_id: deck.signal_id, rewrite_slide: current, deck },
      });
      const result: any = data;
      if (!result?.ok || !result.slide) { setProblem(T.lineChangeFailed[lang]); return; }
      // A malformed slide is refused here, not discovered later at export.
      const candidate = replaceSlide(deck, current, result.slide);
      const parsed = DeckIRSchema.safeParse(candidate);
      if (!parsed.success) { setProblem(T.lineChangeFailed[lang]); return; }
      remember();
      setDeck({ ...parsed.data, theme });
    } catch {
      setProblem(T.lineChangeFailed[lang]);
    }
    finally { setChangingLine(false); setBusyMessage(null); }
  }, [deck, current, theme, lang, remember]);

  const uploadPicture = useCallback(async (file: File) => {
    setPictureNotice(null);
    if (!deck) return;
    const slide = deck.slides[Math.min(current, deck.slides.length - 1)];
    if (mediaSupport(slide.archetype) === "none") { setPictureNotice(T.noPictureHere[lang]); return; }
    const imageProblem = await checkImage(file, SLIDE_MEDIA_LIMITS);
    if (imageProblem) { setPictureNotice(pictureProblem(imageProblem, lang)); return; }
    setBusyMessage(T.uploading[lang]);
    try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) { setPictureNotice(T.sessionEnded[lang]); return; }
    const clean = await fitToSlot(file, 1400, 900, "image/jpeg");
    const path = `${uid}/${deck.deck_id}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("deck-media")
      .upload(path, clean, { upsert: true, contentType: "image/jpeg" });
    // A provider's message is never shown to a member.
    if (upErr) { setPictureNotice(T.picUploadFailed[lang]); return; }
    const { data: signed, error: signErr } = await supabase.storage
      .from("deck-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signErr || !signed) { setPictureNotice(T.picUploadFailed[lang]); return; }
    remember();
    setDeck((d) => (d ? setSlidePhoto(d, current, signed.signedUrl) : d));
    } catch {
      setPictureNotice(T.picUploadFailed[lang]);
    } finally {
      setBusyMessage(null);
    }
  }, [deck, current, lang, remember]);

  const move = useCallback((from: number, to: number) => {
    setDeck((d) => {
      if (!d) return d;
      const next = moveSlide(d, from, to);
      if (next === d) return d;
      setFits({});
      setCurrent(to);
      return next;
    });
  }, []);

  /* ---------- step 4: LinkedIn ------------------------------------ */
  /**
   * The ONLY way to reach LinkedIn. Every button that could publish calls
   * this; it opens the confirmation and nothing else.
   */
  const requestPost = useCallback(() => {
    setProblem(null);
    setConfirmingPost(true);
  }, []);

  /**
   * Publishes for real. Called from exactly one place: the confirm panel's
   * "Post it". No other call site exists.
   */
  const publishNow = useCallback(async () => {
    setConfirmingPost(false);
    setBusy("post");
    setProblem(null);
    setStatus(null);
    setNotReady(null);
    setBusyMessage(T.posting[lang]);
    await saveDraft();
    const id = await ensurePostRow();
    if (!id) { setBusy(null); setBusyMessage(null); setProblem(T.postFailed[lang]); return; }
    const { data, error } = await supabase.functions.invoke("linkedin-publish", {
      body: { postId: id },
    });
    setBusy(null);
    setBusyMessage(null);
    const payload = data as any;
    const message = `${payload?.error || ""} ${error?.message || ""}`.toLowerCase();
    if (payload?.success === true) {
      const url = (payload?.postUrl as string) || null;
      setPostUrl(url);
      setPublished(true);
      setStatus(T.postedHelp[lang]);
      await finalisePublished(id, url);
      void track("post_published", { signal_id: choice?.id || null, route: "linkedin" });
      return;
    }
    if (payload?.blocked === true) {
      // Held by the gate. The member stays here, with their words editable.
      const weak: string[] = Array.isArray(payload?.weaknesses)
        ? payload.weaknesses.filter((w: unknown) => typeof w === "string" && w.trim())
        : [];
      setNotReady(gateSentence(weak[0], lang));
      setProblem(gateSentence(weak[0], lang));
      setStep(2);
      return;
    }
    setProblem(message.includes("not connected") ? T.notConnected[lang] : T.postFailed[lang]);
  }, [saveDraft, ensurePostRow, finalisePublished, choice, lang]);

  /** Save and come back later: says where it went, and keeps the step. */
  const saveAndComeBack = useCallback(async () => {
    setBusy("save");
    setProblem(null);
    setBusyMessage(T.savingPiece[lang]);
    const id = await saveDraft();
    setBusy(null);
    setBusyMessage(null);
    if (id) setStatus(T.saveLaterNote[lang]);
    else setProblem(T.postFailed[lang]);
  }, [saveDraft, lang]);

  const exportFile = useCallback(async () => {
    // Never fails silently: if it cannot run, the member is told why.
    if (!deck) { setProblem(T.exportNoDeck[lang]); return; }
    if (!mountRef.current) { setProblem(T.exportNotReady[lang]); return; }
    setBusy("export");
    setProblem(null);
    setStatus(null);
    setBusyMessage(T.exporting[lang]);
    try {
      const nodes = collectSlideNodes(mountRef.current);
      if (nodes.length === 0) { setProblem(T.exportNotReady[lang]); return; }
      await exportDeckPdf(nodes, `aura-${deck.deck_id.slice(0, 8)}.pdf`);
      setExported(true);
      setStatus(T.exportDone[lang]);
    } catch {
      setProblem(T.exportFailed[lang]);
    } finally {
      setBusy(null);
      setBusyMessage(null);
    }
  }, [deck, lang]);

  const copyCaption = useCallback(async () => {
    try { await navigator.clipboard.writeText(content); setStatus(T.captionCopied[lang]); } catch { /* nothing copied */ }
  }, [content, lang]);

  const openLinkedIn = useCallback(() => {
    window.open("https://www.linkedin.com/feed/", "_blank", "noopener,noreferrer");
  }, []);

  const saveLink = useCallback(async () => {
    const url = linkInput.trim();
    if (!/linkedin\.com/i.test(url)) { setProblem(T.linkBad[lang]); return; }
    setBusy("link");
    setBusyMessage(T.savingLink[lang]);
    setProblem(null);
    await saveDraft();
    const id = await ensurePostRow();
    if (!id) { setBusy(null); setBusyMessage(null); setProblem(T.postFailed[lang]); return; }
    await finalisePublished(id, url);
    void track("post_published", { signal_id: choice?.id || null, route: "manual" });
    setBusy(null);
    setBusyMessage(null);
    setPublished(true);
    setPostUrl(url);
    setStatus(T.linkSaved[lang]);
  }, [linkInput, saveDraft, ensurePostRow, finalisePublished, choice, lang]);

  /* ---------- derived --------------------------------------------- */
  const attention = useMemo(() => {
    const fit = fits[current];
    if (fit?.failed) return attentionText(plainFailure(fit.reason ?? "A slide does not fit."), lang);
    return null;
  }, [fits, current, lang]);

  const doneMap = useMemo(
    () => ({ 1: Boolean(choice), 2: content.trim().length > 0, 3: Boolean(deck), 4: published }),
    [choice, content, deck, published],
  );

  /**
   * The exporter reads real DOM nodes, so the deck mount must exist with real
   * layout for as long as a deck exists — not only while step 3 is on screen.
   * When the stage is not showing it, the same mount is rendered off to the
   * side of the viewport (never display:none, never visibility:hidden).
   */
  const canvasInStage = step === 3 && format === "slides" && Boolean(deck);

  /* ---------- shell ------------------------------------------------ */
  const shell = (children: React.ReactNode) => (
    <div
      dir={rtlShell ? "rtl" : "ltr"}
      style={{ minHeight: "100vh", background: "var(--surface-page)", padding: "20px 18px 120px" }}
    >
      <div style={{ maxWidth: 1360, margin: "0 auto" }}>{children}</div>
    </div>
  );

  if (!ready) {
    return shell(
      <p role="status" aria-live="polite" style={{ fontFamily: "var(--ff-ui)", fontSize: 14, color: "var(--text-secondary)" }}>
        {T.loading[lang]}
      </p>,
    );
  }

  if (!userId) {
    return shell(
      <div>
        <h1 style={{ fontFamily: "var(--ff-ui)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          {T.signIn[lang]}
        </h1>
        <p style={{ marginTop: 12 }}>
          <Link to="/auth" style={{ fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 600, color: "var(--act)" }}>
            {T.signInLink[lang]}
          </Link>
        </p>
      </div>,
    );
  }

  if (askingPosture) {
    return shell(
      <PostureQuestion
        lang={lang}
        value={posture}
        onChange={setPosture}
        onContinue={() => {
          try { localStorage.setItem(POSTURE_KEY, posture); } catch { /* a lost preference is not an error */ }
          setAskingPosture(false);
        }}
      />,
    );
  }

  const subLink = (key: SubNav, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setSub(key)}
      style={{
        minHeight: 44,
        padding: "0 4px",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        fontFamily: "var(--ff-ui)",
        fontSize: 13.5,
        fontWeight: sub === key ? 700 : 500,
        color: sub === key ? "var(--text-primary)" : "var(--text-secondary)",
        borderBottom: `2px solid ${sub === key ? "var(--act)" : "transparent"}`,
      }}
    >
      {label}
    </button>
  );

  /* One confirmation, shared by every path that can publish. */
  const confirmPanel = confirmingPost ? (
    <div
      style={{
        background: "var(--surface-subtle)",
        border: "1px solid var(--act)",
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, lineHeight: 1.7, color: "var(--text-primary)", margin: 0 }}>
        {T.confirmPostHead[lang]}
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <ButtonPrimary onClick={() => { setStep(4); void publishNow(); }} disabled={busy === "post"} style={{ minHeight: 44 }}>
          {T.confirmPostYes[lang]}
        </ButtonPrimary>
        <ButtonGhost onClick={() => setConfirmingPost(false)} style={{ minHeight: 44 }}>
          {T.confirmPostNo[lang]}
        </ButtonGhost>
      </div>
    </div>
  ) : null;

  /* The centre editor. Step 2 only. */
  const writeArea = (
    <>
      {genError && (
        <p role="status" aria-live="polite" style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--error)", margin: "0 0 12px" }}>
          {genError === "session" ? T.sessionEnded[lang] : T.writeFailed[lang]}{" "}
          <button type="button" onClick={() => generate()} style={{ background: "transparent", border: 0, color: "var(--act)", fontWeight: 700, cursor: "pointer", minHeight: 44 }}>
            {T.tryAgain[lang]}
          </button>
        </p>
      )}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={14}
        dir={rtlWrite ? "rtl" : "ltr"}
        aria-label={T.writeHead[lang]}
        style={{
          width: "100%",
          background: "var(--surface-subtle)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          padding: 14,
          fontFamily: "var(--ff-ui)",
          fontSize: 15,
          lineHeight: rtlWrite ? 1.9 : 1.75,
          textAlign: rtlWrite ? "right" : "left",
          color: "var(--text-primary)",
          resize: "vertical",
        }}
      />
      <p style={{ fontFamily: "var(--ff-mono)", fontSize: 11, color: content.length > 2800 ? "var(--error)" : "var(--text-muted)", margin: "6px 0 14px" }}>
        {content.length} {T.characters[lang]}
        {content.length > 2800 ? ` — ${T.tooLong[lang]}` : ""}
      </p>
      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
        {T.editHint[lang]}
      </p>
    </>
  );

  /* One way forward. The label never changes; the step does. */
  const canContinue =
    step === 1 ? Boolean(choice) || Boolean(pasted.trim())
      : step === 2 ? content.trim().length > 0
        : step === 3 ? format === "post" || Boolean(deck)
          : false;

  /* Exactly one primary per screen. On step 3 the slide-making button in the
     stage IS the primary, so the strip does not offer a second one. */
  const stageOwnsPrimary = step === 3 && format === "slides" && !deck;

  const onContinue = () => {
    if (step === 1) {
      if (pasted.trim()) {
        // Words already written are never replaced without being asked.
        if (content.trim() && !askReplace) { setAskReplace(true); return; }
        remember();
        setChoice((c) => c ?? { id: null, title: typedTopic.trim() || pasted.trim().slice(0, 60), insight: "" });
        setContent(fixArabicDirectionalSymbols(stripMarkdown(pasted), writeLang));
        setPasted("");
        setAskReplace(false);
        setStep(2);
        return;
      }
      if (content.trim()) { setStep(2); return; }
      void generate();
      return;
    }
    if (step === 2) { setStep(3); return; }
    if (step === 3) { setStep(4); }
  };

  return shell(
    <>
      {/* One slim strip. This is a page inside Aura; the shell owns navigation. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingBottom: 6 }}>
        <button
          type="button"
          onClick={() => setAskingPosture(true)}
          style={{
            minHeight: 44, padding: "0 12px", borderRadius: 999, cursor: "pointer",
            background: "var(--surface-subtle)", border: "1px solid var(--border-default)",
            fontFamily: "var(--ff-ui)", fontSize: 13, color: "var(--text-secondary)",
          }}
        >
          {T.workingAs[lang]}: {postureLabel(posture, lang)} · {T.change[lang]}
        </button>
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          aria-expanded={helpOpen}
          style={{
            minHeight: 44, padding: 0, background: "transparent", border: 0, cursor: "pointer",
            fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 600, color: "var(--act)",
          }}
        >
          {T.helpLink[lang]}
        </button>
      </div>

      {helpOpen && (
        <div
          style={{
            background: "var(--surface-card)", border: "1px solid var(--border-default)",
            borderRadius: 14, padding: 14, margin: "0 0 12px", display: "grid", gap: 12,
          }}
        >
          {([
            [T.helpHowHead[lang], T.helpHowBody[lang]],
            [T.helpDrawsHead[lang], T.helpDrawsBody[lang]],
            [T.helpVoiceHead[lang], T.helpVoiceBody[lang]],
            [T.helpGetHead[lang], T.helpGetBody[lang]],
          ] as Array<[string, string]>).map(([head, body]) => (
            <div key={head}>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                {head}
              </p>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, lineHeight: 1.75, color: "var(--text-secondary)", margin: "4px 0 0" }}>
                {body}
              </p>
            </div>
          ))}
          <div>
            <ButtonGhost onClick={() => setHelpOpen(false)} style={{ minHeight: 44 }}>{T.helpClose[lang]}</ButtonGhost>
          </div>
        </div>
      )}

      <JourneyMap lang={lang} step={step} done={doneMap} onStep={(n) => setStep(n)} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexWrap: "wrap",
          padding: "8px 0 14px",
          borderBottom: "1px solid var(--border-default)",
          marginBottom: 14,
        }}
      >
        {/* The tabs only exist where they change what is on screen. */}
        {step === 3 && subLink("build", T.subBuild[lang])}
        {step === 3 && subLink("look", T.subLook[lang])}
        <span style={{ flex: 1 }} />
        {/* In flight: no tick, because nothing has finished. */}
        <span
          role="status"
          aria-live="polite"
          style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--machine-text)" }}
        >
          {busyMessage ? `… ${busyMessage}` : ""}
        </span>
        <span
          role="status"
          aria-live="polite"
          style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-secondary)" }}
        >
          {status ? `✓ ${status}` : ""}
        </span>
        <span
          role="status"
          aria-live="polite"
          style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, fontWeight: 600, color: "var(--error)" }}
        >
          {problem ?? ""}
        </span>
        {problem && (
          <ButtonGhost onClick={() => setProblem(null)} style={{ minHeight: 44 }}>
            {T.cancel[lang]}
          </ButtonGhost>
        )}
        <ButtonGhost onClick={undo} disabled={undoStack.length === 0} style={{ minHeight: 44 }}>
          {T.undo[lang]}
        </ButtonGhost>
        <span style={{ display: "grid", gap: 2 }}>
          <ButtonGhost onClick={() => void saveAndComeBack()} disabled={busy === "save"} style={{ minHeight: 44 }}>
            {T.saveLater[lang]}
          </ButtonGhost>
          <span style={{ fontFamily: "var(--ff-ui)", fontSize: 11.5, color: "var(--text-muted)", maxWidth: 260 }}>
            {T.saveLaterNote[lang]}
          </span>
        </span>
        {step < 4 && !stageOwnsPrimary && (
          <ButtonPrimary onClick={onContinue} disabled={!canContinue || generating} style={{ minHeight: 44 }}>
            {T.continue[lang]} {rtlShell ? "←" : "→"}
          </ButtonPrimary>
        )}
      </div>

      {/* Motion for anything in flight, on every step. */}
      {busyMessage && <BusyBar message={busyMessage} />}

      {step === 1 && (
        <StageCard title={T.chooseHead[lang]} subtitle={T.chooseHelp[lang]} align={rtlShell ? "right" : "left"} defaultOpen>
          {cardsLoading && (
            <p role="status" aria-live="polite" style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--text-secondary)" }}>
              {T.loading[lang]}
            </p>
          )}
          {!cardsLoading && cards.length === 0 && (
            <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              {T.chooseEmpty[lang]}
            </p>
          )}
          <div style={{ display: "grid", gap: 10 }}>
            {cards.map((c) => {
              const on = choice?.id === c.signalId;
              return (
                <button
                  key={c.signalId}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setChoice({ id: c.signalId, title: c.title, insight: c.insight });
                    setTypedTopic("");
                  }}
                  style={{
                    textAlign: rtlShell ? "right" : "left",
                    cursor: "pointer",
                    background: on ? "var(--act-tint)" : "var(--surface-subtle)",
                    border: `1px solid ${on ? "var(--act)" : "var(--border-default)"}`,
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <p style={{ fontFamily: "var(--ff-ui)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    {c.title}
                  </p>
                  <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", margin: "6px 0 0" }}>
                    {startReason(c.kind, c.fragmentCount, c.reason, lang)}
                  </p>
                  {c.insight && (
                    <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, lineHeight: 1.7, color: "var(--text-muted)", margin: "6px 0 0" }}>
                      {c.insight}
                    </p>
                  )}
                  <span style={{ display: "block", fontFamily: "var(--ff-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
                    {c.fragmentCount} {T.sources[lang]}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="studio-topic" style={{ display: "block", fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
              {T.chooseOwn[lang]}
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                id="studio-topic"
                value={typedTopic}
                onChange={(e) => {
                  setTypedTopic(e.target.value);
                  setChoice(e.target.value.trim() ? { id: null, title: e.target.value.trim(), insight: "" } : null);
                }}
                placeholder={T.chooseOwnPlaceholder[lang]}
                style={{
                  flex: "1 1 260px", minHeight: 44, padding: "0 12px", borderRadius: 10,
                  background: "var(--surface-subtle)", border: "1px solid var(--border-default)",
                  fontFamily: "var(--ff-ui)", fontSize: 14, color: "var(--text-primary)",
                  textAlign: rtlShell ? "right" : "left",
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 6px" }}>
              {T.writeLangLabel[lang]}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {([["en", T.langEn[lang]], ["ar", T.langAr[lang]]] as Array<[Lang, string]>).map(([key, label]) => {
                const on = writeLang === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWriteLang(key)}
                    style={{
                      minHeight: 44, padding: "0 16px", borderRadius: 10, cursor: "pointer",
                      fontFamily: "var(--ff-ui)", fontSize: 13.5, fontWeight: on ? 700 : 500,
                      background: on ? "var(--act-tint)" : "var(--surface-subtle)",
                      color: on ? "var(--act)" : "var(--text-secondary)",
                      border: `1px solid ${on ? "var(--act)" : "var(--border-default)"}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Own words are offered to everyone, whatever posture. */}
          {(
            <div style={{ marginTop: 18 }}>
              <label htmlFor="studio-paste" style={{ display: "block", fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {T.pasteHead[lang]}
              </label>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 8px" }}>
                {T.pasteHelp[lang]}
              </p>
              <textarea
                id="studio-paste"
                value={pasted}
                rows={6}
                dir={rtlWrite ? "rtl" : "ltr"}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={T.pastePlaceholder[lang]}
                style={{
                  width: "100%", background: "var(--surface-subtle)", border: "1px solid var(--border-default)",
                  borderRadius: 12, padding: 12, fontFamily: "var(--ff-ui)", fontSize: 14,
                  lineHeight: rtlWrite ? 1.9 : 1.75, textAlign: rtlWrite ? "right" : "left",
                  color: "var(--text-primary)", resize: "vertical",
                }}
              />
              {askReplace && (
                <div style={{ marginTop: 10, background: "var(--surface-subtle)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 12 }}>
                  <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)", margin: "0 0 10px" }}>
                    {T.replaceHead[lang]}
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ButtonPrimary onClick={onContinue} style={{ minHeight: 44 }}>{T.replaceYes[lang]}</ButtonPrimary>
                    <ButtonGhost onClick={() => { setAskReplace(false); setPasted(""); }} style={{ minHeight: 44 }}>
                      {T.replaceNo[lang]}
                    </ButtonGhost>
                  </div>
                </div>
              )}
            </div>
          )}
        </StageCard>
      )}

      {step === 2 && (
        <StageCard
          title={T.writeHead[lang]}
          subtitle={T.writeHelp[lang]}
          align={rtlShell ? "right" : "left"}
          lang={lang}
        >
          {writeArea}
        </StageCard>
      )}

      {step === 3 && (
        <>
          {/* The job first: what shape should this take? */}
          <StageCard title={T.formatHead[lang]} align={rtlShell ? "right" : "left"} defaultOpen>
            <div style={{ display: "grid", gap: 10 }}>
              {([
                ["post", T.formatWords[lang], T.formatWordsHelp[lang]],
                ["slides", T.formatSlides[lang], T.formatSlidesHelp[lang]],
              ] as Array<[Format, string, string]>).map(([key, label, help]) => {
                const on = format === key;
                const shortForSlides = key === "slides" && content.trim().length < SLIDES_MIN_CHARS;
                const noSignalForSlides = key === "slides" && !choice?.id;
                const refused = shortForSlides || noSignalForSlides;
                const why = shortForSlides ? T.slidesTooShort[lang] : noSignalForSlides ? T.typedTopicNoSlides[lang] : "";
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    disabled={refused}
                    onClick={() => setFormat(key)}
                    style={{
                      textAlign: rtlShell ? "right" : "left",
                      cursor: refused ? "not-allowed" : "pointer",
                      opacity: refused ? 0.7 : 1,
                      background: on ? "var(--act-tint)" : "var(--surface-subtle)",
                      border: `1px solid ${on ? "var(--act)" : "var(--border-default)"}`,
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    <span style={{ display: "block", fontFamily: "var(--ff-ui)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                      {label}
                    </span>
                    <span style={{ display: "block", fontFamily: "var(--ff-ui)", fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", marginTop: 4 }}>
                      {help}
                    </span>
                    {refused && (
                      <span style={{ display: "block", fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.7, fontWeight: 600, color: "var(--error)", marginTop: 6 }}>
                        {why}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </StageCard>

          {format === "slides" && deckFailures.length > 0 && (
            <div role="status" aria-live="polite" style={{ background: "var(--error-tint)", borderRadius: 12, padding: 12, margin: "0 0 12px" }}>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, fontWeight: 700, color: "var(--error)", margin: 0 }}>
                {T.slidesFailedHead[lang]}
              </p>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, color: "var(--error)", margin: "4px 0 8px", lineHeight: 1.7 }}>
                {attentionText(deckFailures[0], lang)}
              </p>
              <ButtonGhost onClick={() => void makeSlides()} style={{ minHeight: 44 }}>{T.tryAgain[lang]}</ButtonGhost>
            </div>
          )}

          {format === "slides" && deck && deckSource !== null && sourceStamp(deckSource) !== sourceStamp(content) && (
            <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--deadline)", borderRadius: 12, padding: 12, margin: "0 0 12px" }}>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)", margin: "0 0 10px" }}>
                {T.slidesStale[lang]}
              </p>
              <ButtonGhost onClick={() => void makeSlides()} disabled={deckBusy} style={{ minHeight: 44 }}>
                {T.slidesRemake[lang]}
              </ButtonGhost>
            </div>
          )}

          {format === "slides" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: narrow ? "1fr" : "200px 1fr 300px",
              gap: 12,
              alignItems: "start",
              marginTop: 12,
            }}
          >
            <ZonePiece
              lang={lang}
              writeLang={writeLang}
              subject={choice?.title || typedTopic}
              content={content}
              onContentChange={setContent}
              todo={{
                words: content.trim().length > 0,
                slides: Boolean(deck),
                cover: Boolean(deck?.slides.some((s) => s.slots.media?.src)),
                published,
              }}
            />
            <ZoneStage
              lang={lang}
              deck={deck}
              theme={theme}
              width={canvasWidth}
              current={current}
              onCurrent={setCurrent}
              onFit={(i, state) => setFits((f) => ({ ...f, [i]: state }))}
              mountRef={mountRef}
              boxRef={canvasBoxRef}
              showCanvas={canvasInStage}
              empty={<span>{T.noSlidesYet[lang]}</span>}
            />
            {!deck && (
              <div style={{ gridColumn: narrow ? "auto" : "2", marginTop: 4 }}>
                <ButtonPrimary onClick={() => void makeSlides()} disabled={deckBusy} style={{ minHeight: 44 }}>
                  {deckBusy ? T.makingSlides[lang] : T.makeSlides[lang]}
                </ButtonPrimary>
              </div>
            )}
            {sub === "look" ? (
              <ZoneLook
                lang={lang}
                theme={theme}
                onTheme={(t) => { setTheme(t); setDeck((d) => (d ? { ...d, theme: t } : d)); }}
                length={deckLength}
                onLength={(n) => { setDeckLength(n); if (deck) void makeSlides(n); }}
                hasDeck={Boolean(deck)}
              />
            ) : (
              <ZoneInspector
                lang={lang}
                writeLang={writeLang}
                deck={deck}
                current={current}
                onDeck={(next) => { remember(); setDeck(next); }}
                attention={attention}
                onChangeLine={() => void changeThisLine()}
                changing={changingLine}
                onUploadPicture={uploadPicture}
                pictureNotice={pictureNotice}
                onMove={move}
              />
            )}
          </div>
          )}
        </>
      )}

      {step === 4 && (
        <StageCard title={T.publishHead[lang]} align={rtlShell ? "right" : "left"} defaultOpen>
          {published && (
            <p role="status" aria-live="polite" style={{ fontFamily: "var(--ff-ui)", fontSize: 14, color: "var(--text-primary)", margin: "0 0 10px" }}>
              {T.postedHead[lang]} {T.postedHelp[lang]}{" "}
              {postUrl && (
                <a href={postUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--act)", fontWeight: 700 }}>
                  {T.seeOnLinkedIn[lang]}
                </a>
              )}
            </p>
          )}

          {confirmPanel}

          {/* ONE path, decided by what the member actually made. */}
          {!(format === "slides" && deck) ? (
            <>
              <p
                dir={rtlWrite ? "rtl" : "ltr"}
                style={{
                  whiteSpace: "pre-wrap", background: "var(--surface-subtle)",
                  border: "1px solid var(--border-default)", borderRadius: 12, padding: 12,
                  fontFamily: "var(--ff-ui)", fontSize: 14, lineHeight: rtlWrite ? 1.9 : 1.75,
                  textAlign: rtlWrite ? "right" : "left", color: "var(--text-primary)", margin: "0 0 14px",
                }}
              >
                {content}
              </p>
              {content.length > POST_MAX_CHARS && (
                <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 600, color: "var(--error)", margin: "0 0 10px" }}>
                  {T.overLimitHead[lang]} {content.length - POST_MAX_CHARS} {T.overLimitTail[lang]}
                </p>
              )}
              {!published && !confirmingPost && (
                <ButtonPrimary
                  onClick={requestPost}
                  disabled={!content.trim() || content.length > POST_MAX_CHARS || busy === "post"}
                  style={{ minHeight: 44 }}
                >
                  {T.postItNow[lang]}
                </ButtonPrimary>
              )}
            </>
          ) : (
            <>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
                {T.captionHead[lang]}
              </p>
              <p
                dir={rtlWrite ? "rtl" : "ltr"}
                style={{
                  whiteSpace: "pre-wrap", background: "var(--surface-subtle)",
                  border: "1px solid var(--border-default)", borderRadius: 12, padding: 12,
                  fontFamily: "var(--ff-ui)", fontSize: 14, lineHeight: rtlWrite ? 1.9 : 1.75,
                  textAlign: rtlWrite ? "right" : "left", color: "var(--text-primary)", margin: 0,
                }}
              >
                {content}
              </p>
              <div style={{ margin: "10px 0 18px" }}>
                <ButtonGhost onClick={() => void copyCaption()} style={{ minHeight: 44 }}>
                  {T.copyCaption[lang]}
                </ButtonGhost>
              </div>

              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-muted)", margin: "0 0 14px" }}>
                {T.whySlidesManual[lang]}
              </p>

              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>
                1 · {T.s4Get[lang]}
              </p>
              {exported ? (
                <ButtonGhost onClick={() => void exportFile()} disabled={busy === "export"} style={{ minHeight: 44 }}>
                  {busy === "export" ? T.exporting[lang] : T.exportFile[lang]}
                </ButtonGhost>
              ) : (
                <ButtonPrimary onClick={() => void exportFile()} disabled={busy === "export"} style={{ minHeight: 44 }}>
                  {busy === "export" ? T.exporting[lang] : T.exportFile[lang]}
                </ButtonPrimary>
              )}

              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "18px 0 8px" }}>
                2 · {T.s4Open[lang]}
              </p>
              <ButtonGhost onClick={() => void openLinkedIn()} style={{ minHeight: 44 }}>
                {T.openLinkedIn[lang]}
              </ButtonGhost>

              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "18px 0 6px" }}>
                3 · {T.s4Link[lang]}
              </p>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-muted)", margin: "0 0 10px" }}>
                {T.whyLink[lang]}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label htmlFor="studio-link" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                  {T.linkPlaceholder[lang]}
                </label>
                <input
                  id="studio-link"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder={T.linkPlaceholder[lang]}
                  style={{
                    flex: "1 1 280px", minHeight: 44, padding: "0 12px", borderRadius: 10,
                    background: "var(--surface-subtle)", border: "1px solid var(--border-default)",
                    fontFamily: "var(--ff-ui)", fontSize: 14, color: "var(--text-primary)",
                    textAlign: rtlShell ? "right" : "left",
                  }}
                />
                {exported ? (
                  <ButtonPrimary onClick={() => void saveLink()} disabled={!linkInput.trim() || busy === "link"} style={{ minHeight: 44 }}>
                    {busy === "link" ? T.savingLink[lang] : T.linkSave[lang]}
                  </ButtonPrimary>
                ) : (
                  <ButtonGhost onClick={() => void saveLink()} disabled={!linkInput.trim() || busy === "link"} style={{ minHeight: 44 }}>
                    {busy === "link" ? T.savingLink[lang] : T.linkSave[lang]}
                  </ButtonGhost>
                )}
              </div>
            </>
          )}
        </StageCard>
      )}

      {/* The deck mount, kept alive with real layout whenever a deck exists. */}
      {deck && !canvasInStage && (
        <div aria-hidden="true" style={{ position: "absolute", left: -99999, top: 0, width: canvasWidth }}>
          <StudioCanvas
            deck={deck}
            theme={theme}
            width={canvasWidth}
            current={current}
            onFit={(i, state) => setFits((f) => ({ ...f, [i]: state }))}
            mountRef={mountRef}
          />
        </div>
      )}
    </>,
  );
}