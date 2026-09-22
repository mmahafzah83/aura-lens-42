import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { AuraCard } from "@/components/ui/AuraCard";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useVocab } from "./useVocab";
import { doorClass, loadRefLabels, ordinal, refLabel } from "./refLabels";
import { FiltersSection, SuggestedRules, type FilterMap } from "./FiltersSection";

/**
 * ONE TAB, FOUR VIEWS, AND NOT ONE WORD WRITTEN HERE.
 *
 * Every label, sentence and button on this screen comes from
 * public.oe_vocabulary in the member's own language, and the reading
 * direction follows that language. A string typed into this file would be a
 * word only one language could read.
 */

type WhyLine = { text?: string; label?: string };
type AccessState = "observed_event" | "possible_need" | "confirmed_opportunity" | "identified_route";
type Lang = "en" | "ar";
type QueueCard = {
  id: string; opportunity_id: string; lane: "act" | "write"; why_lines: WhyLine[] | null;
  gap_line: WhyLine | null; quote: string | null; clock_text: string | null; title: string;
  level_band: string | null; sector: string | null; location: string | null; scope: string | null; deadline: string | null;
  source_url: string | null; route_url: string | null; issuer_id: string | null; issuer_name: string | null;
  last_checked: string | null; rule_count: number; access_state: AccessState | null; cost_of_door: string | null;
  presentation_line?: string | null; quote_verified_at?: string | null; route_checked_at?: string | null;
  /** Ranking only — a fact about him, never proof of capability. */
  interest?: { score?: number; captures?: number; since?: string | null; terms?: string[] } | null;
  level_direction?: string | null; employer_tier?: string | null;
};
type Parked = { opportunity_id: string; title: string; issuer_name: string | null; location: string | null; deadline: string | null; parked_at: string };
type Priority = "bigger_seat" | "known_for_one" | "new_rooms" | "out_of_sector" | "stay_current";
type Mix = "win" | "build" | "explore";
type Goal = "income_from_expertise" | "advancement" | "visibility" | "relationships" | "knowledge";
type Direction = { priority: Priority | null; priority_set_on: string | null; priority_expires_at: string | null; mix: Mix | null; mix_set_on: string | null; goal: Goal | null; goal_secondary: Goal[] | null; goal_proposed: Goal | null; goal_confirmed_at: string | null; goal_expires_at: string | null; language: Lang | null };
type Window = { expected_by: string; declared_on: string | null; missed: boolean };
type Derivation = { comments?: Array<{ id?: string; text?: string; said_on?: string }>; profile?: string[]; legal_basis?: string };
type Rule = { id: string; kind: "hard" | "soft"; rule_text: string; field: string | null; value: string | null; stated_on: string; active?: boolean; derived_from?: Derivation | null };
type Held = { id: string; day: string; reason: string | null; title: string | null };
type History = { shown_at: string; lane: string | null; tap: string | null; tap_scope: string | null; truth_code: string | null; outcome: string | null; title: string | null; issuer_name: string | null; location: string | null; presentation_line: string | null };
type DueOutcome = { id: string; title: string | null };
type Metrics = { sources_read: number; organisations: number; judged_week: number; survived: number; shown: number; first_card_expected: string | null };
type Proposed = { id: string; rule_text: string; field: string | null };
type AlsoKind = { kind: string; label: string; count: number };
type Reading = { running: boolean; last_read_at: string | null };
type QueueData = { cards: QueueCard[]; parked: Parked[]; surface_count: number; entity_count: number; rule_count: number; held_count: number; direction: Direction | null; window: Window | null; rules: Rule[]; held: Held[]; history: History[]; due_outcomes: DueOutcome[]; metrics: Metrics | null; filters: FilterMap; proposed_rules: Proposed[]; also_watching: number; also_watching_kinds: AlsoKind[]; reading: Reading | null; card_kinds: string[] };
type View = "today" | "parked" | "history" | "settings";
type DirectionStep = "renew" | "goal" | "secondary" | "priority" | "mix" | "done";
type HistoryFilter = "all" | "right" | "declined" | "flagged";
type Vocab = ReturnType<typeof useVocab>;

const emptyData: QueueData = { cards: [], parked: [], surface_count: 0, entity_count: 0, rule_count: 0, held_count: 0, direction: null, window: null, rules: [], held: [], history: [], due_outcomes: [], metrics: null, filters: {}, proposed_rules: [], also_watching: 0, also_watching_kinds: [] };
const priorities: Priority[] = ["bigger_seat", "known_for_one", "new_rooms", "out_of_sector", "stay_current"];
const mixes: Mix[] = ["win", "build", "explore"];
const goals: Goal[] = ["income_from_expertise", "advancement", "visibility", "relationships", "knowledge"];

const mono = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" } as const;
const chipBase = { minHeight: 44, padding: "8px 11px", borderRadius: 4, border: "1px solid var(--border-default)", background: "var(--surface-card)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 } as const;
const ARIA_CURRENT = "page" as const;
const validViews = new Set<View>(["today", "parked", "history", "settings"]);
const dayKey = (value: string) => String(value).slice(0, 10);
/** A date a member reads — never the machine's own form. */
const displayDay = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
/** Dates read "21 Sep 2026" — three letters, never ISO, never "Sept". */
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateText = (value: string) => {
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const fill = (text: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, val]) => acc.split(`{${k}}`).join(String(val)), text);
const hasWhy = (card: QueueCard) => (card.why_lines ?? []).some((line) => String(line.text ?? "").trim());
const isClosing = (card: QueueCard) => Boolean(card.clock_text) || Boolean(card.deadline && new Date(`${card.deadline}T23:59:59Z`).getTime() <= Date.now() + 14 * 86_400_000);
/** The latest moment anything on this card was checked against its page. */
const checkedAt = (card: QueueCard) =>
  [card.quote_verified_at, card.route_checked_at, card.last_checked]
    .filter(Boolean).map(String).sort().slice(-1)[0] ?? null;

