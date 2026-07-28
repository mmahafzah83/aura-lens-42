import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { ButtonPrimary, ButtonGhost, Chip } from "@/components/systemb";
import {
  WIDGET_DEFS, DEFAULT_LAYOUT, loadLayout, saveLayout, loadWidgetMetrics,
} from "./widgetData";
import type { WidgetLayout, WidgetMetrics } from "./widgetData";
import { WidgetBody } from "./WidgetCards";

/**
 * WidgetsPage — two honest halves.
 *
 * Above: the six widgets that exist, every one showing a measured number and
 * its denominator. Below: the slots that do not exist yet, drawn so that no
 * one could mistake them for shipped work, each with a real vote count from a
 * SECURITY DEFINER tally that returns aggregates only.
 *
 * Colour law: blue = your turn (Save Home, Vote, Send), cyan = the machine
 * (the Overnight widget only). No clock exists on this page, so no amber.
 */

const FF = { fontFamily: "var(--ff-ui)" } as const;
const MONO: React.CSSProperties = {
  fontFamily: "var(--ff-mono, ui-monospace, SFMono-Regular, monospace)",
  letterSpacing: ".04em",
};

const SLOTS: Array<{ key: string; name: string; blurb: string; target: string }> = [
  { key: "competitor_watch", name: "Competitor watch", blurb: "What the three people you benchmark against published this week.", target: "Next" },
  { key: "comment_queue",    name: "Comment queue",    blurb: "Posts worth a reply, ranked by who is reading them.", target: "Next" },
  { key: "idea_bank",        name: "Idea bank",        blurb: "Half-formed thoughts held until a signal makes them usable.", target: "Later" },
  { key: "practice_board",   name: "Practice board",   blurb: "One rewrite drill a day against your own published work.", target: "Later" },
  { key: "reading_streak",   name: "Reading streak",   blurb: "What you read, not just what you wrote.", target: "Later" },
];

const SectionLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div style={{
    ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase",
    color: "var(--text-secondary)", marginBottom: 10,
  }}>{children}</div>
);

const Toggle: React.FC<{ on: boolean; label: string; onChange: () => void }> = ({ on, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onChange}
    className="v23-focus"
    style={{
      width: 44, height: 24, minHeight: 24, borderRadius: 999, flexShrink: 0, cursor: "pointer",
      marginBlock: 8,
      border: on ? "1px solid var(--act)" : "1px solid var(--border-strong)",
      background: on ? "var(--act)" : "var(--surface-page)",
      display: "flex", alignItems: "center", padding: 2,
      justifyContent: on ? "flex-end" : "flex-start",
      transition: "background 140ms ease",
    }}
  >
    <span style={{
      width: 16, height: 16, borderRadius: 999,
      background: on ? "var(--text-inverse)" : "var(--text-muted)",
      display: "block",
    }} />
  </button>
);

interface Tally { votes: number; eligible: number | null }

