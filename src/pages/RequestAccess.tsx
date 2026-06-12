import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import usePageMeta from "@/hooks/usePageMeta";
import { SECTORS } from "@/constants/sectors";
import { SENIORITY_LEVELS } from "@/constants/seniority";
import PublicFooter from "@/components/PublicFooter";

type Status = "idle" | "loading" | "success" | "duplicate" | "error" | "validation";

// A6 token pass — constants annotated with the token each mirrors.
// String literals are required because these are React inline styles + raw
// CSS strings in the <style> block; both can safely reference CSS vars.
const BRONZE = "var(--bronze)";              // mirrors --bronze
const BRONZE_TEXT = "var(--bronze-text)";    // mirrors --bronze-text
const LEFT_BG = "var(--paper)";              // mirrors --paper
const RIGHT_BG = "var(--paper-2)";           // mirrors --paper-2
const FIELD_BG = "var(--vellum)";            // mirrors --vellum
const FIELD_BORDER = "var(--hairline)";      // mirrors --hairline
// Raw hex retained only inside the CSS `<style>` autofill block where
// `-webkit-text-fill-color` and `-webkit-box-shadow` don't reliably resolve
// var() values across browsers. Mirrors --vellum / --ink.
const FIELD_BG_RAW = "#1a1917";              /* mirrors --vellum (dark) */
const INK_RAW = "#ededed";                   /* mirrors --ink (dark) */

