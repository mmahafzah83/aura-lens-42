/**
 * Rules, shown rather than counted.
 *
 * A count on its own is decoration: the member cannot act on "7". So each card
 * shows its top three rules with the source that produced them, and the full
 * list is one click away. Nothing is seeded — an empty card says so in words.
 */
import { useState } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { BLUE, GREEN, INK, LINE, MUTED, RED, cardStyle, ghostButton, microLabel, monoNum } from "@/components/voice/tokens";
import type { DnaRule } from "@/lib/voiceDna";

export const RULE_KINDS = [
  { kind: "always" as const, label: "Always", colour: GREEN, empty: "No rules yet — Aura will propose some as it reads more of your writing" },
  { kind: "never" as const, label: "Never", colour: RED, empty: "No rules yet — Aura will propose some as it reads more of your writing" },
  { kind: "anchor" as const, label: "Voice anchors", colour: BLUE, empty: "No anchors yet — Aura will propose some as it reads more of your writing" },
];

const SOURCE_LABEL: Record<string, string> = { learned: "Learned", user: "You", aura: "Aura" };

function SourceTag({ source }: { source: string }) {
  return (
    <span style={{ ...monoNum, fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED }}>
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}

export default function VoiceRules({
  rules, busy, onAdd, onEdit, onDelete, onReorder,
}: {
  rules: DnaRule[];
  busy: boolean;
  onAdd: (kind: DnaRule["kind"], text: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onReorder: (ordered: DnaRule[]) => void;
}) {
  const [open, setOpen] = useState<DnaRule["kind"] | null>(null);
  const [draft, setDraft] = useState("");
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

  return (
    <section style={{ marginBlockStart: 12 }}>
      <div style={microLabel}>Rules</div>
      <div className="vd-rules" style={{ marginBlockStart: 10 }}>
        {RULE_KINDS.map((k) => {
          const items = of(k.kind);
          return (
            <div key={k.kind} style={{ ...cardStyle, borderInlineStart: `3px solid ${k.colour}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: k.colour }}>{k.label}</span>
                {items.length > 0 && (
                  <span style={{ ...monoNum, fontSize: 13, fontWeight: 600, color: INK }}>{items.length}</span>
                )}
              </div>
              {items.length === 0 ? (
                <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, marginBlockStart: 8, marginBlockEnd: 10 }}>{k.empty}</p>
              ) : (
                <ul style={{ listStyle: "none", margin: "10px 0", padding: 0 }}>
                  {items.slice(0, 3).map((r) => (
                    <li key={r.id} style={{ padding: "6px 0", borderBlockStart: `1px solid ${LINE}` }}>
                      <div dir="auto" style={{ fontSize: 12.5, color: INK, lineHeight: 1.5 }}>{r.text}</div>
                      <SourceTag source={r.source} />
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" style={ghostButton} onClick={() => { setOpen(k.kind); setDraft(""); }}>
                {items.length === 0 ? "Add a rule" : `View all ${items.length} rules →`}
              </button>
            </div>
          );
        })}
      </div>

      {open && (
        <div style={{ ...cardStyle, marginBlockStart: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={microLabel}>{RULE_KINDS.find((k) => k.kind === open)?.label} rules</div>
            <button type="button" style={ghostButton} onClick={() => setOpen(null)}>Close</button>
          </div>

          {list.length === 0 ? (
            <p style={{ fontSize: 12.5, color: MUTED, marginBlockStart: 10 }}>Nothing here yet.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
              {list.map((r, i) => (
                <li
                  key={r.id}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(i)}
                  style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0", borderBlockStart: `1px solid ${LINE}` }}
                >
                  <GripVertical size={14} color={MUTED} aria-hidden />
                  <input
                    dir="auto"
                    defaultValue={r.text}
                    disabled={busy}
                    onBlur={(e) => { if (e.target.value.trim() && e.target.value !== r.text) onEdit(r.id, e.target.value.trim()); }}
                    style={{
                      flex: 1, minInlineSize: 0, fontSize: 12.5, color: INK, border: `1px solid ${LINE}`,
                      borderRadius: 8, padding: "6px 8px", fontFamily: "inherit",
                    }}
                  />
                  <SourceTag source={r.source} />
                  <button type="button" aria-label="Delete rule" style={{ ...ghostButton, padding: 6 }} disabled={busy} onClick={() => onDelete(r.id)}>
                    <Trash2 size={13} />
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
              onChange={(e) => setDraft(e.target.value)}
              style={{
                flex: 1, minInlineSize: 180, fontSize: 12.5, border: `1px solid ${LINE}`, borderRadius: 8,
                padding: "8px 10px", fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              style={{ ...ghostButton, opacity: draft.trim() ? 1 : 0.5 }}
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