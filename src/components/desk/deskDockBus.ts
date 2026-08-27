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
}

let snapshot: Snapshot = { state: { kind: "quiet" }, last: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** At most three words. The dock never grows to fit a sentence. */
export function setDeskWorking(label: string) {
  const words = label.trim().split(/\s+/).slice(0, 3).join(" ");
  snapshot = { ...snapshot, state: { kind: "working", label: words } };
  emit();
}

export function setDeskFound(text: string, last?: DeskExchange) {
  snapshot = { state: { kind: "found", text: text.trim() }, last: last ?? snapshot.last };
  emit();
}

export function setDeskQuiet() {
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
