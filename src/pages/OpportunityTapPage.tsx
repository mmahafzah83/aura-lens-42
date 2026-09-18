import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuraCard } from "@/components/ui/AuraCard";
import { TapRow } from "@/features/opportunities/TapRow";
import { opportunitySentences } from "@/features/opportunities/labels";
import { chairKey, useVocab } from "@/features/opportunities/useVocab";
import type { OpportunityTap, PublicOpportunityCard } from "@/features/opportunities/types";

export default function OpportunityTapPage() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const [card, setCard] = useState<PublicOpportunityCard | null | undefined>(undefined);
  const [outcomeDone, setOutcomeDone] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await (supabase.rpc as any)("oe_card_public", { p_token: token });
      if (!live) return;
      const row = Array.isArray(data) ? data[0] : data;
      setCard(row ?? null);
      const outcome = params.get("o");
      if (row && ["applied", "won", "nothing"].includes(String(outcome))) {
        const { data: saved } = await (supabase.rpc as any)("oe_record_outcome", { p_token: token, p_outcome: outcome });
        if (live) setOutcomeDone(!!saved?.ok);
      }
    })();
    return () => { live = false; };
  }, [params, token]);
  const language = card?.language === "ar" ? "ar" : "en";
  const S = opportunitySentences[language];
  const v = useVocab(language);
  const action = params.get("a") as OpportunityTap | null;
  const validAction = ["right", "not_quite", "not_my_area", "less_from_here"].includes(String(action)) ? action : null;
  const rtl = language === "ar";
  return <main dir={rtl ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: "#F2F5F9", color: "#0F1519", display: "grid", placeItems: "center", padding: 16, fontFamily: rtl ? "Cairo, sans-serif" : "Inter, sans-serif" }}>
    <div style={{ width: "100%", maxWidth: 480 }}>
      <AuraCard hover="none" style={{ background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 20, padding: 20, boxShadow: "0 1px 2px rgba(15,21,25,.04)" }}>
        {card === undefined ? <p style={{ margin: 0, color: "#5B6673" }}>…</p> : !card ? <p style={{ margin: 0, color: "#5B6673" }}>{S.expired}</p> : <div style={{ display: "grid", gap: 16, lineHeight: rtl ? 1.9 : 1.55 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#5B6673" }}>{v(chairKey(card.chair_type)) || card.chair_type}</span>
          <h1 style={{ margin: 0, fontFamily: "inherit", fontSize: 23, lineHeight: rtl ? 1.7 : 1.3 }}>{card.title}</h1>
           {card.quote && <p style={{ margin: 0, color: "#5B6673", fontSize: 13 }}>“{card.quote}” {card.source_url && <a href={card.source_url} target="_blank" rel="noreferrer" style={{ color: "#0670C4" }}>{v("source")}</a>}</p>}
          {outcomeDone ? <p style={{ margin: 0, color: "#12805C" }}>{v("noted")}</p> : <TapRow token={token} language={language} source="email" initialTap={card.current_tap} autoTap={validAction} card={card} />}
          <Link to="/" style={{ color: "#5B6673", fontSize: 13, textDecoration: "underline" }}>{S.openAura}</Link>
        </div>}
      </AuraCard>
    </div>
  </main>;
}