function historyDecision(row: History, v: Vocab) {
  if (!row.tap) return v("history_no_decision");
  if (row.tap === "right") return row.lane === "write" ? v("history_drafted") : v("history_went");
  if (row.tap === "later") return v("history_later");
  if (row.truth_code) return fill(v("history_flag_prefix"), { reason: v(`truth_reason_${row.truth_code}`) || v("history_flag_unknown") });
  return fill(v("history_not_for_you"), { reason: row.tap_scope ? (v(`scope_${row.tap_scope}`) || v("history_not_a_fit")) : v("history_no_reason") });
}
/** His record speaks of him; a line shown to him speaks to him. */
const youText = (text: string) => String(text ?? "")
  .replace(/\bhe does not\b/gi, "you do not").replace(/\bhe has\b/gi, "you have")
  .replace(/\bhe is\b/gi, "you are").replace(/\bhe was\b/gi, "you were")
  .replace(/\bhis\b/gi, "your").replace(/\bhimself\b/gi, "yourself")
  .replace(/\bhim\b/gi, "you").replace(/\bhe\b/gi, "you");

function historyOutcome(row: History, v: Vocab) {
  if (row.outcome) return v(`outcome_said_${row.outcome}`) || v("outcome_recorded");
  return row.tap === "right" ? v("outcome_not_yet") : v("outcome_none_expected");
}

