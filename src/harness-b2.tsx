import i18n from "./i18n";
import "./index.css";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
const chain: any = new Proxy(function () {}, {
  get: (_t, p) => p === "then" ? (r: any) => r({ data: p === "then" ? null : null, error: null }) : chain,
  apply: () => chain,
});
(supabase as any).from = () => chain;
(supabase as any).auth.getUser = async () => ({ data: { user: { id: "x" } } });
import FirstFlightCard from "@/components/FirstFlightCard";
import IdentityDriftBanner from "@/components/IdentityDriftBanner";
import LinkedInNudge from "@/components/home/LinkedInNudge";
import ReadTierHome from "@/components/home/ReadTierHome";
const lang = new URLSearchParams(location.search).get("l") || "ar";
document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
const noop = () => {};
const ff = (o: any) => ({ loading: false, active: true, currentStep: 2, steps: { s1: true, s2: false, s3: false, s4: false }, topSignal: null, justCompleted: false, signalSeen: false, markSignalSeen: noop, retire: noop, skip: noop, refresh: noop, failed: false, dimmedTabs: new Set(), ...o });
i18n.changeLanguage(lang).then(() => {
  createRoot(document.getElementById("root")!).render(
    <MemoryRouter><div style={{ padding: 12 }}>
      <LinkedInNudge userId="x" />
      <FirstFlightCard state={ff({ failed: true }) as any} onConnectLinkedIn={noop} onOpenCapture={noop} onOpenSignal={noop} onWriteFromSignal={noop} />
      <FirstFlightCard state={ff({ currentStep: 3, steps: { s1: true, s2: true, s3: false, s4: false } }) as any} onConnectLinkedIn={noop} onOpenCapture={noop} onOpenSignal={noop} onWriteFromSignal={noop} />
      <FirstFlightCard state={ff({ justCompleted: true, steps: { s1: true, s2: true, s3: true, s4: true } }) as any} onConnectLinkedIn={noop} onOpenCapture={noop} onOpenSignal={noop} onWriteFromSignal={noop} />
      <IdentityDriftBanner />
      <ReadTierHome />
    </div></MemoryRouter>);
  setTimeout(() => window.dispatchEvent(new CustomEvent("aura:identity-drift", { detail: { driftPercentage: 62, dominantTopic: "سلاسل التبريد", isDrifting: true } })), 300);
});
