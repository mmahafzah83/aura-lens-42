/**
 * Imported-source review — the honesty surface.
 *
 * The member can see everything Aura counted as their writing and take any of
 * it back. `voice_window()` and `voice-compute-traits` both respect
 * `voice_corpus_status = 'excluded'`, so this list is not theatre: excluding
 * a post really does change the measured traits.
 */
import { useState } from "react";
import { toast } from "sonner";
import { HOOK_LABEL } from "@/lib/voiceOverview";
import { PAGE_SIZE, setCorpusState, type CorpusPost, type CorpusState } from "@/lib/teachAura";

const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const STATE_CHIP: Record<CorpusState, { bg: string; fg: string; border: string; label: string }> = {
  included: { bg: "#EAF6F0", fg: "#12805C", border: "#BFE3D3", label: "Included" },
  excluded: { bg: "#F2F5F9", fg: "#5B6673", border: "#DDE4EC", label: "Excluded" },
  auto_excluded: { bg: "#FBF4E4", fg: "#9A6F12", border: "#F0DFB4", label: "Auto-excluded" },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

export default function TeachAuraReview({
  posts,
  total,
  page,
  onPage,
  onChanged,
}: {
  posts: CorpusPost[];
  total: number;
  page: number;
  onPage: (p: number) => void;
  /** Recomputes traits and reports what moved. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggle = async (post: CorpusPost) => {
    const next: CorpusState = post.state === "included" ? "excluded" : "included";
    setBusy(post.id);
    try {
      await setCorpusState(post.id, next);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change that post.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={{ marginBlockStart: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: INK, margin: "0 0 4px" }}>What Aura counted as yours</h3>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "0 0 8px" }}>
        Take back anything that isn't your own writing. Aura re-reads your patterns straight away.
      </p>

      <div style={{ background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden" }}>
        {posts.map((post, i) => {
          const chip = STATE_CHIP[post.state];
          return (
            <div
              key={post.id}
              style={{
                display: "grid", gridTemplateColumns: "72px minmax(0,1fr) auto", gap: 12, alignItems: "center",
                padding: "10px 14px", borderBlockStart: i === 0 ? "none" : `1px solid ${LINE}`,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>{fmtDate(post.publishedAt)}</span>
              <div style={{ minWidth: 0 }}>
                <p dir="auto" style={{ fontSize: 13, color: INK, margin: 0, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                  {post.excerpt}…
                </p>
                <span style={{ fontSize: 11.5, color: MUTED }}>
                  {post.hookStyle ? HOOK_LABEL[post.hookStyle] ?? post.hookStyle : "Not classified yet"}
                  {post.state === "auto_excluded" && post.reason ? ` · ${post.reason}` : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999,
                    background: chip.bg, color: chip.fg, border: `1px solid ${chip.border}`, whiteSpace: "nowrap",
                  }}
                >
                  {chip.label}
                </span>
                <button
                  type="button"
                  onClick={() => void toggle(post)}
                  disabled={busy === post.id}
                  style={{
                    border: `1px solid ${LINE}`, background: "#FFFFFF", borderRadius: 8, padding: "4px 10px",
                    fontSize: 12, color: INK, cursor: busy === post.id ? "default" : "pointer", whiteSpace: "nowrap",
                  }}
                >
                  {post.state === "included" ? "Exclude" : "Include"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBlockStart: 10 }}>
          <button
            type="button" onClick={() => onPage(page - 1)} disabled={page === 0}
            style={{ border: `1px solid ${LINE}`, background: "#FFFFFF", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.5 : 1 }}
          >
            Previous
          </button>
          <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>
            {page + 1} / {pages}
          </span>
          <button
            type="button" onClick={() => onPage(page + 1)} disabled={page + 1 >= pages}
            style={{ border: `1px solid ${LINE}`, background: "#FFFFFF", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, cursor: page + 1 >= pages ? "default" : "pointer", opacity: page + 1 >= pages ? 0.5 : 1 }}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}