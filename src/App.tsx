import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AuraLogo from "@/components/brand/AuraLogo";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import Guide from "./pages/Guide";
import PasswordGate from "./components/PasswordGate";
import { ThemeProvider } from "./components/ThemeProvider";
import CookieConsent from "./components/CookieConsent";

// Lazy-loaded heavy / rarely-visited routes
const Landing = lazy(() => import("./pages/Landing"));
const TrendDetail = lazy(() => import("./pages/TrendDetail"));
const CarouselStudio = lazy(() => import("./pages/CarouselStudio"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminDesignSystem = lazy(() => import("./pages/AdminDesignSystem"));
const AdminExperience = lazy(() => import("./pages/AdminExperience"));
const AdminQA = lazy(() => import("./pages/AdminQA"));

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
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <CookieConsent />
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
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
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
            <Route path="/" element={<Landing />} />
            <Route path="/home" element={<PasswordGate><Dashboard /></PasswordGate>} />
            <Route path="/dashboard" element={<PasswordGate><Dashboard /></PasswordGate>} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/request-access" element={<RequestAccess />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route path="/admin" element={<PasswordGate><Admin /></PasswordGate>} />
            <Route path="/admin/design-system" element={<PasswordGate><AdminDesignSystem /></PasswordGate>} />
            <Route path="/admin/experience" element={<PasswordGate><AdminExperience /></PasswordGate>} />
            <Route path="/admin/qa" element={<PasswordGate><AdminQA /></PasswordGate>} />
            <Route path="/onboarding" element={<PasswordGate><Onboarding /></PasswordGate>} />
            <Route path="/api/auth/linkedin/callback" element={<LinkedInCallback />} />
            <Route path="/trends/:id" element={<PasswordGate><TrendDetail /></PasswordGate>} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/carousel-studio" element={<PasswordGate><CarouselStudio /></PasswordGate>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
      </ThemeProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
