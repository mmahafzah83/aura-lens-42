import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { opportunitySentences } from "./labels";
import { useVocab } from "./useVocab";
import type { OpportunityScope, OpportunityTap, PublicOpportunityCard } from "./types";

type Props = {
  token: string;
  language: "en" | "ar";
  source: "email" | "app";
  card: Pick<PublicOpportunityCard, "issuer_id" | "seniority_band" | "location" | "opportunity_id" | "chair_type">;
  initialTap?: OpportunityTap | null;
  autoTap?: OpportunityTap | null;
  readOnly?: boolean;
  onSaved?: () => void;
};

const scopes: Record<"not_quite" | "not_my_area", OpportunityScope[]> = {
  not_quite: ["issuer", "level", "place", "type", "just_this"],
  not_my_area: ["type", "issuer", "just_this"],
};

// A fact about the record, not a preference. These travel to every member and
// carry nothing about the person who reported them.
type TruthCode = "dead_route" | "quote_absent" | "listing_page" | "already_happened" | "wrong_issuer";
const truthCodes: TruthCode[] = ["dead_route", "quote_absent", "listing_page", "already_happened", "wrong_issuer"];
const truthText: Record<"en" | "ar", Record<TruthCode, string>> = {
  en: {
    dead_route: "The link doesn't work",
    quote_absent: "The quote isn't on the page",
    listing_page: "This is a listing page",
    already_happened: "This already happened",
    wrong_issuer: "Wrong organisation",
  },
  ar: {
    dead_route: "الرابط لا يعمل",
    quote_absent: "الاقتباس غير موجود في الصفحة",
    listing_page: "هذه صفحة قائمة",
    already_happened: "هذا حدث سابق",
    wrong_issuer: "جهة خاطئة",
  },
};
const groupText = {
  en: { taste: "Not for me", truth: "Something is wrong with it", thanks: "Thank you — we have corrected the record." },
  ar: { taste: "ليست لي", truth: "هناك خطأ فيها", thanks: "شكرًا — صحّحنا السجل." },
};

const chipStyle = { minHeight: 36, padding: "7px 10px", borderRadius: 4, border: "1px solid #E2E7EE", background: "#FFFFFF", color: "#0F1519", cursor: "pointer", fontFamily: "inherit" } as const;
const groupLabelStyle = { margin: 0, color: "#5B6673", fontSize: 12, fontWeight: 700 } as const;

export function TapRow({ token, language, source, card, initialTap = null, autoTap = null, readOnly, onSaved }: Props) {
  const S = opportunitySentences[language];
  const v = useVocab(language);
  const G = groupText[language];
  const [tap, setTap] = useState<OpportunityTap | null>(initialTap);
  const [scope, setScope] = useState<OpportunityScope | null>(null);
  const [truth, setTruth] = useState<TruthCode | null>(null);
  const [saving, setSaving] = useState(false);
  const scopeValue = useMemo(() => ({ issuer: card.issuer_id, level: card.seniority_band, place: card.location, type: card.chair_type, just_this: card.opportunity_id }), [card]);

  const record = async (nextTap: OpportunityTap, nextScope?: OpportunityScope) => {
    if (!token || saving) return;
    setSaving(true);
    const effectiveTap = nextTap;
    const effectiveScope = nextTap === "less_from_here" ? "issuer" : nextScope ?? null;
    const { data } = await (supabase.rpc as any)("oe_record_tap", {
      p_token: token, p_tap: effectiveTap, p_scope: effectiveScope,
      p_scope_value: effectiveScope ? String(scopeValue[effectiveScope] ?? "") : null,
      p_source: source,
    });
    if (data?.ok) { setTap(nextTap === "less_from_here" ? "not_quite" : effectiveTap); setScope(effectiveScope); onSaved?.(); }
    setSaving(false);
  };

  const recordTruth = async (code: TruthCode) => {
    if (!token || saving) return;
    setSaving(true);
    const { data } = await (supabase.rpc as any)("oe_record_truth", { p_token: token, p_code: code, p_source: source });
    if (data?.ok) { setTruth(code); onSaved?.(); }
    setSaving(false);
  };

  useEffect(() => {
    if (!autoTap) return;
    const key = `oe:tap:${token}:${autoTap}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    void record(autoTap);
  }, []); // token-link action runs once per browser session

  if (readOnly && tap) return <p style={{ margin: 0, color: "#5B6673", fontSize: 14 }}>{v("noted")}</p>;
  if (truth) return <p style={{ margin: 0, color: "#12805C", fontSize: 14 }}>{G.thanks}</p>;
  if (scope) return <p style={{ margin: 0, color: "#12805C", fontSize: 14 }}>{scope === "type" || scope === "issuer" ? S.understoodLong : S.understood}</p>;
  if (tap === "not_quite" || tap === "not_my_area") return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, color: "#0F1519", fontSize: 14, fontWeight: 600 }}>{S.part}</p>
        <p style={groupLabelStyle}>{G.taste}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {scopes[tap].map((value) => <button key={value} type="button" disabled={saving} onClick={() => void record(tap, value)} style={chipStyle}>{value === "just_this" ? S.just : S[value]}</button>)}
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <p style={groupLabelStyle}>{G.truth}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {truthCodes.map((code) => <button key={code} type="button" disabled={saving} onClick={() => void recordTruth(code)} style={chipStyle}>{truthText[language][code]}</button>)}
        </div>
      </div>
    </div>
  );

  if (tap) return <p style={{ margin: 0, color: "#12805C", fontSize: 14 }}>{v("noted")}</p>;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <AuraButton onClick={() => void record("right")} loading={saving} style={{ background: "#0670C4", borderRadius: 8 }}>{v("tap_right")}</AuraButton>
      <AuraButton variant="ghost" onClick={() => void record("not_quite")} disabled={saving} style={{ borderColor: "#E2E7EE", borderRadius: 8 }}>{v("tap_not_quite")}</AuraButton>
      <AuraButton variant="ghost" onClick={() => void record("not_my_area")} disabled={saving} style={{ borderColor: "#E2E7EE", borderRadius: 8 }}>{v("tap_not_mine")}</AuraButton>
      <button type="button" onClick={() => void record("less_from_here")} disabled={saving} style={{ border: 0, background: "transparent", padding: 6, color: "#5B6673", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>{v("less_from_source")}</button>
    </div>
  );
}