export function OpportunityQueue() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get("view") as View | null;
  const view: View = requested && validViews.has(requested) ? requested : "today";
  const [userId, setUserId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Lang>("en");
  const [data, setData] = useState<QueueData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; undo?: string } | null>(null);
  const [proposal, setProposal] = useState<{ id: string; count: number; field: string; value: string } | null>(null);
  const [proposalShown, setProposalShown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState("");
  const rawFilter = params.get("f") as HistoryFilter | null;
  const historyFilter: HistoryFilter = rawFilter && ["all", "right", "declined", "flagged"].includes(rawFilter) ? rawFilter : "all";

  const [sheetOpen, setSheetOpen] = useState(false);
  const [directionStep, setDirectionStep] = useState<DirectionStep>("goal");
  const [directionChoice, setDirectionChoice] = useState<Goal | Priority | Mix | null>(null);
  const [primaryGoal, setPrimaryGoal] = useState<Goal | null>(null);
  const [secondaryGoals, setSecondaryGoals] = useState<Set<Goal>>(new Set());
  const [showAllHeld, setShowAllHeld] = useState(false);
  const renderedRef = useRef<Set<string>>(new Set());
  const noticeTimer = useRef<number | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const v = useVocab(language);
  const t = (key: string, fallback: string) => v(key) || fallback;
  const rtl = language === "ar";

  const setView = (next: View) => { const copy = new URLSearchParams(params); next === "today" ? copy.delete("view") : copy.set("view", next); if (next !== "history") copy.delete("f"); setParams(copy); };
  const setHistoryFilter = (next: HistoryFilter) => { const copy = new URLSearchParams(params); copy.set("view", "history"); next === "all" ? copy.delete("f") : copy.set("f", next); setParams(copy); };

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setLoading(false); return; }
    const { data: payload, error } = await supabase.rpc("oe_app_queue" as never);
    const next = (!error && payload) ? { ...emptyData, ...(payload as unknown as QueueData) } : emptyData;
    // English unless he has chosen Arabic for this tab himself.
    setLanguage(next.direction?.language === "ar" ? "ar" : "en");
    if (!error && payload) setData(next);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); void loadRefLabels(); }, [load]);
  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);
  useEffect(() => {
    if (!sheetOpen) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSheetOpen(false); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = old; window.removeEventListener("keydown", close); };
  }, [sheetOpen]);

  const cards = data.cards.filter(hasWhy);
  const groups = useMemo(() => {
    const closing = cards.filter(isClosing);
    const used = new Set(closing.map((card) => card.id));
    const act = cards.filter((card) => card.lane === "act" && !used.has(card.id)); act.forEach((card) => used.add(card.id));
    const write = cards.filter((card) => card.lane === "write" && !used.has(card.id)); write.forEach((card) => used.add(card.id));
    const happened = cards.filter((card) => !used.has(card.id) && (card.access_state === "observed_event" || card.access_state === "possible_need"));
    return [
      { key: "closing", labelKey: "group_closing", tone: "clock", cards: closing },
      { key: "act", labelKey: "group_open_now", tone: "act", cards: act },
      { key: "write", labelKey: "group_write", tone: "write", cards: write },
      { key: "event", labelKey: "group_event", tone: "event", cards: happened },
    ].filter((group) => group.cards.length > 0);
  }, [cards]);
  const selected = cards.find((card) => card.id === selectedId) ?? null;
  const direction = data.direction;
  const today = new Date().toISOString().slice(0, 10);
  const goalExpired = Boolean(direction?.goal && direction.goal_expires_at && direction.goal_expires_at <= today);
  const directionIncomplete = !direction?.goal || !direction.priority || !direction.mix || goalExpired;
  const directionProgress = [Boolean(direction?.goal), Boolean(direction?.priority), Boolean(direction?.mix)];

  const showNotice = (text: string, undo?: string) => {
    setNotice({ text, undo });
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  };
  const refresh = async () => {
    if (refreshing) return; setRefreshing(true); setRefreshNote("");
    const { data: payload, error } = await supabase.rpc("oe_app_refresh" as never);
    const result = payload as { ok?: boolean; retry_after_seconds?: number } | null;
    if (error) setRefreshNote(v("queue_refresh_failed"));
    else if (result?.ok === false) setRefreshNote(fill(v("queue_refresh_wait"), { n: Number(result.retry_after_seconds ?? 60) }));
    else { renderedRef.current.clear(); await load(); }
    setRefreshing(false);
  };
  const markRendered = useCallback((card: QueueCard, node: HTMLElement | null) => {
    cardRefs.current[card.id] = node;
    if (!node || renderedRef.current.has(card.id)) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || renderedRef.current.has(card.id)) return;
      renderedRef.current.add(card.id);
      void supabase.rpc("oe_app_render" as never, { p_card: card.opportunity_id } as never);
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(node);
  }, []);
  const selectCard = (card: QueueCard) => {
    const next = selectedId === card.id ? null : card.id;
    setSelectedId(next); setDecliningId(null);
    if (next) window.setTimeout(() => cardRefs.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 20);
  };
  const bringBack = async (opportunityId: string, returnToToday = false) => {
    if (busy) return; setBusy(true);
    const { data: raw } = await supabase.rpc("oe_app_decide" as never, { p_card: opportunityId, p_action: "bring_back" } as never);
    setBusy(false);
    if ((raw as { ok?: boolean } | null)?.ok) { setNotice(null); await load(); if (returnToToday) setView("today"); }
  };
  const decide = async (card: QueueCard, action: "right" | "later") => {
    if (busy) return; setBusy(true);
    const { data: raw } = await supabase.rpc("oe_app_decide" as never, { p_card: card.opportunity_id, p_action: action } as never);
    setBusy(false);
    if (!(raw as { ok?: boolean } | null)?.ok) return;
    if (action === "later") { setData((current) => ({ ...current, cards: current.cards.filter((item) => item.id !== card.id), parked: [{ opportunity_id: card.opportunity_id, title: card.title, issuer_name: card.issuer_name, location: card.location, deadline: card.deadline, parked_at: new Date().toISOString() }, ...current.parked] })); setSelectedId(null); showNotice(v("toast_later"), card.opportunity_id); return; }
    showNotice(v("toast_go"));
    if (card.lane === "write") navigate(`/studio?opportunity=${card.opportunity_id}`);
    else { const destination = card.route_url ?? card.source_url; if (destination) window.open(destination, "_blank", "noopener,noreferrer"); await load(); }
  };
  const decline = async (card: QueueCard, scope: string | null, value: string | null, truth: string | null) => {
    if (busy) return; setBusy(true);
    const { data: raw } = await supabase.rpc("oe_app_decide" as never, { p_card: card.opportunity_id, p_action: "not_quite", p_scope: scope, p_scope_value: value, p_truth: truth } as never);
    setBusy(false);
    const result = raw as { ok?: boolean; proposal_id?: string; declines?: number } | null;
    if (!result?.ok) return;
    showNotice(v("toast_declined")); setSelectedId(null); setDecliningId(null);
    if (result.proposal_id && !proposalShown) { setProposal({ id: String(result.proposal_id), count: Number(result.declines ?? 3), field: scope ?? "", value: value ?? "" }); setProposalShown(true); }
    await load();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!selected || sheetOpen || target?.closest("input, textarea, select, button, [contenteditable='true']")) return;
      if (event.key === "1") void decide(selected, "right");
      if (event.key === "2") void decide(selected, "later");
      if (event.key === "3") setDecliningId(selected.id);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [selected, sheetOpen, busy]);

  const openDirection = (step?: DirectionStep) => { setDirectionChoice(null); setPrimaryGoal(null); setSecondaryGoals(new Set(direction?.goal_secondary ?? [])); setDirectionStep(step ?? (goalExpired ? "renew" : !direction?.goal ? "goal" : !direction.priority ? "priority" : "mix")); setSheetOpen(true); };
  const deferDirection = async () => { if (busy) return; setBusy(true); await supabase.rpc(directionStep === "goal" || directionStep === "renew" ? "oe_goal_save" as never : "oe_direction_save" as never, { p_defer: true } as never); setBusy(false); setSheetOpen(false); await load(); };
  const nextDirection = async () => {
    if (busy) return;
    if (directionStep === "goal") { if (!directionChoice) return; setBusy(true); const goal = directionChoice as Goal; const { error } = await supabase.rpc("oe_goal_save" as never, { p_goal: goal } as never); setBusy(false); if (!error) { setPrimaryGoal(goal); setDirectionChoice(null); setDirectionStep("secondary"); } return; }
    if (directionStep === "secondary") { const goal = primaryGoal ?? direction?.goal; if (!goal) return; setBusy(true); const { error } = await supabase.rpc("oe_goal_save" as never, { p_goal: goal, p_secondary: Array.from(secondaryGoals) } as never); setBusy(false); if (!error) { setDirectionChoice(null); setDirectionStep("priority"); await load(); } return; }
    if (directionStep === "priority") { if (!directionChoice) return; setBusy(true); const { error } = await supabase.rpc("oe_direction_save" as never, { p_priority: directionChoice } as never); setBusy(false); if (!error) { setDirectionChoice(null); setDirectionStep("mix"); await load(); } return; }
    if (directionStep === "mix") { if (!directionChoice) return; setBusy(true); const { error } = await supabase.rpc("oe_direction_save" as never, { p_mix: directionChoice } as never); setBusy(false); if (!error) { setDirectionChoice(null); setDirectionStep("done"); await load(); } }
  };
  const reconfirm = async () => { if (!direction?.goal || busy) return; setBusy(true); await supabase.rpc("oe_goal_save" as never, { p_goal: direction.goal, p_secondary: direction.goal_secondary ?? null } as never); setBusy(false); setDirectionStep("done"); await load(); };
  const showAnyway = async (id: string) => { await supabase.rpc("oe_app_show_anyway" as never, { p_suppressed: id } as never); await load(); };
  const setTabLanguage = async (next: Lang) => { if (busy) return; setBusy(true); await supabase.rpc("oe_direction_save" as never, { p_language: next } as never); setBusy(false); setLanguage(next); await load(); };
  const answerOutcome = async (id: string, outcome: string) => { if (!userId) return; await supabase.from("oe_serves" as never).update({ outcome, outcome_at: new Date().toISOString() } as never).eq("id", id).eq("user_id", userId); await load(); };
  const answerProposal = async (accept: boolean) => { if (!proposal || busy) return; setBusy(true); await supabase.rpc("oe_app_proposal" as never, { p_id: proposal.id, p_accept: accept } as never); setBusy(false); setProposal(null); await load(); };

  const metrics: Array<[string, number | string]> = [
    ["metric_sources_read", data.metrics?.sources_read ?? data.surface_count],
    ["metric_organisations", data.metrics?.organisations ?? data.entity_count],
    ["metric_judged_week", data.metrics?.judged_week ?? 0],
    ["metric_survived", data.metrics?.survived ?? 0],
    ["metric_shown", data.metrics?.shown ?? 0],
  ];

  return <section className="oe-queue" dir={rtl ? "rtl" : "ltr"} lang={language} aria-busy={loading}>
    <header className="oe-queue-header">
      <div className="oe-header-top">
        <div>
          <SectionHeader label={v("queue_eyebrow")} />
          {view === "today" && cards.length > 0 && <p>{fill(v(cards.length === 1 ? "queue_today_one" : "queue_today_many"), { n: cards.length })}</p>}
        </div>
        <dl className="oe-metrics">
          {metrics.map(([key, value]) => <div key={key}><dt>{v(key)}</dt><dd style={mono}>{value}</dd></div>)}
          {data.also_watching > 0 && <div title={`${v("also_watching_tooltip")}: ${(data.also_watching_kinds ?? []).map((row) => `${row.label} ${row.count}`).join(" · ")}`}><dt>{v("metric_also_watching")}</dt><dd style={mono}>{data.also_watching}</dd></div>}
          {data.metrics?.first_card_expected && <div><dt>{v("metric_first_card_expected")}</dt><dd style={mono}>{dateText(data.metrics.first_card_expected)}</dd></div>}
        </dl>
      </div>
      <div className="oe-machine-line"><span className={`oe-machine-dot${refreshing ? " oe-machine-dot-working" : ""}`} aria-hidden /><span>{refreshing ? v("machine_looking_again") : v("machine_still_reading")}</span><button type="button" className="v23-textlink oe-refresh" onClick={() => void refresh()} disabled={refreshing || loading}>{refreshing ? v("action_refreshing") : v("action_refresh")}</button></div>
      {refreshNote && <p className="oe-refresh-note">{refreshNote}</p>}
    </header>

    <nav className="oe-segments" aria-label={v("nav_aria")}>{(["today", "parked", "history", "settings"] as View[]).map((item) => <button key={item} type="button" aria-current={view === item ? ARIA_CURRENT : undefined} onClick={() => setView(item)}><span>{v(`view_${item}`)}</span>{item === "today" && cards.length > 0 && <b>{cards.length}</b>}{item === "parked" && data.parked.length > 0 && <b>{data.parked.length}</b>}</button>)}</nav>

    {view === "today" && directionIncomplete && <button type="button" className="oe-setup-strip" onClick={() => openDirection()}><span><strong>{v("setup_title")}</strong><small>{direction?.goal ? v(!direction.priority ? "setup_sub_priority" : "setup_sub_mix") : v("setup_sub_full")}</small></span><span className="oe-progress" aria-label={fill(v("setup_progress_aria"), { done: directionProgress.filter(Boolean).length })}>{directionProgress.map((done, index) => <i key={index} className={done ? "is-set" : ""} />)}</span></button>}

    {proposal && <AuraCard hover="none" className="oe-proposal"><p><strong>{fill(v("proposal_headline"), { ordinal: ordinal(proposal.count, language), value: refLabel(proposal.field, proposal.value, language) })}</strong></p><p>{v("proposal_question")}</p><div className="oe-actions"><AuraButton onClick={() => void answerProposal(true)} loading={busy}>{v("proposal_yes")}</AuraButton><AuraButton variant="ghost" onClick={() => void answerProposal(false)}>{v("proposal_no")}</AuraButton></div></AuraCard>}

    {view === "today" && <TodayView groups={groups} selected={selected} decliningId={decliningId} data={data} busy={busy} v={v} language={language} onSelect={selectCard} onDeclineStart={setDecliningId} onDecide={decide} onDecline={decline} onRender={markRendered} onOutcome={answerOutcome} onSettings={() => setView("settings")} onHistory={() => setView("history")} />}
    {view === "parked" && <ParkedView rows={data.parked} busy={busy} v={v} onBringBack={(id) => void bringBack(id, true)} />}
    {view === "history" && <HistoryView rows={data.history} filter={historyFilter} v={v} onFilter={setHistoryFilter} />}
    {view === "settings" && <SettingsView data={data} showAllHeld={showAllHeld} language={language} v={v} t={t} onDirection={openDirection} onShowAllHeld={setShowAllHeld} onShowAnyway={showAnyway} onReload={load} onLanguage={setTabLanguage} />}

    <div className={`oe-toast${notice ? " is-visible" : ""}`} role="status" aria-live="polite"><span>{notice?.text}</span>{notice?.undo && <button type="button" onClick={() => void bringBack(notice.undo as string)}>{v("action_undo")}</button>}</div>
    {sheetOpen && createPortal(<DirectionSheet step={directionStep} direction={direction} choice={directionChoice} primaryGoal={primaryGoal} secondary={secondaryGoals} busy={busy} v={v} onChoice={setDirectionChoice} onSecondary={(goal) => setSecondaryGoals((current) => { const next = new Set(current); next.has(goal) ? next.delete(goal) : next.add(goal); return next; })} onNext={() => void nextDirection()} onBack={() => { setDirectionChoice(null); setDirectionStep(directionStep === "mix" ? "priority" : "goal"); }} onSkip={() => void deferDirection()} onClose={() => setSheetOpen(false)} onReconfirm={() => void reconfirm()} onChange={() => setDirectionStep("goal")} />, document.body)}
  </section>;
}

