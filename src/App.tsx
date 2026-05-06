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
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/home" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/request-access" element={<RequestAccess />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/design-system" element={<AdminDesignSystem />} />
            <Route path="/admin/experience" element={<AdminExperience />} />
            <Route path="/admin/qa" element={<AdminQA />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/api/auth/linkedin/callback" element={<LinkedInCallback />} />
            <Route path="/trends/:id" element={<TrendDetail />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/carousel-studio" element={<CarouselStudio />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
