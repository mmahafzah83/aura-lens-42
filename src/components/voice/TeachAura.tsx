/**
 * Teach Aura — where the member's voice comes from, and what's missing.
 *
 * The LinkedIn address is not editable here: it lives in Settings →
 * Connections, and `linkedin_connections` is its only home. This page shows
 * what Aura read and links there.
 *
 * A failed read is reported as a failed read. It is never shown as an empty
 * corpus, which is a different and much more alarming thing to tell someone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { displayDate, arabicList, arStyle } from "@/lib/arDisplay";
import { corpusWord, isoNum, traitWord } from "@/lib/voiceText";
import {
  loadTeachAura, MIN_POSTS_FOR_COVERAGE, splitPastedPosts, addOwnWriting, addAdmiredPost, removeAdmiredPost,
  ADMIRED_CAP, teachErrorText, type TeachAuraModel,
} from "@/lib/teachAura";
import TeachAuraCoverage from "@/components/voice/TeachAuraCoverage";
import TeachAuraReview from "@/components/voice/TeachAuraReview";
import { useCachedVoice, invalidateVoiceCache } from "@/lib/voiceCache";
import {
  AMBER_TEXT, BLUE, GREEN, INK, LINE, MUTED, RED, TYPE, cardStyle, chipStyle, ghostButton, microLabel, monoNum, primaryButton,
} from "@/components/voice/tokens";

/** The three stages of a re-read, named so the member knows what's happening. */
const STAGES = ["Reading your posts…", "Reading your patterns…", "Updating your voice…"] as const;

function Card({ children }: { children: React.ReactNode }) {
  return <div style={cardStyle}>{children}</div>;
}

