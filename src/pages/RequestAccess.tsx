import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import usePageMeta from "@/hooks/usePageMeta";
import { SECTORS } from "@/constants/sectors";

type Status = "idle" | "loading" | "success" | "duplicate" | "error";

const BRONZE = "#B08D3A";
const LEFT_BG = "#0a0a08";
const RIGHT_BG = "#0f0e0c";
const FIELD_BG = "#1a1917";
const FIELD_BORDER = "#2a2a28";

const SENIORITY = [
  "C-Suite",
  "SVP / EVP",
  "VP",
  "Senior Director",
  "Director",
  "Senior Manager",
  "Manager",
  "Principal / Fellow",
  "Advisor / Board Member",
  "Other",
];

const SECTOR: string[] = [...SECTORS];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "aol.com", "live.com", "protonmail.com", "proton.me", "msn.com",
  "yahoo.co.uk", "googlemail.com",
]);
const isPersonalEmail = (e: string) => {
  const d = e.trim().toLowerCase().split("@")[1];
  return !!d && PERSONAL_DOMAINS.has(d);
};

function usePositionCount(target: number, start: boolean, duration = 800) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current || !target) return;
    started.current = true;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setValue(target); return; }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, start, duration]);
  return value;
}

const HorizonEye = ({ size = 48, color = BRONZE }: { size?: number; color?: string }) => (
  <svg width={size} height={size * 0.55} viewBox="0 0 60 33" fill="none" aria-hidden>
    <path d="M2 16.5 C 12 4, 48 4, 58 16.5 C 48 29, 12 29, 2 16.5 Z" stroke={color} strokeWidth="1.5" fill="none" />
    <circle cx="30" cy="16.5" r="9" stroke={color} strokeWidth="1" fill="none" opacity="0.55" />
    <circle cx="30" cy="16.5" r="5" fill={color} />
  </svg>
);

