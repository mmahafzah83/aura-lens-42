import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { Button } from "@/components/ui/button";
import type { useVocab } from "./useVocab";

/**
 * WHO WE MATCH YOU AS. The member's current role, as resolved by
 * oe_resolve_identity. The member can always see it and correct it; when his
 * sources disagree, he is asked once, never silently decided for.
 */
type Vocab = ReturnType<typeof useVocab>;
type Lang = "en" | "ar";
type Source = "member" | "cv" | "linkedin" | "diagnostic";
type Side = { title?: string | null; employer?: string | null; level?: string | null; date?: string | null };
export type MemberIdentityRow = {
  current_title: string | null; current_employer: string | null; market_level: string | null;
  source: Source | null; source_date: string | null;
  status: "confirmed" | "inferred" | "needs_confirmation";
  conflict: Partial<Record<Source, Side>> | null;
};

const LEVELS = ["manager", "senior_manager", "director", "senior_director", "vp", "c_suite", "board"];
const mono = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" } as const;
const fill = (text: string, vars: Record<string, string>) => Object.entries(vars).reduce((value, [key, item]) => value.split(`{${key}}`).join(item), text);

function monthText(value: string | null, language: Lang) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-u-ca-gregory" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function useMemberIdentity() {
  const [identity, setIdentity] = useState<MemberIdentityRow | null>(null);
  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const { data } = await (supabase.from("oe_identity" as never) as any)
      .select("current_title, current_employer, market_level, source, source_date, status, conflict")
      .eq("user_id", uid).maybeSingle();
    setIdentity((data ?? null) as MemberIdentityRow | null);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { identity, reload: load };
}

async function confirm(title: string, employer: string | null, level: string | null) {
  const { error } = await supabase.rpc("oe_identity_confirm" as never, { p_title: title, p_employer: employer, p_level: level } as never);
  return error?.message ?? null;
}

/** First why-line on every card: the basis he was matched on. */
export function matchedAsLine(identity: MemberIdentityRow | null, v: Vocab): string | null {
  if (!identity?.market_level || !identity.current_title) return null;
  return fill(v("identity_matched_as"), { level: v(`level_${identity.market_level}`) || identity.market_level, title: identity.current_title });
}

/** The first row of the Tune dialog, with its own editor. */
export function IdentityRow({ identity, v, language, onSaved }: { identity: MemberIdentityRow | null; v: Vocab; language: Lang; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [employer, setEmployer] = useState("");
  const [level, setLevel] = useState<string | null>(null);
  const [matches, setMatches] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(identity?.current_title ?? "");
    setEmployer(identity?.current_employer ?? "");
    setLevel(identity?.market_level ?? null);
  }, [open, identity]);

  useEffect(() => {
    const needle = employer.trim();
    if (!open || needle.length < 2 || needle === identity?.current_employer) { setMatches([]); return; }
    let live = true;
    const timer = window.setTimeout(() => { void (async () => {
      const { data } = await supabase.rpc("oe_ref_entity_search" as never, { p_q: needle } as never);
      if (live) setMatches(Array.isArray(data) ? (data as unknown as Array<{ id: string; name: string }>).slice(0, 6) : []);
    })(); }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [employer, open, identity?.current_employer]);

  const summary = identity?.current_title
    ? [identity.current_title, identity.current_employer, identity.market_level ? v(`level_${identity.market_level}`) : null].filter(Boolean).join(" · ")
    : v("identity_none");
  const from = identity?.source ? fill(v(`identity_from_${identity.source}`), { date: monthText(identity.source_date, language) }) : "";

  const save = async () => {
    if (title.trim().length < 2) return;
    setBusy(true); setError(null);
    const failed = await confirm(title.trim(), employer.trim() || null, level);
    setBusy(false);
    if (failed) { setError(fill(v("identity_save_failed"), { error: failed })); return; }
    setSaved(true); setOpen(false); onSaved();
  };

  return <>
    <div className="oe-dialog-row">
      <div><strong>{v("identity_title")}</strong><span>{summary}</span>{from && <small style={mono}>{from}</small>}</div>
      <Button variant="link" onClick={() => { setSaved(false); setOpen((value) => !value); }}>{v("action_change")}</Button>
    </div>
    {open && <div className="oe-inline-editor oe-identity-editor">
      <label className="oe-field-label" htmlFor="oe-identity-title">{v("identity_field_title")}</label>
      <input id="oe-identity-title" className="oe-search" value={title} onChange={(event) => setTitle(event.target.value)} autoComplete="off" />
      <label className="oe-field-label" htmlFor="oe-identity-employer">{v("identity_field_employer")}</label>
      <input id="oe-identity-employer" type="search" className="oe-search" value={employer} placeholder={v("identity_employer_search")} onChange={(event) => setEmployer(event.target.value)} autoComplete="off" />
      {matches.length > 0 && <div className="oe-option-list" role="listbox">{matches.map((row) => <button key={row.id} type="button" role="option" aria-selected="false" className="oe-option-row" onClick={() => { setEmployer(row.name); setMatches([]); }}>{row.name}</button>)}</div>}
      <p>{v("identity_field_level")}</p>
      <div className="oe-chip-row">{LEVELS.map((code) => <Button key={code} variant="outline" aria-pressed={level === code} onClick={() => setLevel(code)}>{v(`level_${code}`)}</Button>)}</div>
      <AuraButton loading={busy} disabled={title.trim().length < 2} onClick={() => void save()}>{v("save")}</AuraButton>
      {error && <p className="oe-save-error" role="alert">{error}</p>}
    </div>}
    {saved && <p role="status" className="oe-dialog-note">{v("identity_saved")}</p>}
  </>;
}

/** One amber banner, only while his sources disagree. One tap confirms. */
export function IdentityBanner({ identity, v, onSaved, onOther }: { identity: MemberIdentityRow | null; v: Vocab; onSaved: () => void; onOther: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (identity?.status !== "needs_confirmation") return null;
  const sides = Object.entries(identity.conflict ?? {}).filter(([, side]) => side?.title) as Array<[Source, Side]>;
  const names = sides.slice(0, 2).map(([source]) => v(`identity_src_${source}`));
  const text = names.length === 2 ? fill(v("identity_banner"), { a: names[0], b: names[1] }) : fill(v("identity_banner"), { a: v("identity_src_cv"), b: v("identity_src_linkedin") });
  const pick = async (side: Side) => {
    setBusy(true); setError(null);
    const failed = await confirm(String(side.title), side.employer ?? null, side.level ?? null);
    setBusy(false);
    if (failed) setError(fill(v("identity_save_failed"), { error: failed })); else onSaved();
  };
  return <div className="oe-identity-banner" role="region" aria-label={v("identity_title")}>
    <p><span className="oe-identity-dot" aria-hidden />{text}</p>
    <div className="oe-chip-row">
      {sides.map(([source, side]) => <Button key={source} variant="outline" disabled={busy} onClick={() => void pick(side)}>{[side.title, side.employer].filter(Boolean).join(" · ")}</Button>)}
      <Button variant="outline" disabled={busy} onClick={onOther}>{v("identity_something_else")}</Button>
    </div>
    {error && <p className="oe-save-error" role="alert">{error}</p>}
  </div>;
}