function TodayView({ groups, selected, decliningId, data, busy, v, language, onSelect, onDeclineStart, onDecide, onDecline, onRender, onOutcome, onSettings, onHistory }: { groups: Array<{ key: string; labelKey: string; tone: string; cards: QueueCard[] }>; selected: QueueCard | null; decliningId: string | null; data: QueueData; busy: boolean; v: Vocab; language: Lang; onSelect: (card: QueueCard) => void; onDeclineStart: (id: string | null) => void; onDecide: (card: QueueCard, action: "right" | "later") => Promise<void>; onDecline: (card: QueueCard, scope: string | null, value: string | null, truth: string | null) => Promise<void>; onRender: (card: QueueCard, node: HTMLElement | null) => void; onOutcome: (id: string, outcome: string) => Promise<void>; onSettings: () => void; onHistory: () => void }) {
  const cards = groups.flatMap((group) => group.cards);
  return <>
    {data.due_outcomes.length > 0 && <section className="oe-outcomes"><SectionHeader label={v("outcomes_header")} />{data.due_outcomes.map((due) => <div key={due.id} className="oe-outcome"><strong>{due.title}</strong><span>{v("outcome_question")}</span><div className="oe-chip-row">{["applied", "shortlisted", "won", "nothing"].map((value) => <button key={value} type="button" style={chipBase} onClick={() => void onOutcome(due.id, value)}>{v(`outcome_${value}`)}</button>)}</div></div>)}</section>}
    {cards.length > 0 ? <div className="oe-today-layout"><div className="oe-group-list">{groups.map((group) => <section key={group.key} className={`oe-group oe-group-${group.tone}`}><div className="oe-group-head"><SectionHeader label={v(group.labelKey)} /><b>{group.cards.length}</b></div>{group.cards.map((card) => <OpportunityItem key={card.id} card={card} selected={selected?.id === card.id} declining={decliningId === card.id} busy={busy} v={v} language={language} onSelect={() => onSelect(card)} onDeclineStart={() => onDeclineStart(card.id)} onDeclineBack={() => onDeclineStart(null)} onDecide={(action) => onDecide(card, action)} onDecline={(scope, value, truth) => onDecline(card, scope, value, truth)} onRender={(node) => onRender(card, node)} />)}</section>)}</div><div className="oe-detail-pane">{selected ? <OpportunityDetail card={selected} declining={decliningId === selected.id} busy={busy} v={v} language={language} onDeclineStart={() => onDeclineStart(selected.id)} onDeclineBack={() => onDeclineStart(null)} onDecide={(action) => onDecide(selected, action)} onDecline={(scope, value, truth) => onDecline(selected, scope, value, truth)} /> : <p>{v("detail_prompt")}</p>}</div></div>
    : <AuraCard hover="none" className="oe-empty"><h2>{v("empty_title")}</h2><p>{fill(v("empty_body"), { sources: data.surface_count, orgs: data.entity_count })}</p>{data.window?.expected_by && <p className="oe-window-line">{fill(v(data.window.missed ? "window_missed" : "window_expected"), { date: dateText(data.window.expected_by) })}</p>}<AuraButton onClick={onSettings}>{v("empty_review")}</AuraButton><button type="button" className="v23-textlink" onClick={onHistory}>{v("empty_history")}</button></AuraCard>}
    {selected && <p className="oe-key-legend" style={mono}>{v("key_legend")}</p>}
  </>;
}

