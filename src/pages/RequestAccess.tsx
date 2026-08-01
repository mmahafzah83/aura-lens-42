import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import usePageMeta from "@/hooks/usePageMeta";
import { SECTORS } from "@/constants/sectors";
import { SENIORITY_LEVELS } from "@/constants/seniority";
import AuraLogo from "@/components/brand/AuraLogo";

/* ────────────────────────────────────────────────────────────────
   /request-access — "The Door".
   Same System-B language as the landing so the click never feels
   like it left the product. Every rule is scoped under .ra.

   The signature device is the seat rack: one tick per founding seat,
   the taken ones inked, and the next one — yours — breathing in blue.
   It renders ONLY when founding_seats() answers. No fallback count,
   ever: a fake scarcity number is worse than no number.
   ──────────────────────────────────────────────────────────────── */

type Status = "idle" | "loading" | "success" | "duplicate" | "error" | "validation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENIORITY: string[] = [...SENIORITY_LEVELS];
const SECTOR: string[] = [...SECTORS];

function usePositionCount(target: number, start: boolean, duration = 800) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current || !target) return;
    started.current = true;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setValue(target); return; }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, start, duration]);
  return value;
}

export default function RequestAccess() {
  usePageMeta({
    title: "Aura — Request a founder seat",
    description:
      "Invitation-only while the founding fifty are chosen. Thirty seconds to ask. Read personally, answered within 24 hours.",
    path: "/request-access",
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [seniority, setSeniority] = useState("");
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [submittedName, setSubmittedName] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [seats, setSeats] = useState<{ claimed: number; cap: number } | null>(null);
  const [errors, setErrors] = useState<{ name?: string; email?: string; seniority?: string; sector?: string }>({});
  const [validationMessage, setValidationMessage] = useState("");

  const isDone = status === "success" || status === "duplicate";

  /* ── founding seats — the only source is the RPC ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("founding_seats");
        if (cancelled || error || !data) return;
        const row: any = Array.isArray(data) ? (data as any)[0] : data;
        const claimed = Number(row?.claimed);
        const cap = Number(row?.cap);
        if (!Number.isFinite(claimed) || !Number.isFinite(cap) || cap <= 0) return;
        setSeats({ claimed, cap });
      } catch {
        /* silent — the rack simply doesn't render */
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
        // FunctionsFetchError (a true network failure) does not.
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
        // the seat you just took is counted immediately
        setSeats((s) => (s ? { ...s, claimed: Math.min(s.claimed + 1, s.cap) } : s));
      }
    } catch (err) {
      console.error("submit-waitlist failed:", err);
      setStatus("error");
    }
  };

  return (
    <div className="ra">
      <style>{RA_CSS}</style>

      <header className="ra-mast">
        <Link className="ra-brand" to="/">
          <AuraLogo size={24} variant="auto" />
          <span className="ra-bn">Aura</span>
        </Link>
        <div className="ra-mr">
          <Link className="ra-mlink" to="/">← Back to Aura</Link>
          <Link className="ra-mlink" to="/auth">Sign in</Link>
        </div>
      </header>

      <main className="ra-main">
        {/* ── LEFT · the door ── */}
        <div>
          <div className="ra-eyebrow"><span>The door</span></div>
          <h1 className="ra-h1">
            One seat.<br /><em>Then the assessment.</em>
          </h1>
          <p className="ra-lede">
            Aura is invitation-only while the founding fifty are being chosen. Tell me who you
            are — it takes thirty seconds, and I read every one myself.
          </p>

          {seats && (
            <div className="ra-rack">
              <div className="ra-rackhead">
                <span className="ra-n">
                  <b>{seats.claimed}</b> of <b>{seats.cap}</b> founding seats taken
                </span>
                <span className="ra-lb">Founding circle</span>
              </div>
              <div className="ra-ticks" aria-hidden="true">
                {Array.from({ length: seats.cap }).map((_, i) => (
                  <i
                    key={i}
                    className={
                      i < seats.claimed ? "taken" : !isDone && i === seats.claimed ? "yours" : ""
                    }
                  />
                ))}
              </div>
              <p className={`ra-rackfoot${isDone ? " counted" : ""}`}>
                <span className="ra-sq" />
                {isDone ? "Yours is counted" : "The next one is yours"}
              </p>
            </div>
          )}

          <div className="ra-ledger">
            <div className="ra-lrow">
              <span className="ra-k">You send this</span>
              <span className="ra-lead" />
              <span className={`ra-v${isDone ? " cy" : ""}`}>{isDone ? "Done" : "Thirty seconds"}</span>
            </div>
            <div className="ra-lrow">
              <span className="ra-k">I read it</span>
              <span className="ra-lead" />
              <span className="ra-v act">Within 24 hours</span>
            </div>
            <div className="ra-lrow">
              <span className="ra-k">Your seat opens</span>
              <span className="ra-lead" />
              <span className="ra-v">The assessment first</span>
            </div>
            <div className="ra-lrow">
              <span className="ra-k">Aura starts reading</span>
              <span className="ra-lead" />
              <span className={`ra-v${isDone ? "" : " cy"}`}>That same night</span>
            </div>
          </div>

          <p className="ra-ar" dir="rtl">
            حتى السوق يعرفك قبل ما يشوفك <span aria-hidden="true">✦</span>
          </p>
        </div>

        {/* ── RIGHT · the sheet ── */}
        <div className={`ra-sheet${isDone ? " ra-done" : ""}`}>
          {!isDone && (
            <>
              <h2 className="ra-h2">Tell me who you are.</h2>
              <p className="ra-sub">Four fields. Nothing you'd have to think about.</p>

              <form onSubmit={handleSubmit} noValidate className="ra-form">
                <Field
                  id="ra-name" label="Your name" placeholder="Your full name"
                  value={name} maxLength={200} error={errors.name}
                  onChange={(v) => { setName(v); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
                />
                <Field
                  id="ra-email" label="Your work email" type="email" placeholder="you@company.com"
                  value={email} maxLength={255} error={errors.email}
                  onChange={(v) => { setEmail(v); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
                />
                <Select
                  id="ra-seniority" label="Your level" placeholder="Select your level"
                  value={seniority} options={SENIORITY} error={errors.seniority}
                  onChange={(v) => { setSeniority(v); if (errors.seniority) setErrors((p) => ({ ...p, seniority: undefined })); }}
                />
                <Select
                  id="ra-sector" label="Your sector" placeholder="Select your sector"
                  value={sector} options={SECTOR} error={errors.sector}
                  onChange={(v) => { setSector(v); if (errors.sector) setErrors((p) => ({ ...p, sector: undefined })); }}
                />

                {status === "error" && (
                  <div className="ra-alert">Didn't connect. Try once more.</div>
                )}
                {status === "validation" && (
                  <div className="ra-alert">
                    {validationMessage || "Please check the highlighted fields and try again."}
                  </div>
                )}

                <button type="submit" disabled={status === "loading"} className="ra-btn">
                  {status === "loading" ? (
                    <span className="ra-pulse">Sending…</span>
                  ) : (
                    <>Request my founder seat <span className="ra-a">↗</span></>
                  )}
                </button>
              </form>

              <p className="ra-legal">
                Your data is protected under Saudi PDPL. See our{" "}
                <Link to="/privacy">Privacy Policy</Link>.
              </p>
              <p className="ra-signin">
                Already have a seat? <Link to="/auth">Sign in →</Link>
              </p>
            </>
          )}

          {status === "success" && (
            <Ceremony
              position={position}
              title={`It's with me, ${submittedName}.`}
              body="I read every application myself. If Aura is right for you, you'll hear from me within twenty-four hours — from a person, not a system."
              quiet="In the meantime, keep reading what matters in your sector. That's the raw material Aura turns into presence."
              withSignature
            />
          )}

          {status === "duplicate" && (
            <Ceremony
              position={null}
              title="You already asked."
              body="Your request is with me. If I haven't come back to you yet, I will."
              quiet="Need to check where it stands? Write to support@aura-intel.org and I'll answer."
            />
          )}
        </div>
      </main>

      <footer className="ra-foot">
        <span>© 2026 Aura</span>
        <span>aura-intel.org</span>
        <span>
          <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> ·{" "}
          <a href="mailto:support@aura-intel.org">Contact</a>
        </span>
      </footer>
    </div>
  );
}

/* ── pieces ── */

function Field({
  id, label, value, onChange, error, placeholder, type = "text", maxLength,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; type?: string; maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id} type={type} value={value} placeholder={placeholder} maxLength={maxLength}
        className="ra-field" aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="ra-err">{error}</p>}
    </div>
  );
}

function Select({
  id, label, value, options, placeholder, onChange, error,
}: {
  id: string; label: string; value: string; options: string[];
  placeholder: string; onChange: (v: string) => void; error?: string;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select
        id={id} value={value} className="ra-field ra-select" aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error && <p className="ra-err">{error}</p>}
    </div>
  );
}

