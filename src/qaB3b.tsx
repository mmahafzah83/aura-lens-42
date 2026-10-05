import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "./index.css";
import i18n from "./i18n";
import { applyDocumentLang } from "./i18n";
import ProfileIntelligence from "@/components/ProfileIntelligence";
import CapabilityRadar from "@/components/identity/CapabilityRadar";
import AuraCardPanel from "@/components/AuraCardPanel";
import VoiceWorkspace from "@/components/voice/VoiceWorkspace";
import MilestonesSection from "@/components/MilestonesSection";
import GuidedJourney from "@/components/GuidedJourney";
import DraftProfileCopy from "@/components/identity/DraftProfileCopy";

const c = new URLSearchParams(location.search).get("c") || "pi";
applyDocumentLang("ar" as any);
i18n.changeLanguage("ar").then(() => { document.documentElement.dir = "rtl"; document.documentElement.lang = "ar"; });
const now = new Date().toISOString();
const ms = { milestones: [
  { id: "profile_complete", name: "Identity set", earned: true, earned_at: "2026-08-10T09:00:00Z", context: { sector_focus: "Energy" } },
  { id: "sector_depth", name: "Sector depth", earned: true, earned_at: now, context: { themes: ["Grid Storage", "Hydrogen Policy", "x_y"] } },
  { id: "five_signals", name: "Five signals", earned: true, earned_at: "2026-09-01T09:00:00Z", context: { count: 7 } },
  { id: "weekly_rhythm_4", name: "Weekly rhythm", earned: true, earned_at: "2026-09-21T09:00:00Z", context: { active_in_last_6: 5 } },
  { id: "first_publish", name: "First publish", earned: false, earned_at: null, context: null },
  { id: "voice_trained", name: "Voice trained", earned: false, earned_at: null, context: null },
] };
const el = {
  pi: <ProfileIntelligence intelligenceStage={2} onGenerateContent={() => {}} />,
  cr: <CapabilityRadar userId="u1" band="table" />,
  cra: <CapabilityRadar userId="u1" band="table" />,
  crc: <CapabilityRadar userId="u1" band={null} />,
  acp: <AuraCardPanel onNavigateAssessment={() => {}} onNavigatePhoto={() => {}} onNavigateSettings={() => {}} dir="rtl" />,
  vw: <VoiceWorkspace userId={null} onWrite={() => {}} />,
  ms: <MilestonesSection userId={null} data={ms as any} />,
  gj: <GuidedJourney journey={{ profileComplete: true, assessmentComplete: false, voiceTrained: false, voiceSkipped: false } as any} />,
  dpc: <DraftProfileCopy target="headline" open onClose={() => {}} handle="test" onReadAgain={() => {}} />,
  dpt: <DraftProfileCopy target="about" open onClose={() => {}} onReadAgain={() => {}} />,
}[c];
createRoot(document.getElementById("root")!).render(
  <MemoryRouter><div dir="rtl" style={{ padding: 12, maxWidth: 1100, margin: "0 auto" }}>{el}</div></MemoryRouter>,
);
