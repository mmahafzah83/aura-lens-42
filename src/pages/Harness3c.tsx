import { useEffect, useState } from "react";
import i18n from "@/i18n";
import HowYouAppear from "@/components/identity/HowYouAppear";
import MarketMirror from "@/components/MarketMirror";
import MilestonesSection from "@/components/MilestonesSection";
import AuraCardPanel from "@/components/AuraCardPanel";
import ProfileManagement from "@/components/ProfileManagement";
import { classifyPublishError, publishFailureText } from "@/lib/publishFailure";

const UID = "00000000-0000-4000-8000-000000000001";
const ms = {
  milestones: [
    { id: "profile_complete", name: "Profile complete", earned: true, earned_at: "2026-09-21T10:00:00Z", context: {} },
    { id: "first_signal", name: "First signal", earned: true, earned_at: "2026-09-22T10:00:00Z", context: {} },
    { id: "voice_trained", name: "Voice trained", earned: true, earned_at: "2026-09-23T10:00:00Z", context: {} },
    { id: "first_publish", name: "Published through Aura", earned: true, earned_at: "2026-09-24T10:00:00Z", context: {} },
    { id: "brand_assessment", name: "Brand assessment", earned: true, earned_at: "2026-09-25T10:00:00Z", context: {} },
    { id: "five_signals", name: "Five signals", earned: true, earned_at: "2026-09-26T10:00:00Z", context: { count: 5 } },
    { id: "sector_depth", name: "Sector depth", earned: false, earned_at: null, context: {} },
    { id: "weekly_rhythm_4", name: "Weekly rhythm", earned: false, earned_at: null, context: {} },
  ],
};

export default function Harness3c() {
  const [ok, setOk] = useState(false);
  useEffect(() => { i18n.changeLanguage("ar").then(() => { document.documentElement.dir = "rtl"; document.documentElement.lang = "ar"; setOk(true); }); }, []);
  if (!ok) return null;
  const fails = [
    classifyPublishError("quality check", false, true),
    classifyPublishError("", false),
    classifyPublishError("Request failed", true),
  ];
  return (
    <div dir="rtl" style={{ padding: 16, display: "grid", gap: 24, maxWidth: 1100, margin: "0 auto" }}>
      <section id="presence"><HowYouAppear userId={UID} /></section>
      <section id="mirror"><MarketMirror userId={UID} /></section>
      <section id="ms"><MilestonesSection userId={UID} data={ms as any} /></section>
      <section id="card"><AuraCardPanel /></section>
      <section id="pf" style={{ display: "grid", gap: 8 }}>
        {fails.map((f, i) => (
          <div key={i} role="alert" style={{ border: "1px solid var(--destructive, #C0392B)", borderRadius: 8, padding: 12, fontFamily: "var(--font-arabic)", lineHeight: 1.9 }}>
            {publishFailureText(f, "ar", (k, o) => i18n.t(k, o as any) as string)}
          </div>
        ))}
      </section>
      <section id="pm"><ProfileManagement startExpanded /></section>
    </div>
  );
}
