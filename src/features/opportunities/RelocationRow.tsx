import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Vocab } from "./useVocab";
import { Button } from "@/components/ui/button";

type Country = { iso2: string; name_en: string; name_ar: string | null };

/** "Open to relocating", with the countries he would move to. Saved on its own. */
export function RelocationRow({ countries, language, v }: { countries: Country[]; language: "en" | "ar"; v: Vocab }) {
  const [ok, setOk] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("oe_eligibility" as never)
        .select("relocation_ok, relocation_countries").eq("user_id", auth.user.id).maybeSingle();
      const row = (data ?? null) as { relocation_ok?: boolean; relocation_countries?: string[] } | null;
      setOk(Boolean(row?.relocation_ok));
      setPicked(row?.relocation_countries ?? []);
    })();
  }, []);

  const save = async (nextOk: boolean, nextPicked: string[]) => {
    const before = { ok, picked };
    setOk(nextOk); setPicked(nextPicked); setError(null);
    const { error: e } = await supabase.rpc("oe_relocation_save" as never, { p_ok: nextOk, p_countries: nextPicked } as never);
    if (e) { setOk(before.ok); setPicked(before.picked); setError(e.message); }
  };

  const name = (iso2: string) => {
    const row = countries.find((c) => c.iso2 === iso2);
    return row ? (language === "ar" ? (row.name_ar || row.name_en) : row.name_en) : iso2;
  };
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? countries.filter((c) => !picked.includes(c.iso2)
        && (c.name_en.toLowerCase().includes(needle) || String(c.name_ar ?? "").includes(query.trim()) || c.iso2.toLowerCase() === needle)).slice(0, 8)
    : [];

  return <div className="oe-relocation">
    <label className="oe-switch-row"><input type="checkbox" checked={ok} onChange={(e) => void save(e.target.checked, picked)} /><span>{v("place_relocate")}</span></label>
    {ok && <div className="oe-chip-row">
      {picked.map((iso2) => <Button key={iso2} variant="outline" aria-pressed onClick={() => void save(ok, picked.filter((x) => x !== iso2))}>{name(iso2)} ×</Button>)}
      <input type="search" className="oe-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={v("place_relocate_add")} aria-label={v("place_relocate_add")} />
      {matches.map((c) => <Button key={c.iso2} variant="outline" onClick={() => { setQuery(""); void save(ok, [...picked, c.iso2]); }}>{name(c.iso2)}</Button>)}
    </div>}
    {error && <p role="alert" className="oe-save-error">{error}</p>}
  </div>;
}
