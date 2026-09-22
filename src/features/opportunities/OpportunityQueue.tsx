import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { FilterMap } from "./FiltersSection";

type Lang = "en" | "ar";
type View = "today" | "parked" | "history";
type HistoryFilter = "all" | "right" | "declined" | "flagged";
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
type Parked = { opportunity_id: string; title: string; issuer_name: string | null; location: string | null; deadline: string | null; parked_at: string };
type History = { shown_at: string; lane: string | null; tap: string | null; tap_scope: string | null; truth_code: string | null; outcome: string | null; title: string | null; issuer_name: string | null; location: string | null; presentation_line: string | null };
type Comment = { id: string; text: string; text_ar?: string | null; said_on: string; field: string | null; value: string | null };
type SectorOption = { code: string; label_en: string; label_ar: string };
type BarPick = { move: MoveKind | null; places: string[]; sectors: string[] };
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
type Rule = { id: string; rule_text: string; rule_text_ar?: string | null; field: string | null; value: string | null; stated_on: string; active?: boolean };
type Direction = { language: Lang | null; move_kind: MoveKind | null; move_confirmed_at: string | null; move_proposed: MoveKind | null };
type Home = { city: string | null; country: string | null; country_name: string | null; regions: Array<{ code: string; name_en: string; name_ar?: string | null }> };
type Window = { expected_by: string; declared_on: string | null; missed: boolean };
type Reading = { running: boolean; last_read_at: string | null };
type QuietDay = { surfaces_read: number; findings: number; from_date: string; to_date: string };
type QueueData = {
  cards: QueueCard[]; parked: Parked[]; held_count: number; held: Array<{ id: string; reason: string | null; title: string | null }>;
  direction: Direction | null; window: Window | null; rules: Rule[]; history: History[]; filters: FilterMap;
  reading: Reading | null; comments: Comment[]; quiet_day: QuietDay | null;
};
type Vocab = ReturnType<typeof useVocab>;

