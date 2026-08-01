import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AuraLogo from "@/components/brand/AuraLogo";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import LinkedInCallback from "./pages/LinkedInCallback";
import RequestAccess from "./pages/RequestAccess";
import AcceptInvitation from "./pages/AcceptInvitation";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Trust from "./pages/Trust";
import Guide from "./pages/Guide";
import Settings from "./pages/Settings";
import PasswordGate from "./components/PasswordGate";
import AdminGate from "./components/AdminGate";
import { ThemeProvider } from "./components/ThemeProvider";
import CookieConsent from "./components/CookieConsent";
import ErrorBoundary from "./components/ErrorBoundary";
import PageViewTracker from "./components/PageViewTracker";

// Lazy-loaded heavy / rarely-visited routes
// Old landing (src/pages/Landing.tsx) is unmounted but kept in the tree.
const Landing = lazy(() => import("./pages/LandingV23"));
const CalibPreview = lazy(() => import("./pages/__CalibPreview"));
const LandingV2 = lazy(() => import("./pages/LandingV2"));
const TrendDetail = lazy(() => import("./pages/TrendDetail"));
const CarouselStudio = lazy(() => import("./pages/CarouselStudio"));
const EditionStudio = lazy(() => import("./pages/EditionStudio"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminAccess = lazy(() => import("./pages/AdminAccess"));
const AdminCost = lazy(() => import("./pages/AdminCost"));
const AdminPeople = lazy(() => import("./pages/AdminPeople"));
const AdminJourney = lazy(() => import("./pages/AdminJourney"));
const AdminCrons = lazy(() => import("./pages/AdminCrons"));
const AdminDesignSystem = lazy(() => import("./pages/AdminDesignSystem"));
const AdminExperience = lazy(() => import("./pages/AdminExperience"));
const AdminAppearance = lazy(() => import("./pages/AdminAppearance"));
const AdminQA = lazy(() => import("./pages/AdminQA"));
const AdminGuideHealth = lazy(() => import("./pages/AdminGuideHealth"));
const AdminStandard = lazy(() => import("./pages/AdminStandard"));
const OurStory = lazy(() => import("./pages/OurStory"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const CardPreview = lazy(() => import("./pages/CardPreview"));
const GuideThoughtLeadershipStrategy = lazy(() => import("./pages/GuideThoughtLeadershipStrategy"));
const SignatureStudio = lazy(() => import("./pages/SignatureStudio"));
const SignatureHarness = lazy(() => import("./pages/SignatureHarness"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <Toaster />
        <Sonner />
        <ErrorBoundary>
        <BrowserRouter>
          <CookieConsent />
          <PageViewTracker />
          <Suspense
            fallback={
              <div
                className="min-h-screen flex flex-col items-center justify-center gap-3"
                style={{ background: "var(--paper)" }}
              >
                <div className="aura-gold-pulse">
                  <AuraLogo size={48} />
                </div>
                <div
                  className="text-lg"
                  style={{
                    fontFamily: "var(--serif)",
                    color: "var(--ink)",
                    letterSpacing: "0.04em",
                  }}
                >
                  Aura
                </div>
                <p className="text-sm" style={{ color: "var(--ink-4)" }}>
                  Loading your intelligence…
                </p>
              </div>
            }
          >
          <Routes>
            <Route path="/" element={<LandingV2 />} />
            <Route path="/v2" element={<LandingV2 />} />
            <Route path="/__calib" element={<CalibPreview />} />
            <Route path="/home" element={<PasswordGate><Dashboard /></PasswordGate>} />
            <Route path="/dashboard" element={<PasswordGate><Dashboard /></PasswordGate>} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/request-access" element={<RequestAccess />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route path="/admin" element={<PasswordGate><AdminGate><Admin /></AdminGate></PasswordGate>} />
            <Route path="/admin/access" element={<PasswordGate><AdminGate><AdminAccess /></AdminGate></PasswordGate>} />
            <Route path="/admin/cost" element={<PasswordGate><AdminGate><AdminCost /></AdminGate></PasswordGate>} />
            <Route path="/admin/people" element={<PasswordGate><AdminGate><AdminPeople /></AdminGate></PasswordGate>} />
            <Route path="/admin/journey" element={<PasswordGate><AdminGate><AdminJourney /></AdminGate></PasswordGate>} />
            <Route path="/admin/crons" element={<PasswordGate><AdminGate><AdminCrons /></AdminGate></PasswordGate>} />
            <Route path="/admin/design-system" element={<PasswordGate><AdminGate><AdminDesignSystem /></AdminGate></PasswordGate>} />
            <Route path="/admin/experience" element={<PasswordGate><AdminGate><AdminExperience /></AdminGate></PasswordGate>} />
            <Route path="/admin/appearance" element={<PasswordGate><AdminGate><AdminAppearance /></AdminGate></PasswordGate>} />
            <Route path="/admin/qa" element={<PasswordGate><AdminGate><AdminQA /></AdminGate></PasswordGate>} />
            <Route path="/admin/guide-health" element={<PasswordGate><AdminGate><AdminGuideHealth /></AdminGate></PasswordGate>} />
            <Route path="/admin/standard" element={<PasswordGate><AdminGate><AdminStandard /></AdminGate></PasswordGate>} />
            <Route path="/onboarding" element={<PasswordGate><Onboarding /></PasswordGate>} />
            <Route path="/api/auth/linkedin/callback" element={<LinkedInCallback />} />
            <Route path="/trends/:id" element={<PasswordGate><TrendDetail /></PasswordGate>} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/trust" element={<Trust />} />
            <Route path="/our-story" element={<OurStory />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/guide/thought-leadership-strategy" element={<GuideThoughtLeadershipStrategy />} />
            <Route path="/settings" element={<PasswordGate><Settings /></PasswordGate>} />
            {/* Legacy alias — Preferences is now the first tab inside Settings. */}
            <Route path="/preferences" element={<Navigate to="/settings?tab=preferences" replace />} />
            <Route path="/carousel-studio" element={<PasswordGate><CarouselStudio /></PasswordGate>} />
            <Route path="/edition" element={<PasswordGate><EditionStudio /></PasswordGate>} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/card-preview" element={<PasswordGate><CardPreview /></PasswordGate>} />
            <Route path="/signature" element={<PasswordGate><SignatureStudio /></PasswordGate>} />
            <Route path="/signature-harness" element={<SignatureHarness />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
      </ThemeProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
