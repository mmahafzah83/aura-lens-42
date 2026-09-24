import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RelocationRow } from "./RelocationRow";
import { DeliveryRow } from "./DeliveryRow";
import { createPortal } from "react-dom";
import { Settings2, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { AuraCard } from "@/components/ui/AuraCard";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { doorClass, loadRefLabels, refLabel } from "./refLabels";
import { useVocab } from "./useVocab";
import FoundList, { type FoundData } from "./FoundList";
import { IdentityBanner, IdentityRow, matchedAsLine, useMemberIdentity } from "./MemberIdentity";
import type { FilterMap } from "./FiltersSection";
import { Tip, WorkChip, useWorkArrangements } from "./Tip";


type Lang = "en" | "ar";
type View = "today" | "found" | "moves";
type CardStage = "saved" | "applied" | "interviewing" | "closed";
type MoveKind = "bigger_same" | "step_up" | "client_side" | "exceptional_only";
type WhyLine = { text?: string };
type QueueCard = {
  id: string; opportunity_id: string; lane: "act" | "write"; why_lines: WhyLine[] | null;
  gap_line: WhyLine | null; quote: string | null; clock_text: string | null; title: string;
  level_band: string | null; sector: string | null; location: string | null; deadline: string | null;
  source_url: string | null; route_url: string | null; issuer_id: string | null; issuer_name: string | null;
  last_checked: string | null; access_state: string | null; cost_of_door: string | null;
  presentation_line?: string | null; quote_verified_at?: string | null; route_checked_at?: string | null;
  interest?: { captures?: number; since?: string | null } | null;
  level_direction?: string | null; employer_tier?: string | null;
};
type MoveCard = { card_id: string; opportunity_id: string; stage: CardStage; stage_changed_at: string; closed_reason: string | null; withdrawn_at: string | null; title: string; issuer_name: string | null; location: string | null; deadline: string | null; source_url: string | null; route_url: string | null };
type SectorOption = { code: string; label_en: string; label_ar: string };
type Country = { iso2: string; name_en: string; name_ar: string | null };
type BarPick = { move: MoveKind | null; places: string[]; sectors: string[] };
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
type Direction = { language: Lang | null; move_kind: MoveKind | null; move_confirmed_at: string | null; move_proposed: MoveKind | null };
type Home = { city: string | null; country: string | null; country_name: string | null; regions: Array<{ code: string; name_en: string; name_ar?: string | null }> };
type Window = { expected_by: string; declared_on: string | null; missed: boolean };
type Reading = { running: boolean; last_read_at: string | null };
type QuietDay = { surfaces_read: number; findings: number; from_date: string; to_date: string };
type QueueData = {
  cards: QueueCard[]; moves: MoveCard[];
  direction: Direction | null; window: Window | null; filters: FilterMap;
  reading: Reading | null; quiet_day: QuietDay | null;
  funnel?: { read: number; at_level_and_place: number; fits: number } | null;
  delivery?: { at_a_time: number; instant: boolean; digest: boolean; digest_hour: number; ceiling: number } | null;
};
type Vocab = ReturnType<typeof useVocab>;

const emptyData: QueueData = { cards: [], moves: [], direction: null, window: null, filters: {}, reading: null, quiet_day: null };
const moves: MoveKind[] = ["bigger_same", "step_up", "client_side", "exceptional_only"];
// The taxonomies the product itself is built on. Their words live in the
// vocabulary table; only the codes appear here.
const KINDS = ["executive_role", "board_seat", "advisory_role", "speaking_platform", "mandate_tender"];
const FLOORS = ["senior_manager", "director", "senior_director", "vp", "c_suite"];
const ORGS = ["government", "giga_project", "consultancy", "private", "multinational", "ngo"];
type Editor = "move" | "place" | "sector" | "kind" | "level" | "org" | "companies";
type Company = { id: string; name: string; sector_code: string | null };
const moveKey = (move: MoveKind) => move === "exceptional_only" ? "move_exceptional" : `move_${move}`;
const mono = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" } as const;
const validViews = new Set<View>(["today", "found", "moves"]);
const fill = (text: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((value, [key, item]) => value.split(`{${key}}`).join(String(item)), text);
const hasWhy = (card: QueueCard) => (card.why_lines ?? []).some((line) => String(line.text ?? "").trim());
const checkedAt = (card: QueueCard) => [card.quote_verified_at, card.route_checked_at, card.last_checked].filter(Boolean).map(String).sort().slice(-1)[0] ?? null;

function dateText(value: string, language: Lang) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
function readTime(value: string, language: Lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const clock = new Intl.DateTimeFormat(language === "ar" ? "ar-u-ca-gregory" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return date.toDateString() === new Date().toDateString() ? clock : `${dateText(date.toISOString(), language)} ${clock}`;
}
export function OpportunityQueue() {
  const [params, setParams] = useSearchParams();
  const requestedRaw = params.get("view");
  const requested = (requestedRaw === "parked" || requestedRaw === "history" ? "moves" : requestedRaw) as View | null;
  const view: View = requested && validViews.has(requested) ? requested : "today";
  const [language, setLanguage] = useState<Lang>("en");
  const [data, setData] = useState<QueueData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(() => params.get("card"));
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [movePick, setMovePick] = useState<MoveKind | null>(null);
  const [placePick, setPlacePick] = useState<string[]>([]);
  const [sectorPick, setSectorPick] = useState<string[]>([]);
  const [sectorOptions, setSectorOptions] = useState<SectorOption[]>([]);
  const baseline = useRef<BarPick>({ move: null, places: [], sectors: [] });
  const [home, setHome] = useState<Home | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: string } | null>(null);
  const [savedBar, setSavedBar] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [found, setFound] = useState<FoundData | null>(null);
  const [foundLoading, setFoundLoading] = useState(true);
  const [foundError, setFoundError] = useState(false);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [remoteOk, setRemoteOk] = useState(false);
  // The four ranking questions. None of them hides anything except the list of
  // companies he says he never wants to see, which he states himself.
  const [kindPick, setKindPick] = useState<string[]>([]);
  const [levelPick, setLevelPick] = useState<string | null>(null);
  const [orgPick, setOrgPick] = useState<string[]>([]);
  const [followPick, setFollowPick] = useState<Company[]>([]);
  const [hidePick, setHidePick] = useState<Company[]>([]);

  const openerRef = useRef<HTMLElement | null>(null);
  const renderedRef = useRef<Set<string>>(new Set());
  const noticeTimer = useRef<number | null>(null);
  const v = useVocab(language);
  const member = useMemberIdentity();
  const rtl = language === "ar";

  const setView = (next: View) => { const copy = new URLSearchParams(params); next === "today" ? copy.delete("view") : copy.set("view", next); copy.delete("f"); setParams(copy); };
  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user?.id) { setLoading(false); return; }
    const { data: payload, error } = await supabase.rpc("oe_app_queue" as never);
    const next = !error && payload ? { ...emptyData, ...(payload as unknown as QueueData) } : emptyData;
    setLanguage(next.direction?.language === "ar" ? "ar" : "en");
    if (!error && payload) setData(next);
    setLoading(false);
  }, []);
  // What the week's reading actually turned up, card or no card.
  const loadFound = useCallback(async () => {
    setFoundLoading(true); setFoundError(false);
    const { data: payload, error } = await supabase.rpc("oe_app_found" as never, { p_days: 7 } as never);
    if (error || !payload) { setFoundError(true); setFound(null); } else setFound(payload as unknown as FoundData);
    setFoundLoading(false);
  }, []);

  useEffect(() => { void load(); void loadRefLabels(); }, [load]);
  useEffect(() => { const reload = () => void load(); window.addEventListener("oe-delivery-saved", reload); return () => window.removeEventListener("oe-delivery-saved", reload); }, [load]);
  useEffect(() => { void (async () => {
    const { data: rows } = await supabase.rpc("oe_ref_sector_list" as never);
    const list = Array.isArray(rows) ? (rows as unknown as SectorOption[]) : [];
    setSectorOptions(list.filter((row) => row && row.code));
  })(); }, []);
  useEffect(() => { void (async () => { const { data: payload } = await supabase.rpc("oe_my_home" as never); if (payload) setHome(payload as unknown as Home); })(); }, []);
  useEffect(() => { void (async () => {
    const { data: rows } = await supabase.rpc("oe_ref_country_list" as never);
    setCountries(Array.isArray(rows) ? (rows as unknown as Country[]).filter((row) => row && row.iso2) : []);
  })(); }, []);
  useEffect(() => { void (async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user?.id) return;
    const { data: row } = await supabase.from("oe_eligibility" as never)
      .select("remote_ok, issuers_followed, issuers_hidden").eq("user_id", auth.user.id).maybeSingle();
    const record = (row ?? null) as { remote_ok?: boolean; issuers_followed?: string[]; issuers_hidden?: string[] } | null;
    setRemoteOk(Boolean(record?.remote_ok));
    const follow = record?.issuers_followed ?? [];
    const hide = record?.issuers_hidden ?? [];
    if (!follow.length && !hide.length) return;
    const { data: named } = await supabase.rpc("oe_ref_entity_names" as never, { p_ids: [...follow, ...hide] } as never);
    const rows = Array.isArray(named) ? (named as unknown as Company[]) : [];
    const pick = (ids: string[]) => ids.map((id) => rows.find((entry) => entry.id === id) ?? { id, name: id, sector_code: null });
    setFollowPick(pick(follow)); setHidePick(pick(hide));
  })(); }, []);
  useEffect(() => { void loadFound(); }, [loadFound]);
  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);


  // Every role that cleared the bar, ranked best-first. The member chooses how
  // many sit in Today; the rest wait, collapsed, under "More that cleared your bar".
  const cards = useMemo(() => data.cards.filter((card) => card.lane === "act" && hasWhy(card)), [data.cards]);
  const atATime = Number(data.delivery?.at_a_time ?? 3);
  const shown = atATime > 0 ? cards.slice(0, atATime) : cards;
  const more = atATime > 0 ? cards.slice(atATime) : [];
  const active = cards.find((card) => card.id === activeId || card.opportunity_id === activeId) ?? shown[0] ?? null;
  const compact = active ? shown.filter((card) => card.id !== active.id) : [];
  const moreRows = active ? more.filter((card) => card.id !== active.id) : more;

  const showNotice = (text: string, undo?: string) => {
    setNotice({ text, undo });
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  };
  const openRules = (opener: HTMLElement | null, nextEditor: Editor | null = null) => {
    openerRef.current = opener;
    const seed: BarPick = {
      move: data.direction?.move_kind ?? null,
      places: data.filters.place?.values ?? [],
      sectors: data.filters.sector?.values ?? [],
    };
    baseline.current = seed;
    setMovePick(seed.move); setPlacePick(seed.places); setSectorPick(seed.sectors);
    setKindPick(data.filters.kind?.values ?? []);
    setLevelPick((data.filters.level?.values ?? [])[0] ?? null);
    setOrgPick(data.filters.org_type?.values ?? []);
    setSavedBar(false); setSaveError(null); setEditor(nextEditor); setRulesOpen(true);
  };
  // Each of the four new questions stands on its own and saves on its own.
  const saveFilter = async (field: string, op: string, values: string[]) => {
    if (busy) return;
    setBusy(true); setSaveError(null);
    const { error } = await supabase.rpc("oe_filter_save" as never, { p_field: field, p_op: op, p_values: values } as never);
    if (error) setSaveError(fill(v("bar_save_failed"), { error: error.message }));
    else { setSavedBar(true); setEditor(null); await load(); await loadFound(); window.setTimeout(() => setSavedBar(false), 1500); }
    setBusy(false);
  };
  const saveCompanies = async () => {
    await saveFilter("issuer", "prefer", followPick.map((row) => row.id));
    await supabase.rpc("oe_filter_save" as never, { p_field: "issuer", p_op: "exclude", p_values: hidePick.map((row) => row.id) } as never);
    await load(); await loadFound();
  };
  // "Check this for me" — one opportunity judged now, then watched until the
  // verdict lands or three minutes pass.
  const checkNow = useCallback(async (id: string) => {
    if (checking.has(id)) return;
    const { data: result, error } = await supabase.rpc("oe_app_check_now" as never, { p_opportunity: id } as never);
    const payload = (result ?? null) as { ok?: boolean; already?: boolean } | null;
    if (error || !payload?.ok) { showNotice(v("found_error")); return; }
    setChecking((current) => new Set(current).add(id));
    const stop = () => setChecking((current) => { const next = new Set(current); next.delete(id); return next; });
    if (payload.already) { void loadFound(); stop(); return; }
    const started = Date.now();
    const tick = async () => {
      const { data: fresh } = await supabase.rpc("oe_app_found" as never, { p_days: 7 } as never);
      const next = (fresh ?? null) as FoundData | null;
      if (next) setFound(next);
      const done = (next?.groups ?? []).some((group) => (group.items ?? []).some((item) => item.id === id && item.judged === true));
      if (done) { stop(); await load(); return; }
      if (Date.now() - started < 180_000) window.setTimeout(() => void tick(), 20_000); else stop();
    };
    window.setTimeout(() => void tick(), 20_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, load, loadFound, v]);

  const togglePlace = (value: string) => setPlacePick((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const toggleSector = (value: string) => setSectorPick((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const barDirty = movePick !== baseline.current.move || !sameSet(placePick, baseline.current.places) || !sameSet(sectorPick, baseline.current.sectors);
  const closeRules = () => { void member.reload(); setRulesOpen(false); setEditor(null); window.setTimeout(() => openerRef.current?.focus(), 0); };
  const refresh = async () => { if (refreshing) return; setRefreshing(true); await supabase.rpc("oe_app_refresh" as never); renderedRef.current.clear(); await load(); setRefreshing(false); };
  const markRendered = useCallback((card: QueueCard, node: HTMLElement | null) => {
    if (!node || renderedRef.current.has(card.id)) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || renderedRef.current.has(card.id)) return;
      renderedRef.current.add(card.id); void supabase.rpc("oe_app_render" as never, { p_card: card.opportunity_id } as never); observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(node);
  }, []);
  const moveStage = async (cardId: string, stage: CardStage) => {
    if (busy) return; setBusy(true);
    const { data: result } = await supabase.rpc("oe_card_stage_save" as never, { p_card: cardId, p_stage: stage } as never);
    setBusy(false); if ((result as { ok?: boolean } | null)?.ok) await load();
  };
  const decide = async (card: QueueCard, action: "right" | "later") => {
    if (busy) return; setBusy(true);
    const { data: result } = await supabase.rpc("oe_app_decide" as never, { p_card: card.opportunity_id, p_action: action } as never);
    if (!(result as { ok?: boolean } | null)?.ok) { setBusy(false); return; }
    if (action === "later") {
      const stored = data.moves.find((item) => item.opportunity_id === card.opportunity_id);
      if (stored) await moveStage(stored.card_id, "saved");
    }
    setData((current) => ({ ...current, cards: current.cards.filter((item) => item.id !== card.id) }));
    setActiveId(null); setDecliningId(null); setBusy(false);
    showNotice(v(action === "later" ? "toast_later" : "toast_go"));
    if (action === "right") { const destination = card.route_url ?? card.source_url; if (destination) window.open(destination, "_blank", "noopener,noreferrer"); }
  };
  const decline = async (card: QueueCard, scope: string | null, value: string | null, truth: string | null) => {
    if (busy) return; setBusy(true);
    const { data: result } = await supabase.rpc("oe_app_decide" as never, { p_card: card.opportunity_id, p_action: "not_quite", p_scope: scope, p_scope_value: value, p_truth: truth } as never);
    if ((result as { ok?: boolean } | null)?.ok) {
      setData((current) => ({ ...current, cards: current.cards.filter((item) => item.id !== card.id) }));
      setActiveId(null); setDecliningId(null); showNotice(v("toast_declined"));
    }
    setBusy(false);
  };
  const saveBar = async () => {
    if (busy || !barDirty) return;
    setBusy(true); setSaveError(null);
    const { error } = await supabase.rpc("oe_bar_save" as never, { p_move: movePick, p_places: placePick, p_sectors: sectorPick } as never);
    if (!error) {
      baseline.current = { move: movePick, places: placePick, sectors: sectorPick };
      setEditor(null); setSavedBar(true);
      await load();
      window.setTimeout(() => { setSavedBar(false); closeRules(); }, 900);
    } else {
      // A refused save is said out loud, and the dialog stays where it is.
      setSaveError(fill(v("bar_save_failed"), { error: error.message }));
    }
    setBusy(false);
  };
  // "Save as my setting" from the Found list — the only way a Found filter
  // reaches Tune. Places add to his saved places; the rest set that one answer.
  const saveSetting = async (field: "country" | "level" | "kind" | "org", value: string): Promise<boolean> => {
    const call = field === "country"
      ? supabase.rpc("oe_bar_save" as never, { p_move: movePick, p_places: [...new Set([...placePick, value])], p_sectors: sectorPick } as never)
      : supabase.rpc("oe_filter_save" as never, { p_field: field === "org" ? "org_type" : field, p_op: field === "level" ? "at_or_above" : "prefer", p_values: [value] } as never);
    const { error } = await call;
    if (!error) { if (field === "country") setPlacePick((p) => [...new Set([...p, value])]); await load(); await loadFound(); }
    return !error;
  };
  const saveRemote = async (next: boolean) => {
    setRemoteOk(next);
    const { error } = await supabase.rpc("oe_remote_save" as never, { p_ok: next } as never);
    if (error) { setRemoteOk(!next); setSaveError(fill(v("bar_save_failed"), { error: error.message })); }
  };


  return <section className="oe-queue" dir={rtl ? "rtl" : "ltr"} lang={language} aria-busy={loading}>
    <header className="oe-queue-header">
      <div className="oe-header-top"><SectionHeader label={v("queue_eyebrow")} />{view !== "moves" && <Button ref={(node) => { if (!rulesOpen && node && !openerRef.current) openerRef.current = node; }} variant="outline" size="icon" className="oe-gear" aria-label={v("view_your_settings")} onClick={(event) => openRules(event.currentTarget)}><Settings2 aria-hidden="true" /></Button>}</div>
      <div className="oe-machine-line"><span className={`oe-machine-dot${refreshing || data.reading?.running ? " oe-machine-dot-working" : ""}`} aria-hidden /><span>{refreshing ? v("machine_looking_again") : data.reading?.running ? v("machine_reading_now") : data.reading?.last_read_at ? fill(v("machine_last_read"), { time: readTime(data.reading.last_read_at, language) }) : v("machine_still_reading")}</span><Button variant="link" size="sm" onClick={() => void refresh()} disabled={refreshing || loading}>{v(refreshing ? "action_refreshing" : "action_refresh")}</Button></div>
    </header>
    <IdentityBanner identity={member.identity} v={v} onSaved={() => void member.reload()} onOther={() => openRules(null)} />
    <nav className="oe-segments" aria-label={v("nav_aria")}>{(["today", "found", "moves"] as View[]).map((item) => <Button key={item} variant="ghost" aria-current={view === item || undefined} onClick={() => setView(item)}><span>{v(item === "today" ? "view_for_you" : item === "found" ? "view_explore" : "view_your_moves")}</span>{item === "today" && cards.length > 0 && <b style={mono}>{cards.length}</b>}{item === "moves" && data.moves.length > 0 && <b style={mono}>{data.moves.length}</b>}</Button>)}</nav>
    <main>
      {view === "today" && <><ViewHeading title={v("view_for_you")} subtitle={v("subtitle_for_you")} tip="tip_for_you" v={v} /><Funnel data={data.funnel} v={v} /><TodayView active={active} compact={compact} decliningId={decliningId} data={data} busy={busy} v={v} language={language} found={found} more={moreRows} onExplore={() => setView("found")} onPromote={setActiveId} onDeclineStart={setDecliningId} onDecide={decide} onDecline={decline} onRender={markRendered} /></>}
      {view === "found" && <><ViewHeading title={v("view_explore")} subtitle={v("subtitle_explore")} tip="tip_explore" v={v} /><Funnel data={data.funnel} v={v} /><FoundList data={found} loading={foundLoading} error={foundError} v={v} language={language} onRetry={() => void loadFound()} checking={checking} onCheck={(id) => void checkNow(id)} sectors={sectorOptions} countries={countries} onSaveSetting={saveSetting} /></>}
      {view === "moves" && <><ViewHeading title={v("view_your_moves")} subtitle={v("subtitle_your_moves")} tip="tip_your_moves" v={v} /><MovesView rows={data.moves} busy={busy} v={v} language={language} onMove={(id, stage) => void moveStage(id, stage)} /></>}
    </main>
    <div className={`oe-toast${notice ? " is-visible" : ""}`} role="status" aria-live="polite"><span>{notice?.text}</span></div>
    {rulesOpen && createPortal(<RulesDialog data={data} home={home} language={language} busy={busy} editor={editor} movePick={movePick} placePick={placePick} sectorPick={sectorPick} sectorOptions={sectorOptions} countries={countries} remoteOk={remoteOk} saveError={saveError} savedBar={savedBar} barDirty={barDirty} kindPick={kindPick} levelPick={levelPick} orgPick={orgPick} followPick={followPick} hidePick={hidePick} v={v} onEditor={(value) => { setSavedBar(false); setSaveError(null); setEditor(value); }} onMove={setMovePick} onPlace={togglePlace} onPlaceAny={() => setPlacePick([])} onSector={toggleSector} onSectorAny={() => setSectorPick([])} onRemote={(next) => void saveRemote(next)} onSaveBar={() => void saveBar()} onKind={(value) => setKindPick((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} onLevel={setLevelPick} onOrg={(value) => setOrgPick((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} onFollow={setFollowPick} onHide={setHidePick} onSaveFilter={(field, op, values) => void saveFilter(field, op, values)} onSaveCompanies={() => void saveCompanies()} onClose={closeRules} />, document.body)}
  </section>;
}

function TodayView({ active, compact, more, decliningId, data, busy, v, language, found, foundLoading, foundError, checking, sectorOptions, countries, onCheck, onRetryFound, onPromote, onDeclineStart, onDecide, onDecline, onRender }: { active: QueueCard | null; compact: QueueCard[]; more: QueueCard[]; decliningId: string | null; data: QueueData; busy: boolean; v: Vocab; language: Lang; found: FoundData | null; foundLoading: boolean; foundError: boolean; checking: Set<string>; sectorOptions: SectorOption[]; countries: Country[]; onCheck: (id: string) => void; onRetryFound: () => void; onPromote: (id: string) => void; onDeclineStart: (id: string | null) => void; onDecide: (card: QueueCard, action: "right" | "later") => Promise<void>; onDecline: (card: QueueCard, scope: string | null, value: string | null, truth: string | null) => Promise<void>; onRender: (card: QueueCard, node: HTMLElement | null) => void }) {
  // Today is our judgment and his Tune, nothing else: no filter row here.
  // "Everything we found" lives in its own tab.
  const foundList = null;
  if (!active) {
    const total = Number(found?.total ?? 0);
    const atLevel = found?.groups?.find((group) => group.key === "at_level") ?? null;
    const atLevelCount = Number(atLevel?.count ?? 0);
    // A quiet day is only quiet when nothing at all was found. Anything found
    // and not yet carded is said plainly instead.
    const allJudged = (atLevel?.items ?? []).length > 0 && (atLevel?.items ?? []).every((item) => item.judged === true);
    return <>
      {total > 0
        ? <AuraCard hover="none" className="oe-empty"><h2>{v("found_none_carded")}</h2><p>{fill(v(allJudged ? "found_counted_line" : "found_pending_line"), { total, at_level: atLevelCount })}</p></AuraCard>
        : !foundLoading && !foundError && <QuietDay data={data} v={v} language={language} />}
      {foundList}
    </>;
  }
  return <>
    <section className="oe-stack" aria-label={v("today_stack_aria")}>
      <article ref={(node) => onRender(active, node)} className="oe-full-card"><OpportunityDetail card={active} declining={decliningId === active.id} busy={busy} v={v} language={language} onDeclineStart={() => onDeclineStart(active.id)} onDeclineBack={() => onDeclineStart(null)} onDecide={(action) => onDecide(active, action)} onDecline={(scope, value, truth) => onDecline(active, scope, value, truth)} /></article>
      {compact.length > 0 && <div className="oe-next-list">{compact.map((card) => <Button key={card.id} variant="ghost" className="oe-next-row" onClick={() => onPromote(card.id)}><span><strong>{card.title}</strong><small>{[card.issuer_name, card.location, card.level_direction ? v(`leveldir_${card.level_direction}`) : null].filter(Boolean).join(" · ")}</small></span><time style={mono}>{card.deadline ? dateText(card.deadline, language) : v("stack_no_closing_date")}</time></Button>)}</div>}
      {more.length > 0 && <details className="oe-more-cleared"><summary>{v("more_cleared")} <b style={mono}>{more.length}</b></summary><div className="oe-next-list">{more.map((card) => <Button key={card.id} variant="ghost" className="oe-next-row" onClick={() => onPromote(card.id)}><span><strong>{card.title}</strong><small>{[card.issuer_name, card.location, card.level_direction ? v(`leveldir_${card.level_direction}`) : null].filter(Boolean).join(" · ")}</small></span><time style={mono}>{card.deadline ? dateText(card.deadline, language) : v("stack_no_closing_date")}</time></Button>)}</div></details>}
    </section>
    {foundList}
  </>;
}

function QuietDay({ data, v, language }: { data: QueueData; v: Vocab; language: Lang }) {
  const quiet = data.quiet_day;
  return <AuraCard hover="none" className="oe-empty"><h2>{v("quiet_title")}</h2><p>{fill(v("quiet_body"), { sources: quiet?.surfaces_read ?? 0, findings: quiet?.findings ?? 0 })}</p><p>{v("quiet_none_cleared")}</p>{quiet?.from_date && quiet.to_date && <p className="oe-window-line" style={mono}>{fill(v("quiet_window"), { from: dateText(quiet.from_date, language), to: dateText(quiet.to_date, language) })}</p>}{data.window?.expected_by && <p className="oe-window-line" style={mono}>{fill(v(data.window.missed ? "window_missed" : "window_expected"), { date: dateText(data.window.expected_by, language) })}</p>}</AuraCard>;
}
function CardSummary({ card, v }: { card: QueueCard; v: Vocab }) {
  const state = card.access_state ? v(`state_${card.access_state}`) : v("group_open_now");
  const workOf = useWorkArrangements([card.opportunity_id]);
  return <><div className={`oe-state${card.clock_text ? " oe-state-clock" : " oe-state-act"}`}><span aria-hidden />{state}<Tip v={v} k="tip_band" />{card.clock_text && <em>{card.clock_text}</em>}</div><h2>{card.title}</h2><p className="oe-meta">{[card.issuer_name, card.location, card.level_direction ? v(`leveldir_${card.level_direction}`) : null].filter(Boolean).join(" · ")}</p><WorkChip wa={workOf(card.opportunity_id)} v={v} /></>;
}
function OpportunityDetail({ card, declining, busy, v, language, onDeclineStart, onDeclineBack, onDecide, onDecline }: { card: QueueCard; declining: boolean; busy: boolean; v: Vocab; language: Lang; onDeclineStart: () => void; onDeclineBack: () => void; onDecide: (action: "right" | "later") => Promise<void>; onDecline: (scope: string | null, value: string | null, truth: string | null) => Promise<void> }) {
  const member = useMemberIdentity();
  const matchedAs = matchedAsLine(member.identity, v);
  const taste: Array<[string, string, string | null]> = [["taste_level", "level", card.level_band], ["taste_sector", "sector", card.sector], ["taste_issuer", "issuer", card.issuer_id], ["taste_place", "place", card.location], ["taste_just_this", "just_this", card.opportunity_id]];
  const truths = ["dead_route", "quote_absent", "listing_page", "already_happened", "wrong_issuer"];
  const checked = checkedAt(card);
  const interestLine = Number(card.interest?.captures ?? 0) > 0 && card.interest?.since ? fill(v("line_interest"), { n: Number(card.interest?.captures ?? 0), date: dateText(String(card.interest.since), language) }) : null;
  const standingLine = card.level_direction ? fill(v("line_standing"), { direction: v(`leveldir_${card.level_direction}`), tier: v(`tier_${card.employer_tier ?? "unknown"}`) }) : null;
  const door = card.cost_of_door ? fill(v(language === "ar" ? "door_cost_ar" : "door_cost_en"), { cost: card.cost_of_door }) : v(`door_${doorClass(card.route_url ?? card.source_url)}`);
  return <div className="oe-card-detail"><div className="oe-detail-title"><CardSummary card={card} v={v} /></div><div className="oe-why-more">{matchedAs && <p><span className="oe-dot-rule" aria-hidden />{matchedAs}</p>}{(card.why_lines ?? []).map((line, index) => <p key={index}><span className="oe-dot-evidence" aria-hidden />{line.text}</p>)}{card.presentation_line && <p><span className="oe-dot-rule" aria-hidden />{card.presentation_line}</p>}{interestLine && <p><span className="oe-dot-evidence" aria-hidden />{interestLine}</p>}{standingLine && <p><span className="oe-dot-rule" aria-hidden />{standingLine}</p>}{card.gap_line?.text && <p className="oe-risk"><span className="oe-dot-risk" aria-hidden /><strong>{v("gap_prefix")}</strong> {card.gap_line.text}<Tip v={v} k="tip_gap" /></p>}{card.quote && <blockquote>“{card.quote}” {card.source_url && <a href={card.source_url} target="_blank" rel="noreferrer">{v("card_source")}</a>}</blockquote>}{checked && <p className="oe-checked" style={mono}>{fill(v("card_checked"), { date: dateText(checked, language) })}</p>}</div><p className="oe-door-cost"><span aria-hidden />{door}</p>{!declining ? <div className={`oe-actions${language === "ar" ? " is-rtl" : ""}`}><AuraButton onClick={() => void onDecide("right")} loading={busy}>{v("action_go")}</AuraButton><div><AuraButton variant="ghost" onClick={() => void onDecide("later")} disabled={busy}>{v("action_later")}</AuraButton><AuraButton variant="ghost" onClick={onDeclineStart} disabled={busy}>{v("action_not_for_me")}</AuraButton></div></div> : <div className="oe-decline"><div><h3>{v("decline_title")}</h3><div className="oe-chip-row">{taste.filter((entry) => Boolean(entry[2])).map(([key, scope, value]) => <Button key={key} variant="outline" disabled={busy} onClick={() => void onDecline(scope, value, null)}>{v(key)}</Button>)}</div></div><div><h3>{v("decline_truth_title")}</h3><div className="oe-chip-row">{truths.map((truth) => <Button key={truth} variant="outline" disabled={busy} onClick={() => void onDecline(null, null, truth)}>{v(`truth_${truth}`)}</Button>)}</div></div><Button variant="link" onClick={onDeclineBack}>{v("action_back")}</Button></div>}</div>;
}
function ParkedView({ rows, busy, v, language, onBringBack }: { rows: Parked[]; busy: boolean; v: Vocab; language: Lang; onBringBack: (id: string) => void }) {
  return <section className="oe-view oe-view-narrow"><SectionHeader label={v("view_parked")} />{rows.length ? <div className="oe-parked-list">{rows.map((row) => <article key={row.opportunity_id} className="oe-parked-row"><div><h2>{row.title}</h2><p>{[row.issuer_name, row.location].filter(Boolean).join(" · ")}</p><small style={mono}>{fill(v("parked_on"), { date: dateText(row.parked_at, language) })}{row.deadline ? ` · ${fill(v("parked_closes"), { date: dateText(row.deadline, language) })}` : ""}</small></div><AuraButton variant="ghost" disabled={busy} onClick={() => onBringBack(row.opportunity_id)}>{v("action_bring_back")}</AuraButton></article>)}</div> : <p className="oe-empty-copy">{v("parked_empty")}</p>}</section>;
}
function HistoryView({ rows, filter, v, language, onFilter }: { rows: History[]; filter: HistoryFilter; v: Vocab; language: Lang; onFilter: (filter: HistoryFilter) => void }) {
  const filtered = rows.filter((row) => filter === "all" || filter === "right" && row.tap === "right" || filter === "declined" && row.tap === "not_my_area" && !row.truth_code || filter === "flagged" && Boolean(row.truth_code));
  const groups = new Map<string, History[]>(); filtered.forEach((row) => { const key = dayKey(row.shown_at); groups.set(key, [...(groups.get(key) ?? []), row]); });
  return <section className="oe-view oe-view-narrow"><SectionHeader label={v("view_history")} /><div className="oe-filter-row">{(["all", "right", "declined", "flagged"] as HistoryFilter[]).map((value) => <Button key={value} variant="outline" aria-pressed={filter === value} onClick={() => onFilter(value)}>{v(`history_filter_${value}`)}</Button>)}</div>{groups.size ? Array.from(groups.entries()).map(([day, dayRows]) => <section key={day} className="oe-history-day"><h3 style={mono}>{dateText(day, language)}</h3>{dayRows.map((row, index) => <article key={`${day}-${index}`} className="oe-history-row"><p><span>{v("history_shown")}</span><strong>{row.title ?? v("history_untitled")}</strong><small>{[row.issuer_name, row.location].filter(Boolean).join(" · ")}</small>{row.presentation_line && <small className="oe-history-line">{row.presentation_line}</small>}</p><p><span>{v("history_decided")}</span>{historyDecision(row, v)}</p><p><span>{v("history_happened")}</span>{historyOutcome(row, v)}</p></article>)}</section>) : <p className="oe-empty-copy">{v("history_empty")}</p>}</section>;
}

function RulesDialog({ data, home, language, busy, editor, movePick, placePick, sectorPick, sectorOptions, countries, remoteOk, saveError, savedBar, barDirty, kindPick, levelPick, orgPick, followPick, hidePick, v, onEditor, onMove, onPlace, onPlaceAny, onSector, onSectorAny, onRemote, onSaveBar, onKind, onLevel, onOrg, onFollow, onHide, onSaveFilter, onSaveCompanies, onClose }: { data: QueueData; home: Home | null; language: Lang; busy: boolean; editor: Editor | null; movePick: MoveKind | null; placePick: string[]; sectorPick: string[]; sectorOptions: SectorOption[]; countries: Country[]; remoteOk: boolean; saveError: string | null; savedBar: boolean; barDirty: boolean; kindPick: string[]; levelPick: string | null; orgPick: string[]; followPick: Company[]; hidePick: Company[]; v: Vocab; onEditor: (value: Editor | null) => void; onMove: (value: MoveKind) => void; onPlace: (value: string) => void; onPlaceAny: () => void; onSector: (value: string) => void; onSectorAny: () => void; onRemote: (value: boolean) => void; onSaveBar: () => void; onKind: (value: string) => void; onLevel: (value: string | null) => void; onOrg: (value: string) => void; onFollow: (rows: Company[]) => void; onHide: (rows: Company[]) => void; onSaveFilter: (field: string, op: string, values: string[]) => void; onSaveCompanies: () => void; onClose: () => void }) {
  const identity = useMemberIdentity();
  const dialogRef = useRef<HTMLElement | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [sectorQuery, setSectorQuery] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyMatches, setCompanyMatches] = useState<Company[]>([]);
  useEffect(() => {
    const needle = companyQuery.trim();
    if (needle.length < 2) { setCompanyMatches([]); return; }
    let live = true;
    const timer = window.setTimeout(() => { void (async () => {
      const { data: rows } = await supabase.rpc("oe_ref_entity_search" as never, { p_q: needle } as never);
      if (live) setCompanyMatches(Array.isArray(rows) ? (rows as unknown as Company[]) : []);
    })(); }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [companyQuery]);
  const places = data.filters.place?.values ?? [];
  const placeText = places.length ? places.map((value) => value.startsWith("region:") ? refLabel("region", value.slice(7), language) : refLabel("place", value, language)).join(" · ") : v("move_place_any");
  const homeChoice = home?.city && home.country ? { value: home.country, label: fill(v("move_place_home"), { city: home.city }) } : null;
  const regionChoices = (home?.regions ?? []).filter((region) => region.code !== "WORLD").map((region) => ({
    value: `region:${region.code}`,
    label: fill(v("move_place_region"), { region: language === "ar" ? (region.name_ar || region.name_en) : region.name_en }),
  }));
  const choices: Array<{ value: string; label: string }> = [homeChoice, ...regionChoices].filter((choice): choice is { value: string; label: string } => Boolean(choice));
  const quickValues = new Set(choices.map((choice) => choice.value));
  // No place chosen: full-time seats default to home + home's first region (twin of SQL oe_default_places).
  const defaultPlaces = [homeChoice, regionChoices[0]].filter((choice): choice is { value: string; label: string } => Boolean(choice));
  const placeIsDefault = placePick.length === 0 && defaultPlaces.length > 0;
  const defaultValues = new Set(placeIsDefault ? defaultPlaces.map((choice) => choice.value) : []);
  const countryName = (iso2: string) => {
    const row = countries.find((item) => item.iso2 === iso2);
    return row ? (language === "ar" ? (row.name_ar || row.name_en) : row.name_en) : refLabel("place", iso2, language);
  };
  const pickedCountries = placePick.filter((value) => !value.startsWith("region:") && !quickValues.has(value));
  const countryMatches = countries
    .filter((row) => !placePick.includes(row.iso2))
    .filter((row) => {
      const needle = countryQuery.trim().toLowerCase();
      if (!needle) return false;
      return row.name_en.toLowerCase().includes(needle) || String(row.name_ar ?? "").includes(countryQuery.trim()) || row.iso2.toLowerCase() === needle;
    }).slice(0, 8);
  const sectorLabel = (option: SectorOption) => language === "ar" ? (option.label_ar || option.label_en) : option.label_en;
  const sectorMatches = sectorOptions.filter((option) => {
    const needle = sectorQuery.trim().toLowerCase();
    return !needle || sectorLabel(option).toLowerCase().includes(needle) || option.code.toLowerCase().includes(needle);
  });
  const chosenSectors = data.filters.sector?.values ?? [];
  const sectorText = chosenSectors.length
    ? chosenSectors.map((code) => sectorLabel(sectorOptions.find((option) => option.code === code) ?? { code, label_en: code, label_ar: code })).join(" · ")
    : v("bar_sector_any");
  // Saved preferences read back as words, never as a count or a share.
  const savedKinds = data.filters.kind?.values ?? [];
  const kindText = savedKinds.length ? savedKinds.map((code) => v(`kind_${code}`)).join(" · ") : v("bar_any");
  const savedLevel = (data.filters.level?.values ?? [])[0] ?? null;
  const levelText = savedLevel ? v(`level_${savedLevel}`) : v("bar_any");
  const savedOrgs = data.filters.org_type?.values ?? [];
  const orgText = savedOrgs.length ? savedOrgs.map((code) => v(`org_${code}`)).join(" · ") : v("bar_any");
  const companyText = [
    followPick.length ? `${v("companies_follow")}: ${followPick.map((row) => row.name).join(" · ")}` : null,
    hidePick.length ? `${v("companies_hide")}: ${hidePick.map((row) => row.name).join(" · ")}` : null,
  ].filter(Boolean).join(" — ") || v("bar_any");
  useEffect(() => {
    const node = dialogRef.current; if (!node) return;
    const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    const focusable = () => Array.from(node.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'));
    focusable()[0]?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", keys);
    return () => { document.body.style.overflow = old; node.removeEventListener("keydown", keys); };
  }, [onClose]);
  return <div className="oe-dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="oe-rules-dialog" dir={language === "ar" ? "rtl" : "ltr"} lang={language} role="dialog" aria-modal="true" aria-labelledby="oe-rules-title">
    <header><h2 id="oe-rules-title">{v("rules_dialog_title")}</h2><Button variant="ghost" size="icon" aria-label={v("sheet_close")} onClick={onClose}><X aria-hidden="true" /></Button></header>
    <div className="oe-dialog-body">
    <section className="oe-dialog-section"><h3>{v("delivery_title")}</h3><DeliveryRow v={v} /></section>
    <section className="oe-dialog-section"><h3>{v("rules_bar_title")}</h3><IdentityRow identity={identity.identity} v={v} language={language} onSaved={() => void identity.reload()} /><div className="oe-dialog-row"><div><strong>{v("settings_move")}</strong><span>{data.direction?.move_kind ? v(moveKey(data.direction.move_kind)) : v("settings_not_set")}</span>{data.direction?.move_confirmed_at && <small style={mono}>{fill(v("rules_set_on"), { date: dateText(data.direction.move_confirmed_at, language) })} · {fill(v("rules_ask_again"), { date: dateText(new Date(new Date(data.direction.move_confirmed_at).getTime() + 90 * 86_400_000).toISOString(), language) })}</small>}</div><Button variant="link" onClick={() => onEditor("move")}>{v("action_change")}</Button></div><div className="oe-dialog-row"><div><strong>{v("settings_place")}</strong><span>{placeText}</span><small>{v(placeIsDefault ? "places_source_default" : "places_source_member")}<Tip v={v} k={placeIsDefault ? "tip_places_default" : "tip_places_member"} /></small></div><Button variant="link" onClick={() => onEditor("place")}>{v("action_change")}</Button></div>
      {sectorOptions.length > 0 && <div className="oe-dialog-row"><div><strong>{v("settings_sectors")}</strong><span>{sectorText}</span></div><Button variant="link" onClick={() => onEditor("sector")}>{v("action_change")}</Button></div>}
      <div className="oe-dialog-row"><div><strong>{v("settings_kinds")}</strong><span>{kindText}</span></div><Button variant="link" onClick={() => onEditor("kind")}>{v("action_change")}</Button></div>
      <div className="oe-dialog-row"><div><strong>{v("settings_level")}</strong><span>{levelText}</span></div><Button variant="link" onClick={() => onEditor("level")}>{v("action_change")}</Button></div>
      <div className="oe-dialog-row"><div><strong>{v("settings_org_types")}</strong><span>{orgText}</span></div><Button variant="link" onClick={() => onEditor("org")}>{v("action_change")}</Button></div>
      <div className="oe-dialog-row"><div><strong>{v("settings_companies")}</strong><span>{companyText}</span></div><Button variant="link" onClick={() => onEditor("companies")}>{v("action_change")}</Button></div>
      {editor === "kind" && <div className="oe-inline-editor"><p>{v("bar_kind_question")}</p><div className="oe-chip-row">{KINDS.map((code) => <Button key={code} variant="outline" aria-pressed={kindPick.includes(code)} onClick={() => onKind(code)}>{v(`kind_${code}`)}</Button>)}<Button variant="outline" aria-pressed={kindPick.length === 0} onClick={() => onSaveFilter("kind", "prefer", [])}>{v("bar_any")}</Button></div><AuraButton loading={busy} onClick={() => onSaveFilter("kind", "prefer", kindPick)}>{v("save")}</AuraButton>{saveError && <p className="oe-save-error" role="alert">{saveError}</p>}</div>}
      {editor === "level" && <div className="oe-inline-editor"><p>{v("bar_level_question")}</p><div className="oe-chip-row">{FLOORS.map((code) => <Button key={code} variant="outline" aria-pressed={levelPick === code} onClick={() => onLevel(code)}>{v(`level_${code}`)}</Button>)}<Button variant="outline" aria-pressed={!levelPick} onClick={() => { onLevel(null); onSaveFilter("level", "at_or_above", []); }}>{v("bar_any")}</Button></div><AuraButton loading={busy} disabled={!levelPick} onClick={() => onSaveFilter("level", "at_or_above", levelPick ? [levelPick] : [])}>{v("save")}</AuraButton>{saveError && <p className="oe-save-error" role="alert">{saveError}</p>}</div>}
      {editor === "org" && <div className="oe-inline-editor"><p>{v("bar_org_question")}</p><div className="oe-chip-row">{ORGS.map((code) => <Button key={code} variant="outline" aria-pressed={orgPick.includes(code)} onClick={() => onOrg(code)}>{v(`org_${code}`)}</Button>)}<Button variant="outline" aria-pressed={orgPick.length === 0} onClick={() => onSaveFilter("org_type", "prefer", [])}>{v("bar_any")}</Button></div><AuraButton loading={busy} onClick={() => onSaveFilter("org_type", "prefer", orgPick)}>{v("save")}</AuraButton>{saveError && <p className="oe-save-error" role="alert">{saveError}</p>}</div>}
      {editor === "companies" && <div className="oe-inline-editor oe-sector-editor">
        <p>{v("bar_companies_question")}</p>
        <input type="search" className="oe-search" value={companyQuery} placeholder={v("companies_search")} onChange={(event) => setCompanyQuery(event.target.value)} autoComplete="off" />
        {companyMatches.length > 0 && <div className="oe-option-list" role="listbox">{companyMatches.map((row) => <div key={row.id} className="oe-option-row">
          <span>{row.name}</span>
          <Button variant="link" onClick={() => { if (!followPick.some((item) => item.id === row.id)) onFollow([...followPick, row]); setCompanyQuery(""); }}>{v("companies_follow")}</Button>
          <Button variant="link" onClick={() => { if (!hidePick.some((item) => item.id === row.id)) onHide([...hidePick, row]); setCompanyQuery(""); }}>{v("companies_hide")}</Button>
        </div>)}</div>}
        {followPick.length > 0 && <div className="oe-chip-row">{followPick.map((row) => <Button key={row.id} variant="outline" onClick={() => onFollow(followPick.filter((item) => item.id !== row.id))}>{v("companies_follow")}: {row.name} ×</Button>)}</div>}
        {hidePick.length > 0 && <div className="oe-chip-row">{hidePick.map((row) => <Button key={row.id} variant="outline" onClick={() => onHide(hidePick.filter((item) => item.id !== row.id))}>{v("companies_hide")}: {row.name} ×</Button>)}</div>}
        <p className="oe-dialog-note">{v("companies_hide_note")}</p>
        <AuraButton loading={busy} onClick={onSaveCompanies}>{v("save")}</AuraButton>{saveError && <p className="oe-save-error" role="alert">{saveError}</p>}
      </div>}
      {editor === "move" && <div className="oe-inline-editor"><p>{v("move_question")}</p>{moves.map((move) => <Button key={move} variant="outline" aria-pressed={movePick === move} className={`${data.direction?.move_proposed === move ? "is-proposed" : ""}`} onClick={() => onMove(move)}>{v(moveKey(move))}</Button>)}</div>}
      {editor === "place" && <div className="oe-inline-editor oe-place-editor">
        <p>{v("move_place_question")}</p>
        <div className="oe-chip-row">
          {choices.map((place) => <Button key={place.value} variant="outline" aria-pressed={placePick.includes(place.value) || defaultValues.has(place.value)} onClick={() => onPlace(place.value)}>{place.label}</Button>)}
          <Button variant="outline" aria-pressed={placePick.length === 0 && !placeIsDefault} onClick={onPlaceAny}>{v("move_place_any")}</Button>
        </div>
        {placeIsDefault && <p className="oe-dialog-note">{v("place_default_note")}</p>}
        <label className="oe-field-label" htmlFor="oe-country-search">{v("place_add_country")}</label>
        <input id="oe-country-search" type="search" className="oe-search" value={countryQuery} placeholder={v("place_search")}
          onChange={(event) => setCountryQuery(event.target.value)} autoComplete="off" role="combobox" aria-expanded={countryMatches.length > 0} aria-controls="oe-country-list" />
        {countryMatches.length > 0 && <div id="oe-country-list" className="oe-option-list" role="listbox">
          {countryMatches.map((row) => <button key={row.iso2} type="button" role="option" aria-selected="false" className="oe-option-row"
            onClick={() => { onPlace(row.iso2); setCountryQuery(""); }}>{language === "ar" ? (row.name_ar || row.name_en) : row.name_en}</button>)}
        </div>}
        {pickedCountries.length > 0 && <div className="oe-chip-row">{pickedCountries.map((iso2) => <Button key={iso2} variant="outline" aria-label={fill(v("place_remove"), { name: countryName(iso2) })} onClick={() => onPlace(iso2)}>{countryName(iso2)} ×</Button>)}</div>}
        <label className="oe-switch-row"><input type="checkbox" checked={remoteOk} onChange={(event) => onRemote(event.target.checked)} /><span>{v("place_remote")}</span></label>
        <RelocationRow countries={countries} language={language} v={v} />
      </div>}
      {editor === "sector" && sectorOptions.length > 0 && <div className="oe-inline-editor oe-sector-editor">
        <p>{v("bar_sector_question")}<b style={mono}>{sectorPick.length}</b></p>
        <input type="search" className="oe-search" value={sectorQuery} placeholder={v("bar_sector_search")} onChange={(event) => setSectorQuery(event.target.value)} autoComplete="off" />
        {sectorPick.length > 0 && <div className="oe-chip-row">{sectorPick.map((code) => {
          const option = sectorOptions.find((item) => item.code === code) ?? { code, label_en: code, label_ar: code };
          return <Button key={code} variant="outline" onClick={() => onSector(code)}>{sectorLabel(option)} ×</Button>;
        })}</div>}
        <div className="oe-sector-list">{sectorMatches.map((option) => <label key={option.code} className="oe-sector-row">
          <input type="checkbox" checked={sectorPick.includes(option.code)} onChange={() => onSector(option.code)} />
          <span>{sectorLabel(option)}</span>
        </label>)}</div>
        <Button variant="link" className="oe-sector-clear" disabled={sectorPick.length === 0} onClick={onSectorAny}>{v("bar_sector_clear")}</Button>
      </div>}
      {(editor === "move" || editor === "place" || editor === "sector") && <div className="oe-inline-editor"><AuraButton disabled={!barDirty} loading={busy} onClick={onSaveBar}>{v("save")}</AuraButton>{saveError && <p className="oe-save-error" role="alert">{saveError}</p>}</div>}
      {savedBar && <p role="status">{v("bar_saved")}</p>}
    </section>
    </div>
    <footer><p>{v("rules_private")}</p><div><Button variant="outline" onClick={onClose}>{v("sheet_close")}</Button></div></footer>
  </section></div>;
}

export default OpportunityQueue;