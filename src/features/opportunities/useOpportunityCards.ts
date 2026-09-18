import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OpportunityCardData } from "./types";

const CARD_SELECT = "id,opportunity_id,card_date,why_lines,gap_line,quote,clock_text,fit_band,win_band,lane,cited_ids,explore_slot,tap_token,oe_opportunities(id,title,chair_type,time_kind,source_url,route_url,route_kind,issuer_id,seniority_band,location),oe_matches(requirement_check,met_count,total_count),oe_taps(tap,scope,tapped_at)";

export function memberDate(timezone?: string | null) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}

export function useOpportunityCards(userId?: string | null, days = 30) {
  const [cards, setCards] = useState<OpportunityCardData[]>([]);
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [timezone, setTimezone] = useState("Asia/Riyadh");
  const [winKnown, setWinKnown] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!userId) { setCards([]); setLoading(false); return; }
    setLoading(true);
    const { data: profile } = await (supabase.from("diagnostic_profiles" as any) as any)
      .select("content_language,timezone").eq("user_id", userId).maybeSingle();
    const lang = profile?.content_language === "ar" ? "ar" : "en";
    const tz = profile?.timezone || "Asia/Riyadh";
    setLanguage(lang); setTimezone(tz);
    const since = new Date(Date.now() - Math.max(1, days) * 86_400_000).toISOString().slice(0, 10);
    const { data } = await (supabase.from("oe_cards" as any) as any).select(CARD_SELECT)
      .eq("user_id", userId).gte("card_date", since).order("card_date", { ascending: false }).order("created_at", { ascending: false });
    const rows = (data ?? []) as OpportunityCardData[];
    // Warmth sits beside the bands; it is never folded into them.
    const oppIds = rows.map((c) => c.opportunity_id).filter(Boolean) as string[];
    let warmth: Record<string, any[]> = {};
    if (oppIds.length) {
      const { data: w } = await (supabase.from("oe_warmth" as any) as any)
        .select("opportunity_id,kind,strength,detail").eq("user_id", userId).in("opportunity_id", oppIds);
      warmth = (w ?? []).reduce((acc: Record<string, any[]>, r: any) => {
        if (r.kind === "none") return acc;
        (acc[r.opportunity_id] ||= []).push(r);
        return acc;
      }, {});
    }
    setCards(rows.map((c) => ({ ...c, warmth: c.opportunity_id ? warmth[c.opportunity_id] ?? [] : [] })));
    // The win mark stays quiet until he has answered at least once.
    const { count } = await (supabase.from("oe_outcomes" as any) as any)
      .select("id", { count: "exact", head: true }).eq("user_id", userId).neq("stage", "asked");
    setWinKnown((count ?? 0) > 0);
    setLoading(false);
  }, [days, userId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { cards, language, timezone, winKnown, today: memberDate(timezone), loading, refresh };
}
