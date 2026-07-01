import type { TierKey } from "@/hooks/useTierFromImprint";

export const TIER_LADDER_INTRO =
  "Your Imprint carries you through five stages. Each one reflects how much of your expertise the market can actually see — and each is earned, never given.";

export const TIER_DIP_NOTE =
  "Your stage can move down as well as up — but never suddenly. If your Imprint slips below a stage, Aura holds your stage through a short grace period first, so one quiet week never costs you what you've built. Pick the rhythm back up and you stay right where you are.";

export interface TierCopy {
  meaning: string;
  howReached: string;
  whatLifts: string;
}

export const TIER_COPY: Record<TierKey, TierCopy> = {
  observer: {
    meaning:
      "You're reading your market closely. Aura is learning what you watch, and beginning to see the patterns in it.",
    howReached: "You've started — an account, a first look, a capture or two.",
    whatLifts:
      "Capture a few more of the pieces you already read. Every capture sharpens what Aura can see in your field.",
  },
  explorer: {
    meaning:
      "Your reading is taking shape. Aura can see the themes you keep returning to — the territory becoming yours.",
    howReached: "You've captured enough for real patterns to form.",
    whatLifts:
      "Keep the rhythm, and turn one reading into a post. The moment your voice joins your reading, you move up.",
  },
  strategist: {
    meaning:
      "Your reading is strong and your themes are clear. You see your market well — the next step is to be seen saying it.",
    howReached: "A solid base of signals and a steady habit of capturing.",
    whatLifts:
      "Publish from what you capture. Posts drawn from your own signals are what carry you toward Voice.",
  },
  voice: {
    meaning:
      "You're no longer only reading the market — you're shaping the conversation in it. Your expertise is visible, and it's unmistakably yours.",
    howReached:
      "Your reading and your voice now work together — you publish from what you see.",
    whatLifts:
      "Consistency and reach. Keep publishing from your signals, week after week, and your presence compounds.",
  },
  presence: {
    meaning:
      "You're a fixed point in your field. When your market thinks about your subject, it thinks of you.",
    howReached:
      "Sustained reading, a distinct voice, and a rhythm you've held for the long run.",
    whatLifts:
      "You're at the top of the ladder — now it's about holding it. Presence is kept by the same habits that earned it.",
  },
};
