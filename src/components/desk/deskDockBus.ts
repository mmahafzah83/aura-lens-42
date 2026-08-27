import { useEffect, useState } from "react";

/**
 * deskDockBus — the one place the Desk's live state lives.
 *
 * The Desk surface (AskAuraV2) writes to it; the dock, and the mobile tab
 * bar mark, read from it. It is deliberately tiny: no badge counts, no
 * queues, no notification semantics. Three states and one last exchange.
 */

export type DeskDockState =
  | { kind: "quiet" }
  | { kind: "working"; label: string }
  | { kind: "found"; text: string };

export interface DeskExchange {
  question: string;
  answer: string;
}

interface Snapshot {
  state: DeskDockState;
  last: DeskExchange | null;
  /** Increments once per result. The pulse is keyed on it, so it fires once. */
  foundId: number;
}

let snapshot: Snapshot = { state: { kind: "quiet" }, last: null, foundId: 0 };
const listeners = new Set<() => void>();

/**
 * Tasks in flight. A run begun on the Desk keeps the dock turning after the
 * Desk closes, and two overlapping runs cannot cancel each other: only the
 * last one to finish stops the hand.
 */
let runs = 0;

function emit() {
  for (const l of listeners) l();
}

/** At most three words. The dock never grows to fit a sentence. */
export function setDeskWorking(label: string) {
  const words = label.trim().split(/\s+/).slice(0, 3).join(" ");
  snapshot = { ...snapshot, state: { kind: "working", label: words } };
  emit();
}

/** A task starts. The hand turns until every started task has ended. */
export function beginDeskRun(label: string) {
  runs += 1;
  setDeskWorking(label);
}

/** A task ends with nothing to show: quiet only when no other run is left. */
export function endDeskRun() {
  runs = Math.max(0, runs - 1);
  if (runs === 0 && snapshot.state.kind === "working") setDeskQuiet();
}

export function setDeskFound(text: string, last?: DeskExchange) {
  runs = Math.max(0, runs - 1);
  snapshot = {
    state: { kind: "found", text: text.trim() },
    last: last ?? snapshot.last,
    foundId: snapshot.foundId + 1,
  };
  emit();
}

export function setDeskQuiet() {
  runs = 0;
  snapshot = { ...snapshot, state: { kind: "quiet" } };
  emit();
}

export function getDeskSnapshot(): Snapshot {
  return snapshot;
}

export function useDeskDock(): Snapshot {
  const [s, setS] = useState<Snapshot>(snapshot);
  useEffect(() => {
    const fn = () => setS(getDeskSnapshot());
    listeners.add(fn);
    fn();
    return () => { listeners.delete(fn); };
  }, []);
  return s;
}
