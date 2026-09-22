import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { SectionHeader } from "@/components/ui/SectionHeader";

/**
 * YOUR FILTERS — the member's rules as fixed choices, stored as data.
 *
 * No country, sector or level is named in this file. Every option is read from
 * the reference tables, so a correction is a row, never a deploy. Nothing here
 * applies until he taps Save.
 */

export type FilterRow = { op: string; values: string[] };
export type FilterMap = Record<string, FilterRow | undefined>;

type Country = { iso2: string; name_en: string; region_codes: string[] };
type Region = { code: string; name_en: string; sort: number };
type Named = { code: string; name_en: string; rank?: number };

type Field = "place" | "level" | "sector" | "kind" | "engagement" | "org_type" | "language" | "nationality";

const chip = {
  minHeight: 44, padding: "8px 12px", borderRadius: 4,
  border: "1px solid var(--border-default)", background: "var(--surface-card)",
  color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
} as const;
const chipOn = { ...chip, borderColor: "var(--accent-line)", background: "var(--surface-raised)" } as const;

const LANGUAGES: Named[] = [{ code: "en", name_en: "English" }, { code: "ar", name_en: "Arabic" }];
const REMOTE = "REMOTE";

export function FiltersSection({ filters, cardKinds = [], notShownNote = "", onSaved, t }: {
  filters: FilterMap;
  /** The kinds that can reach Today. Everything else is watched, not shown. */
  cardKinds?: string[];
  notShownNote?: string;
  onSaved: () => Promise<void> | void;
  t: (key: string, fallback: string) => string;
}) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [sectors, setSectors] = useState<Named[]>([]);
  const [levels, setLevels] = useState<Named[]>([]);
  const [engagements, setEngagements] = useState<Named[]>([]);
  const [orgTypes, setOrgTypes] = useState<Named[]>([]);
  const [kinds, setKinds] = useState<Named[]>([]);
  const [open, setOpen] = useState<Field | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [c, r, s, l, e, o, k] = await Promise.all([
        (supabase.from("oe_ref_countries" as never) as never as { select: (q: string) => Promise<{ data: Country[] | null }> }).select("iso2,name_en,region_codes"),
        (supabase.from("oe_ref_regions" as never) as never as { select: (q: string) => Promise<{ data: Region[] | null }> }).select("code,name_en,sort"),
        (supabase.from("oe_ref_sectors" as never) as never as { select: (q: string) => Promise<{ data: Named[] | null }> }).select("code,name_en"),
        (supabase.from("oe_ref_levels" as never) as never as { select: (q: string) => Promise<{ data: Named[] | null }> }).select("code,name_en,rank"),
        (supabase.from("oe_ref_engagements" as never) as never as { select: (q: string) => Promise<{ data: Named[] | null }> }).select("code,name_en"),
        (supabase.from("oe_ref_org_types" as never) as never as { select: (q: string) => Promise<{ data: Named[] | null }> }).select("code,name_en"),
        (supabase.from("oe_opportunity_kinds" as never) as never as { select: (q: string) => Promise<{ data: Array<{ code: string; label_en?: string; description_en?: string }> | null }> }).select("code,label_en,description_en"),
      ]);
      if (!live) return;
      setCountries((c.data ?? []).slice().sort((a, b) => a.name_en.localeCompare(b.name_en)));
      setRegions((r.data ?? []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)));
      setSectors(s.data ?? []);
      setLevels((l.data ?? []).slice().sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0)));
      setEngagements(e.data ?? []);
      setOrgTypes(o.data ?? []);
      setKinds((k.data ?? []).map((row) => ({ code: row.code, name_en: row.label_en || row.code.replace(/_/g, " ") })));
    })();
    return () => { live = false; };
  }, []);

  const nameOf = useCallback((rows: Named[], code: string) => rows.find((row) => row.code === code)?.name_en ?? code, []);
  const countryName = useCallback((iso: string) => countries.find((row) => row.iso2 === iso)?.name_en ?? iso, [countries]);

  const placeSummary = useMemo(() => {
    const chosen = filters.place?.values ?? [];
    if (!chosen.length) return t("filter_place_any", "Anywhere");
    const regionParts = chosen.filter((v) => v.startsWith("region:")).map((v) => {
      const code = v.slice(7);
      const size = countries.filter((row) => row.region_codes?.includes(code)).length;
      return `${nameOf(regions as Named[], code)} (${size})`;
    });
    const plain = chosen.filter((v) => !v.startsWith("region:") && v !== REMOTE);
    const covered = new Set(chosen.filter((v) => v.startsWith("region:")).flatMap((v) =>
      countries.filter((row) => row.region_codes?.includes(v.slice(7))).map((row) => row.iso2)));
    const single = plain.filter((iso) => !covered.has(iso)).map(countryName);
    return [...single, ...regionParts, chosen.includes(REMOTE) ? t("filter_remote", "Remote") : null]
      .filter(Boolean).join(", ");
  }, [filters.place, countries, regions, nameOf, countryName, t]);

  const listSummary = (field: Field, rows: Named[], anyLabel: string) => {
    const chosen = filters[field]?.values ?? [];
    if (!chosen.length) return anyLabel;
    return chosen.map((code) => nameOf(rows, code)).join(", ");
  };
  const levelSummary = () => {
    const row = filters.level;
    if (!row?.values?.length) return t("filter_level_any", "At or above my level");
    return `${row.op === "at_or_above" ? t("filter_level_prefix", "At or above") + " " : ""}${row.values.map((code) => nameOf(levels, code)).join(", ")}`;
  };

  const rows: Array<{ field: Field; label: string; summary: string }> = [
    { field: "place", label: t("filter_where", "Where"), summary: placeSummary },
    { field: "level", label: t("filter_level", "Level"), summary: levelSummary() },
    { field: "sector", label: t("filter_sectors", "Sectors"), summary: (filters.sector?.op === "allow" ? `${t("filter_only_these", "Only these")}: ` : "") + listSummary("sector", sectors, t("filter_all_sectors", "All sectors")) },
    { field: "kind", label: t("filter_kinds", "What kinds of opportunity"), summary: listSummary("kind", kinds, t("filter_all_kinds", "All kinds")) },
    { field: "engagement", label: t("filter_engagement", "Engagement"), summary: listSummary("engagement", engagements, t("filter_any", "Any")) },
    { field: "org_type", label: t("filter_org_type", "Organisation type"), summary: listSummary("org_type", orgTypes, t("filter_any", "Any")) },
    { field: "language", label: t("filter_language", "Language"), summary: listSummary("language", LANGUAGES, t("filter_both", "Both")) },
    { field: "nationality", label: t("filter_nationality", "Nationality"), summary: filters.nationality?.values?.length ? t("filter_nationality_on", "Hidden when a nationality you do not hold is required") : t("filter_off", "Off") },
  ];

  return <section>
    <SectionHeader label={t("filter_section", "Your filters")} />
    <div className="oe-settings-list">
      {rows.map((row) => <div key={row.field} className="oe-setting-row">
        <div>
          <strong>{row.label}</strong>
          <span>{row.summary}</span>
          {row.field === "kind" && cardKinds.length > 0 && notShownNote && <span style={{ opacity: 0.6 }}>{notShownNote}</span>}
        </div>
        <button type="button" className="v23-textlink" onClick={() => setOpen(row.field)}>{t("filter_change", "Change")}</button>
      </div>)}
    </div>
    {open && createPortal(<FilterSheet
      field={open} filters={filters} t={t}
      countries={countries} regions={regions} sectors={sectors} levels={levels}
      engagements={engagements} orgTypes={orgTypes} kinds={kinds}
      cardKinds={cardKinds} notShownNote={notShownNote}
      onClose={() => setOpen(null)}
      onSaved={async () => { setOpen(null); await onSaved(); }}
    />, document.body)}
  </section>;
}