function OpportunityItem({ card, selected, declining, busy, v, language, onSelect, onDeclineStart, onDeclineBack, onDecide, onDecline, onRender }: { card: QueueCard; selected: boolean; declining: boolean; busy: boolean; v: Vocab; language: Lang; onSelect: () => void; onDeclineStart: () => void; onDeclineBack: () => void; onDecide: (action: "right" | "later") => Promise<void>; onDecline: (scope: string | null, value: string | null, truth: string | null) => Promise<void>; onRender: (node: HTMLElement | null) => void }) {
  return <article ref={onRender} className={`oe-compact${selected ? " is-selected" : ""}`}><button type="button" className="oe-compact-trigger" aria-expanded={selected} onClick={onSelect}><CardSummary card={card} v={v} /></button>{selected && <div className="oe-mobile-detail"><OpportunityDetail card={card} declining={declining} busy={busy} v={v} language={language} onDeclineStart={onDeclineStart} onDeclineBack={onDeclineBack} onDecide={onDecide} onDecline={onDecline} /></div>}</article>;
}
function CardSummary({ card, v }: { card: QueueCard; v: Vocab }) {
  const lead = card.presentation_line ?? card.why_lines?.find((line) => String(line.text ?? "").trim())?.text ?? "";
  const state = card.access_state ? v(`state_${card.access_state}`) : v(card.lane === "act" ? "group_open_now" : "group_write");
  return <><div className={`oe-state oe-state-${isClosing(card) ? "clock" : card.lane}`}><span aria-hidden />{state}{card.clock_text && <em>{card.clock_text}</em>}</div><h2>{card.title}</h2><p className="oe-meta">{[card.issuer_name, card.location].filter(Boolean).join(" · ")}</p><p className="oe-lead">{lead}</p></>;
}
function OpportunityDetail({ card, declining, busy, v, language, onDeclineStart, onDeclineBack, onDecide, onDecline }: { card: QueueCard; declining: boolean; busy: boolean; v: Vocab; language: Lang; onDeclineStart: () => void; onDeclineBack: () => void; onDecide: (action: "right" | "later") => Promise<void>; onDecline: (scope: string | null, value: string | null, truth: string | null) => Promise<void> }) {
  const taste: Array<[string, string, string | null]> = [
    ["taste_level", "level", card.level_band], ["taste_sector", "sector", card.sector],
    ["taste_issuer", "issuer", card.issuer_id], ["taste_place", "place", card.location],
    ["taste_just_this", "just_this", card.opportunity_id],
  ];
  const truths = ["dead_route", "quote_absent", "listing_page", "already_happened", "wrong_issuer"];
  const checked = checkedAt(card);
  // Three layers, each its own line: proof, interest, standing. Never one number.
  const interestLine = Number(card.interest?.captures ?? 0) > 0 && card.interest?.since
    ? fill(v("line_interest"), { n: Number(card.interest!.captures), date: dateText(card.interest!.since) })
    : null;
  const standingLine = card.level_direction
    ? fill(v("line_standing"), { direction: v(`leveldir_${card.level_direction}`), tier: v(`tier_${card.employer_tier ?? "unknown"}`) })
    : null;
  const door = card.cost_of_door
    ? fill(v(language === "ar" ? "door_cost_ar" : "door_cost_en"), { cost: card.cost_of_door })
    : v(`door_${doorClass(card.route_url ?? card.source_url)}`);
  return <div className="oe-card-detail"><div className="oe-detail-title"><CardSummary card={card} v={v} /></div><div className="oe-why-more">{(card.why_lines ?? []).map((line, index) => <p key={index}><span className="oe-dot-evidence" aria-hidden />{line.text}</p>)}{card.presentation_line && <p><span className="oe-dot-rule" aria-hidden />{card.presentation_line}</p>}{interestLine && <p className="oe-interest"><span className="oe-dot-evidence" aria-hidden />{interestLine}</p>}{standingLine && <p className="oe-standing"><span className="oe-dot-rule" aria-hidden />{standingLine}</p>}{card.gap_line?.text && <p className="oe-risk"><span className="oe-dot-risk" aria-hidden /><strong>{v("gap_prefix")}</strong> {card.gap_line.text}</p>}{card.quote && <blockquote>“{card.quote}” {card.source_url && <a href={card.source_url} target="_blank" rel="noreferrer">{v("card_source")}</a>}</blockquote>}{checked && <p className="oe-checked" style={mono}>{fill(v("card_checked"), { date: dateText(checked) })}</p>}</div>{card.lane === "act" && <p className="oe-door-cost"><span aria-hidden />{door}</p>}{!declining ? <div className="oe-actions"><AuraButton onClick={() => void onDecide("right")} loading={busy}>{v(card.lane === "act" ? "action_go" : "action_draft")}</AuraButton><div><AuraButton variant="ghost" onClick={() => void onDecide("later")} disabled={busy}>{v("action_later")}</AuraButton><AuraButton variant="ghost" onClick={onDeclineStart} disabled={busy}>{v("action_not_for_me")}</AuraButton></div></div> : <div className="oe-decline"><div><h3>{v("decline_title")}</h3><div className="oe-chip-row">{taste.filter((entry) => Boolean(entry[2])).map(([labelKey, scope, value]) => <button key={labelKey} type="button" style={chipBase} disabled={busy} onClick={() => void onDecline(scope, value, null)}>{v(labelKey)}</button>)}</div></div><div><h3>{v("decline_truth_title")}</h3><div className="oe-chip-row">{truths.map((truth) => <button key={truth} type="button" className="oe-truth-chip" style={chipBase} disabled={busy} onClick={() => void onDecline(null, null, truth)}>{v(`truth_${truth}`)}</button>)}</div></div><button type="button" className="v23-textlink oe-back" onClick={onDeclineBack}>{v("action_back")}</button></div>}</div>;
}

