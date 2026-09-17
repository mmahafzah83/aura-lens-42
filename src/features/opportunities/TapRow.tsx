import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { opportunityLabels } from "./labels";
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

export function TapRow({ token, language, source, card, initialTap = null, autoTap = null, readOnly, onSaved }: Props) {
  const L = opportunityLabels[language];
  const [tap, setTap] = useState<OpportunityTap | null>(initialTap);
  const [scope, setScope] = useState<OpportunityScope | null>(null);
  const [saving, setSaving] = useState(false);
  const scopeValue = useMemo(() => ({ issuer: card.issuer_id, level: card.seniority_band, place: card.location, type: card.chair_type, just_this: card.opportunity_id }), [card]);

  const record = async (nextTap: OpportunityTap, nextScope?: OpportunityScope) => {
    if (!token || saving) return;
    setSaving(true);
    const effectiveTap = nextTap === "less_from_here" ? "not_quite" : nextTap;
    const effectiveScope = nextTap === "less_from_here" ? "issuer" : nextScope ?? null;
    const { data } = await (supabase.rpc as any)("oe_record_tap", {
      p_token: token, p_tap: effectiveTap, p_scope: effectiveScope,
      p_scope_value: effectiveScope ? String(scopeValue[effectiveScope] ?? "") : null,
      p_source: source,
    });
    if (data?.ok) { setTap(effectiveTap); setScope(effectiveScope); onSaved?.(); }
    setSaving(false);
  };

  useEffect(() => { if (autoTap && !initialTap) void record(autoTap); }, []); // token-link action runs once

  if (readOnly && tap) return <p style={{ margin: 0, color: "#5B6673", fontSize: 14 }}>{L.noted}</p>;
  if (scope) return <p style={{ margin: 0, color: "#12805C", fontSize: 14 }}>{scope === "type" || scope === "issuer" ? L.understoodLong : L.understood}</p>;
  if (tap === "not_quite" || tap === "not_my_area") return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, color: "#0F1519", fontSize: 14, fontWeight: 600 }}>{L.part}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {scopes[tap].map((value) => <button key={value} type="button" disabled={saving} onClick={() => void record(tap, value)} style={{ minHeight: 36, padding: "7px 10px", borderRadius: 4, border: "1px solid #E2E7EE", background: "#FFFFFF", color: "#0F1519", cursor: "pointer", fontFamily: "inherit" }}>{value === "just_this" ? L.just : L[value]}</button>)}
      </div>
    </div>
  );
  if (tap) return <p style={{ margin: 0, color: "#12805C", fontSize: 14 }}>{L.noted}</p>;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <AuraButton onClick={() => void record("right")} loading={saving} style={{ background: "#0670C4", borderRadius: 8 }}>{L.right}</AuraButton>
      <AuraButton variant="ghost" onClick={() => void record("not_quite")} disabled={saving} style={{ borderColor: "#E2E7EE", borderRadius: 8 }}>{L.notQuite}</AuraButton>
      <AuraButton variant="ghost" onClick={() => void record("not_my_area")} disabled={saving} style={{ borderColor: "#E2E7EE", borderRadius: 8 }}>{L.notArea}</AuraButton>
      <button type="button" onClick={() => void record("less_from_here")} disabled={saving} style={{ border: 0, background: "transparent", padding: 6, color: "#5B6673", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>{L.lessIssuer}</button>
    </div>
  );
}