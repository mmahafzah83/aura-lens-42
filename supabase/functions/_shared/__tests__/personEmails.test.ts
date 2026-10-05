import { describe, it, expect } from "vitest";
import {
  welcomeEmail, readEmail, resumeEmail, passwordResetEmail, accountNotificationEmail,
  waitlistEmail, inviteEmail, declineEmail, colleagueReferralEmail, mirrorReadEmail,
  type BuiltEmail,
} from "../personEmails.ts";
import type { EmailLang } from "../emailTemplate.ts";

const READ = { archetype: "The quiet operator", market_read: "You are read as steady.", uncontested_space: "Port policy.", honest_gap: "Few posts.", own_words_quote: "Ship it.", own_words_read: "Plain." };

export const ALL: Record<string, (l: EmailLang) => BuiltEmail> = {
  welcome: (l) => welcomeEmail(l, "https://www.aura-intel.org/auth?next=%2Fonboarding"),
  read: (l) => readEmail(l, { archetype: "Grounded builder", marketRead: "Your field sees you as careful.", subjects: ["Ports", "Rail"], thin: ["Writing"] }),
  resume: (l) => resumeEmail(l, 3),
  "password-reset": (l) => passwordResetEmail(l, "Sara", "https://example.com/reset"),
  "password-set": (l) => accountNotificationEmail(l, "password_set", "Sara")!,
  "password-changed": (l) => accountNotificationEmail(l, "password_changed", null)!,
  waitlist: (l) => waitlistEmail(l, "Sara"),
  invite: (l) => inviteEmail(l, { firstName: "Sara", inviterFirst: "Omar", inviterNote: "You should see this.", url: "https://aura-intel.org/accept-invitation?token=x" }),
  decline: (l) => declineEmail(l, "Sara"),
  colleague: (l) => colleagueReferralEmail(l, "Omar", "Worth a look"),
  mirror: (l) => mirrorReadEmail(l, READ),
};

/** "Aura" anywhere except inside an address or URL (aura-intel.org). */
const strayAura = (s: string) => s.replace(/aura-intel\.org/gi, "").replace(/aura-mark/gi, "").match(/aura/i);

describe("person-triggered emails", () => {
  for (const [name, build] of Object.entries(ALL)) {
    for (const lang of ["en", "ar"] as EmailLang[]) {
      it(`${name} · ${lang}`, () => {
        const m = build(lang);
        expect(strayAura(m.html + m.subject + m.preheader)).toBeNull();
        if (lang === "ar") {
          expect(m.html).toContain('dir="rtl"');
          expect(m.html).not.toMatch(/letter-spacing:\s*\.|letter-spacing:\s*0\.[1-9]/);
          expect(m.html).not.toContain("uppercase");
          expect(m.html).not.toMatch(/[→←↗]|&rarr;|&larr;/);
          expect(m.html).not.toContain("font-style:italic");
        } else {
          expect(m.html).not.toContain('dir="rtl"');
        }
      });
    }
  }
});
