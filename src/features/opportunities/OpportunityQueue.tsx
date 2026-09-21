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
  claims: Record<string, "pass" | "fail" | "unknown"> | null;
  /** What the page says entry costs. When present, it replaces the free-door line. */
  cost_of_door: string | null;
  gap_question: { investigation_id: string; field: string; question: string } | null;
};

// Only a confirmed opening, or better, may use the language of an opening.
const STATE_LABEL: Record<AccessState, string> = {
  observed_event: "Something happened",
  possible_need: "A need may follow",
  confirmed_opportunity: "An opening exists",
  identified_route: "A way in exists",
};
type Priority = "bigger_seat" | "known_for_one" | "new_rooms" | "out_of_sector" | "stay_current";
type Mix = "win" | "build" | "explore";
type Goal = "income_from_expertise" | "advancement" | "visibility" | "relationships" | "knowledge";
type Direction = {
  priority: Priority | null; priority_set_on: string | null; priority_expires_at: string | null;
  mix: Mix | null; mix_set_on: string | null;
  goal: Goal | null; goal_proposed: Goal | null; goal_confirmed_at: string | null; goal_expires_at: string | null;
};
/* The window is a promise with a date on it. It is stated once, it is never
   moved forward quietly, and it disappears the day a first card is shown. */
type Window = { expected_by: string; declared_on: string | null; missed: boolean };
type Derivation = { comments?: Array<{ id?: string; text?: string; said_on?: string }>; profile?: string[]; legal_basis?: string };
type Rule = { id: string; kind: "hard" | "soft"; rule_text: string; rule_text_ar: string | null; field: string | null; value: string | null; stated_on: string; derived_from?: Derivation | null; ratified_at?: string | null };
type Held = { id: string; day: string; reason: string | null; rank: number | null; title: string | null };
type History = { id: string; shown_at: string; lane: string | null; tap: string | null; signal_class: string | null; truth_code: string | null; outcome: string | null; why: Record<string, unknown> | null; title: string | null };
type DueOutcome = { id: string; title: string | null };
type QueueData = { cards: QueueCard[]; surface_count: number; entity_count: number; rule_count: number; held_count: number; direction: Direction | null; window: Window | null; rules: Rule[]; held: Held[]; history: History[]; due_outcomes: DueOutcome[] };
type Proposal = { id: string; count: number; value: string };
type DirectionQuestion = "priority" | "mix" | null;