function ParkedView({ rows, busy, v, onBringBack }: { rows: Parked[]; busy: boolean; v: Vocab; onBringBack: (id: string) => void }) {
  return <section className="oe-view oe-view-narrow"><SectionHeader label={v("view_parked")} />{rows.length ? <div className="oe-parked-list">{rows.map((row) => <article key={row.opportunity_id} className="oe-parked-row"><div><h2>{row.title}</h2><p>{[row.issuer_name, row.location].filter(Boolean).join(" · ")}</p><small style={mono}>{fill(v("parked_on"), { date: displayDay(row.parked_at) })}{row.deadline ? ` · ${fill(v("parked_closes"), { date: displayDay(row.deadline) })}` : ""}</small></div><AuraButton variant="ghost" disabled={busy} onClick={() => onBringBack(row.opportunity_id)}>{v("action_bring_back")}</AuraButton></article>)}</div> : <p className="oe-empty-copy">{v("parked_empty")}</p>}</section>;
}
function HistoryView({ rows, filter, v, onFilter }: { rows: History[]; filter: HistoryFilter; v: Vocab; onFilter: (filter: HistoryFilter) => void }) {
  const filtered = rows.filter((row) => filter === "all" || filter === "right" && row.tap === "right" || filter === "declined" && row.tap === "not_my_area" && !row.truth_code || filter === "flagged" && Boolean(row.truth_code));
  const groups = new Map<string, History[]>(); filtered.forEach((row) => { const key = dayKey(row.shown_at); groups.set(key, [...(groups.get(key) ?? []), row]); });
  return <section className="oe-view oe-view-narrow"><SectionHeader label={v("view_history")} /><div className="oe-filter-row">{(["all", "right", "declined", "flagged"] as HistoryFilter[]).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilter(value)}>{v(`history_filter_${value}`)}</button>)}</div>{groups.size ? Array.from(groups.entries()).map(([day, dayRows]) => <section key={day} className="oe-history-day"><h3 style={mono}>{displayDay(`${day}T12:00:00Z`)}</h3>{dayRows.map((row, index) => <article key={`${day}-${index}`} className="oe-history-row"><p><span>{v("history_shown")}</span><strong>{row.title ?? v("history_untitled")}</strong><small>{[row.issuer_name, row.location].filter(Boolean).join(" · ")}</small>{row.presentation_line && <small className="oe-history-line">{row.presentation_line}</small>}</p><p><span>{v("history_decided")}</span>{historyDecision(row, v)}</p><p><span>{v("history_happened")}</span>{historyOutcome(row, v)}</p></article>)}</section>) : <p className="oe-empty-copy">{v("history_empty")}</p>}</section>;
}

