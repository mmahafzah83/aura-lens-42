import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraCard } from "@/components/ui/AuraCard";
import { CollapsibleList } from "@/components/ui/CollapsibleList";
import { SectionHeader } from "@/components/ui/SectionHeader";

/** BOOK TWO — what we sent, and what he did with it. His lane only. */
type Serve = {
  id: string;
  shown_at: string;
  lane: string | null;
  tap: string | null;
  signal_class: string | null;
  truth_code: string | null;
  outcome: string | null;
  why: Record<string, unknown> | null;
  oe_opportunities?: { title?: string | null } | null;
};

const T = {
  en: {
    header: "What we sent you",
    none: "Nothing sent yet.",
    why: "Why you saw this",
    lane_act: "To act on", lane_write: "To write about", lane_none: "Not sent as a card",
    tapped: "You said", untapped: "No answer yet",
    right: "that's right", not_quite: "not quite", not_my_area: "not my area",
    rules: (n: number) => `${n} of your own rules were in force.`,
    faces: (n: number) => `${n} parts of your record were matched.`,
    gate: (g: string) => `The eligibility check: ${g}.`,
    note: "In your words:",
    ask: "Did anything come of it?",
    applied: "I applied", won: "I got it", nothing: "Nothing came of it",
    thanks: "Noted.",
  },
  ar: {
    header: "ما أرسلناه لك",
    none: "لم نرسل شيئاً بعد.",
    why: "لماذا ظهرت لك",
    lane_act: "للتحرّك", lane_write: "للكتابة", lane_none: "لم تُرسل كبطاقة",
    tapped: "قلت", untapped: "لا جواب بعد",
    right: "هذه صحيحة", not_quite: "ليست تماماً", not_my_area: "ليست مجالي",
    rules: (n: number) => `كانت ${n} من قواعدك سارية.`,
    faces: (n: number) => `طوبقت ${n} من أجزاء سجلّك.`,
    gate: (g: string) => `فحص الأهلية: ${g}.`,
    note: "بكلماتك:",
    ask: "هل نتج عنها شيء؟",
    applied: "تقدّمت", won: "حصلت عليها", nothing: "لم ينتج شيء",
    thanks: "سُجّل.",
  },
};

function plainWhy(why: Record<string, unknown> | null, t: typeof T["en"]): string[] {
  if (!why) return [];
  const lines: string[] = [];
  const rules = Array.isArray((why as any).rules) ? (why as any).rules.length : 0;
  const faces = Array.isArray((why as any).faces) ? (why as any).faces.length : 0;
  if (rules) lines.push(t.rules(rules));
  if (faces) lines.push(t.faces(faces));
  const gate = (why as any).gate;
  if (typeof gate === "string") lines.push(t.gate(gate));
  const note = (why as any).note;
  if (typeof note === "string" && note.trim()) lines.push(`${t.note} “${note.trim()}”`);
  return lines;
}

export function WhatWeSentYou({ userId, language }: { userId: string | null; language: "en" | "ar" }) {
  const t = T[language];
  const rtl = language === "ar";
  const [serves, setServes] = useState<Serve[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await (supabase.from("oe_serves" as any) as any)
      .select("id,shown_at,lane,tap,signal_class,truth_code,outcome,why,oe_opportunities(title)")
      .eq("user_id", userId).order("shown_at", { ascending: false }).limit(60);
    setServes((data ?? []) as Serve[]);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const answer = async (id: string, outcome: "applied" | "won" | "nothing") => {
    await (supabase.from("oe_serves" as any) as any)
      .update({ outcome, outcome_at: new Date().toISOString() }).eq("id", id);
    await load();
  };

  return <div style={{ marginTop: 28, lineHeight: rtl ? 1.9 : 1.55 }}>
    <SectionHeader label={t.header} />
    {serves.length === 0
      ? <AuraCard hover="none" style={{ background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 12, padding: 16 }}><p style={{ margin: 0, color: "#5B6673", fontSize: 14 }}>{t.none}</p></AuraCard>
      : <CollapsibleList items={serves} visibleCount={5} label={t.header.toLowerCase()} renderItem={(serve: Serve) => {
        const expanded = openId === serve.id;
        const tapText = serve.tap ? (t as any)[serve.tap] ?? serve.tap : null;
        const laneText = serve.lane === "act" ? t.lane_act : serve.lane === "write" ? t.lane_write : t.lane_none;
        const dueAsk = serve.tap === "right" && !serve.outcome;
        return <div style={{ borderBottom: "1px solid #E2E7EE", padding: "13px 0", display: "grid", gap: 8 }}>
          <button type="button" onClick={() => setOpenId(expanded ? null : serve.id)} aria-expanded={expanded} style={{ width: "100%", border: 0, background: "transparent", padding: 0, textAlign: "start", cursor: "pointer", color: "#0F1519", fontFamily: "inherit" }}>
            <strong style={{ display: "block", fontSize: 14 }}>{serve.oe_opportunities?.title ?? "—"}</strong>
            <span style={{ display: "block", color: "#5B6673", fontSize: 12, marginTop: 3 }}>
              {laneText} · {tapText ? `${t.tapped}: ${tapText}` : t.untapped} · <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{String(serve.shown_at).slice(0, 10)}</span>
            </span>
            <span style={{ display: "block", color: "#0670C4", fontSize: 12, marginTop: 4 }}>{t.why}</span>
          </button>
          {expanded && <ul style={{ margin: 0, paddingInlineStart: 18, color: "#5B6673", fontSize: 13, display: "grid", gap: 4 }}>
            {plainWhy(serve.why, t).map((line, i) => <li key={i}>{line}</li>)}
          </ul>}
          {dueAsk && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "#9A6F12", fontSize: 12 }}>{t.ask}</span>
            {(["applied", "won", "nothing"] as const).map((outcome) => <button key={outcome} type="button" onClick={() => void answer(serve.id, outcome)} style={{ minHeight: 36, padding: "6px 10px", borderRadius: 4, border: "1px solid #E2E7EE", background: "#FFFFFF", color: "#0F1519", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>{t[outcome]}</button>)}
          </div>}
          {serve.outcome && <span style={{ color: "#12805C", fontSize: 12 }}>{t.thanks}</span>}
        </div>;
      }} />}
  </div>;
}