const emptyData: QueueData = { cards: [], parked: [], held_count: 0, held: [], direction: null, window: null, rules: [], history: [], filters: {}, reading: null, comments: [], quiet_day: null };
const moves: MoveKind[] = ["bigger_same", "step_up", "client_side", "exceptional_only"];
const moveKey = (move: MoveKind) => move === "exceptional_only" ? "move_exceptional" : `move_${move}`;
const mono = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" } as const;
const validViews = new Set<View>(["today", "parked", "history"]);
const dayKey = (value: string) => String(value).slice(0, 10);
const fill = (text: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((value, [key, item]) => value.split(`{${key}}`).join(String(item)), text);
const hasWhy = (card: QueueCard) => (card.why_lines ?? []).some((line) => String(line.text ?? "").trim());
const checkedAt = (card: QueueCard) => [card.quote_verified_at, card.route_checked_at, card.last_checked].filter(Boolean).map(String).sort().slice(-1)[0] ?? null;
const heldReasonKey: Record<string, string> = {
  outranked: "settings_held_reason",
  place: "queue_wrong_place",
  level: "queue_wrong_level",
  sector: "queue_wrong_sector",
};
const ruleFieldKey: Record<string, string> = {
  place: "settings_place",
  level: "taste_level",
  sector: "taste_sector",
  kind: "chair_kind",
  engagement: "chair_engagement",
  org_type: "chair_org_type",
  language: "settings_language",
  nationality: "filter_nationality",
};

function ruleValues(rule: Rule): string[] {
  if (!rule.value) return [];
  try {
    const parsed = JSON.parse(rule.value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch { /* stored scalar */ }
  return rule.value.split(",").map((value) => value.trim()).filter(Boolean);
}
function readableRule(rule: Rule, language: Lang, v: Vocab): string {
  const field = String(rule.field ?? "").trim();
  const values = ruleValues(rule);
  if (!field || values.length === 0) {
    const original = language === "ar" && rule.rule_text_ar ? rule.rule_text_ar : rule.rule_text;
    return original.split("_").join(" ");
  }
  const labels = values.map((value) => {
    if (value.startsWith("region:")) return refLabel("region", value.slice(7), language);
    const vocabularyLabel = v(`${field}_${value}`);
    return (vocabularyLabel || refLabel(field, value, language)).split("_").join(" ");
  }).join(" · ");
  const subject = v(ruleFieldKey[field] ?? "settings_held_reason");
  return subject ? `${subject}: ${labels}` : labels;
}

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
function historyDecision(row: History, v: Vocab) {
  if (!row.tap) return v("history_no_decision");
  if (row.tap === "right") return v("history_went");
  if (row.tap === "later") return v("history_later");
  if (row.truth_code) return fill(v("history_flag_prefix"), { reason: v(`truth_reason_${row.truth_code}`) || v("history_flag_unknown") });
  return fill(v("history_not_for_you"), { reason: row.tap_scope ? (v(`scope_${row.tap_scope}`) || v("history_not_a_fit")) : v("history_no_reason") });
}
function historyOutcome(row: History, v: Vocab) {
  if (row.outcome) return v(`outcome_said_${row.outcome}`) || v("outcome_recorded");
  return row.tap === "right" ? v("outcome_not_yet") : v("outcome_none_expected");
}

export function OpportunityQueue() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("view") as View | null;
  const view: View = requested && validViews.has(requested) ? requested : "today";
  const rawFilter = params.get("f") as HistoryFilter | null;
  const historyFilter: HistoryFilter = rawFilter && ["all", "right", "declined", "flagged"].includes(rawFilter) ? rawFilter : "all";
  const [language, setLanguage] = useState<Lang>("en");
  const [data, setData] = useState<QueueData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [editor, setEditor] = useState<"move" | "place" | "sector" | null>(null);
  const [movePick, setMovePick] = useState<MoveKind | null>(null);
  const [placePick, setPlacePick] = useState<string[]>([]);
  const [sectorPick, setSectorPick] = useState<string[]>([]);
  const [sectorOptions, setSectorOptions] = useState<SectorOption[]>([]);
  const [superseded, setSuperseded] = useState<Comment[]>([]);
  const baseline = useRef<BarPick>({ move: null, places: [], sectors: [] });
  const [home, setHome] = useState<Home | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: string } | null>(null);
  const [savedBar, setSavedBar] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const renderedRef = useRef<Set<string>>(new Set());
  const noticeTimer = useRef<number | null>(null);
  const v = useVocab(language);
  const rtl = language === "ar";

  const setView = (next: View) => { const copy = new URLSearchParams(params); next === "today" ? copy.delete("view") : copy.set("view", next); if (next !== "history") copy.delete("f"); setParams(copy); };
  const setHistoryFilter = (next: HistoryFilter) => { const copy = new URLSearchParams(params); copy.set("view", "history"); next === "all" ? copy.delete("f") : copy.set("f", next); setParams(copy); };
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
  const loadSuperseded = useCallback(async () => {
    const { data: rows } = await (supabase.from("oe_notebook" as never) as any)
      .select("id, rule_text, rule_text_ar, stated_on, field, value")
      .eq("entry_kind", "comment").eq("status", "declined").eq("decline_reason", "superseded_by_question")
      .order("stated_on", { ascending: false });
    setSuperseded(((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id), text: String(row.rule_text ?? ""), text_ar: (row.rule_text_ar as string) ?? null,
      said_on: String(row.stated_on ?? ""), field: (row.field as string) ?? null, value: (row.value as string) ?? null,
    })));
  }, []);
  useEffect(() => { void load(); void loadRefLabels(); void loadSuperseded(); }, [load, loadSuperseded]);
  useEffect(() => { void (async () => {
    const { data: rows } = await supabase.rpc("oe_ref_sector_list" as never);
    const list = Array.isArray(rows) ? (rows as unknown as SectorOption[]) : [];
    setSectorOptions(list.filter((row) => row && row.code));
  })(); }, []);
  useEffect(() => { void (async () => { const { data: payload } = await supabase.rpc("oe_my_home" as never); if (payload) setHome(payload as unknown as Home); })(); }, []);
  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);

  const cards = useMemo(() => data.cards.filter((card) => card.lane === "act" && hasWhy(card)).filter((_, index) => index < 3), [data.cards]);
  const active = cards.find((card) => card.id === activeId) ?? cards[0] ?? null;
  const compact = active ? cards.filter((card) => card.id !== active.id).slice(0, 2) : [];
  const waiting = data.comments.length;

  const showNotice = (text: string, undo?: string) => {
    setNotice({ text, undo });
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  };
  const openRules = (opener: HTMLElement | null, nextEditor: "move" | "place" | null = null) => {
    openerRef.current = opener;
    setMovePick(null); setPlacePick([]); setSavedBar(false); setEditor(nextEditor); setRulesOpen(true);
  };
  const closeRules = () => { setRulesOpen(false); setEditor(null); window.setTimeout(() => openerRef.current?.focus(), 0); };
  const refresh = async () => { if (refreshing) return; setRefreshing(true); await supabase.rpc("oe_app_refresh" as never); renderedRef.current.clear(); await load(); setRefreshing(false); };
  const markRendered = useCallback((card: QueueCard, node: HTMLElement | null) => {
    if (!node || renderedRef.current.has(card.id)) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || renderedRef.current.has(card.id)) return;
      renderedRef.current.add(card.id); void supabase.rpc("oe_app_render" as never, { p_card: card.opportunity_id } as never); observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(node);
  }, []);
  const bringBack = async (id: string, returnToToday = false) => {
    if (busy) return; setBusy(true);
    const { data: result } = await supabase.rpc("oe_app_decide" as never, { p_card: id, p_action: "bring_back" } as never);
    setBusy(false); if ((result as { ok?: boolean } | null)?.ok) { await load(); if (returnToToday) setView("today"); }
  };
  const decide = async (card: QueueCard, action: "right" | "later") => {
    if (busy) return; setBusy(true);
    const { data: result } = await supabase.rpc("oe_app_decide" as never, { p_card: card.opportunity_id, p_action: action } as never);
    if (!(result as { ok?: boolean } | null)?.ok) { setBusy(false); return; }
    setData((current) => ({ ...current, cards: current.cards.filter((item) => item.id !== card.id), parked: action === "later" ? [{ opportunity_id: card.opportunity_id, title: card.title, issuer_name: card.issuer_name, location: card.location, deadline: card.deadline, parked_at: new Date().toISOString() }, ...current.parked] : current.parked }));
    setActiveId(null); setDecliningId(null); setBusy(false);
    showNotice(v(action === "later" ? "toast_later" : "toast_go"), action === "later" ? card.opportunity_id : undefined);
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
  const answerComment = async (id: string, accept: boolean) => { if (busy) return; setBusy(true); await supabase.rpc(accept ? "oe_notebook_promote_comment" as never : "oe_notebook_decline_comment" as never, { p_id: id } as never); setBusy(false); await load(); };
  const removeRule = async (id: string) => { if (busy) return; setBusy(true); await supabase.rpc("oe_notebook_remove_rule" as never, { p_id: id } as never); setBusy(false); await load(); };
  const resetRules = async () => {
    const prompt = v("rules_reset_confirm") || `${v("rules_remove")} ${v("rules_active_title")}. ${v("rules_comments_title")}`;
    if (busy || !window.confirm(prompt)) return;
    setBusy(true);
    const { error } = await supabase.rpc("oe_rules_reset" as never);
    if (!error) await load();
    setBusy(false);
  };
  const saveBar = async () => {
    if (busy || !editor) return;
    if (editor === "move" && !movePick) return;
    setBusy(true);
    const { error } = editor === "place"
      ? await supabase.rpc("oe_filter_save" as never, { p_field: "place", p_op: "allow", p_values: placePick } as never)
      : await supabase.rpc("oe_move_save" as never, { p_move: movePick } as never);
    if (!error) {
      setData((current) => editor === "place"
        ? { ...current, filters: { ...current.filters, place: { op: "allow", values: placePick } } }
        : { ...current, direction: { ...(current.direction ?? { language, move_kind: null, move_confirmed_at: null, move_proposed: null }), move_kind: movePick, move_confirmed_at: new Date().toISOString() } });
      setEditor(null); setMovePick(null); setPlacePick([]); setSavedBar(true);
      await load();
    }
    setBusy(false);
  };

  return <section className="oe-queue" dir={rtl ? "rtl" : "ltr"} lang={language} aria-busy={loading}>
    <header className="oe-queue-header">
      <div className="oe-header-top"><SectionHeader label={v("queue_eyebrow")} /><Button ref={(node) => { if (!rulesOpen && node && !openerRef.current) openerRef.current = node; }} variant="outline" size="icon" className="oe-gear" aria-label={v("rules_gear_aria")} onClick={(event) => openRules(event.currentTarget)}><Settings2 aria-hidden="true" />{waiting > 0 && <b style={mono}>{waiting}</b>}</Button></div>
      <div className="oe-machine-line"><span className={`oe-machine-dot${refreshing || data.reading?.running ? " oe-machine-dot-working" : ""}`} aria-hidden /><span>{refreshing ? v("machine_looking_again") : data.reading?.running ? v("machine_reading_now") : data.reading?.last_read_at ? fill(v("machine_last_read"), { time: readTime(data.reading.last_read_at, language) }) : v("machine_still_reading")}</span><Button variant="link" size="sm" onClick={() => void refresh()} disabled={refreshing || loading}>{v(refreshing ? "action_refreshing" : "action_refresh")}</Button></div>
    </header>
    <nav className="oe-segments" aria-label={v("nav_aria")}>{(["today", "parked", "history"] as View[]).map((item) => <Button key={item} variant="ghost" aria-current={view === item || undefined} onClick={() => setView(item)}><span>{v(`view_${item}`)}</span>{item === "today" && cards.length > 0 && <b style={mono}>{cards.length}</b>}{item === "parked" && data.parked.length > 0 && <b style={mono}>{data.parked.length}</b>}</Button>)}</nav>
    <div className="oe-surface-layout"><main>
      {view === "today" && <TodayView active={active} compact={compact} decliningId={decliningId} data={data} busy={busy} v={v} language={language} onPromote={setActiveId} onDeclineStart={setDecliningId} onDecide={decide} onDecline={decline} onRender={markRendered} />}
      {view === "parked" && <ParkedView rows={data.parked} busy={busy} v={v} language={language} onBringBack={(id) => void bringBack(id, true)} />}
      {view === "history" && <HistoryView rows={data.history} filter={historyFilter} v={v} language={language} onFilter={setHistoryFilter} />}
    </main><Aside data={data} language={language} v={v} heldOpen={heldOpen} onHeld={() => setHeldOpen((value) => !value)} onRules={(event) => openRules(event.currentTarget, "move")} /></div>
    <div className={`oe-toast${notice ? " is-visible" : ""}`} role="status" aria-live="polite"><span>{notice?.text}</span>{notice?.undo && <Button variant="link" onClick={() => void bringBack(notice.undo as string)}>{v("action_undo")}</Button>}</div>
    {rulesOpen && createPortal(<RulesDialog data={data} home={home} language={language} busy={busy} editor={editor} movePick={movePick} placePick={placePick} savedBar={savedBar} v={v} onEditor={(value) => { setSavedBar(false); setMovePick(null); setPlacePick([]); setEditor(value); }} onMove={setMovePick} onPlace={(value) => setPlacePick([value])} onPlaceAny={() => setPlacePick([])} onSaveBar={() => void saveBar()} onComment={(id, accept) => void answerComment(id, accept)} onRemove={(id) => void removeRule(id)} onReset={() => void resetRules()} onClose={closeRules} />, document.body)}
  </section>;
}

