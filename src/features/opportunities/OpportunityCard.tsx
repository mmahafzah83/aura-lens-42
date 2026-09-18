import { AuraCard } from "@/components/ui/AuraCard";
import { bandKey, chairKey, useVocab } from "./useVocab";
import { TapRow } from "./TapRow";
import type { OpportunityCardData } from "./types";

type Props = { card: OpportunityCardData; language: "en" | "ar"; readOnly?: boolean; winKnown?: boolean; onSaved?: () => void };

export function OpportunityCard({ card, language, readOnly, winKnown, onSaved }: Props) {
  const v = useVocab(language);
  const opp = card.oe_opportunities;
  const tap = card.oe_taps?.slice().sort((a, b) => String(b.tapped_at).localeCompare(String(a.tapped_at)))[0]?.tap ?? null;
  const rtl = language === "ar";
  const font = rtl ? "Cairo, sans-serif" : "Inter, sans-serif";
  // The writing lane carries no score, no band and no clock — none apply.
  const writeLane = card.lane === "write";
  const lane = writeLane ? "lane_write" : card.lane === "lane_forming" ? "lane_forming" : "lane_open";

  const routeUrl = opp?.route_url ?? null;
  return (
    <AuraCard hover="none" style={{ background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 20, padding: 20, boxShadow: "0 1px 2px rgba(15,21,25,.04)", fontFamily: font }}>
      <div dir={rtl ? "rtl" : "ltr"} style={{ display: "grid", gap: 14, color: "#0F1519", lineHeight: rtl ? 1.9 : 1.55 }}>
        {!card.opportunity_id ? <p style={{ margin: 0, color: "#5B6673", display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: "#00CEC9" }} />{v("nothing_today")}</p> : <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12, fontWeight: 700 }}>
            <span>{v(chairKey(opp?.chair_type)) || opp?.chair_type}</span>
            <span style={{ border: "1px solid #E2E7EE", borderRadius: 4, padding: "2px 7px", color: lane === "lane_forming" ? "#9A6F12" : "#0670C4", background: "#FFFFFF" }}>{v(lane)}</span>
            {/* Everything except an ordinary published call is a find only we made. */}
            {opp?.discovery_kind && opp.discovery_kind !== "posted_opening" && (
              <span style={{ border: "1px solid #E0A82E", borderRadius: 4, padding: "2px 7px", color: "#9A6F12", background: "#FFFFFF" }}>{v("hidden_find")}</span>
            )}
          </div>
          <h3 style={{ margin: 0, fontFamily: font, fontSize: 21, lineHeight: rtl ? 1.75 : 1.3, fontWeight: 700 }}>{opp?.title}</h3>
          {opp?.discovery_kind && opp.discovery_kind !== "posted_opening" && (
            <p style={{ margin: 0, fontSize: 12, color: "#5B6673" }}>
              <strong style={{ color: "#0F1519" }}>{v("hidden_why")}: </strong>
              {v(`discovery_${opp.discovery_kind}`) || opp.discovery_kind}
              {card.lead
                ? ` · ${v("expected_lead")} ${card.lead.days} ${v("days")} (${v("sample_of")} ${card.lead.sample})`
                : ["term_ending", "corporate_event_inference"].includes(opp.discovery_kind) ? ` · ${v("not_measured_yet")}` : ""}
            </p>
          )}
          {card.clock_text && <p style={{ margin: 0, color: "#9A6F12", fontFamily: "IBM Plex Mono, monospace", fontSize: 13 }}>{card.clock_text}</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {(card.why_lines ?? []).slice(0, 2).map((why, i) => <p key={i} style={{ margin: 0, color: "#5B6673", display: "flex", gap: 9 }}><span aria-hidden style={{ flex: "0 0 6px", width: 6, height: 6, marginTop: rtl ? 12 : 8, borderRadius: 99, background: "#00CEC9" }} />{why.text}</p>)}
            {card.gap_line?.text && <p style={{ margin: 0, color: "#5B6673", display: "flex", gap: 9 }}><span aria-hidden style={{ flex: "0 0 6px", width: 6, height: 6, marginTop: rtl ? 12 : 8, borderRadius: 99, background: "#E0A82E" }} /><span><strong style={{ color: "#0F1519" }}>{v("the_distance")}: </strong>{card.gap_line.text}</span></p>}
          </div>
          {(() => {
            const check = card.oe_matches;
            const total = Number(check?.total_count ?? 0);
            const met = Number(check?.met_count ?? 0);
            const missing = (check?.requirement_check ?? []).filter((r) => !r.met).map((r) => r.requirement);
            if (!check) return null;
            return (
              <div style={{ border: "1px solid #E2E7EE", borderRadius: 12, padding: 11, display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#5B6673" }}>
                  <strong style={{ color: "#0F1519" }}>{v("what_they_ask")}: </strong>
                  {total === 0 ? v("no_requirements_published") : `${met} / ${total}`}
                </span>
                {missing.length > 0 && (
                  <ul style={{ margin: 0, paddingInlineStart: 18, color: "#5B6673", fontSize: 13 }}>
                    {missing.slice(0, 4).map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                )}
              </div>
            );
          })()}
          {(card.warmth ?? []).length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: "#5B6673" }}>
              <strong style={{ color: "#0F1519" }}>{v("warmth")}: </strong>
              {(card.warmth ?? []).map((w) => v(`warmth_${w.kind}`) || w.kind).join(" · ")}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 13 }}>{routeUrl
            ? <a href={routeUrl} target="_blank" rel="noreferrer" style={{ color: "#0670C4", fontWeight: 600 }}>{v("the_way_in")}</a>
            : <span style={{ color: "#5B6673" }}>{v("no_way_in")}</span>}</p>
          {card.quote && <p style={{ margin: 0, color: "#5B6673", fontSize: 13 }}>“{card.quote}” {opp?.source_url && <a href={opp.source_url} target="_blank" rel="noreferrer" style={{ color: "#0670C4" }}>{v("source_link")}</a>}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
            {([[v("fits_you"), v(bandKey(card.fit_band))], [v("your_chance"), winKnown ? v(bandKey(card.win_band)) : v("not_known_yet")]] as const).map(([label, word]) => <div key={label} style={{ border: "1px solid #E2E7EE", borderRadius: 12, padding: 11, color: "#5B6673", fontSize: 12 }}><span>{label}</span><strong style={{ display: "block", color: "#0F1519", fontSize: 14, marginTop: 2 }}>{word}</strong></div>)}
          </div>
          <TapRow token={card.tap_token} language={language} source="app" initialTap={tap} readOnly={readOnly || !!tap} onSaved={onSaved} card={{ issuer_id: opp?.issuer_id ?? null, seniority_band: opp?.seniority_band ?? null, location: opp?.location ?? null, opportunity_id: card.opportunity_id, chair_type: opp?.chair_type ?? null }} />
        </>}
      </div>
    </AuraCard>
  );
}
