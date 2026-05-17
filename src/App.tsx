import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import LinkedInCallback from "./pages/LinkedInCallback";
import TrendDetail from "./pages/TrendDetail";
import RequestAccess from "./pages/RequestAccess";
import Admin from "./pages/Admin";
import AdminDesignSystem from "./pages/AdminDesignSystem";
import AdminExperience from "./pages/AdminExperience";
import AdminQA from "./pages/AdminQA";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Guide from "./pages/Guide";
import CarouselStudio from "./pages/CarouselStudio";
import PasswordGate from "./components/PasswordGate";
import { ThemeProvider } from "./components/ThemeProvider";

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
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/home" element={<PasswordGate><Dashboard /></PasswordGate>} />
            <Route path="/dashboard" element={<PasswordGate><Dashboard /></PasswordGate>} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/request-access" element={<RequestAccess />} />
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
        </BrowserRouter>
      </TooltipProvider>
      </ThemeProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
