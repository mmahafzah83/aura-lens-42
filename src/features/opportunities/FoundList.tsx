/**
 * EVERYTHING WE FOUND — the week's reading, shown plainly.
 *
 * A card is the end of a long road: read, judged, matched. Most of what the
 * engine finds never gets that far, and a member who sees nothing assumes
 * nothing happened. This list is the honest middle: what was found, grouped by
 * how it sits against his level, with a door to the original posting, a line
 * saying what happens next, and nothing else. No buttons, no score, no
 * percentage.
 *
 * A single row of filters narrows the list on screen only — nothing is asked of
 * the server, nothing is deleted, and the choice survives a refresh because it
 * lives in the address bar.
 *
 * Every word on screen comes from oe_vocabulary; the group names come from the
 * SQL function itself, in both languages.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Vocab } from "./useVocab";
import OpportunityTimeline from "./OpportunityTimeline";

export type FoundItem = {
  id: string; title: string | null; issuer: string | null; location: string | null;
  level: string | null; kind: string | null; source_url: string | null;
  route_url: string | null; route_kind: string | null; deadline: string | null;
  first_seen_at: string | null; judged: boolean | null;
  judged_at?: string | null; card_date?: string | null;
  sector?: string | null; country?: string | null; org_type?: string | null; followed?: boolean | null;
};
export type FoundEmployer = { issuer: string | null; openings: number | null; sample: string[] | null };
export type FoundGroup = {
  key: string; label_en: string; label_ar: string; count: number;
  items?: FoundItem[] | null; employers?: FoundEmployer[] | null;
};
export type FoundData = { days: number; from: string; to: string; total: number; groups: FoundGroup[] };
export type SectorRef = { code: string; label_en: string; label_ar: string };
export type CountryRef = { iso2: string; name_en: string; name_ar: string | null };

type Lang = "en" | "ar";

const CARD = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const ACT = "#0670C4";
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric: "tabular-nums" } as const;
const OPEN_BY_DEFAULT = new Set(["at_level", "mandates"]);
const PAGE = 10;
// The one group that lists employers rather than postings.
const EMPLOYER_KEY = "signals";

const fill = (text: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((value, [key, item]) => value.split(`{${key}}`).join(String(item)), text);

export function foundDate(value: string, language: Lang) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-u-ca-gregory" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{
    display: "inline-flex", alignItems: "center", padding: "1px 7px", borderRadius: 4,
    border: `1px solid ${LINE}`, color: MUTED, fontSize: 11, whiteSpace: "nowrap",
  }}>{children}</span>;
}

// ───────────────────────────── the filter row ─────────────────────────────

type Filters = { sector: string; country: string; level: string; kind: string; org: string; deadline: boolean; followed: boolean };
const EMPTY: Filters = { sector: "", country: "", level: "", kind: "", org: "", deadline: false, followed: false };
const PARAM: Record<keyof Filters, string> = {
  sector: "fs", country: "fc", level: "fl", kind: "fk", org: "fo", deadline: "fd", followed: "ff",
};

const selectStyle: React.CSSProperties = {
  appearance: "none", minBlockSize: 32, padding: "5px 10px", borderRadius: 999,
  border: `1px solid ${LINE}`, background: CARD, color: INK, font: "inherit", fontSize: 12,
  fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", maxInlineSize: 170,
};
const toggleStyle = (on: boolean): React.CSSProperties => ({
  minBlockSize: 32, padding: "5px 12px", borderRadius: 999,
  border: `1px solid ${on ? ACT : LINE}`, background: on ? "#EAF3FB" : CARD,
  color: on ? ACT : INK, font: "inherit", fontSize: 12, fontWeight: 600,
  cursor: "pointer", whiteSpace: "nowrap",
});

function Picker({ label, value, options, onChange, anyLabel }: {
  label: string; value: string; anyLabel: string;
  options: Array<{ value: string; label: string }>; onChange: (next: string) => void;
}) {
  if (!options.length) return null;
  return <label style={{ display: "inline-flex" }}>
    <span className="sr-only" style={{ position: "absolute", inlineSize: 1, blockSize: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}
      style={{ ...selectStyle, borderColor: value ? ACT : LINE, color: value ? ACT : INK }}>
      <option value="">{`${label} · ${anyLabel}`}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

// ─────────────────────────────── one row ───────────────────────────────

function Row({ item, v, language, canCheck, checking, onCheck }: {
  item: FoundItem; v: Vocab; language: Lang;
  canCheck: boolean; checking: boolean; onCheck: (id: string) => void;
}) {
  const [openTimeline, setOpenTimeline] = useState(false);
  const href = item.route_url ?? item.source_url ?? undefined;
  const meta = [item.issuer, item.location].filter(Boolean).join(" · ");
  const levelLabel = item.level ? v(`foundlevel_${item.level}`) : "";
  const arrow = language === "ar" ? "↖" : "↗";
  const body = <>
    <strong style={{
      display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden",
      fontSize: 14, fontWeight: 600, color: INK, lineHeight: language === "ar" ? 1.9 : 1.4,
    }}>{item.title ?? ""}</strong>
    {meta && <span style={{ display: "block", marginBlockStart: 3, fontSize: 12, color: MUTED }}>{meta}</span>}
    <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBlockStart: 7 }}>
      {levelLabel && <Chip>{levelLabel}</Chip>}
      {item.judged === true && <Chip>{v("found_checked")}</Chip>}
      {item.deadline && <span style={{ ...mono, fontSize: 11, color: MUTED }}>{foundDate(item.deadline, language)}</span>}
      {href && <span style={{ fontSize: 12, fontWeight: 600, color: ACT }}>{`${v("found_open_posting")} ${arrow}`}</span>}
    </span>
  </>;
  const inner: React.CSSProperties = { display: "block", textDecoration: "none", color: INK };
  const showCheck = canCheck && item.judged !== true;
  const panelId = `tl-${item.id}`;
  return <div style={{ padding: "12px 14px", borderBlockEnd: `1px solid ${LINE}` }}>
    {href
      ? <a href={href} target="_blank" rel="noopener noreferrer" style={inner}>{body}</a>
      : <div style={inner}>{body}</div>}
    <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
      {showCheck && (checking
        ? <span style={{ display: "inline-block", marginBlockStart: 8, fontSize: 12, color: MUTED }}>{v("found_checking")}</span>
        : <button type="button" onClick={() => onCheck(item.id)} style={{
            marginBlockStart: 8, minBlockSize: 32, padding: 0, border: 0, background: "transparent",
            color: MUTED, font: "inherit", fontSize: 12, fontWeight: 600, textDecoration: "underline", cursor: "pointer",
          }}>{v("found_check_now")}</button>)}
      <button type="button" aria-expanded={openTimeline} aria-controls={panelId} onClick={() => setOpenTimeline((value) => !value)}
        style={{
          marginBlockStart: 8, minBlockSize: 32, padding: 0, border: 0, background: "transparent",
          color: MUTED, font: "inherit", fontSize: 12, fontWeight: 600, textDecoration: "underline", cursor: "pointer",
        }}>{`${v("timeline_title")} ${openTimeline ? "–" : "+"}`}</button>
    </span>
    <div id={panelId} hidden={!openTimeline}>
      {openTimeline && <div style={{ marginBlockStart: 10 }}>
        <OpportunityTimeline facts={item} v={v} language={language} />
      </div>}
    </div>
  </div>;
}

function EmployerRow({ row, v, language }: { row: FoundEmployer; v: Vocab; language: Lang }) {
  return <div style={{ padding: "12px 14px", borderBlockEnd: `1px solid ${LINE}` }}>
    <strong style={{ fontSize: 14, fontWeight: 600, color: INK }}>
      {row.issuer ?? ""} · <span style={mono}>{row.openings ?? 0}</span> {v("found_openings_word")}
    </strong>
    {(row.sample ?? []).slice(0, 3).map((title, index) =>
      <span key={index} style={{ display: "block", marginBlockStart: 3, fontSize: 12, color: MUTED, lineHeight: language === "ar" ? 1.9 : 1.5 }}>{title}</span>)}
  </div>;
}

const CHECKABLE = new Set(["at_level", "mandates", "level_unstated"]);

function Group({ group, items, v, language, checking, onCheck }: {
  group: FoundGroup; items: FoundItem[]; v: Vocab; language: Lang; checking: Set<string>; onCheck: (id: string) => void;
}) {
  const [open, setOpen] = useState(OPEN_BY_DEFAULT.has(group.key));
  const [all, setAll] = useState(false);
  const label = language === "ar" ? (group.label_ar || group.label_en) : group.label_en;
  const employers = group.employers ?? [];
  const count = group.key === EMPLOYER_KEY ? Number(group.count ?? 0) : items.length;
  const shown = all ? items : items.slice(0, PAGE);
  const panelId = `found-${group.key}`;
  return <section style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}
      style={{
        inlineSize: "100%", minBlockSize: 44, display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px", border: 0, background: "transparent", cursor: "pointer",
        textAlign: "start", font: "inherit", color: INK,
      }}>
      <span style={{ flex: 1, minInlineSize: 0, fontSize: 13, fontWeight: 600 }}>{label}</span>
      <b style={{ ...mono, fontSize: 12, fontWeight: 600, color: MUTED }}>{count}</b>
      <span aria-hidden style={{ color: MUTED, fontSize: 12 }}>{open ? "–" : "+"}</span>
    </button>
    <div id={panelId} hidden={!open}>
      {open && <>
        {group.key === EMPLOYER_KEY
          ? employers.map((row, index) => <EmployerRow key={index} row={row} v={v} language={language} />)
          : shown.map((item) => <Row key={item.id} item={item} v={v} language={language}
              canCheck={CHECKABLE.has(group.key)} checking={checking.has(item.id)} onCheck={onCheck} />)}
        {group.key !== EMPLOYER_KEY && !all && items.length > PAGE &&
          <button type="button" onClick={() => setAll(true)} style={{
            padding: "10px 14px", border: 0, background: "transparent", cursor: "pointer",
            color: ACT, fontSize: 12, fontWeight: 600, font: "inherit",
          }}>{fill(v("found_show_all"), { n: items.length })}</button>}
      </>}
    </div>
  </section>;
}

export default function FoundList({ data, loading, error, v, language, onRetry, checking, onCheck, sectors = [], countries = [] }: {
  data: FoundData | null; loading: boolean; error: boolean; v: Vocab; language: Lang; onRetry: () => void;
  checking: Set<string>; onCheck: (id: string) => void;
  sectors?: SectorRef[]; countries?: CountryRef[];
}) {
  const [params, setParams] = useSearchParams();
  const filters: Filters = {
    sector: params.get(PARAM.sector) ?? "",
    country: params.get(PARAM.country) ?? "",
    level: params.get(PARAM.level) ?? "",
    kind: params.get(PARAM.kind) ?? "",
    org: params.get(PARAM.org) ?? "",
    deadline: params.get(PARAM.deadline) === "1",
    followed: params.get(PARAM.followed) === "1",
  };
  const setFilter = (key: keyof Filters, value: string | boolean) => {
    const copy = new URLSearchParams(params);
    const raw = typeof value === "boolean" ? (value ? "1" : "") : value;
    if (raw) copy.set(PARAM[key], raw); else copy.delete(PARAM[key]);
    setParams(copy, { replace: true });
  };
  const clearFilters = () => {
    const copy = new URLSearchParams(params);
    Object.values(PARAM).forEach((name) => copy.delete(name));
    setParams(copy, { replace: true });
  };
  const anyFilter = Object.keys(EMPTY).some((key) => {
    const value = filters[key as keyof Filters];
    return typeof value === "boolean" ? value : Boolean(value);
  });

  const groups = useMemo(() => (data?.groups ?? []), [data]);
  const allItems = useMemo(() => groups.flatMap((group) => group.items ?? []), [groups]);

  const sectorLabel = (code: string) => {
    const row = sectors.find((item) => item.code === code);
    return row ? (language === "ar" ? (row.label_ar || row.label_en) : row.label_en) : code;
  };
  const countryLabel = (iso2: string) => {
    const row = countries.find((item) => item.iso2 === iso2);
    return row ? (language === "ar" ? (row.name_ar || row.name_en) : row.name_en) : iso2;
  };
  const optionsFrom = (pick: (item: FoundItem) => string | null | undefined, label: (value: string) => string) => {
    const seen = new Set<string>();
    allItems.forEach((item) => { const value = pick(item); if (value) seen.add(String(value)); });
    return [...seen].map((value) => ({ value, label: label(value) })).sort((a, b) => a.label.localeCompare(b.label));
  };
  const sectorOptions = optionsFrom((item) => item.sector, sectorLabel);
  const countryOptions = optionsFrom((item) => item.country, countryLabel);
  const levelOptions = optionsFrom((item) => item.level, (value) => v(`foundlevel_${value}`) || value);
  const kindOptions = optionsFrom((item) => item.kind, (value) => v(`kind_${value}`) || value);
  const orgOptions = optionsFrom((item) => item.org_type, (value) => v(`org_${value}`) || value);

  const keep = (item: FoundItem) =>
    (!filters.sector || item.sector === filters.sector) &&
    (!filters.country || item.country === filters.country) &&
    (!filters.level || item.level === filters.level) &&
    (!filters.kind || item.kind === filters.kind) &&
    (!filters.org || item.org_type === filters.org) &&
    (!filters.deadline || Boolean(item.deadline)) &&
    (!filters.followed || item.followed === true);

  if (loading) {
    return <div style={{ display: "grid", gap: 8 }} aria-busy="true">
      {[0, 1, 2].map((index) => <div key={index} style={{ height: 56, borderRadius: 12, background: CARD, border: `1px solid ${LINE}` }} />)}
    </div>;
  }
  if (error) {
    return <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>
      {v("found_error")}{" "}
      <button type="button" onClick={onRetry} style={{ border: 0, background: "transparent", padding: 0, color: ACT, cursor: "pointer", font: "inherit", fontWeight: 600 }}>{v("found_retry")}</button>
    </p>;
  }
  const visible = groups
    .map((group) => ({ group, items: (group.items ?? []).filter(keep) }))
    .filter(({ group, items }) => group.key === EMPLOYER_KEY ? Number(group.count ?? 0) > 0 && !anyFilter : items.length > 0);
  if (!groups.some((group) => Number(group.count ?? 0) > 0)) return null;

  const anyLabel = v("filter_any");
  return <section style={{ marginBlockStart: 22, display: "grid", gap: 10 }}>
    <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK }}>{v("found_title")}</h2>
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBlockEnd: 2, scrollbarWidth: "thin" }}>
      <Picker label={v("filter_sector")} anyLabel={anyLabel} value={filters.sector} options={sectorOptions} onChange={(value) => setFilter("sector", value)} />
      <Picker label={v("filter_country")} anyLabel={anyLabel} value={filters.country} options={countryOptions} onChange={(value) => setFilter("country", value)} />
      <Picker label={v("filter_level")} anyLabel={anyLabel} value={filters.level} options={levelOptions} onChange={(value) => setFilter("level", value)} />
      <Picker label={v("filter_kind")} anyLabel={anyLabel} value={filters.kind} options={kindOptions} onChange={(value) => setFilter("kind", value)} />
      <Picker label={v("filter_org")} anyLabel={anyLabel} value={filters.org} options={orgOptions} onChange={(value) => setFilter("org", value)} />
      <button type="button" aria-pressed={filters.deadline} style={toggleStyle(filters.deadline)} onClick={() => setFilter("deadline", !filters.deadline)}>{v("filter_deadline")}</button>
      <button type="button" aria-pressed={filters.followed} style={toggleStyle(filters.followed)} onClick={() => setFilter("followed", !filters.followed)}>{v("filter_followed")}</button>
    </div>
    {anyFilter && <button type="button" onClick={clearFilters} style={{
      justifySelf: "start", border: 0, background: "transparent", padding: 0,
      color: ACT, font: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer",
    }}>{v("filter_clear")}</button>}
    {visible.map(({ group, items }) => <Group key={group.key} group={group} items={items} v={v} language={language} checking={checking} onCheck={onCheck} />)}
  </section>;
}
