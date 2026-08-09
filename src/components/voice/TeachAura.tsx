/**
 * Teach Aura — where the member's voice comes from, and what's missing.
 *
 * English chrome only, matching the rest of Voice & Writing. The LinkedIn
 * address is *not* editable here: it is edited in Settings → Connections and
 * during onboarding, and `linkedin_connections` is its only home. This page
 * shows what Aura read and links there.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadTeachAura, MIN_POSTS_FOR_COVERAGE, type TeachAuraModel } from "@/lib/teachAura";
import TeachAuraCoverage from "@/components/voice/TeachAuraCoverage";
import TeachAuraReview from "@/components/voice/TeachAuraReview";

const BLUE = "#0670C4";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/** The three stages of a re-read, named so the member knows what's happening. */
const STAGES = ["Reading your posts…", "Reading your patterns…", "Updating your voice…"] as const;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16 }}>
      {children}
    </div>
  );
}

function SettingsLink() {
  return (
    <Link to="/settings?tab=connections" style={{ fontSize: 12.5, color: BLUE, fontWeight: 500, textDecoration: "none" }}>
      Change in Settings →
    </Link>
  );
}

export default function TeachAura({ userId }: { userId: string | null }) {
  const [model, setModel] = useState<TeachAuraModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [stage, setStage] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      setModel(await loadTeachAura(userId, page));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read your sources.");
    } finally {
      setLoading(false);
    }
  }, [userId, page]);

  useEffect(() => { void refresh(); }, [refresh]);

  /** Excluding a post changes the measured traits — say what moved. */
  const recompute = useCallback(async () => {
    const before = await snapshotTraits(userId);
    await supabase.functions.invoke("voice-compute-traits", { body: {} }).catch(() => null);
    const after = await snapshotTraits(userId);
    const moved = Object.keys(after).filter((k) => before[k] !== undefined && before[k] !== after[k]);
    if (moved.length === 0) toast.message("Nothing moved — that post wasn't changing your voice.");
    else {
      const k = moved[0];
      toast.success(`Excluding that post changed ${k.replace(/_/g, " ")} from ${before[k]}% to ${after[k]}%.`);
    }
    void refresh();
  }, [userId, refresh]);

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
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message.split("\n")[0] : "Couldn't read your posts.");
    } finally {
      setStage(null);
    }
  }, [model, refresh]);

  if (loading) {
    return <Card><span style={{ fontSize: 13, color: MUTED }}>Loading what Aura read…</span></Card>;
  }

  /* Empty state 1 — no address at all. No zeros, no inline form. */
  if (!model || !model.address.handle) {
    return (
      <Card>
        <div style={{ fontSize: 15.5, fontWeight: 600, color: INK }}>
          Aura hasn't read anything you've written yet.
        </div>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, marginBlock: "8px 14px" }}>
          Add your LinkedIn address and Aura learns your voice from your own posts.
        </p>
        <Link
          to="/settings?tab=connections"
          style={{
            display: "inline-block", background: BLUE, color: "#FFFFFF", borderRadius: 10,
            padding: "9px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none",
          }}
        >
          Add your LinkedIn address
        </Link>
      </Card>
    );
  }

  const noPosts = model.totalPosts === 0;

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: INK, margin: "0 0 8px" }}>Where your voice comes from</h3>
      <Card>
        {/* LinkedIn */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>LinkedIn — @{model.address.handle}</span>
              <span
                style={{
                  fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999,
                  background: "#EAF6F0", color: "#12805C", border: "1px solid #BFE3D3",
                }}
              >
                Connected
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, marginBlock: "6px 0" }}>
              {noPosts
                ? "Connected, but Aura hasn't read any posts yet."
                : `${model.includedCount} of your own posts read · ${model.excludedCount} set aside as reposts, comments or shares · last sync ${
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
              style={{
                background: BLUE, color: "#FFFFFF", border: "none", borderRadius: 10, padding: "8px 14px",
                fontSize: 12.5, fontWeight: 600, cursor: stage !== null ? "default" : "pointer",
                opacity: stage !== null ? 0.6 : 1, display: "flex", gap: 6, alignItems: "center",
              }}
            >
              {stage !== null && <Loader2 size={13} className="animate-spin" />}
              {noPosts ? "Read my posts" : "Re-read my posts"}
            </button>
            <SettingsLink />
          </div>
        </div>
        {stage !== null && (
          <p style={{ fontSize: 12, color: MUTED, marginBlockStart: 10 }}>
            {STAGES[stage]} This can take up to a minute and a half — you can leave this open.
          </p>
        )}

        {/* Uploaded files */}
        <div style={{ borderBlockStart: `1px solid ${LINE}`, marginBlockStart: 14, paddingBlockStart: 12 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Uploaded files</span>
          <p style={{ fontSize: 12.5, color: MUTED, marginBlock: "6px 0" }}>
            {model.documentCount > 0
              ? `${model.documentCount} document${model.documentCount === 1 ? "" : "s"} read`
              : "No files uploaded yet."}
          </p>
        </div>

        {/* Pasted samples */}
        <div style={{ borderBlockStart: `1px solid ${LINE}`, marginBlockStart: 12, paddingBlockStart: 12 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Pasted samples</span>
          <p style={{ fontSize: 12.5, color: MUTED, marginBlock: "6px 0" }}>
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
            total={model.totalPosts}
            page={page}
            onPage={setPage}
            onChanged={() => void recompute()}
          />
          <TeachAuraCoverage coverage={model.coverage} includedCount={model.includedCount} />
        </>
      )}

      {!noPosts && model.includedCount < MIN_POSTS_FOR_COVERAGE && (
        <p style={{ fontFamily: MONO, fontSize: 12, color: MUTED, marginBlockStart: 8 }}>
          {model.includedCount} of {MIN_POSTS_FOR_COVERAGE} posts read
        </p>
      )}
    </div>
  );
}

/** Trait values before and after a recompute, so we can name what moved. */
async function snapshotTraits(userId: string | null): Promise<Record<string, number>> {
  if (!userId) return {};
  const { data } = await supabase
    .from("voice_traits")
    .select("trait_key, value")
    .eq("user_id", userId);
  const out: Record<string, number> = {};
  for (const row of data || []) out[String((row as any).trait_key)] = Number((row as any).value);
  return out;
}