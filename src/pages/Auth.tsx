import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { Zap, Loader2, Radio, PenLine, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const checkOnboardingAndRedirect = async (session: any) => {
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("onboarding_completed")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!profile || !(profile as any).onboarding_completed) {
      navigate("/onboarding");
    } else {
      navigate("/home");
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) checkOnboardingAndRedirect(session);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) checkOnboardingAndRedirect(session);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/home` },
    });
    if (error) {
      toast({ title: "Google sign-in unavailable", description: error.message, variant: "destructive" });
    }
  };

  const handleForgotPassword = async () => {
    setEmailError(null);
    if (!email) {
      setEmailError("Enter your email first");
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setResetting(false);
    if (error) {
      toast({ title: "Couldn't send reset", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: `Reset link sent to ${email}.` });
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#0d0d0d", fontFamily: "Inter, sans-serif" }}>
      {/* LEFT — auth form */}
      <div
        className="w-full md:w-[40%] min-h-screen flex items-center justify-center px-6 py-10"
        style={{ backgroundColor: "#0d0d0d" }}
      >
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#F97316" }}
            >
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="leading-tight">
              <div className="text-xl font-bold" style={{ color: "#f0f0f0" }}>Aura</div>
              <div className="text-xs" style={{ color: "#888" }}>Strategic Intelligence</div>
            </div>
          </div>

          {/* Beta pill */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mt-5 mb-6"
            style={{
              backgroundColor: "#141414",
              border: "1px solid #F97316",
              color: "#F97316",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#F97316" }} />
            Closed Beta
          </div>

          {/* Headline */}
          <h1 className="text-3xl font-bold mb-2" style={{ color: "#f0f0f0" }}>
            Welcome back
          </h1>
          <p className="text-sm leading-relaxed mb-8" style={{ color: "#888" }}>
            Sign in to your intelligence OS. Every session builds your authority.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium mb-2" style={{ color: "#f0f0f0" }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                required
                className="w-full px-3 py-2.5 rounded-md text-sm outline-none focus:border-[#F97316] transition-colors"
                style={{
                  backgroundColor: "#141414",
                  border: "1px solid #252525",
                  color: "#f0f0f0",
                }}
              />
              {emailError && (
                <p className="mt-1.5 text-xs" style={{ color: "#ef4444" }}>{emailError}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium mb-2" style={{ color: "#f0f0f0" }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2.5 rounded-md text-sm outline-none focus:border-[#F97316] transition-colors"
                style={{
                  backgroundColor: "#141414",
                  border: "1px solid #252525",
                  color: "#f0f0f0",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "#F97316" }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in →
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px" style={{ backgroundColor: "#252525" }} />
              <span className="text-xs" style={{ color: "#888" }}>or</span>
              <div className="flex-1 h-px" style={{ backgroundColor: "#252525" }} />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors hover:bg-[#1a1a1a]"
              style={{
                backgroundColor: "#141414",
                border: "1px solid #252525",
                color: "#f0f0f0",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetting}
                className="text-xs hover:underline disabled:opacity-50"
                style={{ color: "#888" }}
              >
                {resetting ? "Sending…" : "Forgot password?"}
              </button>
            </div>
          </form>

          {/* Bottom link */}
          <p className="mt-8 text-sm" style={{ color: "#888" }}>
            Don't have access?{" "}
            <Link to="/request-access" className="font-medium hover:underline" style={{ color: "#F97316" }}>
              Request early access →
            </Link>
          </p>
        </div>
      </div>

      {/* RIGHT — brand panel (hidden on mobile) */}
      <div
        className="hidden md:flex md:w-[60%] min-h-screen relative items-center justify-center px-12"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        {/* Radial glow top-right */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 85% 15%, rgba(249,115,22,0.08) 0%, transparent 50%)",
          }}
        />

        <div className="relative z-10 max-w-md text-center">
          <h2
            className="text-5xl font-bold tracking-tight"
            style={{ color: "#F97316", fontFamily: "Inter, sans-serif" }}
          >
            Aura
          </h2>
          <p className="mt-4 text-xl leading-snug" style={{ color: "#f0f0f0" }}>
            Your expertise is invisible. Aura fixes that.
          </p>

          <div className="mx-auto my-8 h-px w-10" style={{ backgroundColor: "#F97316" }} />

          <div className="space-y-6 text-left">
            <FeatureRow
              icon={<Radio className="w-4 h-4" style={{ color: "#F97316" }} />}
              title="Signal intelligence"
              desc="Converts what you read into ranked market signals"
            />
            <FeatureRow
              icon={<PenLine className="w-4 h-4" style={{ color: "#F97316" }} />}
              title="Flash content"
              desc="LinkedIn posts in your voice, English or Arabic, in minutes"
            />
            <FeatureRow
              icon={<TrendingUp className="w-4 h-4" style={{ color: "#F97316" }} />}
              title="Authority score"
              desc="Tracks how your visibility compounds over time"
            />
          </div>
        </div>

        <div
          className="absolute bottom-6 left-0 right-0 text-center text-xs"
          style={{ color: "#888" }}
        >
          Closed beta · GCC senior professionals · 2026
        </div>
      </div>
    </div>
  );
};

const FeatureRow = ({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) => (
  <div className="flex items-start gap-3">
    <div
      className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: "#141414", border: "1px solid #252525" }}
    >
      {icon}
    </div>
    <div>
      <div className="text-sm font-semibold" style={{ color: "#f0f0f0" }}>{title}</div>
      <div className="text-xs mt-0.5" style={{ color: "#888" }}>{desc}</div>
    </div>
  </div>
);

export default Auth;
