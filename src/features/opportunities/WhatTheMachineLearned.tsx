import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraCard } from "@/components/ui/AuraCard";
import { SectionHeader } from "@/components/ui/SectionHeader";

/** BOOK THREE — shared facts about the world. No member appears here. */
type SourceFact = { id: string; feed_id: string | null; yield: number | null; cadence: string | null; quote_fail_rate: number | null; route_death_rate: number | null; computed_at: string };

const T = {
  en: {
    header: "What the machine has learned",
    best: "Best sources",
    paused: "Sources paused",
    dead: "Links found dead this week",
    quotes: "Quotes not found on the page",
    none: "Nothing measured yet.",
    foot: "These are facts about sources, not about people. No member's name or preference is held here.",
  },
  ar: {
    header: "ما تعلّمته المنظومة",
    best: "أفضل المصادر",
    paused: "مصادر متوقفة",
    dead: "روابط ميتة هذا الأسبوع",
    quotes: "اقتباسات غير موجودة في الصفحة",
    none: "لا قياس بعد.",
    foot: "هذه حقائق عن المصادر لا عن الأشخاص. لا يُحفظ هنا اسم أي عضو ولا تفضيلاته.",
  },
};

const num = { fontFamily: "'IBM Plex Mono', monospace", color: "#F2F5F9" } as const;
const rowStyle = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: "#F2F5F9" } as const;

export function WhatTheMachineLearned({ language }: { language: "en" | "ar" }) {
  const t = T[language];
  const rtl = language === "ar";
  const [facts, setFacts] = useState<SourceFact[]>([]);
  const [dead, setDead] = useState(0);
  const [quotes, setQuotes] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await (supabase.from("oe_source_facts" as any) as any)
        .select("id,feed_id,yield,cadence,quote_fail_rate,route_death_rate,computed_at")
        .order("computed_at", { ascending: false }).limit(200);
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { count: deadCount } = await (supabase.from("oe_world_facts" as any) as any)
        .select("id", { count: "exact", head: true }).eq("kind", "route_pattern").gte("computed_at", since);
      const { count: quoteCount } = await (supabase.from("oe_opportunities" as any) as any)
        .select("id", { count: "exact", head: true }).eq("quote_verified", false);
      if (!live) return;
      setFacts((data ?? []) as SourceFact[]);
      setDead(deadCount ?? 0);
      setQuotes(quoteCount ?? 0);
    })();
    return () => { live = false; };
  }, []);

  const latest = new Map<string, SourceFact>();
  for (const fact of facts) if (fact.feed_id && !latest.has(fact.feed_id)) latest.set(fact.feed_id, fact);
  const all = [...latest.values()];
  const best = [...all].sort((a, b) => (b.yield ?? 0) - (a.yield ?? 0)).slice(0, 5);
  const paused = all.filter((f) => f.cadence === "paused").length;

  return <div dir={rtl ? "rtl" : "ltr"} style={{ marginTop: 28, lineHeight: rtl ? 1.9 : 1.55 }}>
    <SectionHeader label={t.header} />
    <AuraCard hover="none" style={{ background: "#0F1519", border: "1px solid #0F1519", borderRadius: 12, padding: 18 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#00CEC9", fontSize: 12, fontWeight: 700 }}>{t.best}</span>
          {best.length === 0 ? <span style={{ color: "#E2E7EE", fontSize: 13 }}>{t.none}</span> : best.map((fact) => <div key={fact.id} style={rowStyle}>
            <span style={{ opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(fact.feed_id).slice(0, 8)}</span>
            <span style={num}>{Math.round((fact.yield ?? 0) * 100)}%</span>
          </div>)}
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={rowStyle}><span style={{ opacity: 0.85 }}>{t.paused}</span><span style={num}>{paused}</span></div>
          <div style={rowStyle}><span style={{ opacity: 0.85 }}>{t.dead}</span><span style={num}>{dead}</span></div>
          <div style={rowStyle}><span style={{ opacity: 0.85 }}>{t.quotes}</span><span style={num}>{quotes}</span></div>
        </div>
        <p style={{ margin: 0, color: "#E2E7EE", opacity: 0.7, fontSize: 12 }}>{t.foot}</p>
      </div>
    </AuraCard>
  </div>;
}
