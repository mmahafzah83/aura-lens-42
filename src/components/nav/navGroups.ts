import { Compass, Radar, PenLine, BarChart3, User, BriefcaseBusiness } from "lucide-react";

/**
 * BUILD 10 — nine doors become five.
 *
 * This is a grouping layer ABOVE the existing tab system. The internal tab
 * values, deep links, `aura:switch-tab` events and every `onSwitchTab` call
 * site are untouched: a group simply says which tabs live behind one door.
 */
export type NavGroupKey = "home" | "signals" | "opportunities" | "write" | "record" | "you";

export interface NavGroup {
  key: NavGroupKey;
  /** i18n key for the door name (frame.nav.*). */
  labelKey: string;
  icon: typeof Compass;
  testId: string;
  /** i18n key for the one-line description. */
  blurbKey: string;
  /** The tab a click on the door opens. */
  primary: string;
  /** Every tab that lights this door. */
  members: string[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "home", labelKey: "frame.nav.home", icon: Compass, testId: "nav-home",
    blurbKey: "frame.nav.homeBlurb",
    primary: "home", members: ["home"],
  },
  {
    key: "signals", labelKey: "frame.nav.signals", icon: Radar, testId: "nav-intelligence",
    blurbKey: "frame.nav.signalsBlurb",
    primary: "intelligence", members: ["intelligence", "overnight"],
  },
  {
    key: "opportunities", labelKey: "frame.nav.opportunities", icon: BriefcaseBusiness, testId: "nav-opportunities",
    blurbKey: "frame.nav.opportunitiesBlurb",
    primary: "opportunities", members: ["opportunities"],
  },
  {
    key: "write", labelKey: "frame.nav.write", icon: PenLine, testId: "nav-publish",
    blurbKey: "frame.nav.writeBlurb",
    primary: "authority", members: ["authority", "drafts", "library"],
  },
  {
    key: "record", labelKey: "frame.nav.record", icon: BarChart3, testId: "nav-impact",
    blurbKey: "frame.nav.recordBlurb",
    primary: "momentum", members: ["momentum", "influence"],
  },
  {
    key: "you", labelKey: "frame.nav.you", icon: User, testId: "nav-mystory",
    blurbKey: "frame.nav.youBlurb",
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
