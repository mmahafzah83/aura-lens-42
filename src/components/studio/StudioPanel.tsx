/**
 * StudioPanel — one room, rendered as ordinary page content INSIDE the Aura
 * shell (Dashboard tab `studio`).
 *
 * A member chooses a subject, gets a post, turns it into slides and puts it on
 * LinkedIn without ever leaving the page. This component renders no app-level
 * navigation, wordmark, avatar or member name — the shell owns all of that —
 * and it never sets a page height, page padding or a page-level `dir`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
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
import { useIsPhone, PHONE_MAX_WIDTH, EXPORT_WIDTH, clampCanvasWidth } from "@/components/studio/usePhone";
import { T, attentionText, pictureProblem, postureLabel, startReason, type Lang, type Posture } from "@/components/studio/strings";
import { deriveDone, plausibleLinkedInUrl } from "@/components/studio/journeyState";

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
 * `composer_opened` is one event per PIECE per session. The studio is a tab
 * now, so it unmounts on every navigation — a ref guard would reset each time
 * and inflate the number. The session, not the component, remembers.
 */
const OPEN_KEY = "aura_studio_opened_v1";
function alreadyOpened(pieceKey: string): boolean {
  try {
    const seen = JSON.parse(sessionStorage.getItem(OPEN_KEY) || "[]") as unknown;
    const list = Array.isArray(seen) ? (seen as string[]) : [];
    if (list.includes(pieceKey)) return true;
    sessionStorage.setItem(OPEN_KEY, JSON.stringify([...list, pieceKey].slice(-50)));
    return false;
  } catch {
    return false;
  }
}

/**
 * P1 — THE GATE SPEAKS IN OUR SENTENCES, NEVER IN THE JUDGE'S.
 *
 * The server sends a CATEGORY, never prose. Four sentences exist and one of
 * them is chosen. No string produced by the judge — no weakness, no verdict,
 * no score — can reach a member through this function, because no string
 * produced by the judge is an input to it.
 */
export type GateCategory = "unsupported_number" | "language" | "generic" | "other";

function gateSentence(category: unknown, lang: Lang): string {
  switch (category) {
    case "unsupported_number":
      return T.gateUnsupportedNumber[lang];
    case "language":
      return T.gateLanguage[lang];
    case "generic":
      return T.gateGeneric[lang];
    default:
      // No category, or one we do not know: the last sentence stands.
      return T.gateOther[lang];
  }
}

/**
 * P3 — how long each kind of work normally takes, in seconds. The bar fills
 * toward this and the countdown reads from it. A guess that ends beats a
 * decoration that loops.
 */
function etaFor(message: string, lang: Lang): number {
  // W10 — the number and the words must agree. `T.writing` says 20 seconds.
  if (message === T.writing[lang]) return 20;
  if (message === T.makingSlides[lang]) return 45;
  if (message === T.posting[lang]) return 20;
  if (message === T.exporting[lang] || message === T.exportSettling[lang]) return 15;
  if (message === T.changingLine[lang]) return 15;
  return 12;
}