const emptyData: QueueData = { cards: [], surface_count: 0, entity_count: 0, rule_count: 0, held_count: 0, direction: null, window: null, rules: [], held: [], history: [], due_outcomes: [] };
const mono = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" } as const;
const chipBase = { minHeight: 36, padding: "7px 10px", borderRadius: 4, background: "var(--surface-card)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 } as const;
const priorities: Priority[] = ["bigger_seat", "known_for_one", "new_rooms", "out_of_sector", "stay_current"];
const mixes: Mix[] = ["win", "build", "explore"];
const goals: Goal[] = ["income_from_expertise", "advancement", "visibility", "relationships", "knowledge"];


function validWhy(card: QueueCard) {
  return (card.why_lines ?? []).some((line) => String(line?.text ?? "").trim());
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
  const renderedRef = useRef<Set<string>>(new Set());
  const v = useVocab("en");
  const [goalChanging, setGoalChanging] = useState(false);


  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setLoading(false); return; }
    const [{ data: profile }, { data: payload, error }] = await Promise.all([
      (supabase.from("diagnostic_profiles" as any) as any).select("first_name").eq("user_id", uid).maybeSingle(),
      (supabase.rpc as any)("oe_app_queue"),
    ]);
    setFirstName(String(profile?.first_name ?? ""));
    if (!error && payload) {
      const next = { ...emptyData, ...(payload as QueueData) };
      setData(next);
      const askedKey = `oe-direction-asked:${uid}`;
      const asked = window.sessionStorage.getItem(askedKey) === "true";
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

  /* REFRESH ON DEMAND. The member asks, the engine looks again. The server
     holds the once-a-minute limit, so a second tab cannot get around it. */
  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshNote("");
    const { data: payload, error } = await (supabase.rpc as any)("oe_app_refresh");
    if (error) setRefreshNote("Could not look again just now.");
    else if (payload && (payload as any).ok === false) {
      const wait = Number((payload as any).retry_after_seconds ?? 60);
      setRefreshNote(`Just looked. Try again in ${wait} second${wait === 1 ? "" : "s"}.`);
    } else {
      renderedRef.current = new Set();
      setQueueIndex(0);
      setLater(new Set());
      await load();
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

  const cards = useMemo(() => data.cards.filter((card) => !later.has(card.id)), [data.cards, later]);
  const card = cards[queueIndex] ?? null;

  useEffect(() => {
    if (!card || renderedRef.current.has(card.id)) return;
    renderedRef.current.add(card.id);
    if (!validWhy(card)) return;
    void (supabase.rpc as any)("oe_app_render", { p_card: card.opportunity_id });
  }, [card]);

  const advance = () => {
    setExpanded(false);
    setDeclining(false);
    setQueueIndex((index) => index + 1);
  };

  const decide = useCallback(async (action: "right" | "later") => {
    if (!card || busy) return;
    if (action === "later") {
      setBusy(true);
      await (supabase.rpc as any)("oe_app_decide", { p_card: card.opportunity_id, p_action: "later" });
      setBusy(false);
      setLater((current) => new Set(current).add(card.id));
      setExpanded(false); setDeclining(false); setQueueIndex(0);
      return;
    }
    setBusy(true);
    const { data: result } = await (supabase.rpc as any)("oe_app_decide", { p_card: card.opportunity_id, p_action: "right" });
    setBusy(false);
    if (result?.ok) {
      if (card.lane === "write") navigate(`/studio?opportunity=${card.opportunity_id}`);
      advance();
    }
  }, [busy, card, navigate]);

  const decline = async (scope: string | null, value: string | null, truth: string | null) => {
    if (!card || busy) return;
    setBusy(true);
    const { data: result } = await (supabase.rpc as any)("oe_app_decide", {
      p_card: card.opportunity_id, p_action: "not_quite", p_scope: scope, p_scope_value: value, p_truth: truth,
    });
    setBusy(false);
    if (result?.ok) {
      if (result.proposal_id && !proposalShown) {
        setProposal({ id: String(result.proposal_id), count: Number(result.declines ?? 3), value: value ?? "" });
        setProposalShown(true);
        setExpanded(false); setDeclining(false);
      } else advance();
    }
  };

  const answerProposal = async (accept: boolean) => {
    if (!proposal || busy) return;
    setBusy(true);
    await (supabase.rpc as any)("oe_app_proposal", { p_id: proposal.id, p_accept: accept });
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
    // He typed it as a rule, so it is a rule and it is ratified on the spot.
    await (supabase.from("oe_notebook" as any) as any).insert({
      user_id: userId, kind: "soft", rule_text: `Show me more from ${value}`,
      rule_text_ar: `أظهر لي المزيد من ${value}`, field: newRuleType, op: "prefer", value,
      origin: "stated", proposal_status: "signed", active: true,
      entry_kind: "rule", ratified_at: new Date().toISOString(),
    });
    setNewRule(""); setBusy(false); void load();
  };

  const deactivate = async (id: string) => {
    await (supabase.from("oe_notebook" as any) as any).update({ active: false }).eq("id", id);
    void load();
  };

  const showAnyway = async (id: string) => {
    await (supabase.rpc as any)("oe_app_show_anyway", { p_suppressed: id });
    void load();
  };

  const answerOutcome = async (id: string, outcome: string) => {
    if (!userId) return;
    await (supabase.from("oe_serves" as any) as any).update({ outcome, outcome_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
    void load();
  };

  const markDirectionAsked = () => {
    if (userId) window.sessionStorage.setItem(`oe-direction-asked:${userId}`, "true");
    setDirectionAsked(true);
    setDirectionQuestion(null);
  };

  const saveDirection = async (value: Priority | Mix) => {
    if (busy) return;
    setBusy(true);
    const params = directionQuestion === "priority" ? { p_priority: value } : { p_mix: value };
    const { error } = await (supabase.rpc as any)("oe_direction_save", params);
    setBusy(false);
    if (!error) { markDirectionAsked(); setQueueIndex(0); void load(); }
  };

  const deferDirection = async () => {
    if (busy) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("oe_direction_save", { p_defer: true });
    setBusy(false);
    if (!error) { markDirectionAsked(); void load(); }
  };

  /* The goal is written by the member's own confirmation and by nothing else.
     The engine may propose; only this call, from his hand, may set it. */
  const saveGoal = async (value: Goal) => {
    if (busy) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("oe_goal_save", { p_goal: value });
    setBusy(false);
    if (!error) { setGoalChanging(false); void load(); }
  };

  const deferGoal = async () => {
    if (busy) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("oe_goal_save", { p_defer: true });
    setBusy(false);
    if (!error) { setGoalChanging(false); void load(); }
  };


  const changeDirection = (question: Exclude<DirectionQuestion, null>) => {
    if (directionAsked || data.cards.length === 0) return;
    setDrawerOpen(false);
    setDirectionQuestion(question);
  };

  const t = (key: string, fallback: string) => v(key) || fallback;
  const count = cards.length;
  const today = new Date().toISOString().slice(0, 10);
  /* The goal is asked first, and asked loudest when the tab is empty — an
     empty fortnight is exactly when "opportunity" needs a meaning. */
  const goalDeferredUntil = data.direction?.goal ? null : (data.direction?.goal_expires_at ?? null);
  const askGoal = !data.direction?.goal && (!goalDeferredUntil || goalDeferredUntil <= today);
  const showGoalCard = askGoal || goalChanging;
  const windowDate = data.window?.expected_by ?? null;
  const dateText = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  const lead = card?.why_lines?.find((line) => String(line?.text ?? "").trim())?.text ?? "";
  const taste = card ? [
    ["queue_wrong_level", "Wrong level", "level", card.level_band],
    ["queue_wrong_sector", "Wrong sector", "sector", card.sector],
    ["queue_wrong_org", "Not this organisation", "issuer", card.issuer_id],
    ["queue_wrong_place", "Wrong place", "place", card.location],
    ["queue_just_one", "Just this one", "just_this", card.opportunity_id],
  ] as const : [];
  const truths = [
    ["queue_dead_link", "The link does not work", "dead_route"],
    ["queue_quote_absent", "The quote is not on the page", "quote_absent"],
    ["queue_listing", "It is a listing page", "listing_page"],
    ["queue_happened", "This already happened", "already_happened"],
    ["queue_wrong_issuer", "Wrong organisation", "wrong_issuer"],
  ] as const;

  return <section className="oe-queue" dir="ltr" aria-busy={loading}>
    {showGoalCard && !loading && <GoalCard
      direction={data.direction}
      busy={busy}
      v={v}
      onChoose={(goal) => void saveGoal(goal)}
      onDefer={() => void deferGoal()}
    />}

    <header className="oe-queue-header">
      <h1>{t("queue_morning", "Morning")}{firstName ? `, ${firstName}` : ""}</h1>
      <p>{count === 0 ? t("queue_nothing_today", "Nothing today.") : <><span style={mono}>{count}</span> {t("queue_things_today", "things today. About a minute.")}</>}</p>
      <div className="oe-machine-line"><span className={refreshing ? "oe-machine-dot oe-machine-dot-working" : "oe-machine-dot"} aria-hidden />
        <span>{refreshing ? t("queue_refreshing", "Looking again") : t("queue_still_reading", "Still reading")} — <b style={mono}>{data.surface_count}</b> {t("queue_sources_across", "sources across")} <b style={mono}>{data.entity_count}</b> {t("queue_organisations", "organisations")}</span>
        <button type="button" className="v23-textlink oe-refresh" onClick={() => void refresh()} disabled={refreshing || loading}>
          {refreshing ? t("queue_refreshing_short", "Refreshing…") : t("queue_refresh", "Refresh")}
        </button>
      </div>
      {refreshNote ? <p className="oe-refresh-note">{refreshNote}</p> : null}
      <button type="button" className="oe-tuning-door" onClick={() => setDrawerOpen(true)}>
        <strong>{t("queue_tuning_title", "What reaches you")}</strong>
        <span><b style={mono}>{data.rule_count}</b> {t("queue_rules_force", "rules in force")} · <b style={mono}>{data.held_count}</b> {t("queue_held_month", "held back this month")}</span>
      </button>
    </header>

    {proposal ? <AuraCard hover="none" className="oe-proposal" style={{ background: "var(--act-tint)", border: "1px solid var(--act)", borderRadius: 12 }}>
      <p><strong>{`That is the ${proposal.count}th ${proposal.value} ${t("queue_proposal_seen", "item you have turned down.")}`}</strong></p>
      <p>{t("queue_proposal_question", "Shall we stop showing them? You can undo it any time, and it will not touch anything else.")}</p>
      <div className="oe-actions"><AuraButton onClick={() => void answerProposal(true)} loading={busy}>{t("queue_yes_stop", "Yes, stop")}</AuraButton><AuraButton variant="ghost" onClick={() => void answerProposal(false)} disabled={busy}>{t("queue_no_keep", "No, keep them")}</AuraButton></div>
    </AuraCard> : directionQuestion && card ? <DirectionCard
      kind={directionQuestion}
      direction={data.direction}
      busy={busy}
      v={v}
      onChoose={(value) => void saveDirection(value)}
      onDefer={() => void deferDirection()}
    /> : card && validWhy(card) ? <>
      <AuraCard hover="none" className="oe-decision-card" style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 20 }}>
        <div className="oe-card-flags"><div className={`oe-lane oe-lane-${card.lane}`}><span aria-hidden />{card.access_state ? STATE_LABEL[card.access_state] : (card.lane === "act" ? t("queue_open_now", "Open now") : t("queue_worth_writing", "Worth writing about"))}{card.clock_text && <em> · {card.clock_text}</em>}</div>{card.purpose === "explore" && <span className="oe-purpose-chip">{v("purpose_explore")}</span>}</div>
        <h2>{card.title}</h2>
        <p className="oe-meta">{[card.issuer_name, card.location].filter(Boolean).join(" · ")}</p>
        {card.scope && <p className="oe-summary">{card.scope}</p>}
        {card.inference && <div className="oe-inference">
          {card.inference.what_we_saw && <p><strong>What we saw:</strong> “{card.inference.what_we_saw}”</p>}
          {card.inference.what_we_infer && <p><strong>What we infer:</strong> {card.inference.what_we_infer}</p>}
          {card.inference.what_would_confirm && <p><strong>What would confirm it:</strong> {card.inference.what_would_confirm}</p>}
        </div>}
        <div className="oe-why">
          <div className="oe-why-lead"><p><strong>{card.lane === "act" ? t("queue_why_you", "Why you") : t("queue_your_angle", "Your angle")}:</strong> {lead}</p><button type="button" className="v23-textlink" onClick={() => setExpanded((open) => !open)}>{expanded ? t("queue_less", "Less") : t("queue_more", "More")}</button></div>
          {expanded && <div className="oe-why-more">
            {(card.why_lines ?? []).slice(1).map((line, index) => <p key={index}><span className="oe-dot-evidence" aria-hidden />{line.text}</p>)}
            {card.gap_line?.text && <p><span className="oe-dot-risk" aria-hidden /><strong>{t("queue_risk", "You would have to answer for")}:</strong> {card.gap_line.text}</p>}
            <p><span className="oe-dot-rule" aria-hidden /><strong>{t("queue_clears_n_rules", "Clears {n} of your rules").replace("{n}", String(card.rule_count))}</strong></p>
            {card.quote && <blockquote>“{card.quote}” {card.source_url && <a href={card.source_url} target="_blank" rel="noreferrer">{t("source_link", "Source")}</a>}{card.last_checked && <small style={mono}>{String(card.last_checked).slice(0, 10)}</small>}</blockquote>}
          </div>}
        </div>
        {card.lane === "act" && (
          card.cost_of_door
            ? <p className="oe-door-cost"><span aria-hidden />{v("door_cost_en").replace("{cost}", card.cost_of_door)}</p>
            : <p className="oe-door-cost"><span aria-hidden />{t("queue_direct_cost", "Direct application. One form, no recruiter call first.")}</p>
        )}
        {!declining ? <div className="oe-actions"><AuraButton onClick={() => void decide("right")} loading={busy}>{card.lane === "act" ? t("queue_act", "I will go for it") : t("queue_draft", "Draft it")}</AuraButton><AuraButton variant="ghost" onClick={() => void decide("later")} disabled={busy}>{t("queue_later", "Later")}</AuraButton><AuraButton variant="ghost" onClick={() => setDeclining(true)} disabled={busy}>{t("queue_not_for_me", "Not for me")}</AuraButton></div> : <div className="oe-decline">
          <div><h3>{t("queue_not_because", "Not for me because")}</h3><div className="oe-chip-row">{taste.map(([key, fallback, scope, value]) => <button key={key} type="button" disabled={busy || !value} style={{ ...chipBase, border: "1px solid var(--border-default)" }} onClick={() => void decline(scope, value, null)}>{t(key, fallback)}</button>)}</div></div>
          <div><h3>{t("queue_or_wrong", "Or something is wrong with it")}</h3><div className="oe-chip-row">{truths.map(([key, fallback, truth]) => <button key={key} type="button" disabled={busy} className="oe-truth-chip" style={chipBase} onClick={() => void decline(null, null, truth)}>{t(key, fallback)}</button>)}</div></div>
        </div>}
      </AuraCard>
      {cards.slice(queueIndex + 1).length > 0 && <div className="oe-after"><SectionHeader label={t("queue_after_this", "After this")} />{cards.slice(queueIndex + 1).map((item) => <div key={item.id}><strong>{item.title}</strong><span>{item.lane === "act" ? t("queue_open_now", "Open now") : t("queue_worth_writing", "Worth writing about")}</span></div>)}</div>}
      <p className="oe-key-legend" style={mono}>{t("queue_keys", "1 choose · 2 later · 3 decline")}</p>
    </> : !loading && <AuraCard hover="none" className="oe-end" style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 20 }}>
      <h2>{t("queue_today_done", "That is today.")}</h2>
      <p>{data.cards.length === 0 ? t("queue_still_weak", "Nothing strong enough to send. The machine is still reading.") : t("queue_held_explain", "Anything held back remains available behind What reaches you.")}</p>
      {/* A promise with a date on it. It is never moved forward quietly, and
          the day it is missed it says so. */}
      {data.cards.length === 0 && windowDate && (() => {
        const line = data.window?.missed ? v("window_missed") : v("window_expected");
        const [before, after] = line.split("{date}");
        return <p className="oe-window-line">{before}<span style={mono}>{dateText(windowDate)}</span>{after}</p>;
      })()}

      {data.due_outcomes.map((due) => <div key={due.id} className="oe-outcome"><strong>{due.title}</strong><span>{t("queue_outcome_ask", "Did anything come of it?")}</span><div className="oe-chip-row">{[["applied","queue_applied","I applied"],["shortlisted","queue_shortlisted","I was shortlisted"],["won","queue_won","I got it"],["nothing","queue_nothing","Nothing came of it"]].map(([outcome,key,fallback]) => <button key={outcome} type="button" style={{ ...chipBase, border: "1px solid var(--border-default)" }} onClick={() => void answerOutcome(due.id,outcome)}>{t(key,fallback)}</button>)}</div></div>)}
      <div className="oe-end-links"><button type="button" className="v23-textlink" onClick={() => setDrawerOpen(true)}>{t("queue_setup", "Review what reaches you")}</button><button type="button" className="v23-textlink" onClick={() => setHistoryOpen((open) => !open)}>{t("queue_history", "History")}</button></div>
      {historyOpen && <div className="oe-history">{data.history.map((row) => <details key={row.id}><summary><strong>{row.title ?? "—"}</strong><span style={mono}>{String(row.shown_at).slice(0,10)}</span></summary><pre>{JSON.stringify(row.why, null, 2)}</pre></details>)}</div>}
    </AuraCard>}

    {drawerOpen && createPortal(<div className="oe-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}><aside className="oe-drawer" role="dialog" aria-modal="true" aria-label={t("queue_tuning_title", "What reaches you")}>
      <div className="oe-drawer-head"><h2>{t("queue_tuning_title", "What reaches you")}</h2><button type="button" onClick={() => setDrawerOpen(false)} aria-label={t("queue_close", "Close")}><X size={18}/></button></div>
      {data.direction?.goal && <section className="oe-direction-summary">
        <div className="oe-rule"><div><strong>{v("goal_sentence").replace("{goal}", v(`goal_${data.direction.goal}`)).replace("{date}", String(data.direction.goal_confirmed_at ?? "").slice(0, 10))}</strong></div><button type="button" className="v23-textlink" onClick={() => { setDrawerOpen(false); setGoalChanging(true); }}>{v("direction_change")}</button></div>
      </section>}
      {data.direction?.priority && <section className="oe-direction-summary">

        <div className="oe-rule"><div><strong>{v("direction_priority_sentence").replace("{priority}", v(`priority_${data.direction.priority}`)).replace("{date}", data.direction.priority_set_on ?? "")}</strong></div><button type="button" className="v23-textlink" disabled={directionAsked} onClick={() => changeDirection("priority")}>{v("direction_change")}</button></div>
        {data.direction.mix && <div className="oe-rule"><div><strong>{v("direction_mix_sentence").replace("{mix}", v(`mix_${data.direction.mix}`))}</strong></div><button type="button" className="v23-textlink" disabled={directionAsked} onClick={() => changeDirection("mix")}>{v("direction_change")}</button></div>}
      </section>}
      <section><SectionHeader label={t("queue_must_true", "Must be true")} />{data.rules.filter((rule) => rule.kind === "hard").map((rule) => <RuleRow key={rule.id} rule={rule} onDeactivate={deactivate} />)}</section>
      <section><SectionHeader label={t("queue_better_true", "Better if true")} />{data.rules.filter((rule) => rule.kind === "soft").map((rule) => <RuleRow key={rule.id} rule={rule} onDeactivate={deactivate} />)}<div className="oe-add-rule"><select value={newRuleType} onChange={(e) => setNewRuleType(e.target.value as "sector"|"issuer")}><option value="sector">Sector</option><option value="issuer">Organisation</option></select><input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder={t("queue_add_control", "Add a sector or organisation")} /><AuraButton size="sm" variant="ghost" onClick={() => void saveRule()} disabled={!newRule.trim() || busy}>+</AuraButton></div></section>
      <section><SectionHeader label={t("queue_held_title", "Held back this month")} />{data.held.map((held) => <div key={held.id} className="oe-held"><div><strong>{held.title ?? "—"}</strong><span>{held.reason ?? "—"}</span></div><AuraButton size="sm" variant="ghost" onClick={() => void showAnyway(held.id)}>{t("queue_show_anyway", "Show me anyway")}</AuraButton></div>)}<p className="oe-commitment">{t("queue_never_locked", "Filtering never locks you out. You can reopen anything held back here.")}</p></section>
    </aside></div>, document.body)}
  </section>;
}