function SettingsView({ data, showAllHeld, language, v, t, onDirection, onShowAllHeld, onShowAnyway, onReload, onLanguage }: { data: QueueData; showAllHeld: boolean; language: Lang; v: Vocab; t: (key: string, fallback: string) => string; onDirection: (step: DirectionStep) => void; onShowAllHeld: (value: boolean) => void; onShowAnyway: (id: string) => Promise<void>; onReload: () => Promise<void>; onLanguage: (next: Lang) => Promise<void> }) {
  const d = data.direction;
  const notSet = v("settings_not_set");
  const other: Lang = language === "ar" ? "en" : "ar";
  const rows = [
    { label: v("settings_goal"), value: d?.goal ? `${v(`goal_${d.goal}`)} · ${fill(v("settings_since"), { date: dateText(d.goal_confirmed_at ?? "") })}${d.goal_secondary?.length ? ` · ${fill(v("settings_also_watching"), { list: d.goal_secondary.map((goal) => v(`goal_${goal}`)).join("، ") })}` : ""}` : notSet, step: "goal" as DirectionStep },
    { label: v("settings_priority"), value: d?.priority ? `${v(`priority_${d.priority}`)}${d.priority_expires_at ? ` · ${fill(v("settings_ask_again"), { date: dateText(d.priority_expires_at) })}` : ""}` : notSet, step: "priority" as DirectionStep },
    { label: v("settings_mix"), value: d?.mix ? v(`mix_${d.mix}`) : notSet, step: "mix" as DirectionStep },
  ];
  const held = showAllHeld ? data.held : data.held.slice(0, 3);
  return <section className="oe-view oe-settings">
    <h2>{v("settings_title")}</h2>
    <p className="oe-view-sub">{v("settings_sub")}</p>
    <section><SectionHeader label={v("settings_direction")} /><div className="oe-settings-list">{rows.map((row) => <div key={row.label} className="oe-setting-row"><div><strong>{row.label}</strong><span style={row.value === notSet ? undefined : mono}>{row.value}</span></div><button type="button" className="v23-textlink" onClick={() => onDirection(row.step)}>{v(row.value === notSet ? "action_set" : "action_change")}</button></div>)}<div className="oe-setting-row"><div><strong>{v("settings_language")}</strong><span>{v(`language_${language}`)}</span></div><button type="button" className="v23-textlink" onClick={() => void onLanguage(other)}>{v(`language_${other}`)}</button></div></div></section>
    <SuggestedRules rows={(data.proposed_rules ?? []).map((row) => ({ ...row, rule_text: youText(row.rule_text) }))} onDecided={onReload} t={t} />
    <FiltersSection filters={data.filters ?? {}} onSaved={onReload} t={t} />
    <section><div className="oe-section-count"><SectionHeader label={v("settings_held")} /><b>{data.held_count}</b></div><div className="oe-settings-list">{held.map((item) => <div key={item.id} className="oe-held"><div><strong>{item.title ?? v("settings_untitled")}</strong><span>{youText(item.reason ?? v("settings_held_reason"))}</span></div><AuraButton variant="ghost" onClick={() => void onShowAnyway(item.id)}>{v("settings_show_anyway")}</AuraButton></div>)}{data.held.length > 3 && <button type="button" className="oe-add-reveal" onClick={() => onShowAllHeld(!showAllHeld)}>{showAllHeld ? v("settings_show_less") : fill(v("settings_see_all"), { n: data.held.length })}</button>}</div></section>
    <p className="oe-commitment">{v("queue_never_locked")}</p>
  </section>;
}