function Ceremony({
  title, body, quiet, withSignature, position,
}: {
  title: string; body: string; quiet?: string;
  withSignature?: boolean; position: number | null;
}) {
  const counted = usePositionCount(position ?? 0, position != null);
  return (
    <div className="ra-ceremony">
      <div className="ra-mk"><AuraLogo size={44} variant="auto" /></div>
      {position != null && position > 0 && (
        <span className="ra-pos"><i className="ra-d" />Number {counted} on the list</span>
      )}
      <h2 className="ra-h2">{title}</h2>
      <p className="ra-cbody">{body}</p>
      {quiet && <p className="ra-quiet">{quiet}</p>}
      <p className="ra-inbox">Check your inbox — and your spam folder — for a note from Aura.</p>
      {withSignature && (
        <div className="ra-sig">
          <div className="ra-nm">Mohammad Mahafdhah</div>
          <div className="ra-rl">Aura builder</div>
        </div>
      )}
    </div>
  );
}

/* ── styles · every selector scoped under .ra ── */

const RA_CSS = `
.ra{
  --page:#F2F5F9; --n0:#FFFFFF; --n100:#EEF2F7; --n200:#E2E7EE; --n300:#D6DCE4;
  --n400:#98A2AE; --n500:#5B6673; --n700:#3A434E; --n900:#0F1519;
  --act:#0670C4; --act-50:#E6F2FD; --cy:#00CEC9; --cy-t:#00807B;
  --err:#C0392B; --err-50:#FCEAE6;
  --ui:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --ser:'Instrument Serif',Georgia,serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  --ar:'Cairo','CairoAR',sans-serif;
  --gut:clamp(20px,4.5vw,56px);
  min-height:100vh; display:flex; flex-direction:column;
  background:var(--page); color:var(--n900);
  font-family:var(--ui); font-size:16px; line-height:1.6;
  -webkit-font-smoothing:antialiased;
}
.ra *,.ra *::before,.ra *::after{box-sizing:border-box;}
.ra p,.ra h1,.ra h2,.ra ul,.ra li{margin:0;padding:0;list-style:none;}
.ra a{color:inherit;text-decoration:none;}
.ra :focus-visible{outline:2px solid var(--act);outline-offset:3px;border-radius:6px;}

.ra-h1{font-family:var(--ser);font-weight:400;font-size:clamp(34px,4.4vw,52px);line-height:1;letter-spacing:-.028em;}
.ra-h1 em{font-style:italic;color:var(--n400);}
.ra-h2{font-family:var(--ser);font-weight:400;font-size:clamp(24px,2.8vw,32px);line-height:1.08;letter-spacing:-.02em;margin-bottom:8px;}
.ra-lede{font-size:16.5px;line-height:1.6;color:var(--n700);max-width:44ch;margin-top:22px;}

.ra-mast{display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:18px var(--gut);border-bottom:1px solid var(--n200);}
.ra-brand{display:flex;align-items:center;gap:9px;}
.ra-bn{font-family:var(--ser);font-size:21px;line-height:1;}
.ra-mr{display:flex;align-items:center;gap:6px;}
.ra-mlink{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--n500);padding:11px 13px;border-radius:999px;transition:color .2s ease,background .2s ease;
  display:inline-flex;align-items:center;min-height:44px;}
.ra-mlink:hover{color:var(--n900);background:var(--n100);}

.ra-main{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,5vw,72px);
  padding:clamp(36px,6vw,76px) var(--gut) clamp(48px,7vw,88px);
  max-width:1240px;margin:0 auto;width:100%;align-items:start;}
.ra-eyebrow{position:relative;display:inline-block;padding:9px 14px;margin-bottom:24px;}
.ra-eyebrow span{font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--n700);}
.ra-eyebrow::before,.ra-eyebrow::after{content:'';position:absolute;width:13px;height:13px;border:1.5px solid var(--n300);}
.ra-eyebrow::before{left:0;bottom:0;border-top:0;border-right:0;}
.ra-eyebrow::after{right:0;top:0;border-bottom:0;border-left:0;}

.ra-rack{margin-top:clamp(30px,4vw,44px);}
.ra-rackhead{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:12px;}
.ra-n{font-family:var(--mono);font-size:12px;letter-spacing:.12em;color:var(--n900);}
.ra-n b{font-weight:500;}
.ra-lb{font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--n400);}
.ra-ticks{display:flex;gap:3px;align-items:flex-end;height:26px;}
.ra-ticks i{flex:1;border-radius:2px;background:var(--n300);height:12px;
  transition:height .5s cubic-bezier(.2,.7,.3,1),background .4s ease;}
.ra-ticks i.taken{background:var(--n900);height:20px;}
.ra-ticks i.yours{background:var(--act);height:26px;box-shadow:0 0 0 3px var(--act-50);
  animation:ra-breathe 2.2s ease-in-out infinite;}
@keyframes ra-breathe{0%,100%{opacity:1;}50%{opacity:.45;}}
.ra-rackfoot{margin-top:12px;font-family:var(--mono);font-size:10px;letter-spacing:.13em;
  text-transform:uppercase;color:var(--act);display:flex;align-items:center;gap:8px;}
.ra-sq{width:8px;height:12px;border-radius:2px;background:var(--act);flex:0 0 8px;}
.ra-rackfoot.counted{color:var(--cy-t);}
.ra-rackfoot.counted .ra-sq{background:var(--cy);}

.ra-ledger{margin-top:clamp(30px,4vw,44px);border-top:2px solid var(--n900);}
.ra-lrow{display:flex;align-items:baseline;gap:12px;padding:15px 0;border-bottom:1px solid var(--n200);}
.ra-lrow:last-child{border-bottom:0;}
.ra-k{font-family:var(--ser);font-size:20px;line-height:1.15;letter-spacing:-.015em;white-space:nowrap;}
.ra-lead{flex:1;height:1px;align-self:flex-end;margin-bottom:6px;min-width:16px;
  background-image:radial-gradient(circle,var(--n300) .9px,transparent .9px);
  background-size:6px 1px;background-repeat:repeat-x;}
.ra-v{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--n500);text-align:right;white-space:nowrap;}
.ra-v.cy{color:var(--cy-t);}
.ra-v.act{color:var(--act);}
.ra-ar{font-family:var(--ar);direction:rtl;line-height:1.9;margin-top:30px;font-size:19px;color:var(--cy-t);}

.ra-sheet{background:var(--n0);border:1px solid var(--n200);border-radius:24px;
  padding:clamp(24px,3vw,36px);box-shadow:0 30px 64px -40px rgba(15,21,25,.28);}
.ra-sub{font-size:14.5px;color:var(--n500);margin-bottom:26px;}
.ra-form{display:flex;flex-direction:column;gap:18px;}
.ra label{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--n500);margin-bottom:7px;}
.ra-field{width:100%;background:var(--page);border:1px solid var(--n200);color:var(--n900);
  font-size:15.5px;font-family:inherit;padding:14px 16px;border-radius:12px;outline:none;
  transition:border-color .25s ease,box-shadow .25s ease,background .25s ease;}
.ra-field::placeholder{color:var(--n400);}
.ra-field:focus{border-color:var(--act);background:var(--n0);box-shadow:0 0 0 4px var(--act-50);}
.ra-field[aria-invalid="true"]{border-color:var(--err);}
.ra-select{appearance:none;-webkit-appearance:none;-moz-appearance:none;padding-right:38px;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%2398A2AE' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat:no-repeat;background-position:right 15px center;}
.ra-err{margin-top:7px;font-size:12.5px;color:var(--err);}
.ra-alert{padding:13px 15px;border-radius:12px;background:var(--err-50);
  border:1px solid color-mix(in srgb,var(--err) 34%,transparent);color:var(--err);font-size:14px;}
.ra-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:54px;width:100%;
  border-radius:999px;font-size:16px;font-weight:600;font-family:inherit;border:1px solid transparent;
  background:var(--n900);color:#fff;margin-top:6px;cursor:pointer;
  transition:transform .2s ease,box-shadow .25s ease,opacity .2s ease;}
.ra-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 16px 34px -16px rgba(15,21,25,.7);}
.ra-btn:disabled{cursor:default;opacity:.85;}
.ra-a{width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.15);
  display:grid;place-items:center;font-size:11px;transition:transform .22s cubic-bezier(.2,.7,.3,1);}
.ra-btn:hover:not(:disabled) .ra-a{transform:translate(2px,-2px);}
.ra-pulse{animation:ra-pulse 1.4s ease-in-out infinite;}
@keyframes ra-pulse{0%,100%{opacity:1;}50%{opacity:.55;}}
.ra-legal{font-size:11.5px;color:var(--n400);text-align:center;margin-top:14px;line-height:1.6;}
.ra-legal a{color:var(--act);}
.ra-signin{text-align:center;margin-top:22px;padding-top:20px;border-top:1px solid var(--n200);
  font-size:14.5px;color:var(--n500);}
.ra-signin a{color:var(--act);font-weight:600;}

.ra-ceremony{text-align:center;padding:8px 0;}
.ra-mk{display:flex;justify-content:center;margin-bottom:22px;}
.ra-pos{display:inline-flex;align-items:center;gap:9px;border:1px solid rgba(0,128,123,.3);
  background:rgba(0,206,201,.07);border-radius:999px;padding:8px 15px;font-family:var(--mono);
  font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--cy-t);margin-bottom:18px;}
.ra-d{width:7px;height:7px;border-radius:50%;background:var(--cy);}
.ra-cbody{font-size:15px;color:var(--n700);line-height:1.7;max-width:42ch;margin:0 auto;}
.ra-quiet{font-size:13.5px;color:var(--n500);line-height:1.7;max-width:42ch;
  margin:18px auto 0;font-style:italic;}
.ra-inbox{font-size:13px;color:var(--n400);line-height:1.6;max-width:42ch;margin:16px auto 0;}
.ra-sig{margin-top:32px;padding-top:22px;border-top:1px solid var(--n200);}
.ra-nm{font-family:var(--ser);font-size:22px;}
.ra-rl{font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--n500);margin-top:5px;}

.ra-foot{border-top:1px solid var(--n200);padding:22px var(--gut);display:flex;flex-wrap:wrap;
  gap:10px 22px;justify-content:space-between;font-family:var(--mono);font-size:9.5px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--n400);}
.ra-foot a:hover{color:var(--n700);}

.ra input:-webkit-autofill,
.ra input:-webkit-autofill:hover,
.ra input:-webkit-autofill:focus,
.ra select:-webkit-autofill{
  -webkit-box-shadow:0 0 0 1000px #F2F5F9 inset !important;
  -webkit-text-fill-color:#0F1519 !important;
  caret-color:#0F1519 !important;
  transition:background-color 5000s ease-in-out 0s;
}

@media (max-width:900px){
  .ra-main{grid-template-columns:1fr;gap:34px;}
  .ra-ticks{height:22px;}
  .ra-mlink{padding:11px 10px;}
}
@media (prefers-reduced-motion:reduce){
  .ra *,.ra *::before,.ra *::after{animation:none !important;transition:none !important;}
}
`;
