import { useEffect, useRef, useState } from "react";
import { Loader2, Eye, EyeOff, Check, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * PasswordGate — wraps every authenticated route. If the signed-in user has
 * not set a password (i.e. they came in via magic-link invite), they MUST
 * set one before they can see any Aura content. Without this gate, invited
 * users get permanently locked out the moment they sign out.
 */
export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user) {
        setChecking(false);
        return;
      }
      setEmail(session.user.email ?? null);
      const meta = (session.user.user_metadata || {}) as any;
      const isSet = meta.password_set === true;
      setNeedsPassword(!isSet);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d0d0b" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#B08D3A" }} />
      </div>
    );
  }

  if (needsPassword) {
    return <SetPasswordScreen email={email} onComplete={() => setNeedsPassword(false)} />;
  }

  return <>{children}</>;
}

function SetPasswordScreen({ email, onComplete }: { email: string | null; onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const [companionVisible, setCompanionVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const companionTimer = useRef<number | null>(null);

  // Companion voice — debounced 1s after typing in the password field
  useEffect(() => {
    if (companionTimer.current) window.clearTimeout(companionTimer.current);
    if (password.length === 0) {
      setCompanionVisible(false);
      return;
    }
    companionTimer.current = window.setTimeout(() => setCompanionVisible(true), 1000);
    return () => {
      if (companionTimer.current) window.clearTimeout(companionTimer.current);
    };
  }, [password]);

  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password),
    match: password.length > 0 && confirmPassword.length > 0 && password === confirmPassword,
  };
  const allValid = Object.values(checks).every(Boolean);

  const handleSubmit = async () => {
    if (!allValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password,
        data: { password_set: true },
      });
      if (error) throw error;
      try {
        if (email) {
          await supabase.functions.invoke("send-account-notification", {
            body: { type: "password_set", email, first_name: null },
          });
        }
      } catch (e) {
        console.warn("password_set notification failed:", e);
      }
      // Ceremony pause — intentional. Show the gold ✦ and the "setting up"
      // line, then proceed to onboarding after 800ms.
      setSubmitted(true);
      window.setTimeout(() => {
        onComplete();
      }, 800);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't set password. Please try again.");
      setIsSubmitting(false);
    }
  };

  const checklist: { key: keyof typeof checks; label: string }[] = [
    { key: "length", label: "At least 8 characters" },
    { key: "uppercase", label: "One uppercase letter (A–Z)" },
    { key: "lowercase", label: "One lowercase letter (a–z)" },
    { key: "number", label: "One number (0–9)" },
    { key: "special", label: "One special character (!@#$%)" },
  ];

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "#0d0d0b", color: "#ededed", fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        @keyframes pg-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pg-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
      `}</style>
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: "#141412",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)",
        }}
      >
        <div className="mb-6">
          <div className="text-xs tracking-[0.2em] uppercase mb-3" style={{ color: "#B08D3A" }}>
            Aura · Strategic Intelligence
          </div>
          <h1 className="mb-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 30, fontWeight: 500, lineHeight: 1.15, color: "#ffffff" }}>
            Welcome to the inner circle.
          </h1>
          <p style={{ fontSize: 14, color: "rgba(237,237,237,0.65)" }}>
            Set a password you'll remember. This space is yours now.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "rgba(237,237,237,0.65)" }}>Your password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPwFocused(true)}
                onBlur={() => setPwFocused(false)}
                placeholder="Create a password"
                className="w-full rounded-lg outline-none"
                style={{
                  padding: "12px 40px 12px 14px",
                  fontSize: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderBottomColor: pwFocused ? "#B08D3A" : "rgba(255,255,255,0.1)",
                  borderBottomWidth: pwFocused ? 2 : 1,
                  color: "#ededed",
                  transition: "border-color 300ms ease, border-bottom-width 300ms ease",
                }}
                autoFocus
                autoComplete="new-password"
              />
              <button
                type="button" onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "rgba(237,237,237,0.5)" }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </div>

          <div className="space-y-1.5 py-1">
            {checklist.map(({ key, label }) => {
              const ok = checks[key];
              return (
                <div key={key} className="flex items-center gap-2" style={{ fontSize: 14 }}>
                  {ok ? (
                    <Check size={14} style={{ color: "hsl(142 70% 55%)" }} />
                  ) : (
                    <span style={{ width: 14, height: 14, borderRadius: 999, border: "1.5px solid rgba(255,255,255,0.18)", display: "inline-block" }} />
                  )}
                  <span style={{ color: ok ? "#ededed" : "rgba(237,237,237,0.55)" }}>{label}</span>
                </div>
              );
            })}
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: "rgba(237,237,237,0.65)" }}>Confirm password</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={() => setConfirmFocused(true)}
                onBlur={() => setConfirmFocused(false)}
                placeholder="Confirm password"
                className="w-full rounded-lg outline-none"
                style={{
                  padding: "12px 40px 12px 14px",
                  fontSize: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderBottomColor: confirmFocused ? "#B08D3A" : "rgba(255,255,255,0.1)",
                  borderBottomWidth: confirmFocused ? 2 : 1,
                  color: "#ededed",
                  transition: "border-color 300ms ease, border-bottom-width 300ms ease",
                }}
                autoComplete="new-password"
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              />
              <button
                type="button" onClick={() => setShowConfirm((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "rgba(237,237,237,0.5)" }}
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >{showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </div>

          <div className="flex items-center gap-2" style={{ fontSize: 14 }}>
            {checks.match ? (
              <Check size={14} style={{ color: "hsl(142 70% 55%)" }} />
            ) : (
              <span style={{ width: 14, height: 14, borderRadius: 999, border: "1.5px solid rgba(255,255,255,0.18)", display: "inline-block" }} />
            )}
            <span style={{ color: checks.match ? "#ededed" : "rgba(237,237,237,0.55)" }}>Passwords match</span>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allValid || isSubmitting}
            className="w-full rounded-lg flex items-center justify-center gap-2 mt-2"
            style={{
              padding: "12px 16px", fontSize: 14, fontWeight: 600,
              background: "#B08D3A",
              color: "#ffffff",
              border: 0, cursor: allValid && !isSubmitting ? "pointer" : "not-allowed",
              opacity: allValid && !isSubmitting ? 1 : 0.5,
            }}
          >
            {submitted ? (
              <span
                style={{
                  color: "#ffffff",
                  fontSize: 18,
                  display: "inline-block",
                  animation: "pg-pulse 300ms ease-out",
                }}
              >
                ✦
              </span>
            ) : isSubmitting ? (
              "Setting password..."
            ) : (
              <>Enter <ArrowRight size={16} /></>
            )}
          </button>

          {submitted && (
            <p
              style={{
                fontSize: 13,
                color: "rgba(237,237,237,0.55)",
                textAlign: "center",
                margin: "8px 0 0",
                animation: "pg-fade-in 400ms ease-out forwards",
              }}
            >
              Setting up your intelligence system…
            </p>
          )}

          {!submitted && companionVisible && (
            <p
              style={{
                fontSize: 13,
                color: "rgba(237,237,237,0.55)",
                margin: "4px 0 0",
                animation: "pg-fade-in 300ms ease-out forwards",
              }}
            >
              Good. Let's get you inside.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}