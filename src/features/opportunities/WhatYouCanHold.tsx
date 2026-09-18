import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraCard } from "@/components/ui/AuraCard";
import { AuraButton } from "@/components/ui/AuraButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useVocab } from "./useVocab";

/**
 * WHAT YOU CAN HOLD — the member's own account of what is open to him and
 * what is not. No scores live here. Every block shows the sentence he said,
 * with its date, and one link that clears it when it stops being true.
 */

const LEVELS = ["ic", "manager", "senior_manager", "director", "senior_director", "vp", "c_suite", "board"] as const;

const COUNTRIES: Array<[string, string, string]> = [
  ["SA", "Saudi Arabia", "السعودية"], ["AE", "United Arab Emirates", "الإمارات"],
  ["QA", "Qatar", "قطر"], ["KW", "Kuwait", "الكويت"], ["BH", "Bahrain", "البحرين"],
  ["OM", "Oman", "سلطنة عمان"], ["JO", "Jordan", "الأردن"], ["EG", "Egypt", "مصر"],
];

type Row = {
  user_id: string;
  countries_allowed: string[] | null;
  remote_ok: boolean | null;
  level_now: string | null;
  level_floor: string | null;
  level_ceiling: string | null;
  chair_types_blocked: string[] | null;
  blocked_reasons: Record<string, string> | null;
  sectors_core: string[] | null;
  stated_rules: Array<{ said_on?: string; text?: string; applies_to?: string }> | null;
};

const LABEL = (rtl: boolean) => ({
  place: rtl ? "أين يمكنك العمل" : "Where you can work",
  level: rtl ? "نطاق مستواك" : "Your level range",
  sectors: rtl ? "قطاعاتك" : "Your sectors",
  save: rtl ? "احفظ" : "Save",
  from: rtl ? "من" : "from",
  to: rtl ? "إلى" : "to",
  sectorsHint: rtl ? "افصل بينها بفاصلة" : "Separate them with commas",
  none: rtl ? "لا شيء مغلق أمامك الآن." : "Nothing is closed to you right now.",
  ask: rtl ? "أخبرنا بما يمكنك شغله." : "Tell us what you can hold.",
  held: rtl ? "ما الذي شغلته من قبل؟" : "What have you held before?",
  closed: rtl ? "ما المغلق أمامك، ولماذا؟" : "What is closed to you, and why?",
});

const field: React.CSSProperties = {
  border: "1px solid #E2E7EE", borderRadius: 8, padding: "8px 10px",
  background: "#FFFFFF", color: "#0F1519", fontFamily: "inherit", fontSize: 14,
};