/* One question, five answers, asked before anything else and asked whether or
   not there is a card. The engine may mark its reading of the profile; the
   member's hand is the only thing that sets the goal. */
function GoalCard({ direction, busy, v, onChoose, onDefer }: { direction: Direction | null; busy: boolean; v: ReturnType<typeof useVocab>; onChoose: (goal: Goal) => void; onDefer: () => void }) {
  const proposed = direction?.goal_proposed ?? null;
  return <AuraCard hover="none" className="oe-direction-card" style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 20 }}>
    <h2>{v("goal_question")}</h2>
    <p>{v("goal_sub")}</p>
    <div className="oe-direction-options">
      {goals.map((goal) => <Button key={goal} type="button" variant="outline" className={`oe-direction-option${direction?.goal === goal ? " is-selected" : ""}`} disabled={busy} onClick={() => onChoose(goal)} aria-pressed={direction?.goal === goal}>
        <span><strong>{v(`goal_${goal}`)}</strong>{proposed === goal && <small>{v("goal_proposed_marker")}</small>}</span>
      </Button>)}
    </div>
    <button type="button" className="v23-textlink oe-direction-later" disabled={busy} onClick={onDefer}>{v("goal_not_now")}</button>
  </AuraCard>;
}


function DirectionCard({ kind, direction, busy, v, onChoose, onDefer }: { kind: Exclude<DirectionQuestion, null>; direction: Direction | null; busy: boolean; v: ReturnType<typeof useVocab>; onChoose: (value: Priority | Mix) => void; onDefer: () => void }) {
  const isRenewal = kind === "priority" && Boolean(direction?.priority);
  const options = kind === "priority" ? priorities : mixes;
  return <AuraCard hover="none" className="oe-direction-card" style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 20 }}>
    <h2>{v(kind === "priority" ? (isRenewal ? "direction_priority_renew" : "direction_priority_question") : "direction_mix_question")}</h2>
    <div className="oe-direction-options">
      {options.map((option) => {
        const selected = kind === "priority" && direction?.priority === option;
        return <Button key={option} type="button" variant="outline" className={`oe-direction-option${selected ? " is-selected" : ""}`} disabled={busy} onClick={() => onChoose(option)} aria-pressed={selected}>
          <span><strong>{v(`${kind}_${option}`)}</strong>{kind === "priority" && <small>{v(`priority_${option}_sub`)}</small>}</span>
        </Button>;
      })}
    </div>
    {kind === "priority" && !isRenewal && <button type="button" className="v23-textlink oe-direction-later" disabled={busy} onClick={onDefer}>{v("direction_not_now")}</button>}
  </AuraCard>;
}

