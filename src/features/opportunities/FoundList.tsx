/**
 * EVERYTHING WE FOUND — the week's reading, shown plainly.
 *
 * A card is the end of a long road: read, judged, matched. Most of what the
 * engine finds never gets that far, and a member who sees nothing assumes
 * nothing happened. This list is the honest middle: what was found, grouped by
 * how it sits against his level, with a door to the original posting and
 * nothing else. No buttons, no score, no percentage.
 *
 * Every word on screen comes from oe_vocabulary; the group names come from the
 * SQL function itself, in both languages.
 */
import { useState } from "react";
import type { Vocab } from "./useVocab";

export type FoundItem = {
  id: string; title: string | null; issuer: string | null; location: string | null;
  level: string | null; kind: string | null; source_url: string | null;
  route_url: string | null; route_kind: string | null; deadline: string | null;
  first_seen_at: string | null; judged: boolean | null;
};
export type FoundEmployer = { issuer: string | null; openings: number | null; sample: string[] | null };
export type FoundGroup = {
  key: string; label_en: string; label_ar: string; count: number;
  items?: FoundItem[] | null; employers?: FoundEmployer[] | null;
};
export type FoundData = { days: number; from: string; to: string; total: number; groups: FoundGroup[] };

type Lang = "en" | "ar";

const CARD = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const ACT = "#0670C4";
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontVariantNumeric: "tabular-nums" } as const;
const OPEN_BY_DEFAULT = new Set(["at_level", "mandates"]);
const PAGE = 10;

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

function Row({ item, v, language, canCheck, checking, onCheck }: {
  item: FoundItem; v: Vocab; language: Lang;
  canCheck: boolean; checking: boolean; onCheck: (id: string) => void;
}) {
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
  return <div style={{ padding: "12px 14px", borderBlockEnd: `1px solid ${LINE}` }}>
    {href
      ? <a href={href} target="_blank" rel="noopener noreferrer" style={inner}>{body}</a>
      : <div style={inner}>{body}</div>}
    {showCheck && (checking
      ? <span style={{ display: "block", marginBlockStart: 8, fontSize: 12, color: MUTED }}>{v("found_checking")}</span>
      : <button type="button" onClick={() => onCheck(item.id)} style={{
          marginBlockStart: 8, minBlockSize: 32, padding: 0, border: 0, background: "transparent",
          color: MUTED, font: "inherit", fontSize: 12, fontWeight: 600, textDecoration: "underline", cursor: "pointer",
        }}>{v("found_check_now")}</button>)}
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

function Group({ group, v, language, checking, onCheck }: {
  group: FoundGroup; v: Vocab; language: Lang; checking: Set<string>; onCheck: (id: string) => void;
}) {
  const [open, setOpen] = useState(OPEN_BY_DEFAULT.has(group.key));
  const [all, setAll] = useState(false);
  const label = language === "ar" ? (group.label_ar || group.label_en) : group.label_en;
  const items = group.items ?? [];
  const employers = group.employers ?? [];
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
      <b style={{ ...mono, fontSize: 12, fontWeight: 600, color: MUTED }}>{group.count}</b>
      <span aria-hidden style={{ color: MUTED, fontSize: 12 }}>{open ? "–" : "+"}</span>
    </button>
    <div id={panelId} hidden={!open}>
      {open && <>
        {group.key === "signals"
          ? employers.map((row, index) => <EmployerRow key={index} row={row} v={v} language={language} />)
          : shown.map((item) => <Row key={item.id} item={item} v={v} language={language}
              canCheck={CHECKABLE.has(group.key)} checking={checking.has(item.id)} onCheck={onCheck} />)}
        {group.key !== "signals" && !all && items.length > PAGE &&
          <button type="button" onClick={() => setAll(true)} style={{
            padding: "10px 14px", border: 0, background: "transparent", cursor: "pointer",
            color: ACT, fontSize: 12, fontWeight: 600, font: "inherit",
          }}>{fill(v("found_show_all"), { n: items.length })}</button>}
      </>}
    </div>
  </section>;
}

export default function FoundList({ data, loading, error, v, language, onRetry }: {
  data: FoundData | null; loading: boolean; error: boolean; v: Vocab; language: Lang; onRetry: () => void;
}) {
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
  const groups = (data?.groups ?? []).filter((group) => Number(group.count ?? 0) > 0);
  if (!groups.length) return null;
  return <section style={{ marginBlockStart: 22, display: "grid", gap: 10 }}>
    <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK }}>{v("found_title")}</h2>
    {groups.map((group) => <Group key={group.key} group={group} v={v} language={language} />)}
  </section>;
}