const SENIORITY: string[] = [...SENIORITY_LEVELS];
const SECTOR: string[] = [...SECTORS];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  <svg width={size} height={size * 0.55} viewBox="0 0 60 33" fill="none" aria-hidden="true">
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
  const [validationMessage, setValidationMessage] = useState("");

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
      if (error) {
        // FunctionsHttpError exposes the EF response body via error.context;
        // FunctionsFetchError (true network failure) does not.
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          let efMsg = "";
          try { efMsg = (await ctx.json())?.error ?? ""; } catch { /* ignore parse error */ }
          setValidationMessage(
            typeof efMsg === "string" && efMsg.trim()
              ? efMsg
              : "Please check the highlighted fields and try again.",
          );
          setStatus("validation");
          return;
        }
        throw error;
      }
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

  // SVG data URI requires literal hex; mirrors --ink-muted.
  const selectArrow =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")";

  return (
    <div style={{ minHeight: "100vh", background: LEFT_BG, color: "var(--ink)", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{RA_CSS}</style>

      <main className="ra-grid" style={{ flex: 1 }}>
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
              fontWeight: 400, fontSize: 28, color: "var(--ink)",
              margin: "0 0 16px", lineHeight: 1.25,
            }}>
              Your expertise deserves an audience.
            </h1>
            <p className="ra-anim ra-d3" style={{
              fontSize: 15, color: "var(--ink-2)", lineHeight: 1.65,
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
                <li key={line} style={{ fontSize: 13, color: "var(--ink-muted)", display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span aria-hidden="true" style={{ color: BRONZE, lineHeight: 1.5 }}>✦</span>
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
              حتى السوق يعرفك قبل ما يشوفك <span aria-hidden="true">✦</span>
            </p>
            <Link
              to="/"
              style={{
                fontSize: 12, color: "var(--ink-5)", textDecoration: "none",
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
                    fontSize: 13, color: "var(--ink-muted)", textDecoration: "none",
                    marginBottom: 20, transition: "color 0.2s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = BRONZE)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-muted)")}
                >
                  ← Back to Aura
                </Link>
                <h2 style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontWeight: 400, fontSize: 24, color: "var(--ink)",
                  margin: "0 0 8px",
                }}>
                  Tell us about you.
                </h2>
                <p style={{ fontSize: 14, color: "var(--ink-2)", margin: "0 0 28px", lineHeight: 1.6 }}>
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
                      background: "var(--error-pale)",
                      border: "1px solid color-mix(in srgb, var(--error) 40%, transparent)",
                      color: "var(--error)", fontSize: 14,
                    }}>
                      Didn't connect. Try once more.
                    </div>
                  )}

                  {status === "validation" && (
                    <div style={{
                      padding: 12, borderRadius: 8,
                      background: "var(--error-pale)",
                      border: "1px solid color-mix(in srgb, var(--error) 40%, transparent)",
                      color: "var(--error)", fontSize: 14,
                    }}>
                      {validationMessage || "Please check the highlighted fields and try again."}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="ra-cta"
                    style={{
                      background: BRONZE, color: "var(--ink-on-brand)",
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

                <p style={{ fontSize: 11, color: "var(--ink-muted)", textAlign: "center", marginTop: 12 }}>
                  Your data is protected under Saudi PDPL. See our{" "}
                  <Link to="/privacy" style={{ color: BRONZE_TEXT, textDecoration: "none" }}>
                    Privacy Policy
                  </Link>
                  .
                </p>

                <div style={{ textAlign: "center", marginTop: 24 }}>
                  <span style={{ fontSize: 14, color: "var(--ink-muted)" }}>
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
                companion="Want to check your status? Email me at support@aura-intel.org"
                ctaHref="/"
                ctaLabel="Go back to explore Aura →"
              />
            )}
          </div>
        </section>
      </main>
      <PublicFooter forceDark />
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
        <option value="" style={{ background: FIELD_BG, color: "var(--ink-muted)" }}>{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} style={{ background: FIELD_BG, color: "var(--ink)" }}>{o}</option>
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
      <div aria-hidden="true" className="ra-star" style={{ fontSize: 32, color: BRONZE, lineHeight: 1 }}>✦</div>
      <h2 className="ra-anim-in ra-in-1" style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 400, fontSize: 24, color: "var(--ink)",
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
        fontSize: 15, color: "var(--ink-2)", lineHeight: 1.7,
        maxWidth: 380, margin: "0 auto",
      }}>
        {subline}
      </p>
      {companion && (
        <p className="ra-anim-in ra-in-3" style={{
          fontSize: 13, color: "var(--ink-muted)", lineHeight: 1.7,
          maxWidth: 380, margin: "20px auto 0", fontStyle: "italic",
        }}>
          {companion}
        </p>
      )}
      <p className="ra-anim-in ra-in-3" style={{
        fontSize: 12, color: "var(--ink-5)", lineHeight: 1.6,
        maxWidth: 380, margin: "12px auto 0",
      }}>
        Check your inbox (and spam folder) for a confirmation from Aura.
      </p>
      {withSignature && (
        <div className="ra-anim-in ra-in-4" style={{ marginTop: 36 }}>
          <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>Mohammad Mahafdhah</div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>Aura builder</div>
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
  display: "block", fontSize: 13, color: "var(--ink-2)", fontWeight: 500, marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: FIELD_BG,
  border: `1px solid ${FIELD_BORDER}`,
  color: "var(--ink)",
  fontSize: 15,
  padding: "14px 16px",
  borderRadius: 8,
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 300ms ease, box-shadow 300ms ease",
};

const errorStyle: React.CSSProperties = {
  marginTop: 6, fontSize: 12, color: "var(--error)",
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

  .ra-field::placeholder { color: var(--ink-muted); }
  .ra-field:focus {
    border-color: ${BRONZE} !important;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--bronze) 15%, transparent) !important;
  }

  /* Kill the yellow autofill background that browsers force on inputs/selects */
  /* Raw hex required: -webkit-box-shadow / -webkit-text-fill-color do not
     resolve var() reliably across all browsers in autofill state. */
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus,
  select:-webkit-autofill {
    -webkit-box-shadow: 0 0 0px 1000px ${FIELD_BG_RAW} inset !important; /* mirrors --vellum */
    -webkit-text-fill-color: ${INK_RAW} !important;                       /* mirrors --ink */
    caret-color: ${INK_RAW} !important;                                   /* mirrors --ink */
    transition: background-color 5000s ease-in-out 0s;
  }

  .ra-cta:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--bronze) 20%, transparent);
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