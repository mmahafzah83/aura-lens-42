import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { loadStartCards } from "@/components/composer/startCards";
import ProgressRail from "@/components/compose/ProgressRail";
import StepStart from "@/components/compose/StepStart";
import StepChoose, { fromStartCard, type ChoiceRow } from "@/components/compose/StepChoose";
import StepCheck from "@/components/compose/StepCheck";
import StepWrite from "@/components/compose/StepWrite";
import StepReview from "@/components/compose/StepReview";
import StepDone from "@/components/compose/StepDone";
import { LangToggle } from "@/components/compose/ui";
import { S, type Lang } from "@/components/compose/strings";
import { stripMarkdown, fixArabicDirectionalSymbols } from "@/lib/textFormat";

/**
 * /compose — a guided "write one post" pilot slice.
 * Self-contained: it touches no existing member screen.
 */
const Compose: React.FC = () => {
  const navigate = useNavigate();

  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>("");

  const [lang, setLang] = useState<Lang>("en");
  const [writeLang, setWriteLang] = useState<Lang>("en");
  const [step, setStep] = useState(1);

  // Choose
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rows, setRows] = useState<ChoiceRow[]>([]);
  const [totalSignals, setTotalSignals] = useState(0);
  const [showingAll, setShowingAll] = useState(false);
  const [selected, setSelected] = useState<ChoiceRow | null>(null);
  const [typedTopic, setTypedTopic] = useState("");

  // Check
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkTitle, setCheckTitle] = useState("");
  const [checkExplanation, setCheckExplanation] = useState("");
  const [checkMeaning, setCheckMeaning] = useState("");

  // Write / Review
  const [genError, setGenError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState<null | "post" | "save">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishDisabled, setPublishDisabled] = useState(false);

  // Done
  const [doneVariant, setDoneVariant] = useState<"posted" | "saved">("saved");
  const [postUrl, setPostUrl] = useState<string | null>(null);

  const align: "left" | "right" = lang === "ar" ? "right" : "left";
  const genRunId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) { setReady(true); return; }
      setUserId(session.user.id);
      setToken(session.access_token);
      const { data: profile } = await supabase
        .from("diagnostic_profiles")
        .select("content_language, first_name")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const seeded: Lang = (profile as any)?.content_language === "ar" ? "ar" : "en";
      setLang(seeded);
      setWriteLang(seeded);
      setFirstName(((profile as any)?.first_name as string) || "");
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  /** Step 2 — the real ranked brief. */
  const loadBrief = useCallback(async (uid: string) => {
    setRowsLoading(true);
    try {
      const { cards, totalSignals: total } = await loadStartCards(uid);
      setRows(cards.map(fromStartCard));
      setTotalSignals(total);
    } finally {
      setRowsLoading(false);
    }
  }, []);

  const loadEverything = useCallback(async () => {
    if (!userId) return;
    setRowsLoading(true);
    try {
      const { data } = await supabase
        .from("strategic_signals")
        .select("id, signal_title, explanation, what_it_means_for_you, fragment_count, confidence")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("strength_score", { ascending: false });
      setRows(((data as any[]) || []).filter((s) => s.signal_title).map((s) => ({
        id: s.id as string,
        title: s.signal_title as string,
        reason: (s.what_it_means_for_you || s.explanation || "") as string,
        insight: (s.what_it_means_for_you || s.explanation || "") as string,
        fragmentCount: (s.fragment_count as number) ?? 0,
      })));
      setShowingAll(true);
    } finally {
      setRowsLoading(false);
    }
  }, [userId]);

  /** Step 3 — the full argument behind the choice. */
  const loadCheck = useCallback(async () => {
    if (selected) {
      setCheckLoading(true);
      try {
        const { data } = await supabase
          .from("strategic_signals")
          .select("signal_title, explanation, what_it_means_for_you, strategic_implications")
          .eq("id", selected.id)
          .maybeSingle();
        const d = data as any;
        setCheckTitle((d?.signal_title as string) || selected.title);
        setCheckExplanation((d?.explanation as string) || "");
        const impl = d?.strategic_implications;
        setCheckMeaning(
          (d?.what_it_means_for_you as string) ||
          (Array.isArray(impl) ? impl.join(" ") : typeof impl === "string" ? impl : "")
        );
      } finally {
        setCheckLoading(false);
      }
    } else {
      setCheckTitle(typedTopic);
      setCheckExplanation("");
      setCheckMeaning("");
    }
  }, [selected, typedTopic]);

  /** Step 4 — real generation. */
  const generate = useCallback(async (opts?: { extraInstruction?: string; baseContent?: string; language?: Lang }) => {
    if (!token) return;
    const runId = ++genRunId.current;
    const useLang = opts?.language ?? writeLang;
    setGenError(null);
    setStep(4);

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 60000);
    try {
      // Always use a fresh token — the one captured at mount may have expired.
      const { data: sess } = await supabase.auth.getSession();
      const freshToken = sess?.session?.access_token;
      if (!freshToken) {
        window.clearTimeout(timer);
        setGenError("session");
        return;
      }
      setToken(freshToken);
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
          topic: selected?.title || typedTopic,
          context: opts?.baseContent ?? (selected?.insight || ""),
          language: useLang,
          signal_id: selected?.id || undefined,
          stream: false,
          ...(opts?.extraInstruction ? { extra_instruction: opts.extraInstruction } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (runId !== genRunId.current) return;
      const text = json?.content;
      if (!res.ok || !text) { setGenError("failed"); return; }
      const cleaned = fixArabicDirectionalSymbols(stripMarkdown(String(text)), useLang);
      setContent(cleaned);
      setNotice(null);
      setPublishDisabled(false);
      setStep(5);
    } catch {
      if (runId === genRunId.current) setGenError("failed");
    } finally {
      window.clearTimeout(timer);
    }
  }, [token, writeLang, selected, typedTopic]);

  /** Step 5 — save the draft row; shared by post and save-for-later. */
  const insertDraft = useCallback(async () => {
    if (!userId) return null;
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
        source_signal_id: selected?.id || null,
        source_metadata: {
          source: "compose",
          topic: (selected?.title || typedTopic) || null,
          language: writeLang,
          _language: writeLang,
          signal_ids: selected?.id ? [selected.id] : [],
        },
      } as any)
      .select("id")
      .single();
    if (error) return null;
    return (ins as any)?.id as string;
  }, [userId, content, selected, typedTopic, writeLang]);

  const handleSave = useCallback(async () => {
    setBusy("save");
    const id = await insertDraft();
    setBusy(null);
    if (!id) { setNotice(S.s5PostFailed[lang]); return; }
    setDoneVariant("saved");
    setStep(6);
  }, [insertDraft, lang]);

  const handlePost = useCallback(async () => {
    setBusy("post");
    setNotice(null);
    const id = await insertDraft();
    if (!id) { setBusy(null); setNotice(S.s5PostFailed[lang]); return; }
    await supabase.from("linkedin_posts").update({ publish_attempted_at: new Date().toISOString() }).eq("id", id);
    const { data, error } = await supabase.functions.invoke("linkedin-publish", {
      body: { postId: id, advisory: true },
    });
    setBusy(null);
    const payload = data as any;
    const message = `${payload?.error || ""} ${error?.message || ""}`.toLowerCase();

    if (payload?.success === true) {
      setPostUrl((payload?.postUrl as string) || null);
      setDoneVariant("posted");
      setStep(6);
      return;
    }
    if (message.includes("not connected")) {
      setNotice(S.s5NotConnected[lang]);
      setPublishDisabled(true);
      return;
    }
    setNotice(S.s5PostFailed[lang]);
  }, [insertDraft, lang]);

  const reset = () => {
    setStep(1);
    setSelected(null);
    setTypedTopic("");
    setRows([]);
    setShowingAll(false);
    setContent("");
    setNotice(null);
    setPostUrl(null);
    setPublishDisabled(false);
  };

  const shell = (children: React.ReactNode) => (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      style={{ minHeight: "100vh", background: "var(--surface-page)", padding: "32px 20px 80px" }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>{children}</div>
    </div>
  );

  if (!ready) {
    return shell(
      <p style={{ fontFamily: "var(--ff-ui)", fontSize: 14, color: "var(--text-secondary)" }}>{S.loading[lang]}</p>
    );
  }

  if (!userId) {
    return shell(
      <div>
        <h1 style={{ fontFamily: "var(--ff-ui)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          {S.signIn[lang]}
        </h1>
        <p style={{ marginTop: 12 }}>
          <Link to="/auth" style={{ fontFamily: "var(--ff-ui)", fontSize: 14, fontWeight: 600, color: "var(--act)" }}>
            {S.signInLink[lang]}
          </Link>
        </p>
      </div>
    );
  }

  return shell(
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--text-secondary)" }}>
          {S.greeting[lang]}{firstName ? `, ${firstName}` : ""}
        </span>
        <LangToggle lang={lang} onChange={(l) => { setLang(l); if (step < 4) setWriteLang(l); }} />
      </div>

      <ProgressRail step={step} lang={lang} />

      {step === 1 && (
        <StepStart
          lang={lang}
          align={align}
          onContinue={() => { setStep(2); if (userId) loadBrief(userId); }}
        />
      )}

      {step === 2 && (
        <StepChoose
          lang={lang}
          align={align}
          loading={rowsLoading}
          rows={rows}
          totalSignals={totalSignals}
          showingAll={showingAll}
          onSeeAll={loadEverything}
          selectedId={selected?.id ?? null}
          onSelect={(r) => { setSelected(r); setTypedTopic(""); }}
          typedTopic={typedTopic}
          onTypedTopic={(v) => { setTypedTopic(v); if (v) setSelected(null); }}
          onBack={() => setStep(1)}
          onNext={() => { setStep(3); loadCheck(); }}
          onGoCapture={() => navigate("/home")}
        />
      )}

      {step === 3 && (
        <StepCheck
          lang={lang}
          align={align}
          loading={checkLoading}
          title={checkTitle}
          explanation={checkExplanation}
          meaning={checkMeaning}
          writeLang={writeLang}
          onWriteLang={setWriteLang}
          onBack={() => setStep(2)}
          onNext={() => generate()}
        />
      )}

      {step === 4 && (
        <StepWrite lang={lang} error={genError} onRetry={() => generate()} onBack={() => setStep(3)} />
      )}

      {step === 5 && (
        <StepReview
          lang={lang}
          writeLang={writeLang}
          content={content}
          onContentChange={setContent}
          busy={busy}
          notice={notice}
          publishDisabled={publishDisabled}
          deckAvailable={!!selected?.id}
          onMakeDeck={async () => {
            await insertDraft();
            navigate(`/carousel-studio?signal=${selected!.id}&autogenerate=1`);
          }}
          onSwitchLanguage={() => {
            const other: Lang = writeLang === "ar" ? "en" : "ar";
            setWriteLang(other);
            generate({ language: other });
          }}
          onPost={handlePost}
          onSave={handleSave}
          onBack={() => setStep(3)}
        />
      )}

      {step === 6 && (
        <StepDone
          lang={lang}
          variant={doneVariant}
          postUrl={postUrl}
          onAnother={reset}
          onHome={() => navigate("/home")}
        />
      )}
    </>
  );
};

export default Compose;