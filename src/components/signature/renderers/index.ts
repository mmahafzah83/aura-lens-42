import CoverCard from "./CoverCard";
import SignatureCard from "./SignatureCard";
import FrameCard from "./FrameCard";
import LineCard from "./LineCard";
import MilestoneCard from "./MilestoneCard";
import type { RendererProps } from "./shared";

export { CoverCard, SignatureCard, FrameCard, LineCard, MilestoneCard };
export type { RendererProps, Lang, Mood } from "./shared";

export type DoorId = "me" | "photo" | "words";
export type FamilyId = "cover" | "signature" | "frame" | "line" | "milestone";

export interface FamilyEntry {
  id: FamilyId;
  label: string;
  component: React.ComponentType<RendererProps>;
  door: DoorId | null;
}

/**
 * FAMILIES — registry of card renderers with their door affinity.
 * MilestoneCard has `door: null` (built but not routed).
 */
export const FAMILIES: FamilyEntry[] = [
  { id: "cover", label: "Cover", component: CoverCard, door: "me" },
  { id: "signature", label: "Signature", component: SignatureCard, door: "me" },
  { id: "frame", label: "The Frame", component: FrameCard, door: "photo" },
  { id: "line", label: "The Line", component: LineCard, door: "words" },
  { id: "milestone", label: "Milestone", component: MilestoneCard, door: null },
];

/** Door → ordered family list. */
export const DOOR_FAMILIES: Record<DoorId, FamilyEntry[]> = {
  me: FAMILIES.filter((f) => f.door === "me"),
  photo: FAMILIES.filter((f) => f.door === "photo"),
  words: FAMILIES.filter((f) => f.door === "words"),
};