import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useLiveData — one-shot per-page-load fetch of the signed-in user's
 * diagnostic_profiles row and top strategic_signal by priority_score.
 * All fields safe with fallbacks; caller shapes defaults per family.
 */

export interface LiveProfile {
  first_name: string | null;
  level: string | null;
  firm: string | null;
  core_practice: string | null;
  sector_focus: string | null;
}

export interface LiveData {
  profile: LiveProfile | null;
  topSignal: string | null;
  loading: boolean;
}

export function useLiveData(): LiveData {
  const [profile, setProfile] = useState<LiveProfile | null>(null);
  const [topSignal, setTopSignal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) { if (alive) setLoading(false); return; }
      const [{ data: prof }, { data: sig }] = await Promise.all([
        supabase
          .from("diagnostic_profiles")
          .select("first_name, level, firm, core_practice, sector_focus")
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("strategic_signals")
          .select("signal_title, priority_score")
          .eq("user_id", uid)
          .eq("status", "active")
          .order("priority_score", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!alive) return;
      setProfile((prof as LiveProfile) || null);
      setTopSignal((sig as any)?.signal_title || null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return { profile, topSignal, loading };
}

export interface Defaults {
  name: string;
  title: string;
  lines: string[];
  meta: string;
}

/** Compose family-appropriate default fields from live data. */
export function defaultsFor(family: string, live: LiveData): Defaults {
  const p = live.profile;
  const name = (p?.first_name || "").trim() || "Your name";
  const level = (p?.level || "").trim();
  const firm = (p?.firm || "").trim();
  const practice = (p?.core_practice || "").trim();
  const sector = (p?.sector_focus || "").trim();
  const meta = firm || level || "";
  if (family === "cover" || family === "signature") {
    return {
      name,
      title: "Signature",
      lines: [
        practice || "A short line about what you do.",
        sector ? `Focused on ${sector}.` : "For the people you serve.",
      ],
      meta,
    };
  }
  const quote = live.topSignal || "One sentence you would sign.";
  return {
    name,
    title: level || "Perspective",
    lines: [quote, ""],
    meta,
  };
}