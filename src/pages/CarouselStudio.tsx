/**
 * The carousel studio.
 *
 * One tap from "I have a signal" to "I have a finished PDF". Aura makes every
 * choice it can and shows what it chose, reversibly. There is no blank box, no
 * required decision, and no layout control anywhere on this page.
 *
 * The deck exists in the DOM exactly once, inside StudioCanvas, and that is
 * the container the exporter reads — preview and export are the same nodes.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Copy, FileDown, Images, Linkedin, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SLIDE_MEDIA_LIMITS, checkImage, fitToSlot } from "@/lib/imagePrep";
import { ButtonPrimary, ButtonGhost } from "@/components/systemb";
import { DeckIRSchema, plainText, type DeckIR, type DeckLength } from "@/carousel/deckIR";
import { checkInvariants, splitByTier } from "@/carousel/invariants";
import { compose } from "@/carousel/compose";
import { DEFAULT_THEME, THEME_NAMES, THEMES, type ThemeName } from "@/carousel/render/themes";
import type { FitState } from "@/carousel/render/useFitLadder";
import {
  DECK_PDF_LIMIT_BYTES, collectSlideNodes, exportDeckPdf, exportDeckPngs, formatBytes, renderDeckPdfBlob,
} from "@/carousel/render/exportDeck";
import { mediaSupport } from "@/carousel/render/Slide";
import { logDeckEvent } from "@/carousel/render/deckTelemetry";
import StudioCanvas from "@/carousel/studio/StudioCanvas";
import SignalPicker, { type StudioSignal } from "@/carousel/studio/SignalPicker";
import EditPanel from "@/carousel/studio/EditPanel";
import IdentityBlock from "@/carousel/studio/IdentityBlock";
import { ARCHETYPE_LABEL, plainFailure } from "@/carousel/studio/slotLabels";
import { isLocked, moveSlide, replaceSlide, setSlidePhoto } from "@/carousel/studio/deckEdit";

const DRAFT_KEY = "aura_deck_draft_v1";
const STAGES = ["Reading your signal", "Planning", "Writing", "Checking"] as const;

const mono: React.CSSProperties = {
  fontFamily: "var(--ff-mono)", fontSize: 10.5, letterSpacing: ".09em", textTransform: "uppercase",
};

/** Move-left / move-right on a filmstrip thumbnail. Always visible, keyboard reachable. */
const stepBtn: React.CSSProperties = {
  width: 26, height: 18, borderRadius: 6, lineHeight: 1,
  border: "1px solid var(--border-default)",
  background: "var(--surface-card)", color: "var(--text-secondary)",
  fontSize: 12, cursor: "pointer", padding: 0,
};

const panel: React.CSSProperties = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: 16,
  padding: 16,
};

/* ------------------------------------------------------------------ */
/* What can this signal carry? (deterministic, no model call)          */
/* ------------------------------------------------------------------ */

function carryHeuristic(s: StudioSignal | null, lang: "en" | "ar") {
  const corpus = [s?.signal_title, s?.explanation, s?.strategic_implications].filter(Boolean).join(" ");
  const numbers = corpus.match(/\d[\d,.]*/g) ?? [];
  const steps = (s?.strategic_implications ?? "")
    .split(/\n|•|(?<=\.)\s+/)
    .filter((x) => x.trim().length > 15).length;
  return {
    hasNumber: numbers.length > 0,
    hasComparison: numbers.length >= 2,
    stepCount: Math.min(7, steps),
    lang,
  };
}

function lengthAvailability(s: StudioSignal | null, lang: "en" | "ar") {
  const input = carryHeuristic(s, lang);
  const out: Record<DeckLength, { ok: boolean; why: string }> = {} as any;
  for (const L of [5, 7, 10] as DeckLength[]) {
    const ok = compose(input, L).length === L;
    const why = ok
      ? ""
      : input.stepCount < 3
        ? "This signal does not carry enough distinct steps to fill that many slides."
        : !input.hasComparison
          ? "This signal has no comparison to chart, so that length would need padding."
          : "This signal cannot fill that length without padding.";
    out[L] = { ok, why };
  }
  return out;
}

/* ------------------------------------------------------------------ */