/** A relative "saved …" stamp that never leaks English into the Arabic shell. */
function savedAgo(dateStr: string, lang: Lang): string {
  if (lang !== "ar") return formatSmartDate(dateStr);
  const d = new Date(dateStr);
  if (!dateStr || isNaN(d.getTime())) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `قبل ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `قبل ${days} يوم`;
  return d.toLocaleDateString("ar", { month: "short", day: "numeric" });
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

/**
 * C2 — the shell hands the studio its context. Every entry point in the app
 * (Home, My Story, Signals, Overnight, Library, TrendDetail, lifecycle email)
 * already computes these in Dashboard; the studio honours them.
 */
export interface StudioPanelProps {
  signalPrefill?: any;
  onSignalPrefillConsumed?: () => void;
  draftPrefill?: any;
  onDraftPrefillConsumed?: () => void;
  onOpenCapture?: () => void;
}

export default function StudioPanel({
  signalPrefill,
  onSignalPrefillConsumed,
  draftPrefill,
  onDraftPrefillConsumed,
  onOpenCapture,
}: StudioPanelProps = {}) {
  /* ---------- session and preferences ---------------------------- */
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [lang, setLang] = useState<Lang>("en");
  const [writeLang, setWriteLang] = useState<Lang>("en");

  const [posture, setPosture] = useState<Posture>(() => readStoredPosture() ?? "editor");
  const [askingPosture, setAskingPosture] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  /* ---------- the piece ------------------------------------------ */
  /**
   * W1 — the FIRST step is a property of the posture, never a constant. The
   * stored posture is read synchronously so the very first paint is already
   * the right room: delegator and author open at step 2, editor at step 1.
   */
  const [step, setStep] = useState<number>(() => (readStoredPosture() === "editor" || !readStoredPosture() ? 1 : 2));
  const [sub, setSub] = useState<SubNav>("build");
  const [format, setFormat] = useState<Format | null>(null);
  /**
   * W3 — a format is only "chosen" when the MEMBER chose it, or when a deck
   * exists to prove it. Opening an ordinary draft is not a decision, so it may
   * never tick step 3. This flag is persisted rather than inferred.
   */
  const [formatChosen, setFormatChosen] = useState(false);

  const [cards, setCards] = useState<StartCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [typedTopic, setTypedTopic] = useState("");
  const [pasted, setPasted] = useState("");

  const [content, setContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<null | "failed" | "session">(null);
  const genRunId = useRef(0);
  /** The exact text Aura last generated. Anything else is the member's own. */
  const generatedTextRef = useRef<string | null>(null);
  /** Asked before a language rewrite would replace words the member owns. */
  const [askLangSwitch, setAskLangSwitch] = useState<Lang | null>(null);
  /**
   * The linkedin_posts row this piece lives in. Held in a ref, not state, so an
   * async sequence never re-reads a null captured at render and inserts twice.
   */
  const postRowRef = useRef<string | null>(null);

  const [deck, setDeck] = useState<DeckIR | null>(null);
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);
  const [deckLength, setDeckLength] = useState<5 | 7 | 10>(7);
  const [deckBusy, setDeckBusy] = useState(false);
  const [deckFailures, setDeckFailures] = useState<string[]>([]);
  /** The words these slides were built from. Lets us say when they drift apart. */
  const [deckSource, setDeckSource] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [fits, setFits] = useState<Record<number, FitState>>({});
  /** The same reports, readable from inside an await loop without going stale. */
  const fitsRef = useRef<Record<number, FitState>>({});
  fitsRef.current = fits;
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
  /**
   * No state may disable the action that clears it: editing the words is
   * exactly the signal that lifts the block. The gate re-runs server-side.
   */
  const changeContent = useCallback((next: string) => {
    setContent(next);
    setNotReady(null);
  }, []);
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
  /** The member's own LinkedIn address for this post, stored. */
  const [linkSaved, setLinkSaved] = useState(false);
  /** The member published past the gate. Never carried into the next piece. */
  const [overrode, setOverrode] = useState(false);

  /* Guarded transitions. Nothing destructive happens without one of these. */
  const [pendingSubject, setPendingSubject] = useState<Choice | null>(null);
  const [pendingFormat, setPendingFormat] = useState<Format | null>(null);
  const [askEditAfterPublish, setAskEditAfterPublish] = useState(false);

  /**
   * WHERE A POSTURE OPENS. A posture changes who writes, where the journey
   * starts and what Aura does unasked — never what exists on the screen.
   */
  const entryStep = (p: Posture): number => (p === "editor" ? 1 : 2);
  const postureRef = useRef<Posture>("editor");
  postureRef.current = posture;

  /**
   * P1c — set the moment the member CHOOSES a writing language. From then on a
   * language complaint from the gate is the tool contradicting itself, so it
   * is suppressed entirely.
   */
  const langChosenRef = useRef(false);

  const mountRef = useRef<HTMLDivElement | null>(null);
  /**
   * J4 — the mount the PDF is rasterised from. It is ALWAYS off-screen and
   * ALWAYS `EXPORT_WIDTH` wide, so the preview width (which follows the
   * screen) can never lower the resolution of the file a member downloads.
   */
  const exportMountRef = useRef<HTMLDivElement | null>(null);
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(520);
  const [narrow, setNarrow] = useState(false);
  /**
   * R1 — there is no phone BRANCH any more. The same tree renders at every
   * width; this boolean only chooses a comfortable field size on small
   * screens, so iOS does not zoom the page when a field takes focus.
   */
  const isPhone = useIsPhone();
  const rtlShell = lang === "ar";
  const rtlWrite = writeLang === "ar";

  /* ---------- boot ------------------------------------------------ */
  /**
   * N2 — ONCE PER MOUNT. This effect seeds the language from the profile.
   * Dashboard strips `?draft=` after resolving a deep link, which mutates
   * `searchParams`; if this effect depended on it, the re-run would clobber
   * the language `openDraft` just set from the row. Query parameters are
   * read from `window.location.search` at first run instead.
   * RULE: an effect that seeds state from a profile runs once; an effect that
   * reacts to the URL must not also seed state.
   */
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const firstQuery = new URLSearchParams(window.location.search);
    let dead = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (dead) return;
      if (!session) { setReady(true); return; }
      setUserId(session.user.id);
      const { data: profile } = await supabase
        .from("diagnostic_profiles")
        .select("content_language")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (dead) return;
      const seeded: Lang = (profile as any)?.content_language === "ar" ? "ar" : "en";
      setLang(seeded);
      setWriteLang(seeded);
      setReady(true);
      // The composer opening is the first number the company reads.
      // Once per session: a query-param change must never inflate the metric.
      // A `?draft=` deep link is opened by Dashboard and reported by
      // `openDraft`, so the boot emit stands aside — one open, one event.
      if (!firstQuery.has("draft") && !alreadyOpened("new")) {
        void track("composer_opened", {
          source: "studio",
          signal_id: firstQuery.get("signal") || null,
          move_state: null,
        });
      }
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

  /**
   * The posture's ENTRY STEP, applied once, and only over an empty piece.
   * A posture never moves a member off work they already have.
   */
  const enteredRef = useRef(false);
  useEffect(() => {
    if (enteredRef.current) return;
    if (!ready || askingPosture) return;
    enteredRef.current = true;
    if (!content.trim() && !deck && !pendingRestore) setStep(entryStep(posture));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, askingPosture, posture]);

  /* ---------- responsive ------------------------------------------ */
  useEffect(() => {
    const measure = () => {
      setNarrow(window.innerWidth < 900);
      const w = canvasBoxRef.current?.clientWidth ?? 520;
      const gutter = window.innerWidth < PHONE_MAX_WIDTH ? 0 : 28;
      setCanvasWidth(clampCanvasWidth(w - gutter));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [deck, step, isPhone]);

  /* ---------- bring back the piece -------------------------------- */
  /**
   * THE RESTORE — NEVER SILENT.
   *
   * A saved draft is read on mount but is NEVER applied. It is held here,
   * announced in one line, and only becomes state when the member says so.
   * RULE: state the member did not create in this session is announced,
   * never assumed.
   */
  type SavedPiece = {
    content?: unknown; deck?: unknown; choice?: unknown; writeLang?: unknown;
    step?: unknown; format?: unknown; draftId?: unknown; draftSource?: unknown;
    postRowId?: unknown; savedAt?: unknown;
  };
  const [pendingRestore, setPendingRestore] = useState<SavedPiece | null>(null);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedPiece;
      const hasWords = typeof saved.content === "string" && saved.content.trim().length > 0;
      const hasDeck = Boolean(saved.deck);
      // Only real work is worth announcing. Anything else is not progress.
      if (!hasWords && !hasDeck) { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } return; }
      setPendingRestore(saved);
    } catch { /* an unreadable draft is simply not restored */ }
  }, []);

  /** "Carry on" — and only then does the saved work become this session's. */
  const carryOnRestore = useCallback(() => {
    const saved = pendingRestore;
    if (!saved) return;
    setPendingRestore(null);
    if (typeof saved.draftId === "string" && saved.draftId) setDraftId(saved.draftId);
    if (typeof saved.postRowId === "string" && saved.postRowId) postRowRef.current = saved.postRowId;
    if (saved.draftSource === "content_items" || saved.draftSource === "linkedin_posts") {
      setDraftSource(saved.draftSource);
    }
    if (typeof saved.content === "string") setContent(saved.content);
    if (saved.deck) {
      // A corrupt deck is ignored, never thrown.
      const parsed = DeckIRSchema.safeParse(saved.deck);
      if (parsed.success) { setDeck(parsed.data); setTheme(parsed.data.theme as ThemeName); }
    }
    if (saved.choice && typeof saved.choice === "object") {
      const c = saved.choice as Choice;
      if (typeof c.title === "string") setChoice({ id: c.id ?? null, title: c.title, insight: c.insight ?? "" });
    }
    if (saved.writeLang === "ar" || saved.writeLang === "en") setWriteLang(saved.writeLang);
    if (saved.format === "post" || saved.format === "slides") setFormat(saved.format);
    const s = Number(saved.step);
    setStep(s >= 1 && s <= 4 ? s : 2);
    setRestoredFlag(true);
  }, [pendingRestore]);

  useEffect(() => {
    if (!restoredFlag || !ready) return;
    setStatus(T.draftRestored[lang]);
    setRestoredFlag(false);
  }, [restoredFlag, ready, lang]);

  /* ---------- keep the piece ------------------------------------- */
  /**
   * The studio is a TAB. One tap on any navigation item unmounts it, so a
   * debounced save must always be able to flush the very latest values
   * synchronously. `liveRef` holds them; `persistNow` writes them.
   */
  const liveRef = useRef({ content, deck, choice, writeLang, step, format, draftId, draftSource });
  liveRef.current = { content, deck, choice, writeLang, step, format, draftId, draftSource };

  const persistNow = useCallback((overrides?: Partial<typeof liveRef.current>) => {
    const v = { ...liveRef.current, ...(overrides || {}) };
    // Written straight through, so a caller mid-update never persists stale words.
    liveRef.current = v;
    if (!v.content && !v.deck && !postRowRef.current) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ ...v, postRowId: postRowRef.current, savedAt: new Date().toISOString() }),
      );
    } catch { /* quota never blocks editing */ }
  }, []);

  useEffect(() => {
    if (!content && !deck) return;
    // Debounced, and silent: `T.editHint` already tells the member their
    // changes save themselves, so no live region fires on every keystroke.
    const t = window.setTimeout(persistNow, 1500);
    return () => window.clearTimeout(t);
  }, [content, deck, choice, writeLang, step, format, draftId, draftSource, persistNow]);

  /* Backgrounding the tab or closing the page is also a disappearance. */
  useEffect(() => {
    const flush = () => persistNow();
    const onHide = () => { if (document.visibilityState === "hidden") persistNow(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      // RULE: a debounced save always flushes before the component can vanish.
      // Tapping a navigation item unmounts this tab; the last words still land.
      persistNow();
    };
  }, [persistNow]);

  /* A success note fades; a problem does not. */
  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(t);
  }, [status]);

  /**
   * P5 — UNDO IS GONE.
   *
   * It restored a snapshot that was not always the last member-visible change,
   * so it sometimes worked and sometimes did not. A control that sometimes
   * works is worse than no control. "Save and come back later" is the honest
   * way back, and it is still here.
   */

  /**
   * P1a — one place decides what the member is told, and whether they are told
   * anything at all. `category` comes from the server; nothing else does.
   */
  const applyGate = useCallback((category: unknown) => {
    if (category === "language" && langChosenRef.current) {
      // The member chose this language. We do not argue with their choice.
      setNotReady(null);
      return;
    }
    setNotReady(gateSentence(category, lang));
  }, [lang]);

  /**
   * N1 — ONE reset for a NEW piece.
   *
   * RULE: any identifier that binds the interface to a database row must be
   * cleared at the exact moment the subject changes. A stale row id is worse
   * than no row id — `ensurePostRow` would hand back the PREVIOUS piece's
   * `linkedin_posts` id, `syncRowToScreen` would overwrite it with the new
   * words and `finalisePublished` would re-stamp it, destroying the published
   * record of the piece before it.
   *
   * Called only when a NEW piece begins. Never while merely editing.
   */
  const startNewPiece = useCallback((next?: { choice?: Choice | null; format?: Format | null }) => {
    setContent("");
    setDeck(null);
    setDeckSource(null);
    setDeckFailures([]);
    setCurrent(0);
    setFits({});
    setExported(false);
    setChoice(next?.choice ?? null);
    setTypedTopic("");
    setPasted("");
    setFormat(next?.format ?? null);
    setStep(entryStep(postureRef.current));
    setSub("build");
    setDraftId(null);
    setDraftSource(null);
    postRowRef.current = null;
    originDraftRef.current = null;
    generatedTextRef.current = null;
    setPublished(false);
    setPostUrl(null);
    setLinkInput("");
    setLinkSaved(false);
    setOverrode(false);
    setPendingSubject(null);
    setPendingFormat(null);
    setAskEditAfterPublish(false);
    setNotReady(null);
    setProblem(null);
    setStatus(null);
    setGenError(null);
    setConfirmingPost(false);
    setAskReplace(false);
    setAskLangSwitch(null);
    langChosenRef.current = false;
    setPendingRestore(null);
    preselectedRef.current = Boolean(next?.choice);
    draftPrefillRef.current = null;
    liveRef.current = {
      content: "", deck: null, choice: next?.choice ?? null, writeLang: liveRef.current.writeLang,
      step: entryStep(postureRef.current), format: next?.format ?? null, draftId: null, draftSource: null,
    };
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* quota never blocks editing */ }
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
      setDraftId(d.id);
      setDraftSource(d._source);
      // A new piece is in the room: forget the row the last one created.
      postRowRef.current = d._source === "linkedin_posts" ? d.id : null;
      originDraftRef.current = null;
      generatedTextRef.current = null;
      persistNow({
        content: d.body,
        deck: null,
        writeLang: d.language,
        step: 2,
        format: d.type === "carousel" ? "slides" : "post",
        draftId: d.id,
        draftSource: d._source,
        choice: { id: d.signalId ?? null, title: d.title || d.topic || "", insight: "" },
      });
      setContent(d.body);
      setWriteLang(d.language);
      setNotReady(null);
      // N1 — a draft is a different piece: nothing from the last one survives.
      setPublished(false);
      setPostUrl(null);
      setLinkInput("");
      setLinkSaved(false);
      // The member has explicitly opened work: no stale draft may be offered.
      setPendingRestore(null);
      setDeck(null);
      setDeckSource(null);
      setExported(false);
      setProblem(null);
      // N4 — a carousel draft opens on the deck, not on the words.
      setFormat(d.type === "carousel" ? "slides" : "post");
      if (d.signalId || d.title || d.topic) {
        setChoice({ id: d.signalId ?? null, title: d.title || d.topic || "", insight: "" });
      }
      setStep(2);
      setStatus(T.draftOpened[lang]);
      if (!alreadyOpened(`draft:${d.id}`)) {
        void track("composer_opened", { source, signal_id: d.signalId ?? null, move_state: "drafted" });
      }
    },
    [lang, persistNow],
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

  /**
   * DELEGATOR — Aura prepares, it does not spend.
   *
   * The subject is picked for the member, and if the overnight run already
   * wrote about that subject the waiting draft is loaded. Nothing is
   * generated: zero-click generation on entry spends a member's time and
   * money on something they did not ask for.
   */
  const delegatorPreparedRef = useRef(false);
  useEffect(() => {
    if (posture !== "delegator" || delegatorPreparedRef.current) return;
    if (draftsLoading || !choice?.id || content.trim() || pendingRestore) return;
    delegatorPreparedRef.current = true;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const waiting = drafts.find(
      (d) => d.signalId === choice.id && new Date(d.created_at).getTime() > cutoff,
    );
    if (waiting) void openDraft(waiting, "studio_overnight");
  }, [posture, draftsLoading, drafts, choice, content, pendingRestore, openDraft]);

  /**
   * C3 — ONE owner of `?draft=`. Dashboard resolves the row (from BOTH
   * `content_items` and `linkedin_posts`, honouring `src=`) and hands it here
   * as `draftPrefill`. The studio no longer reads or deletes the parameter.
   */
  const draftPrefillRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !draftPrefill?.id) return;
    if (draftPrefillRef.current === draftPrefill.id) return;
    draftPrefillRef.current = draftPrefill.id;
    (async () => {
      const d: StudioDraft = {
        id: draftPrefill.id,
        body: draftPrefill.body || "",
        language: draftPrefill.language === "ar" ? "ar" : "en",
        type: draftPrefill.type === "carousel" ? "carousel" : draftPrefill.type === "framework" ? "framework" : "linkedin_post",
        topic: draftPrefill.topic ?? null,
        _source: draftPrefill._source === "content_items" ? "content_items" : "linkedin_posts",
        title: draftPrefill.title ?? draftPrefill.topic ?? null,
        created_at: draftPrefill.created_at ?? new Date().toISOString(),
        signalId: draftPrefill.signalId ?? null,
      };
      // The shell may hand over a stub; the full row is authoritative.
      const full = (await loadStudioDraft(d.id)) ?? (d.body ? d : null);
      if (!full) {
        setProblem(T.draftMissing[lang]);
        if (!alreadyOpened(`draft:${d.id}`)) {
          void track("composer_opened", { source: "lifecycle_email_missing", signal_id: null, move_state: null });
        }
        onDraftPrefillConsumed?.();
        return;
      }
      await openDraft(full, "dashboard_draft");
      onDraftPrefillConsumed?.();
    })();
  }, [userId, draftPrefill, openDraft, lang, onDraftPrefillConsumed]);

  /**
   * C2 — a subject handed over by Home, My Story, Signals or TrendDetail.
   * A carousel request lands on the deck format.
   *
   * N1 — an ARRIVING subject that is not the one on screen is a NEW piece:
   * reset everything first, so the row id of the piece just published can
   * never be reused for this one.
   */
  const choiceRef = useRef<Choice | null>(null);
  choiceRef.current = choice;
  useEffect(() => {
    if (!signalPrefill) return;
    const title: string = signalPrefill.topic || signalPrefill.signalTitle || signalPrefill.trendHeadline || "";
    const nextFormat: Format | null = signalPrefill.contentFormat === "carousel" ? "slides" : null;
    const cur = choiceRef.current;
    const same =
      Boolean(cur) &&
      (signalPrefill.signalId
        ? cur!.id === signalPrefill.signalId
        : Boolean(title) && cur!.title === title);
    if (title && !same) {
      startNewPiece({
        choice: { id: signalPrefill.signalId ?? null, title, insight: signalPrefill.context || "" },
        format: nextFormat,
      });
    } else if (title) {
      preselectedRef.current = true;
      setChoice({ id: signalPrefill.signalId ?? null, title, insight: signalPrefill.context || "" });
      setTypedTopic("");
      if (nextFormat) setFormat(nextFormat);
    } else if (nextFormat) {
      setFormat(nextFormat);
    }
    onSignalPrefillConsumed?.();
  }, [signalPrefill, onSignalPrefillConsumed, startNewPiece]);

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
  const generate = useCallback(async (picked?: Choice, langOverride?: Lang) => {
    const target = picked ?? choice;
    if (!target) return;
    const runId = ++genRunId.current;
    const useLang = langOverride ?? writeLang;
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
      const generated = fixArabicDirectionalSymbols(stripMarkdown(String(text)), useLang);
      setContent(generated);
      generatedTextRef.current = generated;
      // The gate already ran at generation. If it held the post, the words stay
      // fully editable and only the publish action waits.
      if (json?.blocked === true) {
        // Only a category is ever read. If this surface cannot supply one,
        // the last of our four sentences stands.
        applyGate(json?.gate_category ?? json?.quality_gate?.category);
      }
    } catch {
      if (runId === genRunId.current) setGenError("failed");
    } finally {
      window.clearTimeout(timer);
      if (runId === genRunId.current) { setGenerating(false); setBusyMessage(null); }
    }
  }, [choice, writeLang, lang, applyGate]);

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
          .update({ body: content, language: writeLang, ...(title ? { title } : {}) } as any)
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
    postRowRef.current = id;
    // An identifier that must survive a reload is written the moment it exists.
    persistNow();
    return id;
  }, [userId, content, draftId, draftSource, choice, writeLang, pieceTitle, pieceMeta, persistNow]);

  /**
   * Publishing to LinkedIn from a content_items draft needs a linkedin_posts
   * row. This makes one and remembers where the piece came from, so the
   * content_items twin can be retired the moment the post goes live.
   */
  const originDraftRef = useRef<{ id: string; source: "content_items" | "linkedin_posts" } | null>(null);
  const ensurePostRow = useCallback(async (): Promise<string | null> => {
    // Idempotent for the whole session: one piece, one row.
    if (postRowRef.current) return postRowRef.current;
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
      const newId = (ins as any)?.id as string;
      postRowRef.current = newId;
      persistNow();
      return newId;
    }
    const id = await saveDraft();
    if (id) { postRowRef.current = id; persistNow(); }
    return id;
  }, [draftId, draftSource, userId, content, choice, pieceTitle, pieceMeta, saveDraft, persistNow]);

  /**
   * INVARIANT — WHAT IS ON SCREEN IS WHAT PUBLISHES.
   *
   * `linkedin-publish` reads `post_text` from the row, not from the request, so
   * any edit made after the row was created would otherwise be silently
   * discarded — and a post held by the gate could never be fixed. Every path
   * that hands the member's work to an external service calls this first.
   * Always an UPDATE against a known row id, never an INSERT.
   */
  const syncRowToScreen = useCallback(
    async (id: string) => {
      const title = pieceTitle();
      const { data: existing } = await supabase
        .from("linkedin_posts")
        .select("source_metadata")
        .eq("id", id)
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
        .eq("id", id);
    },
    [content, choice, pieceTitle, pieceMeta],
  );

  /**
   * A published post must COUNT. The cockpit reads `published_at`, the archive
   * and the metric matcher read `post_url`. Both are written here, on both
   * publishing paths, and the existing source_metadata is merged, never lost.
   */
  const finalisePublished = useCallback(
    async (id: string, url: string | null, alreadyPublished = false) => {
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from("linkedin_posts")
        .select("source_metadata, published_at")
        .eq("id", id)
        .maybeSingle();
      const prev = ((existing as any)?.source_metadata as Record<string, unknown>) || {};
      // A replay of an already-published post must never reset real numbers,
      // nor stamp a client clock over the server's own publish time.
      const fresh = !alreadyPublished && !(existing as any)?.published_at;
      await supabase
        .from("linkedin_posts")
        .update({
          tracking_status: "published",
          ...(fresh ? { published_at: now } : {}),
          acquisition: "published_via_aura",
          ...(url ? { post_url: url, ...(fresh ? { published_confirmed_at: now } : {}) } : {}),
          ...(fresh
            ? {
                like_count: 0,
                comment_count: 0,
                repost_count: 0,
                engagement_score: 0,
                source_trust: 100,
                enriched_by: [],
                synced_at: now,
              }
            : {}),
          source_metadata: { ...prev, ...pieceMeta(), ...(url ? { external_url: url } : {}) },
        } as any)
        .eq("id", id);

      // The content_items twin is retired, or the invariant grows a duplicate.
      const origin = originDraftRef.current;
      if (origin?.source === "content_items") {
        await supabase.from("content_items").update({ status: "published" } as any).eq("id", origin.id);
      }
      // Spent. A later publish in this session must not re-mark this twin.
      originDraftRef.current = null;

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
    [pieceMeta, userId, content, writeLang],
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
      setDeck({ ...parsed.data, theme });
      setDeckSource(builtFrom);
      setExported(false);
      setCurrent(0);
      setFits({});
    } catch {
      setDeckFailures([T.connectionDropped[lang]]);
    } finally {
      setDeckBusy(false);
    }
  }, [choice, content, theme, deckLength, writeLang, lang, saveDraft]);

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
      setDeck({ ...parsed.data, theme });
    } catch {
      setProblem(T.lineChangeFailed[lang]);
    }
    finally { setChangingLine(false); setBusyMessage(null); }
  }, [deck, current, theme, lang]);

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
    setDeck((d) => (d ? setSlidePhoto(d, current, signed.signedUrl) : d));
    } catch {
      setPictureNotice(T.picUploadFailed[lang]);
    } finally {
      setBusyMessage(null);
    }
  }, [deck, current, lang]);

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
  const publishNow = useCallback(async (override = false) => {
    setConfirmingPost(false);
    setBusy("post");
    setProblem(null);
    setStatus(null);
    setNotReady(null);
    setBusyMessage(T.posting[lang]);
    const id = await ensurePostRow();
    if (!id) { setBusy(null); setBusyMessage(null); setProblem(T.postFailed[lang]); return; }
    // What is on screen is what publishes.
    await syncRowToScreen(id);
    const { data, error } = await supabase.functions.invoke("linkedin-publish", {
      // P1b — the member always decides. `advisory` publishes past the gate
      // and the override is recorded as its own event.
      body: { postId: id, advisory: override },
    });
    if (override) void track("gate_overridden", { signal_id: choice?.id || null, route: "linkedin" });
    if (override) setOverrode(true);
    setBusy(null);
    setBusyMessage(null);
    const payload = data as any;
    const message = `${payload?.error || ""} ${error?.message || ""}`.toLowerCase();
    if (payload?.success === true) {
      const url = (payload?.postUrl as string) || null;
      setPostUrl(url);
      setPublished(true);
      setStatus(T.postedHelp[lang]);
      await finalisePublished(id, url, payload?.already_published === true);
      void track("post_published", { signal_id: choice?.id || null, route: "linkedin" });
      return;
    }
    if (payload?.blocked === true) {
      // Held by the gate. The member stays here, with their words editable.
      const category = payload?.gate_category;
      // P1c — the member already chose this language. Their choice wins, and
      // the post goes out rather than being argued with.
      if (category === "language" && langChosenRef.current && !override) {
        void publishNowRef.current?.(true);
        return;
      }
      // One sentence, one place: the banner beside the words it concerns.
      applyGate(category);
      setStep(2);
      return;
    }
    setProblem(message.includes("not connected") ? T.notConnected[lang] : T.postFailed[lang]);
  }, [ensurePostRow, syncRowToScreen, finalisePublished, choice, lang, applyGate]);

  /** Lets the gate branch above retry itself once, with the override on. */
  const publishNowRef = useRef<((override?: boolean) => Promise<void>) | null>(null);
  publishNowRef.current = publishNow;

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

  /**
   * L3 — "settled" means: every slide has reported a fit AND two consecutive
   * readings a quarter of a second apart are identical. Reads a ref, never
   * stale state, and gives up after eight seconds rather than hanging.
   */
  const waitForSlidesSettled = useCallback(async (count: number) => {
    const deadline = Date.now() + 8000;
    let previous = "";
    while (Date.now() < deadline) {
      const snapshot = Array.from({ length: count }, (_, i) => fitsRef.current[i]);
      const signature = JSON.stringify(snapshot);
      if (snapshot.every(Boolean) && signature === previous) return true;
      previous = signature;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }, []);

  const exportFile = useCallback(async () => {
    // Never fails silently: if it cannot run, the member is told why.
    if (!deck) { setProblem(T.exportNoDeck[lang]); return; }
    // Always the fixed-width export mount, never the on-screen preview.
    if (!exportMountRef.current) { setProblem(T.exportNotReady[lang]); return; }
    setBusy("export");
    setProblem(null);
    setStatus(null);
    // L3 — the mount exists long before it has settled. Wait for every slide
    // to report a fit, and for those reports to stop changing, before any node
    // is collected — with the wait visible, and a plain sentence if it never
    // settles.
    setBusyMessage(T.exportSettling[lang]);
    try {
      const settled = await waitForSlidesSettled(deck.slides.length);
      if (!settled) { setProblem(T.exportNotReady[lang]); return; }
      setBusyMessage(T.exporting[lang]);
      const nodes = collectSlideNodes(exportMountRef.current);
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
  }, [deck, lang, waitForSlidesSettled]);

  const copyCaption = useCallback(async () => {
    try { await navigator.clipboard.writeText(content); setStatus(T.captionCopied[lang]); } catch { /* nothing copied */ }
  }, [content, lang]);

  const openLinkedIn = useCallback(() => {
    window.open("https://www.linkedin.com/feed/", "_blank", "noopener,noreferrer");
  }, []);

  const saveLink = useCallback(async () => {
    const url = linkInput.trim();
    if (!plausibleLinkedInUrl(url)) { setProblem(T.linkBad[lang]); return; }
    setBusy("link");
    setBusyMessage(T.savingLink[lang]);
    setProblem(null);
    const id = await ensurePostRow();
    if (!id) { setBusy(null); setBusyMessage(null); setProblem(T.postFailed[lang]); return; }
    // What is on screen is what publishes.
    await syncRowToScreen(id);
    await finalisePublished(id, url);
    void track("post_published", { signal_id: choice?.id || null, route: "manual" });
    setBusy(null);
    setBusyMessage(null);
    setPublished(true);
    setPostUrl(url);
    setLinkSaved(true);
    setStatus(T.linkSaved[lang]);
  }, [linkInput, ensurePostRow, syncRowToScreen, finalisePublished, choice, lang]);

  /** P9 — the onward choices. The shell owns navigation; we only ask. */
  const goTab = useCallback((tab: "library" | "influence") => {
    try {
      window.dispatchEvent(new CustomEvent("aura:switch-tab", { detail: { tab } }));
    } catch { /* navigation is never allowed to throw at a member */ }
  }, []);

  /* ---------- derived --------------------------------------------- */
  const attention = useMemo(() => {
    const fit = fits[current];
    if (fit?.failed) return attentionText(plainFailure(fit.reason ?? "A slide does not fit."), lang);
    return null;
  }, [fits, current, lang]);

  /* THE PIECE STATE. Derived, never stored twice, never inferred from the
     highest step visited. `deriveDone` owns every tick and clamps the
     step N / N−1 invariant. */
  /** `subject` is the ONE thing that makes step 1 done. Nothing else. */
  const subjectChosen = choice !== null;
  const wordsReady = content.trim().length > 0;
  const slidesMade = deck !== null;
  const formatChosen = format !== null;
  const finished = published || linkSaved;
  /**
   * "Write another about this subject" is only offered while that signal still
   * has material left to write from — it is only ever a ranked start card
   * while unused work remains behind it.
   */
  const subjectHasMore = Boolean(choice?.id) && cards.some((c) => c.signalId === choice?.id);
  const doneMap = useMemo(
    () => deriveDone({ subjectChosen, wordsReady, format, slidesMade, published, linkSaved }),
    [subjectChosen, wordsReady, format, slidesMade, published, linkSaved],
  );

  /**
   * The exporter reads real DOM nodes, so the deck mount must exist with real
   * layout for as long as a deck exists — not only while step 3 is on screen.
   * When the stage is not showing it, the same mount is rendered off to the
   * side of the viewport (never display:none, never visibility:hidden).
   */
  const canvasInStage = step === 3 && format === "slides" && Boolean(deck);
  /**
   * L4 — ONE WRITER OF FIT, AT ONE WIDTH.
   *
   * Fit is only ever reported by the off-screen export mount, which is always
   * `EXPORT_WIDTH` wide and always alive while a deck exists. The on-screen
   * previews render at whatever width the screen gives them and must never
   * write fit state, or "this line is a bit long" would appear at one step and
   * vanish at the next for the same deck.
   */
  const reportFit = useCallback((i: number, state: FitState) => {
    setFits((f) => ({ ...f, [i]: state }));
  }, []);
  /** The on-screen previews report nothing. */
  const ignoreFit = useCallback((_i: number, _s: FitState) => {}, []);

  /* ---------- content wrapper --------------------------------------
   * Page content only: no height, no page padding, no page background — the
   * Aura shell owns those. DIRECTION, however, is the panel's own: the shell
   * sets no `dir` anywhere, and this panel branches on `rtlShell` for text
   * alignment and arrow glyphs, so an Arabic member needs a real RTL box here
   * or they get half-RTL, which is worse than either.
   * R2 — the bottom padding that clears the shell navigation belongs to the
   * Dashboard tab container (`pb-[88px] md:pb-12`). The panel adds no second
   * offset of its own.
   */
  const shell = (children: React.ReactNode) => (
    <div
      dir={rtlShell ? "rtl" : "ltr"}
      style={{ maxWidth: 1360, margin: "0 auto" }}
    >
      {children}
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
          {posture !== "author" && (
          <button type="button" onClick={() => generate()} style={{ background: "transparent", border: 0, color: "var(--act)", fontWeight: 700, cursor: "pointer", minHeight: 44 }}>
            {T.tryAgain[lang]}
          </button>
          )}
        </p>
      )}
      <textarea
        value={content}
        onChange={(e) => changeContent(e.target.value)}
        rows={14}
        dir={rtlWrite ? "rtl" : "ltr"}
        disabled={published}
        placeholder={posture === "author" ? T.authorPlaceholder[lang] : undefined}
        aria-label={T.writeHead[lang]}
        style={{
          width: "100%",
          background: "var(--surface-subtle)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          padding: 14,
          fontFamily: "var(--ff-ui)",
          // R2 — 16px on a small screen, so iOS does not zoom the page on focus.
          fontSize: isPhone ? 16 : 15,
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

  /* One way forward, and it is enabled by exactly the CURRENT step's
     done-condition — never by anything else. When it is off, the reason is
     printed in words beside it. */
  const canContinue = step === 1 ? doneMap[1] : step === 2 ? doneMap[2] : step === 3 ? doneMap[3] : false;
  const continueReason = canContinue
    ? ""
    : step === 1
      ? T.whyNoSubject[lang]
      : step === 2
        ? T.whyNoWords[lang]
        : step === 3
          ? (format === null ? T.whyNoFormat[lang] : T.whyNoSlides[lang])
          : "";

  /* Save and come back later: only when there is something a save would keep. */
  const canSave = wordsReady || slidesMade;
  /* Make the slides. */
  const canMakeSlides = format === "slides" && !slidesMade && !deckBusy && wordsReady;
  /* Write it — the delegator's one primary at step 2. */
  const canWriteIt = !wordsReady && !generating;
  /* Save the link. */
  const canSaveLink = step === 4 && format === "slides" && plausibleLinkedInUrl(linkInput) && !linkSaved;

  /* Exactly one primary per screen. On step 3 the slide-making button in the
     stage IS the primary, so the strip does not offer a second one. */
  const stageOwnsPrimary =
    (step === 3 && format === "slides" && !deck) ||
    (step === 2 && posture === "delegator" && !wordsReady);

  const onContinue = () => {
    if (step === 1) {
      if (pasted.trim()) {
        // Words already written are never replaced without being asked.
        if (content.trim() && !askReplace) { setAskReplace(true); return; }
          setChoice((c) => c ?? { id: null, title: typedTopic.trim() || pasted.trim().slice(0, 60), insight: "" });
        setContent(fixArabicDirectionalSymbols(stripMarkdown(pasted), writeLang));
        setPasted("");
        setAskReplace(false);
        setStep(2);
        return;
      }
      if (content.trim()) { setStep(2); return; }
      // The author's own words are the only source in that posture: there is
      // no generate affordance to reach.
      if (posture === "author") { setStep(2); return; }
      void generate();
      return;
    }
    if (step === 2) { setStep(3); return; }
    if (step === 3) { setStep(4); }
  };

  return shell(
    <>
      {/* One slim strip. This is a page inside Aura; the shell owns navigation.
          It renders at every width; on a narrow screen it simply wraps. */}
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

      {/* THE RESTORE — announced, never assumed. Nothing below is populated
          until the member says "Carry on". */}
      {pendingRestore && !content && !deck && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: "var(--surface-card)", border: "1px solid var(--border-default)",
            borderRadius: 12, padding: 12, margin: "0 0 12px",
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}
        >
          <span style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)" }}>
            {T.restoreLine[lang]
              .replace(
                "{subject}",
                ((pendingRestore.choice as Choice | undefined)?.title ||
                  (typeof pendingRestore.content === "string"
                    ? pendingRestore.content.trim().split("\n")[0]?.slice(0, 60)
                    : "") ||
                  T.restoreSubjectUnknown[lang]),
              )
              .replace(
                "{when}",
                typeof pendingRestore.savedAt === "string" ? savedAgo(pendingRestore.savedAt, lang) : "",
              )}
          </span>
          <span style={{ flex: 1 }} />
          <ButtonPrimary onClick={carryOnRestore} style={{ minHeight: 44 }}>
            {T.restoreCarryOn[lang]}
          </ButtonPrimary>
          <ButtonGhost onClick={() => startNewPiece()} style={{ minHeight: 44 }}>
            {T.restoreStartNew[lang]}
          </ButtonGhost>
        </div>
      )}

      {/* One journey map, at every width. */}
      <JourneyMap lang={lang} step={step} done={doneMap} onStep={(n) => setStep(n)} />

      {/* One status strip, at every width: what Aura is doing, what it has
          done, and what is in the way. */}
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
        <span style={{ display: "grid", gap: 2 }}>
          <ButtonGhost onClick={() => void saveAndComeBack()} disabled={!canSave || busy === "save"} style={{ minHeight: 44 }}>
            {T.saveLater[lang]}
          </ButtonGhost>
          {/* The precondition, never a promise. The drafts confirmation is
              transient and appears only after a real save (`saveAndComeBack`). */}
          {!canSave && (
            <span style={{ fontFamily: "var(--ff-ui)", fontSize: 11.5, color: "var(--text-muted)", maxWidth: 260 }}>
              {T.nothingToSaveYet[lang]}
            </span>
          )}
        </span>
        {step < 4 && !stageOwnsPrimary && (
          <span style={{ display: "grid", gap: 2 }}>
            <ButtonPrimary onClick={onContinue} disabled={!canContinue || generating} style={{ minHeight: 44 }}>
              {T.continue[lang]} {rtlShell ? "←" : "→"}
            </ButtonPrimary>
            {!canContinue && continueReason && (
              <span style={{ fontFamily: "var(--ff-ui)", fontSize: 11.5, color: "var(--text-muted)", maxWidth: 260 }}>
                {continueReason}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Motion for anything in flight, on every step. */}
      {busyMessage && (
        <BusyBar
          message={busyMessage}
          etaSeconds={etaFor(busyMessage, lang)}
          remainingLabel={(n) => T.aboutSecondsLeft[lang].replace("{n}", String(n))}
        />
      )}

      {step === 1 && (
        <StageCard title={T.chooseHead[lang]} subtitle={T.chooseHelp[lang]} align={rtlShell ? "right" : "left"} defaultOpen>
          {/* A subject change over written words is asked for, never assumed. */}
          {pendingSubject && (
            <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--act)", borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)", margin: "0 0 10px" }}>
                {T.confirmSubjectHead[lang]}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ButtonPrimary
                  onClick={() => {
                    const next = pendingSubject;
                    startNewPiece({ choice: next });
                  }}
                  style={{ minHeight: 44 }}
                >
                  {T.confirmSubjectYes[lang]}
                </ButtonPrimary>
                <ButtonGhost onClick={() => setPendingSubject(null)} style={{ minHeight: 44 }}>
                  {T.replaceNo[lang]}
                </ButtonGhost>
              </div>
            </div>
          )}

          {/* Work already waiting. Nothing a member wrote may become unreachable. */}
          {!draftsLoading && drafts.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                {T.draftsHead[lang]}
              </p>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 8px" }}>
                {T.draftsHelp[lang]}
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {drafts.slice(0, 12).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => void openDraft(d, "studio_drafts_list")}
                    style={{
                      textAlign: rtlShell ? "right" : "left", cursor: "pointer",
                      background: "var(--surface-subtle)", border: "1px solid var(--border-default)",
                      borderRadius: 12, padding: 12,
                    }}
                  >
                    <span dir="auto" style={{ display: "block", fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
                      {d.title || d.body.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) || T.untitledDraft[lang]}
                    </span>
                    <span style={{ display: "block", fontFamily: "var(--ff-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                      {T.draftSaved[lang]} {savedAgo(d.created_at, lang)} · {d.language === "ar" ? T.langAr[lang] : T.langEn[lang]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {cardsLoading && (
            <p role="status" aria-live="polite" style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--text-secondary)" }}>
              {T.loading[lang]}
            </p>
          )}
          {!cardsLoading && cards.length === 0 && (
            <div style={{ display: "grid", gap: 10, justifyItems: rtlShell ? "end" : "start" }}>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
                {T.chooseEmpty[lang]}
              </p>
              {onOpenCapture && (
                <ButtonPrimary onClick={() => onOpenCapture()} style={{ minHeight: 44 }}>
                  {T.captureNow[lang]}
                </ButtonPrimary>
              )}
            </div>
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
                    // N1 — changing subject over words already written is a NEW
                    // piece, and it is confirmed before anything is lost.
                    const next = { id: c.signalId, title: c.title, insight: c.insight };
                    if (choice?.id === c.signalId) return;
                    if (published || content.trim()) { setPendingSubject(next); return; }
                    setChoice(next);
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

          {/* The ranked three are a shortcut, never the whole shelf. */}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setShowAllSubjects((v) => !v)}
              aria-expanded={showAllSubjects}
              style={{
                minHeight: 44, padding: 0, background: "transparent", border: 0, cursor: "pointer",
                fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 600, color: "var(--act)",
              }}
            >
              {showAllSubjects ? T.hideAllSubjects[lang] : T.seeAllSubjects[lang]}
            </button>
            {showAllSubjects && (
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {allSignals.length === 0 && (
                  <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                    {T.allSubjectsEmpty[lang]}
                  </p>
                )}
                {allSignals.map((s) => {
                  const on = choice?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const next = { id: s.id, title: s.title, insight: s.insight };
                        if (choice?.id === s.id) return;
                        if (published || content.trim()) { setPendingSubject(next); return; }
                        setChoice(next);
                        setTypedTopic("");
                      }}
                      style={{
                        textAlign: rtlShell ? "right" : "left", cursor: "pointer",
                        background: on ? "var(--act-tint)" : "var(--surface-subtle)",
                        border: `1px solid ${on ? "var(--act)" : "var(--border-default)"}`,
                        borderRadius: 12, padding: 12,
                      }}
                    >
                      <span dir="auto" style={{ display: "block", fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                        {s.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
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
                  const v = e.target.value;
                  const t = v.trim();
                  // Typing never destroys words. Over an empty piece the typed
                  // subject IS the subject; over written words the swap is
                  // offered as a confirmation instead.
                  setTypedTopic(v);
                  if (published || content.trim()) {
                    setPendingSubject(t ? { id: null, title: t, insight: "" } : null);
                    return;
                  }
                  setChoice(t ? { id: null, title: t, insight: "" } : null);
                }}
                placeholder={T.chooseOwnPlaceholder[lang]}
                style={{
                  flex: "1 1 260px", minHeight: 44, padding: "0 12px", borderRadius: 10,
                  background: "var(--surface-subtle)", border: "1px solid var(--border-default)",
                  fontFamily: "var(--ff-ui)", fontSize: isPhone ? 16 : 14, color: "var(--text-primary)",
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
                    onClick={() => { langChosenRef.current = true; setWriteLang(key); }}
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
                onChange={(e) => {
                  const v = e.target.value;
                  setPasted(v);
                  // The author's subject may simply be the first line they wrote.
                  const first = v.split("\n").map((l) => l.trim()).find(Boolean) || "";
                  if (!choice && first) setChoice({ id: null, title: first.slice(0, 80), insight: "" });
                }}
                placeholder={T.pastePlaceholder[lang]}
                style={{
                  width: "100%", background: "var(--surface-subtle)", border: "1px solid var(--border-default)",
                  borderRadius: 12, padding: 12, fontFamily: "var(--ff-ui)", fontSize: isPhone ? 16 : 14,
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
          {/* THE POSTURE, MADE REAL. Delegator: a subject already chosen and one
              primary that writes. Author: no generate affordance at all.
              Editor: the words arrived from step 1. */}
          {posture === "delegator" && (
            <div style={{ display: "grid", gap: 8, justifyItems: rtlShell ? "end" : "start", margin: "0 0 14px" }}>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)", margin: 0 }}>
                {wordsReady ? T.delegatorFoundDraft[lang] : T.delegatorWaiting[lang]}
              </p>
              {!wordsReady && (
                <ButtonPrimary onClick={() => void generate()} disabled={!canWriteIt || !choice} style={{ minHeight: 44 }}>
                  {T.writeItNow[lang]}
                </ButtonPrimary>
              )}
              {!wordsReady && !choice && (
                <span style={{ fontFamily: "var(--ff-ui)", fontSize: 11.5, color: "var(--text-muted)" }}>
                  {T.whyNoSubject[lang]}
                </span>
              )}
              <ButtonGhost onClick={() => setStep(1)} style={{ minHeight: 44 }}>
                {T.chooseDifferent[lang]}
              </ButtonGhost>
            </div>
          )}

          {/* Editing words that are already live is a NEW post, and it is asked
              for first. Nothing published is ever quietly rewritten. */}
          {published && (
            <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 12, margin: "0 0 12px" }}>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)", margin: "0 0 10px" }}>
                {T.editAfterPublishHead[lang]}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ButtonPrimary
                  onClick={() => {
                    const carried = content;
                    const keep = choice;
                    startNewPiece({ choice: keep });
                    setContent(carried);
                    setStep(2);
                  }}
                  style={{ minHeight: 44 }}
                >
                  {T.editAfterPublishYes[lang]}
                </ButtonPrimary>
                <ButtonGhost onClick={() => setStep(4)} style={{ minHeight: 44 }}>
                  {T.keepAsIs[lang]}
                </ButtonGhost>
              </div>
            </div>
          )}

          {notReady && (
            <p
              role="status"
              aria-live="polite"
              style={{
                fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.75, fontWeight: 600,
                color: "var(--error)", background: "var(--error-tint)", borderRadius: 12,
                padding: 12, margin: "0 0 12px",
              }}
            >
              {notReady}
            </p>
          )}
          {notReady && !(format === "slides" && deck) && (
            <div style={{ margin: "0 0 12px" }}>
              <ButtonGhost onClick={() => { setNotReady(null); setStep(4); void publishNow(true); }} disabled={busy === "post"} style={{ minHeight: 44 }}>
                {T.postAnyway[lang]}
              </ButtonGhost>
            </div>
          )}
          {/* Change the writing language without going back a step. This is a
              generate affordance, so it does not exist in the author posture. */}
          {posture !== "author" && (
          <div style={{ marginBottom: 12 }}>
            <ButtonGhost
              onClick={() => {
                const other: Lang = writeLang === "ar" ? "en" : "ar";
                // Words the member owns are never silently replaced.
                const ownWords =
                  content.trim().length > 0 && content !== (generatedTextRef.current ?? "");
                if (ownWords) { setAskLangSwitch(other); return; }
                langChosenRef.current = true;
                setWriteLang(other);
                setNotReady(null);
                void generate(undefined, other);
              }}
              disabled={generating || !choice}
              style={{ minHeight: 44 }}
            >
              {writeLang === "ar" ? T.writeAgainEn[lang] : T.writeAgainAr[lang]}
            </ButtonGhost>
            {askLangSwitch && (
              <div
                style={{
                  marginTop: 10, background: "var(--surface-subtle)",
                  border: "1px solid var(--border-default)", borderRadius: 12, padding: 12,
                }}
              >
                <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.75, color: "var(--text-primary)", margin: "0 0 10px" }}>
                  {askLangSwitch === "ar" ? T.langSwitchHeadAr[lang] : T.langSwitchHeadEn[lang]}
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ButtonPrimary
                    onClick={() => {
                      const other = askLangSwitch;
                      setAskLangSwitch(null);
                      langChosenRef.current = true;
                setWriteLang(other);
                      setNotReady(null);
                      void generate(undefined, other);
                    }}
                    style={{ minHeight: 44 }}
                  >
                    {T.langSwitchYes[lang]}
                  </ButtonPrimary>
                  <ButtonGhost onClick={() => setAskLangSwitch(null)} style={{ minHeight: 44 }}>
                    {T.langSwitchNo[lang]}
                  </ButtonGhost>
                </div>
              </div>
            )}
          </div>
          )}
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
                    onClick={() => {
                      if (key === format) return;
                      // Slides already made are never thrown away unasked.
                      if (key === "post" && deck) { setPendingFormat("post"); return; }
                      setFormat(key);
                    }}
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
            {pendingFormat === "post" && (
              <div style={{ marginTop: 12, background: "var(--surface-subtle)", border: "1px solid var(--act)", borderRadius: 12, padding: 12 }}>
                <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)", margin: "0 0 10px" }}>
                  {T.confirmDiscardSlidesHead[lang]}
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ButtonPrimary
                    onClick={() => {
                      setDeck(null);
                      setDeckSource(null);
                      setDeckFailures([]);
                      setCurrent(0);
                      setFits({});
                      setExported(false);
                      setFormat("post");
                      setPendingFormat(null);
                    }}
                    style={{ minHeight: 44 }}
                  >
                    {T.confirmDiscardSlidesYes[lang]}
                  </ButtonPrimary>
                  <ButtonGhost onClick={() => setPendingFormat(null)} style={{ minHeight: 44 }}>
                    {T.replaceNo[lang]}
                  </ButtonGhost>
                </div>
              </div>
            )}
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
              onContentChange={changeContent}
              todo={{
                words: content.trim().length > 0,
                slides: Boolean(deck),
                cover: Boolean(deck?.slides.some((s) => s.slots.media?.src)),
                published,
              }}
              showWords={false}
            />
            <ZoneStage
              lang={lang}
              deck={deck}
              theme={theme}
              width={canvasWidth}
              current={current}
              onCurrent={setCurrent}
              onFit={ignoreFit}
              mountRef={mountRef}
              boxRef={canvasBoxRef}
              showCanvas={canvasInStage}
              empty={
                deckBusy ? (
                  <div style={{ width: "100%", maxWidth: 360 }}>
                    <BusyBar
                      message={T.makingSlides[lang]}
                      etaSeconds={45}
                      remainingLabel={(n) => T.aboutSecondsLeft[lang].replace("{n}", String(n))}
                    />
                  </div>
                ) : (
                  <span>{T.noSlidesYet[lang]}</span>
                )
              }
              footer={
                !deck ? (
                  <span style={{ display: "grid", gap: 4, justifyItems: rtlShell ? "end" : "start" }}>
                    <ButtonPrimary onClick={() => void makeSlides()} disabled={!canMakeSlides || deckBusy} style={{ minHeight: 44 }}>
                      {deckBusy ? T.makingSlides[lang] : T.makeSlides[lang]}
                    </ButtonPrimary>
                    {!canMakeSlides && !deckBusy && (
                      <span style={{ fontFamily: "var(--ff-ui)", fontSize: 11.5, color: "var(--text-muted)" }}>
                        {!wordsReady ? T.whyNoWords[lang] : format !== "slides" ? T.whyNoSlidesFormat[lang] : T.whyNoSlides[lang]}
                      </span>
                    )}
                  </span>
                ) : null
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
                onDeck={(next) => { setDeck(next); }}
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
          {/* P9 — THE ENDING. Whichever route the member took, the cycle closes
              here, in the main column, with three ways onward. Nothing on this
              panel can be pressed twice into a second post. */}
          {finished && (
            <div
              role="status"
              aria-live="polite"
              style={{
                background: "var(--surface-subtle)", border: "1px solid var(--act)",
                borderRadius: 12, padding: 14, margin: "0 0 16px", display: "grid", gap: 10,
              }}
            >
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                {T.endHead[lang]}
              </p>
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary)", margin: 0 }}>
                {T.endBody[lang]}{" "}
                {postUrl && (
                  <a href={postUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--act)", fontWeight: 700 }}>
                    {T.seeOnLinkedIn[lang]}
                  </a>
                )}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {/* Every label states exactly what survives it. */}
                <ButtonPrimary onClick={() => startNewPiece()} style={{ minHeight: 44 }}>
                  {T.writeAnotherClears[lang]}
                </ButtonPrimary>
                {subjectHasMore && (
                  <ButtonGhost onClick={() => startNewPiece({ choice })} style={{ minHeight: 44 }}>
                    {T.writeAnotherSameSubject[lang]}
                  </ButtonGhost>
                )}
                <ButtonGhost onClick={() => goTab("library")} style={{ minHeight: 44 }}>
                  {T.goToLibrary[lang]}
                </ButtonGhost>
                <ButtonGhost onClick={() => goTab("influence")} style={{ minHeight: 44 }}>
                  {T.seePerformance[lang]}
                </ButtonGhost>
              </div>
            </div>
          )}

          {/* TWO SCREENS, decided by the format the member CHOSE — never by
              whether a deck happens to exist. */}
          {format !== "slides" ? (
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
              {!published && (
                <>
                  {notReady && (
                    <div style={{ display: "grid", gap: 10, margin: "0 0 12px" }}>
                      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 600, color: "var(--error)", margin: 0, lineHeight: 1.75 }}>
                        {notReady}
                      </p>
                      {/* P1b — Aura advises, the member decides. Always a way out. */}
                      <div>
                        <ButtonGhost onClick={() => { setNotReady(null); void publishNow(true); }} disabled={busy === "post"} style={{ minHeight: 44 }}>
                          {T.postAnyway[lang]}
                        </ButtonGhost>
                      </div>
                    </div>
                  )}
                  {/* P4 — ONE POSITION. The trigger never moves and never leaves
                      the layout; the confirmation opens directly beneath it. */}
                  <ButtonPrimary
                    onClick={requestPost}
                    disabled={
                      !content.trim() || content.length > POST_MAX_CHARS ||
                      busy === "post" || confirmingPost || Boolean(notReady)
                    }
                    style={{ minHeight: 44 }}
                  >
                    {T.postItNow[lang]}
                  </ButtonPrimary>
                  <div style={{ marginTop: 12 }}>{confirmPanel}</div>
                </>
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
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label htmlFor="studio-link" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                  {T.linkPlaceholder[lang]}
                </label>
                <input
                  id="studio-link"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder={T.linkPlaceholder[lang]}
                  disabled={linkSaved || published}
                  style={{
                    flex: "1 1 280px", minHeight: 44, padding: "0 12px", borderRadius: 10,
                    background: "var(--surface-subtle)", border: "1px solid var(--border-default)",
                    fontFamily: "var(--ff-ui)", fontSize: isPhone ? 16 : 14, color: "var(--text-primary)",
                    textAlign: rtlShell ? "right" : "left",
                  }}
                />
                {exported ? (
                  <ButtonPrimary onClick={() => void saveLink()} disabled={!canSaveLink || published || busy === "link"} style={{ minHeight: 44 }}>
                    {busy === "link" ? T.savingLink[lang] : T.linkSave[lang]}
                  </ButtonPrimary>
                ) : (
                  <ButtonGhost onClick={() => void saveLink()} disabled={!canSaveLink || published || busy === "link"} style={{ minHeight: 44 }}>
                    {busy === "link" ? T.savingLink[lang] : T.linkSave[lang]}
                  </ButtonGhost>
                )}
              </div>
              {!canSaveLink && !linkSaved && (
                <p style={{ fontFamily: "var(--ff-ui)", fontSize: 11.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
                  {T.whyNoLink[lang]}
                </p>
              )}
              {linkSaved && (
                <p style={{ fontFamily: "var(--ff-ui)", fontSize: 11.5, color: "var(--text-muted)", margin: "6px 0 0" }}>
                  {T.whyLinkAlready[lang]}
                </p>
              )}
              {/* One sentence on why the link matters, as the member's benefit. */}
              <p style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-muted)", margin: "10px 0 0" }}>
                {T.whyLink[lang]}
              </p>
            </>
          )}
        </StageCard>
      )}

      {/* J4/L4 — THE EXPORT MOUNT. Always off-screen, always EXPORT_WIDTH wide,
          and alive for as long as a deck exists — it is both the source of the
          exported file and the ONE writer of fit state. Portalled to <body> so
          no ancestor can clip it. */}
      {deck &&
        createPortal(
          <div
            aria-hidden="true"
            dir="ltr"
            style={{ position: "absolute", left: -99999, top: 0, width: EXPORT_WIDTH }}
          >
            <StudioCanvas
              deck={deck}
              theme={theme}
              width={EXPORT_WIDTH}
              current={current}
              onFit={reportFit}
              mountRef={exportMountRef}
            />
          </div>,
          document.body,
        )}
    </>,
  );
}