/**
 * Rules, shown rather than counted.
 *
 * Three cards, each with its own rules and an inline field to write one. Above
 * them, the patterns Aura noticed in the member's own posts — each with the
 * count it came from, and the posts themselves one tap away. A suggestion is a
 * proposal: nothing here changes a draft until the member presses +.
 */
import { useState } from "react";
import { GripVertical, Trash2, Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  BLUE, GREEN, INK, LINE, MUTED, RED, SURFACE, TAP, TYPE, WHITE,
  RADIUS, cardStyle, chipStyle, ghostButton, microLabel, monoNum,
} from "@/components/voice/tokens";
import type { DnaRule } from "@/lib/voiceDna";

export const RULE_KINDS = [
  { kind: "always" as const, label: "Always", colour: GREEN, empty: "No rules yet. Aura will propose some as it reads more of your writing." },
  { kind: "never" as const, label: "Never", colour: RED, empty: "No rules yet. Aura will propose some as it reads more of your writing." },
  { kind: "anchor" as const, label: "Voice anchors", colour: BLUE, empty: "No anchors yet. Aura will propose some as it reads more of your writing." },
];

/** One provenance vocabulary across traits and rules. */
const SOURCE_LABEL: Record<string, string> = { learned: "Learned", user: "Set by you", aura: "Suggested by Aura" };

function SourceTag({ source }: { source: string }) {
  return <span style={chipStyle(MUTED, SURFACE, LINE)}>{SOURCE_LABEL[source] ?? source}</span>;
}

const KIND_LABEL: Record<string, string> = { always: "Always", never: "Never", anchor: "Anchor" };

/* ── the evidence a suggestion came from ─────────────────────────────────── */