export default function TeachAura({ userId }: { userId: string | null }) {
  const { t } = useTranslation();
  const { lang, t: tt } = useLanguage();
  const ar = lang === "ar";
  const tr = { lang, t: tt };
  /** English stays exactly as written; Arabic reads the key. */
  const L = (en: string, key: string, vars?: Record<string, unknown>) => (ar ? tt(key, vars) : en);
  /** A thrown message: English unchanged; Arabic never shows raw server text. */
  const errText = (e: unknown, en: string, key: string) =>
    e instanceof Error ? teachErrorText(e.message.split("\n")[0], key, tr) : L(en, key);
  const enDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const shownDate = (iso: string) => (ar ? displayDate(iso, lang) : enDate(iso));
  const Arrow = ar ? ChevronLeft : ChevronRight;
  const [stage, setStage] = useState<number | null>(null);
  const [lastRead, setLastRead] = useState<string | null | undefined>(undefined);
  const [readSummary, setReadSummary] = useState<string>("");
  /** One read at a time. A second press is a no-op, never a second request. */
  const reading = useRef(false);

  const key = userId ? `voice:teach:${userId}` : null;
  const loader = useCallback(() => loadTeachAura(userId as string), [userId]);
  const state = useCachedVoice<TeachAuraModel>(key, loader);
  const model = state.data;

  /** Last time Aura read this member's LinkedIn profile. */
  const loadLastRead = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("linkedin_profile_snapshots")
      .select("fetched_at")
      .eq("user_id", userId)
      .order("fetched_at", { ascending: false })
      .limit(1);
    setLastRead((data as any)?.[0]?.fetched_at ?? null);
  }, [userId]);

  useEffect(() => { void loadLastRead(); }, [loadLastRead]);

  /** Profile first, then posts — the same order as onboarding. */
  const rereadLinkedIn = useCallback(async () => {
    const profile_url = model?.address.profileUrl;
    if (!profile_url || reading.current) return;
    reading.current = true;
    setReadSummary("");
    try {
      setStage(0);
      const { data: prof, error: profErr } = await supabase.functions.invoke("linkedin-fetch-profile", {
        body: { profile_url },
      });
      if (profErr) throw profErr;
      if ((prof as any)?.error) throw new Error(String((prof as any).error));
      setStage(1);
      const { data: posts, error: postsErr } = await supabase.functions.invoke("linkedin-fetch-posts", {
        body: { profile_url, max_posts: 50 },
      });
      if (postsErr) throw postsErr;
      const kept = typeof (posts as any)?.kept_own_text === "number" ? (posts as any).kept_own_text : 0;
      setReadSummary(L(`KnownBy read your profile and ${kept} of your posts.`, "vo.ta.readSummary", { kept: isoNum(kept) }));
      invalidateVoiceCache("voice:");
      await state.reload(true);
      await loadLastRead();
    } catch (e) {
      toast.error(errText(e, "Couldn't read your LinkedIn just now.", "vo.ta.tLinkedIn"));
    } finally {
      reading.current = false;
      setStage(null);
    }
  }, [model, state, loadLastRead]);

  /** Setting posts aside changes the measured traits — say what moved, once. */
  const recompute = useCallback(async () => {
    const before = await snapshotTraits(userId);
    // Awaited: the "what moved" line must not race the function that moves it.
    const { data: res, error } = await supabase.functions.invoke("voice-compute-traits", { body: {} });
    if (error) {
      toast.error(L("KnownBy couldn't re-read your patterns just now. Your changes were saved.", "vo.ta.tPatterns"));
    } else {
      const after = await snapshotTraits(userId);
      const moved = Object.keys(after).filter((k) => before[k] !== undefined && before[k] !== after[k]);
      const lockedSkipped = Number((res as any)?.traits_skipped_locked ?? 0);
      const written = Number((res as any)?.traits_written ?? moved.length);
      if (moved.length === 0) {
        /* A locked marker is a decision the member made — never report it as
           "your posts didn't matter". */
        if (written === 0 && lockedSkipped > 0) {
          toast.message(L("Nothing changed — every marker is locked. Open one so KnownBy can adjust it.", "vo.ta.tLocked"));
        } else {
          toast.message(L("Nothing moved — those posts weren't changing your voice.", "vo.ta.tNothing"));
        }
      } else {
        const k = moved[0];
        toast.success(L(`That changed ${k.replace(/_/g, " ")} from ${before[k]}% to ${after[k]}%.`, "vo.ta.tMoved", { trait: traitWord(k, tr), before: isoNum(before[k]), after: isoNum(after[k]) }));
      }
    }
    invalidateVoiceCache("voice:");
    await state.reload(true);
  }, [userId, state]);

  const reread = useCallback(async () => {
    if (!model?.address.profileUrl || reading.current) return;
    reading.current = true;
    try {
      setStage(0);
      const { error } = await supabase.functions.invoke("linkedin-fetch-posts", {
        body: { profile_url: model.address.profileUrl },
      });
      if (error) throw error;
      setStage(1);
      await supabase.functions.invoke("voice-classify-posts", { body: {} });
      setStage(2);
      const { data: traits } = await supabase.functions.invoke("voice-compute-traits", { body: {} });
      const lockedSkipped = Number((traits as any)?.traits_skipped_locked ?? 0);
      const written = Number((traits as any)?.traits_written ?? 0);
      if (written === 0 && lockedSkipped > 0) {
        toast.message(L("Nothing changed — every marker is locked. Open one so KnownBy can adjust it.", "vo.ta.tLocked"));
      } else {
        toast.success(L("KnownBy re-read your posts.", "vo.ta.tReread"));
      }
      invalidateVoiceCache("voice:");
      await state.reload(true);
    } catch (e) {
      toast.error(errText(e, "Couldn't read your posts.", "vo.ta.tPosts"));
    } finally {
      reading.current = false;
      setStage(null);
    }
  }, [model, state]);


  /* ── the controls this page offers ─────────────────────────────────────── */
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [adding, setAdding] = useState(false);
  const [addReport, setAddReport] = useState<string | null>(null);
  const [admiredText, setAdmiredText] = useState("");
  const [admiredSource, setAdmiredSource] = useState("");
  const [addingAdmired, setAddingAdmired] = useState(false);

  const addWriting = useCallback(async (posts: string[]) => {
    setAdding(true);
    setAddReport(null);
    try {
      const r = await addOwnWriting(posts);
      const parts = [L(`${r.admitted} added.`, "vo.ta.rAdded", { n: isoNum(r.admitted) })];
      if (r.tooShort > 0) parts.push(L(`${r.tooShort} rejected — under 200 characters, too short to read a style from.`, "vo.ta.rShort", { n: isoNum(r.tooShort) }));
      if (r.wrongSource > 0) parts.push(L(`${r.wrongSource} rejected — they did not pass the own-writing rule.`, "vo.ta.rWrong", { n: isoNum(r.wrongSource) }));
      setAddReport(parts.join(" "));
      setPasteText("");
      invalidateVoiceCache("voice:");
      await state.reload(true);
    } catch (e) {
      toast.error(errText(e, "Couldn't add that writing.", "vo.ta.tAdd"));
    } finally {
      setAdding(false);
    }
  }, [state]);

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files || [])[0];
    if (!file) return;
    try {
      const text = await file.text();
      await addWriting(splitPastedPosts(text));
    } catch {
      toast.error(L("Couldn't read that file. Use a .txt or .md file.", "vo.ta.tFile"));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [addWriting]);

  const addAdmired = useCallback(async () => {
    if (!userId) return;
    setAddingAdmired(true);
    try {
      await addAdmiredPost(userId, admiredText, admiredSource);
      setAdmiredText("");
      setAdmiredSource("");
      invalidateVoiceCache("voice:");
      await state.reload(true);
    } catch (e) {
      toast.error(errText(e, "Couldn't save that.", "vo.ta.tSave"));
    } finally {
      setAddingAdmired(false);
    }
  }, [userId, admiredText, admiredSource, state]);

  const dropAdmired = useCallback(async (index: number) => {
    if (!userId) return;
    try {
      await removeAdmiredPost(userId, index);
      invalidateVoiceCache("voice:");
      await state.reload(true);
    } catch (e) {
      toast.error(errText(e, "Couldn't remove that.", "vo.ta.tRemove"));
    }
  }, [userId, state]);


  if (!userId) return <Card><span style={arStyle(lang, { fontSize: TYPE.body, color: MUTED })}>{L("Sign in to see what KnownBy read.", "vo.ta.signIn")}</span></Card>;
  if (state.loading && !model) {
    return <Card><span style={arStyle(lang, { fontSize: TYPE.body, color: MUTED })}>{L("Loading what KnownBy read…", "vo.ta.loading")}</span></Card>;
  }

  /* A failure is a failure — not "nothing read yet". */
  if (state.error && !model) {
    return (
      <Card>
        <div style={{ fontSize: TYPE.title, fontWeight: 600, color: INK }}>{L("KnownBy couldn't load what it read.", "vo.ta.errTitle")}</div>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, marginBlock: "8px 14px" }}>
          {ar ? tt("vo.ta.errBody") : <>Your writing is safe — this is a connection problem, not an empty file. {state.error}</>}
        </p>
        <button type="button" style={primaryButton} onClick={() => void state.reload(true)}>{L("Try again", "vo.ta.retry")}</button>
      </Card>
    );
  }

  /* Nothing connected. No zeros, and no second address field — the address is
     set in Settings → Connections and nowhere else. */
  if (!model || !model.address.handle) {
    return (
      <Card>
        <div style={{ fontSize: TYPE.section, fontWeight: 600, color: INK }}>
          {L("KnownBy hasn't read anything you've written yet.", "vo.ta.emptyTitle")}
        </div>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, marginBlock: "8px 12px" }}>
          {L("Add your LinkedIn address in Settings and KnownBy learns your voice from your own posts.", "vo.ta.emptyBody")}
        </p>
        <Link
          to="/settings?tab=connections"
          style={{ ...primaryButton, minBlockSize: 44, display: "inline-flex", alignItems: "center", textDecoration: "none" }}
        >
          {L("Add it in Settings", "vo.ta.emptyCta")}
        </Link>
      </Card>
    );
  }

  const noPosts = model.totalPosts === 0;

  return (
    <div>
      <h2 style={{ fontSize: TYPE.section, fontWeight: 600, color: INK, margin: "0 0 8px" }}>{L("Where your voice comes from", "vo.ta.whereTitle")}</h2>
      <Card>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>
                {L(`Your LinkedIn posts — ${model.includedCount} counted`, "vo.ta.postsCounted", { n: isoNum(model.includedCount) })}
              </span>
              <span dir="ltr" style={{ fontSize: TYPE.body, color: MUTED }}>@{model.address.handle}</span>
              {/* The shared rule decides this word. This file does not. */}
              {model.status.tone === "green"
                ? <span style={chipStyle(GREEN, "#EAF6F0", "#BFE3D3")}>{t(model.status.labelKey)}</span>
                : <span style={chipStyle(AMBER_TEXT, "#FBF3E0", "#EBD8A8")}>{t(model.status.labelKey)}</span>}
            </div>
            <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlock: "6px 0" }}>
              {L("These are the only posts that shape how KnownBy writes for you.", "vo.ta.onlyPosts")}
            </p>

            <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlock: "6px 0" }}>
              {/* Two different facts, said in two different ways: when Aura last
                  read the profile, and when it last read the posts. */}
              {noPosts
                ? L("KnownBy hasn't read any of your posts yet.", "vo.ta.noPosts")
                : ar
                  ? (model.address.lastSyncedAt
                    ? tt("vo.ta.lastPosts", { date: shownDate(model.address.lastSyncedAt) })
                    : tt("vo.ta.lastPostsNever"))
                  : `KnownBy last read your posts ${
                    model.address.lastSyncedAt
                      ? enDate(model.address.lastSyncedAt)
                      : "— not yet"
                  }`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => void reread()}
              disabled={stage !== null}
              style={{ ...primaryButton, opacity: stage !== null ? 0.6 : 1, display: "flex", gap: 6, alignItems: "center" }}
            >
              {stage !== null && <Loader2 size={13} className="animate-spin" />}
              {noPosts ? L("Read my posts", "vo.ta.readPosts") : L("Re-read my posts", "vo.ta.rereadPosts")}
            </button>
            <Link to="/settings?tab=connections" style={{ fontSize: TYPE.body, color: BLUE, fontWeight: 500, textDecoration: "none" }}>
              {ar ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{tt("vo.ta.changeSettings")}<Arrow size={14} aria-hidden /></span> : "Change in Settings →"}
            </Link>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBlockStart: 10 }}>
          <button
            type="button"
            onClick={() => void rereadLinkedIn()}
            disabled={stage !== null}
            style={{ ...ghostButton, opacity: stage !== null ? 0.6 : 1, display: "flex", gap: 6, alignItems: "center", minBlockSize: 44 }}
          >
            {stage !== null && <Loader2 size={12} className="animate-spin" />}
            {L("Re-read my LinkedIn", "vo.ta.rereadLinkedIn")}
          </button>
          <span style={ar ? arStyle(lang, { fontSize: TYPE.small, color: MUTED }) : { ...monoNum, fontSize: TYPE.small, color: MUTED }}>
            {lastRead === undefined ? "" : lastRead
              ? L(`KnownBy last read your profile ${enDate(lastRead)}`, "vo.ta.lastProfile", { date: ar ? shownDate(lastRead) : "" })
              : L("KnownBy hasn't read your profile yet", "vo.ta.noProfile")}
          </span>
        </div>
        {readSummary && (
          <p style={{ fontSize: TYPE.small, color: MUTED, marginBlockStart: 8 }}>{readSummary}</p>
        )}
        {stage !== null && (
          <p style={{ fontSize: TYPE.small, color: MUTED, marginBlockStart: 10 }}>
            {ar ? `${tt(`vo.ta.stage${stage}`)} ${tt("vo.ta.stageWait")}` : <>{STAGES[stage]} This can take up to a minute and a half — you can leave this open.</>}
          </p>
        )}

        {/* Writing the member added themselves — a paste or an upload. */}
        <div style={{ borderBlockStart: `1px solid ${LINE}`, marginBlockStart: 14, paddingBlockStart: 12 }}>
          <span style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>
            {L(`Writing you added yourself — ${model.addedByYouCount}`, "vo.ta.addedTitle", { n: isoNum(model.addedByYouCount) })}
          </span>
          <p style={{ fontSize: TYPE.body, color: MUTED, marginBlock: "6px 8px", lineHeight: 1.6 }}>
            {L("Posts you wrote that are not on your LinkedIn. They join your posts as evidence of how you write.", "vo.ta.addedBody")}
          </p>
          <textarea
            dir="auto"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            aria-label={L("Paste your own writing", "vo.ta.pasteAria")}
            placeholder={L("Paste one or more of your own posts — leave a blank line between them…", "vo.ta.pastePh")}
            style={{
              inlineSize: "100%", border: `1px solid ${LINE}`, borderRadius: 12, padding: 10,
              fontSize: TYPE.body, lineHeight: 1.6, color: INK, background: "#FFFFFF", resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBlockStart: 8 }}>
            <button
              type="button"
              disabled={adding || !pasteText.trim()}
              onClick={() => void addWriting(splitPastedPosts(pasteText))}
              style={{ ...ghostButton, minBlockSize: 44, display: "flex", gap: 6, alignItems: "center", opacity: adding || !pasteText.trim() ? 0.6 : 1 }}
            >
              {adding && <Loader2 size={13} className="animate-spin" />} {L("Add this writing", "vo.ta.addWriting")}
            </button>
            <button
              type="button"
              disabled={adding}
              onClick={() => fileRef.current?.click()}
              style={{ ...ghostButton, minBlockSize: 44, display: "flex", gap: 6, alignItems: "center" }}
            >
              <Upload size={13} /> {L("Upload a .txt or .md file", "vo.ta.upload")}
            </button>
            <input ref={fileRef} type="file" accept=".txt,.md" hidden onChange={(e) => void onFile(e)} />
          </div>
          {addReport && <p style={{ fontSize: TYPE.small, color: MUTED, marginBlockStart: 8 }}>{addReport}</p>}
        </div>

        {/* Posts the member admires — reference only, never reused. */}
        <div style={{ borderBlockStart: `1px solid ${LINE}`, marginBlockStart: 12, paddingBlockStart: 12 }}>
          <span style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>
            {L(`Posts you admire — ${model.admired.length}`, "vo.ta.admiredTitle", { n: isoNum(model.admired.length) })}
          </span>
          <p style={{ fontSize: TYPE.body, color: MUTED, marginBlock: "6px 8px", lineHeight: 1.6 }}>
            {ar ? tt("vo.ta.admiredBody", { cap: isoNum(ADMIRED_CAP) }) : <>Someone else's writing you want to sound closer to. KnownBy learns tone from these — it never reuses their
            words or claims them as yours. Up to {ADMIRED_CAP}.</>}
          </p>
          {model.admired.length > 0 && (
            <ul style={{ listStyle: "none", margin: "0 0 8px", padding: 0, display: "grid", gap: 6 }}>
              {model.admired.map((a, i) => (
                <li key={`${i}-${a.addedAt ?? ""}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: TYPE.small, color: MUTED, flex: 1, lineHeight: 1.5 }} dir="auto">
                    {a.content.slice(0, 120)}{a.content.length > 120 ? "…" : ""}
                    {a.source ? L(` — ${a.source}`, "vo.ta.srcSuffix", { source: a.source }) : L(" — source not noted", "vo.ta.srcNone")}
                  </span>
                  <button
                    type="button"
                    aria-label={L("Remove this admired post", "vo.ta.removeAdmired")}
                    onClick={() => void dropAdmired(i)}
                    style={{ ...ghostButton, minBlockSize: 44, minInlineSize: 44, display: "flex", alignItems: "center", justifyContent: "center", color: RED }}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {model.admired.length < ADMIRED_CAP && (
            <>
              <textarea
                dir="auto"
                value={admiredText}
                onChange={(e) => setAdmiredText(e.target.value)}
                rows={3}
                aria-label={L("Paste a post you admire", "vo.ta.admiredPh")}
                placeholder={L("Paste a post you admire — not your own…", "vo.ta.admiredPh")}
                style={{
                  inlineSize: "100%", border: `1px solid ${LINE}`, borderRadius: 12, padding: 10,
                  fontSize: TYPE.body, lineHeight: 1.6, color: INK, background: "#FFFFFF", resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBlockStart: 8 }}>
                <input
                  value={admiredSource}
                  onChange={(e) => setAdmiredSource(e.target.value)}
                  dir="auto"
                  aria-label={L("Who wrote it", "vo.ta.whoWrote")}
                  placeholder={L("Who wrote it", "vo.ta.whoWrote")}
                  style={{
                    flex: "1 1 180px", minBlockSize: 44, padding: "0 12px", fontSize: TYPE.body,
                    border: `1px solid ${LINE}`, borderRadius: 8, color: INK, background: "#FFFFFF",
                  }}
                />
                <button
                  type="button"
                  disabled={addingAdmired || !admiredText.trim()}
                  onClick={() => void addAdmired()}
                  style={{ ...ghostButton, minBlockSize: 44, opacity: addingAdmired || !admiredText.trim() ? 0.6 : 1 }}
                >
                  {addingAdmired ? L("Saving…", "vo.ta.saving") : L("Add this post", "vo.ta.addPost")}
                </button>
              </div>
            </>
          )}
        </div>
      </Card>

      <p style={{ fontSize: TYPE.small, color: MUTED, marginBlockStart: 8, lineHeight: 1.6 }}>
        {ar ? tt("vo.ta.docs", { n: isoNum(model.documentCount) }) : <>{model.documentCount} document{model.documentCount === 1 ? "" : "s"} feed what KnownBy knows, not how you sound.</>}{" "}
        <Link to="/home?tab=intelligence" style={{ color: BLUE, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 2 }}>
          {ar ? <>{tt("vo.ta.docsLink")}<Arrow size={13} aria-hidden /></> : "See them →"}
        </Link>
      </p>

      <p style={{ fontSize: TYPE.small, color: MUTED, marginBlockStart: 6, lineHeight: 1.6 }}>
        {ar ? tt("vo.ta.examples", { n: isoNum(model.examples.length) }) : <>Examples KnownBy kept from your posts — {model.examples.length}</>}
        {model.examples.length > 0
          ? ar
            ? tt("vo.ta.examplesLabels", { labels: arabicList(Array.from(new Set(model.examples.map((e) => corpusWord(e.sourceLabel, tr))))) })
            : `: ${Array.from(new Set(model.examples.map((e) => e.sourceLabel))).join(", ")}`
          : ""}
      </p>

      <p style={{ fontSize: TYPE.small, color: MUTED, marginBlockStart: 6, lineHeight: 1.6 }}>
        {L("Publishing a draft teaches KnownBy nothing, on purpose — learning from its own writing is how a voice goes stale.", "vo.ta.publishing")}
      </p>

      {model.negativeVerdicts >= 3 && (
        <div style={{ ...cardStyle, marginBlockStart: 10 }}>
          <div style={{ fontSize: TYPE.body, color: INK, lineHeight: 1.6 }}>
            {ar
              ? [tt("vo.ta.neg", { n: isoNum(model.negativeVerdicts) }),
                 model.negativeDimension ? tt("vo.ta.negDim", { dimension: traitWord(model.negativeDimension.replace(/ /g, "_"), tr) }) : "",
                 tt("vo.ta.negFix")].filter(Boolean).join(" ")
              : <>You have told KnownBy {model.negativeVerdicts} times in the last two weeks that a draft did not sound like you
            {model.negativeDimension ? `, mostly about ${model.negativeDimension}` : ""}. A re-read of your posts is the fix.</>}
          </div>
          <button
            type="button"
            onClick={() => void reread()}
            disabled={stage !== null}
            style={{ ...ghostButton, minBlockSize: 44, marginBlockStart: 8, opacity: stage !== null ? 0.6 : 1 }}
          >
            {L("Re-read my posts", "vo.ta.rereadPosts")}
          </button>
        </div>
      )}



      {!noPosts && (
        <>
          <TeachAuraReview
            posts={model.posts}
            includedCount={model.includedCount}
            excludedCount={model.excludedCount}
            ambiguous={model.ambiguous}
            onApplied={async () => { await recompute(); }}
          />
          <TeachAuraCoverage
            coverage={model.coverage}
            includedCount={model.includedCount}
            textlessWithEngagement={model.textlessWithEngagement}
          />
        </>
      )}

      {!noPosts && model.includedCount < MIN_POSTS_FOR_COVERAGE && (
        <p style={ar ? arStyle(lang, { fontSize: TYPE.small, color: MUTED, marginBlockStart: 8 }) : { ...monoNum, fontSize: TYPE.small, color: MUTED, marginBlockStart: 8 }}>
          {L(`${model.includedCount} of ${MIN_POSTS_FOR_COVERAGE} posts read`, "vo.ta.readOf", { n: isoNum(model.includedCount), min: isoNum(MIN_POSTS_FOR_COVERAGE) })}
        </p>
      )}
      <div style={microLabel} aria-hidden />
    </div>
  );
}

/** Trait values before and after a recompute, so we can name what moved. */
async function snapshotTraits(userId: string | null): Promise<Record<string, number>> {
  if (!userId) return {};
  const { data } = await supabase.from("voice_traits").select("trait_key, value").eq("user_id", userId);
  const out: Record<string, number> = {};
  for (const row of data || []) out[String((row as any).trait_key)] = Number((row as any).value);
  return out;
}