export default function RequestAccess() {
  usePageMeta({
    title: "Aura — Request access",
    description: "Closed beta for senior professionals. Fewer than 50 seats. Every application reviewed personally.",
    path: "/request-access",
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [seniority, setSeniority] = useState("");
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [submittedName, setSubmittedName] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ name?: string; email?: string; seniority?: string; sector?: string }>({});
  const [emailTouched, setEmailTouched] = useState(false);
  const showPersonalWarning = emailTouched && EMAIL_RE.test(email.trim()) && isPersonalEmail(email);

  const validate = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Your name is required";
    if (!email.trim()) next.email = "Email is required";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email";
    if (!seniority) next.seniority = "Select your level";
    if (!sector) next.sector = "Select your sector";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("submit-waitlist", {
        body: { name: name.trim(), email: email.trim(), seniority, sector },
      });
      if (error) throw error;
      setSubmittedName(name.trim().split(" ")[0]);
      if (data?.duplicate) {
        setStatus("duplicate");
      } else {
        if (typeof data?.position === "number") setPosition(data.position);
        setStatus("success");
      }
    } catch (err) {
      console.error("submit-waitlist failed:", err);
      setStatus("error");
    }
  };

  const isDone = status === "success" || status === "duplicate";

  const selectArrow =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")";

  return (
    <div style={{ minHeight: "100vh", background: LEFT_BG, color: "#ededed", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{RA_CSS}</style>

      <main className="ra-grid">
        {/* LEFT PANEL */}
        <aside className="ra-left" style={{ background: LEFT_BG }}>
          <div className="ra-left-inner">
            <div className="ra-anim ra-d1" style={{ marginBottom: 28 }}>
              <div className="ra-eye-pulse" style={{ display: "inline-flex" }}>
                <HorizonEye size={48} />
              </div>
            </div>
            <h1 className="ra-anim ra-d2" style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontWeight: 400, fontSize: 28, color: "#fff",
              margin: "0 0 16px", lineHeight: 1.25,
            }}>
              Your expertise deserves an audience.
            </h1>
            <p className="ra-anim ra-d3" style={{
              fontSize: 15, color: "#aaa", lineHeight: 1.65,
              maxWidth: 340, margin: 0,
            }}>
              Aura is in closed beta with fewer than 50 professionals. We review every application personally.
            </p>

            <ul className="ra-anim ra-d4" style={{
              listStyle: "none", padding: 0, margin: "32px 0 0",
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              {[
                "Fewer than 50 professionals have access",
                "Every application reviewed by the builder personally",
                "10-minute setup. A career of visibility.",
              ].map((line) => (
                <li key={line} style={{ fontSize: 13, color: "#999", display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: BRONZE, lineHeight: 1.5 }}>✦</span>
                  <span style={{ lineHeight: 1.5 }}>{line}</span>
                </li>
              ))}
            </ul>

            <p
              className="ra-anim ra-d5"
              dir="rtl"
              style={{
                fontSize: 16, color: BRONZE, marginTop: 40, marginBottom: 0,
                fontFamily: "'Cairo', 'DM Sans', sans-serif",
              }}
            >
              حتى السوق يعرفك قبل ما يشوفك ✦
            </p>
            <Link
              to="/"
              style={{
                fontSize: 12, color: "#666", textDecoration: "none",
                marginTop: 16, display: "block",
              }}
            >
              ← Explore what Aura does
            </Link>
          </div>
        </aside>

        {/* RIGHT PANEL */}
        <section className="ra-right" style={{ background: RIGHT_BG }}>
          <div className="ra-right-inner ra-anim ra-d-form">
            {!isDone && (
              <>
                <Link
                  to="/"
                  className="ra-back-link"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 13, color: "#888", textDecoration: "none",
                    marginBottom: 20, transition: "color 0.2s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = BRONZE)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
                >
                  ← Back to Aura
                </Link>
                <h2 style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontWeight: 400, fontSize: 24, color: "#fff",
                  margin: "0 0 8px",
                }}>
                  Tell us about you.
                </h2>
                <p style={{ fontSize: 14, color: "#aaa", margin: "0 0 28px", lineHeight: 1.6 }}>
                  This takes 30 seconds. We'll be in touch within a week.
                </p>

                <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <Field
                    id="name"
                    label="Your name"
                    placeholder="Your full name"
                    value={name}
                    onChange={(v) => { setName(v); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
                    error={errors.name}
                    maxLength={200}
                  />
                  <Field
                    id="email"
                    label="Your work email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(v) => { setEmail(v); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
                    error={errors.email}
                    maxLength={255}
                    onBlur={() => setEmailTouched(true)}
                    hint={showPersonalWarning ? "We recommend using your work email — it helps us review your application faster." : undefined}
                  />
                  <Select
                    id="seniority"
                    label="Your level"
                    value={seniority}
                    options={SENIORITY}
                    placeholder="Select your level"
                    onChange={(v) => { setSeniority(v); if (errors.seniority) setErrors((p) => ({ ...p, seniority: undefined })); }}
                    error={errors.seniority}
                    arrow={selectArrow}
                  />
                  <Select
                    id="sector"
                    label="Your sector"
                    value={sector}
                    options={SECTOR}
                    placeholder="Select your sector"
                    onChange={(v) => { setSector(v); if (errors.sector) setErrors((p) => ({ ...p, sector: undefined })); }}
                    error={errors.sector}
                    arrow={selectArrow}
                  />

                  {status === "error" && (
                    <div style={{
                      padding: 12, borderRadius: 8,
                      background: "rgba(220,70,70,0.1)",
                      border: "1px solid rgba(220,70,70,0.4)",
                      color: "#e89c9c", fontSize: 14,
                    }}>
                      Didn't connect. Try once more.
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="ra-cta"
                    style={{
                      background: BRONZE, color: "#fff",
                      height: 48, width: "100%",
                      borderRadius: 8, fontSize: 15, fontWeight: 600,
                      border: 0, cursor: status === "loading" ? "default" : "pointer",
                      marginTop: 6,
                      transition: "transform 200ms ease, box-shadow 200ms ease, opacity 200ms ease",
                      opacity: status === "loading" ? 0.85 : 1,
                    }}
                  >
                    {status === "loading" ? (
                      <span className="ra-pulse">Submitting…</span>
                    ) : (
                      <>Request access →</>
                    )}
                  </button>
                </form>

                <div style={{ textAlign: "center", marginTop: 24 }}>
                  <span style={{ fontSize: 14, color: "#999" }}>
                    Already have access?{" "}
                    <Link to="/auth" style={{ color: BRONZE, fontWeight: 500, textDecoration: "none" }}>
                      Sign in →
                    </Link>
                  </span>
                </div>
              </>
            )}

            {status === "success" && (
              <SuccessCeremony
                title={`You're on the list, ${submittedName}.`}
                subline="I review every application personally. If Aura is right for you, you'll hear from me within a week."
                companion="In the meantime — keep reading what matters to your sector. That's exactly what Aura will turn into presence."
                withSignature
                position={position}
                ctaHref="/"
                ctaLabel="Explore what Aura does →"
              />
            )}

            {status === "duplicate" && (
              <SuccessCeremony
                title="You're already on our list."
                subline="We have your request. If I haven't reached out yet, I will soon."
                companion="Want to check your status? Email me at mohammad.mahafdhah@aura-intel.org"
                ctaHref="/"
                ctaLabel="Go back to explore Aura →"
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({
  id, label, value, onChange, error, placeholder, type = "text", maxLength, onBlur, hint,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; error?: string;
  placeholder?: string; type?: string; maxLength?: number;
  onBlur?: () => void; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        className="ra-field"
        style={fieldStyle}
      />
      {error && <p style={errorStyle}>{error}</p>}
      {!error && hint && (
        <p style={{ marginTop: 6, fontSize: 12, color: BRONZE, lineHeight: 1.5, transition: "opacity 300ms ease" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Select({
  id, label, value, options, placeholder, onChange, error, arrow,
}: {
  id: string; label: string; value: string;
  options: string[]; placeholder: string;
  onChange: (v: string) => void; error?: string; arrow: string;
}) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ra-field"
        style={{
          ...fieldStyle,
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          backgroundImage: arrow,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 14px center",
          paddingRight: 36,
        }}
      >
        <option value="" style={{ background: FIELD_BG, color: "#555" }}>{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} style={{ background: FIELD_BG, color: "#ededed" }}>{o}</option>
        ))}
      </select>
      {error && <p style={errorStyle}>{error}</p>}
    </div>
  );
}

function SuccessCeremony({
  title, subline, companion, withSignature, ctaHref, ctaLabel, position,
}: {
  title: string; subline: string; companion?: string;
  withSignature?: boolean; ctaHref?: string; ctaLabel?: string;
  position?: number | null;
}) {
  const counted = usePositionCount(position ?? 0, position != null);
  return (
    <div style={{ textAlign: "center", padding: "16px 0" }}>
      <div className="ra-star" style={{ fontSize: 32, color: BRONZE, lineHeight: 1 }}>✦</div>
      <h2 className="ra-anim-in ra-in-1" style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 400, fontSize: 24, color: "#fff",
        margin: "24px 0 14px", lineHeight: 1.3,
      }}>
        {title}
      </h2>
      {position != null && position > 0 && (
        <p className="ra-anim-in ra-in-1" style={{
          fontSize: 14, color: BRONZE, margin: "0 0 16px", letterSpacing: "0.5px",
        }}>
          You're number {counted} on the list.
        </p>
      )}
      <p className="ra-anim-in ra-in-2" style={{
        fontSize: 15, color: "#bdbdbd", lineHeight: 1.7,
        maxWidth: 380, margin: "0 auto",
      }}>
        {subline}
      </p>
      {companion && (
        <p className="ra-anim-in ra-in-3" style={{
          fontSize: 13, color: "#9a9a9a", lineHeight: 1.7,
          maxWidth: 380, margin: "20px auto 0", fontStyle: "italic",
        }}>
          {companion}
        </p>
      )}
      <p className="ra-anim-in ra-in-3" style={{
        fontSize: 12, color: "#666", lineHeight: 1.6,
        maxWidth: 380, margin: "12px auto 0",
      }}>
        Check your inbox (and spam folder) for a confirmation from Aura.
      </p>
      {withSignature && (
        <div className="ra-anim-in ra-in-4" style={{ marginTop: 36 }}>
          <div style={{ fontSize: 14, color: "#ededed", fontWeight: 500 }}>Mohammad Mahafzah</div>
          <div style={{ fontSize: 12, color: "#9a9a9a", marginTop: 2 }}>Aura builder</div>
        </div>
      )}
      {ctaHref && ctaLabel && (
        <div className="ra-anim-in ra-in-3" style={{ marginTop: 28 }}>
          <Link to={ctaHref} style={{ fontSize: 14, color: BRONZE, textDecoration: "none", fontWeight: 500 }}>
            {ctaLabel}
          </Link>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, color: "#bdbdbd", fontWeight: 500, marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: FIELD_BG,
  border: `1px solid ${FIELD_BORDER}`,
  color: "#fff",
  fontSize: 15,
  padding: "14px 16px",
  borderRadius: 8,
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 300ms ease, box-shadow 300ms ease",
};

const errorStyle: React.CSSProperties = {
  marginTop: 6, fontSize: 12, color: "#e89c9c",
};

const RA_CSS = `
  .ra-grid {
    display: grid;
    grid-template-columns: 1fr;
    min-height: 100vh;
  }
  @media (min-width: 900px) {
    .ra-grid { grid-template-columns: 1fr 1fr; }
  }
  .ra-left, .ra-right {
    display: flex; align-items: center; justify-content: center;
    padding: 48px 32px;
  }
  @media (max-width: 899px) {
    .ra-left { padding: 48px 24px 24px; }
    .ra-right { padding: 24px 24px 48px; }
  }
  .ra-left-inner { width: 100%; max-width: 380px; }
  .ra-right-inner { width: 100%; max-width: 420px; }

  .ra-field::placeholder { color: #555; }
  .ra-field:focus {
    border-color: ${BRONZE} !important;
    box-shadow: 0 0 0 3px rgba(176,141,58,0.15) !important;
  }

  /* Kill the yellow autofill background that browsers force on inputs/selects */
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus,
  select:-webkit-autofill {
    -webkit-box-shadow: 0 0 0px 1000px ${FIELD_BG} inset !important;
    -webkit-text-fill-color: #ededed !important;
    caret-color: #ededed !important;
    transition: background-color 5000s ease-in-out 0s;
  }

  .ra-cta:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(176,141,58,0.2);
  }
  .ra-pulse { animation: ra-pulse 1.4s ease-in-out infinite; }
  @keyframes ra-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }

  .ra-eye-pulse { animation: ra-eye 3s ease-in-out infinite; }
  @keyframes ra-eye { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }

  .ra-anim { opacity: 0; transform: translateY(12px); animation: ra-fade 600ms ease-out forwards; }
  @keyframes ra-fade { to { opacity: 1; transform: translateY(0); } }
  .ra-d1 { animation-delay: 300ms; }
  .ra-d2 { animation-delay: 600ms; }
  .ra-d3 { animation-delay: 900ms; }
  .ra-d4 { animation-delay: 1200ms; }
  .ra-d5 { animation-delay: 1500ms; }
  .ra-d-form { animation-delay: 800ms; }

  .ra-star { animation: ra-star 500ms ease-out forwards; opacity: 0; transform: scale(0.5); }
  @keyframes ra-star { to { opacity: 1; transform: scale(1); } }
  .ra-anim-in { opacity: 0; animation: ra-in 400ms ease-out forwards; }
  .ra-in-1 { animation-delay: 400ms; }
  .ra-in-2 { animation-delay: 600ms; }
  .ra-in-3 { animation-delay: 900ms; }
  .ra-in-4 { animation-delay: 1200ms; }
  @keyframes ra-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  @media (prefers-reduced-motion: reduce) {
    .ra-anim, .ra-anim-in, .ra-star, .ra-eye-pulse, .ra-pulse {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
  }
`;