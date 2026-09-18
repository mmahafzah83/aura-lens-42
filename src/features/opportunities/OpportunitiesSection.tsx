import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { AuraCard } from "@/components/ui/AuraCard";
import { CollapsibleList } from "@/components/ui/CollapsibleList";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { OpportunityCard } from "./OpportunityCard";
import { opportunitySentences } from "./labels";
import { bandKey, chairKey, useVocab } from "./useVocab";
import { useOpportunityCards } from "./useOpportunityCards";
import { WhatYouCanHold } from "./WhatYouCanHold";
import type { OpportunityCardData } from "./types";


export function OpportunitiesSection() {
  const [userId, setUserId] = useState<string | null>(null);
  const [matching, setMatching] = useState<boolean | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const opportunities = useOpportunityCards(userId, 30);
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      if (!live) return;
      setUserId(uid);
      if (!uid) return;
      const { data } = await (supabase.from("oe_consents" as any) as any).select("kind")
        .eq("user_id", uid).is("revoked_at", null).in("kind", ["matching", "forwarding"]);
      if (!live) return;
      setMatching((data ?? []).some((row: any) => row.kind === "matching"));
      setForwarding((data ?? []).some((row: any) => row.kind === "forwarding"));
    })();
    return () => { live = false; };
  }, []);
  const language = opportunities.language;
  const S = opportunitySentences[language];
  const v = useVocab(language);
  const rtl = language === "ar";

  const enable = async (kind: "matching" | "forwarding") => {
    if (!userId) return;
    setBusy(true);
    const { data: old } = await (supabase.from("oe_consents" as any) as any).select("id")
      .eq("user_id", userId).eq("kind", kind).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (old) await (supabase.from("oe_consents" as any) as any).update({ revoked_at: null, granted_at: new Date().toISOString() }).eq("id", old.id);
    else await (supabase.from("oe_consents" as any) as any).insert({ user_id: userId, kind, version: "1.0" });
    if (kind === "matching") {
      setMatching(true);
      const { count } = await (supabase.from("oe_faces" as any) as any).select("id", { count: "exact", head: true }).eq("user_id", userId);
      if ((count ?? 0) < 5) await supabase.functions.invoke("oe-build-faces", { body: { user_id: userId } });
    } else setForwarding(true);
    setBusy(false);
  };
  const disableForwarding = async () => {
    if (!userId) return;
    setForwarding(false);
    await (supabase.from("oe_consents" as any) as any).update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId).eq("kind", "forwarding").is("revoked_at", null);
  };
  const tapState = (card: OpportunityCardData) => card.oe_taps?.[0]?.tap ?? null;

  return <section dir={rtl ? "rtl" : "ltr"} style={{ marginTop: 34, borderTop: "1px solid #E2E7EE", paddingTop: 24, fontFamily: rtl ? "Cairo, sans-serif" : "Inter, sans-serif" }}>
    <SectionHeader label={S.opportunities} />
    {matching ? <><WhatYouCanHold userId={userId} language={language} /><YourRules userId={userId} language={language} /></> : null}
    {matching === false ? <AuraCard hover="none" style={{ background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 20, padding: 20 }}>

      <div style={{ display: "grid", gap: 16, lineHeight: rtl ? 1.9 : 1.55 }}>
        <p style={{ margin: 0, color: "#5B6673" }}>{rtl ? "يمكن لـ Aura أن تبحث لك عن مقاعد وتكليفات وغرف ومنصات تناسب ما أنجزته — فرصة واحدة يومياً، لا أكثر." : "Aura can look for chairs, mandates, rooms and stages that fit what you have done — one a day, nothing more."}</p>
        <AuraButton onClick={() => void enable("matching")} loading={busy} style={{ justifySelf: "start", background: "#0670C4" }}>{rtl ? "ابدأ البحث" : "Start looking"}</AuraButton>
      </div>
    </AuraCard> : opportunities.cards.length > 0 ? <CollapsibleList items={opportunities.cards} visibleCount={5} label={S.opportunities.toLowerCase()} renderItem={(card) => {
      const tap = tapState(card);
      const expanded = openId === card.id;
      return <div style={{ borderBottom: "1px solid #E2E7EE" }}>
        <button type="button" onClick={() => setOpenId(expanded ? null : card.id)} aria-expanded={expanded} style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, padding: "13px 0", border: 0, background: "transparent", color: "#0F1519", textAlign: "start", cursor: "pointer", fontFamily: "inherit" }}>
          <span><strong style={{ display: "block", fontSize: 14 }}>{card.oe_opportunities?.title ?? v("nothing_today")}</strong><span style={{ display: "block", color: "#5B6673", fontSize: 12, marginTop: 3 }}>{v(chairKey(card.oe_opportunities?.chair_type))} · {v(bandKey(card.fit_band))} · {card.clock_text ?? ""}</span></span>
          <span style={{ color: "#5B6673", fontSize: 12 }}>{tap === "right" ? `✓ ${v("tap_right")}` : tap === "not_quite" ? `— ${v("tap_not_quite")}` : tap === "not_my_area" ? `✕ ${v("tap_not_mine")}` : S.unanswered}</span>
        </button>
        {expanded && <div style={{ paddingBottom: 14 }}><OpportunityCard card={card} language={language} readOnly={!!tap} winKnown={opportunities.winKnown} onSaved={opportunities.refresh} /></div>}
      </div>;
    }} /> : !opportunities.loading && <AuraCard hover="none" style={{ background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 20 }}><p style={{ margin: 0, color: "#5B6673" }}>{v("nothing_today")}</p></AuraCard>}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18, padding: "14px 0" }}>
      <div><strong style={{ fontSize: 14 }}>{rtl ? "أرسل لي ما أسمع عنه" : "Forward me things I hear about"}</strong><p style={{ margin: "3px 0 0", color: "#5B6673", fontSize: 12 }}>{rtl ? "أرسل رسالة أو رابطاً إلى Aura لتبحث عن نسخته العامة." : "Send a message or a link to Aura and it looks for the public version."}</p></div>
      <button type="button" role="switch" aria-checked={forwarding} aria-label="Forwarding consent" onClick={() => void (forwarding ? disableForwarding() : enable("forwarding"))} style={{ width: 44, height: 24, flex: "0 0 44px", border: 0, borderRadius: 12, background: forwarding ? "#0670C4" : "#E2E7EE", padding: 2, cursor: "pointer" }}><span style={{ display: "block", width: 20, height: 20, borderRadius: 10, background: "#FFFFFF", transform: forwarding ? (rtl ? "translateX(-20px)" : "translateX(20px)") : "none", transition: "transform 160ms" }} /></button>
    </div>
  </section>;
}