export function WhatYouCanHold({ userId, language }: { userId: string | null; language: "en" | "ar" }) {
  const v = useVocab(language);
  const rtl = language === "ar";
  const T = LABEL(rtl);
  const [row, setRow] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sectorsText, setSectorsText] = useState("");
  const [heldText, setHeldText] = useState("");
  const [closedText, setClosedText] = useState("");

  useEffect(() => {
    let live = true;
    if (!userId) return;
    (async () => {
      const { data } = await (supabase.from("oe_eligibility" as any) as any)
        .select("*").eq("user_id", userId).maybeSingle();
      if (!live) return;
      setRow((data as Row) ?? null);
      setSectorsText(((data as Row)?.sectors_core ?? []).join(", "));
      setLoaded(true);
    })();
    return () => { live = false; };
  }, [userId]);

  if (!userId || !loaded) return null;

  const draft: Row = row ?? {
    user_id: userId, countries_allowed: ["SA"], remote_ok: false,
    level_now: "director", level_floor: "senior_manager", level_ceiling: "senior_director",
    chair_types_blocked: [], blocked_reasons: {}, sectors_core: [], stated_rules: [],
  };

  const set = (patch: Partial<Row>) => setRow({ ...draft, ...patch });

  const save = async () => {
    setSaving(true);
    const sectors = sectorsText.split(",").map((s) => s.trim().replace(/\s+/g, "_").toLowerCase()).filter(Boolean);
    const rules = [...(draft.stated_rules ?? [])];
    if (closedText.trim()) rules.push({ said_on: new Date().toISOString().slice(0, 10), text: closedText.trim() });
    if (heldText.trim()) rules.push({ said_on: new Date().toISOString().slice(0, 10), text: heldText.trim() });
    const payload = { ...draft, sectors_core: sectors, stated_rules: rules, user_id: userId };
    await (supabase.from("oe_eligibility" as any) as any).upsert(payload, { onConflict: "user_id" });
    setRow(payload as Row);
    setClosedText("");
    setHeldText("");
    setSaving(false);
  };

  const unblock = async (chair: string) => {
    const blocked = (draft.chair_types_blocked ?? []).filter((c) => c !== chair);
    const reasons = { ...(draft.blocked_reasons ?? {}) };
    delete reasons[chair];
    const next = { ...draft, chair_types_blocked: blocked, blocked_reasons: reasons };
    setRow(next);
    await (supabase.from("oe_eligibility" as any) as any).upsert({ ...next, user_id: userId }, { onConflict: "user_id" });
  };

  const ruleFor = (chair: string) =>
    (draft.stated_rules ?? []).find((r) => String(r.applies_to ?? "").includes(chair)) ?? null;

  const toggleCountry = (code: string) => {
    const list = draft.countries_allowed ?? [];
    set({ countries_allowed: list.includes(code) ? list.filter((c) => c !== code) : [...list, code] });
  };

  return (
    <section dir={rtl ? "rtl" : "ltr"} style={{ marginTop: 28, fontFamily: rtl ? "Cairo, sans-serif" : "Inter, sans-serif" }}>
      <SectionHeader label={v("what_you_can_hold") || (rtl ? "ما يمكنك شغله" : "What you can hold")} />
      <AuraCard hover="none" style={{ background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 20, padding: 20 }}>
        <div style={{ display: "grid", gap: 18, color: "#0F1519", lineHeight: rtl ? 1.9 : 1.55, fontSize: 14 }}>
          {!row && <p style={{ margin: 0, color: "#5B6673" }}>{T.ask}</p>}

          <div style={{ display: "grid", gap: 8 }}>
            <strong>{T.place}</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {COUNTRIES.map(([code, en, ar]) => {
                const on = (draft.countries_allowed ?? []).includes(code);
                return (
                  <button key={code} type="button" onClick={() => toggleCountry(code)} aria-pressed={on}
                    style={{ ...field, borderRadius: 4, padding: "4px 9px", fontSize: 13, cursor: "pointer",
                      borderColor: on ? "#0670C4" : "#E2E7EE", color: on ? "#0670C4" : "#5B6673" }}>
                    {rtl ? ar : en}
                  </button>
                );
              })}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#5B6673", fontSize: 13 }}>
              <input type="checkbox" checked={!!draft.remote_ok} onChange={(e) => set({ remote_ok: e.target.checked })} />
              {rtl ? "أقبل العمل عن بعد" : "Remote is fine"}
            </label>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <strong>{T.level}</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", color: "#5B6673" }}>
              <span>{T.from}</span>
              <select value={draft.level_floor ?? ""} onChange={(e) => set({ level_floor: e.target.value })} style={field}>
                {LEVELS.map((l) => <option key={l} value={l}>{v(`level_${l}`) || l}</option>)}
              </select>
              <span>{T.to}</span>
              <select value={draft.level_ceiling ?? ""} onChange={(e) => set({ level_ceiling: e.target.value })} style={field}>
                {LEVELS.map((l) => <option key={l} value={l}>{v(`level_${l}`) || l}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <strong>{v("closed_to_you") || (rtl ? "مغلق أمامك" : "Closed to you")}</strong>
            {(draft.chair_types_blocked ?? []).length === 0
              ? <p style={{ margin: 0, color: "#5B6673" }}>{T.none}</p>
              : (draft.chair_types_blocked ?? []).map((chair) => {
                const rule = ruleFor(chair);
                return (
                  <div key={chair} style={{ border: "1px solid #E2E7EE", borderRadius: 12, padding: 12, display: "grid", gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>{v(`chair_${chair}`) || chair}</span>
                    <p style={{ margin: 0, color: "#5B6673" }}>
                      “{rule?.text ?? (draft.blocked_reasons ?? {})[chair] ?? ""}”
                      {rule?.said_on && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, marginInlineStart: 8 }}>{rule.said_on}</span>}
                    </p>
                    <button type="button" onClick={() => void unblock(chair)}
                      style={{ justifySelf: "start", border: 0, background: "transparent", padding: 0, color: "#0670C4", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                      {v("thats_changed") || (rtl ? "تغيّر هذا" : "That's changed")}
                    </button>
                  </div>
                );
              })}
            {!row && <input value={closedText} onChange={(e) => setClosedText(e.target.value)} placeholder={T.closed} style={field} />}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <strong>{T.sectors}</strong>
            <input value={sectorsText} onChange={(e) => setSectorsText(e.target.value)} placeholder={T.sectorsHint} style={field} />
          </div>

          {!row && (
            <div style={{ display: "grid", gap: 8 }}>
              <strong>{T.held}</strong>
              <input value={heldText} onChange={(e) => setHeldText(e.target.value)} placeholder={T.held} style={field} />
            </div>
          )}

          <AuraButton onClick={() => void save()} loading={saving} style={{ justifySelf: "start", background: "#0670C4" }}>
            {T.save}
          </AuraButton>
        </div>
      </AuraCard>
    </section>
  );
}
