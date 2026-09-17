import { AuraCard } from "@/components/ui/AuraCard";
import { bandLabels, chairLabels, opportunityLabels } from "./labels";
import { TapRow } from "./TapRow";
import type { OpportunityCardData } from "./types";

type Props = { card: OpportunityCardData; language: "en" | "ar"; readOnly?: boolean; onSaved?: () => void };

export function OpportunityCard({ card, language, readOnly, onSaved }: Props) {
  const L = opportunityLabels[language];
  const opp = card.oe_opportunities;
  const tap = card.oe_taps?.slice().sort((a, b) => String(b.tapped_at).localeCompare(String(a.tapped_at)))[0]?.tap ?? null;
  const rtl = language === "ar";
  const font = rtl ? "Cairo, sans-serif" : "Inter, sans-serif";
  return (
    <AuraCard hover="none" style={{ background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 20, padding: 20, boxShadow: "0 1px 2px rgba(15,21,25,.04)", fontFamily: font }}>
      <div dir={rtl ? "rtl" : "ltr"} style={{ display: "grid", gap: 14, color: "#0F1519", lineHeight: rtl ? 1.9 : 1.55 }}>
        {!card.opportunity_id ? <p style={{ margin: 0, color: "#5B6673", display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: "#00CEC9" }} />{L.empty}</p> : <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12, fontWeight: 700 }}>
            <span>{chairLabels[String(opp?.chair_type)]?.[language] ?? opp?.chair_type}</span>
            <span style={{ border: "1px solid #E2E7EE", borderRadius: 4, padding: "2px 7px", color: opp?.time_kind === "early_signal" ? "#9A6F12" : "#0670C4", background: "#FFFFFF" }}>{opp?.time_kind === "early_signal" ? L.early : L.open}</span>
          </div>
          <h3 style={{ margin: 0, fontFamily: font, fontSize: 21, lineHeight: rtl ? 1.75 : 1.3, fontWeight: 700 }}>{opp?.title}</h3>
          {card.clock_text && <p style={{ margin: 0, color: "#9A6F12", fontFamily: "IBM Plex Mono, monospace", fontSize: 13 }}>{card.clock_text}</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {(card.why_lines ?? []).slice(0, 2).map((why, i) => <p key={i} style={{ margin: 0, color: "#5B6673", display: "flex", gap: 9 }}><span aria-hidden style={{ flex: "0 0 6px", width: 6, height: 6, marginTop: rtl ? 12 : 8, borderRadius: 99, background: "#00CEC9" }} />{why.text}</p>)}
            {card.gap_line?.text && <p style={{ margin: 0, color: "#5B6673", display: "flex", gap: 9 }}><span aria-hidden style={{ flex: "0 0 6px", width: 6, height: 6, marginTop: rtl ? 12 : 8, borderRadius: 99, background: "#E0A82E" }} />{card.gap_line.text}</p>}
          </div>
          {card.quote && <p style={{ margin: 0, color: "#5B6673", fontSize: 13 }}>“{card.quote}” {opp?.source_url && <a href={opp.source_url} target="_blank" rel="noreferrer" style={{ color: "#0670C4" }}>{language === "ar" ? "المصدر" : "source"}</a>}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
            {([[L.fits, card.fit_band], [L.win, card.win_band]] as const).map(([label, band]) => <div key={label} style={{ border: "1px solid #E2E7EE", borderRadius: 12, padding: 11, color: "#5B6673", fontSize: 12 }}><span>{label}</span><strong style={{ display: "block", color: "#0F1519", fontSize: 14, marginTop: 2 }}>{bandLabels[String(band)]?.[language] ?? band}</strong></div>)}
          </div>
          <TapRow token={card.tap_token} language={language} source="app" initialTap={tap} readOnly={readOnly || !!tap} onSaved={onSaved} card={{ issuer_id: opp?.issuer_id ?? null, seniority_band: opp?.seniority_band ?? null, location: opp?.location ?? null, opportunity_id: card.opportunity_id, chair_type: opp?.chair_type ?? null }} />
        </>}
      </div>
    </AuraCard>
  );
}