function FilterSheet({ field, filters, t, countries, regions, sectors, levels, engagements, orgTypes, kinds, cardKinds = [], notShownNote = "", onClose, onSaved }: {
  field: Field; filters: FilterMap; t: (key: string, fallback: string) => string;
  countries: Country[]; regions: Region[]; sectors: Named[]; levels: Named[];
  engagements: Named[]; orgTypes: Named[]; kinds: Named[];
  cardKinds?: string[]; notShownNote?: string;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const current = filters[field];
  const [chosen, setChosen] = useState<string[]>(current?.values ?? []);
  const [op, setOp] = useState<string>(current?.op ?? (field === "level" ? "at_or_above" : field === "sector" ? "prefer" : "allow"));
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = old; };
  }, [onClose]);

  const toggle = (value: string) => setChosen((list) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const tickRegion = (code: string) => {
    const members = countries.filter((row) => row.region_codes?.includes(code)).map((row) => row.iso2);
    const tag = `region:${code}`;
    setChosen((list) => list.includes(tag)
      ? list.filter((item) => item !== tag && !members.includes(item))
      : Array.from(new Set([...list, tag, ...members])));
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    await supabase.rpc("oe_filter_save" as never, { p_field: field, p_op: op, p_values: chosen } as never);
    setBusy(false);
    await onSaved();
  };

  const title = {
    place: t("filter_where", "Where"), level: t("filter_level", "Level"), sector: t("filter_sectors", "Sectors"),
    kind: t("filter_kinds", "What kinds of opportunity"), engagement: t("filter_engagement", "Engagement"),
    org_type: t("filter_org_type", "Organisation type"), language: t("filter_language", "Language"),
    nationality: t("filter_nationality", "Nationality"),
  }[field];

  const simple = (rows: Named[]) => <div className="oe-chip-row">
    {rows.map((row) => <button key={row.code} type="button" style={chosen.includes(row.code) ? chipOn : chip}
      aria-pressed={chosen.includes(row.code)} onClick={() => toggle(row.code)}>{row.name_en}</button>)}
  </div>;

  const found = search.trim().length > 0
    ? countries.filter((row) => row.name_en.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];
  const plainChosen = chosen.filter((value) => !value.startsWith("region:") && value !== REMOTE);

  return <div className="oe-sheet-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="oe-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="oe-sheet-handle" aria-hidden />
      <h2>{title}</h2>

      {field === "place" && <div className="oe-filter-body">
        <input className="oe-search" aria-label={t("filter_search_country", "Search for a country")}
          placeholder={t("filter_search_country", "Search for a country")}
          value={search} onChange={(event) => setSearch(event.target.value)} />
        {found.length > 0 && <div className="oe-chip-row">{found.map((row) => <button key={row.iso2} type="button" style={chosen.includes(row.iso2) ? chipOn : chip} onClick={() => { toggle(row.iso2); setSearch(""); }}>{row.name_en}</button>)}</div>}
        <div className="oe-chip-row">{regions.map((row) => <button key={row.code} type="button" style={chosen.includes(`region:${row.code}`) ? chipOn : chip} aria-pressed={chosen.includes(`region:${row.code}`)} onClick={() => tickRegion(row.code)}>{row.name_en}</button>)}</div>
        <div className="oe-setting-row">
          <div><strong>{t("filter_remote", "Remote")}</strong><span>{t("filter_remote_sub", "Work that states it can be done from anywhere")}</span></div>
          <button type="button" role="switch" aria-checked={chosen.includes(REMOTE)} className="oe-switch" onClick={() => toggle(REMOTE)}><span /></button>
        </div>
        {plainChosen.length > 0 && <div className="oe-chip-row">{plainChosen.map((iso) => <button key={iso} type="button" style={chipOn} onClick={() => toggle(iso)}>{countries.find((row) => row.iso2 === iso)?.name_en ?? iso} ×</button>)}</div>}
      </div>}

      {field === "level" && <div className="oe-filter-body">
        <button type="button" style={op === "at_or_above" && chosen.length === 0 ? chipOn : chip} onClick={() => { setOp("at_or_above"); setChosen([]); }}>{t("filter_level_any", "At or above my level")}</button>
        <div className="oe-chip-row">{levels.map((row) => <button key={row.code} type="button" style={chosen.includes(row.code) ? chipOn : chip} aria-pressed={chosen.includes(row.code)} onClick={() => { setOp("at_or_above"); setChosen([row.code]); }}>{row.name_en}</button>)}</div>
      </div>}

      {field === "sector" && <div className="oe-filter-body">
        <button type="button" style={chosen.length === 0 ? chipOn : chip} onClick={() => setChosen([])}>{t("filter_all_sectors", "All sectors")}</button>
        {simple(sectors)}
        <div className="oe-setting-row">
          <div><strong>{t("filter_only_these", "Only these sectors")}</strong><span>{t("filter_only_these_sub", "Off means we prefer them, not that we hide the rest")}</span></div>
          <button type="button" role="switch" aria-checked={op === "allow"} className="oe-switch" onClick={() => setOp(op === "allow" ? "prefer" : "allow")}><span /></button>
        </div>
      </div>}

      {field === "kind" && <div className="oe-filter-body">
        {/* A kind outside the served set is watched, not shown. It is greyed,
            not removed, and the line says so in the member's own words. */}
        <div className="oe-chip-row">
          {kinds.map((row) => {
            const shown = cardKinds.length === 0 || cardKinds.includes(row.code);
            return <button key={row.code} type="button" disabled={!shown}
              style={{ ...(chosen.includes(row.code) ? chipOn : chip), ...(shown ? {} : { opacity: 0.45, cursor: "default" }) }}
              aria-pressed={chosen.includes(row.code)} aria-disabled={!shown}
              onClick={() => { if (shown) toggle(row.code); }}>{row.name_en}</button>;
          })}
        </div>
        {cardKinds.length > 0 && notShownNote && <p style={{ opacity: 0.7, fontSize: 13 }}>{notShownNote}</p>}
      </div>}
      {field === "engagement" && <div className="oe-filter-body">{simple(engagements)}</div>}
      {field === "org_type" && <div className="oe-filter-body">{simple(orgTypes)}</div>}
      {field === "language" && <div className="oe-filter-body">{simple(LANGUAGES)}</div>}

      {field === "nationality" && <div className="oe-filter-body">
        <div className="oe-setting-row">
          <div><strong>{t("filter_nationality_switch", "Hide anything that states a nationality I do not hold")}</strong></div>
          <button type="button" role="switch" aria-checked={chosen.length > 0} className="oe-switch" onClick={() => { setOp("exclude"); setChosen(chosen.length ? [] : ["mismatch"]); }}><span /></button>
        </div>
      </div>}

      <div className="oe-sheet-actions">
        <button type="button" className="v23-textlink" onClick={onClose}>{t("cancel", "Cancel")}</button>
        <AuraButton onClick={() => void save()} loading={busy}>{t("save", "Save")}</AuraButton>
      </div>
    </section>
  </div>;
}

