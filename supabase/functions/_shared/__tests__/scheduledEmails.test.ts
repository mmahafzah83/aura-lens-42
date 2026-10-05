import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  lifecycleEmail, lifecycleMessage, draftReadyEmail, morningSignalEmail, weeklyBriefEmail,
  type LifecycleType, type LifecycleCtx, type BuiltEmail,
} from "../scheduledEmails.ts";
import { renderCardAlert, type AlertCard } from "../cardAlertEmail.ts";
import type { EmailLang } from "../emailTemplate.ts";

const CTX: LifecycleCtx = {
  firstName: "Sara", sectorFocus: "Port logistics", level: "Director", entriesCount: 4,
  topSignals: [{ id: "s1", signal_title: "Port automation is outpacing labour policy", confidence: 0.7 }],
  score: 42, tier: "Strategist", signalCount: 3,
  fadingSignals: [
    { signal_title: "Rail freight subsidies", confidence: 0.3, velocity_status: "fading" },
    { signal_title: "Customs digitisation", confidence: 0.2, velocity_status: "dormant" },
  ],
  fadingCount: 2, publishedCount: 1,
  recentTrend: { headline: "Gulf ports raise automation budgets", source: "Reuters" },
  postTitle: "port automation", postPreview: "Automation in ports is not a labour story. It is a policy story.",
  postId: "p1", missingGates: ["photo", "country", "assessment"], monthName: "October",
};
const TYPES: LifecycleType[] = ["day1", "day3", "day7", "inactive", "silence", "post_ready", "aura_card_ready", "aura_card_nudge", "aura_card_monthly"];

const FINDING = (id: string, title: string) => ({
  id, user_id: "u", url: `https://example.com/${id}`, title, source: "Financial Times",
  relevance_score: 0.8, implication: "Your view on port policy is now the live question.",
  created_at: "2026-10-05T04:12:00Z", themes: ["port policy"],
});
const VOCAB: Record<string, { en: string; ar: string }> = {
  email_digest_intro: { en: "Here is what cleared your bar since your last summary.", ar: "هذا ما تجاوز معيارك منذ ملخصك الأخير." },
  email_digest_subject: { en: "{n} new roles cleared your bar", ar: "أدوار جديدة تجاوزت معيارك: {n}" },
  email_footer: { en: "You chose these emails in Tune. Change or stop them there at any time.", ar: "اخترت هذه الرسائل من «الضبط». غيّرها أو أوقفها من هناك متى شئت." },
  email_instant_intro: { en: "This one is among the strongest we have found for you.", ar: "هذا من أقوى ما وجدناه لك." },
  email_instant_subject: { en: "A role that clears your bar: {title}", ar: "دور يتجاوز معيارك: {title}" },
  email_open: { en: "Open in KnownBy", ar: "افتح في KnownBy" },
};
const v = (k: string, l: EmailLang) => VOCAB[k]?.[l] ?? k;
const CARD = (id: string, title: string): AlertCard => ({
  id, opportunity_id: id, fit_band: "strong", created_at: "2026-10-05T00:00:00Z",
  opp: { title, issuer_raw: "Saudi Ports Authority", location: "Riyadh", deadline: "2026-10-30T00:00:00Z", alive: true },
});