/* A rule shows its own derivation: the member's sentence with its date, and
   the profile fields it was read from. A rule nobody can trace is a guess. */
function RuleRow({ rule, onDeactivate }: { rule: Rule; onDeactivate: (id: string) => Promise<void> }) {
  const from = rule.derived_from ?? {};
  const comments = Array.isArray(from.comments) ? from.comments : [];
  const fields = Array.isArray(from.profile) ? from.profile : [];
  const legal = typeof from.legal_basis === "string" ? from.legal_basis : null;
  return <div className="oe-rule">
    <div>
      <strong>{rule.rule_text}</strong>
      <span><span style={mono}>{rule.stated_on}</span> · {rule.field ?? "—"}</span>
      {(comments.length > 0 || fields.length > 0 || legal) && <span className="oe-rule-derivation">
        <em>Derived from</em>
        {comments.map((comment, index) => <span key={`${comment.id ?? index}`}>“{comment.text}” <span style={mono}>{comment.said_on}</span></span>)}
        {fields.map((field) => <span key={field}>{field}</span>)}
        {legal && <span>{legal}</span>}
      </span>}
    </div>
    <button type="button" className="v23-textlink" onClick={() => void onDeactivate(rule.id)}>Change</button>
  </div>;
}


export default OpportunityQueue;