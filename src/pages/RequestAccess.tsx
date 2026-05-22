import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import AuraLogo from "@/components/brand/AuraLogo";
import usePageMeta from "@/hooks/usePageMeta";

type Status = "idle" | "loading" | "success" | "duplicate" | "error";

const SENIORITY = ["C-Suite", "VP", "Director", "Manager", "Other"];
const SECTOR = ["Consulting", "Energy", "Finance", "Government", "Technology", "Other"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--surface-ink-raised)",
  border: "1px solid var(--ink-3)",
  color: "var(--ink-7)",
};

const RequestAccess = () => {
  usePageMeta({
    title: "Aura — Request Access",
    description: "Closed beta for senior transformation leaders. Strategic intelligence that compounds your authority.",
    path: "/request-access",
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [seniority, setSeniority] = useState("");
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; seniority?: string }>({});


  const validate = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Full name is required";
    if (!email.trim()) next.email = "Email is required";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email";
    if (!seniority) next.seniority = "Select your seniority";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("submit-waitlist", {
        body: { name: name.trim(), email: email.trim(), seniority, sector: sector || null },
      });
      if (error) throw error;
      setSubmittedEmail(email.trim());
      if (data?.duplicate) setStatus("duplicate");
      else setStatus("success");
    } catch (err) {
      console.error("submit-waitlist failed:", err);
      setStatus("error");
    }
  };

  const isDone = status === "success" || status === "duplicate";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "var(--ink)", fontFamily: "Inter, sans-serif" }}
    >
      <style>{`
        .ra-field:focus {
          border-color: var(--gold-dark, var(--brand)) !important;
          box-shadow: 0 0 0 3px hsl(43 50% 40% / 0.30) !important;
          outline: none !important;
        }
      `}</style>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full" style={{ maxWidth: "440px" }}>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <AuraLogo size={40} variant="dark" withWordmark />
          <div className="text-xs" style={{ color: "var(--ink-5)" }}>Strategic Intelligence</div>
        </div>

        {!isDone && (
          <>
            <h1 className="text-[28px] mb-2" style={{ color: "var(--ink-7)", fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500 }}>
              Request early access
            </h1>
            <p
              className="text-sm leading-relaxed mb-2"
              style={{ color: "var(--ink-5)", maxWidth: "360px" }}
            >
              Aura is in closed beta. Join the waitlist and we'll reach out when your spot is ready.
            </p>
            <p
              className="text-xs leading-relaxed mb-8"
              style={{ color: "var(--ink-4)", maxWidth: "360px" }}
            >
              We review every application individually. Current cohort: limited to senior professionals in consulting, energy, and infrastructure.
            </p>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Full name */}
              <div>
                <label htmlFor="name" className="block text-xs font-medium mb-2" style={{ color: "var(--ink-7)" }}>
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
                  maxLength={200}
                  className="ra-field w-full px-3 py-2.5 rounded-md text-sm outline-none transition-colors placeholder:text-ink-5"
                  style={inputStyle}
                />
                {errors.name && <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{errors.name}</p>}
              </div>

              {/* Work email */}
              <div>
                <label htmlFor="email" className="block text-xs font-medium mb-2" style={{ color: "var(--ink-7)" }}>
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="your@company.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
                  maxLength={255}
                  className="ra-field w-full px-3 py-2.5 rounded-md text-sm outline-none transition-colors placeholder:text-ink-5"
                  style={inputStyle}
                />
                {errors.email && <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{errors.email}</p>}
              </div>

              {/* Seniority */}
              <div>
                <label htmlFor="seniority" className="block text-xs font-medium mb-2" style={{ color: "var(--ink-7)" }}>
                  Seniority
                </label>
                <select
                  id="seniority"
                  value={seniority}
                  onChange={(e) => { setSeniority(e.target.value); if (errors.seniority) setErrors((p) => ({ ...p, seniority: undefined })); }}
                  className="ra-field w-full px-3 py-2.5 rounded-md text-sm outline-none transition-colors appearance-none"
                  style={{
                    ...inputStyle,
                    backgroundImage:
                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                    paddingRight: "32px",
                  }}
                >
                  <option value="" style={{ backgroundColor: "var(--surface-ink-raised)" }}>Select your level</option>
                  {SENIORITY.map((s) => (
                    <option key={s} value={s} style={{ backgroundColor: "var(--surface-ink-raised)" }}>{s}</option>
                  ))}
                </select>
                {errors.seniority && <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{errors.seniority}</p>}
              </div>

              {/* Sector */}
              <div>
                <label htmlFor="sector" className="block text-xs font-medium mb-2" style={{ color: "var(--ink-7)" }}>
                  Sector (optional)
                </label>
                <select
                  id="sector"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="ra-field w-full px-3 py-2.5 rounded-md text-sm outline-none transition-colors appearance-none"
                  style={{
                    ...inputStyle,
                    backgroundImage:
                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                    paddingRight: "32px",
                  }}
                >
                  <option value="" style={{ backgroundColor: "var(--surface-ink-raised)" }}>Select your sector</option>
                  {SECTOR.map((s) => (
                    <option key={s} value={s} style={{ backgroundColor: "var(--surface-ink-raised)" }}>{s}</option>
                  ))}
                </select>
              </div>

              {status === "error" && (
                <div
                  className="rounded-lg p-3 text-sm"
                  style={{
                    backgroundColor: "var(--danger-pale)",
                    border: "1px solid var(--danger)",
                    color: "var(--danger)",
                  }}
                >
                  Didn't connect. Try once more.
                </div>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: "var(--brand)", borderRadius: "8px", color: "var(--paper)" }}
              >
                {status === "loading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Request access →</>
                )}
              </button>
            </form>
          </>
        )}

        {status === "success" && (
          <div
            className="rounded-xl p-8 text-center"
            style={{
              backgroundColor: "var(--brand-muted)",
              border: "1px solid var(--bronze-line)",
              color: "var(--ink-7)",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 20,
              lineHeight: 1.45,
            }}
          >
            Your request is with us.
            <div className="mt-3" style={{ fontSize: 15, fontFamily: "Inter, sans-serif", color: "var(--ink-5)", lineHeight: 1.6 }}>
              We review every application personally — expect a response within 48 hours at{" "}
              <span style={{ color: "var(--brand)", fontWeight: 600 }}>{submittedEmail}</span>.
            </div>
          </div>
        )}

        {status === "duplicate" && (
          <div
            className="rounded-xl p-6 text-center text-sm"
            style={{
              backgroundColor: "var(--warning-pale)",
              border: "1px solid var(--warning)",
              color: "var(--warning)",
            }}
          >
            You're already on the list. We'll be in touch soon.
          </div>
        )}

        <div className="text-center mt-6">
          <span className="text-sm" style={{ color: "var(--ink-5)" }}>
            Already have access?{" "}
            <Link to="/auth" className="font-medium hover:underline" style={{ color: "var(--brand)" }}>
              Sign in →
            </Link>
          </span>
        </div>
      </div>
      </div>
    </div>
  );
};

export default RequestAccess;