export default function CarouselStudio() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselected = params.get("signal");
  const autogenerate = params.get("autogenerate");
  const langParam = params.get("lang");
  const draftParam = params.get("draft");

  const [signals, setSignals] = useState<StudioSignal[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [signal, setSignal] = useState<StudioSignal | null>(null);

  const [lang, setLang] = useState<"en" | "ar">("en");
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);
  const [length, setLength] = useState<DeckLength>(7);
  const [hasAvatar, setHasAvatar] = useState(true);
  const [voiceFlags, setVoiceFlags] = useState<string[]>([]);
  /** The approved post behind this handoff. The carousel adapts it rather than regenerating. */
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [sourceReady, setSourceReady] = useState(false);

  const [deck, setDeck] = useState<DeckIR | null>(null);
  const [stage, setStage] = useState<number | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /**
   * Anything the "Add image" control has to say. It renders next to that
   * control — `error` renders in panels the member may not even be looking at.
   */
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [fits, setFits] = useState<Record<number, FitState>>({});
  const [rewriting, setRewriting] = useState(false);
  const [busy, setBusy] = useState<null | "pdf" | "png">(null);
  const [exported, setExported] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [caption, setCaption] = useState("");
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState<null | string>(null);
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(360);
  /** The thumbnail currently being dragged in the filmstrip. */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  /**
   * Reorder. Everything keyed by slide index is recomputed: the fit-ladder map
   * is cleared so a stale entry can never mark the wrong slide as overflowing.
   */
  const reorder = useCallback((from: number, to: number) => {
    setDeck((d) => {
      if (!d) return d;
      const next = moveSlide(d, from, to);
      if (next === d) return d;
      setFits({});
      setCurrent(to);
      return next;
    });
  }, []);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);

  /* --- profile + signals ------------------------------------------ */
  useEffect(() => {
    let dead = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) { setLoadingSignals(false); return; }

      const [{ data: prof }, { data: rows }] = await Promise.all([
        supabase.from("diagnostic_profiles").select("content_language, avatar_url").eq("user_id", uid).maybeSingle(),
        supabase
          .from("strategic_signals")
          .select("id, signal_title, explanation, strategic_implications, theme_tags, confidence, priority_score, created_at")
          .eq("user_id", uid)
          .eq("status", "active")
          .order("priority_score", { ascending: false })
          .limit(200),
      ]);
      if (dead) return;
      // An explicit handoff choice wins over the stored profile preference.
      if (langParam === "ar" || langParam === "en") setLang(langParam);
      else if ((prof as any)?.content_language === "ar") setLang("ar");
      setHasAvatar(Boolean((prof as any)?.avatar_url));
      const list = (rows ?? []) as unknown as StudioSignal[];
      setSignals(list);
      setLoadingSignals(false);
      if (preselected) {
        const hit = list.find((s) => s.id === preselected);
        if (hit) setSignal(hit);
        else {
          const { data: one } = await supabase
            .from("strategic_signals")
            .select("id, signal_title, explanation, strategic_implications, theme_tags, confidence, priority_score, created_at")
            .eq("id", preselected)
            .maybeSingle();
          if (!dead && one) setSignal(one as unknown as StudioSignal);
        }
      }
    })();
    return () => { dead = true; };
  }, [preselected]);

  /* --- restore an unfinished deck --------------------------------- */
  useEffect(() => {
    let dead = false;
    if (!draftParam) { setSourceReady(true); return; }
    setSourceReady(false);
    (async () => {
      const { data } = await supabase
        .from("linkedin_posts")
        .select("post_text")
        .eq("id", draftParam)
        .maybeSingle();
      if (dead) return;
      const text = typeof (data as any)?.post_text === "string" ? (data as any).post_text.trim() : "";
      setSourceText(text || null);
      setSourceReady(true);
    })();
    return () => { dead = true; };
  }, [draftParam]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const parsed = DeckIRSchema.safeParse(saved.deck);
      if (!parsed.success) return;
      setDeck(parsed.data);
      setTheme((saved.theme as ThemeName) ?? parsed.data.theme);
      if (saved.signal) setSignal(saved.signal as StudioSignal);
    } catch { /* a corrupt draft is simply no draft */ }
  }, []);

  /* --- save continuously ------------------------------------------ */
  useEffect(() => {
    if (!deck) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ deck, theme, signal }));
    } catch { /* quota — never blocks editing */ }
  }, [deck, theme, signal]);

  /* --- responsive canvas ------------------------------------------ */
  useEffect(() => {
    const measure = () => {
      const w = canvasBoxRef.current?.clientWidth ?? 360;
      setCanvasWidth(Math.max(240, Math.min(520, w)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [deck]);

  const availability = useMemo(() => lengthAvailability(signal, lang), [signal, lang]);
  useEffect(() => {
    // Aura picks the longest length the signal can actually fill.
    const best = ([7, 10, 5] as DeckLength[]).find((L) => availability[L].ok) ?? 5;
    setLength(best);
  }, [availability]);

  const tiered = useMemo(
    () => splitByTier(deck ? checkInvariants(deck) : []),
    [deck],
  );
  const invariantFailures = tiered.blocking;
  const fitFailures = useMemo(
    () => Object.values(fits).filter((f) => f.failed).map((f) => f.reason ?? "A slide does not fit."),
    [fits],
  );
  const allFailures = [...invariantFailures, ...fitFailures];
  /**
   * Every issue, tied to the slide it belongs to, so no line is a dead end.
   * The invariant strings carry "slide N"; the fit map is keyed by index.
   */
  const issues = useMemo(() => {
    const out: Array<{ text: string; index?: number }> = [];
    for (const f of invariantFailures) {
      const m = /slide (\d+)/i.exec(f);
      out.push({ text: plainFailure(f), index: m ? Number(m[1]) : undefined });
    }
    for (const [key, state] of Object.entries(fits)) {
      if (!state?.failed) continue;
      out.push({ text: plainFailure(state.reason ?? "A slide does not fit."), index: Number(key) });
    }
    return out;
  }, [invariantFailures, fits]);
  // Voice and taste notes: worth reading, never worth withholding the deck.
  const notes = tiered.warnings;
  const noFigure = Boolean(deck && !deck.slides.some((s) => s.slots.stat_value));

  /* --- stage 3 · generate ----------------------------------------- */
  const generate = useCallback(async () => {
    if (!signal) return;
    setError(null);
    setFailures([]);
    setFits({});
    setStage(0);
    const ticker = window.setInterval(() => setStage((s) => (s === null ? 0 : Math.min(s + 1, STAGES.length - 1))), 2600);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) throw new Error("Your session expired. Sign in again.");
      const { data, error: fnError } = await supabase.functions.invoke("generate-deck", {
        body: {
          signal_id: signal.id,
          length,
          theme,
          lang,
          ...(sourceText ? { source_text: sourceText } : {}),
        },
      });
      if (fnError && !data) throw fnError;
      const result: any = data;
      if (!result?.ok) {
        setFailures((result?.failures ?? ["Aura could not build a deck it was willing to ship."]).map(plainFailure));
        return;
      }
      const parsed = DeckIRSchema.safeParse(result.deck);
      if (!parsed.success) throw new Error("The deck came back in a shape the renderer does not accept.");
      // Only now is the previous deck replaced: a failed run above leaves the
      // member's existing deck untouched on screen.
      setDeck({ ...parsed.data, theme });
      setExported(null);
      setPublished(false);
      setPostUrl(null);
      setCaption(typeof result.caption === "string" ? result.caption : "");
      setVoiceFlags(Array.isArray(result.quality?.flags) ? result.quality.flags : []);
      setCurrent(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      window.clearInterval(ticker);
      setStage(null);
    }
  }, [signal, length, theme, lang, sourceText]);

  /* --- handoff from /compose: fire Generate once ------------------- */
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autogenerate !== "1") return;
    if (autoFiredRef.current) return;
    if (!preselected) return;
    if (!signal || signal.id !== preselected) return;
    if (!sourceReady) return;
    if (deck || stage !== null) return;
    autoFiredRef.current = true;
    void generate();
  }, [autogenerate, preselected, signal, deck, stage, generate, sourceReady]);

  /* --- try another angle ------------------------------------------ */
  const rewriteSlide = useCallback(async () => {
    if (!deck) return;
    setRewriting(true);
    try {
      const { data } = await supabase.functions.invoke("generate-deck", {
        body: { signal_id: deck.signal_id, rewrite_slide: current, deck },
      });
      const result: any = data;
      if (result?.ok && result.slide) setDeck((d) => (d ? replaceSlide(d, current, result.slide) : d));
      else setError("Aura could not find another angle for that slide.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRewriting(false);
    }
  }, [deck, current]);

  /* --- media ------------------------------------------------------- */
  const uploadPhoto = useCallback(async (file: File) => {
    setMediaError(null);
    if (!deck) { setMediaError("There is no deck open to add an image to."); return; }
    const slide = deck.slides[Math.min(current, deck.slides.length - 1)];
    // Refuse BEFORE taking the file, never after: an accepted file that draws
    // nothing is the defect this whole path is being rebuilt to remove.
    if (mediaSupport(slide.archetype) === "none") {
      setMediaError(
        `Slide ${slide.index + 1} is a ${ARCHETYPE_LABEL[slide.archetype] ?? slide.archetype} slide, which has no room for a photo. Pick another slide.`,
      );
      return;
    }
    // The tool does the work: anything usable is resampled and centre-cropped
    // to the slot. The member is never asked to think in pixels.
    const problem = await checkImage(file, SLIDE_MEDIA_LIMITS);
    if (problem) { setMediaError(problem); return; }
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) { setMediaError("Your session expired. Sign in again to add an image."); return; }
    // Re-encode before upload so EXIF (including GPS) never leaves the device.
    const clean = await fitToSlot(file, 1400, 900, "image/jpeg");
    const path = `${uid}/${deck.deck_id}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("deck-media")
      .upload(path, clean, { upsert: true, contentType: "image/jpeg" });
    if (upErr) { setMediaError(upErr.message); return; }
    // The bucket is private, so the slide references a long-lived signed URL.
    const { data: signed, error: signErr } = await supabase.storage
      .from("deck-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signErr || !signed) { setMediaError(signErr?.message ?? "Could not read the uploaded image back."); return; }
    setDeck((d) => (d ? setSlidePhoto(d, current, signed.signedUrl) : d));
  }, [deck, current]);

  /* --- export ------------------------------------------------------ */
  const runExport = useCallback(async (kind: "pdf" | "png") => {
    if (!deck || !mountRef.current) return;
    setBusy(kind);
    setError(null);
    try {
      const nodes = collectSlideNodes(mountRef.current);
      const name = `aura-carousel-${deck.deck_id.slice(0, 8)}`;
      const out = kind === "pdf"
        ? await exportDeckPdf(nodes, `${name}.pdf`)
        : await exportDeckPngs(nodes, `${name}-images.zip`);
      setExported(`${out.slides} slides · ${out.bytes ? formatBytes(out.bytes) : ""} · ${out.durationMs} ms`);
      void logDeckEvent("exported", deck, {
        theme, fitSteps: out.maxFitStep, durationMs: out.durationMs,
        ...(kind === "pdf" ? { pdfBytes: out.bytes } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void logDeckEvent("export_failed", deck, { theme });
    } finally {
      setBusy(null);
    }
  }, [deck, theme]);

  /* --- publish straight to LinkedIn -------------------------------- */
  /**
   * The same PDF the member would have downloaded is uploaded for them. There
   * is exactly one publisher in this app: linkedin-publish owns idempotency,
   * retries, the deadline and the telemetry, and this path hands it a post row
   * carrying the document rather than a second publishing implementation.
   */
  const publishToLinkedIn = useCallback(async () => {
    if (!deck || !mountRef.current) return;
    setError(null);
    setPublishing("Building the PDF");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) throw new Error("Your session expired. Sign in again.");

      const cover = deck.slides[0];
      const hook = (cover?.slots.hero_lines ?? []).map((l) => plainText(l)).join(" ").trim();
      const body = caption.trim() || hook;
      if (!body) throw new Error("Add a caption before publishing.");

      const nodes = collectSlideNodes(mountRef.current);
      const { blob } = await renderDeckPdfBlob(nodes);
      // Every publish attempt records the size, pass or fail, so an oversized
      // deck shows up in the numbers instead of in a founder's inbox.
      void logDeckEvent("rendered", deck, { theme, pdfBytes: blob.size });
      // Fail fast, with BOTH numbers. "Exceeded the maximum allowed size" on
      // its own told us nothing about which number was wrong.
      if (blob.size > DECK_PDF_LIMIT_BYTES) {
        throw new Error(
          `The carousel PDF is ${formatBytes(blob.size)}; the limit is ${formatBytes(DECK_PDF_LIMIT_BYTES)}. Remove a slide or a large photo and try again.`,
        );
      }

      setPublishing("Uploading");
      const path = `${uid}/${deck.deck_id}/carousel.pdf`;
      const { error: upErr } = await supabase.storage
        .from("deck-media")
        .upload(path, blob, { upsert: true, contentType: "application/pdf" });
      if (upErr) {
        throw new Error(
          `${upErr.message} (the carousel PDF is ${formatBytes(blob.size)}, ${deck.slides.length} slides).`,
        );
      }
      const { data: signed, error: signErr } = await supabase.storage
        .from("deck-media")
        // Seven days, so a parked, queued or retried publish never fetches an
        // expired URL — the same lifetime the slide photos already get.
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signErr || !signed) throw new Error(signErr?.message ?? "Could not read the PDF back.");

      const { data: row, error: insErr } = await supabase
        .from("linkedin_posts")
        .insert({
          user_id: uid,
          post_text: body,
          title: hook || null,
          content_type: "carousel",
          source_type: "aura_generated",
          media_type: "document",
          tracking_status: "draft",
          source_signal_id: deck.signal_id,
          source_metadata: {
            document_url: signed.signedUrl,
            document_title: (hook || "Carousel").slice(0, 100),
            deck_id: deck.deck_id,
            language: deck.primary_lang,
          },
        } as any)
        .select("id")
        .single();
      if (insErr || !row) throw new Error(insErr?.message ?? "Could not stage the post.");

      setPublishing("Posting to LinkedIn");
      const { data: res, error: fnErr } = await supabase.functions.invoke("linkedin-publish", {
        body: { postId: (row as any).id },
      });
      if (fnErr && !res) throw fnErr;
      const out: any = res;
      if (!out?.success) throw new Error(out?.error ?? "LinkedIn refused the post.");

      setPostUrl(out.postUrl ?? null);
      setPublished(true);
      void logDeckEvent("published", deck, { theme, pdfBytes: blob.size });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void logDeckEvent("publish_failed", deck, { theme });
    } finally {
      setPublishing(null);
    }
  }, [deck, caption, theme]);

  /* ---------------------------------------------------------------- */

  const startOver = () => {
    setDeck(null); setSignal(null); setExported(null); setPublished(false); setFailures([]);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--surface-page)",
        padding: "20px 16px 96px",
        fontFamily: "var(--ff-ui)",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {draftParam && (
          <div style={{ marginBottom: 12 }}>
            <a
              href={`/home?tab=authority&draft=${draftParam}&src=linkedin_posts`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/home?tab=authority&draft=${draftParam}&src=linkedin_posts`);
              }}
              style={{
                fontFamily: "var(--ff-ui)",
                fontSize: 13.5,
                color: "var(--act)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              {lang === "ar" ? "← العودة إلى منشورك" : "← Back to your post"}
            </a>
          </div>
        )}
        <ButtonGhost
          onClick={() => {
            // Inside the studio "Start again" returns to the signal picker.
            // At the picker, Back leaves the studio for wherever the member
            // came from — and for a cold load, the dashboard.
            if (deck || signal) { startOver(); return; }
            if (window.history.length > 1) navigate(-1);
            else navigate("/dashboard");
          }}
          style={{ marginBottom: 14 }}
        >
          <ArrowLeft size={13} />{deck || signal ? "Start again" : "Back"}
        </ButtonGhost>

        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
          Carousel
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "0 0 20px", lineHeight: 1.6 }}>
          Pick a signal. Aura writes the deck, checks it, and gives you a PDF ready for LinkedIn.
        </p>

        {/* 1 · signals */}
        {!signal && !deck && (
          <SignalPicker signals={signals} loading={loadingSignals} onSelect={setSignal} />
        )}

        {/* 2 · the proposal */}
        {signal && !deck && (
          <div style={{ ...panel, display: "grid", gap: 16 }}>
            <div>
              <div style={{ ...mono, color: "var(--text-muted)", marginBottom: 6 }}>Your signal</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 }}>
                {signal.signal_title}
              </div>
            </div>

            <p style={{ fontSize: 14.5, color: "var(--text-primary)", margin: 0, lineHeight: 1.7 }}>
              Aura suggests <strong>{length} slides</strong>, <strong>{theme === "midnight" ? "Midnight" : theme}</strong>,
              in <strong>{lang === "ar" ? "العربية" : "English"}</strong>.
            </p>

            <div style={{ display: "grid", gap: 12 }}>
              <Control label="Length">
                {([5, 7, 10] as DeckLength[]).map((L) => (
                  <Pill
                    key={L}
                    active={length === L}
                    disabled={!availability[L].ok}
                    title={availability[L].ok ? undefined : availability[L].why}
                    onClick={() => availability[L].ok && setLength(L)}
                  >
                    {L} slides
                  </Pill>
                ))}
              </Control>

              <Control label="Look">
                {THEME_NAMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    title={t}
                    style={{
                      width: 46, height: 58, borderRadius: 10, cursor: "pointer",
                      background: THEMES[t].bg,
                      border: `2px solid ${t === theme ? "var(--brand)" : "var(--border-default)"}`,
                    }}
                  />
                ))}
              </Control>

              <Control label="Language">
                <Pill active={lang === "en"} onClick={() => setLang("en")}>English</Pill>
                <Pill active={lang === "ar"} onClick={() => setLang("ar")}>العربية</Pill>
              </Control>
            </div>

            <div>
              <ButtonPrimary onClick={generate} disabled={stage !== null} data-testid="studio-generate">
                <Sparkles size={13} />{stage !== null ? "Working" : "Generate"}
              </ButtonPrimary>
            </div>

            {/* 3 · alive */}
            {stage !== null && (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ ...mono, color: "var(--brand)" }}>{STAGES[stage]}…</div>
                <div style={{ display: "flex", gap: 10, overflow: "hidden" }}>
                  {Array.from({ length }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 68, height: 85, borderRadius: 8, flex: "0 0 auto",
                        background: "var(--surface-subtle)",
                        animation: `pulse 1.4s ease-in-out ${i * 0.09}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {failures.length > 0 && (
              <div style={{ ...panel, background: "var(--error-tint)", border: "none", display: "grid", gap: 8 }}>
                <div style={{ ...mono, color: "var(--error)" }}>
                  {lang === "ar"
                    ? "لم نتمكن من إتمام الكاروسيل — لنجرّب مرة أخرى."
                    : "We couldn't finish your carousel — let's try again."}
                </div>
                {failures.map((f, i) => (
                  <div key={i} style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{f}</div>
                ))}
                <div><ButtonGhost onClick={generate}>Try again</ButtonGhost></div>
              </div>
            )}
            {error && <div style={{ fontSize: 13, color: "var(--error)" }}>{error}</div>}
          </div>
        )}

        {/* 4–8 · the deck */}
        {deck && (
          <div style={{ display: "grid", gap: 16 }}>
            {/* filmstrip */}
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {deck.slides.map((s) => {
                const bad = fits[s.index]?.failed;
                const locked = isLocked(deck, s);
                return (
                  <div key={s.index} style={{ display: "flex", alignItems: "stretch", flex: "0 0 auto" }}>
                    <div
                      aria-hidden
                      style={{
                        width: 3, borderRadius: 2, marginInlineEnd: 4,
                        background: dropAt === s.index && dragFrom !== null ? "var(--brand)" : "transparent",
                      }}
                    />
                    <div style={{ display: "grid", gap: 4 }}>
                      <button
                        type="button"
                        draggable={!locked}
                        title={locked
                          ? s.index === 0
                            ? "The cover always stays first"
                            : "The closing slide always stays last"
                          : "Drag to reorder"}
                        onDragStart={() => { if (!locked) setDragFrom(s.index); }}
                        onDragOver={(e) => {
                          if (dragFrom === null || locked) return;
                          e.preventDefault();
                          setDropAt(s.index);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragFrom !== null && !locked) reorder(dragFrom, s.index);
                          setDragFrom(null); setDropAt(null);
                        }}
                        onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
                        onClick={() => setCurrent(s.index)}
                        style={{
                          width: 92, height: 62, borderRadius: 10,
                          cursor: locked ? "pointer" : "grab",
                          opacity: dragFrom === s.index ? 0.5 : 1,
                          background: THEMES[theme].bg,
                          color: THEMES[theme].fg,
                          border: `2px solid ${s.index === current ? "var(--brand)" : "transparent"}`,
                          display: "flex", flexDirection: "column", justifyContent: "space-between",
                          padding: 7, textAlign: "start",
                        }}
                      >
                        <span style={{ ...mono, fontSize: 8.5, opacity: locked ? 0.5 : 0.75 }}>
                          {ARCHETYPE_LABEL[s.archetype] ?? s.archetype}
                        </span>
                        <span style={{ ...mono, fontSize: 9, color: bad ? THEMES[theme].alert : THEMES[theme].accent }}>
                          {s.index + 1}/{deck.slides.length}
                        </span>
                      </button>
                      {/* Touch and keyboard need an explicit control; drag alone is not enough. */}
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        {locked ? (
                          <span style={{ ...mono, fontSize: 8.5, color: "var(--text-secondary)", textAlign: "center" }}>
                            {s.index === 0
                              ? (lang === "ar" ? "تبقى الأولى دائمًا" : "Always first")
                              : (lang === "ar" ? "تبقى الأخيرة دائمًا" : "Always last")}
                          </span>
                        ) : (
                        <>
                        <button
                          type="button"
                          aria-label={`Move slide ${s.index + 1} earlier`}
                          disabled={locked || isLocked(deck, deck.slides[s.index - 1] ?? s) || s.index === 0}
                          onClick={() => reorder(s.index, s.index - 1)}
                          style={stepBtn}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          aria-label={`Move slide ${s.index + 1} later`}
                          disabled={locked || isLocked(deck, deck.slides[s.index + 1] ?? s)}
                          onClick={() => reorder(s.index, s.index + 1)}
                          style={stepBtn}
                        >
                          ›
                        </button>
                        </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr", alignItems: "start" }} className="studio-split">
              <div ref={canvasBoxRef} style={{ minWidth: 0 }}>
                <StudioCanvas
                  deck={deck}
                  theme={theme}
                  width={canvasWidth}
                  current={current}
                  mountRef={mountRef}
                  onFit={(index, state) =>
                    setFits((prev) => {
                      const old = prev[index];
                      if (old && old.step === state.step && old.failed === state.failed) return prev;
                      return { ...prev, [index]: state };
                    })
                  }
                />
              </div>

              {deck.slides.length > 1 && (
                <div
                  dir={deck.dir}
                  style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginTop: 10 }}
                >
                  <button
                    type="button"
                    aria-label={lang === "ar" ? "الشريحة السابقة" : "Previous slide"}
                    disabled={current === 0}
                    onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                    style={{
                      minWidth: 34, minHeight: 34, borderRadius: 8,
                      border: "1px solid var(--border-default)", background: "transparent",
                      color: "var(--act)", fontSize: 16,
                      cursor: current === 0 ? "not-allowed" : "pointer",
                      opacity: current === 0 ? 0.4 : 1,
                    }}
                  >
                    ‹
                  </button>
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    {lang === "ar"
                      ? `الشريحة ${current + 1} من ${deck.slides.length}`
                      : `Slide ${current + 1} of ${deck.slides.length}`}
                  </span>
                  <button
                    type="button"
                    aria-label={lang === "ar" ? "الشريحة التالية" : "Next slide"}
                    disabled={current === deck.slides.length - 1}
                    onClick={() => setCurrent((c) => Math.min(deck.slides.length - 1, c + 1))}
                    style={{
                      minWidth: 34, minHeight: 34, borderRadius: 8,
                      border: "1px solid var(--border-default)", background: "transparent",
                      color: "var(--act)", fontSize: 16,
                      cursor: current === deck.slides.length - 1 ? "not-allowed" : "pointer",
                      opacity: current === deck.slides.length - 1 ? 0.4 : 1,
                    }}
                  >
                    ›
                  </button>
                </div>
              )}

              <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
                {/* 7 · quality, visible */}
                <div style={{ ...panel, display: "grid", gap: 8 }}>
                  {allFailures.length === 0 ? (
                    <div style={{ display: "flex", gap: 7, alignItems: "center", color: "var(--success)" }}>
                      <CheckCircle2 size={14} /><span style={{ fontSize: 13 }}>All checks passed</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ ...mono, color: "var(--error)" }}>
                        {lang === "ar"
                          ? `${issues.length} بحاجة إلى إصلاح`
                          : issues.length === 1
                            ? "1 thing to fix"
                            : `${issues.length} things to fix`}
                      </div>
                      {issues.slice(0, 6).map((it, i) => (
                        <div key={i} style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                          {it.text}
                          {it.index !== undefined && (
                            <button
                              type="button"
                              onClick={() => {
                                setCurrent(it.index!);
                                canvasBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                              }}
                              style={{
                                marginInlineStart: 8, background: "none", border: "none", padding: 0,
                                color: "var(--act)", fontFamily: "var(--ff-ui)", fontSize: 12.5, cursor: "pointer",
                              }}
                            >
                              {lang === "ar" ? "أصلح هذا ←" : "Fix this →"}
                            </button>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {notes.slice(0, 4).map((f, i) => (
                    <div key={`n${i}`} style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {plainFailure(f)}
                    </div>
                  ))}
                  {voiceFlags.includes("no_voice_profile") && (
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      This will sound more like you once Aura has read a few of your posts.
                    </div>
                  )}
                  {voiceFlags.includes("voice_profile_other_language") && (
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      Aura only knows your writing in your other language, so it followed your rhythm here, not your phrases.
                    </div>
                  )}
                  {noFigure && (
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      This signal carries no figure, so this deck makes no claim to one.
                    </div>
                  )}
                  {!hasAvatar && (
                    <a href="/settings" style={{ fontSize: 12.5, color: "var(--brand)", lineHeight: 1.6 }}>
                      Add a photo — your face is the most recognised thing in a feed.
                    </a>
                  )}
                </div>

                {/* 5 · edit */}
                <div style={panel}>
                  <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid var(--border-default)" }}>
                    <IdentityBlock deck={deck} onChange={setDeck} />
                  </div>
                  <EditPanel
                    deck={deck}
                    slide={deck.slides[Math.min(current, deck.slides.length - 1)]}
                    onChange={(next) => { setDeck(next); setCurrent((c) => Math.min(c, next.slides.length - 1)); }}
                    onRewrite={rewriteSlide}
                    rewriting={rewriting}
                    onUploadPhoto={uploadPhoto}
                    mediaError={mediaError}
                    mediaSupport={mediaSupport(deck.slides[Math.min(current, deck.slides.length - 1)].archetype)}
                  />
                </div>

                {/* 8 · finish */}
                <div style={{ ...panel, display: "grid", gap: 12 }}>
                  {/* the caption — the post body that carries the deck */}
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ ...mono, color: "var(--text-muted)" }}>Caption</span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(caption).then(() => {
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1600);
                          });
                        }}
                        style={{
                          ...mono, background: "none", border: "none", padding: 0, cursor: "pointer",
                          color: copied ? "var(--success)" : "var(--text-muted)",
                          display: "flex", alignItems: "center", gap: 5,
                        }}
                      >
                        <Copy size={12} />{copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      dir={deck.dir}
                      rows={6}
                      placeholder="Write the words that sit above the deck."
                      style={{
                        width: "100%", boxSizing: "border-box", resize: "vertical",
                        padding: 12, borderRadius: 12, background: "var(--surface-subtle)",
                        border: "1px solid var(--border-default)", color: "var(--text-primary)",
                        fontFamily: "var(--ff-ui)", fontSize: 14, lineHeight: 1.65, outline: "none",
                      }}
                    />
                  </div>

                  {!published && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <ButtonPrimary onClick={publishToLinkedIn} disabled={!!publishing || !!busy}>
                        <Linkedin size={13} />{publishing ?? "Publish to LinkedIn"}
                      </ButtonPrimary>
                      <ButtonGhost onClick={() => runExport("pdf")} disabled={!!busy || !!publishing}>
                        <FileDown size={13} />{busy === "pdf" ? "Exporting" : "Export PDF"}
                      </ButtonGhost>
                      <ButtonGhost onClick={() => runExport("png")} disabled={!!busy || !!publishing}>
                        <Images size={13} />{busy === "png" ? "Exporting" : "Export images"}
                      </ButtonGhost>
                    </div>
                  )}
                  {exported && <div style={{ ...mono, color: "var(--success)" }}>{exported}</div>}
                  {error && <div style={{ fontSize: 13, color: "var(--error)" }}>{error}</div>}

                  {published && (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", gap: 7, alignItems: "center", color: "var(--success)" }}>
                        <CheckCircle2 size={14} />
                        <span style={{ fontSize: 13 }}>Published, and counted as published through Aura.</span>
                      </div>
                      {postUrl && (
                        <a href={postUrl} target="_blank" rel="noreferrer" style={{ ...mono, color: "var(--brand)" }}>
                          View it on LinkedIn
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity: .45 } 50% { opacity: .9 } }
        @media (min-width: 900px) {
          .studio-split { grid-template-columns: minmax(0, 460px) minmax(0, 1fr) !important; }
        }
      `}</style>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Control({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ ...mono, color: "var(--text-muted)" }}>{label}</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{children}</div>
    </div>
  );
}

function Pill({
  active, disabled, title, onClick, children,
}: React.PropsWithChildren<{ active?: boolean; disabled?: boolean; title?: string; onClick: () => void }>) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...mono,
        borderRadius: 999,
        padding: "7px 13px",
        cursor: disabled ? "not-allowed" : "pointer",
        background: active ? "var(--surface-inverse)" : "var(--surface-card)",
        color: disabled ? "var(--text-disabled)" : active ? "var(--text-inverse)" : "var(--text-primary)",
        border: `1px solid ${active ? "var(--surface-inverse)" : "var(--border-default)"}`,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}