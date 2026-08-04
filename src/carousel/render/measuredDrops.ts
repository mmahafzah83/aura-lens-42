/**
 * WHAT MEASUREMENT ACTUALLY DECIDED, PUBLISHED FOR THE INSPECTOR.
 *
 * Slots are never dropped by counting words. The renderer measures the real
 * DOM, exhausts the fit ladder, and only then gives up one slot at a time.
 * That outcome lives here so the inspector names exactly the fields the
 * member's slide is not drawing — never a field that renders perfectly well.
 */
import { useSyncExternalStore } from "react";

export interface MeasuredDrops {
  /** Slot names measurement proved cannot be drawn. */
  dropped: string[];
  /** True when the slide still overflows with nothing left to give up. */
  overflow: boolean;
}

const EMPTY: MeasuredDrops = { dropped: [], overflow: false };
const store = new Map<string, MeasuredDrops>();
const listeners = new Set<() => void>();

const keyOf = (deckId: string, index: number) => `${deckId}:${index}`;

export function publishMeasuredDrops(deckId: string, index: number, value: MeasuredDrops): void {
  const key = keyOf(deckId, index);
  const prev = store.get(key);
  if (prev && prev.overflow === value.overflow && prev.dropped.join("|") === value.dropped.join("|")) return;
  store.set(key, value);
  listeners.forEach((l) => l());
}

export function readMeasuredDrops(deckId: string, index: number): MeasuredDrops {
  return store.get(keyOf(deckId, index)) ?? EMPTY;
}

export function useMeasuredDrops(deckId: string | undefined, index: number): MeasuredDrops {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (deckId ? store.get(keyOf(deckId, index)) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
}
