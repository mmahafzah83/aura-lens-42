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
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadTeachAura, MIN_POSTS_FOR_COVERAGE, type TeachAuraModel } from "@/lib/teachAura";
import TeachAuraCoverage from "@/components/voice/TeachAuraCoverage";
import TeachAuraReview from "@/components/voice/TeachAuraReview";
import { useCachedVoice, invalidateVoiceCache } from "@/lib/voiceCache";
import {
  BLUE, GREEN, INK, LINE, MUTED, TYPE, cardStyle, chipStyle, microLabel, monoNum, primaryButton,
} from "@/components/voice/tokens";

/** The three stages of a re-read, named so the member knows what's happening. */
const STAGES = ["Reading your posts…", "Reading your patterns…", "Updating your voice…"] as const;

function Card({ children }: { children: React.ReactNode }) {
  return <div style={cardStyle}>{children}</div>;
}

export default function TeachAura({ userId }: { userId: string | null }) {
  const [stage, setStage] = useState<number | null>(null);

  const key = userId ? `voice:teach:${userId}` : null;
  const loader = useCallback(() => loadTeachAura(userId as string), [userId]);
  const state = useCachedVoice<TeachAuraModel>(key, loader);
  const model = state.data;

  /** Setting posts aside changes the measured traits — say what moved, once. */
  const recompute = useCallback(async () => {
    const before = await snapshotTraits(userId);
    // Awaited: the "what moved" line must not race the function that moves it.
    const { error } = await supabase.functions.invoke("voice-compute-traits", { body: {} });
    if (error) {
      toast.error("Aura couldn't re-read your patterns just now. Your changes were saved.");
    } else {
      const after = await snapshotTraits(userId);
      const moved = Object.keys(after).filter((k) => before[k] !== undefined && before[k] !== after[k]);
      if (moved.length === 0) toast.message("Nothing moved — those posts weren't changing your voice.");
      else {
        const k = moved[0];
        toast.success(`That changed ${k.replace(/_/g, " ")} from ${before[k]}% to ${after[k]}%.`);
      }
    }
    invalidateVoiceCache("voice:");
    await state.reload(true);
  }, [userId, state]);

  const reread = useCallback(async () => {
    if (!model?.address.profileUrl) return;
    try {
      setStage(0);
      const { error } = await supabase.functions.invoke("linkedin-fetch-posts", {
        body: { profile_url: model.address.profileUrl },
      });
      if (error) throw error;
      setStage(1);
      await supabase.functions.invoke("voice-classify-posts", { body: {} });
      setStage(2);
      await supabase.functions.invoke("voice-compute-traits", { body: {} });
      toast.success("Aura re-read your posts.");
      invalidateVoiceCache("voice:");
      await state.reload(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message.split("\n")[0] : "Couldn't read your posts.");
    } finally {
      setStage(null);
    }
  }, [model, state]);

  if (!userId) return <Card><span style={{ fontSize: TYPE.body, color: MUTED }}>Sign in to see what Aura read.</span></Card>;
  if (state.loading && !model) {
    return <Card><span style={{ fontSize: TYPE.body, color: MUTED }}>Loading what Aura read…</span></Card>;
  }

  /* A failure is a failure — not "nothing read yet". */
  if (state.error && !model) {
    return (
      <Card>
        <div style={{ fontSize: TYPE.title, fontWeight: 600, color: INK }}>Aura couldn't load what it read.</div>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, marginBlock: "8px 14px" }}>
          Your writing is safe — this is a connection problem, not an empty file. {state.error}
        </p>
        <button type="button" style={primaryButton} onClick={() => void state.reload(true)}>Try again</button>
      </Card>
    );
  }

  /* Genuinely nothing connected. No zeros, no inline form. */
  if (!model || !model.address.handle) {
    return (
      <Card>
        <div style={{ fontSize: TYPE.section, fontWeight: 600, color: INK }}>
          Aura hasn't read anything you've written yet.
        </div>
        <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.65, marginBlock: "8px 14px" }}>
          Add your LinkedIn address and Aura learns your voice from your own posts.
        </p>
        <Link to="/settings?tab=connections" style={{ ...primaryButton, display: "inline-block", textDecoration: "none" }}>
          Add your LinkedIn address
        </Link>
      </Card>
    );
  }

  const noPosts = model.totalPosts === 0;

  return (
    <div>
      <h2 style={{ fontSize: TYPE.section, fontWeight: 600, color: INK, margin: "0 0 8px" }}>Where your voice comes from</h2>
      <Card>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>LinkedIn — @{model.address.handle}</span>
              <span style={chipStyle(GREEN, "#EAF6F0", "#BFE3D3")}>Connected</span>
            </div>
            <p style={{ fontSize: TYPE.body, color: MUTED, lineHeight: 1.6, marginBlock: "6px 0" }}>
              {noPosts
                ? "Connected, but Aura hasn't read any posts yet."
                : `Last sync ${
                    model.address.lastSyncedAt
                      ? new Date(model.address.lastSyncedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                      : "not yet"
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
              {noPosts ? "Read my posts" : "Re-read my posts"}
            </button>
            <Link to="/settings?tab=connections" style={{ fontSize: TYPE.body, color: BLUE, fontWeight: 500, textDecoration: "none" }}>
              Change in Settings →
            </Link>
          </div>
        </div>
        {stage !== null && (
          <p style={{ fontSize: TYPE.small, color: MUTED, marginBlockStart: 10 }}>
            {STAGES[stage]} This can take up to a minute and a half — you can leave this open.
          </p>
        )}

        <div style={{ borderBlockStart: `1px solid ${LINE}`, marginBlockStart: 14, paddingBlockStart: 12 }}>
          <span style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>Uploaded files</span>
          <p style={{ fontSize: TYPE.body, color: MUTED, marginBlock: "6px 0" }}>
            {model.documentCount > 0
              ? `${model.documentCount} document${model.documentCount === 1 ? "" : "s"} read`
              : "No files uploaded yet."}
          </p>
        </div>

        <div style={{ borderBlockStart: `1px solid ${LINE}`, marginBlockStart: 12, paddingBlockStart: 12 }}>
          <span style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>Pasted samples</span>
          <p style={{ fontSize: TYPE.body, color: MUTED, marginBlock: "6px 0" }}>
            {model.pastedCount > 0
              ? `${model.pastedCount} sample${model.pastedCount === 1 ? "" : "s"} pasted`
              : "No samples pasted yet."}
          </p>
        </div>
      </Card>

      {!noPosts && (
        <>
          <TeachAuraReview
            posts={model.posts}
            includedCount={model.includedCount}
            excludedCount={model.excludedCount}
            ambiguous={model.ambiguous}
            onApplied={async () => { await recompute(); }}
          />
          <TeachAuraCoverage coverage={model.coverage} includedCount={model.includedCount} />
        </>
      )}

      {!noPosts && model.includedCount < MIN_POSTS_FOR_COVERAGE && (
        <p style={{ ...monoNum, fontSize: TYPE.small, color: MUTED, marginBlockStart: 8 }}>
          {model.includedCount} of {MIN_POSTS_FOR_COVERAGE} posts read
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
