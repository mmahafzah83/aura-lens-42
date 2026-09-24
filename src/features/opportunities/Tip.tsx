/**
 * TAP-TO-OPEN EXPLANATIONS. The visible line stays one line — decision and
 * action. The "why" sits behind a small i: tap to open, tap again to close,
 * keyboard reachable, 44px target. Copy comes from oe_vocabulary (EN/AR).
 * Never put behind a Tip what the member must act on.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { Vocab } from "./useVocab";

export function Tip({ v, k, extra, label }: { v: Vocab; k: string; extra?: string | null; label?: string }) {
  const text = [v(k), extra ? v(extra) : ""].filter(Boolean).join(" ");
  if (!text) return null;
  return <InfoTooltip tapOnly width={290} label={label ?? v("tip_label")}>{text}</InfoTooltip>;
}

export type WorkArrangement = {
  id: string; work_arrangement: "onsite" | "hybrid" | "remote" | "unknown";
  work_arrangement_basis: string | null; work_arrangement_quote: string | null; applicant_regions: string[] | null;
};

const waCache = new Map<string, WorkArrangement>();

/** How each role is worked, read once per session. */
export function useWorkArrangements(ids: string[]) {
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");
  const [, bump] = useState(0);
  useEffect(() => {
    const missing = key ? key.split(",").filter((id) => !waCache.has(id)) : [];
    if (!missing.length) return;
    let live = true;
    void (async () => {
      const { data } = await supabase.rpc("oe_app_work_arrangement" as never, { p_ids: missing.slice(0, 200) } as never);
      for (const row of ((data ?? []) as WorkArrangement[])) waCache.set(row.id, row);
      if (live) bump((n) => n + 1);
    })();
    return () => { live = false; };
  }, [key]);
  return (id: string | null | undefined) => (id ? waCache.get(id) ?? null : null);
}

/** One chip: On site / Hybrid / Remote / not stated, with where it came from behind the i. */
export function WorkChip({ wa, v }: { wa: WorkArrangement | null; v: Vocab }) {
  if (!wa) return null;
  const basis = wa.work_arrangement_basis ? `wa_basis_${wa.work_arrangement_basis}` : "wa_basis_none";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{ border: "1px solid var(--border-default)", borderRadius: 4, padding: "1px 7px", fontSize: 12, color: "var(--text-secondary)", background: "var(--surface-card)" }}>{v(`wa_${wa.work_arrangement}`)}</span>
    <Tip v={v} k="tip_work_arrangement" extra={basis} />
  </span>;
}