function TodayView({ active, compact, decliningId, data, busy, v, language, onPromote, onDeclineStart, onDecide, onDecline, onRender }: { active: QueueCard | null; compact: QueueCard[]; decliningId: string | null; data: QueueData; busy: boolean; v: Vocab; language: Lang; onPromote: (id: string) => void; onDeclineStart: (id: string | null) => void; onDecide: (card: QueueCard, action: "right" | "later") => Promise<void>; onDecline: (card: QueueCard, scope: string | null, value: string | null, truth: string | null) => Promise<void>; onRender: (card: QueueCard, node: HTMLElement | null) => void }) {
  if (!active) return <QuietDay data={data} v={v} language={language} />;
  return <section className="oe-stack" aria-label={v("today_stack_aria")}>
    <article ref={(node) => onRender(active, node)} className="oe-full-card"><OpportunityDetail card={active} declining={decliningId === active.id} busy={busy} v={v} language={language} onDeclineStart={() => onDeclineStart(active.id)} onDeclineBack={() => onDeclineStart(null)} onDecide={(action) => onDecide(active, action)} onDecline={(scope, value, truth) => onDecline(active, scope, value, truth)} /></article>
    {compact.length > 0 && <div className="oe-next-list">{compact.map((card) => <Button key={card.id} variant="ghost" className="oe-next-row" onClick={() => onPromote(card.id)}><span><strong>{card.title}</strong><small>{[card.issuer_name, card.location, card.level_direction ? v(`leveldir_${card.level_direction}`) : null].filter(Boolean).join(" · ")}</small></span><time style={mono}>{card.deadline ? dateText(card.deadline, language) : v("stack_no_closing_date")}</time></Button>)}</div>}
  </section>;
}
function QuietDay({ data, v, language }: { data: QueueData; v: Vocab; language: Lang }) {
  const quiet = data.quiet_day;
  return <AuraCard hover="none" className="oe-empty"><h2>{v("quiet_title")}</h2><p>{fill(v("quiet_body"), { sources: quiet?.surfaces_read ?? 0, findings: quiet?.findings ?? 0 })}</p><p>{v("quiet_none_cleared")}</p>{quiet?.from_date && quiet.to_date && <p className="oe-window-line" style={mono}>{fill(v("quiet_window"), { from: dateText(quiet.from_date, language), to: dateText(quiet.to_date, language) })}</p>}{data.window?.expected_by && <p className="oe-window-line" style={mono}>{fill(v(data.window.missed ? "window_missed" : "window_expected"), { date: dateText(data.window.expected_by, language) })}</p>}</AuraCard>;
}
function Aside({ data, language, v, heldOpen, onHeld, onRules }: { data: QueueData; language: Lang; v: Vocab; heldOpen: boolean; onHeld: () => void; onRules: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  const places = data.filters.place?.values ?? [];
  const place = places.length ? places.map((value) => value.startsWith("region:") ? refLabel("region", value.slice(7), language) : refLabel("place", value, language)).join(" · ") : v("move_place_any");
  return <aside className="oe-side">
    <section className="oe-held-panel"><span>{v("held_back_title")}</span><strong style={mono}>{data.held_count}</strong><Button variant="link" onClick={onHeld}>{v(heldOpen ? "held_hide_why" : "held_see_why")}</Button>{heldOpen && <div style={{ maxHeight: 300, overflowY: "auto" }}>{data.held.map((row) => <p key={row.id}><b>{row.title ?? v("settings_untitled")}</b><span>{v(heldReasonKey[String(row.reason ?? "")] ?? "settings_held_reason") || `${v("settings_held_reason")}: ${String(row.reason ?? "").split("_").join(" ")}`}</span></p>)}</div>}</section>
    <section className="oe-bar-panel"><div><span>{v("current_bar_title")}</span><Button variant="link" onClick={onRules}>{v("action_change")}</Button></div><p><strong>{v("settings_move")}</strong><span>{data.direction?.move_kind ? v(moveKey(data.direction.move_kind)) : v("settings_not_set")}</span></p><p><strong>{v("settings_place")}</strong><span>{place}</span></p></section>
  </aside>;
}
function CardSummary({ card, v }: { card: QueueCard; v: Vocab }) {
  const state = card.access_state ? v(`state_${card.access_state}`) : v("group_open_now");
  return <><div className={`oe-state${card.clock_text ? " oe-state-clock" : " oe-state-act"}`}><span aria-hidden />{state}{card.clock_text && <em>{card.clock_text}</em>}</div><h2>{card.title}</h2><p className="oe-meta">{[card.issuer_name, card.location, card.level_direction ? v(`leveldir_${card.level_direction}`) : null].filter(Boolean).join(" · ")}</p></>;
}
function OpportunityDetail({ card, declining, busy, v, language, onDeclineStart, onDeclineBack, onDecide, onDecline }: { card: QueueCard; declining: boolean; busy: boolean; v: Vocab; language: Lang; onDeclineStart: () => void; onDeclineBack: () => void; onDecide: (action: "right" | "later") => Promise<void>; onDecline: (scope: string | null, value: string | null, truth: string | null) => Promise<void> }) {
  const taste: Array<[string, string, string | null]> = [["taste_level", "level", card.level_band], ["taste_sector", "sector", card.sector], ["taste_issuer", "issuer", card.issuer_id], ["taste_place", "place", card.location], ["taste_just_this", "just_this", card.opportunity_id]];
  const truths = ["dead_route", "quote_absent", "listing_page", "already_happened", "wrong_issuer"];
  const checked = checkedAt(card);
  const interestLine = Number(card.interest?.captures ?? 0) > 0 && card.interest?.since ? fill(v("line_interest"), { n: Number(card.interest?.captures ?? 0), date: dateText(String(card.interest.since), language) }) : null;
  const standingLine = card.level_direction ? fill(v("line_standing"), { direction: v(`leveldir_${card.level_direction}`), tier: v(`tier_${card.employer_tier ?? "unknown"}`) }) : null;
  const door = card.cost_of_door ? fill(v(language === "ar" ? "door_cost_ar" : "door_cost_en"), { cost: card.cost_of_door }) : v(`door_${doorClass(card.route_url ?? card.source_url)}`);
  return <div className="oe-card-detail"><div className="oe-detail-title"><CardSummary card={card} v={v} /></div><div className="oe-why-more">{(card.why_lines ?? []).map((line, index) => <p key={index}><span className="oe-dot-evidence" aria-hidden />{line.text}</p>)}{card.presentation_line && <p><span className="oe-dot-rule" aria-hidden />{card.presentation_line}</p>}{interestLine && <p><span className="oe-dot-evidence" aria-hidden />{interestLine}</p>}{standingLine && <p><span className="oe-dot-rule" aria-hidden />{standingLine}</p>}{card.gap_line?.text && <p className="oe-risk"><span className="oe-dot-risk" aria-hidden /><strong>{v("gap_prefix")}</strong> {card.gap_line.text}</p>}{card.quote && <blockquote>“{card.quote}” {card.source_url && <a href={card.source_url} target="_blank" rel="noreferrer">{v("card_source")}</a>}</blockquote>}{checked && <p className="oe-checked" style={mono}>{fill(v("card_checked"), { date: dateText(checked, language) })}</p>}</div><p className="oe-door-cost"><span aria-hidden />{door}</p>{!declining ? <div className={`oe-actions${language === "ar" ? " is-rtl" : ""}`}><AuraButton onClick={() => void onDecide("right")} loading={busy}>{v("action_go")}</AuraButton><div><AuraButton variant="ghost" onClick={() => void onDecide("later")} disabled={busy}>{v("action_later")}</AuraButton><AuraButton variant="ghost" onClick={onDeclineStart} disabled={busy}>{v("action_not_for_me")}</AuraButton></div></div> : <div className="oe-decline"><div><h3>{v("decline_title")}</h3><div className="oe-chip-row">{taste.filter((entry) => Boolean(entry[2])).map(([key, scope, value]) => <Button key={key} variant="outline" disabled={busy} onClick={() => void onDecline(scope, value, null)}>{v(key)}</Button>)}</div></div><div><h3>{v("decline_truth_title")}</h3><div className="oe-chip-row">{truths.map((truth) => <Button key={truth} variant="outline" disabled={busy} onClick={() => void onDecline(null, null, truth)}>{v(`truth_${truth}`)}</Button>)}</div></div><Button variant="link" onClick={onDeclineBack}>{v("action_back")}</Button></div>}</div>;
}
function ParkedView({ rows, busy, v, language, onBringBack }: { rows: Parked[]; busy: boolean; v: Vocab; language: Lang; onBringBack: (id: string) => void }) {
  return <section className="oe-view oe-view-narrow"><SectionHeader label={v("view_parked")} />{rows.length ? <div className="oe-parked-list">{rows.map((row) => <article key={row.opportunity_id} className="oe-parked-row"><div><h2>{row.title}</h2><p>{[row.issuer_name, row.location].filter(Boolean).join(" · ")}</p><small style={mono}>{fill(v("parked_on"), { date: dateText(row.parked_at, language) })}{row.deadline ? ` · ${fill(v("parked_closes"), { date: dateText(row.deadline, language) })}` : ""}</small></div><AuraButton variant="ghost" disabled={busy} onClick={() => onBringBack(row.opportunity_id)}>{v("action_bring_back")}</AuraButton></article>)}</div> : <p className="oe-empty-copy">{v("parked_empty")}</p>}</section>;
}
function HistoryView({ rows, filter, v, language, onFilter }: { rows: History[]; filter: HistoryFilter; v: Vocab; language: Lang; onFilter: (filter: HistoryFilter) => void }) {
  const filtered = rows.filter((row) => filter === "all" || filter === "right" && row.tap === "right" || filter === "declined" && row.tap === "not_my_area" && !row.truth_code || filter === "flagged" && Boolean(row.truth_code));
  const groups = new Map<string, History[]>(); filtered.forEach((row) => { const key = dayKey(row.shown_at); groups.set(key, [...(groups.get(key) ?? []), row]); });
  return <section className="oe-view oe-view-narrow"><SectionHeader label={v("view_history")} /><div className="oe-filter-row">{(["all", "right", "declined", "flagged"] as HistoryFilter[]).map((value) => <Button key={value} variant="outline" aria-pressed={filter === value} onClick={() => onFilter(value)}>{v(`history_filter_${value}`)}</Button>)}</div>{groups.size ? Array.from(groups.entries()).map(([day, dayRows]) => <section key={day} className="oe-history-day"><h3 style={mono}>{dateText(day, language)}</h3>{dayRows.map((row, index) => <article key={`${day}-${index}`} className="oe-history-row"><p><span>{v("history_shown")}</span><strong>{row.title ?? v("history_untitled")}</strong><small>{[row.issuer_name, row.location].filter(Boolean).join(" · ")}</small>{row.presentation_line && <small className="oe-history-line">{row.presentation_line}</small>}</p><p><span>{v("history_decided")}</span>{historyDecision(row, v)}</p><p><span>{v("history_happened")}</span>{historyOutcome(row, v)}</p></article>)}</section>) : <p className="oe-empty-copy">{v("history_empty")}</p>}</section>;
}

function RulesDialog({ data, home, language, busy, editor, movePick, placePick, savedBar, v, onEditor, onMove, onPlace, onPlaceAny, onSaveBar, onComment, onRemove, onReset, onClose }: { data: QueueData; home: Home | null; language: Lang; busy: boolean; editor: "move" | "place" | null; movePick: MoveKind | null; placePick: string[]; savedBar: boolean; v: Vocab; onEditor: (value: "move" | "place" | null) => void; onMove: (value: MoveKind) => void; onPlace: (value: string) => void; onPlaceAny: () => void; onSaveBar: () => void; onComment: (id: string, accept: boolean) => void; onRemove: (id: string) => void; onReset: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [allComments, setAllComments] = useState(false);
  const [allRules, setAllRules] = useState(false);
  const comments = allComments ? data.comments : data.comments.slice(0, 1);
  const hiddenComments = Math.max(0, data.comments.length - comments.length);
  const allActiveRules = data.rules.filter((rule) => rule.active);
  const activeRules = allRules ? allActiveRules : allActiveRules.filter((_, index) => index < 3);
  const hiddenRules = Math.max(0, allActiveRules.length - activeRules.length);
  const places = data.filters.place?.values ?? [];
  const placeRule = data.rules.find((rule) => rule.active && rule.field === "place") ?? null;
  const placeText = places.length ? places.map((value) => value.startsWith("region:") ? refLabel("region", value.slice(7), language) : refLabel("place", value, language)).join(" · ") : v("move_place_any");
  const homeChoice = home?.city && home.country ? { value: home.country, label: fill(v("move_place_home"), { city: home.city }) } : null;
  const homeRegion = home?.regions?.[0];
  const regionChoice = homeRegion ? { value: `region:${homeRegion.code}`, label: fill(v("move_place_region"), { region: language === "ar" ? (homeRegion.name_ar || homeRegion.name_en) : homeRegion.name_en }) } : null;
  const choices: Array<{ value: string; label: string }> = [homeChoice, regionChoice].filter((choice): choice is { value: string; label: string } => Boolean(choice));
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
    <section className="oe-dialog-section"><h3>{v("rules_bar_title")}</h3><div className="oe-dialog-row"><div><strong>{v("settings_move")}</strong><span>{data.direction?.move_kind ? v(moveKey(data.direction.move_kind)) : v("settings_not_set")}</span>{data.direction?.move_confirmed_at && <small style={mono}>{fill(v("rules_set_on"), { date: dateText(data.direction.move_confirmed_at, language) })} · {fill(v("rules_ask_again"), { date: dateText(new Date(new Date(data.direction.move_confirmed_at).getTime() + 90 * 86_400_000).toISOString(), language) })}</small>}</div><Button variant="link" onClick={() => onEditor("move")}>{v("action_change")}</Button></div><div className="oe-dialog-row"><div><strong>{v("settings_place")}</strong><span>{placeText}</span>{placeRule && <small style={mono}>{fill(v("rules_set_on"), { date: dateText(placeRule.stated_on, language) })} · {fill(v("rules_ask_again"), { date: dateText(new Date(new Date(placeRule.stated_on).getTime() + 90 * 86_400_000).toISOString(), language) })}</small>}</div><Button variant="link" onClick={() => onEditor("place")}>{v("action_change")}</Button></div>
      {editor === "move" && <div className="oe-inline-editor">{moves.map((move) => <Button key={move} variant="outline" aria-pressed={movePick === move} className={`${data.direction?.move_proposed === move ? "is-proposed" : ""}`} onClick={() => onMove(move)}>{v(moveKey(move))}</Button>)}<AuraButton disabled={!movePick} loading={busy} onClick={onSaveBar}>{v("save")}</AuraButton></div>}
      {editor === "place" && <div className="oe-inline-editor">{choices.map((place) => <Button key={place.value} variant="outline" aria-pressed={placePick.includes(place.value)} onClick={() => onPlace(place.value)}>{place.label}</Button>)}<Button variant="outline" aria-pressed={placePick.length === 0} onClick={onPlaceAny}>{v("move_place_any")}</Button><AuraButton loading={busy} onClick={onSaveBar}>{v("save")}</AuraButton></div>}
      {savedBar && <p role="status">{v("rules_saved") || v("gap_answer_saved")}</p>}
    </section>
    <section className="oe-dialog-section"><h3>{v("rules_comments_title")}</h3>{comments.length ? <>{comments.map((comment) => <div className="oe-comment" key={comment.id}><blockquote dir="auto">“{language === "ar" && comment.text_ar ? comment.text_ar : comment.text}”</blockquote><time style={mono}>{dateText(comment.said_on, language)}</time><div><AuraButton size="sm" loading={busy} onClick={() => onComment(comment.id, true)}>{v("rules_make_rule")}</AuraButton><AuraButton size="sm" variant="ghost" disabled={busy} onClick={() => onComment(comment.id, false)}>{v("proposal_no")}</AuraButton></div></div>)}{hiddenComments > 0 && <Button variant="link" style={mono} onClick={() => setAllComments(true)}>{fill(v("rules_more"), { n: hiddenComments })}</Button>}</> : <p>{v("rules_comments_empty")}</p>}</section>
    <section className="oe-dialog-section"><h3>{v("rules_active_title")}</h3>{activeRules.length ? activeRules.map((rule) => <div key={rule.id} className="oe-dialog-row"><span>{readableRule(rule, language, v)}</span><Button variant="link" disabled={busy} onClick={() => onRemove(rule.id)}>{v("rules_remove")}</Button></div>) : <p>{v("rules_active_empty")}</p>}{hiddenRules > 0 && <Button variant="link" style={mono} onClick={() => setAllRules(true)}>{fill(v("rules_more"), { n: hiddenRules })}</Button>}<Button variant="link" disabled={busy || allActiveRules.length === 0} onClick={onReset}>{v("rules_start_again") || v("rules_remove")}</Button></section>
    <footer><p>{v("rules_private")}</p><div><Button variant="outline" onClick={onClose}>{v("sheet_close")}</Button></div></footer>
  </section></div>;
}

export default OpportunityQueue;