export default function WidgetsPage() {
  const { user } = useAuthReady();
  const uid = user?.id ?? null;

  const [layout, setLayout] = useState<WidgetLayout>(DEFAULT_LAYOUT);
  const [savedLayout, setSavedLayout] = useState<WidgetLayout>(DEFAULT_LAYOUT);
  const [metrics, setMetrics] = useState<WidgetMetrics | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [eligible, setEligible] = useState<number | null>(null);

  const [suggestion, setSuggestion] = useState("");
  const [suggestState, setSuggestState] = useState<"idle" | "sending" | "sent">("idle");

  const loadVotes = useCallback(async () => {
    if (!uid) return;
    const [{ data: tally }, { data: mine }] = await Promise.all([
      (supabase.rpc as any)("widget_slot_tally"),
      supabase.from("widget_slot_votes").select("slot_key").eq("user_id", uid),
    ]);
    const map: Record<string, Tally> = {};
    let elig: number | null = null;
    for (const r of (tally || []) as Array<{ slot_key: string; vote_count: number; eligible_members: number }>) {
      map[r.slot_key] = { votes: r.vote_count, eligible: r.eligible_members };
      elig = r.eligible_members;
    }
    setTallies(map);
    setEligible(elig);
    setMyVotes(new Set(((mine || []) as Array<{ slot_key: string }>).map(r => r.slot_key)));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      const [l, m] = await Promise.all([loadLayout(uid), loadWidgetMetrics(uid)]);
      if (!alive) return;
      setLayout(l); setSavedLayout(l); setMetrics(m);
    })();
    loadVotes();
    return () => { alive = false; };
  }, [uid, loadVotes]);

  const dirty = useMemo(
    () => WIDGET_DEFS.some(d => !!layout[d.key] !== !!savedLayout[d.key]),
    [layout, savedLayout],
  );

  async function handleSave() {
    if (!uid) return;
    setSaving(true);
    const { error } = await saveLayout(uid, layout);
    setSaving(false);
    if (error) { setSavedNote("Could not save. Try again."); return; }
    setSavedLayout(layout);
    setSavedNote("Saved to your Home.");
    setTimeout(() => setSavedNote(null), 3000);
  }

  async function toggleVote(slotKey: string) {
    if (!uid) return;
    const had = myVotes.has(slotKey);
    // optimistic
    setMyVotes(prev => {
      const next = new Set(prev);
      had ? next.delete(slotKey) : next.add(slotKey);
      return next;
    });
    setTallies(prev => {
      const cur = prev[slotKey]?.votes ?? 0;
      return { ...prev, [slotKey]: { votes: Math.max(0, cur + (had ? -1 : 1)), eligible } };
    });
    if (had) {
      await supabase.from("widget_slot_votes").delete().eq("user_id", uid).eq("slot_key", slotKey);
    } else {
      await supabase.from("widget_slot_votes").insert({ user_id: uid, slot_key: slotKey });
    }
    loadVotes();
  }

  async function sendSuggestion() {
    if (!uid || !suggestion.trim()) return;
    setSuggestState("sending");
    const { error } = await supabase.from("product_events").insert({
      user_id: uid, event: "widget_suggestion", props: { text: suggestion.trim() } as any,
    });
    setSuggestState(error ? "idle" : "sent");
    if (!error) setSuggestion("");
  }

  const onCount = WIDGET_DEFS.filter(d => layout[d.key]).length;

  return (
    <div style={{ ...FF, display: "flex", flexDirection: "column", gap: 22 }}>
      {/* SECTION 1 — ON YOUR HOME */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <SectionLabel>On your Home</SectionLabel>
          <span style={{ ...MONO, fontSize: 11, color: "var(--text-secondary)" }}>
            {onCount} of {WIDGET_DEFS.length} on
          </span>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--text-secondary)", maxWidth: 620 }}>
          Every number here is measured from your own data. Switch one on and it appears on Home.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {WIDGET_DEFS.map(d => {
            const body = metrics ? <WidgetBody k={d.key} m={metrics} /> : null;
            return (
              <div key={d.key} style={{
                border: "1px solid var(--rule-outer)", borderRadius: 14, padding: 14,
                background: "var(--surface-card)", display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, color: "var(--text-primary)" }}>{d.name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 3 }}>{d.blurb}</div>
                  </div>
                  <Toggle
                    on={!!layout[d.key]}
                    label={`Show ${d.name} on Home`}
                    onChange={() => setLayout(p => ({ ...p, [d.key]: !p[d.key] }))}
                  />
                </div>
                {body ?? (
                  <div style={{ ...MONO, fontSize: 11.5, color: "var(--text-muted)" }}>
                    {metrics ? "No data for this yet." : "Measuring…"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <ButtonPrimary onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save Home"}
          </ButtonPrimary>
          <ButtonGhost onClick={() => setLayout({ ...DEFAULT_LAYOUT })}>Reset layout</ButtonGhost>
          {savedNote && (
            <span style={{ ...MONO, fontSize: 11.5, color: "var(--text-secondary)" }}>{savedNote}</span>
          )}
        </div>
      </section>

      {/* SECTION 2 — SLOTS */}
      <section>
        <SectionLabel>Slots · coming soon</SectionLabel>
        <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--text-secondary)", maxWidth: 620 }}>
          None of these exist yet. Vote for the one you'd use, and it moves up the queue.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {SLOTS.map(s => {
            const t = tallies[s.key];
            const votes = t?.votes ?? 0;
            const voted = myVotes.has(s.key);
            return (
              <div key={s.key} style={{
                border: "1px dashed var(--border-strong)", borderRadius: 14, padding: 14,
                background: "transparent", display: "flex", flexDirection: "column", gap: 10,
                opacity: 0.86,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14.5, color: "var(--text-primary)" }}>{s.name}</span>
                  <span style={{ marginLeft: "auto" }}><Chip variant="cooling">{s.target}</Chip></span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{s.blurb}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
                  <span style={{ ...MONO, fontSize: 11, color: "var(--text-secondary)" }}>
                    {votes === 0
                      ? "No votes yet"
                      : `${votes} of ${eligible ?? "—"} invited members`}
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    {voted
                      ? <ButtonGhost onClick={() => toggleVote(s.key)}>Voted · undo</ButtonGhost>
                      : <ButtonGhost onClick={() => toggleVote(s.key)}>Vote</ButtonGhost>}
                  </span>
                </div>
              </div>
            );
          })}

          {/* sixth tile — your own widget */}
          <div style={{
            border: "1px dashed var(--border-strong)", borderRadius: 14, padding: 14,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ fontSize: 14.5, color: "var(--text-primary)" }}>Your own widget</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Tell us the number you check manually every week.
            </div>
            <input
              value={suggestion}
              onChange={(e) => { setSuggestion(e.target.value); setSuggestState("idle"); }}
              placeholder="The number I check every week is…"
              aria-label="Suggest a widget"
              style={{
                ...FF, width: "100%", boxSizing: "border-box", fontSize: 13.5,
                padding: "9px 11px", borderRadius: 10,
                border: "1px solid var(--rule-outer)", background: "var(--surface-card)",
                color: "var(--text-primary)",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ButtonPrimary onClick={sendSuggestion} disabled={!suggestion.trim() || suggestState === "sending"}>
                {suggestState === "sending" ? "Sending…" : "Send"}
              </ButtonPrimary>
              {suggestState === "sent" && (
                <span style={{ ...MONO, fontSize: 11.5, color: "var(--text-secondary)" }}>Got it — thank you.</span>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
