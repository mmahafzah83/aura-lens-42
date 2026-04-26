import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Zap, Loader2 } from "lucide-react";

type Status = "idle" | "loading" | "success" | "duplicate" | "error";

const SENIORITY = ["C-Suite", "VP", "Director", "Manager", "Other"];
const SECTOR = ["Consulting", "Energy", "Finance", "Government", "Technology", "Other"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputStyle: React.CSSProperties = {
  backgroundColor: "#141414",
  border: "1px solid #252525",
  color: "#f0f0f0",
};

const RequestAccess = () => {
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
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "#0d0d0d", fontFamily: "Inter, sans-serif" }}
    >
      <div className="w-full" style={{ maxWidth: "440px" }}>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#F97316" }}
          >
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-primary font-extrabold text-2xl">Aura</div>
            <div className="text-xs" style={{ color: "#888" }}>Strategic Intelligence</div>
          </div>
        </div>

        {!isDone && (
          <>
            <h1 className="text-[28px] font-bold mb-2" style={{ color: "#f0f0f0" }}>
              Request early access
            </h1>
            <p
              className="text-sm leading-relaxed mb-8"
              style={{ color: "#888", maxWidth: "360px" }}
            >
              Aura is in closed beta. Join the waitlist and we'll reach out when your spot is ready.
            </p>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Full name */}
              <div>
                <label htmlFor="name" className="block text-xs font-medium mb-2" style={{ color: "#f0f0f0" }}>
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
                  maxLength={200}
                  className="w-full px-3 py-2.5 rounded-md text-sm outline-none focus:border-[#F97316] transition-colors placeholder:text-[#555]"
                  style={inputStyle}
                />
                {errors.name && <p className="mt-1.5 text-xs" style={{ color: "#ef4444" }}>{errors.name}</p>}
              </div>

              {/* Work email */}
              <div>
                <label htmlFor="email" className="block text-xs font-medium mb-2" style={{ color: "#f0f0f0" }}>
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="your@company.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
                  maxLength={255}
                  className="w-full px-3 py-2.5 rounded-md text-sm outline-none focus:border-[#F97316] transition-colors placeholder:text-[#555]"
                  style={inputStyle}
                />
                {errors.email && <p className="mt-1.5 text-xs" style={{ color: "#ef4444" }}>{errors.email}</p>}
              </div>

              {/* Seniority */}
              <div>
                <label htmlFor="seniority" className="block text-xs font-medium mb-2" style={{ color: "#f0f0f0" }}>
                  Seniority
                </label>
                <select
                  id="seniority"
                  value={seniority}
                  onChange={(e) => { setSeniority(e.target.value); if (errors.seniority) setErrors((p) => ({ ...p, seniority: undefined })); }}
                  className="w-full px-3 py-2.5 rounded-md text-sm outline-none focus:border-[#F97316] transition-colors appearance-none"
                  style={{
                    ...inputStyle,
                    backgroundImage:
                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                    paddingRight: "32px",
                  }}
                >
                  <option value="" style={{ backgroundColor: "#141414" }}>Select your level</option>
                  {SENIORITY.map((s) => (
                    <option key={s} value={s} style={{ backgroundColor: "#141414" }}>{s}</option>
                  ))}
                </select>
                {errors.seniority && <p className="mt-1.5 text-xs" style={{ color: "#ef4444" }}>{errors.seniority}</p>}
              </div>

              {/* Sector */}
              <div>
                <label htmlFor="sector" className="block text-xs font-medium mb-2" style={{ color: "#f0f0f0" }}>
                  Sector (optional)
                </label>
                <select
                  id="sector"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md text-sm outline-none focus:border-[#F97316] transition-colors appearance-none"
                  style={{
                    ...inputStyle,
                    backgroundImage:
                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                    paddingRight: "32px",
                  }}
                >
                  <option value="" style={{ backgroundColor: "#141414" }}>Select your sector</option>
                  {SECTOR.map((s) => (
                    <option key={s} value={s} style={{ backgroundColor: "#141414" }}>{s}</option>
                  ))}
                </select>
              </div>

              {status === "error" && (
                <div
                  className="rounded-lg p-3 text-sm"
                  style={{
                    backgroundColor: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.4)",
                    color: "#fca5a5",
                  }}
                >
                  Something went wrong. Please try again.
                </div>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: "#F97316", borderRadius: "8px" }}
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
            className="rounded-xl p-6 text-center text-sm"
            style={{
              backgroundColor: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.4)",
              color: "#86efac",
            }}
          >
            ✓ You're on the list. We'll reach out at{" "}
            <span className="font-semibold">{submittedEmail}</span> when your spot opens.
          </div>
        )}

        {status === "duplicate" && (
          <div
            className="rounded-xl p-6 text-center text-sm"
            style={{
              backgroundColor: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.4)",
              color: "#fcd34d",
            }}
          >
            You're already on the list. We'll be in touch soon.
          </div>
        )}

        <div className="text-center mt-6">
          <span className="text-sm" style={{ color: "#888" }}>
            Already have access?{" "}
            <Link to="/auth" className="font-medium hover:underline" style={{ color: "#F97316" }}>
              Sign in →
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
};

export default RequestAccess;