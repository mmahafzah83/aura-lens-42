import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * One line at the top of /admin when a paid service is running low or has
 * stopped. Nothing is shown while every vendor is fine — a silent banner is
 * the honest state.
 */
type Health = {
  vendor: string;
  level: string;
  remaining: number | null;
  used: number | null;
  limit_value: number | null;
  unit: string | null;
  checked_at: string;
};

const NAMES: Record<string, string> = {
  apify: "Apify",
  firecrawl: "Firecrawl",
  lovable_ai: "Lovable AI",
};
const TOPUP: Record<string, string> = {
  apify: "https://console.apify.com/billing",
  firecrawl: "https://www.firecrawl.dev/app/billing",
  lovable_ai: "https://lovable.dev/settings/billing",
};

export default function VendorHealthBanner() {
  const [rows, setRows] = useState<Health[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("oe_vendor_health")
        .select("vendor, level, remaining, used, limit_value, unit, checked_at")
        .order("checked_at", { ascending: false })
        .limit(60);
      if (!alive || !data) return;
      const latest = new Map<string, Health>();
      for (const r of data as Health[]) if (!latest.has(r.vendor)) latest.set(r.vendor, r);
      setRows([...latest.values()].filter((r) => r.level !== "ok"));
    })();
    return () => { alive = false; };
  }, []);

  if (!rows.length) return null;

  return (
    <div style={{ marginBottom: 18, display: "grid", gap: 8 }}>
      {rows.map((r) => {
        const stopped = r.level === "stopped";
        const colour = stopped ? "#C0392B" : "#9A6F12";
        const background = stopped ? "#FBEDEB" : "#FDF6E4";
        const border = stopped ? "#C0392B" : "#E0A82E";
        const number = r.remaining !== null
          ? `${r.remaining} ${r.unit ?? ""} left`
          : r.used !== null ? `${r.used} ${r.unit ?? ""} used` : "refusals in the last day";
        return (
          <div
            key={r.vendor}
            style={{
              background, border: `1px solid ${border}`, borderRadius: 4,
              padding: "10px 12px", color: colour, fontSize: 14,
              display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline",
            }}
          >
            <strong>{NAMES[r.vendor] ?? r.vendor}</strong>
            <span>{stopped ? "has stopped" : r.level === "act" ? "needs a top-up" : "is running low"} · {number}</span>
            <a href={TOPUP[r.vendor]} target="_blank" rel="noopener noreferrer" style={{ color: colour, textDecoration: "underline" }}>
              Top up
            </a>
          </div>
        );
      })}
    </div>
  );
}
