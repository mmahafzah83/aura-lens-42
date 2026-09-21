import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuraButton } from "@/components/ui/AuraButton";
import { AuraCard } from "@/components/ui/AuraCard";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useVocab } from "./useVocab";

type WhyLine = { text?: string; label?: string };
type AccessState = "observed_event" | "possible_need" | "confirmed_opportunity" | "identified_route";
type Inference = { what_we_saw?: string | null; what_we_infer?: string | null; what_would_confirm?: string | null };
type QueueCard = {
  id: string; opportunity_id: string; lane: "act" | "write"; why_lines: WhyLine[] | null;
  gap_line: WhyLine | null; quote: string | null; clock_text: string | null; title: string;
  chair_type: string | null; level_band: string | null; sector: string | null; location: string | null; scope: string | null; deadline: string | null;
  source_url: string | null; route_url: string | null; route_kind: string | null; issuer_id: string | null;
  issuer_name: string | null; last_checked: string | null; rule_count: number; purpose: "strength" | "build" | "explore";
  access_state: AccessState | null; access_state_reason: string | null; inference: Inference | null;
  claims: Record<string, "pass" | "fail" | "unknown"> | null; cost_of_door: string | null;
  gap_question: { investigation_id: string; field: string; question: string } | null;
};

const STATE_LABEL: Record<AccessState, string> = {
  observed_event: "Something happened", possible_need: "A need may follow",
  confirmed_opportunity: "An opening exists", identified_route: "A way in exists",
};
type Priority = "bigger_seat" | "known_for_one" | "new_rooms" | "out_of_sector" | "stay_current";
type Mix = "win" | "build" | "explore";
type Goal = "income_from_expertise" | "advancement" | "visibility" | "relationships" | "knowledge";
type Direction = {
  priority: Priority | null; priority_set_on: string | null; priority_expires_at: string | null;
  mix: Mix | null; mix_set_on: string | null; goal: Goal | null; goal_secondary: Goal[] | null;
  goal_proposed: Goal | null; goal_confirmed_at: string | null; goal_expires_at: string | null;
};
type Window = { expected_by: string; declared_on: string | null; missed: boolean };
type Derivation = { comments?: Array<{ id?: string; text?: string; said_on?: string }>; profile?: string[]; legal_basis?: string };
type Rule = { id: string; kind: "hard" | "soft"; rule_text: string; rule_text_ar: string | null; field: string | null; value: string | null; stated_on: string; derived_from?: Derivation | null; ratified_at?: string | null };
type Held = { id: string; day: string; reason: string | null; rank: number | null; title: string | null };
type History = {
  shown_at: string; lane: string | null; tap: string | null; tap_scope: string | null; tap_scope_value: string | null;
  tapped_at: string | null; truth_code: string | null; outcome: string | null; outcome_at: string | null;
  title: string | null; issuer_name: string | null; location: string | null; presentation_line: string | null;
};
type DueOutcome = { id: string; title: string | null };
type QueueData = { cards: QueueCard[]; surface_count: number; entity_count: number; rule_count: number; held_count: number; direction: Direction | null; window: Window | null; rules: Rule[]; held: Held[]; history: History[]; due_outcomes: DueOutcome[] };
type Proposal = { id: string; count: number; value: string };
type DirectionQuestion = "priority" | "mix" | null;
type GoalStep = "choose" | "secondary" | "confirmed";