/** The readings we took from his profile, each one still waiting on his word. */
export function SuggestedRules({ rows, onDecided, t }: {
  rows: Array<{ id: string; rule_text: string; field: string | null }>;
  onDecided: () => Promise<void> | void;
  t: (key: string, fallback: string) => string;
}) {
  const [busy, setBusy] = useState(false);
  if (!rows.length) return null;
  const decide = async (id: string, apply: boolean) => {
    if (busy) return;
    setBusy(true);
    await supabase.rpc("oe_rule_decide" as never, { p_id: id, p_apply: apply } as never);
    setBusy(false);
    await onDecided();
  };
  return <section>
    <SectionHeader label={t("suggested_section", "Suggested from your profile")} />
    <div className="oe-settings-list">
      {rows.map((row) => <div key={row.id} className="oe-setting-row">
        <div><strong>{row.rule_text}</strong><span>{t("suggested_sub", "Read from your profile — it does nothing until you apply it")}</span></div>
        <div className="oe-chip-row">
          <button type="button" style={chip} disabled={busy} onClick={() => void decide(row.id, true)}>{t("apply", "Apply")}</button>
          <button type="button" style={chip} disabled={busy} onClick={() => void decide(row.id, false)}>{t("dismiss", "Dismiss")}</button>
        </div>
      </div>)}
    </div>
  </section>;
}