function Evidence({ rule }: { rule: DnaRule }) {
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<{ id: string; text: string }[] | null>(null);
  const ids = rule.evidence?.post_ids ?? [];
  const note = rule.evidence?.note ?? "From your writing";

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && posts === null && ids.length > 0) {
      const { data } = await supabase
        .from("linkedin_posts")
        .select("id, post_text")
        .in("id", ids.slice(0, 5));
      setPosts((data ?? []).map((p) => ({ id: String(p.id), text: String(p.post_text ?? "") })));
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        style={{
          background: "none", border: "none", padding: "4px 0", cursor: ids.length ? "pointer" : "default",
          fontSize: TYPE.caption, color: MUTED, textDecoration: ids.length ? "underline" : "none",
          textUnderlineOffset: 3, fontFamily: "inherit",
        }}
      >
        {note}
      </button>
      {open && ids.length > 0 && (
        <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 6 }}>
          {(posts ?? []).map((p) => (
            <li key={p.id} dir="auto" style={{
              fontSize: TYPE.small, color: INK, lineHeight: 1.5, background: SURFACE,
              border: `1px solid ${LINE}`, borderRadius: RADIUS.chip, padding: "8px 10px",
            }}>
              {p.text.slice(0, 220)}{p.text.length > 220 ? "…" : ""}
            </li>
          ))}
          {posts?.length === 0 && (
            <li style={{ fontSize: TYPE.small, color: MUTED }}>Those posts are no longer available.</li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ── the suggestions strip ───────────────────────────────────────────────── */

function Suggestions({
  items, busy, onAccept, onDismiss,
}: {
  items: DnaRule[];
  busy: boolean;
  onAccept: (r: DnaRule) => void;
  onDismiss: (r: DnaRule) => void;
}) {
  if (items.length === 0) return null;
  const control: React.CSSProperties = {
    inlineSize: TAP, blockSize: TAP, display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: WHITE, border: `1px solid ${LINE}`, borderRadius: RADIUS.button, cursor: "pointer", color: INK,
  };
  return (
    <div style={{ ...cardStyle, marginBlockEnd: 12 }} className="v-focusable">
      <div style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: INK }}>
        Aura noticed <span style={{ ...monoNum }}>{items.length}</span> {items.length === 1 ? "pattern" : "patterns"} in your writing
      </div>
      <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
        {items.map((r) => (
          <li
            key={r.id}
            style={{
              display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap",
              padding: "10px 0", borderBlockStart: `1px solid ${LINE}`,
            }}
          >
            <div style={{ flex: 1, minInlineSize: 180 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span dir="auto" style={{ fontSize: TYPE.body, color: INK, lineHeight: 1.5 }}>{r.text}</span>
                <span style={chipStyle(MUTED, SURFACE, LINE)}>{KIND_LABEL[r.kind]}</span>
              </div>
              <Evidence rule={r} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={control} disabled={busy}
                aria-label={`Accept rule: ${r.text}`} onClick={() => onAccept(r)}>
                <Plus size={16} aria-hidden />
              </button>
              <button type="button" style={control} disabled={busy}
                aria-label={`Dismiss rule: ${r.text}`} onClick={() => onDismiss(r)}>
                <Minus size={16} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── the cards ───────────────────────────────────────────────────────────── */

export default function VoiceRules({
  rules, suggestions = [], busy, canSuggest = false, onAdd, onEdit, onDelete, onReorder,
  onAccept, onDismiss, onLookForPatterns,
}: {
  rules: DnaRule[];
  suggestions?: DnaRule[];
  busy: boolean;
  /** true once the member has enough posts for a pattern search to mean anything */
  canSuggest?: boolean;
  onAdd: (kind: DnaRule["kind"], text: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onReorder: (ordered: DnaRule[]) => void;
  onAccept?: (r: DnaRule) => void;
  onDismiss?: (r: DnaRule) => void;
  onLookForPatterns?: () => void;
}) {
  const [open, setOpen] = useState<DnaRule["kind"] | null>(null);
  const [draft, setDraft] = useState("");
  const [inline, setInline] = useState<Record<string, string>>({});
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const of = (kind: DnaRule["kind"]) => rules.filter((r) => r.kind === kind).sort((a, b) => a.rank - b.rank);
  const list = open ? of(open) : [];

  const drop = (to: number) => {
    if (dragIdx === null || dragIdx === to) return;
    const next = [...list];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(to, 0, moved);
    setDragIdx(null);
    onReorder(next);
  };

  const linkStyle: React.CSSProperties = {
    background: "none", border: "none", padding: "10px 0", minBlockSize: TAP, cursor: "pointer",
    fontSize: TYPE.small, fontWeight: 600, color: BLUE, textDecoration: "underline",
    textUnderlineOffset: 3, fontFamily: "inherit",
  };

  return (
    <section style={{ marginBlockStart: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={microLabel}>Rules</div>
        {canSuggest && onLookForPatterns && (
          <button type="button" className="v-focusable" style={linkStyle} disabled={busy} onClick={onLookForPatterns}>
            Look for patterns
          </button>
        )}
      </div>

      <div style={{ marginBlockStart: 10 }}>
        <Suggestions
          items={suggestions}
          busy={busy}
          onAccept={(r) => onAccept?.(r)}
          onDismiss={(r) => onDismiss?.(r)}
        />
      </div>

      <div className="vd-rules">
        {RULE_KINDS.map((k) => {
          const items = of(k.kind);
          return (
            <div key={k.kind} style={{ ...cardStyle, borderInlineStart: `3px solid ${k.colour}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: TYPE.bodyLg, fontWeight: 600, color: k.colour }}>{k.label}</span>
                {items.length > 0 && (
                  <span style={{ ...monoNum, fontSize: TYPE.body, fontWeight: 600, color: INK }}>{items.length}</span>
                )}
              </div>
              {items.length === 0 ? (
                <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.55, marginBlockStart: 8, marginBlockEnd: 10 }}>{k.empty}</p>
              ) : (
                <ul style={{ listStyle: "none", margin: "10px 0", padding: 0 }}>
                  {items.slice(0, 3).map((r) => (
                    <li key={r.id} style={{ padding: "6px 0", borderBlockStart: `1px solid ${LINE}` }}>
                      <div dir="auto" style={{ fontSize: TYPE.small, color: INK, lineHeight: 1.5 }}>{r.text}</div>
                      <div style={{ marginBlockStart: 4 }}><SourceTag source={r.source} /></div>
                    </li>
                  ))}
                </ul>
              )}

              {/* write one here — no modal */}
              <input
                dir="auto"
                value={inline[k.kind] ?? ""}
                placeholder="+ Add your own"
                aria-label={`Add a ${k.label.toLowerCase()} rule`}
                disabled={busy}
                onChange={(e) => setInline((s) => ({ ...s, [k.kind]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const text = (inline[k.kind] ?? "").trim();
                  if (!text) return;
                  onAdd(k.kind, text);
                  setInline((s) => ({ ...s, [k.kind]: "" }));
                }}
                className="v-focusable"
                style={{
                  inlineSize: "100%", minBlockSize: TAP, fontSize: TYPE.small, color: INK,
                  border: `1px solid ${LINE}`, borderRadius: RADIUS.button, padding: "8px 10px",
                  fontFamily: "inherit", marginBlockEnd: 8,
                }}
              />

              <button type="button" className="v-focusable" style={{ ...ghostButton, minBlockSize: TAP }}
                onClick={() => { setOpen(k.kind); setDraft(""); }}>
                {items.length === 0 ? "Open" : `View all ${items.length} rules →`}
              </button>
            </div>
          );
        })}
      </div>

      {open && (
        <div style={{ ...cardStyle, marginBlockStart: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={microLabel}>{RULE_KINDS.find((k) => k.kind === open)?.label} rules</div>
            <button type="button" className="v-focusable" style={{ ...ghostButton, minBlockSize: TAP }} onClick={() => setOpen(null)}>Close</button>
          </div>

          {list.length === 0 ? (
            <p style={{ fontSize: TYPE.small, color: MUTED, marginBlockStart: 10 }}>Nothing here yet.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
              {list.map((r, i) => (
                <li
                  key={r.id}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(i)}
                  style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBlockStart: `1px solid ${LINE}` }}
                >
                  <GripVertical size={14} color={MUTED} aria-hidden />
                  <input
                    dir="auto"
                    defaultValue={r.text}
                    disabled={busy}
                    className="v-focusable"
                    aria-label="Rule text"
                    onBlur={(e) => { if (e.target.value.trim() && e.target.value !== r.text) onEdit(r.id, e.target.value.trim()); }}
                    style={{
                      flex: 1, minInlineSize: 140, minBlockSize: TAP, fontSize: TYPE.small, color: INK,
                      border: `1px solid ${LINE}`, borderRadius: RADIUS.button, padding: "6px 8px", fontFamily: "inherit",
                    }}
                  />
                  <SourceTag source={r.source} />
                  <button type="button" aria-label={`Delete rule: ${r.text}`} className="v-focusable"
                    style={{ ...ghostButton, inlineSize: TAP, minBlockSize: TAP, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    disabled={busy} onClick={() => onDelete(r.id)}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: 8, marginBlockStart: 12, flexWrap: "wrap" }}>
            <input
              dir="auto"
              value={draft}
              placeholder="Write the rule in your own words"
              aria-label="New rule"
              className="v-focusable"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) { onAdd(open, draft.trim()); setDraft(""); }
              }}
              style={{
                flex: 1, minInlineSize: 180, minBlockSize: TAP, fontSize: TYPE.small,
                border: `1px solid ${LINE}`, borderRadius: RADIUS.button, padding: "8px 10px", fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              className="v-focusable"
              style={{ ...ghostButton, minBlockSize: TAP, opacity: draft.trim() ? 1 : 0.5 }}
              disabled={busy || !draft.trim()}
              onClick={() => { onAdd(open, draft.trim()); setDraft(""); }}
            >
              Add rule
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
