import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Legacy /onboarding route. The new 3-step wizard now opens directly on the
// dashboard (see Dashboard.tsx → OnboardingWizard). Anyone landing here is
// redirected straight to /home, where the wizard will appear if needed.
const Onboarding = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/home", { replace: true });
  }, [navigate]);
  return null;
};

export default Onboarding;
