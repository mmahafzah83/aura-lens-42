/**
 * /studio — one room.
 *
 * A member chooses a subject, gets a post, turns it into slides and puts it on
 * LinkedIn without ever leaving this address. Nothing here navigates away, and
 * nothing here is shared with any other member-facing screen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ButtonPrimary, ButtonGhost } from "@/components/systemb";
import { loadStartCards, type StartCard } from "@/components/composer/startCards";
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

const POSTURE_KEY = "aura_studio_posture";
const DRAFT_KEY = "aura_studio_draft_v1";

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
  const [current, setCurrent] = useState(0);
  const [fits, setFits] = useState<Record<number, FitState>>({});
  const [changingLine, setChangingLine] = useState(false);
  const [pictureNotice, setPictureNotice] = useState<string | null>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  /** In flight. Never a tick — the action has not finished. */
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  /** Failures. Never a tick, never overwritten by an autosave. */
  /** Set when a draft came back, rendered once the language is known. */
  const [restoredFlag, setRestoredFlag] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [busy, setBusy] = useState<null | "post" | "save" | "export">(null);
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
    })();
    return () => { dead = true; };
  }, []);

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
        step?: unknown; format?: unknown;
      };
      let restoredAnything = false;
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
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ content, deck, choice, writeLang, step, format }));
      // Success channel only. A failure message is never written from here.
      setStatus(T.savedMoment[lang]);
    } catch { /* quota never blocks editing */ }
  }, [content, deck, choice, writeLang, lang, step, format]);

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
  useEffect(() => {
    if (!userId) return;
    let dead = false;
    setCardsLoading(true);
    (async () => {
      const { cards: rows } = await loadStartCards(userId);
      if (dead) return;
      setCards(rows);
      setCardsLoading(false);
      if (posture === "delegator" && rows[0]) {
        setChoice({ id: rows[0].signalId, title: rows[0].title, insight: rows[0].insight });
      }
    })();
    return () => { dead = true; };
  }, [userId, posture]);

  /* ---------- step 2: the words ----------------------------------- */
  const generate = useCallback(async (picked?: Choice) => {
    const target = picked ?? choice;
    if (!target) return;
    const runId = ++genRunId.current;
    const useLang = writeLang;
    setGenError(null);
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
    } catch {
      if (runId === genRunId.current) setGenError("failed");
    } finally {
      window.clearTimeout(timer);
      if (runId === genRunId.current) { setGenerating(false); setBusyMessage(null); }
    }
  }, [choice, writeLang, remember, lang]);

  /* ---------- the draft row --------------------------------------- */
  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (!userId || !content.trim()) return null;
    if (draftId) {
      await supabase.from("linkedin_posts").update({ post_text: content }).eq("id", draftId);
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
        source_signal_id: choice?.id || null,
        source_metadata: {
          source: "studio",
          topic: choice?.title || typedTopic || null,
          language: writeLang,
          _language: writeLang,
          signal_ids: choice?.id ? [choice.id] : [],
        },
      } as any)
      .select("id")
      .single();
    if (error) return null;
    const id = (ins as any)?.id as string;
    setDraftId(id);
    return id;
  }, [userId, content, draftId, choice, typedTopic, writeLang]);

  /* ---------- step 3: the slides, right here ---------------------- */
  const makeSlides = useCallback(async (lengthOverride?: 5 | 7 | 10) => {
    if (!choice?.id || !content.trim()) return;
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
        setDeckFailures((result?.failures ?? ["A slide did not come out right."]).map(plainFailure));
        return;
      }
      const parsed = DeckIRSchema.safeParse(result.deck);
      if (!parsed.success) { setDeckFailures([plainFailure("schema")]); return; }
      remember();
      setDeck({ ...parsed.data, theme });
      setCurrent(0);
      setFits({});
    } catch {
      setDeckFailures([plainFailure("failed")]);
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
    setBusyMessage(T.posting[lang]);
    const id = await saveDraft();
    if (!id) { setBusy(null); setBusyMessage(null); setProblem(T.postFailed[lang]); return; }
    const { data, error } = await supabase.functions.invoke("linkedin-publish", {
      body: { postId: id, advisory: true },
    });
    setBusy(null);
    setBusyMessage(null);
    const payload = data as any;
    const message = `${payload?.error || ""} ${error?.message || ""}`.toLowerCase();
    if (payload?.success === true) {
      setPostUrl((payload?.postUrl as string) || null);
      setPublished(true);
      setStatus(T.postedHelp[lang]);
      return;
    }
    setProblem(message.includes("not connected") ? T.notConnected[lang] : T.postFailed[lang]);
  }, [saveDraft, lang]);

  const keepForLater = useCallback(async () => {
    setBusy("save");
    setProblem(null);
    const id = await saveDraft();
    setBusy(null);
    if (id) setStatus(T.savedForLater[lang]);
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
      setStatus(T.exportDone[lang]);
    } catch {
      setProblem(T.exportFailed[lang]);
    } finally {
      setBusy(null);
      setBusyMessage(null);
    }
  }, [deck, lang]);

  const openLinkedIn = useCallback(async () => {
    try { await navigator.clipboard.writeText(content); setStatus(T.captionCopied[lang]); } catch { /* nothing copied */ }
    window.open("https://www.linkedin.com/feed/", "_blank", "noopener,noreferrer");
  }, [content, lang]);

  const saveLink = useCallback(async () => {
    const url = linkInput.trim();
    if (!/linkedin\.com/i.test(url)) { setProblem(T.linkBad[lang]); return; }
    const id = draftId ?? (await saveDraft());
    if (!id) { setProblem(T.postFailed[lang]); return; }
    setProblem(null);
    await supabase
      .from("linkedin_posts")
      .update({
        tracking_status: "published",
        source_metadata: {
          source: "studio",
          topic: choice?.title || typedTopic || null,
          language: writeLang,
          _language: writeLang,
          signal_ids: choice?.id ? [choice.id] : [],
          external_url: url,
        },
      } as any)
      .eq("id", id);
    setPublished(true);
    setPostUrl(url);
    setStatus(T.linkSaved[lang]);
  }, [linkInput, draftId, saveDraft, choice, typedTopic, writeLang, lang]);

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

  const cameFromLine = useMemo(() => {
    const slide = deck?.slides[Math.min(current, (deck?.slides.length ?? 1) - 1)];
    return slide ? bestSourceLine(content, slide.slots) : "";
  }, [deck, current, content]);

  /**
   * The exporter reads real DOM nodes, so the deck mount must exist with real
   * layout for as long as a deck exists — not only while step 3 is on screen.
   * When the stage is not showing it, the same mount is rendered off to the
   * side of the viewport (never display:none, never visibility:hidden).
   */
  const canvasInStage = step === 3 && showing === "slides" && Boolean(deck);

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
      onClick={() => {
        setSub(key);
        if (key === "build") setShowing(deck ? "slides" : "post");
      }}
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

  const writeArea = (
    <>
      {generating && (
        <p role="status" aria-live="polite" style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--machine-text)", background: "var(--machine-tint)", padding: "10px 12px", borderRadius: 10, margin: "0 0 12px" }}>
          {T.writing[lang]}
        </p>
      )}
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
      {confirmPanel}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <ButtonPrimary onClick={requestPost} disabled={!content.trim() || busy === "post" || confirmingPost} style={{ minHeight: 44 }}>
          {T.optPost[lang]}
        </ButtonPrimary>
        <ButtonGhost onClick={() => void makeSlides()} disabled={!content.trim() || !choice?.id} style={{ minHeight: 44 }}>
          {T.optSlides[lang]}
        </ButtonGhost>
        <ButtonGhost onClick={() => void keepForLater()} disabled={!content.trim()} style={{ minHeight: 44 }}>
          {T.optLater[lang]}
        </ButtonGhost>
      </div>
      {!choice?.id && content.trim() && (
        <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-muted)", margin: "8px 0 0" }}>
          {T.typedTopicNoSlides[lang]}
        </p>
      )}
    </>
  );

  return shell(
    <>
      <TopBar
        lang={lang}
        posture={posture}
        firstName={firstName}
        avatarUrl={avatarUrl}
        onChangePosture={() => setAskingPosture(true)}
      />

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
        <ButtonGhost onClick={() => void keepForLater()} style={{ minHeight: 44 }}>
          {T.saveAndClose[lang]}
        </ButtonGhost>
        <ButtonPrimary onClick={() => setStep((s) => Math.min(4, s + 1))} disabled={step >= 4} style={{ minHeight: 44 }}>
          {T.continue[lang]} →
        </ButtonPrimary>
      </div>

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
                <div
                  key={c.signalId}
                  style={{
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
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                    <ButtonPrimary
                      onClick={() => {
                        const next = { id: c.signalId, title: c.title, insight: c.insight };
                        setChoice(next);
                        setTypedTopic("");
                        void generate(next);
                      }}
                      style={{ minHeight: 44 }}
                    >
                      {T.chooseUse[lang]}
                    </ButtonPrimary>
                    <span style={{ fontFamily: "var(--ff-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                      {c.fragmentCount} {T.sources[lang]}
                    </span>
                  </div>
                </div>
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
                onChange={(e) => { setTypedTopic(e.target.value); if (e.target.value) setChoice(null); }}
                placeholder={T.chooseOwnPlaceholder[lang]}
                style={{
                  flex: "1 1 260px", minHeight: 44, padding: "0 12px", borderRadius: 10,
                  background: "var(--surface-subtle)", border: "1px solid var(--border-default)",
                  fontFamily: "var(--ff-ui)", fontSize: 14, color: "var(--text-primary)",
                  textAlign: rtlShell ? "right" : "left",
                }}
              />
              <ButtonGhost
                disabled={!typedTopic.trim()}
                onClick={() => {
                  const next = { id: null, title: typedTopic.trim(), insight: "" };
                  setChoice(next);
                  void generate(next);
                }}
                style={{ minHeight: 44 }}
              >
                {T.chooseUse[lang]}
              </ButtonGhost>
            </div>
          </div>

          {posture === "author" && (
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
              <div style={{ marginTop: 10 }}>
                <ButtonPrimary
                  disabled={!pasted.trim()}
                  onClick={() => {
                    remember();
                    setChoice((c) => c ?? { id: null, title: typedTopic.trim() || pasted.trim().slice(0, 60), insight: "" });
                    setContent(fixArabicDirectionalSymbols(stripMarkdown(pasted), writeLang));
                    setStep(2);
                    setSub("build");
                  }}
                  style={{ minHeight: 44 }}
                >
                  {T.pasteUse[lang]}
                </ButtonPrimary>
              </div>
            </div>
          )}
        </StageCard>
      )}

      {step === 2 && (
        <StageCard
          title={T.writeHead[lang]}
          subtitle={T.writeHelp[lang]}
          align={rtlShell ? "right" : "left"}
          defaultOpen={posture !== "delegator" || content.length > 0}
          collapsible
        >
          {writeArea}
        </StageCard>
      )}

      {step === 3 && (
        <>
          {deckBusy && (
            <p role="status" aria-live="polite" style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--machine-text)", background: "var(--machine-tint)", padding: "10px 12px", borderRadius: 10, margin: "0 0 12px" }}>
              {T.makingSlides[lang]}
            </p>
          )}
          {deckFailures.length > 0 && (
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: narrow ? "1fr" : "200px 1fr 300px",
              gap: 12,
              alignItems: "start",
            }}
          >
            <ZonePiece
              lang={lang}
              writeLang={writeLang}
              subject={choice?.title || typedTopic}
              showing={showing}
              onShowing={setShowing}
              slideCount={deck?.slides.length ?? 0}
              todo={{
                words: content.trim().length > 0,
                slides: Boolean(deck),
                cover: Boolean(deck?.slides.some((s) => s.slots.media?.src)),
                published,
              }}
              postText={content}
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
              mode={showing}
              postEditor={writeArea}
              showCanvas={canvasInStage}
              empty={
                <span>
                  {content.trim() && choice?.id ? (
                    <ButtonPrimary onClick={() => void makeSlides()} style={{ minHeight: 44 }}>
                      {T.makeSlides[lang]}
                    </ButtonPrimary>
                  ) : (
                    choice?.id ? T.slidesNeedPost[lang] : T.typedTopicNoSlides[lang]
                  )}
                </span>
              }
            />
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
                cameFromLine={cameFromLine}
              />
            )}
          </div>
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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <ButtonPrimary onClick={requestPost} disabled={!content.trim() || busy === "post" || confirmingPost} style={{ minHeight: 44 }}>
              {T.publishAsPost[lang]}
            </ButtonPrimary>
          </div>

          <h3 style={{ fontFamily: "var(--ff-ui)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>
            {T.slidesPublishHead[lang]}
          </h3>
          <ol style={{ margin: 0, paddingInlineStart: 20, display: "grid", gap: 8 }}>
            <li style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{T.slidesStep1[lang]}</strong>
              {" — "}{T.fileSteps[lang]} {deck?.slides.length ?? 0} {T.slidesWord[lang]}.
            </li>
            <li style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{T.slidesStep2[lang]}</strong>
              {" — "}{T.captionNote[lang]}
            </li>
            <li style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{T.slidesStep3[lang]}</strong>
              {" — "}{T.linkNote[lang]}
            </li>
          </ol>
          <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-muted)", margin: "10px 0 14px" }}>
            {T.slidesWhy[lang]}
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <ButtonGhost onClick={() => void exportFile()} disabled={!deck || busy === "export"} style={{ minHeight: 44 }}>
              {busy === "export" ? T.exporting[lang] : T.exportFile[lang]}
            </ButtonGhost>
            <ButtonGhost onClick={() => void openLinkedIn()} style={{ minHeight: 44 }}>
              {T.openLinkedIn[lang]}
            </ButtonGhost>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
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
            <ButtonPrimary onClick={() => void saveLink()} disabled={!linkInput.trim()} style={{ minHeight: 44 }}>
              {T.linkSave[lang]}
            </ButtonPrimary>
          </div>
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

      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderRadius: 14,
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
        }}
      >
        <span style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-secondary)" }}>
          {T.changedMind[lang]}{" "}
          <button
            type="button"
            onClick={undo}
            disabled={undoStack.length === 0}
            style={{ background: "transparent", border: 0, cursor: "pointer", minHeight: 44, fontFamily: "var(--ff-ui)", fontSize: 12.5, fontWeight: 700, color: "var(--act)" }}
          >
            {T.undo[lang]}
          </button>
          {" · "}
          {T.undoBeforeSlides[lang]}
        </span>
        <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <ButtonGhost onClick={() => void exportFile()} disabled={!deck || busy === "export"} style={{ minHeight: 44 }}>
            {T.exportFile[lang]}
          </ButtonGhost>
          <ButtonPrimary onClick={() => setStep(4)} disabled={step === 4} style={{ minHeight: 44 }}>
            {T.putOnLinkedIn[lang]} →
          </ButtonPrimary>
        </span>
      </div>
    </>,
  );
}