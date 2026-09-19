import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { AuraCard } from "@/components/ui/AuraCard";

/** BOOK ONE — the member's own sentences. No scores here, ever. */
type Rule = {
  id: string;
  kind: "hard" | "soft";
  rule_text: string;
  rule_text_ar: string | null;
  stated_on: string;
  proposal_status: "open" | "signed" | "declined";
};

const T = {
  en: {
    open: "We think this is one of your rules. Is it?",
    yes: "Yes, that's right",
    no: "No, remove it",
    changed: "That's changed",
    hard: "Fixed",
    soft: "For now",
    none: "No rules written down yet.",
    said: "said",
  },
  ar: {
    open: "نظن أن هذه إحدى قواعدك. أهي كذلك؟",
    yes: "نعم، هذا صحيح",
    no: "لا، احذفها",
    changed: "تغيّر هذا",
    hard: "ثابتة",
    soft: "مؤقتة",
    none: "لا قواعد مكتوبة بعد.",
    said: "قيلت في",
  },
};

export function YourRules({ userId, language }: { userId: string | null; language: "en" | "ar" }) {
  const t = T[language];
  const rtl = language === "ar";
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState(false);

  /* A comment is what he said; a rule is what runs. Only rules appear here,
     and only ratifying one turns it on. */
  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await (supabase.from("oe_notebook" as any) as any)
      .select("id,kind,rule_text,rule_text_ar,stated_on,proposal_status")
      .eq("user_id", userId).eq("active", true).eq("entry_kind", "rule")
      .order("kind", { ascending: true }).order("stated_on", { ascending: false });
    setRules((data ?? []) as Rule[]);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const sign = async (id: string, status: "signed" | "declined") => {
    setBusy(true);
    await (supabase.from("oe_notebook" as any) as any)
      .update(status === "signed"
        ? { proposal_status: "signed", ratified_at: new Date().toISOString() }
        : { proposal_status: "declined", active: false })
      .eq("id", id);
    await load();
    setBusy(false);
  };
  const retire = async (id: string) => {
    setBusy(true);
    await (supabase.from("oe_notebook" as any) as any).update({ active: false }).eq("id", id);
    await load();
    setBusy(false);
  };

  const proposals = rules.filter((r) => r.proposal_status === "open");
  const signed = rules.filter((r) => r.proposal_status === "signed");
  const sentence = (r: Rule) => (rtl && r.rule_text_ar ? r.rule_text_ar : r.rule_text);

  return <div style={{ display: "grid", gap: 12, marginTop: 16, lineHeight: rtl ? 1.9 : 1.55 }}>
    {proposals.map((rule, index) => <AuraCard key={rule.id} hover="none" style={{ background: "#FFFFFF", border: "1px solid #0670C4", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <p style={{ margin: 0, color: "#5B6673", fontSize: 12, fontWeight: 700 }}>{t.open}</p>
        <p style={{ margin: 0, color: "#0F1519", fontSize: 15 }}>“{sentence(rule)}”</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {index === 0
            ? <AuraButton onClick={() => void sign(rule.id, "signed")} loading={busy} style={{ background: "#0670C4", borderRadius: 8 }}>{t.yes}</AuraButton>
            : <button type="button" disabled={busy} onClick={() => void sign(rule.id, "signed")} style={{ minHeight: 36, padding: "7px 12px", borderRadius: 8, border: "1px solid #E2E7EE", background: "#FFFFFF", color: "#0F1519", cursor: "pointer", fontFamily: "inherit" }}>{t.yes}</button>}
          <button type="button" disabled={busy} onClick={() => void sign(rule.id, "declined")} style={{ minHeight: 36, padding: "7px 12px", borderRadius: 8, border: "1px solid #E2E7EE", background: "#FFFFFF", color: "#5B6673", cursor: "pointer", fontFamily: "inherit" }}>{t.no}</button>
        </div>
      </div>
    </AuraCard>)}

    <AuraCard hover="none" style={{ background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 12, padding: 16 }}>
      {signed.length === 0 ? <p style={{ margin: 0, color: "#5B6673", fontSize: 14 }}>{t.none}</p> : <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
        {signed.map((rule) => <li key={rule.id} style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "#0F1519", fontSize: 15 }}>“{sentence(rule)}”</span>
          <span style={{ color: "#5B6673", fontSize: 12 }}>
            {rule.kind === "hard" ? t.hard : t.soft} · {t.said} <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{rule.stated_on}</span> ·{" "}
            <button type="button" disabled={busy} onClick={() => void retire(rule.id)} style={{ border: 0, background: "transparent", padding: 0, color: "#0670C4", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>{t.changed}</button>
          </span>
        </li>)}
      </ul>}
    </AuraCard>
  </div>;
}
