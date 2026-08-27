import type { ReactNode } from "react";

/**
 * DeskSlot — the content slot of the Desk.
 *
 * THE RULE, ENFORCED BY THE TYPE: the slot holds exactly one card. `card` is a
 * single value, `render` is a total map from that value to a node, and the
 * component performs exactly one lookup — `render[card]()`. There is no array,
 * no list, no `&&` chain, so a second card cannot be appended by accident.
 *
 * `probe` is the one exception, and it is not a card: it is a decider that must
 * be mounted to know whether it has anything to say (the Mirror). It is
 * display:none and aria-hidden until it IS the card, at which point the slot
 * shows it and renders nothing else.
 */

export type DeskCardKind = "loading" | "return" | "priority" | "mirror" | "ledger" | "opener";

interface Props {
  card: DeskCardKind;
  /** Mounted always, visible only when `card === "mirror"`. Renders null while deciding. */
  probe?: ReactNode;
  render: Record<DeskCardKind, () => ReactNode>;
}

export default function DeskSlot({ card, probe, render }: Props) {
  const isMirror = card === "mirror";
  return (
    <div data-testid="desk-slot" data-desk-slot={card}>
      <div style={isMirror ? undefined : { display: "none" }} aria-hidden={!isMirror}>{probe}</div>
      {!isMirror && render[card]()}
    </div>
  );
}
