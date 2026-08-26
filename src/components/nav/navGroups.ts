import { Compass, Radar, PenLine, BarChart3, User } from "lucide-react";

/**
 * BUILD 10 — nine doors become five.
 *
 * This is a grouping layer ABOVE the existing tab system. The internal tab
 * values, deep links, `aura:switch-tab` events and every `onSwitchTab` call
 * site are untouched: a group simply says which tabs live behind one door.
 */
export type NavGroupKey = "home" | "signals" | "write" | "record" | "you";

export interface NavGroup {
  key: NavGroupKey;
  label: string;
  icon: typeof Compass;
  testId: string;
  blurb: string;
  /** The tab a click on the door opens. */
  primary: string;
  /** Every tab that lights this door. */
  members: string[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "home", label: "Home", icon: Compass, testId: "nav-home",
    blurb: "Your brief: what moved and what to do next.",
    primary: "home", members: ["home"],
  },
  {
    key: "signals", label: "Signals", icon: Radar, testId: "nav-intelligence",
    blurb: "What Aura found, and what it read overnight to find it.",
    primary: "intelligence", members: ["intelligence", "overnight"],
  },
  {
    key: "write", label: "Write", icon: PenLine, testId: "nav-publish",
    blurb: "Make the post, and everything you have made.",
    primary: "authority", members: ["authority", "drafts", "library"],
  },
  {
    key: "record", label: "Record", icon: BarChart3, testId: "nav-impact",
    blurb: "What already happened, and what it did.",
    primary: "momentum", members: ["momentum", "influence"],
  },
  {
    key: "you", label: "You", icon: User, testId: "nav-mystory",
    blurb: "Who Aura thinks you are, and what you choose to watch.",
    primary: "identity", members: ["identity", "widgets"],
  },
];

export function groupForTab(tab: string): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.members.includes(tab));
}

export function isGroupActive(group: NavGroup, tab: string): boolean {
  return group.members.includes(tab);
}

/**
 * First Flight dims doors, not tabs. A door stays lit when any member is lit;
 * it dims when no member is lit and at least one member is dimmed.
 */
export function isGroupDimmed(group: NavGroup, dimmedTabs: Set<string>, activeTab: string): boolean {
  if (isGroupActive(group, activeTab)) return false;
  if (dimmedTabs.size === 0) return false;
  return group.members.some((m) => dimmedTabs.has(m));
}