export const ALL: Record<string, (l: EmailLang) => BuiltEmail> = {
  ...Object.fromEntries(TYPES.map((t) => [`lifecycle-${t}`, (l: EmailLang) => lifecycleEmail(t, CTX, l)])),
  "lifecycle-day1-nosignal": (l) => lifecycleEmail("day1", { ...CTX, topSignals: [] }, l),
  "lifecycle-day3-notrend": (l) => lifecycleEmail("day3", { ...CTX, recentTrend: null, sectorFocus: null }, l),
  "lifecycle-noname": (l) => lifecycleEmail("inactive", { ...CTX, firstName: "", fadingSignals: [], recentTrend: null }, l),
  "M1": (l) => lifecycleMessage(l, "M1", "Sara"),
  "M3": (l) => lifecycleMessage(l, "M3", ""),
  "M4": (l) => lifecycleMessage(l, "M4", "Sara", "Port automation is outpacing labour policy"),
  "draft-ready": (l) => draftReadyEmail({
    firstName: "Sara", shortTopic: "port automation", fullTopic: "Port automation", excerpt: "Automation in ports is not a labour story. It is a policy story, and the policy is late.",
    nReadings: 5, nSources: 3, newestFragmentIso: new Date().toISOString(), velocityStatus: "accelerating", ctaUrl: "https://www.aura-intel.org/dashboard?draft=x",
  }, l),
  "draft-ready-nocounts": (l) => draftReadyEmail({
    firstName: null, shortTopic: "a finding you kept", fullTopic: "a finding you kept", excerpt: "Short.",
    nReadings: null, nSources: null, newestFragmentIso: null, velocityStatus: null, ctaUrl: "https://www.aura-intel.org/dashboard?draft=x",
  }, l),
  "morning-signal": (l) => morningSignalEmail(FINDING("f1", "Ports bet on automation"), [FINDING("f2", "Labour rules lag"), FINDING("f3", "Customs goes digital")], l),
  "weekly-brief": (l) => weeklyBriefEmail({
    firstName: "Sara", dayDate: l === "ar" ? "الاثنين 5 أكتوبر" : "Monday, October 5",
    topSignals: [{ id: "s1", title: "Port automation is outpacing labour policy", currentPct: 70, deltaPct: 6, whyNow: "Budgets moved this quarter." }, { id: "s2", title: "Rail freight subsidies", currentPct: 30, deltaPct: -4 }],
    postsThisWeek: 1, postsLastWeek: 0, activeWeeks: 5, emailParam: "sara@example.com",
    marketPulse: { headline: "Gulf ports raise automation budgets", url: "https://example.com/a", isExternal: true },
    worthReading: { title: "The labour cost of smart ports", url: "https://example.com/b", author: "The Economist", readMinutes: 5, why: null },
    readyPost: { id: "d1", body: "Automation in ports is not a labour story." },
  }, l),
  "weekly-brief-empty": (l) => weeklyBriefEmail({
    firstName: "Sara", dayDate: "x", topSignals: [], postsThisWeek: 0, postsLastWeek: 2, activeWeeks: 0, emailParam: "s@e.com",
    marketPulse: { headline: "Steady quarter.", url: null, isExternal: false }, worthReading: null, readyPost: null,
  }, l),
  "card-alert-instant": (l) => renderCardAlert("instant", [CARD("c1", "Director of Port Operations")], l, v, "https://aura-intel.org"),
  "card-alert-digest": (l) => renderCardAlert("digest", [CARD("c1", "Director of Port Operations"), CARD("c2", "Head of Logistics Strategy")], l, v, "https://aura-intel.org"),
};

const strayAura = (s: string) => s.replace(/aura-intel\.org/gi, "").replace(/aura-mark/gi, "").replace(/aura_card/gi, "").match(/aura/i);
const OUT = process.env.EMAIL_RENDER_DIR;

describe("scheduled emails", () => {
  for (const [name, build] of Object.entries(ALL)) {
    for (const lang of ["en", "ar"] as EmailLang[]) {
      it(`${name} · ${lang}`, () => {
        const m = build(lang);
        if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${name}.${lang}.html`, m.html); }
        expect(strayAura(m.html + m.subject + (m.preheader ?? ""))).toBeNull();
        if (lang === "ar") {
          expect(m.html).toContain('dir="rtl"');
          expect(m.html).not.toMatch(/letter-spacing:\s*\.|letter-spacing:\s*0\.[1-9]/);
          expect(m.html).not.toContain("uppercase");
          expect(m.html).not.toMatch(/[→←↗]|&rarr;|&larr;/);
          expect(m.html).not.toContain("font-style:italic");
          expect(m.html).not.toMatch(/[٠-٩]/);
        } else {
          expect(m.html).not.toContain('dir="rtl"');
        }
      });
    }
  }
});
