import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Vocab } from "./useVocab";
import { Button } from "@/components/ui/button";
import { Tip } from "./Tip";

const mono = { fontFamily: "var(--ff-mono)" } as const;
type Prefs = { at: number; instant: boolean; digest: boolean; hour: number };

/** How many at a time, the instant email, and the daily summary. Saved on its own. */
export function DeliveryRow({ v }: { v: Vocab }) {
  const [prefs, setPrefs] = useState<Prefs>({ at: 3, instant: true, digest: true, hour: 8 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("oe_eligibility" as never)
        .select("cards_at_a_time, alert_instant, digest_on, digest_hour").eq("user_id", auth.user.id).maybeSingle();
      const row = (data ?? null) as { cards_at_a_time?: number; alert_instant?: boolean; digest_on?: boolean; digest_hour?: number } | null;
      if (row) setPrefs({ at: row.cards_at_a_time ?? 3, instant: row.alert_instant ?? true, digest: row.digest_on ?? true, hour: row.digest_hour ?? 8 });
    })();
  }, []);

  const save = async (next: Prefs) => {
    const before = prefs;
    setPrefs(next); setError(null);
    const { error: e } = await supabase.rpc("oe_delivery_save" as never, { p_at_a_time: next.at, p_instant: next.instant, p_digest: next.digest, p_digest_hour: next.hour } as never);
    if (e) { setPrefs(before); setError(e.message); return; }
    window.dispatchEvent(new Event("oe-delivery-saved"));
  };

  return <div className="oe-delivery">
    <div className="oe-dialog-row"><div><strong>{v("delivery_at_a_time")}<Tip v={v} k="tip_at_a_time" /></strong></div></div>
    <div className="oe-filter-row" role="group" aria-label={v("delivery_at_a_time")}>
      {[1, 3, 5, 0].map((n) => <Button key={n} variant="outline" aria-pressed={prefs.at === n} onClick={() => void save({ ...prefs, at: n })}>
        {n === 0 ? v("delivery_all") : <span style={mono}>{n}</span>}
      </Button>)}
    </div>
    <label className="oe-switch-row"><input type="checkbox" checked={prefs.instant} onChange={(e) => void save({ ...prefs, instant: e.target.checked })} /><span>{v("delivery_instant")}</span></label>
    <div className="oe-dialog-row"><div><strong>{v("delivery_digest_at")}</strong></div></div>
    <div className="oe-filter-row" role="group" aria-label={v("delivery_digest_at")}>
      {[7, 8, 9].map((h) => <Button key={h} variant="outline" aria-pressed={prefs.digest && prefs.hour === h} onClick={() => void save({ ...prefs, digest: true, hour: h })}>
        <span style={mono}>{`${h}:00`}</span>
      </Button>)}
      <Button variant="outline" aria-pressed={!prefs.digest} onClick={() => void save({ ...prefs, digest: false })}>{v("delivery_off")}</Button>
    </div>
    {error && <p role="alert" className="oe-save-error">{error}</p>}
  </div>;
}