const emptyData: QueueData = { cards: [], surface_count: 0, entity_count: 0, rule_count: 0, held_count: 0, direction: null, window: null, rules: [], held: [], history: [], due_outcomes: [] };
const mono = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" } as const;
const chipBase = { minHeight: 44, padding: "8px 11px", borderRadius: 4, background: "var(--surface-card)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 } as const;
const priorities: Priority[] = ["bigger_seat", "known_for_one", "new_rooms", "out_of_sector", "stay_current"];
const mixes: Mix[] = ["win", "build", "explore"];
const goals: Goal[] = ["income_from_expertise", "advancement", "visibility", "relationships", "knowledge"];
const FIELD_LABEL: Record<string, string> = { sector: "Sector", issuer: "Organisation", level: "Level", place: "Place" };
const SCOPE_REASON: Record<string, string> = { level: "wrong level", sector: "wrong sector", issuer: "not this organisation", place: "wrong place", just_this: "just this one" };
const TRUTH_REASON: Record<string, string> = { dead_route: "dead link", quote_absent: "quote not on the page", listing_page: "listing page", already_happened: "already happened", wrong_issuer: "wrong organisation" };

function validWhy(card: QueueCard) { return (card.why_lines ?? []).some((line) => String(line?.text ?? "").trim()); }
function dayKey(value: string) { return String(value).slice(0, 10); }
function displayDay(value: string) { return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
function historyDecision(row: History) {
  if (!row.tap) return "No decision yet";
  if (row.tap === "right") return row.lane === "write" ? "You drafted it" : "You went for it";
  if (row.tap === "later") return "You said later";
  if (row.truth_code) return `You flagged: ${TRUTH_REASON[row.truth_code] ?? "something was wrong"}`;
  const reason = row.tap_scope ? SCOPE_REASON[row.tap_scope] : null;
  return reason ? `Not for you · ${reason}` : "Not for you";
}
function historyOutcome(row: History) {
  const copy: Record<string, string> = { applied: "You applied", shortlisted: "You were shortlisted", won: "You got it", nothing: "Nothing came of it" };
  if (row.outcome) return copy[row.outcome] ?? "Outcome recorded";
  return row.tap === "right" ? "Not yet known" : "No outcome expected";
}

export function OpportunityQueue() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [data, setData] = useState<QueueData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [queueIndex, setQueueIndex] = useState(0);
  const [later, setLater] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalShown, setProposalShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newRule, setNewRule] = useState("");
  const [newRuleType, setNewRuleType] = useState<"sector" | "issuer">("sector");
  const [directionQuestion, setDirectionQuestion] = useState<DirectionQuestion>(null);
  const [directionAsked, setDirectionAsked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState("");
  const [notice, setNotice] = useState("");
  const [goalChanging, setGoalChanging] = useState(false);
  const [goalStep, setGoalStep] = useState<GoalStep>("choose");
  const [primaryGoal, setPrimaryGoal] = useState<Goal | null>(null);
  const [secondaryGoals, setSecondaryGoals] = useState<Set<Goal>>(new Set());
  const renderedRef = useRef<Set<string>>(new Set());
  const noticeTimer = useRef<number | null>(null);
  const v = useVocab("en");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setLoading(false); return; }
    const [{ data: profile }, { data: payload, error }] = await Promise.all([
      supabase.from("diagnostic_profiles").select("first_name").eq("user_id", uid).maybeSingle(),
      supabase.rpc("oe_app_queue" as never),
    ]);
    setFirstName(String((profile as { first_name?: string } | null)?.first_name ?? ""));
    if (!error && payload) {
      const next = { ...emptyData, ...(payload as unknown as QueueData) };
      setData(next);
      const asked = window.sessionStorage.getItem(`oe-direction-asked:${uid}`) === "true";
      setDirectionAsked(asked);
      if (!asked && next.cards.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const priorityDue = !next.direction?.priority && (!next.direction?.priority_expires_at || next.direction.priority_expires_at <= today);
        const priorityExpired = Boolean(next.direction?.priority && next.direction.priority_expires_at && next.direction.priority_expires_at <= today);
        if (priorityDue || priorityExpired) setDirectionQuestion("priority");
        else if (next.direction?.priority && !next.direction.mix) setDirectionQuestion("mix");
        else setDirectionQuestion(null);
      } else setDirectionQuestion(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 4000);
  };

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true); setRefreshNote("");
    const { data: payload, error } = await supabase.rpc("oe_app_refresh" as never);
    const result = payload as { ok?: boolean; retry_after_seconds?: number } | null;
    if (error) setRefreshNote("Could not look again just now.");
    else if (result?.ok === false) {
      const wait = Number(result.retry_after_seconds ?? 60);
      setRefreshNote(`Just looked. Try again in ${wait} second${wait === 1 ? "" : "s"}.`);
    } else {
      renderedRef.current = new Set(); setQueueIndex(0); setLater(new Set()); await load();
    }
    setRefreshing(false);
  }, [load, refreshing]);

  useEffect(() => {
    if (!drawerOpen) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = old; window.removeEventListener("keydown", close); };
  }, [drawerOpen]);

  const cards = useMemo(() => data.cards.filter((item) => !later.has(item.id)), [data.cards, later]);
  const card = cards[queueIndex] ?? null;
  const historyGroups = useMemo(() => {
    const groups = new Map<string, History[]>();
    data.history.forEach((row) => { const key = dayKey(row.shown_at); groups.set(key, [...(groups.get(key) ?? []), row]); });
    return Array.from(groups.entries());
  }, [data.history]);

  useEffect(() => {
    if (!card || renderedRef.current.has(card.id)) return;
    renderedRef.current.add(card.id);
    if (validWhy(card)) void supabase.rpc("oe_app_render" as never, { p_card: card.opportunity_id } as never);
  }, [card]);

  const advance = () => { setExpanded(false); setScopeExpanded(false); setDeclining(false); setQueueIndex((index) => index + 1); };
  const decide = useCallback(async (action: "right" | "later") => {
    if (!card || busy) return;
    setBusy(true);
    const { data: raw } = await supabase.rpc("oe_app_decide" as never, { p_card: card.opportunity_id, p_action: action } as never);
    setBusy(false);
    const result = raw as { ok?: boolean } | null;
    if (!result?.ok) return;
    if (action === "later") {
      setLater((current) => new Set(current).add(card.id));
      setExpanded(false); setScopeExpanded(false); setDeclining(false); setQueueIndex(0); showNotice("Marked later");
      return;
    }
    showNotice(card.lane === "act" ? "Off you go — the link is open" : "Draft started");
    if (card.lane === "write") navigate(`/studio?opportunity=${card.opportunity_id}`);
    else {
      const destination = card.route_url ?? card.source_url;
      if (destination) window.open(destination, "_blank", "noopener,noreferrer");
      advance();
    }
  }, [busy, card, navigate]);

  const decline = async (scope: string | null, value: string | null, truth: string | null) => {
    if (!card || busy) return;
    setBusy(true);
    const { data: raw } = await supabase.rpc("oe_app_decide" as never, { p_card: card.opportunity_id, p_action: "not_quite", p_scope: scope, p_scope_value: value, p_truth: truth } as never);
    setBusy(false);
    const result = raw as { ok?: boolean; proposal_id?: string; declines?: number } | null;
    if (!result?.ok) return;
    showNotice("Noted — not for you");
    if (result.proposal_id && !proposalShown) {
      setProposal({ id: String(result.proposal_id), count: Number(result.declines ?? 3), value: value ?? "" });
      setProposalShown(true); setExpanded(false); setScopeExpanded(false); setDeclining(false);
    } else advance();
  };

  const answerProposal = async (accept: boolean) => {
    if (!proposal || busy) return;
    setBusy(true); await supabase.rpc("oe_app_proposal" as never, { p_id: proposal.id, p_accept: accept } as never);
    setBusy(false); setProposal(null); advance(); void load();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']") || drawerOpen || proposal || !card) return;
      if (event.key === "1") void decide("right");
      if (event.key === "2") void decide("later");
      if (event.key === "3") setDeclining(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, decide, drawerOpen, proposal]);

  const saveRule = async () => {
    const value = newRule.trim();
    if (!userId || !value || busy) return;
    setBusy(true);
    await supabase.from("oe_notebook" as never).insert({ user_id: userId, kind: "soft", rule_text: `Show me more from ${value}`, rule_text_ar: `أظهر لي المزيد من ${value}`, field: newRuleType, op: "prefer", value, origin: "stated", proposal_status: "signed", active: true, entry_kind: "rule", ratified_at: new Date().toISOString() } as never);
    setNewRule(""); setBusy(false); void load();
  };
  const deactivate = async (recordId: string) => { await supabase.from("oe_notebook" as never).update({ active: false } as never).eq("id", recordId); void load(); };
  const showAnyway = async (recordId: string) => { await supabase.rpc("oe_app_show_anyway" as never, { p_suppressed: recordId } as never); void load(); };
  const answerOutcome = async (recordId: string, outcome: string) => { if (!userId) return; await supabase.from("oe_serves" as never).update({ outcome, outcome_at: new Date().toISOString() } as never).eq("id", recordId).eq("user_id", userId); void load(); };
  const markDirectionAsked = () => { if (userId) window.sessionStorage.setItem(`oe-direction-asked:${userId}`, "true"); setDirectionAsked(true); setDirectionQuestion(null); };
  const saveDirection = async (value: Priority | Mix) => { if (busy) return; setBusy(true); const params = directionQuestion === "priority" ? { p_priority: value } : { p_mix: value }; const { error } = await supabase.rpc("oe_direction_save" as never, params as never); setBusy(false); if (!error) { markDirectionAsked(); setQueueIndex(0); void load(); } };
  const deferDirection = async () => { if (busy) return; setBusy(true); const { error } = await supabase.rpc("oe_direction_save" as never, { p_defer: true } as never); setBusy(false); if (!error) { markDirectionAsked(); void load(); } };

  const choosePrimaryGoal = (value: Goal) => {
    if (busy) return;
    setPrimaryGoal(value);
    setSecondaryGoals(new Set());
    setGoalStep("secondary");
  };
  const finishGoal = async (secondary: Goal[] | null) => {
    const chosen = primaryGoal ?? data.direction?.goal;
    if (!chosen || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("oe_goal_save" as never, { p_goal: chosen, p_secondary: secondary } as never);
    setBusy(false);
    if (!error) {
      setGoalStep("confirmed"); setGoalChanging(false);
      window.setTimeout(() => { setGoalStep("choose"); setPrimaryGoal(null); void load(); }, 2400);
    }
  };
  const deferGoal = async () => { if (busy) return; setBusy(true); const { error } = await supabase.rpc("oe_goal_save" as never, { p_defer: true } as never); setBusy(false); if (!error) { setGoalChanging(false); setGoalStep("choose"); void load(); } };
  const reconfirmGoal = async () => {
    const goal = data.direction?.goal;
    if (!goal || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("oe_goal_save" as never, { p_goal: goal, p_secondary: data.direction?.goal_secondary ?? null } as never);
    setBusy(false);
    if (!error) {
      setGoalStep("confirmed");
      window.setTimeout(() => { setGoalStep("choose"); void load(); }, 2400);
    }
  };
  const changeDirection = (question: Exclude<DirectionQuestion, null>) => { if (directionAsked || data.cards.length === 0) return; setDrawerOpen(false); setDirectionQuestion(question); };

  const t = (key: string, fallback: string) => v(key) || fallback;
  const count = cards.length;
  const today = new Date().toISOString().slice(0, 10);
  const goalExpired = Boolean(data.direction?.goal && data.direction.goal_expires_at && data.direction.goal_expires_at <= today);
  const goalDeferredUntil = data.direction?.goal ? null : (data.direction?.goal_expires_at ?? null);
  const askGoal = !data.direction?.goal && (!goalDeferredUntil || goalDeferredUntil <= today);
  const showGoalCard = askGoal || goalChanging || goalExpired || goalStep !== "choose";
  const windowDate = data.window?.expected_by ?? null;
  const dateText = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const lead = card?.why_lines?.find((line) => String(line?.text ?? "").trim())?.text ?? "";
  const taste = card ? [
    ["queue_wrong_level", "Wrong level", "level", card.level_band], ["queue_wrong_sector", "Wrong sector", "sector", card.sector],
    ["queue_wrong_org", "Not this organisation", "issuer", card.issuer_id], ["queue_wrong_place", "Wrong place", "place", card.location],
    ["queue_just_one", "Just this one", "just_this", card.opportunity_id],
  ].filter((entry) => Boolean(entry[3])) as string[][] : [];
  const truths = [["queue_dead_link", "The link does not work", "dead_route"], ["queue_quote_absent", "The quote is not on the page", "quote_absent"], ["queue_listing", "It is a listing page", "listing_page"], ["queue_happened", "This already happened", "already_happened"], ["queue_wrong_issuer", "Wrong organisation", "wrong_issuer"]] as const;

  const history = <HistoryList groups={historyGroups} emptyText={t("queue_history_empty", "Nothing has been shown yet.")} />;
  const links = <div className="oe-end-links"><AuraButton onClick={() => setDrawerOpen(true)}>{t("queue_setup", "Review what reaches you")}</AuraButton><button type="button" className="v23-textlink" onClick={() => setHistoryOpen((open) => !open)}>{t("queue_history", "History")}</button></div>;

  return <section className="oe-queue" dir="ltr" aria-busy={loading}>
    {showGoalCard && !loading && <GoalCard direction={data.direction} busy={busy} v={v} step={goalStep} primary={primaryGoal} secondary={secondaryGoals} expired={goalExpired} changing={goalChanging} onChoose={choosePrimaryGoal} onReconfirm={() => void reconfirmGoal()} onChange={() => { setDrawerOpen(false); setGoalChanging(true); setGoalStep("choose"); }} onToggleSecondary={(goal) => setSecondaryGoals((current) => { const next = new Set(current); next.has(goal) ? next.delete(goal) : next.add(goal); return next; })} onSaveSecondary={() => void finishGoal(Array.from(secondaryGoals))} onSkipSecondary={() => void finishGoal(null)} onDefer={() => void deferGoal()} />}

    <header className="oe-queue-header">
      <h1>{t("queue_morning", "Morning")}{firstName ? `, ${firstName}` : ""}</h1>
      {count > 0 && <><p><span style={mono}>{count}</span> {t("queue_things_today", "things today. About a minute.")}</p><div className="oe-machine-line"><span className={refreshing ? "oe-machine-dot oe-machine-dot-working" : "oe-machine-dot"} aria-hidden /><span>{refreshing ? t("queue_refreshing", "Looking again") : t("queue_still_reading", "Still reading")} — <b style={mono}>{data.surface_count}</b> {t("queue_sources_across", "sources across")} <b style={mono}>{data.entity_count}</b> {t("queue_organisations", "organisations")}</span><button type="button" className="v23-textlink oe-refresh" onClick={() => void refresh()} disabled={refreshing || loading}>{refreshing ? t("queue_refreshing_short", "Refreshing…") : t("queue_refresh", "Refresh")}</button></div></>}
      {refreshNote && <p className="oe-refresh-note">{refreshNote}</p>}
      {count > 0 && <div className="oe-header-tools"><button type="button" className="oe-tuning-door" onClick={() => setDrawerOpen(true)}><strong>{t("queue_tuning_title", "What reaches you")}</strong><span><b style={mono}>{data.rule_count}</b> {t("queue_rules_force", "rules in force")} · <b style={mono}>{data.held_count}</b> {t("queue_held_month", "held back this month")}</span></button><button type="button" className="v23-textlink" onClick={() => setHistoryOpen((open) => !open)}>{t("queue_history", "History")}</button></div>}
    </header>

    <div className={`oe-notice${notice ? " is-visible" : ""}`} role="status" aria-live="polite">{notice}</div>

    {proposal ? <AuraCard hover="none" className="oe-proposal"><p><strong>{`That is the ${proposal.count}th ${proposal.value} ${t("queue_proposal_seen", "item you have turned down.")}`}</strong></p><p>{t("queue_proposal_question", "Shall we stop showing them? You can undo it any time, and it will not touch anything else.")}</p><div className="oe-actions"><AuraButton onClick={() => void answerProposal(true)} loading={busy}>{t("queue_yes_stop", "Yes, stop")}</AuraButton><AuraButton variant="ghost" onClick={() => void answerProposal(false)} disabled={busy}>{t("queue_no_keep", "No, keep them")}</AuraButton></div></AuraCard>
    : directionQuestion && card ? <DirectionCard kind={directionQuestion} direction={data.direction} busy={busy} v={v} onChoose={(value) => void saveDirection(value)} onDefer={() => void deferDirection()} />
    : card && validWhy(card) ? <>
      <AuraCard hover="none" className="oe-decision-card">
        <div className="oe-card-flags"><div className={`oe-lane oe-lane-${card.lane}`}><span aria-hidden />{card.access_state ? STATE_LABEL[card.access_state] : (card.lane === "act" ? t("queue_open_now", "Open now") : t("queue_worth_writing", "Worth writing about"))}{card.clock_text && <em> · {card.clock_text}</em>}</div>{card.purpose === "explore" && <span className="oe-purpose-chip">{v("purpose_explore")}</span>}</div>
        <h2>{card.title}</h2>
        <p className="oe-meta">{[card.issuer_name, card.location].filter(Boolean).join(" · ")}</p>
        {card.scope && <div className="oe-scope-wrap"><p className={`oe-summary${scopeExpanded ? " is-expanded" : ""}`}>{card.scope}</p><button type="button" className="v23-textlink" onClick={() => setScopeExpanded((open) => !open)}>{scopeExpanded ? t("queue_less", "Less") : t("queue_more", "More")}</button></div>}
        {card.inference && <div className="oe-inference">{card.inference.what_we_saw && <p><strong>What we saw:</strong> “{card.inference.what_we_saw}”</p>}{card.inference.what_we_infer && <p><strong>What we infer:</strong> {card.inference.what_we_infer}</p>}{card.inference.what_would_confirm && <p><strong>What would confirm it:</strong> {card.inference.what_would_confirm}</p>}</div>}
        <div className="oe-why"><div className="oe-why-lead"><p><strong>{card.lane === "act" ? t("queue_why_you", "Why you") : t("queue_your_angle", "Your angle")}:</strong> {lead}</p><button type="button" className="v23-textlink" onClick={() => setExpanded((open) => !open)}>{expanded ? t("queue_less", "Less") : t("queue_more", "More")}</button></div>{expanded && <div className="oe-why-more">{(card.why_lines ?? []).slice(1).map((line, index) => <p key={index}><span className="oe-dot-evidence" aria-hidden />{line.text}</p>)}{card.gap_line?.text && <p><span className="oe-dot-risk" aria-hidden /><strong>{t("queue_risk", "You would have to answer for")}:</strong> {card.gap_line.text}</p>}<p><span className="oe-dot-rule" aria-hidden /><strong>{t("queue_clears_n_rules", "Clears {n} of your rules").replace("{n}", String(card.rule_count))}</strong></p>{card.quote && <blockquote>“{card.quote}” {card.source_url && <a href={card.source_url} target="_blank" rel="noreferrer">{t("source_link", "Source")}</a>}{card.last_checked && <small style={mono}>{String(card.last_checked).slice(0, 10)}</small>}</blockquote>}</div>}</div>
        {card.lane === "act" && (card.cost_of_door ? <p className="oe-door-cost"><span aria-hidden />{v("door_cost_en").replace("{cost}", card.cost_of_door)}</p> : <p className="oe-door-cost"><span aria-hidden />{t("queue_direct_cost", "Direct application. One form, no recruiter call first.")}</p>)}
        {!declining ? <div className="oe-actions"><AuraButton onClick={() => void decide("right")} loading={busy}>{card.lane === "act" ? t("queue_act", "I will go for it") : t("queue_draft", "Draft it")}</AuraButton><AuraButton variant="ghost" onClick={() => void decide("later")} disabled={busy}>{t("queue_later", "Later")}</AuraButton><AuraButton variant="ghost" onClick={() => setDeclining(true)} disabled={busy}>{t("queue_not_for_me", "Not for me")}</AuraButton></div>
        : <div className="oe-decline"><button type="button" className="v23-textlink oe-back" onClick={() => setDeclining(false)}>{t("queue_back", "Back")}</button><div><h3>{t("queue_not_because", "Not for me because")}</h3><div className="oe-chip-row">{taste.map(([key, fallback, scope, value]) => <button key={key} type="button" disabled={busy} style={{ ...chipBase, border: "1px solid var(--border-default)" }} onClick={() => void decline(scope, value, null)}>{t(key, fallback)}</button>)}</div></div><div><h3>{t("queue_or_wrong", "Or something is wrong with it")}</h3><div className="oe-chip-row">{truths.map(([key, fallback, truth]) => <button key={key} type="button" disabled={busy} className="oe-truth-chip" style={chipBase} onClick={() => void decline(null, null, truth)}>{t(key, fallback)}</button>)}</div></div></div>}
      </AuraCard>
      {cards.slice(queueIndex + 1).length > 0 && <div className="oe-after"><SectionHeader label={t("queue_after_this", "After this")} />{cards.slice(queueIndex + 1).map((item, offset) => <button type="button" key={item.id} onClick={() => { setQueueIndex(queueIndex + offset + 1); setExpanded(false); setScopeExpanded(false); setDeclining(false); }}><strong>{item.title}</strong><span>{item.lane === "act" ? t("queue_open_now", "Open now") : t("queue_worth_writing", "Worth writing about")}</span></button>)}</div>}
      <p className="oe-key-legend" style={mono}>{t("queue_keys", "1 choose · 2 later · 3 decline")}</p>
    </>
    : !loading && <AuraCard hover="none" className="oe-end"><h2>{t("queue_nothing_today", "Nothing today.")}</h2><p>{t("queue_still_reading_counts", "Still reading {sources} sources across {organisations} organisations.").replace("{sources}", String(data.surface_count)).replace("{organisations}", String(data.entity_count))}</p>{windowDate && (() => { const line = data.window?.missed ? v("window_missed") : v("window_expected"); const [before, after] = line.split("{date}"); return <p className="oe-window-line">{before}<span style={mono}>{dateText(windowDate)}</span>{after}</p>; })()}{data.due_outcomes.map((due) => <div key={due.id} className="oe-outcome"><strong>{due.title}</strong><span>{t("queue_outcome_ask", "Did anything come of it?")}</span><div className="oe-chip-row">{[["applied","queue_applied","I applied"],["shortlisted","queue_shortlisted","I was shortlisted"],["won","queue_won","I got it"],["nothing","queue_nothing","Nothing came of it"]].map(([outcome,key,fallback]) => <button key={outcome} type="button" style={{ ...chipBase, border: "1px solid var(--border-default)" }} onClick={() => void answerOutcome(due.id,outcome)}>{t(key,fallback)}</button>)}</div></div>)}{links}</AuraCard>}

    {historyOpen && <section className="oe-history"><SectionHeader label={t("queue_history", "History")} />{history}</section>}

    {drawerOpen && createPortal(<div className="oe-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}><aside className="oe-drawer" role="dialog" aria-modal="true" aria-label={t("queue_tuning_title", "What reaches you")}><div className="oe-drawer-head"><h2>{t("queue_tuning_title", "What reaches you")}</h2><button type="button" onClick={() => setDrawerOpen(false)} aria-label={t("queue_close", "Close")}><X size={18}/></button></div>
      {data.direction?.goal && <section className="oe-direction-summary"><div className="oe-rule"><div><strong>{v(`goal_${data.direction.goal}`)} · since <span style={mono}>{String(data.direction.goal_confirmed_at ?? "").slice(0, 10)}</span>{data.direction.goal_secondary?.length ? ` + ${data.direction.goal_secondary.map((goal) => v(`goal_${goal}`)).join(", ")}` : ""}</strong></div><button type="button" className="v23-textlink" onClick={() => { setDrawerOpen(false); setGoalChanging(true); setGoalStep("choose"); }}>{v("direction_change")}</button></div></section>}
      {data.direction?.priority && <section className="oe-direction-summary"><div className="oe-rule"><div><strong>{v("direction_priority_sentence").replace("{priority}", v(`priority_${data.direction.priority}`)).replace("{date}", data.direction.priority_set_on ?? "")}</strong></div><button type="button" className="v23-textlink" disabled={directionAsked} onClick={() => changeDirection("priority")}>{v("direction_change")}</button></div>{data.direction.mix && <div className="oe-rule"><div><strong>{v("direction_mix_sentence").replace("{mix}", v(`mix_${data.direction.mix}`))}</strong></div><button type="button" className="v23-textlink" disabled={directionAsked} onClick={() => changeDirection("mix")}>{v("direction_change")}</button></div>}</section>}
      <section><SectionHeader label={t("queue_must_true", "Must be true")} />{data.rules.filter((rule) => rule.kind === "hard").map((rule) => <RuleRow key={rule.id} rule={rule} onDeactivate={deactivate} />)}</section>
      <section><SectionHeader label={t("queue_better_true", "Better if true")} />{data.rules.filter((rule) => rule.kind === "soft").map((rule) => <RuleRow key={rule.id} rule={rule} onDeactivate={deactivate} />)}<div className="oe-add-rule"><select aria-label="Rule type" value={newRuleType} onChange={(event) => setNewRuleType(event.target.value as "sector"|"issuer")}><option value="sector">Sector</option><option value="issuer">Organisation</option></select><input aria-label="Rule value" value={newRule} onChange={(event) => setNewRule(event.target.value)} placeholder={t("queue_add_control", "Add a sector or organisation")} /><AuraButton variant="ghost" onClick={() => void saveRule()} disabled={!newRule.trim() || busy}>Add</AuraButton></div></section>
      <section><SectionHeader label={t("queue_held_title", "Held back this month")} />{data.held.map((held) => <div key={held.id} className="oe-held"><div><strong>{held.title ?? t("queue_untitled", "Untitled item")}</strong><span>{held.reason ?? t("queue_held_rule", "Held by a rule")}</span></div><AuraButton variant="ghost" onClick={() => void showAnyway(held.id)}>{t("queue_show_anyway", "Show me anyway")}</AuraButton></div>)}<p className="oe-commitment">{t("queue_never_locked", "Filtering never locks you out. You can reopen anything held back here.")}</p></section>
    </aside></div>, document.body)}
  </section>;
}

function HistoryList({ groups, emptyText }: { groups: Array<[string, History[]]>; emptyText: string }) {
  if (groups.length === 0) return <p className="oe-history-empty">{emptyText}</p>;
  return <div>{groups.map(([day, rows]) => <section key={day} className="oe-history-day"><h3 style={mono}>{displayDay(`${day}T12:00:00Z`)}</h3>{rows.map((row, index) => <article key={`${day}-${index}`} className="oe-history-row"><p><span>Shown</span><strong>{row.title ?? "Opportunity"}</strong><small>{[row.issuer_name, row.location].filter(Boolean).join(" · ")}</small><em>{row.lane === "write" ? "Worth writing about" : "Open now"}</em>{row.presentation_line && <small className="oe-history-line">{row.presentation_line}</small>}</p><p><span>You decided</span>{historyDecision(row)}</p><p><span>What happened</span>{historyOutcome(row)}</p></article>)}</section>)}</div>;
}

function GoalCard({ direction, busy, v, step, primary, secondary, expired, changing, onChoose, onReconfirm, onChange, onToggleSecondary, onSaveSecondary, onSkipSecondary, onDefer }: { direction: Direction | null; busy: boolean; v: ReturnType<typeof useVocab>; step: GoalStep; primary: Goal | null; secondary: Set<Goal>; expired: boolean; changing: boolean; onChoose: (goal: Goal) => void; onReconfirm: () => void; onChange: () => void; onToggleSecondary: (goal: Goal) => void; onSaveSecondary: () => void; onSkipSecondary: () => void; onDefer: () => void }) {
  const proposed = direction?.goal_proposed ?? null;
  const selectedPrimary = primary ?? direction?.goal ?? null;
  if (step === "confirmed") return <AuraCard hover="none" className="oe-direction-card"><p className="oe-goal-confirmed">Set. We will ask again in <span style={mono}>90</span> days, or sooner if things change.</p></AuraCard>;
  if (step === "secondary" && selectedPrimary) return <AuraCard hover="none" className="oe-direction-card"><h2>Anything else worth watching for?</h2><div className="oe-secondary-goals">{goals.filter((goal) => goal !== selectedPrimary).map((goal) => <Button key={goal} type="button" variant="outline" className="oe-secondary-chip" disabled={busy} aria-pressed={secondary.has(goal)} onClick={() => onToggleSecondary(goal)}>{v(`goal_${goal}`)}</Button>)}</div><div className="oe-goal-save"><AuraButton onClick={onSaveSecondary} loading={busy}>Save</AuraButton><button type="button" className="v23-textlink" disabled={busy} onClick={onSkipSecondary}>Skip</button></div></AuraCard>;
  if (expired && direction?.goal && !changing) return <AuraCard hover="none" className="oe-direction-card"><h2>Still <strong>{v(`goal_${direction.goal}`)}</strong>?</h2><div className="oe-actions"><AuraButton onClick={onReconfirm} loading={busy}>Yes</AuraButton><AuraButton variant="ghost" onClick={onChange} disabled={busy}>Change</AuraButton></div><button type="button" className="v23-textlink oe-direction-later" disabled={busy} onClick={onDefer}>{v("goal_not_now")}</button></AuraCard>;
  return <AuraCard hover="none" className="oe-direction-card"><h2>{v("goal_question")}</h2><p>{v("goal_sub")}</p><div className="oe-direction-options">{goals.map((goal) => <Button key={goal} type="button" variant="outline" className={`oe-direction-option${proposed === goal ? " is-proposed" : ""}`} disabled={busy} onClick={() => onChoose(goal)} aria-pressed={false}><span><strong>{v(`goal_${goal}`)}</strong>{proposed === goal && <small>Our reading of your profile</small>}</span></Button>)}</div><button type="button" className="v23-textlink oe-direction-later" disabled={busy} onClick={onDefer}>{v("goal_not_now")}</button></AuraCard>;
}

function DirectionCard({ kind, direction, busy, v, onChoose, onDefer }: { kind: Exclude<DirectionQuestion, null>; direction: Direction | null; busy: boolean; v: ReturnType<typeof useVocab>; onChoose: (value: Priority | Mix) => void; onDefer: () => void }) {
  const isRenewal = kind === "priority" && Boolean(direction?.priority);
  const options = kind === "priority" ? priorities : mixes;
  return <AuraCard hover="none" className="oe-direction-card"><h2>{v(kind === "priority" ? (isRenewal ? "direction_priority_renew" : "direction_priority_question") : "direction_mix_question")}</h2><div className="oe-direction-options">{options.map((option) => { const selected = kind === "priority" && direction?.priority === option; return <Button key={option} type="button" variant="outline" className={`oe-direction-option${selected ? " is-selected" : ""}`} disabled={busy} onClick={() => onChoose(option)} aria-pressed={selected}><span><strong>{v(`${kind}_${option}`)}</strong>{kind === "priority" && <small>{v(`priority_${option}_sub`)}</small>}</span></Button>; })}</div>{kind === "priority" && !isRenewal && <button type="button" className="v23-textlink oe-direction-later" disabled={busy} onClick={onDefer}>{v("direction_not_now")}</button>}</AuraCard>;
}

function RuleRow({ rule, onDeactivate }: { rule: Rule; onDeactivate: (recordId: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const from = rule.derived_from ?? {};
  const comments = Array.isArray(from.comments) ? from.comments : [];
  const fields = Array.isArray(from.profile) ? from.profile : [];
  const legal = typeof from.legal_basis === "string" ? from.legal_basis : null;
  const hasDerivation = comments.length > 0 || fields.length > 0 || Boolean(legal);
  return <div className="oe-rule"><div><strong>{rule.rule_text}</strong><span><span style={mono}>{rule.stated_on}</span> · {FIELD_LABEL[rule.field ?? ""] ?? "Preference"}</span>{hasDerivation && <button type="button" className="v23-textlink oe-how" aria-expanded={open} onClick={() => setOpen((value) => !value)}>How we know</button>}{open && <span className="oe-rule-derivation">{comments.map((comment, index) => <span key={`${comment.id ?? index}`}>“{comment.text}” <span style={mono}>{comment.said_on}</span></span>)}{fields.map((field) => <span key={field}>{FIELD_LABEL[field] ?? "Profile"}</span>)}{legal && <span>{legal}</span>}</span>}</div><button type="button" className="v23-textlink" onClick={() => void onDeactivate(rule.id)}>Change</button></div>;
}

export default OpportunityQueue;