function DirectionSheet({ step, direction, choice, primaryGoal, secondary, busy, v, onChoice, onSecondary, onNext, onBack, onSkip, onClose, onReconfirm, onChange }: { step: DirectionStep; direction: Direction | null; choice: Goal | Priority | Mix | null; primaryGoal: Goal | null; secondary: Set<Goal>; busy: boolean; v: Vocab; onChoice: (value: Goal | Priority | Mix) => void; onSecondary: (goal: Goal) => void; onNext: () => void; onBack: () => void; onSkip: () => void; onClose: () => void; onReconfirm: () => void; onChange: () => void }) {
  const stepNumber = step === "goal" || step === "secondary" || step === "renew" ? 1 : step === "priority" ? 2 : 3;
  const goal = primaryGoal ?? direction?.goal;
  return <div className="oe-sheet-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="oe-sheet" role="dialog" aria-modal="true" aria-label={v("sheet_aria")}><div className="oe-sheet-handle" aria-hidden /><div className="oe-sheet-top"><span style={mono}>{fill(v("sheet_title"), { step: stepNumber })}</span>{step !== "done" && <button type="button" className="v23-textlink" onClick={onSkip}>{v("sheet_skip")}</button>}</div>{step === "renew" && direction?.goal ? <><h2>{fill(v("sheet_renew"), { goal: v(`goal_${direction.goal}`) })}</h2><div className="oe-sheet-actions"><AuraButton onClick={onReconfirm} loading={busy}>{v("sheet_yes")}</AuraButton><AuraButton variant="ghost" onClick={onChange}>{v("sheet_change")}</AuraButton></div></> : step === "goal" ? <><h2>{v("goal_question")}</h2><div className="oe-direction-options">{goals.map((item) => <Button key={item} type="button" variant="outline" className={`oe-direction-option${direction?.goal_proposed === item ? " is-proposed" : ""}${choice === item ? " is-selected" : ""}`} aria-pressed={choice === item} onClick={() => onChoice(item)}><span><strong>{v(`goal_${item}`)}</strong><small>{v(`goal_${item}_sub`)}</small>{direction?.goal_proposed === item && <em>{v("sheet_proposed")}</em>}</span></Button>)}</div><p className="oe-sheet-note">{v("sheet_note")}</p></> : step === "secondary" && goal ? <><h2>{v("sheet_secondary")}</h2><div className="oe-secondary-goals">{goals.filter((item) => item !== goal).map((item) => <Button key={item} type="button" variant="outline" className="oe-secondary-chip" aria-pressed={secondary.has(item)} onClick={() => onSecondary(item)}>{v(`goal_${item}`)}</Button>)}</div></> : step === "priority" ? <><h2>{v("direction_priority_question")}</h2><div className="oe-direction-options">{priorities.map((item) => <Button key={item} type="button" variant="outline" className={`oe-direction-option${choice === item ? " is-selected" : ""}`} aria-pressed={choice === item} onClick={() => onChoice(item)}><span><strong>{v(`priority_${item}`)}</strong><small>{v(`priority_${item}_sub`)}</small></span></Button>)}</div></> : step === "mix" ? <><h2>{v("direction_mix_question")}</h2><div className="oe-direction-options">{mixes.map((item) => <Button key={item} type="button" variant="outline" className={`oe-direction-option${choice === item ? " is-selected" : ""}`} aria-pressed={choice === item} onClick={() => onChoice(item)}>{v(`mix_${item}`)}</Button>)}</div></> : <><h2>{v("sheet_done_title")}</h2><p>{fill(v("sheet_done_body"), { days: 90 })}</p></>}<div className="oe-sheet-actions">{step !== "goal" && step !== "renew" && step !== "done" && <button type="button" className="v23-textlink" onClick={onBack}>{v("action_back")}</button>}{step === "secondary" && <button type="button" className="v23-textlink" onClick={onNext}>{v("sheet_skip_short")}</button>}{step !== "renew" && <AuraButton onClick={step === "done" ? onClose : onNext} disabled={busy || ((step === "goal" || step === "priority" || step === "mix") && !choice)}>{v(step === "secondary" ? "sheet_save" : step === "done" ? "sheet_done" : "sheet_save_continue")}</AuraButton>}</div><button type="button" className="v23-textlink oe-sheet-close" onClick={onClose}>{v("sheet_close")}</button></section></div>;
}

export default OpportunityQueue;
